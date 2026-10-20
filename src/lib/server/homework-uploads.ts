import 'server-only';
import {createHash, randomUUID} from 'node:crypto';
import {Timestamp} from 'firebase-admin/firestore';
import {bucket, db} from './admin';
import {ApiError, id} from './policy';
import {awaitUploadTransfer, createUploadTransfer, cancelUploadTransfer} from './upload-transfer';

export async function discardHomeworkUpload(uploadId: string, uid?: string, expiredOnly = false) {
  const ref = db().doc(`uploads/${id(uploadId)}`), token = randomUUID();
  const upload = await db().runTransaction(async tx => {
    const snapshot = await tx.get(ref), value = snapshot.data();
    if (!value) return null;
    if (uid && value.userUid !== uid) throw new ApiError(403, '본인의 전송만 정리할 수 있어요.', 'FORBIDDEN');
    if (value.status === 'submitted' || (expiredOnly && value.expiresAt.toMillis() > Date.now())) return null;
    if (!['pending', 'cleanup'].includes(value.status)) return null;
    tx.update(ref, {status: 'cleanup', cleanupToken: token}); return value;
  });
  if (!upload) return;
  await cancelUploadTransfer(upload.uploadUrl);
  await bucket().file(upload.path).delete({ignoreNotFound: true});
  await db().runTransaction(async tx => {const current = await tx.get(ref); if (current.data()?.cleanupToken === token) tx.delete(ref);});
}
export async function prepareHomeworkUpload(uid: string, data: {studentId: string; classId: string; assignmentId: string; fileName: string; contentType: string; size: number; requestId?: unknown}, origin: string) {
  const uploadId = data.requestId ? createHash('sha256').update(`${uid}:${data.assignmentId}:${id(data.requestId)}`).digest('hex') : randomUUID();
  const ref = db().doc(`uploads/${uploadId}`), path = `uploads/${uid}/${uploadId}/file`;
  let previous = await db().runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      const value = snapshot.data()!;
      if (value.userUid !== uid || value.size !== data.size || value.contentType !== data.contentType || value.fileName !== data.fileName) throw new ApiError(409, '전송 정보가 바뀌었어요.', 'UPLOAD_MISMATCH');
      if (!['pending', 'submitted'].includes(value.status)) throw new ApiError(409, '파일을 정리 중이에요.', 'UPLOAD_PROCESSING');
      return value;
    }
    const {requestId: _requestId, ...manifest} = data;
    tx.create(ref, {...manifest, userUid: uid, path, status: 'pending', createdAt: new Date().toISOString(), expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000)}); return null;
  });
  previous = await awaitUploadTransfer(ref, previous);
  if (previous?.status === 'submitted') return {uploadId, path, alreadyUploaded: true, uploadUrl: '', uploadHeaders: {}};
  try {
    const transfer = previous?.uploadUrl ? {uploadUrl: previous.uploadUrl, uploadHeaders: {'Content-Type': data.contentType}} : await createUploadTransfer(path, data.contentType, data.size, origin);
    if (!previous?.uploadUrl) await ref.update({uploadUrl: transfer.uploadUrl});
    return {uploadId, path, ...transfer, alreadyUploaded: previous ? (await bucket().file(path).exists())[0] : false};
  } catch (error) {await discardHomeworkUpload(uploadId, uid); throw error;}
}
export async function cleanupHomeworkUploads() {
  const snapshots = await db().collection('uploads').where('status', 'in', ['pending', 'cleanup']).get();
  const expired = snapshots.docs.filter(doc => doc.data().expiresAt.toMillis() <= Date.now()).slice(0, 100);
  let cleaned = 0;
  for (const doc of expired) {try {await discardHomeworkUpload(doc.id, undefined, true); cleaned++;} catch {console.error('Homework upload cleanup deferred');}}
  return {cleaned, hasMore: expired.length === 100};
}
