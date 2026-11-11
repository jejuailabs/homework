import 'server-only';
import {db} from '@/lib/server/admin';
import {openBody} from '@/modules/teacher-notebook/vault';
import {NotebookError} from '@/modules/teacher-notebook/policy';
import {NOTEBOOK_TAG_LABELS, type NotebookTag} from '@/modules/teacher-notebook/types';
import {BerryError, MAX_TOOL_RESULT_ITEMS, alias, boundedInt, isoDate, maskNames, safeId, studentLabel, toolAllowed} from './policy';
import {WORKSPACE_TOOLS, callWorkspaceTool} from './workspace-tools';
import {CLASSROOM_TOOLS, callClassroomTool, menuFlags} from './classroom-tools';
import {buildCatalog} from './catalog';
import {MANAGE_TOOLS} from './manage-tools';
import {ASSIGNMENT_KINDS, ASSIGNMENT_ORDERS, findAssignments} from '@/lib/assignment-finder';
import type {BearerContext, McpTool} from './types';

type Data = Record<string, any>;
type Student = {id: string; number: number; name: string};
const assignmentFields = ['classId', 'className', 'title', 'submissionType', 'dueAt', 'createdAt', 'targetStudentIds', 'targetCount', 'submittedCount', 'reviewedCount', 'visibility'] as const;

/** Tool catalog exposed through tools/list. Writes only preview; confirm_write saves (see workspace-tools.ts). */
export const TOOLS: McpTool[] = [
  {name: 'list_classes', scope: 'classes:read', description: '선생님이 운영하는 학급 목록(이름·학년·학년도·학생 수)을 돌려줍니다.', inputSchema: {type: 'object', properties: {}, additionalProperties: false}},
  {name: 'get_roster', scope: 'classes:read', description: '학급 명단을 번호 순으로 돌려줍니다. 기본은 "학생 07" 같은 가명이며, 실명 권한이 있는 연결에서 reveal_names=true일 때만 이름을 돌려줍니다.', inputSchema: {type: 'object', properties: {class_id: {type: 'string'}, reveal_names: {type: 'boolean', description: '실명 반환. names 권한이 있어야 동작합니다.'}}, required: ['class_id'], additionalProperties: false}},
  {name: 'list_assignments', scope: 'homework:read', description: '숙제 목록과 제출·검사 집계, 제출 방식(submissionType), 전시실·보드 자동 연동 여부(syncExhibition·syncBoard)를 돌려줍니다. 제출 방식·연동·제목·설명·마감은 manage_homework edit로 고칩니다. 숙제 메뉴 목록과 같은 조건으로 찾습니다: status=open이면 마감 전 또는 마감 없는 숙제만, all이면 전체(숨긴 숙제 제외), type은 종류(image·text·video·legacy), query는 제목 낱말(띄어쓰기로 여러 개), order는 new(최신순, 기본)·old(오래된순)·due(마감 가까운 순)입니다.', inputSchema: {type: 'object', properties: {class_id: {type: 'string'}, status: {type: 'string', enum: ['open', 'all']}, type: {type: 'string', enum: ['image', 'text', 'video', 'legacy']}, query: {type: 'string', maxLength: 80}, order: {type: 'string', enum: ['new', 'old', 'due']}, limit: {type: 'integer', minimum: 1, maximum: 100}}, additionalProperties: false}},
  {name: 'get_missing_submissions', scope: 'homework:read', description: '특정 숙제(assignment_id) 또는 특정 마감일(due_date, YYYY-MM-DD)의 미제출 학생을 돌려줍니다. 학생이 검사 전에 스스로 지운 제출도 미제출로 나옵니다. 제출물 내용은 읽지 않습니다.', inputSchema: {type: 'object', properties: {assignment_id: {type: 'string'}, due_date: {type: 'string', description: 'YYYY-MM-DD (Asia/Seoul)'}, reveal_names: {type: 'boolean'}}, additionalProperties: false}},
  {name: 'get_review_queue', scope: 'homework:read', description: '검사(확인)를 기다리는 제출이 있는 숙제와 건수를 돌려줍니다. 학생은 검사 전까지 제출을 고치거나 지울 수 있어 건수가 줄어들 수 있습니다.', inputSchema: {type: 'object', properties: {class_id: {type: 'string'}}, additionalProperties: false}},
  {name: 'list_deadlines', scope: 'homework:read', description: '앞으로 days일 안에 마감되는 숙제를 마감 순으로 돌려줍니다.', inputSchema: {type: 'object', properties: {days: {type: 'integer', minimum: 1, maximum: 60}}, additionalProperties: false}},
  {name: 'search_notebook', scope: 'notebook:read', description: '교무수첩 관찰 기록을 기간·학급·학생 번호·검색어로 찾습니다. 상담·건강·가정 등 민감 기록은 항상 제외되며, 본문은 300자까지만 돌려줍니다.', inputSchema: {type: 'object', properties: {from: {type: 'string', description: 'YYYY-MM-DD'}, to: {type: 'string', description: 'YYYY-MM-DD'}, class_id: {type: 'string'}, student_number: {type: 'integer', minimum: 1, maximum: 999}, query: {type: 'string', maxLength: 100}, reveal_names: {type: 'boolean'}, limit: {type: 'integer', minimum: 1, maximum: 100}}, required: ['from', 'to'], additionalProperties: false}},
  ...CLASSROOM_TOOLS,
  ...WORKSPACE_TOOLS,
  ...MANAGE_TOOLS,
];

const seoulDate = (iso: string) => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(iso));
async function ownedClasses(uid: string) {
  const snap = await db().collection('classes').where('ownerUid', '==', uid).select('name', 'grade', 'year', 'studentCount', 'adminStatus').get();
  return snap.docs.filter(doc => doc.data().adminStatus !== 'archived').map(doc => ({id: doc.id, name: String(doc.data().name ?? ''), grade: String(doc.data().grade ?? ''), year: Number(doc.data().year) || null, studentCount: Number(doc.data().studentCount) || 0})).sort((a, b) => a.name.localeCompare(b.name));
}
async function ownedClass(uid: string, classId: unknown) {
  const doc = await db().doc(`classes/${safeId(classId, '학급')}`).get();
  if (!doc.exists || doc.data()!.ownerUid !== uid) throw new BerryError('이 학급을 찾을 수 없어요.', 404, 'not_found');
  return {id: doc.id, name: String(doc.data()!.name ?? '')};
}
async function roster(classId: string): Promise<Student[]> {
  const snap = await db().collection(`classes/${classId}/students`).select('number', 'name', 'disabled').get();
  return snap.docs.filter(doc => !doc.data().disabled).map(doc => ({id: doc.id, number: Number(doc.data().number) || 0, name: String(doc.data().name ?? '')})).sort((a, b) => a.number - b.number);
}
async function ownedAssignments(uid: string, classId?: string) {
  const base = db().collection('assignments'), query = classId ? base.where('classId', '==', classId) : base.where('ownerUid', '==', uid);
  const snap = await query.select(...assignmentFields).get();
  return snap.docs.map(doc => ({id: doc.id, ...doc.data()} as Data)).filter(task => task.visibility !== 'hidden');
}
const assignmentView = (task: Data) => ({id: task.id, classId: task.classId, className: task.className ?? '', title: task.title, submissionType: task.submissionType ?? 'legacy', dueAt: task.dueAt ?? null, createdAt: task.createdAt, targetCount: task.targetCount ?? 0, submittedCount: task.submittedCount ?? 0, reviewedCount: task.reviewedCount ?? 0, pendingReview: Math.max((task.submittedCount ?? 0) - (task.reviewedCount ?? 0), 0), syncExhibition: !!task.sync?.exhibitionId, syncBoard: !!task.sync?.boardId, link: `/teacher/homework?classId=${task.classId}&assignmentId=${task.id}`});

/** Same finder as the 숙제 menu (kind, title words, order); hidden homework is already left out by ownedAssignments. */
function assignmentsMatching(tasks: Data[], args: Data) {
  if (args.type !== undefined && !(ASSIGNMENT_KINDS as readonly unknown[]).includes(args.type)) throw new BerryError('type은 image·text·video·legacy 중 하나예요.');
  if (args.order !== undefined && !(ASSIGNMENT_ORDERS as readonly unknown[]).includes(args.order)) throw new BerryError('order는 new·old·due 중 하나예요.');
  if (args.query !== undefined && typeof args.query !== 'string') throw new BerryError('query는 글자로 주세요.');
  return findAssignments(tasks, {kind: args.type, query: args.query, order: args.order});
}

async function missingFor(task: Data, students: Student[], ctx: BearerContext, reveal: unknown) {
  const snap = await db().collection('submissions').where('assignmentId', '==', task.id).select('studentId', 'status').get();
  const submitted = new Set(snap.docs.map(doc => doc.data().studentId as string));
  const targets = new Set((task.targetStudentIds ?? []) as string[]);
  const missing = students.filter(student => targets.has(student.id) && !submitted.has(student.id));
  return {assignment: assignmentView(task), missingCount: missing.length, missing: missing.map(student => ({number: student.number, label: studentLabel(student, ctx.scopes, reveal)}))};
}

export async function callTool(name: string, args: Data, ctx: BearerContext) {
  const tool = TOOLS.find(tool => tool.name === name);
  if (!tool) throw new BerryError(`알 수 없는 도구예요: ${name}`, 404, 'not_found');
  if (!toolAllowed(tool, ctx.scopes)) throw new BerryError(`이 도구에는 ${[tool.scope].flat().join(' 또는 ')} 권한이 필요해요.`, 403, 'insufficient_scope');
  if (name === 'get_catalog') {
    // Built from the tools this connection may use, so the table never lists something the client cannot call.
    const catalog = buildCatalog(TOOLS.filter(entry => toolAllowed(entry, ctx.scopes)), menuFlags());
    return typeof args.known_version === 'string' && args.known_version === catalog.version ? {version: catalog.version, unchanged: true} : catalog;
  }
  if (CLASSROOM_TOOLS.includes(tool)) return callClassroomTool(name, args, ctx);
  if (WORKSPACE_TOOLS.includes(tool) || MANAGE_TOOLS.includes(tool)) return callWorkspaceTool(name, args, ctx);
  switch (name) {
    case 'list_classes': return {classes: await ownedClasses(ctx.uid)};
    case 'get_roster': {
      const cls = await ownedClass(ctx.uid, args.class_id), students = await roster(cls.id);
      return {class: cls, students: students.map(student => ({number: student.number, label: studentLabel(student, ctx.scopes, args.reveal_names)})), pseudonymized: !(args.reveal_names === true && ctx.scopes.includes('names'))};
    }
    case 'list_assignments': {
      const classId = args.class_id === undefined ? undefined : (await ownedClass(ctx.uid, args.class_id)).id;
      const limit = boundedInt(args.limit, 30, 1, 100, 'limit'), status = args.status === 'all' ? 'all' : 'open', nowMs = Date.now();
      const tasks = assignmentsMatching(await ownedAssignments(ctx.uid, classId), args).filter(task => status === 'all' || !task.dueAt || Date.parse(task.dueAt) >= nowMs);
      return {assignments: tasks.slice(0, limit).map(assignmentView), total: tasks.length};
    }
    case 'get_missing_submissions': {
      if (args.assignment_id !== undefined) {
        const doc = await db().doc(`assignments/${safeId(args.assignment_id, '숙제')}`).get();
        if (!doc.exists || doc.data()!.ownerUid !== ctx.uid) throw new BerryError('이 숙제를 찾을 수 없어요.', 404, 'not_found');
        const task = {id: doc.id, ...doc.data()} as Data;
        return await missingFor(task, await roster(task.classId), ctx, args.reveal_names);
      }
      const date = isoDate(args.due_date, 'due_date');
      const tasks = (await ownedAssignments(ctx.uid)).filter(task => task.dueAt && seoulDate(task.dueAt) === date).slice(0, 20);
      const rosters = new Map<string, Student[]>();
      for (const task of tasks) if (!rosters.has(task.classId)) rosters.set(task.classId, await roster(task.classId));
      return {date, assignments: await Promise.all(tasks.map(task => missingFor(task, rosters.get(task.classId)!, ctx, args.reveal_names)))};
    }
    case 'get_review_queue': {
      const classId = args.class_id === undefined ? undefined : (await ownedClass(ctx.uid, args.class_id)).id;
      const tasks = (await ownedAssignments(ctx.uid, classId)).map(assignmentView).filter(task => task.pendingReview > 0).sort((a, b) => b.pendingReview - a.pendingReview);
      return {queue: tasks.slice(0, MAX_TOOL_RESULT_ITEMS), totalPending: tasks.reduce((sum, task) => sum + task.pendingReview, 0)};
    }
    case 'list_deadlines': {
      const days = boundedInt(args.days, 7, 1, 60, 'days'), nowMs = Date.now(), until = nowMs + days * 86_400_000;
      const tasks = (await ownedAssignments(ctx.uid)).filter(task => task.dueAt && Date.parse(task.dueAt) >= nowMs && Date.parse(task.dueAt) <= until).map(assignmentView).sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
      return {days, deadlines: tasks.slice(0, MAX_TOOL_RESULT_ITEMS)};
    }
    case 'search_notebook': return await searchNotebook(args, ctx);
  }
  throw new BerryError(`알 수 없는 도구예요: ${name}`, 404, 'not_found');
}

/** Sensitive entries never leave the server through this path, whatever the arguments say. */
async function searchNotebook(args: Data, ctx: BearerContext) {
  const from = isoDate(args.from, 'from'), to = isoDate(args.to, 'to');
  if (to < from || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 400 * 86_400_000) throw new BerryError('기간은 400일 이내여야 해요.');
  const limit = boundedInt(args.limit, 30, 1, 100, 'limit'), number = args.student_number === undefined ? null : boundedInt(args.student_number, 0, 1, 999, 'student_number');
  const query = typeof args.query === 'string' ? args.query.trim().slice(0, 100).toLowerCase() : '';
  const classId = args.class_id === undefined ? null : (await ownedClass(ctx.uid, args.class_id)).id;
  // Range on a single field only: no composite index is required. Sensitive rows are dropped below, never returned.
  const snap = await db().collection(`teacherNotebooks/${ctx.uid}/entries`).where('date', '>=', from).where('date', '<=', to).limit(1500).get();
  const classIds = new Set<string>();
  snap.docs.forEach(doc => (doc.data().students ?? []).forEach((ref: Data) => classIds.add(ref.classId)));
  const rosters = new Map<string, Student[]>();
  // Every owned class, so names typed into a body are masked even when the entry links no student.
  for (const cls of await ownedClasses(ctx.uid)) rosters.set(cls.id, await roster(cls.id));
  for (const id of classIds) if (!rosters.has(id)) {const cls = await db().doc(`classes/${id}`).get(); if (cls.exists && cls.data()!.ownerUid === ctx.uid) rosters.set(id, await roster(id));}
  const reveal = args.reveal_names === true && ctx.scopes.includes('names'), everyone = [...rosters.values()].flat();
  const entries = [];
  for (const doc of snap.docs.sort((a, b) => String(b.data().date).localeCompare(String(a.data().date)))) {
    const data = doc.data();
    if (data.sensitive) continue;
    const refs = (data.students ?? []) as {classId: string; studentId: string}[];
    if (classId && !refs.some(ref => ref.classId === classId)) continue;
    const people = refs.map(ref => rosters.get(ref.classId)?.find(student => student.id === ref.studentId)).filter((student): student is Student => !!student);
    if (number !== null && !people.some(student => student.number === number)) continue;
    let body = '';
    try {body = openBody(data.body, ctx.uid, doc.id) ?? '';} catch (error) {if (error instanceof NotebookError) throw new BerryError('교무수첩 보안 설정이 준비되지 않았어요.', 503, 'server_error'); throw error;}
    if (query && !body.toLowerCase().includes(query)) continue;
    const shown = reveal ? body : maskNames(body, everyone);
    entries.push({date: data.date, tags: ((data.tags ?? []) as NotebookTag[]).map(tag => NOTEBOOK_TAG_LABELS[tag] ?? tag), students: people.map(student => ({number: student.number, label: studentLabel(student, ctx.scopes, args.reveal_names)})), body: shown.length > 300 ? `${shown.slice(0, 300)}…` : shown, ...(data.pending ? {pending: true} : {})});
    if (entries.length >= limit) break;
  }
  return {from, to, entries, note: '민감 기록(상담·건강·가정)은 포함되지 않습니다.', alias: alias(7)};
}
