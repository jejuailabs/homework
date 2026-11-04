import assert from 'node:assert/strict';
import {assignmentKind, findAssignments, monthKey} from './assignment-finder';

const tasks = [
  {id: 'a', title: '수학 익힘 35쪽', submissionType: 'image', createdAt: '2026-10-02T01:00:00.000Z', dueAt: '2026-11-10T00:00:00.000Z'},
  {id: 'b', title: '주제글쓰기', submissionType: 'text', createdAt: '2026-11-01T01:00:00.000Z', dueAt: null},
  {id: 'c', title: '주제글쓰기-낭독', submissionType: 'video', createdAt: '2026-11-03T01:00:00.000Z', dueAt: '2026-11-05T00:00:00.000Z'},
  {id: 'd', title: '옛 숙제', createdAt: '2026-09-01T01:00:00.000Z'},
];
const ids = (rows: {id: string}[]) => rows.map(row => row.id);

assert.deepEqual(ids(findAssignments(tasks, {})), ['c', 'b', 'a', 'd'], 'newest first by default');
assert.deepEqual(ids(findAssignments(tasks, {order: 'old'})), ['d', 'a', 'b', 'c']);
assert.deepEqual(ids(findAssignments(tasks, {order: 'due'})), ['c', 'a', 'b', 'd'], 'due soonest, then no due date by newest');
assert.deepEqual(ids(findAssignments(tasks, {kind: 'image'})), ['a']);
assert.deepEqual(ids(findAssignments(tasks, {kind: 'legacy'})), ['d'], 'missing type counts as legacy');
assert.deepEqual(ids(findAssignments(tasks, {query: ' 주제  낭독 '})), ['c'], 'every word must appear in the title');
assert.deepEqual(ids(findAssignments(tasks, {query: '수학', kind: 'text'})), []);
assert.equal(assignmentKind('video'), 'video');
assert.equal(assignmentKind('pdf'), 'legacy');
assert.equal(monthKey(undefined), '');
assert.match(monthKey('2026-11-03T01:00:00.000Z'), /^2026-11$/);
console.log('assignment finder: ok');
