import test from 'node:test';
import assert from 'node:assert/strict';
import {hallOf, latestHall, summarizeHalls} from './exhibition-halls';

const room = (id: string, theme: string | undefined, createdAt: string) => ({id, theme, createdAt, title: id}) as never;

test('space/ocean themes are their own halls; all classic colours share 포근한 미술실', () => {
  assert.equal(hallOf('cozy'), 'cozy');
  assert.equal(hallOf('forest'), 'cozy');
  assert.equal(hallOf('sky'), 'cozy');
  assert.equal(hallOf('ocean'), 'cozy');
  assert.equal(hallOf('saturn'), 'saturn');
  assert.equal(hallOf('moon'), 'moon');
  assert.equal(hallOf('lagoon'), 'lagoon');
  assert.equal(hallOf(undefined), 'cozy');
  assert.equal(hallOf('mystery' as never), 'cozy');
});

test('halls group rooms newest first, keep saved empty halls, and mark the newest hall', () => {
  const halls = summarizeHalls([room('a', 'cozy', '2026-11-01'), room('b', 'moon', '2026-11-05'), room('c', 'forest', '2026-11-03')], ['saturn']);
  assert.deepEqual(halls.map(hall => [hall.kind, hall.count, hall.rooms.map(item => item.id)]), [['cozy', 2, ['c', 'a']], ['moon', 1, ['b']], ['saturn', 0, []]]);
  assert.equal(latestHall(halls), 'moon');
  const empty = summarizeHalls([], ['saturn']);
  assert.deepEqual(empty.map(hall => [hall.kind, hall.count, hall.saved]), [['saturn', 0, true]]);
  assert.equal(latestHall(empty), null);
});
