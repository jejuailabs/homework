import 'server-only';
import {createHash} from 'node:crypto';
import {db} from '@/lib/server/admin';
import type {Context} from '@/lib/server/auth';
import {ApiError, id} from '@/lib/server/policy';
import {accessStudent, requirePlayEnabled} from './server-access';
import {joinRoom} from './rooms-server';
import type {PlayRoom} from './room-types';

async function access(ctx: Context, tx?: FirebaseFirestore.Transaction) {
  const value = await accessStudent(ctx, tx); requirePlayEnabled(value);
  if (process.env.PLAYGROUND_LIVE_DISABLED === 'true') throw new ApiError(404, '실시간 말놀이터는 준비 중이에요.');
  if (!value.settings.allowDuels) throw new ApiError(403, '선생님이 친구 대결을 열면 이용할 수 있어요.');
  return value;
}
export async function handleSocialRequest(request: Request, ctx: Context, segments: string[], data: Record<string, unknown>) {
  const path = segments.join('/');
  if (!['social', 'presence', 'invites'].includes(segments[0])) return undefined;
  if (request.method === 'GET' && path === 'social') {
    const a = await access(ctx), now = Date.now();
    const [present, inbox, limit] = await Promise.all([
      a.cls.ref.collection('playPresence').where('lastSeen', '>=', now - 30000).limit(60).get(),
      a.cls.ref.collection('playInvites').where('to', '==', a.ctx.studentId).where('status', '==', 'pending').limit(60).get(),
      a.cls.ref.collection('playRoomLimits').doc(ctx.uid).get(),
    ]);
    const students = present.docs.length ? await db().getAll(...present.docs.map(row => a.cls.ref.collection('students').doc(row.id))) : [];
    const active = limit.data()?.activeId ? await db().doc(`playRooms/${id(limit.data()!.activeId)}`).get() : null;
    const room = active?.data() as PlayRoom | undefined;
    return {
      online: students.filter(row => row.exists && !row.data()?.disabled && row.id !== a.ctx.studentId).map(row => ({id: row.id, name: String(row.data()!.name || ''), character: String(row.data()!.character || 'cat')})),
      invites: inbox.docs.filter(row => row.data().expiresAtMs > now).map(row => ({id: row.id, fromName: row.data().fromName, roomId: row.data().roomId, code: row.data().code})),
      ownRoom: room && room.classId === a.ctx.classId && room.hostKey === a.ctx.studentId && room.status === 'lobby' && room.statusEndsAt > now ? {roomId: room.id, code: room.code} : null,
    };
  }
  if (request.method === 'POST' && path === 'presence') {
    return db().runTransaction(async tx => {
      const a = await access(ctx, tx), ref = a.cls.ref.collection('playPresence').doc(a.ctx.studentId), previous = await tx.get(ref), now = Date.now();
      if (now - Number(previous.data()?.lastSeen || 0) >= 10000) tx.set(ref, {lastSeen: now, expiresAtMs: now + 600000});
      return {ok: true};
    });
  }
  if (request.method === 'POST' && path === 'invites') {
    return db().runTransaction(async tx => {
      const a = await access(ctx, tx), to = id(data.toStudentId), now = Date.now();
      if (to === a.ctx.studentId) throw new ApiError(400, '함께 놀 친구를 골라 주세요.');
      const roomId = id(data.roomId), roomDoc = await tx.get(db().doc(`playRooms/${roomId}`)), room = roomDoc.data() as PlayRoom | undefined;
      if (!a.settings.allowDuels || !room || room.classId !== a.ctx.classId || room.hostKey !== a.ctx.studentId || room.status !== 'lobby' || room.statusEndsAt <= now) throw new ApiError(403, '먼저 우리 반 대결방을 열어 주세요.');
      const ref = a.cls.ref.collection('playInvites').doc(createHash('sha256').update(`${a.ctx.studentId}:${to}`).digest('hex'));
      const [recipient, previous] = await Promise.all([tx.get(a.cls.ref.collection('students').doc(to)), tx.get(ref)]);
      if (!recipient.exists || recipient.data()?.disabled || !recipient.data()?.authUid) throw new ApiError(404, '함께 놀 수 있는 친구를 다시 확인해 주세요.');
      if (previous.data()?.status === 'pending' && previous.data()?.roomId === roomId && previous.data()?.expiresAtMs > now) return {inviteId: ref.id};
      if (now - Number(previous.data()?.createdAt || 0) < 30000) throw new ApiError(429, '친구에게 보낸 초대를 잠시 기다려 주세요.');
      tx.set(ref, {from: a.ctx.studentId, fromName: String(a.pupil.data()?.name || ''), to, roomId, code: room.code, status: 'pending', createdAt: now, expiresAtMs: Math.min(now + 120000, room.statusEndsAt)});
      return {inviteId: ref.id};
    });
  }
  if (request.method === 'POST' && segments.length === 3 && segments[0] === 'invites' && ['accept', 'decline'].includes(segments[2])) {
    const a = await access(ctx), ref = a.cls.ref.collection('playInvites').doc(id(segments[1]));
    const invite = await db().runTransaction(async tx => {
      const fresh = await access(ctx, tx), doc = await tx.get(ref), value = doc.data();
      if (!doc.exists || value?.to !== fresh.ctx.studentId) throw new ApiError(404, '받은 초대를 확인해 주세요.');
      if (value?.status === 'declined') throw new ApiError(409, '이미 닫은 초대예요.');
      if (segments[2] === 'decline' && value?.status === 'accepted') throw new ApiError(409, '이미 수락한 초대예요. 방에서 나가기를 선택해 주세요.');
      if (value?.expiresAtMs <= Date.now()) throw new ApiError(410, '초대 시간이 지났어요.');
      if (segments[2] === 'decline') tx.update(ref, {status: 'declined'});
      return value!;
    });
    if (segments[2] === 'decline') return {ok: true};
    // Invitation acceptance and room membership commit together; a concurrent decline cannot be overwritten.
    const joined = await joinRoom(ctx, invite.code, invite.roomId, ref.id);
    if (joined.roomId !== invite.roomId) throw new ApiError(409, '방이 바뀌었어요. 새 초대를 받아 주세요.');
    return joined;
  }
  throw new ApiError(404, '요청한 기능을 찾을 수 없어요.');
}
