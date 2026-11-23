import assert from 'node:assert/strict';
import test from 'node:test';
import {badgeLabel, isRecent, newAssignmentIds, newItemIds, newsCutoff, seenIds, seenRequest} from './student-news';

const now = Date.parse('2026-11-24T09:00:00.000Z');
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

test('only recent, unopened items are new', () => {
  const items = [
    {id: 'fresh', createdAt: daysAgo(1)},
    {id: 'opened', createdAt: daysAgo(1)},
    {id: 'old', createdAt: daysAgo(30)},
    {id: 'edge', createdAt: daysAgo(14)},
    {id: 'broken', createdAt: 'not a date'},
    {id: 'missing'},
  ];
  assert.deepEqual(newItemIds(items, new Set(['opened']), now), ['fresh', 'edge']);
  assert.equal(isRecent(new Date(now + 3_600_000).toISOString(), now), false, 'a clock far in the future is not trusted');
  assert.equal(newsCutoff(now), daysAgo(14));
});

test('submitted or reviewed homework never shows as new', () => {
  const items = [
    {id: 'todo', createdAt: daysAgo(2), status: 'pending'},
    {id: 'sent', createdAt: daysAgo(2), status: 'submitted'},
    {id: 'redo', createdAt: daysAgo(2), status: 'revision'},
    {id: 'done', createdAt: daysAgo(2), status: 'done'},
  ];
  assert.deepEqual(newAssignmentIds(items, new Set(), now), ['todo']);
});

test('seen maps and requests are read defensively', () => {
  assert.deepEqual([...seenIds({a: '2026-11-01', b: '2026-11-02'})], ['a', 'b']);
  assert.equal(seenIds(null).size, 0);
  assert.equal(seenIds(['a']).size, 0);
  assert.deepEqual(seenRequest({kind: 'assignments', id: 'abc_1-2'}), {kind: 'assignments', id: 'abc_1-2'});
  assert.equal(seenRequest({kind: 'exhibitions', id: 'abc'}), null, 'exhibitions keep their own visit record');
  assert.equal(seenRequest({kind: 'boards', id: '../x'}), null);
  assert.equal(seenRequest({kind: 'boards', id: 'x'.repeat(129)}), null);
  assert.equal(seenRequest('boards'), null);
});

test('badge labels stay short', () => {
  assert.equal(badgeLabel(3), '3');
  assert.equal(badgeLabel(12), '9+');
});
