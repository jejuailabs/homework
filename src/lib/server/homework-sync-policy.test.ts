import assert from 'node:assert/strict';
import test from 'node:test';
import {editedHomeworkSync, homeworkSyncTargets, submissionTypeChange, syncDue, syncableUploads} from './homework-sync-policy';

test('turning a room on creates it only when there is none to reuse', () => {
  const on = editedHomeworkSync(null, null, {exhibition: true, board: false});
  assert.deepEqual(on.create, {exhibition: true, board: false});
  assert.equal(on.added, true);
  const back = editedHomeworkSync({exhibitionId: null, boardId: null}, {exhibitionId: 'e1'}, {exhibition: true, board: false});
  assert.deepEqual(back.sync, {exhibitionId: 'e1', boardId: null});
  assert.deepEqual(back.paused, {exhibitionId: null, boardId: null});
  assert.deepEqual(back.create, {exhibition: false, board: false});
  assert.equal(back.added, true);
});

test('turning a room off keeps it remembered and adds nothing', () => {
  const off = editedHomeworkSync({exhibitionId: 'e1', boardId: 'b1'}, null, {exhibition: false, board: true});
  assert.deepEqual(off.sync, {exhibitionId: null, boardId: 'b1'});
  assert.deepEqual(off.paused, {exhibitionId: 'e1', boardId: null});
  assert.equal(off.added, false);
  assert.deepEqual(editedHomeworkSync({exhibitionId: 'e1', boardId: null}, null, {exhibition: true, board: false}).create, {exhibition: false, board: false});
});

test('homework auto-sync is off unless the teacher ticks it', () => {
  assert.deepEqual(homeworkSyncTargets(undefined, 'image'), {exhibition: false, board: false});
  assert.deepEqual(homeworkSyncTargets({}, 'video'), {exhibition: false, board: false});
  assert.deepEqual(homeworkSyncTargets({exhibition: true, board: true}, 'image'), {exhibition: true, board: true});
  assert.deepEqual(homeworkSyncTargets({board: true}, 'text'), {exhibition: false, board: true});
});

test('text homework never feeds an exhibition and bad input is refused', () => {
  assert.throws(() => homeworkSyncTargets({exhibition: true}, 'text'), /전시실에 연동되지 않아요/);
  assert.throws(() => homeworkSyncTargets({exhibition: 'yes'}, 'image'), /자동 연동 설정/);
  assert.throws(() => homeworkSyncTargets([true], 'image'), /자동 연동 설정/);
});

test('exhibitions take photos (HEIC too) and processed videos only', () => {
  const media = syncableUploads([
    {path: 'a.txt', contentType: 'text/plain'},
    {path: 'raw.mov', contentType: 'video/quicktime'},
    {path: 'v.mp4', contentType: 'video/mp4', thumbnailPath: 'v.jpg'},
    {path: 'p.heic', contentType: 'image/heic', thumbnailPath: 'p.jpg'},
    {contentType: 'image/png'},
  ]);
  assert.deepEqual(media.map(item => [item.kind, item.upload.path]), [['video', 'v.mp4'], ['image', 'p.heic']]);
});

test('a failed sync retries three times per attempt; a new attempt always syncs', () => {
  assert.equal(syncDue(undefined, 'a1'), true);
  assert.equal(syncDue({attemptId: 'a1', status: 'synced'}, 'a1'), false);
  assert.equal(syncDue({attemptId: 'a1', status: 'synced'}, 'a2'), true);
  assert.equal(syncDue({attemptId: 'a1', status: 'failed', tries: 2}, 'a1'), true);
  assert.equal(syncDue({attemptId: 'a1', status: 'failed', tries: 3}, 'a1'), false);
});

test('recording homework can feed a board but never an exhibition', () => {
  assert.throws(() => homeworkSyncTargets({exhibition: true}, 'audio'), (error: unknown) => (error as {code?: string}).code === 'SYNC_AUDIO_EXHIBITION');
  assert.deepEqual(homeworkSyncTargets({board: true}, 'audio'), {exhibition: false, board: true});
});

test('a homework room changes its submission type only before anyone hands in', () => {
  assert.equal(submissionTypeChange('text', undefined, true), null);
  assert.equal(submissionTypeChange('text', 'text', true), null);
  assert.equal(submissionTypeChange('legacy', 'legacy', true), null);
  assert.equal(submissionTypeChange('text', 'image', false), 'image');
  assert.equal(submissionTypeChange('legacy', 'audio', false), 'audio');
  assert.throws(() => submissionTypeChange('text', 'image', true), (error: unknown) => (error as {code?: string; status?: number}).code === 'SUBMISSION_TYPE_LOCKED' && (error as {status?: number}).status === 409);
  assert.throws(() => submissionTypeChange('text', 'drawing', false), (error: unknown) => (error as {code?: string}).code === 'SUBMISSION_TYPE');
});
