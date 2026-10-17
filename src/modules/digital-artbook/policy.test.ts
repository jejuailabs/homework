import test from 'node:test';
import assert from 'node:assert/strict';
import { bookDate, bookKeys, bookOptions, containImage, workInPeriod } from './policy';
test('artbook dates reject impossible dates, allow open ranges, and include both endpoints', () => {
  assert.equal(bookDate(''), ''); assert.equal(bookDate('2024-02-29'), '2024-02-29');
  for (const date of ['2026-02-29', '2026-13-01', 'yesterday', null]) assert.throws(() => bookDate(date));
  assert.equal(workInPeriod('2026-03-01', '2026-03-01', '2026-10-01'), true);
  assert.equal(workInPeriod('2026-10-01', '2026-03-01', '2026-10-01'), true);
  assert.equal(workInPeriod('2026-02-28', '2026-03-01', ''), false);
});
test('artbooks require distinct bounded stable work IDs and preserve manual ordering', () => {
  assert.deepEqual(bookKeys(['room:b', 'room:a']), ['room:b', 'room:a']);
  for (const keys of [[], ['room:a', 'room:a'], ['../room:a'], Array.from({length: 61}, (_, i) => 'room:' + i)]) assert.throws(() => bookKeys(keys));
});
test('display names and cover formats are explicit; portrait/landscape images fit without distortion', () => {
  const options = bookOptions({displayName: '작은 작가', format: 'a4', cover: 'sage'});
  assert.equal(options.voiceQr, false); assert.equal(options.title, '나의 작은 미술관');
  assert.throws(() => bookOptions({displayName: '', format: 'a4', cover: 'sage'}));
  assert.throws(() => bookOptions({...options, format: 'poster'}));
  assert.deepEqual(containImage(100, 200, 400, 400), {width: 200, height: 400});
  assert.deepEqual(containImage(200, 100, 400, 400), {width: 400, height: 200});
  assert.throws(() => containImage(0, 100, 400, 400));
});
