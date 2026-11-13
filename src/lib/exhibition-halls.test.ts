import test from 'node:test';
import assert from 'node:assert/strict';
import {hallOf, latestHall, summarizeHalls} from './exhibition-halls';

const room = (id: string, theme: string | undefined, createdAt: string) => ({id, theme, createdAt, title: id}) as never;

test('a room joins its hall by theme; rooms with no theme stay in the classic hall', () => {
  assert.equal(hallOf('cozy'), 'classic');
  assert.equal(hallOf('ocean'), 'classic');
  assert.equal(hallOf('saturn'), 'space');
  assert.equal(hallOf(undefined), 'classic');
});

test('halls group rooms newest first, keep saved empty halls, and mark the newest hall', () => {
  const halls = summarizeHalls([room('a', 'cozy', '2026-11-01'), room('b', 'moon', '2026-11-05'), room('c', 'sky', '2026-11-03')], ['space']);
  assert.deepEqual(halls.map(hall => [hall.kind, hall.count, hall.rooms.map(item => item.id)]), [['classic', 2, ['c', 'a']], ['space', 1, ['b']]]);
  assert.equal(latestHall(halls), 'space');
  const empty = summarizeHalls([], ['space']);
  assert.deepEqual(empty.map(hall => [hall.kind, hall.count, hall.saved]), [['space', 0, true]]);
  assert.equal(latestHall(empty), null);
});
