import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeTeacherDashboard, type DashboardRecord } from './teacher-dashboard-policy';

const teacher = { uid: 'teacher-a', role: 'teacher' as const, displayName: 'Teacher' };
const now = new Date('2026-10-13T00:00:00.000Z');
const classroom = { id: 'class-a', ownerUid: teacher.uid, name: '3-1', grade: '3', year: 2026, studentCount: 8 };
const assignment = { id: 'task-a', ownerUid: teacher.uid, classId: classroom.id, title: 'Homework', targetStudentIds: ['a', 'b', 'c', 'd'], targetCount: 4, createdAt: '2026-10-01T00:00:00.000Z', dueAt: '2026-10-12T00:00:00.000Z' };
const submission = (studentId: string, status: string): DashboardRecord => ({ id: `${assignment.id}_${studentId}`, assignmentId: assignment.id, classId: classroom.id, studentId, status });

test('dashboard separates checked, revision, awaiting-review and not-submitted counts', () => {
  const result = summarizeTeacherDashboard(teacher, {
    classes: [classroom], assignments: [{ ...assignment, submittedCount: 99, reviewedCount: 99 }], exhibitions: [],
    submissions: [submission('a', 'submitted'), submission('b', 'done'), submission('c', 'revision')],
  }, now);
  const task = result.assignments[0];
  assert.deepEqual([task.pending, task.submitted, task.done, task.revision, task.overdue], [1, 1, 1, 1, 1]);
  assert.equal(task.pending + task.submitted + task.done + task.revision, task.targetCount);
  assert.equal(task.submissionType, 'legacy');
  assert.equal(result.generatedAt, now.toISOString());
});

test('dashboard counts only the assignment roster snapshot, not later additions or orphan attempts', () => {
  const result = summarizeTeacherDashboard(teacher, {
    classes: [classroom], assignments: [{ ...assignment, targetStudentIds: ['a', 'a', 'b'] }], exhibitions: [],
    submissions: [submission('a', 'done'), submission('a', 'done'), submission('c', 'done'),
      { ...submission('b', 'done'), id: 'attempt-b' },
      { ...submission('b', 'done'), classId: 'foreign-class' },
      { ...submission('b', 'done'), status: 'deleted' },
      { ...submission('b', 'done'), assignmentId: 'missing-task' }],
  }, now);
  assert.equal(result.classes[0].studentCount, 8);
  assert.deepEqual(result.assignments.map(({ targetCount, pending, done }) => ({ targetCount, pending, done })), [{ targetCount: 2, pending: 1, done: 1 }]);
});

test('dashboard never widens ownership for platform administrators or dangling class references', () => {
  const result = summarizeTeacherDashboard({ ...teacher, role: 'superadmin' }, {
    classes: [classroom, { ...classroom, id: 'foreign-class', ownerUid: 'another-teacher' }],
    assignments: [assignment, { ...assignment, id: 'foreign-task', ownerUid: 'another-teacher' },
      { ...assignment, id: 'foreign-class-task', classId: 'foreign-class' }, { ...assignment, id: 'orphan-task', classId: 'missing-class' }],
    submissions: [submission('a', 'done')],
    exhibitions: [{ id: 'own-show', ownerUid: teacher.uid, classId: classroom.id, status: 'open' },
      { id: 'foreign-show', ownerUid: 'another-teacher', classId: classroom.id },
      { id: 'orphan-show', ownerUid: teacher.uid, classId: 'missing-class' }],
  }, now);
  assert.deepEqual(result.classes.map(row => row.id), [classroom.id]);
  assert.deepEqual(result.assignments.map(row => row.id), [assignment.id]);
  assert.deepEqual(result.exhibitions.map(row => row.id), ['own-show']);
  assert.equal(result.viewer.role, 'superadmin');
});

test('dashboard rejects students and returns an honest empty state for a teacher with no classes', () => {
  const empty = { classes: [], assignments: [], submissions: [], exhibitions: [] };
  assert.throws(() => summarizeTeacherDashboard({ ...teacher, role: 'student' }, empty, now), { status: 403, code: 'FORBIDDEN' });
  assert.deepEqual(summarizeTeacherDashboard(teacher, empty, now), {
    viewer: { displayName: 'Teacher', role: 'teacher' }, classes: [], assignments: [], exhibitions: [], generatedAt: now.toISOString(),
  });
});

test('dashboard does not mark open deadlines or malformed legacy dates overdue', () => {
  const result = summarizeTeacherDashboard(teacher, {
    classes: [classroom], submissions: [], exhibitions: [], assignments: [
      { ...assignment, id: 'future', dueAt: '2027-01-01T00:00:00.000Z', submissionType: 'image' },
      { ...assignment, id: 'invalid', dueAt: 'not-a-date', createdAt: null },
      { ...assignment, id: 'exactly-now', dueAt: now.toISOString() },
      { ...assignment, id: 'no-deadline', dueAt: null },
    ],
  }, now);
  assert.equal(result.assignments.some(row => row.overdue !== 0), false);
  assert.equal(result.assignments.find(row => row.id === 'invalid')?.createdAt, null);
  assert.equal(result.assignments.find(row => row.id === 'invalid')?.dueAt, null);
  assert.equal(result.assignments.find(row => row.id === 'future')?.submissionType, 'image');
});

test('a full-year dashboard preserves more than 200 assignments with deterministic ordering', () => {
  const tasks = Array.from({ length: 251 }, (_, i) => ({ ...assignment, id: `task-${String(i).padStart(3, '0')}` }));
  const result = summarizeTeacherDashboard(teacher, {
    classes: [classroom], assignments: tasks.reverse(), submissions: [],
    exhibitions: [{ id: 'show-a', ownerUid: teacher.uid, classId: classroom.id, status: 'open', artworkCount: 25, approvedCount: 25, createdAt: assignment.createdAt }],
  }, now);
  assert.equal(result.assignments.length, 251);
  assert.equal(result.assignments[0].id, 'task-000');
  assert.equal(result.assignments[250].id, 'task-250');
  assert.equal(result.exhibitions[0].artworkCount, 25);
  assert.equal(result.exhibitions[0].approvedCount, 25);
});
