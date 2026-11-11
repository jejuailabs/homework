import 'server-only';
import {createHash} from 'node:crypto';
import {Timestamp} from 'firebase-admin/firestore';
import {bucket, db} from '@/lib/server/admin';
import {ApiError, id} from '@/lib/server/policy';
import {awaitUploadTransfer, cancelUploadTransfer, createUploadTransfer} from '@/lib/server/upload-transfer';
import {LESSON_UPLOAD_TTL_MS, lessonFileMatches, lessonUploadIds, lessonUploadPolicy} from './upload-policy';

type Data = Record<string, unknown>;
const uploadRef = (uploadId: string) => db().doc(`lessonReviewUploads/${uploadId}`);

/** Opens one direct browser → Firebase Storage upload for lesson material. Nothing but the ids passes through the API. */
export async function prepareLessonUpload(uid: string, classId: string, value: Data, origin: string) {
  const {kind, contentType, size} = lessonUploadPolicy(value.kind, value.contentType, value.size);
  const uploadId = createHash('sha256').update(`${uid}:lesson-review:${id(value.requestId)}`).digest('hex');
  const ref = uploadRef(uploadId), path = `lesson-review-uploads/${uid}/${uploadId}`;
  let previous = await db().runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      const old = snapshot.data()!;
      if (old.ownerUid !== uid || old.classId !== classId || old.kind !== kind || old.contentType !== contentType || old.size !== size) throw new ApiError(409, '전송 정보가 바뀌었어요. 다시 넣어 주세요.', 'UPLOAD_MISMATCH');
      return old;
    }
    tx.create(ref, {ownerUid: uid, classId, kind, contentType, size, path, status: 'pending', createdAt: new Date().toISOString(), expiresAt: Timestamp.fromMillis(Date.now() + LESSON_UPLOAD_TTL_MS)});
    return null;
  });
  previous = await awaitUploadTransfer(ref, previous);
  try {
    const transfer = previous?.uploadUrl ? {uploadUrl: String(previous.uploadUrl), uploadHeaders: {'Content-Type': contentType}} : await createUploadTransfer(path, contentType, size, origin);
    if (!previous?.uploadUrl) await ref.update({uploadUrl: transfer.uploadUrl});
    return {uploadId, path, ...transfer, alreadyUploaded: previous ? (await bucket().file(path).exists())[0] : false};
  } catch (error) {await discardLessonUpload(uploadId).catch(() => {}); throw error;}
}

/** Reads the named uploads back from Storage as data URLs for the AI, after checking owner, class, size, type and content. */
export async function loadLessonUploads(uid: string, classId: string, value: Data) {
  const ids = lessonUploadIds(value.imageUploadIds, value.pdfUploadId);
  const read = async (uploadId: string, kind: 'image' | 'pdf') => {
    const doc = (await uploadRef(uploadId).get()).data();
    if (!doc || doc.ownerUid !== uid || doc.classId !== classId || doc.kind !== kind || doc.expiresAt.toMillis() <= Date.now()) throw new ApiError(409, kind === 'image' ? '사진을 다시 넣어 주세요.' : 'PDF를 다시 넣어 주세요.', 'UPLOAD_INVALID');
    const file = bucket().file(String(doc.path));
    const [metadata] = await file.getMetadata().catch(() => { throw new ApiError(409, '파일을 아직 올리고 있어요. 잠시 뒤 다시 시도해 주세요.', 'UPLOAD_INCOMPLETE'); });
    if (Number(metadata.size) !== doc.size || metadata.contentType !== doc.contentType) throw new ApiError(400, '파일 정보가 달라요. 다시 넣어 주세요.', 'UPLOAD_MISMATCH');
    const [bytes] = await file.download();
    if (!lessonFileMatches(String(doc.contentType), bytes)) throw new ApiError(400, kind === 'image' ? '사진을 읽을 수 없어요. 다른 사진으로 넣어 주세요.' : 'PDF를 읽을 수 없어요. 다른 파일로 넣어 주세요.', 'FILE_CONTENT');
    return {name: typeof doc.fileName === 'string' ? doc.fileName : '', data: `data:${doc.contentType};base64,${bytes.toString('base64')}`};
  };
  const [images, pdf] = await Promise.all([Promise.all(ids.images.map(uploadId => read(uploadId, 'image'))), ids.pdf ? read(ids.pdf, 'pdf') : null]);
  return {images: images.map(image => image.data), pdf: pdf ? {name: String(value.pdfName || 'lesson.pdf'), data: pdf.data} : null, ids: [...ids.images, ...(ids.pdf ? [ids.pdf] : [])]};
}

/** Lesson material is only needed for one AI run: the files and their records are removed afterwards. */
export async function discardLessonUpload(uploadId: string) {
  const ref = uploadRef(uploadId), doc = (await ref.get()).data();
  if (!doc) return;
  await cancelUploadTransfer(doc.uploadUrl as string | undefined).catch(() => {});
  await bucket().file(String(doc.path)).delete({ignoreNotFound: true});
  await ref.delete();
}
export async function cleanupLessonReviewUploads() {
  const expired = await db().collection('lessonReviewUploads').where('expiresAt', '<=', Timestamp.now()).limit(100).get();
  let cleaned = 0;
  for (const doc of expired.docs) {try {await discardLessonUpload(doc.id); cleaned++;} catch {console.error('Lesson review upload cleanup deferred');}}
  return {cleaned, hasMore: expired.size === 100};
}
