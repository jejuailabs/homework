import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from './admin';
import type { Context } from './auth';
import { ApiError, canManageClass, id } from './policy';
import { NOTE_THREAD_PAGE, noteRate, notePreview, noteText, sortThreads, type CardNote, type CardNoteThread } from '../cards-notes';

/**
 * 쪽지. One thread per student, `cardNotes/{classId}_{studentId}` with its messages below. The class switch
 * (`classes/{classId}/settings/cards.notesEnabled`, default off) lets students write to the teacher; the teacher may always write
 * and delete. A student only ever reaches their own thread through their verified session; nothing lists other students' notes.
 * Notes are a classroom message, not a record: Berry gets unread counts only, never the text.
 */
type Data = Record<string, any>;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const now = () => new Date().toISOString();
const digest = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const settingsRef = (classId: string) => db().doc(`classes/${id(classId, '우리 반')}/settings/cards`);
export const noteThreadRef = (classId: string, studentId: string) => db().doc(`cardNotes/${id(classId)}_${id(studentId)}`);
const noteOf = (snap: FirebaseFirestore.DocumentSnapshot): CardNote => ({ id: snap.id, from: snap.data()!.from, text: snap.data()!.text, createdAt: snap.data()!.createdAt, read: snap.data()!.read === true });

async function ownedClass(ctx: Context, classId: string) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  const snap = await db().doc(`classes/${id(classId, '우리 반')}`).get();
  if (!snap.exists || !canManageClass(ctx.role, ctx.uid, snap.data()?.ownerUid)) throw new ApiError(404, '항목을 찾을 수 없어요.', 'NOT_FOUND');
  return snap;
}
async function messages(thread: FirebaseFirestore.DocumentReference) {
  const snap = await thread.collection('messages').orderBy('createdAt', 'desc').limit(NOTE_THREAD_PAGE).get();
  return snap.docs.map(noteOf).reverse();
}
/** Unread counts are recounted from the messages so a deleted message never leaves a badge behind. */
async function recount(thread: FirebaseFirestore.DocumentReference) {
  const [fromStudent, fromTeacher, last] = await Promise.all([
    thread.collection('messages').where('from', '==', 'student').where('read', '==', false).count().get(),
    thread.collection('messages').where('from', '==', 'teacher').where('read', '==', false).count().get(),
    thread.collection('messages').orderBy('createdAt', 'desc').limit(1).get(),
  ]);
  const latest = last.docs[0]?.data();
  return { unreadTeacher: fromStudent.data().count, unreadStudent: fromTeacher.data().count, lastAt: latest?.createdAt ?? null, lastFrom: latest?.from ?? null, preview: latest ? notePreview(String(latest.text)) : '' };
}
async function markRead(thread: FirebaseFirestore.DocumentReference, from: 'teacher' | 'student') {
  const unread = await thread.collection('messages').where('from', '==', from).where('read', '==', false).limit(200).get();
  if (unread.empty) return;
  const batch = db().batch();
  unread.docs.forEach(doc => batch.update(doc.ref, { read: true }));
  batch.update(thread, from === 'student' ? { unreadTeacher: 0 } : { unreadStudent: 0 });
  await batch.commit();
}
async function send(ctx: Context, classId: string, studentId: string, ownerUid: string, from: 'teacher' | 'student', input: Data) {
  const text = noteText(input.text), requestId = id(input.requestId, '요청 ID');
  if (!text) throw new ApiError(400, '쪽지는 1~500자로 써 주세요.', 'NOTE_TEXT');
  const thread = noteThreadRef(classId, studentId), messageRef = thread.collection('messages').doc(digest(ctx.uid, requestId).slice(0, 24)), stamp = now(), time = Date.parse(stamp);
  return db().runTransaction(async tx => {
    const [saved, existing] = await Promise.all([tx.get(thread), tx.get(messageRef)]);
    if (existing.exists) {
      if (existing.data()!.text !== text || existing.data()!.from !== from) throw new ApiError(409, '같은 요청 ID에 다른 쪽지를 보낼 수 없어요.', 'REQUEST_CONFLICT');
      return noteOf(existing);
    }
    const rate = noteRate(saved.data()?.recent, time);
    if (from === 'student' && !rate.allowed) throw new ApiError(429, '쪽지는 한 시간에 10개까지 보낼 수 있어요.', 'NOTE_RATE');
    const note = { from, text, createdAt: stamp, read: false, authorUid: ctx.uid };
    tx.create(messageRef, note);
    tx.set(thread, { classId, studentId, ownerUid, lastAt: stamp, lastFrom: from, preview: notePreview(text), unreadTeacher: (saved.data()?.unreadTeacher ?? 0) + (from === 'student' ? 1 : 0), unreadStudent: (saved.data()?.unreadStudent ?? 0) + (from === 'teacher' ? 1 : 0), ...(from === 'student' ? { recent: [...rate.kept, time] } : {}), updatedAt: stamp }, { merge: true });
    return { id: messageRef.id, from, text, createdAt: stamp, read: false } satisfies CardNote;
  });
}

/** GET/PATCH classes/{id}/notes, GET/POST classes/{id}/notes/{studentId}, DELETE classes/{id}/notes/{studentId}/{messageId}. */
export async function teacherNotes(ctx: Context, request: Request, classId: string, studentId: string | undefined, messageId: string | undefined, input: Data) {
  const cls = await ownedClass(ctx, classId), method = request.method;
  if (!studentId) {
    if (method === 'PATCH') {
      if (typeof input.enabled !== 'boolean') throw new ApiError(400, '쪽지 설정을 확인해 주세요.', 'NOTE_SETTINGS');
      await settingsRef(cls.id).set({ notesEnabled: input.enabled, updatedAt: now() }, { merge: true });
      return json({ enabled: input.enabled });
    }
    if (method !== 'GET') throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
    const [settings, threads] = await Promise.all([settingsRef(cls.id).get(), db().collection('cardNotes').where('classId', '==', cls.id).limit(400).get()]);
    const mine = threads.docs.filter(doc => doc.data().ownerUid === ctx.uid), enabled = settings.data()?.notesEnabled === true;
    const unread = mine.reduce((sum, doc) => sum + Number(doc.data().unreadTeacher ?? 0), 0);
    // The light summary for the button badge reads no roster.
    if (new URL(request.url).searchParams.get('summary') === '1') return json({ enabled, unread });
    const roster = await db().collection(`classes/${cls.id}/students`).get(), byStudent = new Map(mine.map(doc => [String(doc.data().studentId), doc.data()]));
    const list: CardNoteThread[] = roster.docs.filter(doc => !doc.data().disabled || byStudent.has(doc.id)).map(doc => {const thread = byStudent.get(doc.id); return { studentId: doc.id, name: String(doc.data().name ?? ''), number: Number(doc.data().number ?? 0), lastAt: thread?.lastAt ?? null, lastFrom: thread?.lastFrom ?? null, preview: thread?.preview ?? '', unread: Number(thread?.unreadTeacher ?? 0) };});
    return json({ enabled, unread, threads: sortThreads(list) });
  }
  const pupil = await db().doc(`classes/${cls.id}/students/${id(studentId, '학생')}`).get();
  if (!pupil.exists) throw new ApiError(404, '학생을 찾을 수 없어요.', 'NOT_FOUND');
  const thread = noteThreadRef(cls.id, pupil.id);
  if (messageId) {
    if (method !== 'DELETE') throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
    const message = thread.collection('messages').doc(id(messageId, '쪽지'));
    if (!(await message.get()).exists) throw new ApiError(404, '쪽지를 찾을 수 없어요.', 'NOT_FOUND');
    await message.delete();
    await thread.set({ ...(await recount(thread)), updatedAt: now() }, { merge: true });
    return json({ ok: true });
  }
  if (method === 'POST') return json({ note: await send(ctx, cls.id, pupil.id, ctx.uid, 'teacher', input) }, 201);
  if (method !== 'GET') throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
  await markRead(thread, 'student');
  return json({ student: { id: pupil.id, name: pupil.data()!.name ?? '', number: pupil.data()!.number ?? 0 }, notes: await messages(thread) });
}

async function verifiedStudent(ctx: Context) {
  if (ctx.role !== 'student' || !ctx.classId || !ctx.studentId) throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
  const [cls, pupil] = await db().getAll(db().doc(`classes/${ctx.classId}`), db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`));
  if (!cls.exists || !pupil.exists || pupil.data()?.disabled || pupil.data()?.authUid !== ctx.uid) throw new ApiError(403, '학생 코드를 선생님께 다시 확인해 주세요.', 'STUDENT_UNAVAILABLE');
  return { classId: ctx.classId, studentId: ctx.studentId, ownerUid: String(cls.data()!.ownerUid) };
}
/** GET/POST notes for the student: their own thread only. Reading marks the teacher's notes as read. */
export async function studentNotes(ctx: Context, request: Request, input: Data) {
  const me = await verifiedStudent(ctx), thread = noteThreadRef(me.classId, me.studentId);
  const enabled = (await settingsRef(me.classId).get()).data()?.notesEnabled === true;
  if (request.method === 'POST') {
    if (!enabled) throw new ApiError(403, '선생님이 쪽지를 켜면 보낼 수 있어요.', 'NOTES_OFF');
    return json({ note: await send(ctx, me.classId, me.studentId, me.ownerUid, 'student', input) }, 201);
  }
  if (request.method !== 'GET') throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
  const saved = await thread.get();
  // A thread left from an earlier owner of the class is not shown.
  const notes = saved.exists && saved.data()?.ownerUid === me.ownerUid ? await messages(thread) : [];
  if (notes.some(note => note.from === 'teacher' && !note.read)) await markRead(thread, 'teacher');
  return json({ enabled, notes });
}
/** For the student list: whether notes are on and how many teacher notes wait unread. Two small reads. */
export async function studentNoteSummary(classId: string, studentId: string, ownerUid: string) {
  const [settings, thread] = await db().getAll(settingsRef(classId), noteThreadRef(classId, studentId));
  const mine = thread.exists && thread.data()?.ownerUid === ownerUid;
  return { enabled: settings.data()?.notesEnabled === true, unread: mine ? Number(thread.data()?.unreadStudent ?? 0) : 0, any: mine };
}
/** For Berry: per class whether notes are on and how many student notes wait. Never the text or who wrote. */
export async function cardNoteCounts(classIds: string[], ownerUid: string) {
  return Promise.all(classIds.map(async classId => {
    const [settings, threads] = await Promise.all([settingsRef(classId).get(), db().collection('cardNotes').where('classId', '==', classId).select('ownerUid', 'unreadTeacher').limit(400).get()]);
    const mine = threads.docs.filter(doc => doc.data().ownerUid === ownerUid);
    return { classId, enabled: settings.data()?.notesEnabled === true, unread: mine.reduce((sum, doc) => sum + Number(doc.data().unreadTeacher ?? 0), 0), students_waiting: mine.filter(doc => Number(doc.data().unreadTeacher ?? 0) > 0).length };
  }));
}
