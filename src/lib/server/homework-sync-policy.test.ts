import assert from 'node:assert/strict';
import test from 'node:test';
import {homeworkSyncTargets, syncDue, syncableUploads} from './homework-sync-policy';

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
