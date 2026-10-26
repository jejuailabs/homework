import assert from 'node:assert/strict';
import test from 'node:test';
import {dashboardRoster, dashboardSubmissionDetails} from './teacher-dashboard-details-policy';

const teacher = {uid: 'teacher-a', role: 'teacher' as const};
const now = new Date('2026-10-13T00:00:00Z');
const classroom = {id: 'class-a', ownerUid: teacher.uid, studentCount: 4};
const task = {id: 'task-a', ownerUid: teacher.uid, classId: classroom.id, targetStudentIds: ['a', 'b', 'c', 'd'], title: '가을 숙제', createdAt: '2026-09-01T00:00:00Z', dueAt: '2026-10-12T00:00:00Z'};
const students = ['a', 'b', 'c', 'd', 'late'].map((id, i) => ({id, name: `학생 ${id}`, number: i + 1, character: 'hamster', accessCode: 'DO_NOT_RETURN', authUid: 'PRIVATE'}));
const submission = (studentId: string, status: string) => ({id: `task-a_${studentId}`, assignmentId: task.id, classId: classroom.id, studentId, status, text: 'DO_NOT_RETURN', uploads: ['PRIVATE_URL'], submittedAt: '2026-10-11T00:00:00Z', reviewedAt: '2026-10-12T00:00:00Z'});
const records = {classroom, assignments: [task], students, submissions: [submission('a', 'submitted'), submission('b', 'done'), submission('c', 'revision')]};
const scope = {status: 'pending' as const, period: 'all' as const, year: 2026};

test('all four card detail states list exactly their original targeted students', () => {
  for (const [status, studentId] of [['submitted', 'a'], ['done', 'b'], ['revision', 'c'], ['pending', 'd']] as const) {
    const result = dashboardSubmissionDetails(teacher, records, {...scope, status}, now);
    assert.equal(result.total, 1); assert.equal(result.unavailableCount, 0);
    assert.deepEqual(result.rows.map(row => row.student.id), [studentId]);
    assert.equal(result.rows[0].status, status);
    assert.equal(result.rows[0].overdue, status === 'pending');
  }
});

test('detail lists reject attempts, foreign-class submissions, and students added after task creation', () => {
  const result = dashboardSubmissionDetails(teacher, {...records, submissions: [
    {...submission('a', 'done'), id: 'attempt-a'}, {...submission('b', 'done'), classId: 'foreign'},
    submission('late', 'done'), {...submission('c', 'done'), status: 'invalid'}, submission('d', 'done'), submission('d', 'done'),
  ]}, scope, now);
  assert.deepEqual(result.rows.map(row => row.student.id), ['a', 'b', 'c']);
  assert.equal(result.total, 3);
});

test('semester detail scope excludes older and foreign tasks while keeping their original snapshots', () => {
  const result = dashboardSubmissionDetails(teacher, {...records, assignments: [task,
    {...task, id: 'spring', createdAt: '2026-04-01T00:00:00Z'}, {...task, id: 'old', createdAt: '2025-10-01T00:00:00Z'},
    {...task, id: 'foreign', ownerUid: 'other-teacher'}, {...task, id: 'foreign-class', classId: 'other-class'},
  ]}, {...scope, period: 'second'}, now);
  assert.equal(result.total, 1); assert.equal(result.rows[0].assignmentId, task.id);
});

test('platform roles never permit card details for another teacher class', () => {
  for (const role of ['teacher', 'student', 'admin', 'superadmin'] as const) {
    assert.throws(() => dashboardSubmissionDetails({uid: 'other-teacher', role}, records, scope, now), {status: 403, code: 'FORBIDDEN'});
  }
  assert.throws(() => dashboardSubmissionDetails({...teacher, role: 'student'}, records, scope, now), {status: 403, code: 'FORBIDDEN'});
});

test('roster and submission summaries expose no codes, auth IDs, answers or attachments', () => {
  const detail = dashboardSubmissionDetails(teacher, records, {...scope, status: 'submitted'}, now);
  const roster = dashboardRoster(students);
  const value = JSON.stringify({detail, roster});
  for (const forbidden of ['accessCode', 'authUid', 'DO_NOT_RETURN', 'PRIVATE_URL', 'uploads']) assert(!value.includes(forbidden));
  assert.equal(detail.rows[0].submittedAt, '2026-10-11T00:00:00.000Z');
});

test('missing student records stay in the original task count and legacy missing snapshots are explicit', () => {
  const result = dashboardSubmissionDetails(teacher, {...records, students: [], assignments: [task, {...task, id: 'legacy', targetStudentIds: undefined, targetCount: 3}]}, scope, now);
  assert.equal(result.total, 4); assert.equal(result.unavailableCount, 3);
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].student.id, 'd'); assert.equal(result.rows[0].student.name, null);
});

test('hidden task detail counts and rows disappear together and reappear on restoration', () => {
  for (const status of ['pending', 'submitted', 'done', 'revision'] as const) {
    const original = dashboardSubmissionDetails(teacher, records, {...scope, status}, now);
    const hidden = dashboardSubmissionDetails(teacher, {...records, assignments: [{...task, visibility: 'hidden'}]}, {...scope, status}, now);
    assert.deepEqual(hidden, {rows: [], total: 0, unavailableCount: 0});
    const restored = dashboardSubmissionDetails(teacher, {...records, assignments: [{...task, visibility: 'visible'}]}, {...scope, status}, now);
    assert.deepEqual(restored, original);
  }
});
