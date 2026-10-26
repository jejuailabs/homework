import assert from 'node:assert/strict';
import test from 'node:test';
import {missingActiveVideoJobIds, studentAssignmentSections, videoReconciliationDue} from './student-assignment-view';

test('student homework separates actionable tasks from submitted feedback without losing legacy tasks', () => {
  const tasks = [
    {id: 'old-visible', status: 'pending' as const},
    {id: 'revision', status: 'revision' as const},
    {id: 'submitted', status: 'submitted' as const},
    {id: 'done', status: 'done' as const},
    {id: 'hidden', status: 'pending' as const, visibility: 'hidden'},
  ];
  const result = studentAssignmentSections(tasks);
  assert.deepEqual(result.todo.map(row => row.id), ['old-visible', 'revision']);
  assert.deepEqual(result.history.map(row => row.id), ['submitted', 'done']);
  assert.equal(studentAssignmentSections([{...tasks[4], visibility: 'visible'}]).todo[0].id, 'hidden');
});

test('accepted video submissions do not appear as the next homework while processing', () => {
  const tasks = [
    {id: 'queued', status: 'pending' as const, videoJob: {status: 'queued'}},
    {id: 'processing', status: 'pending' as const, videoJob: {status: 'processing'}},
    {id: 'retrying', status: 'pending' as const, videoJob: {status: 'failed', retryable: true}},
    {id: 'needs-new-video', status: 'pending' as const, videoJob: {status: 'failed', retryable: false}},
    {id: 'revision', status: 'revision' as const, videoJob: {status: 'complete'}},
  ];
  const result = studentAssignmentSections(tasks);
  assert.deepEqual(result.todo.map(row => row.id), ['needs-new-video', 'revision']);
  assert.deepEqual(result.history.map(row => row.id), ['queued', 'processing', 'retrying']);
});

test('student sections retain every visible task beyond 200 and never mutate the source', () => {
  const tasks = Array.from({length: 261}, (_, index) => Object.freeze({id: String(index), status: 'pending' as const}));
  const result = studentAssignmentSections(Object.freeze(tasks));
  assert.equal(result.todo.length, 261);
  assert.equal(result.todo[260].id, '260');
  assert.equal(tasks.length, 261);
});

test('missing queued or retrying video jobs trigger home reconciliation without disturbing completed jobs', () => {
  const assignments = [
    {id: 'hidden-a', videoJob: {id: 'job-a', status: 'queued'}},
    {id: 'visible-b', videoJob: {id: 'job-b', status: 'processing'}},
    {id: 'hidden-c', videoJob: {id: 'job-c', status: 'failed', retryable: true}},
    {id: 'old-d', videoJob: {id: 'job-d', status: 'complete'}},
    {id: 'retry-e', videoJob: {id: 'job-e', status: 'failed', retryable: false}},
  ];
  assert.deepEqual(missingActiveVideoJobIds(assignments, [{assignmentId: 'visible-b'}]), ['job-a', 'job-c']);
  assert.deepEqual(missingActiveVideoJobIds([assignments[1]], [{assignmentId: 'visible-b'}]), []);
});

test('missing job reconciliation retries after failures at most once per 30 seconds per job', () => {
  const attempts = new Map<string, number>();
  assert.deepEqual(videoReconciliationDue(['job-a'], attempts, 1_000), ['job-a']);
  attempts.set('job-a', 1_000);
  assert.deepEqual(videoReconciliationDue(['job-a'], attempts, 5_000), []);
  assert.deepEqual(videoReconciliationDue(['job-a', 'job-b'], attempts, 5_000), ['job-b']);
  assert.deepEqual(videoReconciliationDue(['job-a'], attempts, 30_999), []);
  assert.deepEqual(videoReconciliationDue(['job-a'], attempts, 31_000), ['job-a']);
});
