import assert from 'node:assert/strict';
import test from 'node:test';
import {GREETING_COUNT, greetingPool, pickGreeting, remember, seoul} from './greetings';

// 2026-11-23 is a Monday. Times are Seoul (UTC+9).
const at = (iso: string) => Date.parse(`${iso}+09:00`);

test('the Seoul date is used whatever the computer clock says', () => {
  assert.equal(seoul(at('2026-11-24T00:30:00')).date, '2026-11-24');
  assert.equal(seoul(at('2026-11-23T23:59:00')).date, '2026-11-23');
});
test('the pool follows the time of day, the weekday and weekends', () => {
  const ids = (iso: string) => new Set(greetingPool(at(iso)).map(([id]) => id.replace(/\d+$/, '')));
  assert.ok(ids('2026-11-23T08:00:00').has('mo'));
  assert.ok(!ids('2026-11-24T08:00:00').has('mo'));
  assert.ok(ids('2026-11-27T08:00:00').has('fr'));
  assert.ok(ids('2026-11-24T08:00:00').has('wi'));
  assert.deepEqual([...ids('2026-11-24T14:00:00')], ['af']);
  assert.deepEqual([...ids('2026-11-24T19:00:00')], ['ev']);
  assert.deepEqual([...ids('2026-11-28T08:00:00')], ['we']);
  assert.ok(GREETING_COUNT >= 60);
});
test('a line shown in the last two weeks is not picked again while others remain', () => {
  const now = at('2026-11-24T08:00:00');
  const pool = greetingPool(now), ids = [...new Set(pool.map(([id]) => id))];
  const history = ids.slice(1).map(id => ({date: '2026-11-20', id}));
  assert.equal(pickGreeting(now, history, 0.99).id, ids[0]);
  // Older than two weeks no longer counts.
  assert.notEqual(pickGreeting(now, [{date: '2026-11-01', id: pool[0][0]}], 0).id, undefined);
  // Every line used: still answers instead of failing.
  assert.ok(pickGreeting(now, ids.map(id => ({date: '2026-11-23', id})), 0.5).text.length > 0);
});
test('history keeps one line per day and a few weeks only', () => {
  let history = remember([], '2026-11-24', 'wd1');
  history = remember(history, '2026-11-24', 'wd2');
  assert.deepEqual(history, [{date: '2026-11-24', id: 'wd2'}]);
  for (let day = 1; day <= 40; day++) history = remember(history, `2026-12-${String(day).padStart(2, '0')}`, 'pn1');
  assert.equal(history.length, 28);
});
