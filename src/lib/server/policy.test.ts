import assert from 'node:assert/strict';
import test from 'node:test';
import { canDisableUser, canManageClass, canUseUpload, nextReview, uploadPolicy, validStudentSession } from './policy';

test('teacher and platform administrator class access always requires ownership', () => {
  for (const role of ['teacher', 'admin', 'superadmin'] as const) {
    assert.equal(canManageClass(role, 'owner-a', 'owner-a'), true);
    assert.equal(canManageClass(role, 'owner-a', 'owner-b'), false);
    assert.equal(canManageClass(role, 'owner-a', undefined), false);
  }
  assert.equal(canManageClass('student', 'student-a', 'student-a'), false);
});
test('only the first successful review grants growth credit', () => {
  assert.equal(nextReview('revision', false).reward, 0);
  assert.equal(nextReview('done', false).reward, 10);
  assert.equal(nextReview('done', true).reward, 0);
  assert.equal(nextReview('revision', true).reward, 0);
  assert.throws(() => nextReview('anything', false));
});
test('upload policy rejects executable types, fake sizes, and oversize files', () => {
  assert.equal(uploadPolicy('image/jpeg', 100 * 1024 * 1024).limit, 100 * 1024 * 1024);
  assert.equal(uploadPolicy('video/mp4', 250 * 1024 * 1024).limit, 250 * 1024 * 1024);
  assert.throws(() => uploadPolicy('application/octet-stream', 10));
  assert.throws(() => uploadPolicy('image/png', -1));
  assert.throws(() => uploadPolicy('image/png', Number.NaN));
  assert.throws(() => uploadPolicy('application/pdf', 100 * 1024 * 1024 + 1));
});
test('account suspension preserves self and higher privilege accounts', () => {
  assert.equal(canDisableUser('teacher', 'a', 'b', 'student'), false);
  assert.equal(canDisableUser('admin', 'a', 'b', 'teacher'), true);
  assert.equal(canDisableUser('admin', 'a', 'b', 'admin'), false);
  assert.equal(canDisableUser('superadmin', 'a', 'b', 'admin'), true);
  assert.equal(canDisableUser('superadmin', 'a', 'a', 'superadmin'), false);
  assert.equal(canDisableUser('superadmin', 'a', 'b', 'superadmin'), false);
});
test('a pending upload belongs to exactly one student and assignment', () => {
  const upload = { userUid: 'student-a', assignmentId: 'task-a', status: 'pending' };
  assert.equal(canUseUpload('student-a', 'task-a', upload), true);
  assert.equal(canUseUpload('student-b', 'task-a', upload), false);
  assert.equal(canUseUpload('student-a', 'task-b', upload), false);
  assert.equal(canUseUpload('student-a', 'task-a', { ...upload, status: 'submitted' }), false);
  assert.equal(canUseUpload('student-a', 'task-a', undefined), false);
});
test('code reset invalidates existing student sessions even before token revocation propagates', () => {
  assert.equal(validStudentSession(0, 0), true);
  assert.equal(validStudentSession(0, 1), false);
  assert.equal(validStudentSession(1, 1), true);
  assert.equal(validStudentSession(undefined, 0), false);
  assert.equal(validStudentSession('1', 1), false);
  assert.equal(validStudentSession(-1, -1), false);
});
