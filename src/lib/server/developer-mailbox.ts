import 'server-only';
import {createHash} from 'node:crypto';
import {FieldPath} from 'firebase-admin/firestore';
import {db} from './admin';
import {assertOrigin, getContext, type Context} from './auth';
import {ApiError, id, isAdmin, text} from './policy';
import {mailboxLimits, mailboxStatuses, type MailboxAuthor} from '../developer-mailbox';

const headers = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff'};
const json = (value: unknown, status = 200) => Response.json(value, {status, headers});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const letters = () => db().collection('developerMailbox');

async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 16_000) throw new ApiError(413, '편지 내용이 너무 길어요.');
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value as Record<string, unknown>;
  } catch {throw new ApiError(400, '입력 내용을 확인해 주세요.');}
}

async function authorFor(ctx: Context): Promise<MailboxAuthor> {
  if (ctx.role !== 'student') return {uid: ctx.uid, role: ctx.role, name: ctx.displayName || '선생님', classId: '', className: '', studentId: ''};
  const [student, classroom] = await Promise.all([
    db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`).get(),
    db().doc(`classes/${ctx.classId}`).get(),
  ]);
  if (!student.exists || student.data()?.authUid !== ctx.uid || student.data()?.disabled || !classroom.exists) throw new ApiError(403, '학생 계정을 다시 확인해 주세요.');
  return {uid: ctx.uid, role: ctx.role, name: student.data()?.name || '학생', classId: ctx.classId!, className: classroom.data()?.name || '', studentId: ctx.studentId!};
}

async function send(ctx: Context, input: Record<string, unknown>) {
  const title = text(input.title, '제목', mailboxLimits.title);
  const message = text(input.message, '메시지', mailboxLimits.message);
  const requestId = text(input.requestId, '편지 번호', 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new ApiError(400, '편지 번호를 다시 확인해 주세요.');
  const author = await authorFor(ctx); // Never accept the name, role, or UID from the browser.
  const fingerprint = hash(JSON.stringify([title, message]));
  const ref = letters().doc(hash(`${ctx.uid}:${requestId}`));
  const limit = db().doc(`developerMailboxLimits/${hash(ctx.uid)}`);
  const now = Date.now(), createdAt = new Date(now).toISOString();
  const day = new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
  return db().runTransaction(async tx => {
    const [previous, usage] = await Promise.all([tx.get(ref), tx.get(limit)]);
    if (previous.exists) {
      if (previous.data()?.fingerprint !== fingerprint) throw new ApiError(409, '내용이 달라졌어요. 작성창을 다시 열어 주세요.');
      return {ok: true, id: ref.id};
    }
    const current = usage.data(), count = current?.day === day ? Number(current.count) || 0 : 0;
    if (count >= mailboxLimits.daily) throw new ApiError(429, '오늘은 편지를 충분히 보내주셨어요. 내일 다시 보내주세요.');
    if (current?.lastAt && now - current.lastAt < mailboxLimits.cooldownMs) throw new ApiError(429, '편지를 너무 빠르게 보내고 있어요. 30초 뒤에 다시 보내주세요.');
    tx.create(ref, {title, message, author, fingerprint, status: 'new', adminNote: '', createdAt, updatedAt: createdAt});
    tx.set(limit, {day, count: count + 1, lastAt: now});
    return {ok: true, id: ref.id};
  });
}

function summary(doc: FirebaseFirestore.DocumentSnapshot) {
  const v = doc.data()!;
  return {id: doc.id, title: v.title, author: v.author, status: v.status, createdAt: v.createdAt};
}

async function inbox(request: Request) {
  const params = new URL(request.url).searchParams;
  const newCount = (await letters().where('status', '==', 'new').count().get()).data().count;
  if (params.get('summary') === '1') return {newCount};
  let query = letters().orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  const raw = params.get('cursor');
  if (raw) {
    let cursor: {at: string; id: string};
    try {
      if (raw.length > 400) throw Error();
      cursor = JSON.parse(Buffer.from(raw, 'base64url').toString());
      if (!cursor || typeof cursor.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.at) || !/^[a-f0-9]{64}$/.test(cursor.id)) throw Error();
    } catch {throw new ApiError(400, '첫 페이지부터 다시 열어 주세요.');}
    query = query.startAfter(cursor.at, cursor.id);
  }
  const docs = (await query.limit(21).get()).docs;
  const items = docs.slice(0, 20), last = items.at(-1);
  return {items: items.map(summary), newCount, nextCursor: docs.length > 20 && last ? Buffer.from(JSON.stringify({at: last.data().createdAt, id: last.id})).toString('base64url') : null};
}

async function update(ctx: Context, letterId: string, input: Record<string, unknown>) {
  if (!mailboxStatuses.includes(input.status as typeof mailboxStatuses[number])) throw new ApiError(400, '처리 상태를 확인해 주세요.');
  const adminNote = text(input.adminNote, '관리자 메모', mailboxLimits.note, true);
  const ref = letters().doc(letterId);
  return db().runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new ApiError(404, '편지를 찾을 수 없어요.');
    if (input.version !== doc.updateTime!.valueOf()) throw new ApiError(409, '다른 화면에서 변경됐어요. 편지를 다시 열어 주세요.');
    const previous = doc.data()!;
    if (previous.status === input.status && previous.adminNote === adminNote) return {ok: true};
    const updatedAt = new Date().toISOString();
    tx.update(ref, {status: input.status, adminNote, updatedAt, updatedBy: ctx.uid});
    tx.create(db().collection('adminAudit').doc(), {actorUid: ctx.uid, action: 'mailbox.update', target: letterId, kind: 'change', outcome: 'success', createdAt: updatedAt, details: {before: {status: previous.status}, after: {status: input.status}, noteChanged: previous.adminNote !== adminNote}});
    return {ok: true};
  });
}

export async function handleDeveloperMailbox(request: Request, admin = false, path: string[] = []) {
  try {
    if (request.method !== 'GET') assertOrigin(request);
    const ctx = await getContext(request);
    if (admin && !isAdmin(ctx.role)) throw new ApiError(403, '운영자만 편지를 확인할 수 있어요.');
    if (!admin) {
      if (request.method !== 'POST') throw new ApiError(405, '편지 보내기에서 이용해 주세요.');
      return json(await send(ctx, await body(request)));
    }
    if (path.length > 1) throw new ApiError(404, '편지를 찾을 수 없어요.');
    if (!path.length && request.method === 'GET') return json(await inbox(request));
    const letterId = id(path[0], '편지');
    if (!/^[a-f0-9]{64}$/.test(letterId)) throw new ApiError(400, '편지 번호를 확인해 주세요.');
    if (request.method === 'GET') {
      const doc = await letters().doc(letterId).get();
      if (!doc.exists) throw new ApiError(404, '편지를 찾을 수 없어요.');
      const v = doc.data()!;
      return json({letter: {...summary(doc), message: v.message, adminNote: v.adminNote, version: doc.updateTime!.valueOf()}});
    }
    if (request.method === 'PATCH') return json(await update(ctx, letterId, await body(request)));
    throw new ApiError(405, '요청 방식을 확인해 주세요.');
  } catch (error) {
    return json({error: error instanceof ApiError ? error.message : '편지를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'}, error instanceof ApiError ? error.status : 500);
  }
}
