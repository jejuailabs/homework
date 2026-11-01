import 'server-only';
import {randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
import {Timestamp} from 'firebase-admin/firestore';
import {bucket, db} from '@/lib/server/admin';
import {assertOrigin, getContext} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {stableReadUrl} from '@/lib/server/signed-urls';
import {assertTeacherStorage} from '@/lib/server/teacher-storage';
import {cancelUploadTransfer, createUploadTransfer} from '@/lib/server/upload-transfer';
import {FILE_CACHE_CONTROL} from '@/lib/storage-cache';
import {NotebookError} from '@/modules/teacher-notebook/policy';
import {logWorkspaceEvent} from './event-log';
import {
  DEFAULT_RETENTION_DAYS, MAX_FOLDERS, MAX_LESSON_ENTRIES, WorkspaceError, assertFolderPlacement, calendarInput, calendarWindow, eventDates, folderInput,
  importPreview, isoDate, itemInput, itemMatches, ledger, lessonEntries, mergeLessonEntries, overlaps, parseLessonLine, parseTimetableText, rangeInput,
  safeFileName, safeId, seoulDate, sortEvents, sourcePending, timetableSlots, toCsv, weekKey, workspaceAllowed, workspaceFileInput,
  type CalendarInput, type ItemInput, type LessonEntryInput,
} from './policy';
import {openItemBody, sealItemBody} from './vault';
import {
  CALENDAR_KINDS, CALENDAR_KIND_LABELS, FOLDER_KINDS, ITEM_TYPE_LABELS,
  type CalendarEvent, type CalendarKind, type FolderKind, type LessonDay, type LessonEntry, type Timetable, type WorkFolder, type WorkItem, type WorkItemSummary, type WorkspaceSource,
} from './types';

type Input = Record<string, unknown>;
const PATH_ID = /^[A-Za-z0-9_-]{1,40}$/, FOREVER = 253402300799000, ZIP_MAX_BYTES = 1.5 * 1024 ** 3;
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store', ...headers}});
const now = () => new Date().toISOString();
const space = (uid: string) => db().doc(`teacherWorkspaces/${uid}`);
const calendar = (uid: string) => space(uid).collection('calendar');
const timetables = (uid: string) => space(uid).collection('timetable');
const lessons = (uid: string) => space(uid).collection('lessons');
const folders = (uid: string) => space(uid).collection('folders');
const items = (uid: string) => space(uid).collection('items');
const files = () => db().collection('workspaceFiles');
const shortId = () => randomBytes(9).toString('base64url');
const pathId = (value: string | undefined, label: string) => {
  if (!value || !PATH_ID.test(value)) throw new WorkspaceError(`${label}을(를) 찾을 수 없어요.`, 404, 'NOT_FOUND');
  return value;
};
const notFound = (label: string) => new WorkspaceError(`${label}을(를) 찾을 수 없어요.`, 404, 'NOT_FOUND');

async function input(request: Request, maxBytes = 40_000): Promise<Input> {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new WorkspaceError('입력 내용이 너무 커요.', 413);
  try {const data = JSON.parse(raw); if (data && typeof data === 'object' && !Array.isArray(data)) return data;} catch {}
  throw new WorkspaceError('입력 내용을 확인해 주세요.');
}
export const workspaceDisabled = () => process.env.TEACHER_WORKSPACE_DISABLED === 'true';
async function teacher(request: Request) {
  const ctx = await getContext(request);
  if (!workspaceAllowed(ctx.role, process.env.TEACHER_WORKSPACE_DISABLED)) throw new WorkspaceError('업무 공간을 사용할 수 없어요.', 403, 'WORKSPACE_DISABLED');
  return ctx;
}
const created = new Set<string>();
/** The space document holds the storage ledger and retention; it is created on the first write. */
async function touch(uid: string) {
  if (created.has(uid)) return;
  await space(uid).create({createdAt: now(), storageBytes: 0, reservedBytes: 0, retentionDays: DEFAULT_RETENTION_DAYS}).catch(error => {if ((error as {code?: number}).code !== 6) throw error;});
  created.add(uid);
}
async function audit(uid: string, action: string, details: Input = {}) {
  await space(uid).collection('audit').add({action, details, at: now()});
}
/** Ownership is checked on every call: a class or student id from the client is never trusted. */
export async function assertOwnClass(uid: string, classId: string | null | undefined) {
  if (!classId) return;
  const doc = await db().doc(`classes/${classId}`).get();
  if (!doc.exists || doc.data()?.ownerUid !== uid) throw new WorkspaceError('우리 반만 연결할 수 있어요.', 403, 'FORBIDDEN');
}
async function assertOwnStudents(uid: string, refs: {classId: string; studentId: string}[]) {
  if (!refs.length) return;
  for (const classId of new Set(refs.map(ref => ref.classId))) await assertOwnClass(uid, classId);
  const students = await db().getAll(...refs.map(ref => db().doc(`classes/${ref.classId}/students/${ref.studentId}`)));
  if (students.some(doc => !doc.exists)) throw new WorkspaceError('명단에 없는 학생이 있어요. 다시 선택해 주세요.');
}

// ---- Calendar ----
function publicEvent(doc: FirebaseFirestore.DocumentSnapshot): CalendarEvent {
  const data = doc.data()!, allDay = !!data.allDay;
  return {id: doc.id, title: String(data.title ?? ''), start: data.start, end: data.end, allDay, kind: CALENDAR_KINDS.includes(data.kind) ? data.kind : 'school', classId: data.classId ?? null, source: data.source ?? 'form', pending: !!data.pending, ...eventDates(data.start, data.end, allDay)};
}
/** Assignment due dates in the window, shown as read-only deadlines. Hidden assignments stay out. */
async function assignmentDeadlines(uid: string, fromMs: number, toMs: number): Promise<CalendarEvent[]> {
  const snap = await db().collection('assignments').where('ownerUid', '==', uid).select('title', 'classId', 'dueAt', 'visibility').get();
  return snap.docs.flatMap(doc => {
    const data = doc.data(), due = typeof data.dueAt === 'string' ? Date.parse(data.dueAt) : NaN;
    if (data.visibility === 'hidden' || !Number.isFinite(due) || due < fromMs || due >= toMs) return [];
    const at = new Date(due).toISOString(), date = seoulDate(due);
    return [{id: `assignment:${doc.id}`, title: String(data.title ?? ''), start: at, end: at, allDay: false, kind: 'deadline' as const, classId: data.classId ?? null, source: 'activity' as const, pending: false, startDate: date, endDate: date, readOnly: true, assignmentId: doc.id}];
  });
}
export async function listCalendar(uid: string, from: unknown, to: unknown, options: {deadlines?: boolean; maxDays?: number} = {}) {
  const range = rangeInput(from, to, options.maxDays ?? 120), window = calendarWindow(range.from, range.to);
  const snap = await calendar(uid).where('start', '>=', window.queryStart).where('start', '<', window.queryEnd).limit(3000).get();
  const events = snap.docs.map(publicEvent).filter(event => overlaps(event.start, event.end, window.fromMs, window.toMs));
  const deadlines = options.deadlines === false ? [] : await assignmentDeadlines(uid, window.fromMs, window.toMs);
  return {...range, events: sortEvents([...events, ...deadlines])};
}
export async function createCalendarEvent(uid: string, value: CalendarInput, source: WorkspaceSource) {
  await assertOwnClass(uid, value.classId);
  await touch(uid);
  const ref = calendar(uid).doc(), at = now(), batch = db().batch();
  batch.create(ref, {...value, source, pending: sourcePending(source), sensitivity: 'normal', createdAt: at, updatedAt: at});
  logWorkspaceEvent(uid, 'calendar.created', {collection: 'calendar', id: ref.id}, {writer: batch});
  await batch.commit();
  return publicEvent(await ref.get());
}
async function updateCalendarEvent(uid: string, eventId: string, data: Input) {
  const value = calendarInput(data), ref = calendar(uid).doc(eventId);
  if (!(await ref.get()).exists) throw notFound('일정');
  await assertOwnClass(uid, value.classId);
  const batch = db().batch();
  batch.update(ref, {...value, updatedAt: now()});
  logWorkspaceEvent(uid, 'calendar.updated', {collection: 'calendar', id: eventId}, {writer: batch});
  await batch.commit();
  return {event: publicEvent(await ref.get())};
}
async function removeDoc(uid: string, ref: FirebaseFirestore.DocumentReference, label: string, type: 'calendar.deleted', collection: string) {
  if (!(await ref.get()).exists) throw notFound(label);
  const batch = db().batch();
  batch.delete(ref);
  logWorkspaceEvent(uid, type, {collection, id: ref.id}, {writer: batch});
  await batch.commit();
  return {ok: true};
}
/** Clears the "Berry suggestion" mark once the teacher accepts a chat-made record. */
async function confirm(uid: string, ref: FirebaseFirestore.DocumentReference, label: string, type: 'calendar.confirmed' | 'item.confirmed', collection: string) {
  const doc = await ref.get();
  if (!doc.exists) throw notFound(label);
  const batch = db().batch();
  batch.update(ref, {pending: false, confirmedAt: now()});
  logWorkspaceEvent(uid, type, {collection, id: ref.id}, {writer: batch, sensitive: doc.data()?.sensitivity === 'sensitive'});
  await batch.commit();
  return {ok: true};
}
/** Step one returns the parsed preview and its hash; step two repeats the request with `confirm: <hash>` and saves exactly that content. */
async function importCalendar(uid: string, data: Input) {
  const kind = data.kind === undefined ? 'school' : data.kind;
  if (!CALENDAR_KINDS.includes(kind as CalendarKind)) throw new WorkspaceError('일정 종류를 확인해 주세요.');
  const preview = importPreview(data.format, data.text, kind as CalendarKind);
  if (data.confirm !== preview.hash) return {preview: true, hash: preview.hash, count: preview.events.length, events: preview.events.map(({importId, ...event}) => ({id: importId, ...event, ...eventDates(event.start, event.end, event.allDay)})), errors: preview.errors, warnings: preview.warnings};
  if (!preview.events.length) throw new WorkspaceError('가져올 일정이 없어요.');
  await touch(uid);
  const refs = preview.events.map(event => calendar(uid).doc(event.importId)), existing = new Map((await db().getAll(...refs)).map(doc => [doc.id, doc.data()]));
  const at = now();
  for (let start = 0; start < preview.events.length; start += 400) {
    const batch = db().batch(), chunk = preview.events.slice(start, start + 400);
    for (const {importId, ...event} of chunk) batch.set(calendar(uid).doc(importId), {...event, source: 'import', pending: false, sensitivity: 'normal', createdAt: existing.get(importId)?.createdAt ?? at, updatedAt: at});
    logWorkspaceEvent(uid, 'calendar.imported', {collection: 'calendar', id: chunk[0].importId}, {writer: batch, count: chunk.length});
    await batch.commit();
  }
  const updated = preview.events.filter(event => existing.get(event.importId)).length;
  return {imported: preview.events.length, created: preview.events.length - updated, updated, errors: preview.errors, warnings: preview.warnings};
}

// ---- Timetable ----
export async function getTimetable(uid: string, value: unknown): Promise<Timetable> {
  const key = weekKey(value), doc = await timetables(uid).doc(key).get();
  if (doc.exists) {const data = doc.data()!; return {weekKey: key, slots: data.slots ?? [], source: data.source ?? 'form', inheritedFrom: null, updatedAt: data.updatedAt ?? null};}
  // Most weeks repeat: fall back to the latest earlier week.
  const previous = (await timetables(uid).where('weekKey', '<', key).orderBy('weekKey', 'desc').limit(1).get()).docs[0];
  return {weekKey: key, slots: previous?.data().slots ?? [], source: previous ? previous.data().source ?? 'form' : null, inheritedFrom: previous?.id ?? null, updatedAt: null};
}
async function saveTimetable(uid: string, value: unknown, data: Input) {
  const key = weekKey(value), slots = typeof data.text === 'string' ? parseTimetableText(data.text) : timetableSlots(data.slots);
  if (data.preview === true) return {weekKey: key, slots};
  for (const classId of new Set(slots.flatMap(slot => slot.classId ? [slot.classId] : []))) await assertOwnClass(uid, classId);
  await touch(uid);
  const batch = db().batch();
  batch.set(timetables(uid).doc(key), {weekKey: key, slots, source: 'form', updatedAt: now()});
  logWorkspaceEvent(uid, 'timetable.saved', {collection: 'timetable', id: key}, {writer: batch});
  await batch.commit();
  return getTimetable(uid, key);
}

// ---- Lesson log ----
const lessonDay = (doc: FirebaseFirestore.DocumentSnapshot): LessonDay => ({date: doc.id, entries: (doc.data()?.entries ?? []) as LessonEntry[], updatedAt: doc.data()?.updatedAt ?? ''});
export async function listLessons(uid: string, from: unknown, to: unknown) {
  const range = rangeInput(from, to);
  const snap = await lessons(uid).where('date', '>=', range.from).where('date', '<=', range.to).limit(500).get();
  return {...range, days: snap.docs.map(lessonDay).sort((a, b) => b.date.localeCompare(a.date))};
}
async function saveLessons(uid: string, value: unknown, data: Input) {
  const date = isoDate(value);
  await touch(uid);
  const ref = lessons(uid).doc(date);
  await db().runTransaction(async tx => {
    const previous = ((await tx.get(ref)).data()?.entries ?? []) as LessonEntry[];
    // One line typed into the log is appended; a full list replaces the day.
    const next: LessonEntryInput[] = typeof data.line === 'string' ? [...previous, parseLessonLine(data.line)] : lessonEntries(data.entries);
    if (next.length > MAX_LESSON_ENTRIES) throw new WorkspaceError(`하루 일지는 ${MAX_LESSON_ENTRIES}줄까지 쓸 수 있어요.`);
    const entries = mergeLessonEntries(previous, next, shortId);
    if (entries.length) tx.set(ref, {date, entries, source: 'form', updatedAt: now()});
    else tx.delete(ref);
    logWorkspaceEvent(uid, 'lesson.saved', {collection: 'lessons', id: date}, {writer: tx});
  });
  return lessonDay(await ref.get());
}
export async function appendLessonEntry(uid: string, date: string, entry: LessonEntryInput, source: WorkspaceSource) {
  await touch(uid);
  const ref = lessons(uid).doc(date), id = shortId();
  await db().runTransaction(async tx => {
    const previous = ((await tx.get(ref)).data()?.entries ?? []) as LessonEntry[];
    if (previous.length >= MAX_LESSON_ENTRIES) throw new WorkspaceError(`하루 일지는 ${MAX_LESSON_ENTRIES}줄까지 쓸 수 있어요.`);
    const {id: _ignored, ...value} = entry;
    tx.set(ref, {date, entries: [...previous, {...value, id, source, pending: sourcePending(source)}], source, updatedAt: now()});
    logWorkspaceEvent(uid, 'lesson.saved', {collection: 'lessons', id: date}, {writer: tx});
  });
  return {date, entryId: id};
}
async function confirmLessons(uid: string, value: unknown) {
  const date = isoDate(value), ref = lessons(uid).doc(date);
  await db().runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw notFound('수업 일지');
    tx.update(ref, {entries: ((doc.data()!.entries ?? []) as LessonEntry[]).map(entry => ({...entry, pending: false})), updatedAt: now()});
    logWorkspaceEvent(uid, 'lesson.confirmed', {collection: 'lessons', id: date}, {writer: tx});
  });
  return lessonDay(await ref.get());
}

// ---- Folders ----
const publicFolder = (doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): WorkFolder => {
  const data = doc.data()!;
  return {id: doc.id, name: String(data.name ?? ''), kind: FOLDER_KINDS.includes(data.kind) ? data.kind : 'etc', parentId: data.parentId ?? null, createdAt: data.createdAt ?? ''};
};
export async function listFolders(uid: string) {
  const [folderSnap, itemSnap] = await Promise.all([folders(uid).limit(MAX_FOLDERS).get(), items(uid).select('folderId').get()]);
  const counts: Record<string, number> = {};
  for (const doc of itemSnap.docs) {const id = String(doc.data().folderId ?? ''); counts[id] = (counts[id] ?? 0) + 1;}
  return {folders: folderSnap.docs.map(publicFolder).sort((a, b) => a.name.localeCompare(b.name, 'ko')), counts};
}
async function createFolder(uid: string, data: Input) {
  const value = folderInput(data), existing = (await folders(uid).limit(MAX_FOLDERS + 1).get()).docs.map(publicFolder);
  if (existing.length >= MAX_FOLDERS) throw new WorkspaceError(`폴더는 ${MAX_FOLDERS}개까지 만들 수 있어요.`);
  assertFolderPlacement(existing, null, value.parentId);
  await touch(uid);
  const ref = folders(uid).doc(), at = now(), batch = db().batch();
  batch.create(ref, {...value, createdAt: at, updatedAt: at});
  logWorkspaceEvent(uid, 'folder.created', {collection: 'folders', id: ref.id}, {writer: batch});
  await batch.commit();
  return {folder: publicFolder(await ref.get())};
}
async function updateFolder(uid: string, folderId: string, data: Input) {
  const ref = folders(uid).doc(folderId), doc = await ref.get();
  if (!doc.exists) throw notFound('폴더');
  const current = publicFolder(doc), value = folderInput({name: data.name ?? current.name, kind: data.kind ?? current.kind, parentId: data.parentId === undefined ? current.parentId : data.parentId});
  assertFolderPlacement((await folders(uid).limit(MAX_FOLDERS).get()).docs.map(publicFolder), folderId, value.parentId);
  const batch = db().batch();
  batch.update(ref, {...value, updatedAt: now()});
  logWorkspaceEvent(uid, 'folder.updated', {collection: 'folders', id: folderId}, {writer: batch});
  await batch.commit();
  return {folder: publicFolder(await ref.get())};
}
async function deleteFolder(uid: string, folderId: string) {
  const ref = folders(uid).doc(folderId);
  if (!(await ref.get()).exists) throw notFound('폴더');
  const [children, contents] = await Promise.all([folders(uid).where('parentId', '==', folderId).limit(1).get(), items(uid).where('folderId', '==', folderId).limit(1).get()]);
  if (!children.empty || !contents.empty) throw new WorkspaceError('폴더 안의 항목과 하위 폴더를 먼저 옮기거나 지워 주세요.', 409, 'FOLDER_NOT_EMPTY');
  const batch = db().batch();
  batch.delete(ref);
  logWorkspaceEvent(uid, 'folder.deleted', {collection: 'folders', id: folderId}, {writer: batch});
  await batch.commit();
  return {ok: true};
}

// ---- Items ----
const SUMMARY_FIELDS = ['folderId', 'type', 'title', 'dueAt', 'tags', 'classId', 'sensitivity', 'source', 'pending', 'file', 'updatedAt'] as const;
function itemSummary(doc: FirebaseFirestore.DocumentSnapshot): WorkItemSummary {
  const data = doc.data()!;
  return {id: doc.id, folderId: String(data.folderId ?? ''), type: data.type ?? 'note', title: String(data.title ?? ''), dueAt: data.dueAt ?? null, tags: data.tags ?? [], classId: data.classId ?? null, sensitivity: data.sensitivity === 'sensitive' ? 'sensitive' : 'normal', source: data.source ?? 'form', pending: !!data.pending, hasFile: !!data.file, updatedAt: data.updatedAt ?? ''};
}
function publicItem(uid: string, doc: FirebaseFirestore.DocumentSnapshot): WorkItem {
  const data = doc.data()!;
  return {...itemSummary(doc), body: data.body ? openItemBody(data.body, uid, doc.id) ?? '(이 내용을 열지 못했어요.)' : '', url: data.url ?? null, checklist: data.checklist ?? [], students: data.students ?? [], file: data.file ?? null, createdAt: data.createdAt ?? ''};
}
export async function listItems(uid: string, filter: {folderId?: string | null; q?: string; dueBefore?: string | null; folderKind?: FolderKind | null; limit?: number}) {
  const base = filter.folderId ? items(uid).where('folderId', '==', filter.folderId) : items(uid);
  const [snap, folderList] = await Promise.all([base.select(...SUMMARY_FIELDS).limit(5000).get(), filter.folderKind ? folders(uid).limit(MAX_FOLDERS).get() : null]);
  const folderKinds = new Map(folderList?.docs.map(doc => [doc.id, publicFolder(doc).kind]) ?? []);
  const list = snap.docs.map(itemSummary).filter(item => itemMatches(item, {q: filter.q, dueBefore: filter.dueBefore, folderKind: filter.folderKind, folderKinds}));
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, filter.limit ?? 500);
}
export async function getItem(uid: string, itemId: string) {
  const doc = await items(uid).doc(itemId).get();
  if (!doc.exists) throw notFound('항목');
  return publicItem(uid, doc);
}
async function assertItemRefs(uid: string, value: ItemInput) {
  if (!(await folders(uid).doc(value.folderId).get()).exists) throw notFound('폴더');
  await assertOwnClass(uid, value.classId);
  await assertOwnStudents(uid, value.students);
}
const storedItem = (uid: string, itemId: string, value: ItemInput) => ({
  folderId: value.folderId, type: value.type, title: value.title, body: value.body ? sealItemBody(value.body, uid, itemId) : null, bodyLength: value.body.length,
  url: value.url, checklist: value.checklist, dueAt: value.dueAt, tags: value.tags, classId: value.classId, students: value.students, sensitivity: value.sensitivity, updatedAt: now(),
});
export async function createWorkItem(uid: string, value: ItemInput, source: WorkspaceSource) {
  await assertItemRefs(uid, value);
  await touch(uid);
  const ref = items(uid).doc(), batch = db().batch();
  batch.create(ref, {...storedItem(uid, ref.id, value), source, pending: sourcePending(source), file: null, filePath: null, createdAt: now()});
  logWorkspaceEvent(uid, 'item.created', {collection: 'items', id: ref.id}, {writer: batch, sensitive: value.sensitivity === 'sensitive'});
  await batch.commit();
  return publicItem(uid, await ref.get());
}
async function updateWorkItem(uid: string, itemId: string, data: Input) {
  const value = itemInput(data), ref = items(uid).doc(itemId);
  if (!(await ref.get()).exists) throw notFound('항목');
  await assertItemRefs(uid, value);
  const batch = db().batch();
  batch.update(ref, storedItem(uid, itemId, value));
  logWorkspaceEvent(uid, 'item.updated', {collection: 'items', id: itemId}, {writer: batch, sensitive: value.sensitivity === 'sensitive'});
  await batch.commit();
  return {item: publicItem(uid, await ref.get())};
}
async function deleteWorkItem(uid: string, itemId: string) {
  const ref = items(uid).doc(itemId), doc = await ref.get();
  if (!doc.exists) throw notFound('항목');
  const fileId = doc.data()!.file?.fileId as string | undefined;
  const batch = db().batch();
  batch.delete(ref);
  logWorkspaceEvent(uid, 'item.deleted', {collection: 'items', id: itemId}, {writer: batch, sensitive: doc.data()!.sensitivity === 'sensitive'});
  await batch.commit();
  if (fileId) await removeStoredFile(uid, fileId);
  return {ok: true};
}

// ---- Item files: reserve → upload straight to Storage → finalize. Pending reservations expire after an hour. ----
type StoredFile = {ownerUid: string; itemId: string; path: string; fileName: string; contentType: string; size: number; status: string; uploadUrl?: string; expiresAt: Timestamp; createdAt: string};
const fileRef = (fileId: string) => files().doc(fileId);
async function deleteObject(path: string) {
  const file = bucket().file(path);
  try {const [metadata] = await file.getMetadata(); await file.delete({ifGenerationMatch: metadata.generation});}
  catch (error) {if ((error as {code?: number}).code !== 404) throw error;}
}
/** Cancels an unfinished upload and returns its reserved bytes. Finished files are left alone. */
async function removeStaged(uid: string, fileId: string, expiredOnly = false) {
  const ref = fileRef(fileId);
  const value = await db().runTransaction(async tx => {
    const doc = await tx.get(ref), data = doc.data() as StoredFile | undefined;
    if (!data) return null;
    if (data.ownerUid !== uid) throw notFound('파일');
    if (data.status !== 'pending' || (expiredOnly && data.expiresAt.toMillis() > Date.now())) return null;
    tx.update(ref, {status: 'cleanup'});
    return data;
  });
  if (!value) return;
  await cancelUploadTransfer(value.uploadUrl);
  await deleteObject(value.path);
  await db().runTransaction(async tx => {
    const [doc, ledgerDoc] = await Promise.all([tx.get(ref), tx.get(space(uid))]);
    if (!doc.exists) return;
    const current = ledger(ledgerDoc.data());
    tx.set(space(uid), {reservedBytes: Math.max(0, current.reservedBytes - value.size)}, {merge: true});
    tx.delete(ref);
  });
}
/** Deletes a finished file and gives its bytes back to the teacher's allowance. */
async function removeStoredFile(uid: string, fileId: string) {
  const ref = fileRef(fileId), doc = await ref.get(), data = doc.data() as StoredFile | undefined;
  if (!data || data.ownerUid !== uid) return;
  await ref.update({status: 'cleanup'});
  await deleteObject(data.path);
  await db().runTransaction(async tx => {
    const current = ledger((await tx.get(space(uid))).data());
    tx.set(space(uid), {storageBytes: Math.max(0, current.storageBytes - data.size)}, {merge: true});
    tx.delete(ref);
  });
}
async function cleanupExpired(uid: string) {
  const candidates = await files().where('ownerUid', '==', uid).where('expiresAt', '<=', Timestamp.now()).limit(20).get();
  for (const doc of candidates.docs) await removeStaged(uid, doc.id, true);
}
export async function cleanupExpiredWorkspaceFiles() {
  const candidates = await files().where('expiresAt', '<=', Timestamp.now()).limit(100).get();
  let cleaned = 0;
  for (const doc of candidates.docs) {
    try {await removeStaged(String(doc.data().ownerUid), doc.id, true); cleaned++;} catch {console.error('Workspace file cleanup deferred');}
  }
  return {cleaned, hasMore: candidates.size === 100};
}
async function reserveFile(uid: string, itemId: string, data: Input, origin: string) {
  if (!(await items(uid).doc(itemId).get()).exists) throw notFound('항목');
  const value = workspaceFileInput(data);
  await cleanupExpired(uid);
  await touch(uid);
  await assertTeacherStorage(uid, value.size);
  const ref = files().doc(), path = `workspace/${uid}/${itemId}/${ref.id}`;
  await db().runTransaction(async tx => {
    const current = ledger((await tx.get(space(uid))).data());
    tx.set(space(uid), {reservedBytes: current.reservedBytes + value.size}, {merge: true});
    tx.create(ref, {ownerUid: uid, itemId, path, ...value, status: 'pending', createdAt: now(), expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000)});
  });
  try {
    const transfer = await createUploadTransfer(path, value.contentType, value.size, origin);
    await ref.update({uploadUrl: transfer.uploadUrl});
    return {fileId: ref.id, ...transfer};
  } catch (error) {await removeStaged(uid, ref.id); throw error;}
}
async function finalizeFile(uid: string, itemId: string, fileId: string) {
  const ref = fileRef(fileId), data = (await ref.get()).data() as StoredFile | undefined;
  if (!data || data.ownerUid !== uid || data.itemId !== itemId) throw notFound('파일');
  if (data.status === 'ready') return {item: await getItem(uid, itemId)};
  if (data.status !== 'pending' || data.expiresAt.toMillis() <= Date.now()) throw new WorkspaceError('파일을 다시 올려 주세요.', 409, 'FILE_EXPIRED');
  const object = bucket().file(data.path);
  const [metadata] = await object.getMetadata().catch(() => {throw new WorkspaceError('아직 전송 중이에요.', 409, 'UPLOAD_INCOMPLETE');});
  if (Number(metadata.size) !== data.size || metadata.contentType !== data.contentType) throw new WorkspaceError('파일 정보가 달라요.', 400, 'UPLOAD_MISMATCH');
  await object.setMetadata({cacheControl: FILE_CACHE_CONTROL, metadata: {firebaseStorageDownloadTokens: null}});
  const itemRef = items(uid).doc(itemId);
  const previous = await db().runTransaction(async tx => {
    const [fresh, item, ledgerDoc] = await Promise.all([tx.get(ref), tx.get(itemRef), tx.get(space(uid))]);
    if (fresh.data()?.status !== 'pending') throw new WorkspaceError('파일 상태가 바뀌었어요. 다시 올려 주세요.', 409);
    if (!item.exists) throw notFound('항목');
    const current = ledger(ledgerDoc.data());
    tx.set(space(uid), {reservedBytes: Math.max(0, current.reservedBytes - data.size), storageBytes: current.storageBytes + data.size}, {merge: true});
    tx.update(ref, {status: 'ready', expiresAt: Timestamp.fromMillis(FOREVER), uploadUrl: null});
    tx.update(itemRef, {file: {fileId, fileName: data.fileName, contentType: data.contentType, size: data.size}, filePath: data.path, updatedAt: now()});
    logWorkspaceEvent(uid, 'item.file', {collection: 'items', id: itemId}, {writer: tx, sensitive: item.data()!.sensitivity === 'sensitive'});
    return item.data()!.file?.fileId as string | undefined;
  });
  // A replaced file is removed after the new one is in place.
  if (previous && previous !== fileId) await removeStoredFile(uid, previous);
  return {item: await getItem(uid, itemId)};
}
async function fileLink(uid: string, itemId: string) {
  const item = (await items(uid).doc(itemId).get()).data();
  if (!item?.file || !item.filePath) throw notFound('파일');
  const name = encodeURIComponent(safeFileName(String(item.file.fileName)));
  return {url: await stableReadUrl(item.filePath, {responseDisposition: `attachment; filename*=UTF-8''${name}`}), fileName: item.file.fileName};
}

// ---- Export: CSV per table, or a manifest the browser turns into a ZIP (files are fetched straight from Storage) ----
async function exportTables(uid: string, includeSensitive: boolean) {
  const [eventSnap, lessonSnap, folderList, itemSnap] = await Promise.all([calendar(uid).orderBy('start').limit(5000).get(), lessons(uid).orderBy('date').limit(3000).get(), listFolders(uid), items(uid).limit(5000).get()]);
  const folderNames = new Map(folderList.folders.map(folder => [folder.id, folder.name]));
  const calendarCsv = toCsv([['제목', '시작', '끝', '하루 종일', '종류', '출처', '베리 제안'], ...eventSnap.docs.map(publicEvent).map(event => [event.title, event.allDay ? event.startDate : event.start, event.allDay ? event.endDate : event.end, event.allDay ? '예' : '', CALENDAR_KIND_LABELS[event.kind], event.source, event.pending ? '예' : ''])]);
  const lessonCsv = toCsv([['날짜', '교시', '과목', '단원', '메모', '베리 제안'], ...lessonSnap.docs.flatMap(doc => lessonDay(doc).entries.map(entry => [doc.id, entry.period ? String(entry.period) : '', entry.subject, entry.unit ?? '', entry.note, entry.pending ? '예' : '']))]);
  // Excluded sensitive bodies are never decrypted.
  const kept = itemSnap.docs.filter(doc => includeSensitive || doc.data().sensitivity !== 'sensitive').map(doc => publicItem(uid, doc));
  const itemCsv = toCsv([['폴더', '종류', '제목', '기한', '태그', '민감', '내용', '링크', '체크리스트', '파일'], ...kept.map(item => [folderNames.get(item.folderId) ?? '', ITEM_TYPE_LABELS[item.type], item.title, item.dueAt ?? '', item.tags.join(', '), item.sensitivity === 'sensitive' ? '예' : '', item.body, item.url ?? '', item.checklist.map(row => `${row.done ? '[x]' : '[ ]'} ${row.text}`).join('\n'), item.file?.fileName ?? ''])]);
  return {calendarCsv, lessonCsv, itemCsv, kept, folderNames};
}
async function exportWorkspace(uid: string, params: URLSearchParams) {
  const format = params.get('format'), includeSensitive = params.get('includeSensitive') === '1';
  if (format !== 'csv' && format !== 'zip') throw new WorkspaceError('내보내기 형식을 확인해 주세요.');
  const tables = await exportTables(uid, includeSensitive), stamp = seoulDate(Date.now());
  await audit(uid, 'workspace.export', {format, includeSensitive, items: tables.kept.length});
  await logWorkspaceEvent(uid, 'workspace.exported', {collection: 'teacherWorkspaces', id: uid});
  if (format === 'csv') {
    const type = params.get('type') ?? 'items', csv = type === 'calendar' ? tables.calendarCsv : type === 'lessons' ? tables.lessonCsv : type === 'items' ? tables.itemCsv : null;
    if (csv === null) throw new WorkspaceError('내보낼 표를 확인해 주세요.');
    const name = {calendar: '일정', lessons: '수업일지', items: '업무항목'}[type as 'calendar' | 'lessons' | 'items'];
    return new NextResponse(csv, {headers: {'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${name}-${stamp}.csv`)}`, 'Cache-Control': 'private, no-store'}});
  }
  const withFiles = tables.kept.filter(item => item.file);
  const total = withFiles.reduce((sum, item) => sum + (item.file?.size ?? 0), 0);
  if (total > ZIP_MAX_BYTES) throw new WorkspaceError('파일이 1.5GB를 넘어요. 폴더별로 나눠 내려받아 주세요.', 413, 'EXPORT_TOO_LARGE');
  const paths = new Map((await db().getAll(...withFiles.map(item => fileRef(item.file!.fileId)))).map(doc => [doc.id, doc.data()?.path as string | undefined]));
  const attachments = await Promise.all(withFiles.flatMap(item => {
    const path = paths.get(item.file!.fileId);
    return path ? [stableReadUrl(path).then(url => ({name: `파일/${safeFileName(tables.folderNames.get(item.folderId) ?? '폴더')}/${safeFileName(item.title)}-${safeFileName(item.file!.fileName)}`, url, size: item.file!.size}))] : [];
  }));
  return json({zipName: `업무공간-${stamp}.zip`, tables: {'일정.csv': tables.calendarCsv, '수업일지.csv': tables.lessonCsv, '업무항목.csv': tables.itemCsv}, attachments});
}

export async function handleWorkspace(request: Request, segments: string[]) {
  try {
    const method = request.method, [head, id, action, sub] = segments;
    if (method !== 'GET') assertOrigin(request);
    if (head === 'status' && segments.length === 1 && method === 'GET') {
      const ctx = await getContext(request);
      return json({available: workspaceAllowed(ctx.role, process.env.TEACHER_WORKSPACE_DISABLED)});
    }
    const {uid} = await teacher(request), params = new URL(request.url).searchParams;
    if (head === 'calendar') {
      if (segments.length === 1 && method === 'GET') return json(await listCalendar(uid, params.get('from'), params.get('to')));
      if (segments.length === 1 && method === 'POST') return json({event: await createCalendarEvent(uid, calendarInput(await input(request)), 'form')}, 201);
      if (segments.length === 2 && id === 'import' && method === 'POST') return json(await importCalendar(uid, await input(request, 2_500_000)));
      const eventId = pathId(id, '일정');
      if (segments.length === 2 && method === 'POST') return json(await updateCalendarEvent(uid, eventId, await input(request)));
      if (segments.length === 2 && method === 'DELETE') return json(await removeDoc(uid, calendar(uid).doc(eventId), '일정', 'calendar.deleted', 'calendar'));
      if (segments.length === 3 && action === 'confirm' && method === 'POST') return json(await confirm(uid, calendar(uid).doc(eventId), '일정', 'calendar.confirmed', 'calendar'));
    }
    if (head === 'timetable' && segments.length === 2) {
      if (method === 'GET') return json(await getTimetable(uid, id));
      if (method === 'POST') return json(await saveTimetable(uid, id, await input(request)));
    }
    if (head === 'lessons') {
      if (segments.length === 1 && method === 'GET') return json(await listLessons(uid, params.get('from'), params.get('to')));
      if (segments.length === 2 && method === 'POST') return json(await saveLessons(uid, id, await input(request)));
      if (segments.length === 3 && action === 'confirm' && method === 'POST') return json(await confirmLessons(uid, id));
    }
    if (head === 'folders') {
      if (segments.length === 1 && method === 'GET') return json(await listFolders(uid));
      if (segments.length === 1 && method === 'POST') return json(await createFolder(uid, await input(request)), 201);
      const folderId = pathId(id, '폴더');
      if (segments.length === 2 && method === 'POST') return json(await updateFolder(uid, folderId, await input(request)));
      if (segments.length === 2 && method === 'DELETE') return json(await deleteFolder(uid, folderId));
    }
    if (head === 'items') {
      if (segments.length === 1 && method === 'GET') {
        const folderId = params.get('folderId') ? safeId(params.get('folderId'), '폴더') : null, dueBefore = params.get('dueBefore') ? isoDate(params.get('dueBefore'), '기한') : null;
        const kind = params.get('folderKind');
        if (kind && !FOLDER_KINDS.includes(kind as FolderKind)) throw new WorkspaceError('폴더 종류를 확인해 주세요.');
        return json({items: await listItems(uid, {folderId, q: (params.get('q') ?? '').slice(0, 100), dueBefore, folderKind: kind as FolderKind | null})});
      }
      if (segments.length === 1 && method === 'POST') return json({item: await createWorkItem(uid, itemInput(await input(request)), 'form')}, 201);
      const itemId = pathId(id, '항목');
      if (segments.length === 2 && method === 'GET') return json({item: await getItem(uid, itemId)});
      if (segments.length === 2 && method === 'POST') return json(await updateWorkItem(uid, itemId, await input(request)));
      if (segments.length === 2 && method === 'DELETE') return json(await deleteWorkItem(uid, itemId));
      if (segments.length === 3 && action === 'confirm' && method === 'POST') return json(await confirm(uid, items(uid).doc(itemId), '항목', 'item.confirmed', 'items'));
      if (action === 'file') {
        if (segments.length === 3 && method === 'GET') return json(await fileLink(uid, itemId));
        if (segments.length === 3 && method === 'POST') return json(await reserveFile(uid, itemId, await input(request), new URL(request.url).origin), 201);
        const fileId = pathId(sub, '파일');
        if (segments.length === 4 && method === 'POST') return json(await finalizeFile(uid, itemId, fileId));
        if (segments.length === 4 && method === 'DELETE') {await removeStaged(uid, fileId); return json({ok: true});}
      }
    }
    if (head === 'export' && segments.length === 1 && method === 'GET') return await exportWorkspace(uid, params);
    return json({error: '찾을 수 없어요.', code: 'NOT_FOUND'}, 404);
  } catch (error) {
    if (error instanceof ApiError || error instanceof WorkspaceError || error instanceof NotebookError) return json({error: error.message, code: error.code}, error.status);
    console.error('Teacher workspace failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
