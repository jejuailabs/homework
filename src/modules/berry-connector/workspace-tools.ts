import 'server-only';
import {Timestamp} from 'firebase-admin/firestore';
import {db} from '@/lib/server/admin';
import {entryInput} from '@/modules/teacher-notebook/policy';
import {createChatEntry, notebookAvailableFor} from '@/modules/teacher-notebook/server';
import {NOTEBOOK_TAGS, NOTEBOOK_TAG_LABELS, type NotebookTag} from '@/modules/teacher-notebook/types';
import {openEnvelope, sealEnvelope, vaultKey} from '@/modules/teacher-notebook/vault';
import {calendarInput, isoDate, itemInput, lessonEntryInput, seoulDate, weekKeyOf, type CalendarInput, type ItemInput, type LessonEntryInput} from '@/modules/teacher-workspace/policy';
import {appendLessonEntry, assertOwnClass, createCalendarEvent, createWorkItem, getItem, getTimetable, listCalendar, listFolders, listItems, listLessons, workspaceDisabled} from '@/modules/teacher-workspace/server';
import {CALENDAR_KINDS, CALENDAR_KIND_LABELS, FOLDER_KINDS, FOLDER_KIND_LABELS, ITEM_TYPE_LABELS, type FolderKind} from '@/modules/teacher-workspace/types';
import {BerryError, CONFIRM_SECONDS, WRITE_TOOL_SCOPES, alias, boundedInt, confirmationProblem, hashToken, maskNames, payloadHash, randomToken, safeId, studentLabel} from './policy';
import {WRITE_SCOPES, type BearerContext, type McpTool} from './types';

type Data = Record<string, any>;
type Student = {classId: string; id: string; number: number; name: string};
const date = {type: 'string', description: 'YYYY-MM-DD (Asia/Seoul)'};
const reveal = {type: 'boolean', description: '실명 반환. names 권한이 있어야 동작합니다.'};
const WRITE_NOTE = '저장하지 않고 미리보기와 confirm_token을 돌려줍니다. 선생님이 내용을 확인한 뒤 confirm_write로 저장하세요. 저장된 항목은 선생님이 화면에서 확정할 때까지 "베리 제안"으로 표시됩니다.';

/** Workspace reads, the four two-step writes and confirm_write. */
export const WORKSPACE_TOOLS: McpTool[] = [
  {name: 'get_calendar', scope: 'workspace:read', description: '기간(최대 92일)의 일정과 숙제 마감을 시작 순으로 돌려줍니다. 숙제 마감은 homework:read 권한이 있을 때만 포함됩니다.', inputSchema: {type: 'object', properties: {from: date, to: date, reveal_names: reveal}, required: ['from', 'to'], additionalProperties: false}},
  {name: 'get_timetable', scope: 'workspace:read', description: '주간 시간표(월~금, 1~7교시)를 돌려줍니다. 그 주에 저장된 표가 없으면 가장 최근 주의 표를 돌려주고 inherited_from에 표시합니다.', inputSchema: {type: 'object', properties: {week_key: {type: 'string', description: 'ISO 주차, 예: 2026-W45. 없으면 이번 주'}}, additionalProperties: false}},
  {name: 'get_lesson_log', scope: 'workspace:read', description: '기간(최대 92일)의 수업 일지를 날짜별로 돌려줍니다.', inputSchema: {type: 'object', properties: {from: date, to: date, reveal_names: reveal}, required: ['from', 'to'], additionalProperties: false}},
  {name: 'search_workspace', scope: 'workspace:read', description: '업무 폴더 항목을 제목·태그·폴더 종류·기한으로 찾습니다. 본문은 돌려주지 않으며 get_work_item으로 따로 읽습니다. 민감 항목은 제외됩니다.', inputSchema: {type: 'object', properties: {query: {type: 'string', maxLength: 100}, folder_kind: {type: 'string', enum: [...FOLDER_KINDS]}, due_before: date, limit: {type: 'integer', minimum: 1, maximum: 100}}, additionalProperties: false}},
  {name: 'get_work_item', scope: 'workspace:read', description: '업무 폴더 항목 하나의 본문·체크리스트·링크를 돌려줍니다. 민감 항목은 읽을 수 없습니다.', inputSchema: {type: 'object', properties: {item_id: {type: 'string'}, reveal_names: reveal}, required: ['item_id'], additionalProperties: false}},
  {name: 'add_calendar_event', scope: 'calendar:write', description: `일정을 추가합니다. ${WRITE_NOTE}`, inputSchema: {type: 'object', properties: {title: {type: 'string', maxLength: 120}, start: {type: 'string', description: 'YYYY-MM-DD(하루 종일) 또는 YYYY-MM-DD HH:mm (Asia/Seoul)'}, end: {type: 'string', description: '하루 종일이면 마지막 날짜, 아니면 끝 시각'}, all_day: {type: 'boolean'}, kind: {type: 'string', enum: [...CALENDAR_KINDS]}, class_id: {type: 'string'}}, required: ['title', 'start'], additionalProperties: false}},
  {name: 'add_lesson_log', scope: 'workspace:write', description: `수업 일지에 한 줄을 추가합니다. ${WRITE_NOTE}`, inputSchema: {type: 'object', properties: {date, subject: {type: 'string', maxLength: 40}, note: {type: 'string', maxLength: 500}, period: {type: 'integer', minimum: 1, maximum: 10}, unit: {type: 'string', maxLength: 80}}, required: ['date', 'subject'], additionalProperties: false}},
  {name: 'add_work_item', scope: 'workspace:write', description: `업무 폴더에 메모·체크리스트·링크를 추가합니다. folder_id는 search_workspace 결과나 선생님 안내에서 가져옵니다. ${WRITE_NOTE}`, inputSchema: {type: 'object', properties: {folder_id: {type: 'string'}, title: {type: 'string', maxLength: 120}, type: {type: 'string', enum: ['note', 'checklist', 'link']}, body: {type: 'string', maxLength: 8000}, url: {type: 'string'}, checklist: {type: 'array', items: {type: 'string', maxLength: 200}, maxItems: 50}, due_at: date, tags: {type: 'array', items: {type: 'string', maxLength: 20}, maxItems: 10}}, required: ['folder_id', 'title'], additionalProperties: false}},
  {name: 'add_notebook_entry', scope: 'notebook:write', description: `교무수첩에 관찰 기록을 추가합니다. 학생은 학급(class_id)과 번호(student_numbers)로 지정합니다. 상담·건강·가정 분류는 민감 기록으로 저장되고 응답에 본문을 돌려주지 않습니다. ${WRITE_NOTE}`, inputSchema: {type: 'object', properties: {date, body: {type: 'string', maxLength: 4000}, class_id: {type: 'string'}, student_numbers: {type: 'array', items: {type: 'integer', minimum: 1, maximum: 999}, maxItems: 40}, tags: {type: 'array', items: {type: 'string', enum: [...NOTEBOOK_TAGS]}}}, required: ['date', 'body'], additionalProperties: false}},
  {name: 'confirm_write', scope: WRITE_SCOPES, description: '미리보기에서 받은 confirm_token으로 실제 저장합니다. 토큰은 10분 동안 한 번만 쓸 수 있고, 같은 연결·같은 내용에만 유효합니다. 선생님이 미리보기를 확인한 뒤에만 호출하세요.', inputSchema: {type: 'object', properties: {confirm_token: {type: 'string'}, payload_hash: {type: 'string', description: '미리보기 응답의 payload_hash (선택)'}}, required: ['confirm_token'], additionalProperties: false}},
];

const confirmations = () => db().collection('berryConfirmations');
const CONFIRM_LABEL = 'berry-confirmation';
function assertWorkspace() {if (workspaceDisabled()) throw new BerryError('업무 공간이 잠시 멈춰 있어요.', 503, 'temporarily_unavailable');}
async function teacherStudents(uid: string): Promise<Student[]> {
  const classes = (await db().collection('classes').where('ownerUid', '==', uid).select('adminStatus').get()).docs.filter(doc => doc.data().adminStatus !== 'archived');
  const lists = await Promise.all(classes.map(cls => cls.ref.collection('students').select('number', 'name', 'disabled').get()));
  return lists.flatMap((snap, index) => snap.docs.filter(doc => !doc.data().disabled).map(doc => ({classId: classes[index].id, id: doc.id, number: Number(doc.data().number) || 0, name: String(doc.data().name ?? '')})));
}
/** Free text leaves with names swapped for aliases unless the grant has `names` and the call asks for them. */
async function masker(ctx: BearerContext, args: Data) {
  if (args.reveal_names === true && ctx.scopes.includes('names')) return (text: string) => text;
  const students = await teacherStudents(ctx.uid);
  return (text: string) => maskNames(text, students);
}
function mcpRange(from: unknown, to: unknown) {
  const start = isoDate(from, 'from'), end = isoDate(to, 'to');
  if (end < start || Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`) > 92 * 86_400_000) throw new BerryError('기간은 92일 이내로 골라 주세요.');
  return {from: start, to: end};
}

// ---- Two-step writes ----
type Pending = {tool: 'add_calendar_event'; payload: {event: CalendarInput}} | {tool: 'add_lesson_log'; payload: {date: string; entry: LessonEntryInput}}
  | {tool: 'add_work_item'; payload: {item: ItemInput}} | {tool: 'add_notebook_entry'; payload: {entry: ReturnType<typeof entryInput>}};

/** Validates and checks ownership exactly as the save will, so a preview never promises what confirm cannot do. */
async function prepare(name: string, args: Data, ctx: BearerContext): Promise<Pending> {
  if (name === 'add_calendar_event') {
    assertWorkspace();
    const event = calendarInput({title: args.title, start: args.start, end: args.end, allDay: args.all_day, kind: args.kind, classId: args.class_id});
    await assertOwnClass(ctx.uid, event.classId);
    return {tool: name, payload: {event}};
  }
  if (name === 'add_lesson_log') {
    assertWorkspace();
    return {tool: name, payload: {date: isoDate(args.date, 'date'), entry: lessonEntryInput({subject: args.subject, note: args.note ?? '', period: args.period, unit: args.unit})}};
  }
  if (name === 'add_work_item') {
    assertWorkspace();
    if (args.type !== undefined && !['note', 'checklist', 'link'].includes(args.type)) throw new BerryError('type은 note·checklist·link 중 하나예요.');
    const checklist = Array.isArray(args.checklist) ? args.checklist.map((text: unknown) => ({text, done: false})) : undefined;
    const item = itemInput({folderId: args.folder_id, type: args.type, title: args.title, body: args.body, url: args.url, checklist, dueAt: args.due_at, tags: args.tags});
    if (!(await db().doc(`teacherWorkspaces/${ctx.uid}/folders/${item.folderId}`).get()).exists) throw new BerryError('이 폴더를 찾을 수 없어요.', 404, 'not_found');
    return {tool: name, payload: {item}};
  }
  if (name === 'add_notebook_entry') {
    if (!(await notebookAvailableFor(ctx.uid, ctx.role))) throw new BerryError('교무수첩을 아직 사용할 수 없어요.', 403, 'access_denied');
    const numbers = Array.isArray(args.student_numbers) ? [...new Set(args.student_numbers as unknown[])] : [];
    let students: {classId: string; studentId: string}[] = [];
    if (numbers.length) {
      const classId = safeId(args.class_id, '학급');
      await assertOwnClass(ctx.uid, classId);
      const roster = (await teacherStudents(ctx.uid)).filter(student => student.classId === classId);
      students = numbers.map(number => {
        const found = roster.filter(student => student.number === number);
        if (found.length !== 1) throw new BerryError(`${typeof number === 'number' ? alias(number) : '학생'}을(를) 명단에서 찾지 못했어요.`, 404, 'not_found');
        return {classId, studentId: found[0].id};
      });
    }
    return {tool: name, payload: {entry: entryInput({date: args.date, body: args.body, students, tags: args.tags})}};
  }
  throw new BerryError(`알 수 없는 도구예요: ${name}`, 404, 'not_found');
}
async function previewView(pending: Pending, ctx: BearerContext) {
  const mask = await masker(ctx, {});
  switch (pending.tool) {
    case 'add_calendar_event': {const e = pending.payload.event; return {title: mask(e.title), kind: CALENDAR_KIND_LABELS[e.kind], all_day: e.allDay, start: e.start, end: e.end, start_date: seoulDate(e.start), class_id: e.classId};}
    case 'add_lesson_log': {const {date: day, entry} = pending.payload; return {date: day, period: entry.period ?? null, subject: entry.subject, unit: entry.unit ?? null, note: mask(entry.note)};}
    case 'add_work_item': {const i = pending.payload.item; return {folder_id: i.folderId, type: ITEM_TYPE_LABELS[i.type], title: mask(i.title), body: mask(i.body), url: i.url, checklist: i.checklist.map(row => row.text), due_at: i.dueAt, tags: i.tags};}
    case 'add_notebook_entry': {
      const e = pending.payload.entry, students = await teacherStudents(ctx.uid);
      const labels = e.students.map(ref => {const s = students.find(student => student.classId === ref.classId && student.id === ref.studentId); return s ? studentLabel(s, ctx.scopes, false) : '학생';});
      // Sensitive bodies are never echoed back, not even to the caller that wrote them.
      return {date: e.date, students: labels, tags: e.tags.map(tag => NOTEBOOK_TAG_LABELS[tag as NotebookTag]), sensitive: e.sensitive, body: e.sensitive ? null : mask(e.body), ...(e.sensitive ? {note: '민감 기록이라 본문을 돌려주지 않아요.'} : {})};
    }
  }
}
async function preview(name: string, args: Data, ctx: BearerContext) {
  const pending = await prepare(name, args, ctx);
  const token = randomToken(32), id = hashToken(token), hash = payloadHash(pending.tool, pending.payload);
  await confirmations().doc(id).create({uid: ctx.uid, grantId: ctx.grantId, clientId: ctx.clientId, tool: pending.tool, payload: sealEnvelope(vaultKey(CONFIRM_LABEL), [CONFIRM_LABEL, ctx.uid, id], JSON.stringify(pending.payload)), payloadHash: hash, createdAt: new Date().toISOString(), expiresAt: Timestamp.fromMillis(Date.now() + CONFIRM_SECONDS * 1000), usedAt: null});
  return {preview: await previewView(pending, ctx), confirm_token: token, payload_hash: hash, expires_in: CONFIRM_SECONDS, saved: false, note: '아직 저장되지 않았어요. 선생님이 확인하면 confirm_write를 호출하세요.'};
}
async function confirmWrite(args: Data, ctx: BearerContext) {
  if (typeof args.confirm_token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(args.confirm_token)) throw new BerryError('confirm_token을 확인해 주세요.');
  const id = hashToken(args.confirm_token), ref = confirmations().doc(id);
  const pending = await db().runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    const opened = data ? openEnvelope(vaultKey(CONFIRM_LABEL), [CONFIRM_LABEL, data.uid, id], data.payload) : null;
    const payload = opened ? JSON.parse(opened) : null;
    const record = data ? {uid: data.uid, grantId: data.grantId, clientId: data.clientId, tool: data.tool, payloadHash: data.payloadHash, expiresAtMs: (data.expiresAt as Timestamp).toMillis(), usedAt: data.usedAt ?? null} : null;
    const problem = confirmationProblem(record, ctx, Date.now(), payload ? payloadHash(data!.tool, payload) : null, args.payload_hash);
    if (problem) throw new BerryError(problem, 400, 'invalid_confirmation');
    // Spent before the write, inside the transaction: two parallel confirms cannot both save.
    tx.update(ref, {usedAt: new Date().toISOString()});
    return {tool: data!.tool, payload} as Pending;
  });
  return {saved: await save(pending, ctx), pending: true, note: '저장했어요. 선생님이 모두의 교실 화면에서 확정하면 "베리 제안" 표시가 사라져요.'};
}
/** Re-validates the stored payload and re-checks ownership at save time. */
async function save(pending: Pending, ctx: BearerContext) {
  switch (pending.tool) {
    case 'add_calendar_event': {assertWorkspace(); const event = await createCalendarEvent(ctx.uid, calendarInput(pending.payload.event as unknown as Data), 'chat'); return {collection: 'calendar', id: event.id};}
    case 'add_lesson_log': {assertWorkspace(); const result = await appendLessonEntry(ctx.uid, isoDate(pending.payload.date), lessonEntryInput(pending.payload.entry as unknown as Data), 'chat'); return {collection: 'lessons', id: result.date, entry_id: result.entryId};}
    case 'add_work_item': {assertWorkspace(); const item = await createWorkItem(ctx.uid, itemInput(pending.payload.item as unknown as Data), 'chat'); return {collection: 'items', id: item.id};}
    case 'add_notebook_entry': {
      if (!(await notebookAvailableFor(ctx.uid, ctx.role))) throw new BerryError('교무수첩을 아직 사용할 수 없어요.', 403, 'access_denied');
      return {collection: 'notebook', id: await createChatEntry(ctx.uid, entryInput(pending.payload.entry as unknown as Data))};
    }
  }
}

// ---- Reads ----
export async function callWorkspaceTool(name: string, args: Data, ctx: BearerContext) {
  if (name in WRITE_TOOL_SCOPES) return preview(name, args, ctx);
  if (name === 'confirm_write') return confirmWrite(args, ctx);
  assertWorkspace();
  switch (name) {
    case 'get_calendar': {
      const range = mcpRange(args.from, args.to), mask = await masker(ctx, args);
      const result = await listCalendar(ctx.uid, range.from, range.to, {deadlines: ctx.scopes.includes('homework:read'), maxDays: 92});
      return {...range, events: result.events.slice(0, 500).map(event => ({id: event.id, title: mask(event.title), kind: CALENDAR_KIND_LABELS[event.kind], all_day: event.allDay, start: event.start, end: event.end, start_date: event.startDate, end_date: event.endDate, class_id: event.classId, source: event.source, pending: event.pending, ...(event.assignmentId ? {assignment_id: event.assignmentId} : {})}))};
    }
    case 'get_timetable': {
      const week = args.week_key === undefined ? weekKeyOf(seoulDate(Date.now())) : args.week_key;
      const table = await getTimetable(ctx.uid, week);
      return {week_key: table.weekKey, inherited_from: table.inheritedFrom, slots: table.slots};
    }
    case 'get_lesson_log': {
      const range = mcpRange(args.from, args.to), mask = await masker(ctx, args), result = await listLessons(ctx.uid, range.from, range.to);
      return {...range, days: result.days.map(day => ({date: day.date, entries: day.entries.map(entry => ({period: entry.period ?? null, subject: entry.subject, unit: entry.unit ?? null, note: mask(entry.note), pending: entry.pending}))}))};
    }
    case 'search_workspace': {
      const folderKind = args.folder_kind === undefined ? null : args.folder_kind;
      if (folderKind !== null && !FOLDER_KINDS.includes(folderKind)) throw new BerryError('folder_kind를 확인해 주세요.');
      const dueBefore = args.due_before === undefined ? null : isoDate(args.due_before, 'due_before'), limit = boundedInt(args.limit, 30, 1, 100, 'limit');
      const [items, folders, mask] = await Promise.all([listItems(ctx.uid, {q: typeof args.query === 'string' ? args.query.slice(0, 100) : '', dueBefore, folderKind: folderKind as FolderKind | null, limit: 5000}), listFolders(ctx.uid), masker(ctx, {})]);
      const byId = new Map(folders.folders.map(folder => [folder.id, folder]));
      // Sensitive items never leave through this path, whatever the arguments say.
      const visible = items.filter(item => item.sensitivity !== 'sensitive');
      return {items: visible.slice(0, limit).map(item => ({id: item.id, folder: byId.get(item.folderId)?.name ?? null, folder_kind: byId.has(item.folderId) ? FOLDER_KIND_LABELS[byId.get(item.folderId)!.kind] : null, folder_id: item.folderId, type: ITEM_TYPE_LABELS[item.type], title: mask(item.title), tags: item.tags, due_at: item.dueAt, has_file: item.hasFile, pending: item.pending})), total: visible.length, folders: folders.folders.map(folder => ({id: folder.id, name: folder.name, kind: FOLDER_KIND_LABELS[folder.kind]}))};
    }
    case 'get_work_item': {
      const item = await getItem(ctx.uid, safeId(args.item_id, '항목')).catch((error: {status?: number}) => {if (error?.status === 404) return null; throw error;});
      if (!item || item.sensitivity === 'sensitive') throw new BerryError('이 항목을 찾을 수 없어요.', 404, 'not_found');
      const mask = await masker(ctx, args);
      return {id: item.id, folder_id: item.folderId, type: ITEM_TYPE_LABELS[item.type], title: mask(item.title), body: mask(item.body), url: item.url, checklist: item.checklist.map(row => ({text: mask(row.text), done: row.done})), due_at: item.dueAt, tags: item.tags, file_name: item.file?.fileName ?? null, pending: item.pending, updated_at: item.updatedAt};
    }
  }
  throw new BerryError(`알 수 없는 도구예요: ${name}`, 404, 'not_found');
}
