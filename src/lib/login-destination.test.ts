import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loginDestination} from './login-destination';

test('shared boards survive sign-in and use the authenticated role', () => {
  assert.equal(loginDestination('student', '/teacher/boards?board=board-123'), '/student/boards?board=board-123');
  assert.equal(loginDestination('teacher', '/student/boards?board=board-123'), '/teacher/boards?board=board-123');
  assert.equal(loginDestination('superadmin', null), '/teacher');
  assert.equal(loginDestination('student', null), '/student');
});

test('login continuation rejects external URLs and unrelated routes', () => {
  for (const next of ['https://evil.example', '//evil.example/student/boards', '/student/boards/../../admin', '/admin', '/teacher/boards?board=..%2Fprivate']) {
    assert(!loginDestination('student', next).includes('evil'));
    assert(['/student', '/student/boards'].includes(loginDestination('student', next)));
  }
  assert.equal(loginDestination('teacher', '/teacher/boards?board=one&classId=untrusted&next=https://evil.example'), '/teacher/boards?board=one');
});
