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

test('QR exhibition entry survives sign-in with only a validated room and the signed-in role', () => {
  assert.equal(loginDestination('student', '/teacher/exhibitions?exhibition=room-123'), '/student/exhibitions?exhibition=room-123');
  assert.equal(loginDestination('teacher', '/student/exhibitions?exhibition=room-123&next=https://evil.example'), '/teacher/exhibitions?exhibition=room-123');
  for (const next of ['/student/exhibitions?exhibition=..%2Fprivate', '/student/exhibitions?exhibition=https://evil.example']) {
    assert.equal(loginDestination('student', next), '/student/exhibitions');
  }
  assert.equal(loginDestination('student', '//evil.example/student/exhibitions?exhibition=room'), '/student');
});

test('poll and canvas QR destinations return to the matching student or teacher tools after sign in', () => {
 assert.equal(loginDestination('student','/student/polls?poll=class-poll'),'/student/polls?poll=class-poll');
 assert.equal(loginDestination('teacher','/student/polls?poll=class-poll'),'/teacher/tools/vote?poll=class-poll');
 assert.equal(loginDestination('student','/student/canvases?canvas=shared-doc'),'/student/canvases?canvas=shared-doc');
 assert.equal(loginDestination('teacher','/student/canvases?canvas=shared-doc'),'/teacher/tools/canvas?canvas=shared-doc');
 assert.equal(loginDestination('student','https://evil.example/student/polls?poll=x'),'/student');
});
