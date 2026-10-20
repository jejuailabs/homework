import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsSubmissionFile, assignmentSubmissionType, imageSubmissionMimeTypes, videoSubmissionMimeTypes } from '../assignment-submission';
import { validSessionAuthentication, ApiError, canDisableUser, canManageClass, canUseUpload, nextReview, requiredSubmissionType, submissionContentPolicy, uploadPolicy, validStudentSession } from './policy';

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

test('new assignments require an explicit format while old assignments stay compatible', () => {
  for (const type of ['text', 'image', 'video'] as const) {
    assert.equal(requiredSubmissionType(type), type);
    assert.equal(assignmentSubmissionType(type), type);
  }
  for (const value of [undefined, null, '', 'legacy', 'pdf', 'IMAGE', {}, 0]) {
    assert.equal(assignmentSubmissionType(value), 'legacy');
    assert.throws(() => requiredSubmissionType(value), (error: unknown) => error instanceof ApiError && error.status === 400 && error.code === 'SUBMISSION_TYPE');
  }
});

test('text assignments require writing and reject attachments, even with a caption', () => {
  assert.doesNotThrow(() => submissionContentPolicy('text', '오늘 배운 내용을 적었어요.', 0));
  for (const [answer, files] of [['', 0], [' \n ', 0], ['답이 있어도 파일은 안 돼요.', 1], ['', 1]] as const) {
    assert.throws(() => submissionContentPolicy('text', answer, files), (error: unknown) => error instanceof ApiError && error.code === 'SUBMISSION_CONTENT');
  }
  for (const mime of [...imageSubmissionMimeTypes, ...videoSubmissionMimeTypes, 'application/pdf']) {
    assert.equal(acceptsSubmissionFile('text', mime), false);
    assert.throws(() => uploadPolicy(mime, 100, 'text'), (error: unknown) => error instanceof ApiError && error.code === 'SUBMISSION_FILE_TYPE');
  }
});

test('image and video assignments require their media and permit an optional caption', () => {
  for (const type of ['image', 'video'] as const) {
    assert.throws(() => submissionContentPolicy(type, '', 0));
    assert.throws(() => submissionContentPolicy(type, '설명만 적었어요.', 0));
    assert.doesNotThrow(() => submissionContentPolicy(type, '', 1));
    if(type==='video')assert.throws(()=>submissionContentPolicy(type,'짧은 설명이에요.',2));
    else assert.doesNotThrow(() => submissionContentPolicy(type, '짧은 설명이에요.', 10));
  }
  for (const mime of imageSubmissionMimeTypes) {
    assert.equal(acceptsSubmissionFile('image', mime), true);
    assert.doesNotThrow(() => uploadPolicy(mime, 100, 'image'));
    assert.throws(() => uploadPolicy(mime, 100, 'video'));
  }
  for (const mime of videoSubmissionMimeTypes) {
    assert.equal(acceptsSubmissionFile('video', mime), true);
    assert.doesNotThrow(() => uploadPolicy(mime, 100, 'video'));
    assert.throws(() => uploadPolicy(mime, 100, 'image'));
  }
  for (const type of ['image', 'video'] as const) {
    assert.equal(acceptsSubmissionFile(type, 'application/pdf'), false);
    assert.throws(() => uploadPolicy('application/pdf', 100, type));
    assert.throws(() => uploadPolicy('application/octet-stream', 100, type));
  }
});

test('legacy assignments keep text, images, PDF, and videos without accepting empty submissions', () => {
  assert.doesNotThrow(() => submissionContentPolicy('legacy', '기존 글쓰기 숙제', 0));
  assert.doesNotThrow(() => submissionContentPolicy('legacy', '', 1));
  assert.throws(() => submissionContentPolicy('legacy', '  ', 0));
  for (const mime of [...imageSubmissionMimeTypes, ...videoSubmissionMimeTypes, 'application/pdf']) {
    assert.equal(acceptsSubmissionFile('legacy', mime), true);
    assert.doesNotThrow(() => uploadPolicy(mime, 100, 'legacy'));
  }
  assert.equal(acceptsSubmissionFile('legacy', undefined), false);
  assert.equal(acceptsSubmissionFile('legacy', 'text/html'), false);
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

test('session revocation keeps exact Firebase authentication-time boundaries and rejects malformed times', () => {
  assert(validSessionAuthentication(100,'1970-01-01T00:01:40.000Z'));
  assert(!validSessionAuthentication(99,'1970-01-01T00:01:40.000Z'));
  assert(validSessionAuthentication(101,'1970-01-01T00:01:40.000Z'));
  for(const value of [undefined,null,'100',NaN,1.5,-1])assert(!validSessionAuthentication(value));
  assert(!validSessionAuthentication(100,'invalid'));
});
