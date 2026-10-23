import 'server-only';
import {createHash} from 'node:crypto';
import {FieldPath} from 'firebase-admin/firestore';
import {db} from '@/lib/server/admin';
import type {Context} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {canViewArtwork, encodeExhibitionCursor, exhibitionCursor, EXHIBITION_ARTWORK_LIMIT} from '@/lib/server/exhibition-policy';
import {stableReadUrl} from '@/lib/server/signed-urls';
import {artworkToday} from '@/lib/exhibition-metadata';
import {personalExhibition} from './identity';
import type {PersonalArtwork, PersonalExhibitionPage} from './types';

const ROOM_PAGE_SIZE = 10;

export async function readPersonalExhibition(ctx: Context, cursor: string | null): Promise<PersonalExhibitionPage> {
  if (ctx.role !== 'student' || !ctx.classId || !ctx.studentId) throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
  const {classId, studentId} = ctx;
  const scope = createHash('sha256').update(`personal-exhibition:${ctx.uid}:${classId}:${studentId}`).digest('hex');
  const after = exhibitionCursor(cursor, scope);
  const studentRef = db().doc(`classes/${classId}/students/${studentId}`);
  const [student, cls] = await Promise.all([studentRef.get(), db().doc(`classes/${classId}`).get()]);
  if (!student.exists || student.data()?.disabled || student.data()?.authUid !== ctx.uid || !cls.exists) throw new ApiError(403, '학생 정보를 다시 확인해 주세요.', 'FORBIDDEN');

  // Existing pupils get the same default room without migrating or copying artworks.
  const exhibition = student.data()?.personalExhibition ?? await db().runTransaction(async tx => {
    const fresh = await tx.get(studentRef);
    if (!fresh.exists || fresh.data()?.disabled || fresh.data()?.authUid !== ctx.uid) throw new ApiError(403, '학생 정보를 다시 확인해 주세요.', 'FORBIDDEN');
    if (fresh.data()?.personalExhibition) return fresh.data()!.personalExhibition;
    const value = personalExhibition(fresh.data()?.createdAt || new Date().toISOString());
    tx.update(studentRef, {personalExhibition: value});
    return value;
  });

  // Use the existing student exhibition index and access policy. Drafts stay private.
  let query = db().collection('exhibitions').where('classId', '==', classId).where('status', 'in', ['open', 'closed'])
    .orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (after) query = query.startAfter(after.createdAt, after.id);
  const result = await query.limit(ROOM_PAGE_SIZE + 1).get();
  const rooms = result.docs.slice(0, ROOM_PAGE_SIZE);
  const batches = await Promise.all(rooms.map(async room => {
    const source = {...room.data(), classId: room.data().classId, ownerUid: room.data().ownerUid, status: room.data().status};
    const works = await room.ref.collection('artworks').where('studentId', '==', studentId).limit(EXHIBITION_ARTWORK_LIMIT).get();
    return Promise.all(works.docs.filter(doc => doc.data().studentId === studentId && canViewArtwork(ctx, source, doc.data() as PersonalArtwork)).map(async doc => {
      const value = doc.data();
      const [url, thumbnailUrl] = await Promise.all([stableReadUrl(value.displayPath), stableReadUrl(value.thumbnailPath)]);
      // Explicit response fields keep private storage paths and uploader details on the server.
      return {
        id: doc.id, exhibitionId: room.id, exhibitionTitle: room.data().title,
        studentId, studentName: student.data()!.name, studentNumber: student.data()!.number,
        title: value.title, description: value.description, status: value.status, feedback: value.feedback || '',
        artistName: value.artistName || student.data()!.name,
        artworkDate: value.artworkDate || artworkToday(new Date(value.createdAt)),
        width: value.width, height: value.height, url, thumbnailUrl,
        createdAt: value.createdAt, reviewedAt: value.reviewedAt ?? null,
      } satisfies PersonalArtwork;
    }));
  }));
  const last = rooms.at(-1);
  const hasMore = result.size > ROOM_PAGE_SIZE;
  return {
    exhibition, student: {id: studentId, name: student.data()!.name, number: student.data()!.number, className: cls.data()!.name},
    artworks: batches.flat(), hasMore,
    nextCursor: hasMore && last ? encodeExhibitionCursor(scope, {id: last.id, createdAt: last.data().createdAt}) : null,
  };
}
