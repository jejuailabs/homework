import 'server-only';
import {NextResponse} from 'next/server';
import {auth, db} from '@/lib/server/admin';
import {assertOrigin, getContext, type Context} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {accessConfig, entryInput, monthRange, notebookAllowed, notebookDate, NotebookError, MAX_REPORT_ENTRIES, recentAuthentication, reportRange, studentKey, unlockToken, verifyUnlock, UNLOCK_SECONDS} from './policy';
import {notebookKeys, openBody, sealBody} from './vault';
import {NOTEBOOK_TAGS, type NotebookAccessConfig, type NotebookDaySummary, type NotebookEntry, type NotebookRosterClass, type NotebookStudentRef, type NotebookTag} from './types';

type Input = Record<string, unknown>;
type Stored = {date: string; body: unknown; students: NotebookStudentRef[]; studentKeys: string[]; classIds: string[]; tags: NotebookTag[]; sensitive: boolean; length: number; createdAt: string; updatedAt: string};
const UNLOCK_COOKIE = '__notebook_unlock', COOKIE_PATH = '/api/teacher-notebook';
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const now = () => new Date().toISOString();
const seconds = () => Math.floor(Date.now() / 1000);
const notebook = (uid: string) => db().doc(`teacherNotebooks/${uid}`);
const entries = (uid: string) => notebook(uid).collection('entries');
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
async function teacher(request: Request) {
  const ctx = await getContext(request);
  if (!notebookAllowed(await access(), ctx.uid, ctx.role, process.env.TEACHER_NOTEBOOK_DISABLED)) throw new NotebookError('교무수첩을 아직 사용할 수 없어요.', 403, 'NOTEBOOK_NOT_ENABLED');
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
  return {id: doc.id, date: data.date, body: body ?? '(이 기록을 열지 못했어요.)', students: data.students ?? [], tags: (data.tags ?? []).filter(tag => NOTEBOOK_TAGS.includes(tag)), sensitive: !!data.sensitive, createdAt: data.createdAt, updatedAt: data.updatedAt};
}
function stored(uid: string, entryId: string, value: ReturnType<typeof entryInput>, createdAt: string): Stored {
  return {date: value.date, body: sealBody(value.body, uid, entryId), students: value.students, studentKeys: value.students.map(studentKey), classIds: [...new Set(value.students.map(ref => ref.classId))], tags: value.tags, sensitive: value.sensitive, length: value.body.length, createdAt, updatedAt: now()};
}

async function month(uid: string, value: unknown) {
  const range = monthRange(value);
  const snap = await entries(uid).where('date', '>=', range.from).where('date', '<=', range.to).select('date', 'studentKeys', 'sensitive').limit(5000).get();
  const days: Record<string, NotebookDaySummary & {keys: Set<string>}> = {};
  for (const doc of snap.docs) {
    const data = doc.data(), day = days[data.date] ??= {entries: 0, students: 0, sensitive: 0, keys: new Set()};
    day.entries++; if (data.sensitive) day.sensitive++;
    for (const key of data.studentKeys ?? []) day.keys.add(key);
  }
  return {month: value, days: Object.fromEntries(Object.entries(days).map(([date, {keys, ...day}]) => [date, {...day, students: keys.size}]))};
}
async function day(uid: string, value: unknown) {
  const date = notebookDate(value), snap = await entries(uid).where('date', '==', date).limit(500).get();
  return {date, entries: snap.docs.map(doc => publicEntry(uid, doc)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))};
}
async function create(uid: string, data: Input) {
  const value = entryInput(data);
  await assertOwnStudents(uid, value.students);
  const ref = entries(uid).doc(), at = now();
  await notebook(uid).set({updatedAt: at}, {merge: true});
  await ref.create(stored(uid, ref.id, value, at));
  await audit(uid, 'entry.create', ref.id, {date: value.date, students: value.students.length, sensitive: value.sensitive});
  return {entry: publicEntry(uid, await ref.get())};
}
async function update(uid: string, entryId: string, data: Input) {
  const value = entryInput(data), ref = entries(uid).doc(entryId), previous = await ref.get();
  if (!previous.exists) throw new NotebookError('기록을 찾을 수 없어요.', 404, 'NOT_FOUND');
  await assertOwnStudents(uid, value.students);
  await ref.set(stored(uid, ref.id, value, (previous.data() as Stored).createdAt));
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
async function unlock(request: Request, ctx: Context) {
  const data = await input(request);
  if (typeof data.idToken !== 'string' || data.idToken.length > 16_000) throw new NotebookError('로그인 정보를 확인해 주세요.');
  const decoded = await auth().verifyIdToken(data.idToken, true).catch(() => {throw new NotebookError('Google 계정을 다시 확인해 주세요.', 401, 'REAUTH_FAILED');});
  if (decoded.uid !== ctx.uid) throw new NotebookError('지금 로그인한 계정으로 다시 확인해 주세요.', 403, 'REAUTH_MISMATCH');
  if (!recentAuthentication(decoded.auth_time, seconds())) throw new NotebookError('안전을 위해 Google 계정을 다시 확인해 주세요.', 401, 'RECENT_LOGIN_REQUIRED');
  const token = unlockToken(notebookKeys().unlock, ctx.uid, seconds());
  await audit(ctx.uid, 'notebook.unlock');
  return setUnlockCookie(json({unlocked: true, expiresAt: token.expires * 1000}), token.value, UNLOCK_SECONDS);
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
      const ctx = await getContext(request), available = notebookAllowed(await access(), ctx.uid, ctx.role, process.env.TEACHER_NOTEBOOK_DISABLED);
      let expires: number | null = null;
      if (available) try {expires = verifyUnlock(notebookKeys().unlock, cookie(request, UNLOCK_COOKIE), ctx.uid, seconds());} catch {}
      return json({available, unlocked: !!expires, expiresAt: expires ? expires * 1000 : null});
    }
    const ctx = await teacher(request);
    if (path === 'unlock' && method === 'POST') return await unlock(request, ctx);
    if (path === 'lock' && method === 'POST') {await audit(ctx.uid, 'notebook.lock'); return setUnlockCookie(json({unlocked: false}), '', 0);}
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
