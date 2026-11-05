import assert from 'node:assert/strict';
import {editedUploads, restorableSubmission, submissionDeleteBlock, submissionEditBlock, videoJobBusy} from './submission-edit';

const waiting = {status: 'submitted', attemptId: 'a1'};
assert.equal(submissionEditBlock(waiting), null);
assert.equal(submissionDeleteBlock(waiting), null);
// A checked submission and one sent back for revision are not edited in place.
for (const status of ['done', 'revision', 'pending']) {
  assert.equal(submissionEditBlock({...waiting, status}), 'SUBMISSION_LOCKED');
  assert.equal(submissionDeleteBlock({...waiting, status}), 'SUBMISSION_LOCKED');
}
assert.equal(submissionEditBlock(null), 'SUBMISSION_LOCKED');
assert.equal(submissionEditBlock({status: 'submitted'}), 'SUBMISSION_LOCKED', 'a stale screen must name an attempt');
assert.equal(submissionEditBlock({...waiting, filesRemoved: {purgeAt: 'x'}}), 'SUBMISSION_FILES_CLEARED');
// Rewarded once (done, sent back, resubmitted): editable, but deleting could earn the reward again.
assert.equal(submissionEditBlock({...waiting, rewardGranted: true}), null);
assert.equal(submissionDeleteBlock({...waiting, rewardGranted: true}), 'SUBMISSION_REWARDED');
// The video worker writes the submission when it finishes, so nothing moves under it.
for (const job of [{status: 'queued'}, {status: 'processing'}, {status: 'failed', retryable: true}]) {
  assert.equal(videoJobBusy(job), true);
  assert.equal(submissionEditBlock(waiting, job), 'SUBMISSION_VIDEO_BUSY');
  assert.equal(submissionDeleteBlock(waiting, job), 'SUBMISSION_VIDEO_BUSY');
}
assert.equal(submissionEditBlock(waiting, {status: 'complete'}), null);
assert.equal(submissionEditBlock(waiting, {status: 'failed', retryable: false}), null);

const files = [{id: 'x'}, {id: 'y'}, {id: 'z'}];
assert.deepEqual(editedUploads(files, ['z', 'x']), {kept: [{id: 'z'}, {id: 'x'}], removed: [{id: 'y'}]});
assert.deepEqual(editedUploads(files, []), {kept: [], removed: files});
assert.equal(editedUploads(files, ['x', 'x']), null, 'duplicate keep');
assert.equal(editedUploads(files, ['other']), null, 'a file from someone else');

const now = Date.parse('2026-11-05T00:00:00.000Z');
assert.deepEqual(restorableSubmission({restoreUntil: '2026-11-19T00:00:00.000Z', deletedAt: '2026-11-05T00:00:00.000Z', uploads: [{}, {}]}, now), {deletedAt: '2026-11-05T00:00:00.000Z', restoreUntil: '2026-11-19T00:00:00.000Z', fileCount: 2});
assert.equal(restorableSubmission({restoreUntil: '2026-11-04T00:00:00.000Z'}, now), null);
assert.equal(restorableSubmission(null, now), null);
