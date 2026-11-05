import 'server-only';
import {createHash, randomUUID} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {db} from './admin';
import type {Context} from './auth';
import {ApiError, id, submissionContentPolicy, text} from './policy';
import {assertAssignmentVisible} from './assignment-visibility-policy';
import {markHomeworkUploadsSubmitted, verifiedHomeworkUploads} from './homework-uploads';
import {purgeTime} from '../homework-archive';
import {editedUploads, restorableSubmission, submissionDeleteBlock, submissionEditBlock, videoJobBusy, type SubmissionChangeBlock} from '../submission-edit';

/**
 * A student changing homework they already sent.
 * - Edit: a new attempt, so a teacher looking at the old one gets STALE_ATTEMPT instead of checking the wrong work.
 * - Delete: the submission moves to `submissionTrash`, so every teacher screen and count simply sees "not submitted".
 * Files the student took away use the homework trash (`status: 'trashed'`): they leave the storage figure at once
 * and the daily cleanup removes them after the same keeping period, unless the student restores first.
 */
type Data = FirebaseFirestore.DocumentData;
type Task = Data & {id: string; submissionType: Parameters<typeof submissionContentPolicy>[0]};
const now = () => new Date().toISOString();
export const submissionFingerprint = (answer: string, uploadIds: string[]) => createHash('sha256').update(JSON.stringify({answer, uploadIds})).digest('hex');
export const submissionTrashRef = (assignmentId: string, studentId: string) => db().doc(`submissionTrash/${assignmentId}_${studentId}`);
const submissionRef = (assignmentId: string, studentId: string) => db().doc(`submissions/${assignmentId}_${studentId}`);

const blocked: Record<SubmissionChangeBlock, string> = {
  SUBMISSION_LOCKED: '선생님이 확인한 숙제는 고칠 수 없어요.',
  SUBMISSION_FILES_CLEARED: '선생님이 파일을 정리한 숙제는 고칠 수 없어요.',
  SUBMISSION_VIDEO_BUSY: '영상을 준비하는 동안에는 고칠 수 없어요.',
  SUBMISSION_REWARDED: '보상을 받은 숙제는 지울 수 없어요.',
};
function assertAllowed(block: SubmissionChangeBlock | null) {if (block) throw new ApiError(409, blocked[block], block);}

async function currentVideoJob(tx: FirebaseFirestore.Transaction, assignmentId: string, studentId: string) {
  const slot = await tx.get(db().doc(`videoSubmissionSlots/${assignmentId}_${studentId}`));
  const jobId = slot.data()?.jobId;
  return {slot, job: jobId ? (await tx.get(db().doc(`videoJobs/${jobId}`))).data() : null};
}
function assertTask(ctx: Context, task: FirebaseFirestore.DocumentSnapshot) {
  if (!task.exists || task.data()?.classId !== ctx.classId || !task.data()?.targetStudentIds?.includes(ctx.studentId)) throw new ApiError(404, '배부된 과제를 찾을 수 없어요.', 'NOT_FOUND');
  assertAssignmentVisible(task.data());
}
function assertAttempt(old: Data | undefined, attemptId: unknown) {
  if (!old) throw new ApiError(404, '제출한 숙제를 찾을 수 없어요.', 'NOT_SUBMITTED');
  // A stale tab or a screen opened before the teacher's check must not overwrite newer work.
  if (attemptId !== old.attemptId) throw new ApiError(409, '숙제가 바뀌었어요. 새로 불러온 뒤 다시 해 주세요.', 'STALE_SUBMISSION');
}
const uploadRefs = (uploads: Data[]) => uploads.map(upload => db().doc(`uploads/${id(upload.id)}`));
function trashFiles(tx: FirebaseFirestore.Transaction, docs: FirebaseFirestore.DocumentSnapshot[], uid: string, trashedAt: string, purgeAt: string) {
  for (const doc of docs) if (doc.data()?.status === 'submitted') tx.update(doc.ref, {status: 'trashed', trashedAt, purgeAt, trashedBy: uid, studentRemoved: true});
}

export async function editSubmission(ctx: Context, assignment: Task, input: Data) {
  const assignmentId = assignment.id, studentId = ctx.studentId!;
  const answer = text(input.text, '내용', 10000, true);
  if (!Array.isArray(input.keepUploadIds) || !Array.isArray(input.uploadIds) || input.keepUploadIds.length + input.uploadIds.length > 10) throw new ApiError(400, '첨부파일은 최대 10개까지 제출할 수 있어요.');
  const keepIds: string[] = input.keepUploadIds.map((value: unknown) => id(value)), newIds: string[] = input.uploadIds.map((value: unknown) => id(value));
  if (new Set([...keepIds, ...newIds]).size !== keepIds.length + newIds.length) throw new ApiError(400, '같은 파일이 두 번 들어 있어요.');
  submissionContentPolicy(assignment.submissionType, answer, keepIds.length + newIds.length);
  // A replacement video needs the worker: delete and send again instead.
  if (assignment.submissionType === 'video' && newIds.length) throw new ApiError(400, '영상을 바꾸려면 제출을 지우고 다시 올려 주세요.', 'VIDEO_REPLACE');
  const {uploadDocs, uploads: added} = await verifiedHomeworkUploads(ctx.uid, assignmentId, assignment.submissionType, newIds);
  const ref = submissionRef(assignmentId, studentId), fingerprint = submissionFingerprint(answer, [...keepIds, ...newIds]);
  const attemptId = randomUUID();
  return db().runTransaction(async tx => {
    const [task, oldDoc, fresh] = await Promise.all([tx.get(db().doc(`assignments/${assignmentId}`)), tx.get(ref), Promise.all(uploadDocs.map(doc => tx.get(doc.ref)))]);
    assertTask(ctx, task);
    const old = oldDoc.data();
    // Nothing changed, or a retry after a lost response finds its own edit already saved.
    if (old?.fingerprint === fingerprint && old?.status === 'submitted') return {id: ref.id, ...old} as Data;
    assertAttempt(old, input.attemptId);
    const {job} = await currentVideoJob(tx, assignmentId, studentId);
    assertAllowed(submissionEditBlock(old, job));
    const plan = editedUploads<Data & {id: string}>(old!.uploads ?? [], keepIds);
    if (!plan) throw new ApiError(400, '첨부파일을 다시 확인해 주세요.', 'UPLOAD_INVALID');
    if (fresh.some(doc => doc.data()?.status !== 'pending')) throw new ApiError(409, '이미 사용된 첨부파일이에요.', 'UPLOAD_USED');
    const removed = await Promise.all(uploadRefs(plan.removed).map(upload => tx.get(upload)));
    const stamp = now(), submission = {...old!, text: answer, uploads: [...plan.kept, ...added], attemptId, attemptNumber: (old!.attemptNumber ?? 1) + 1, fingerprint, editedAt: stamp};
    tx.set(ref, submission);
    tx.create(ref.collection('attempts').doc(attemptId), submission);
    markHomeworkUploadsSubmitted(tx, uploadDocs, added, ref.id, assignment.ownerUid);
    trashFiles(tx, removed, ctx.uid, stamp, new Date(purgeTime(Date.now())).toISOString());
    return {id: ref.id, ...submission} as Data;
  });
}

export async function deleteSubmission(ctx: Context, assignment: Task, input: Data) {
  const assignmentId = assignment.id, studentId = ctx.studentId!;
  const ref = submissionRef(assignmentId, studentId), trashRef = submissionTrashRef(assignmentId, studentId);
  return db().runTransaction(async tx => {
    const [task, oldDoc] = await Promise.all([tx.get(db().doc(`assignments/${assignmentId}`)), tx.get(ref)]);
    assertTask(ctx, task);
    const old = oldDoc.data();
    assertAttempt(old, input.attemptId);
    const {slot, job} = await currentVideoJob(tx, assignmentId, studentId);
    assertAllowed(submissionDeleteBlock(old, job));
    const files = await Promise.all(uploadRefs(old!.uploads ?? []).map(upload => tx.get(upload)));
    const deletedAt = now(), restoreUntil = new Date(purgeTime(Date.now())).toISOString();
    tx.set(trashRef, {...old!, deletedAt, restoreUntil});
    tx.delete(ref);
    trashFiles(tx, files, ctx.uid, deletedAt, restoreUntil);
    // The finished job would otherwise keep showing beside an unsubmitted task.
    if (slot.exists) tx.delete(slot.ref);
    tx.update(task.ref, {submittedCount: FieldValue.increment(-1)});
    return {restoreUntil};
  });
}

export async function restoreSubmission(ctx: Context, assignment: Task) {
  const assignmentId = assignment.id, studentId = ctx.studentId!;
  const ref = submissionRef(assignmentId, studentId), trashRef = submissionTrashRef(assignmentId, studentId);
  return db().runTransaction(async tx => {
    const [task, trashDoc, current] = await Promise.all([tx.get(db().doc(`assignments/${assignmentId}`)), tx.get(trashRef), tx.get(ref)]);
    assertTask(ctx, task);
    const trash = trashDoc.data();
    if (!restorableSubmission(trash)) throw new ApiError(410, '되돌릴 수 있는 기간이 지났어요.', 'RESTORE_EXPIRED');
    if (current.exists) throw new ApiError(409, '이미 새로 제출했어요.', 'ALREADY_SUBMITTED');
    const {job} = await currentVideoJob(tx, assignmentId, studentId);
    if (videoJobBusy(job)) throw new ApiError(409, blocked.SUBMISSION_VIDEO_BUSY, 'SUBMISSION_VIDEO_BUSY');
    const files = await Promise.all(uploadRefs(trash!.uploads ?? []).map(upload => tx.get(upload)));
    if (files.some(doc => doc.data()?.status !== 'trashed' || !doc.data()?.studentRemoved)) throw new ApiError(410, '파일이 정리되어 되돌릴 수 없어요.', 'RESTORE_EXPIRED');
    const {deletedAt: _deletedAt, restoreUntil: _restoreUntil, ...submission} = trash!;
    tx.set(ref, submission);
    tx.delete(trashRef);
    for (const doc of files) tx.update(doc.ref, {status: 'submitted', trashedAt: FieldValue.delete(), purgeAt: FieldValue.delete(), trashedBy: FieldValue.delete(), studentRemoved: FieldValue.delete()});
    tx.update(task.ref, {submittedCount: FieldValue.increment(1)});
    return {id: ref.id, ...submission} as Data;
  });
}
