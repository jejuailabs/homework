/**
 * When a student may change homework they already sent. Shared by the student
 * screen and the server, which rechecks every rule inside its transaction.
 *
 * - Until the teacher checks it, a submission can be edited, at any time of day
 *   and also after the due date (late first submissions are accepted anyway).
 * - A checked submission is locked; the teacher's "다시 하기" reopens it.
 * - A reward already granted must never be earned twice, so a rewarded
 *   submission can be edited but not deleted.
 */
export type ChangeableSubmission = {status?: unknown; attemptId?: unknown; rewardGranted?: unknown; filesRemoved?: unknown};
export type VideoJobState = {status?: unknown; retryable?: unknown} | null | undefined;
export type SubmissionChangeBlock = 'SUBMISSION_LOCKED' | 'SUBMISSION_FILES_CLEARED' | 'SUBMISSION_VIDEO_BUSY' | 'SUBMISSION_REWARDED';

export function videoJobBusy(job: VideoJobState) {
  return !!job && (job.status === 'queued' || job.status === 'processing' || (job.status === 'failed' && !!job.retryable));
}
export function submissionEditBlock(submission: ChangeableSubmission | null | undefined, job?: VideoJobState): SubmissionChangeBlock | null {
  if (!submission || submission.status !== 'submitted' || !submission.attemptId) return 'SUBMISSION_LOCKED';
  if (submission.filesRemoved) return 'SUBMISSION_FILES_CLEARED';
  if (videoJobBusy(job)) return 'SUBMISSION_VIDEO_BUSY';
  return null;
}
export function submissionDeleteBlock(submission: ChangeableSubmission | null | undefined, job?: VideoJobState): SubmissionChangeBlock | null {
  return submissionEditBlock(submission, job) ?? (submission?.rewardGranted ? 'SUBMISSION_REWARDED' : null);
}

/** Splits the current files into the ones kept (in the student's order) and the ones removed. Unknown ids are refused. */
export function editedUploads<T extends {id: string}>(current: readonly T[], keepIds: readonly string[]) {
  const byId = new Map(current.map(upload => [upload.id, upload]));
  if (new Set(keepIds).size !== keepIds.length || keepIds.some(value => !byId.has(value))) return null;
  const keep = new Set(keepIds);
  return {kept: keepIds.map(value => byId.get(value)!), removed: current.filter(upload => !keep.has(upload.id))};
}

/** What the student sees of a deleted submission while it can still come back. */
export function restorableSubmission(trash: {restoreUntil?: unknown; deletedAt?: unknown; uploads?: unknown} | null | undefined, now = Date.now()) {
  const until = typeof trash?.restoreUntil === 'string' ? Date.parse(trash.restoreUntil) : NaN;
  if (!Number.isFinite(until) || until <= now) return null;
  return {deletedAt: String(trash?.deletedAt ?? ''), restoreUntil: String(trash?.restoreUntil), fileCount: Array.isArray(trash?.uploads) ? trash.uploads.length : 0};
}
