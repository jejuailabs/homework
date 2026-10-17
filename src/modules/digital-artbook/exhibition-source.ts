import 'server-only';
import { createHash } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { bucket, db } from '@/lib/server/admin';
import { requireTeacher, type Context } from '@/lib/server/auth';
import { ApiError, id } from '@/lib/server/policy';
import { effectiveOptions } from '../artwork-extensions/exhibition-adapter';
import { artworkToday } from '@/lib/exhibition-metadata';
import { bookDate, bookKeys, bookOptions, workInPeriod } from './policy';
import type { BookPage, BookSnapshot, BookWork } from './types';

type Data = Record<string, any>;
export type BookHost = {ctx: Context; anchor: string; classId: string; className: string};
export const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
function available(room: Data | undefined, host: BookHost) {
  return room?.ownerUid === host.ctx.uid && room?.classId === host.classId && ['open', 'closed'].includes(room.status) && effectiveOptions(room.artworkModules).artbook.enabled;
}
export async function artbookHost(request: Request, anchor: string): Promise<BookHost> {
  const ctx = await requireTeacher(request), room = await db().doc('exhibitions/' + id(anchor)).get(), r = room.data();
  if (!r || r.ownerUid !== ctx.uid) throw new ApiError(404, '전시실을 찾을 수 없어요.');
  const cls = await db().doc('classes/' + id(r.classId)).get();
  if (!cls.exists || cls.data()?.ownerUid !== ctx.uid) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.');
  if (!effectiveOptions(r.artworkModules).artbook.enabled) throw new ApiError(403, '전시실 설정에서 학생별 아트북을 켜 주세요.');
  return {ctx, anchor, classId: r.classId, className: cls.data()!.name || r.className};
}
export async function roster(host: BookHost, cursor: string) {
  let query = db().collection(`classes/${host.classId}/students`).orderBy(FieldPath.documentId()).limit(101);
  if (cursor) query = query.startAfter(id(cursor));
  const docs = (await query.get()).docs, page = docs.slice(0, 100);
  return {students: page.filter(s => !s.data().disabled).map(s => ({id: s.id, name: String(s.data().name), number: Number(s.data().number) || 0})), cursor: docs.length > 100 ? page.at(-1)!.id : ''};
}
async function pupil(host: BookHost, studentId: string) {
  const s = await db().doc(`classes/${host.classId}/students/${id(studentId)}`).get();
  if (!s.exists || s.data()?.disabled) throw new ApiError(404, '학생 명단을 다시 확인해 주세요.');
  return s.data()!;
}
export async function sourceWork(host: BookHost, roomId: string, artworkId: string, studentId?: string) {
  const [room, art] = await Promise.all([db().doc('exhibitions/' + id(roomId)).get(), db().doc(`exhibitions/${id(roomId)}/artworks/${id(artworkId)}`).get()]);
  const r = room.data(), a = art.data();
  if (!available(r, host) || !a || a.status !== 'approved' || !a.studentId || (studentId && a.studentId !== studentId)) throw new ApiError(409, '작품의 학생 연결·승인 상태 또는 전시실의 아트북 설정이 변경됐어요. 작품을 다시 선택해 주세요.');
  return {room: r!, art: a};
}
export async function catalog(host: BookHost, params: URLSearchParams) {
  const studentId = id(params.get('studentId')), student = await pupil(host, studentId);
  const from = bookDate(params.get('from') || ''), to = bookDate(params.get('to') || '');
  if (from && to && from > to) throw new ApiError(400, '시작일이 종료일보다 늦어요.');
  let query = db().collection('exhibitions').where('classId', '==', host.classId).orderBy(FieldPath.documentId()).limit(11);
  if (params.get('cursor')) query = query.startAfter(id(params.get('cursor')));
  const docs = (await query.get()).docs, rooms = docs.slice(0, 10), works: BookWork[] = [];
  await Promise.all(rooms.map(async doc => {
    if (!available(doc.data(), host)) return;
    const arts = await doc.ref.collection('artworks').where('studentId', '==', studentId).limit(301).get();
    if (arts.size > 300) throw new ApiError(409, '전시별 작품 수를 확인해 주세요. 한 전시에 300점까지 모을 수 있어요.');
    for (const s of arts.docs) {
      const a = s.data(), date = a.artworkDate || artworkToday(new Date(a.createdAt));
      if (a.status !== 'approved' || !workInPeriod(date, from, to)) continue;
      works.push({key: `${doc.id}:${s.id}`, roomId: doc.id, artworkId: s.id, title: a.title || '제목 없는 작품', description: a.description || '', date, roomTitle: doc.data().title, thumbnailUrl: `/api/artbooks/${host.anchor}/image/${doc.id}/${s.id}`});
    }
  }));
  works.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  return {works, studentName: student.name, cursor: docs.length > 10 ? rooms.at(-1)!.id : ''};
}
export async function snapshot(host: BookHost, input: Data, origin: string): Promise<BookSnapshot> {
  const studentId = id(input.studentId), student = await pupil(host, studentId), keys = bookKeys(input.keys), options = bookOptions(input.options || {});
  const from = bookDate(input.from), to = bookDate(input.to);
  if (from && to && from > to) throw new ApiError(400, '기간을 확인해 주세요.');
  const pages: BookPage[] = [];
  // Bound concurrency and memory rather than loading every original at once.
  for (const key of keys) {
    const [roomId, artworkId] = key.split(':'), {room, art} = await sourceWork(host, roomId, artworkId, studentId);
    const date = art.artworkDate || artworkToday(new Date(art.createdAt));
    if (!workInPeriod(date, from, to)) throw new ApiError(409, '선택한 작품의 날짜가 기간에 포함되지 않아요.');
    const targetKey = hash(`exhibition:${roomId}:${artworkId}`), config = effectiveOptions(room.artworkModules);
    const voice = config.voice.enabled ? (await db().doc('moduleVoices/' + targetKey).get()).data() : null;
    const recording = voice?.activeId ? (await db().doc(`moduleVoices/${targetKey}/recordings/${id(voice.activeId)}`).get()).data() : null;
    const approvedVoice = recording?.status === 'approved' && recording.uploadStatus === 'ready'
      && voice?.ownerUid === host.ctx.uid && voice.classId === host.classId
      && (recording.actorKey === hash(host.ctx.uid) || student.authUid && recording.actorKey === hash(student.authUid));
    let voiceUrl = '';
    if (options.voiceQr && approvedVoice && config.voice.publicAudio && room.publicSharingEnabled) {
      const share = (await db().doc('exhibitionShares/' + roomId).get()).data();
      if (share?.token && (await db().doc('exhibitionShareLinks/' + hash(share.token)).get()).data()?.exhibitionId === roomId)
        voiceUrl = `${origin}/gallery/${encodeURIComponent(share.token)}?artwork=${encodeURIComponent(artworkId)}`;
    }
    pages.push({key, roomId, artworkId, title: art.title || '제목 없는 작품', description: art.description || '', date, roomTitle: room.title, sourcePath: String(art.displayPath), sourceVersion: hash(JSON.stringify({path: art.displayPath, updatedAt: art.updatedAt || art.createdAt, title: art.title, description: art.description})), caption: approvedVoice ? String(recording.caption || '') : '', captionVersion: approvedVoice ? String(recording.version || '') : '', voiceRecordId: approvedVoice ? String(voice!.activeId) : '', voiceUrl, width: art.width, height: art.height});
  }
  return {schema: 1, classId: host.classId, className: host.className, studentId, studentName: student.name, from, to, createdAt: new Date().toISOString(), options, pages};
}
/** Existing snapshots stay private; revoked approval or reassignment blocks old downloads too. */
export async function validateSnapshot(host: BookHost, s: BookSnapshot) {
  if (s.classId !== host.classId) throw new ApiError(404, '아트북을 찾을 수 없어요.');
  const student = await pupil(host, s.studentId);
  const roomIds = [...new Set(s.pages.map(p => p.roomId))];
  const [roomDocs, artDocs] = await Promise.all([
    db().getAll(...roomIds.map(room => db().doc('exhibitions/' + id(room)))),
    db().getAll(...s.pages.map(p => db().doc(`exhibitions/${id(p.roomId)}/artworks/${id(p.artworkId)}`))),
  ]);
  const rooms = new Map(roomDocs.map(doc => [doc.id, doc.data()]));
  const voices = s.pages.filter(p => p.voiceRecordId);
  const [voiceDocs, recordingDocs] = voices.length ? await Promise.all([
    db().getAll(...voices.map(p => db().doc('moduleVoices/' + hash(`exhibition:${p.roomId}:${p.artworkId}`)))),
    db().getAll(...voices.map(p => db().doc(`moduleVoices/${hash(`exhibition:${p.roomId}:${p.artworkId}`)}/recordings/${id(p.voiceRecordId)}`))),
  ]) : [[], []];
  const voiceByKey = new Map(voices.map((p, index) => [p.key, {voice: voiceDocs[index].data(), recording: recordingDocs[index].data()}]));
  let index = 0;
  for (const page of s.pages) {
    const room = rooms.get(page.roomId), art = artDocs[index++].data();
    if (!available(room, host) || !art || art.status !== 'approved' || art.studentId !== s.studentId)
      throw new ApiError(409, '작품의 학생 연결·승인 상태 또는 전시실의 아트북 설정이 변경됐어요. 작품을 다시 선택해 주세요.');
    if (page.voiceRecordId) {
      const {voice, recording} = voiceByKey.get(page.key)!;
      if (!effectiveOptions(room!.artworkModules).voice.enabled || voice?.activeId !== page.voiceRecordId || voice.ownerUid !== host.ctx.uid || voice.classId !== host.classId || recording?.status !== 'approved' || recording.uploadStatus !== 'ready'
        || !(recording.actorKey === hash(host.ctx.uid) || student.authUid && recording.actorKey === hash(student.authUid)))
        throw new ApiError(409, '음성 캡션 공개 상태가 변경됐어요. 아트북을 새로 만들어 주세요.');
    }
  }
}
export async function privateImage(host: BookHost, room: string, art: string) {
  const {art: work} = await sourceWork(host, room, art);
  const [metadata] = await bucket().file(work.thumbnailPath || work.displayPath).getMetadata();
  if (Number(metadata.size) > 10 * 1024 * 1024) throw new ApiError(413, '이미지가 너무 커요.');
  return {bytes: (await bucket().file(work.thumbnailPath || work.displayPath).download())[0], contentType: ['image/webp', 'image/jpeg', 'image/png'].includes(String(metadata.contentType)) ? String(metadata.contentType) : 'application/octet-stream'};
}
