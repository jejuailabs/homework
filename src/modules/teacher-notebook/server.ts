import 'server-only';
import {randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {NextResponse} from 'next/server';
import {auth, db} from '@/lib/server/admin';
import {assertOrigin, getContext, type Context} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {accessConfig, afterFailure, blockedFor, entryInput, minutesLabel, monthRange, notebookAllowed, notebookDate, NotebookError, MAX_REPORT_ENTRIES, passwordInput, passwordLock, recentAuthentication, reportRange, studentKey, todoInput, unlockToken, verifyUnlock, UNLOCK_SECONDS} from './policy';
import {notebookKeys, openBody, openEnvelope, sealBody, sealEnvelope} from './vault';
import {logWorkspaceEvent} from '@/modules/teacher-workspace/event-log';
import {workspaceOpenFor} from '@/modules/teacher-workspace/server';
import {attachmentTexts} from '@/modules/attachments/server';
import {NOTEBOOK_TAGS, type NotebookAccessConfig, type NotebookDaySummary, type NotebookEntry, type NotebookFile, type NotebookRosterClass, type NotebookStudentRef, type NotebookTag, type NotebookTodo} from './types';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, length: number, options: {N: number; r: number; p: number}) => Promise<Buffer>;
const SCRYPT = {N: 16384, r: 8, p: 1};
const hashPassword = async (password: string, salt: Buffer) => (await scryptAsync(password.normalize('NFC'), salt, 32, SCRYPT)).toString('base64url');

type Input = Record<string, unknown>;
type Stored = {date: string; body: unknown; students: NotebookStudentRef[]; studentKeys: string[]; classIds: string[]; tags: NotebookTag[]; sensitive: boolean; length: number; createdAt: string; updatedAt: string; source?: string; pending?: boolean; files?: NotebookFile[]};
const MAX_ENTRY_FILES = 5;
/** Files named in a save: only the teacher's own finished attachments. Undefined leaves the record's files as they are. */
async function entryFiles(uid: string, value: unknown): Promise<NotebookFile[] | undefined> {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ENTRY_FILES || !value.every(id => typeof id === 'string' && /^[A-Za-z0-9]{12,40}$/.test(id))) throw new NotebookError(`파일은 기록 하나에 ${MAX_ENTRY_FILES}개까지 붙일 수 있어요.`);
  if (!value.length) return [];
  try {return (await attachmentTexts(uid, value, MAX_ENTRY_FILES)).map(file => ({id: file.id, name: file.name}));}
  catch (error) {throw new NotebookError(error instanceof Error ? error.message : '붙인 파일을 확인해 주세요.');}
}
const UNLOCK_COOKIE = '__notebook_unlock', COOKIE_PATH = '/api/teacher-notebook';
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const now = () => new Date().toISOString();
const seconds = () => Math.floor(Date.now() / 1000);
const notebook = (uid: string) => db().doc(`teacherNotebooks/${uid}`);
const entries = (uid: string) => notebook(uid).collection('entries');
const todos = (uid: string) => notebook(uid).collection('todos');
const sealTodo = (text: string, uid: string, id: string) => sealEnvelope(notebookKeys().body, ['teacher-notebook-todo', uid, id], text);
const openTodo = (envelope: unknown, uid: string, id: string) => openEnvelope(notebookKeys().body, ['teacher-notebook-todo', uid, id], envelope);
const accessRef = () => db().doc('featureAccess/teacherNotebook');

let cachedAccess: {at: number; value: NotebookAccessConfig} | undefined;
async function access(): Promise<NotebookAccessConfig> {
  if (cachedAccess && Date.now() - cachedAccess.at < 60_000) return cachedAccess.value;
  const value = accessConfig((await accessRef().get()).data());
  cachedAccess = {at: Date.now(), value};
  return value;
}
async function input(request: Request): Promise<Input> {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 20_000) throw new NotebookError('입력 내용이 너무 커요.');
  try {const data = JSON.parse(raw); if (data && typeof data === 'object' && !Array.isArray(data)) return data;} catch {}
  throw new NotebookError('입력 내용을 확인해 주세요.');
}
function cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
  return raw ? decodeURIComponent(raw) : undefined;
}
function setUnlockCookie(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(UNLOCK_COOKIE, value, {httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: COOKIE_PATH, maxAge});
  return response;
}
async function audit(uid: string, action: string, target: string | null = null, details: Input = {}) {
  await notebook(uid).collection('audit').add({action, target, details, at: now()});
}
/** For the Berry connector: the notebook pilot gate applies to chat writes too. */
export async function notebookAvailableFor(uid: string, role: string) {return notebookAllowed(await access(), uid, role, process.env.TEACHER_NOTEBOOK_DISABLED);}
async function teacher(request: Request) {
  const ctx = await getContext(request);
  if (!workspaceOpenFor(ctx) || !notebookAllowed(await access(), ctx.uid, ctx.role, process.env.TEACHER_NOTEBOOK_DISABLED)) throw new NotebookError('교무수첩을 아직 사용할 수 없어요.', 403, 'NOTEBOOK_NOT_ENABLED');
  return ctx;
}
function unlocked(request: Request, ctx: Context) {
  const expires = verifyUnlock(notebookKeys().unlock, cookie(request, UNLOCK_COOKIE), ctx.uid, seconds());
  if (!expires) throw new NotebookError('안전을 위해 교무수첩을 다시 열어 주세요.', 401, 'NOTEBOOK_LOCKED');
  return expires;
}

async function roster(uid: string): Promise<NotebookRosterClass[]> {
  const classes = (await db().collection('classes').where('ownerUid', '==', uid).get()).docs.filter(doc => doc.data().adminStatus !== 'archived');
  const students = await Promise.all(classes.map(doc => doc.ref.collection('students').get()));
  return classes.map((doc, index) => ({id: doc.id, name: String(doc.data().name ?? ''), students: students[index].docs.filter(s => !s.data().disabled).map(s => ({id: s.id, name: String(s.data().name ?? ''), number: Number(s.data().number) || 0})).sort((a, b) => a.number - b.number || a.name.localeCompare(b.name))}))
    .sort((a, b) => a.name.localeCompare(b.name));
}
/** Every linked student must belong to a class this teacher owns. */
async function assertOwnStudents(uid: string, refs: NotebookStudentRef[]) {
  if (!refs.length) return;
  const classIds = [...new Set(refs.map(ref => ref.classId))];
  const classes = await db().getAll(...classIds.map(id => db().doc(`classes/${id}`)));
  if (classes.some(doc => !doc.exists || doc.data()?.ownerUid !== uid)) throw new NotebookError('우리 반 학생만 연결할 수 있어요.', 403, 'FORBIDDEN');
  const students = await db().getAll(...refs.map(ref => db().doc(`classes/${ref.classId}/students/${ref.studentId}`)));
  if (students.some(doc => !doc.exists)) throw new NotebookError('명단에 없는 학생이 있어요. 다시 선택해 주세요.', 400);
}
function publicEntry(uid: string, doc: FirebaseFirestore.DocumentSnapshot): NotebookEntry {
  const data = doc.data() as Stored, body = openBody(data.body, uid, doc.id);
  return {id: doc.id, date: data.date, body: body ?? '(이 기록을 열지 못했어요.)', students: data.students ?? [], tags: (data.tags ?? []).filter(tag => NOTEBOOK_TAGS.includes(tag)), sensitive: !!data.sensitive, createdAt: data.createdAt, updatedAt: data.updatedAt, ...(data.pending ? {pending: true} : {}), ...(data.source === 'chat' ? {source: 'chat' as const} : {}), ...(Array.isArray(data.files) && data.files.length ? {files: data.files} : {})};
}
function stored(uid: string, entryId: string, value: ReturnType<typeof entryInput>, createdAt: string): Stored {
  return {date: value.date, body: sealBody(value.body, uid, entryId), students: value.students, studentKeys: value.students.map(studentKey), classIds: [...new Set(value.students.map(ref => ref.classId))], tags: value.tags, sensitive: value.sensitive, length: value.body.length, createdAt, updatedAt: now()};
}

async function month(uid: string, value: unknown) {
  const range = monthRange(value);
  const [snap, due] = await Promise.all([
    entries(uid).where('date', '>=', range.from).where('date', '<=', range.to).select('date', 'studentKeys', 'sensitive').limit(5000).get(),
    todos(uid).where('due', '>=', range.from).where('due', '<=', range.to).select('due', 'done').limit(2000).get(),
  ]);
  const days: Record<string, NotebookDaySummary & {keys: Set<string>}> = {};
  const dayOf = (date: string) => days[date] ??= {entries: 0, students: 0, sensitive: 0, todos: 0, keys: new Set()};
  for (const doc of snap.docs) {
    const data = doc.data(), day = dayOf(data.date);
    day.entries++; if (data.sensitive) day.sensitive++;
    for (const key of data.studentKeys ?? []) day.keys.add(key);
  }
  for (const doc of due.docs) if (!doc.data().done) dayOf(doc.data().due).todos!++;
  return {month: value, days: Object.fromEntries(Object.entries(days).map(([date, {keys, ...day}]) => [date, {...day, students: keys.size}]))};
}
async function day(uid: string, value: unknown) {
  const date = notebookDate(value), snap = await entries(uid).where('date', '==', date).limit(500).get();
  return {date, entries: snap.docs.map(doc => publicEntry(uid, doc)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))};
}
async function create(uid: string, data: Input) {
  const value = entryInput(data), files = await entryFiles(uid, data.attachmentIds);
  await assertOwnStudents(uid, value.students);
  const ref = entries(uid).doc(), at = now();
  await notebook(uid).set({updatedAt: at}, {merge: true});
  await ref.create({...stored(uid, ref.id, value, at), ...(files?.length ? {files} : {})});
  await audit(uid, 'entry.create', ref.id, {date: value.date, students: value.students.length, sensitive: value.sensitive});
  return {entry: publicEntry(uid, await ref.get())};
}
/** A chat-made entry (Berry). The teacher already approved it on Berry's card, so it is saved as a finished record marked "베리". */
export async function createChatEntry(uid: string, value: ReturnType<typeof entryInput>) {
  await assertOwnStudents(uid, value.students);
  const ref = entries(uid).doc(), at = now();
  await notebook(uid).set({updatedAt: at}, {merge: true});
  await ref.create({...stored(uid, ref.id, value, at), source: 'chat', pending: false});
  await audit(uid, 'entry.create', ref.id, {date: value.date, students: value.students.length, sensitive: value.sensitive, source: 'chat'});
  await logWorkspaceEvent(uid, 'notebook.created', {collection: 'notebook', id: ref.id}, {sensitive: value.sensitive});
  return ref.id;
}
async function confirmEntry(uid: string, entryId: string) {
  const ref = entries(uid).doc(entryId), doc = await ref.get();
  if (!doc.exists) throw new NotebookError('기록을 찾을 수 없어요.', 404, 'NOT_FOUND');
  await ref.update({pending: false});
  await audit(uid, 'entry.confirm', entryId);
  await logWorkspaceEvent(uid, 'notebook.confirmed', {collection: 'notebook', id: entryId}, {sensitive: !!doc.data()!.sensitive});
  return {entry: publicEntry(uid, await ref.get())};
}
async function update(uid: string, entryId: string, data: Input) {
  const value = entryInput(data), ref = entries(uid).doc(entryId), previous = await ref.get();
  if (!previous.exists) throw new NotebookError('기록을 찾을 수 없어요.', 404, 'NOT_FOUND');
  await assertOwnStudents(uid, value.students);
  // Editing a Berry record keeps its "베리" mark; saving it in the notebook also counts as confirming it.
  const old = previous.data() as Stored, files = await entryFiles(uid, data.attachmentIds) ?? old.files ?? [];
  await ref.set({...stored(uid, ref.id, value, old.createdAt), ...(old.source === 'chat' ? {source: 'chat', pending: false} : {}), ...(files.length ? {files} : {})});
  await audit(uid, 'entry.update', ref.id, {date: value.date, students: value.students.length, sensitive: value.sensitive});
  return {entry: publicEntry(uid, await ref.get())};
}
async function remove(uid: string, entryId: string) {
  const ref = entries(uid).doc(entryId);
  if (!(await ref.get()).exists) throw new NotebookError('기록을 찾을 수 없어요.', 404, 'NOT_FOUND');
  await ref.delete();
  await audit(uid, 'entry.delete', entryId);
  return {ok: true};
}
async function report(uid: string, params: URLSearchParams) {
  const range = reportRange(params.get('from'), params.get('to')), includeSensitive = params.get('includeSensitive') === '1';
  const classId = params.get('classId') || '', student = params.get('student') || '';
  const tags = (params.get('tags') || '').split(',').filter(Boolean);
  if (!tags.every(tag => NOTEBOOK_TAGS.includes(tag as NotebookTag))) throw new NotebookError('분류를 확인해 주세요.');
  const snap = await entries(uid).where('date', '>=', range.from).where('date', '<=', range.to).orderBy('date').limit(MAX_REPORT_ENTRIES + 1).get();
  if (snap.size > MAX_REPORT_ENTRIES) throw new NotebookError('기록이 너무 많아요. 기간을 줄여 주세요.');
  // Filter before opening so excluded bodies are never decrypted.
  const docs = snap.docs.filter(doc => {
    const data = doc.data() as Stored;
    if (!includeSensitive && data.sensitive) return false;
    if (classId && !(data.classIds ?? []).includes(classId)) return false;
    if (student && !(data.studentKeys ?? []).includes(student)) return false;
    return !tags.length || (data.tags ?? []).some(tag => tags.includes(tag));
  });
  const list = docs.map(doc => publicEntry(uid, doc)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  await audit(uid, 'report.build', null, {from: range.from, to: range.to, classId: classId || null, student: student ? 'selected' : null, includeSensitive, entries: list.length});
  return {...range, includeSensitive, entries: list, roster: await roster(uid)};
}
async function auditLog(uid: string) {
  const snap = await notebook(uid).collection('audit').orderBy('at', 'desc').limit(50).get();
  return {events: snap.docs.map(doc => ({id: doc.id, ...doc.data()}))};
}
function opened(uid: string) {
  const token = unlockToken(notebookKeys().unlock, uid, seconds());
  return setUnlockCookie(json({unlocked: true, expiresAt: token.expires * 1000}), token.value, UNLOCK_SECONDS);
}
/** Opens the notebook with its own password. Five wrong tries in a row block tries for ten minutes. */
async function unlock(request: Request, ctx: Context) {
  const data = await input(request);
  if (typeof data.password !== 'string' || !data.password || data.password.length > 200) throw new NotebookError('비밀번호를 입력해 주세요.');
  const ref = notebook(ctx.uid), lock = passwordLock((await ref.get()).data()?.lock);
  if (!lock) throw new NotebookError('먼저 교무수첩 비밀번호를 정해 주세요.', 409, 'PASSWORD_NOT_SET');
  const wait = blockedFor(lock, seconds());
  if (wait) throw new NotebookError(`비밀번호를 여러 번 틀렸어요. ${minutesLabel(wait)} 뒤에 다시 시도해 주세요.`, 429, 'PASSWORD_BLOCKED');
  const expected = Buffer.from(lock.hash, 'base64url'), actual = Buffer.from(await hashPassword(data.password, Buffer.from(lock.salt, 'base64url')), 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    const next = afterFailure(lock, seconds());
    await ref.set({lock: next}, {merge: true});
    await audit(ctx.uid, 'notebook.unlock_failed', null, {blocked: next.blockedUntil > 0});
    throw new NotebookError(next.blockedUntil ? '비밀번호를 5번 틀려서 10분 동안 열 수 없어요.' : `비밀번호가 맞지 않아요. (${next.failures}/5)`, 401, next.blockedUntil ? 'PASSWORD_BLOCKED' : 'PASSWORD_WRONG');
  }
  if (lock.failures || lock.blockedUntil) await ref.set({lock: {failures: 0, blockedUntil: 0}}, {merge: true});
  await audit(ctx.uid, 'notebook.unlock');
  return opened(ctx.uid);
}
/** Sets (first time) or resets (forgotten) the notebook password. Both need a fresh Google sign-in check. */
async function setPassword(request: Request, ctx: Context) {
  const data = await input(request), password = passwordInput(data.password);
  if (typeof data.idToken !== 'string' || data.idToken.length > 16_000) throw new NotebookError('로그인 정보를 확인해 주세요.');
  const decoded = await auth().verifyIdToken(data.idToken, true).catch(() => {throw new NotebookError('Google 계정을 다시 확인해 주세요.', 401, 'REAUTH_FAILED');});
  if (decoded.uid !== ctx.uid) throw new NotebookError('지금 로그인한 계정으로 다시 확인해 주세요.', 403, 'REAUTH_MISMATCH');
  if (!recentAuthentication(decoded.auth_time, seconds())) throw new NotebookError('안전을 위해 Google 계정을 다시 확인해 주세요.', 401, 'RECENT_LOGIN_REQUIRED');
  const ref = notebook(ctx.uid), had = !!passwordLock((await ref.get()).data()?.lock), salt = randomBytes(16);
  await ref.set({lock: {salt: salt.toString('base64url'), hash: await hashPassword(password, salt), failures: 0, blockedUntil: 0, updatedAt: now()}, updatedAt: now()}, {merge: true});
  await audit(ctx.uid, had ? 'password.reset' : 'password.set');
  return opened(ctx.uid);
}

// ---- To-dos: short notes to self, sealed like entries ----
function publicTodo(uid: string, doc: FirebaseFirestore.DocumentSnapshot): NotebookTodo {
  const data = doc.data()!;
  return {id: doc.id, text: openTodo(data.text, uid, doc.id) ?? '(이 할 일을 열지 못했어요.)', due: data.due ?? null, done: !!data.done, createdAt: data.createdAt};
}
async function listTodos(uid: string) {
  const snap = await todos(uid).orderBy('createdAt', 'desc').limit(300).get();
  return {todos: snap.docs.map(doc => publicTodo(uid, doc))};
}
async function saveTodo(uid: string, id: string | null, data: Input) {
  const value = todoInput(data), ref = id ? todos(uid).doc(id) : todos(uid).doc();
  const previous = id ? await ref.get() : null;
  if (id && !previous!.exists) throw new NotebookError('할 일을 찾을 수 없어요.', 404, 'NOT_FOUND');
  if (!id && (await todos(uid).where('done', '==', false).count().get()).data().count >= 500) throw new NotebookError('끝나지 않은 할 일이 너무 많아요. 끝낸 일을 체크해 주세요.');
  const at = now();
  await ref.set({text: sealTodo(value.text, uid, ref.id), due: value.due, done: value.done, createdAt: previous?.data()?.createdAt ?? at, updatedAt: at});
  await audit(uid, id ? 'todo.update' : 'todo.create', ref.id);
  return {todo: publicTodo(uid, await ref.get())};
}
async function removeTodo(uid: string, id: string) {
  const ref = todos(uid).doc(id);
  if (!(await ref.get()).exists) throw new NotebookError('할 일을 찾을 수 없어요.', 404, 'NOT_FOUND');
  await ref.delete();
  await audit(uid, 'todo.delete', id);
  return {ok: true};
}
async function adminAccess(request: Request, ctx: Context) {
  if (ctx.role !== 'superadmin') throw new ApiError(403, '최고 운영자만 바꿀 수 있어요.', 'FORBIDDEN');
  if (request.method === 'GET') return json(await access());
  const data = await input(request), mode = data.mode;
  if (mode !== 'off' && mode !== 'allowlist' && mode !== 'all') throw new NotebookError('공개 범위를 확인해 주세요.');
  const emails = Array.isArray(data.teacherEmails) ? data.teacherEmails.filter((v): v is string => typeof v === 'string').map(v => v.trim().toLowerCase()).filter(Boolean).slice(0, 200) : [];
  const users = await Promise.all(emails.map(email => auth().getUserByEmail(email).then(user => user.uid, () => {throw new NotebookError(`${email} 계정을 찾지 못했어요.`, 404, 'NOT_FOUND');})));
  const value: NotebookAccessConfig = {mode, teacherUids: mode === 'allowlist' ? [...new Set(users)] : []};
  await accessRef().set({...value, updatedAt: now(), updatedBy: ctx.uid});
  await db().collection('adminAudit').add({actorUid: ctx.uid, action: 'teacher-notebook.access', target: mode, details: {teachers: value.teacherUids.length}, kind: 'change', outcome: 'success', createdAt: now()});
  cachedAccess = {at: Date.now(), value};
  return json(value);
}

export async function handleNotebook(request: Request, segments: string[]) {
  try {
    const path = segments.join('/'), method = request.method;
    if (method !== 'GET') assertOrigin(request);
    if (path === 'admin/access') return await adminAccess(request, await getContext(request));
    if (path === 'status' && method === 'GET') {
      const ctx = await getContext(request), available = workspaceOpenFor(ctx) && notebookAllowed(await access(), ctx.uid, ctx.role, process.env.TEACHER_NOTEBOOK_DISABLED);
      let expires: number | null = null, hasPassword = false;
      if (available) {
        try {expires = verifyUnlock(notebookKeys().unlock, cookie(request, UNLOCK_COOKIE), ctx.uid, seconds());} catch {}
        hasPassword = !!passwordLock((await notebook(ctx.uid).get()).data()?.lock);
      }
      return json({available, unlocked: !!expires, expiresAt: expires ? expires * 1000 : null, hasPassword});
    }
    const ctx = await teacher(request);
    if (path === 'unlock' && method === 'POST') return await unlock(request, ctx);
    if (path === 'password' && method === 'POST') return await setPassword(request, ctx);
    if (path === 'lock' && method === 'POST') {await audit(ctx.uid, 'notebook.lock'); return setUnlockCookie(json({unlocked: false}), '', 0);}
    // To-dos sit on the workspace home beside the calendar, so the teacher's sign-in opens them. Records stay behind the notebook lock.
    if (segments[0] === 'todos') {
      if (method === 'GET' && segments.length === 1) return json(await listTodos(ctx.uid));
      if (method === 'POST' && segments.length === 1) return json(await saveTodo(ctx.uid, null, await input(request)), 201);
      const todoId = segments[1] ?? '';
      if (segments.length === 2 && /^[A-Za-z0-9]{1,40}$/.test(todoId)) {
        if (method === 'POST') return json(await saveTodo(ctx.uid, todoId, await input(request)));
        if (method === 'DELETE') return json(await removeTodo(ctx.uid, todoId));
      }
      return json({error: '찾을 수 없어요.', code: 'NOT_FOUND'}, 404);
    }
    const expires = unlocked(request, ctx), params = new URL(request.url).searchParams;
    if (method === 'GET') {
      if (path === 'roster') return json({classes: await roster(ctx.uid), expiresAt: expires * 1000});
      if (path === 'month') return json(await month(ctx.uid, params.get('month')));
      if (path === 'day') return json(await day(ctx.uid, params.get('date')));
      if (path === 'report') return json(await report(ctx.uid, params));
      if (path === 'audit') return json(await auditLog(ctx.uid));
    }
    if (segments[0] === 'entries') {
      if (method === 'POST' && segments.length === 1) return json(await create(ctx.uid, await input(request)), 201);
      const entryId = segments[1] ?? '';
      if (segments.length === 3 && segments[2] === 'confirm' && method === 'POST' && /^[A-Za-z0-9]{1,40}$/.test(entryId)) return json(await confirmEntry(ctx.uid, entryId));
      if (segments.length === 2 && /^[A-Za-z0-9]{1,40}$/.test(entryId)) {
        if (method === 'POST') return json(await update(ctx.uid, entryId, await input(request)));
        if (method === 'DELETE') return json(await remove(ctx.uid, entryId));
      }
    }
    return json({error: '찾을 수 없어요.', code: 'NOT_FOUND'}, 404);
  } catch (error) {
    if (error instanceof ApiError || error instanceof NotebookError) return json({error: error.message, code: error.code}, error.status);
    console.error('Teacher notebook failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
