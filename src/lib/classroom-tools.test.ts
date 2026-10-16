import test from 'node:test';
import assert from 'node:assert/strict';
import {bracketSlots, calendarDayDifference, countdownRemaining, formatDuration, ladderDestination, ladderPath, makeGroups, makeLadder, parseParticipants, randomInteger, safeVideoUrl, shuffle} from './classroom-tools';

test('secure random integer rejects invalid bounds and stays in range', () => {
  for (const bound of [0, -1, 1.2, NaN, Infinity, 0x100000001]) assert.throws(() => randomInteger(bound));
  for (const bound of [1, 3, 30, 100, 0x100000000]) for (let i = 0; i < 30; i++) {const value = randomInteger(bound); assert.ok(Number.isInteger(value) && value >= 0 && value < bound);}
});
test('shuffle preserves identities and does not mutate the input', () => {
  const original = [{id: 1}, {id: 2}, {id: 3}, {id: 4}]; const result = shuffle(original, () => 0);
  assert.deepEqual(original.map(v => v.id), [1, 2, 3, 4]); assert.deepEqual(result.map(v => v.id), [2, 3, 4, 1]); assert.equal(new Set(result).size, original.length);
});
test('groups allocate everyone exactly once and differ in size by at most one', () => {
  for (let count = 1; count <= 12; count++) {
    const people = Array.from({length: 29}, (_, i) => i); const groups = makeGroups(people, count, () => 0);
    assert.deepEqual(groups.flat().sort((a, b) => a - b), people); assert.ok(Math.max(...groups.map(g => g.length)) - Math.min(...groups.map(g => g.length)) <= 1);
  }
  assert.deepEqual(makeGroups([], 3), []); assert.equal(makeGroups(['a', 'b'], 4).length, 2); assert.throws(() => makeGroups(['a'], 0));
});
test('identical names remain separate participants', () => {assert.deepEqual(parseParticipants(' 민준 \n\n민준\r\n 3. 서연 '), ['민준', '민준', '3. 서연']); assert.equal(makeGroups(['민준', '민준'], 2).flat().length, 2);});
test('participant input is capped without accepting empty rows', () => {assert.equal(parseParticipants(Array.from({length: 150}, (_, i) => `${i}`).join('\n')).length, 100); assert.equal(parseParticipants('a'.repeat(1000))[0].length, 80);});
test('every ladder is a bijection with valid trace endpoints', () => {
  for (let columns = 2; columns <= 30; columns++) {
    let step = 0; const ladder = makeLadder(columns, 60, bound => step++ % bound); const destinations = Array.from({length: columns}, (_, i) => ladderDestination(ladder, i));
    assert.equal(new Set(destinations).size, columns);
    for (let i = 0; i < columns; i++) {const path = ladderPath(ladder, i); assert.deepEqual(path[0], [i, 0]); assert.deepEqual(path.at(-1), [destinations[i], 61]); assert.ok(path.every(([x]) => x >= 0 && x < columns));}
  }
});
test('ladder rejects unsupported sizes and invalid starts', () => {assert.throws(() => makeLadder(1)); assert.throws(() => makeLadder(31)); assert.throws(() => ladderDestination(makeLadder(3), 3));});
test('bracket gives every entrant one slot and only one entrant per bye pair', () => {
  for (let count = 2; count <= 64; count++) {const people = Array.from({length: count}, (_, i) => i); const slots = bracketSlots(people, () => 0); assert.equal(slots.length, 2 ** Math.ceil(Math.log2(count))); assert.deepEqual(slots.filter(v => v !== null).sort((a, b) => a! - b!), people); for (let i = 0; i < slots.length; i += 2) assert.notEqual(slots[i], null);}
  assert.throws(() => bracketSlots([1])); assert.throws(() => bracketSlots(Array(65).fill('x')));
});
test('countdown uses wall-clock deadlines, including a background-tab delay', () => {assert.equal(countdownRemaining(100000, 40000), 60); assert.equal(countdownRemaining(100000, 99400), 1); assert.equal(countdownRemaining(100000, 300000), 0);});
test('timer formats long durations without wrapping minutes', () => {assert.equal(formatDuration(65), '01:05'); assert.equal(formatDuration(3661), '1:01:01'); assert.equal(formatDuration(-3), '00:00');});
test('day count uses calendar days and rejects impossible dates', () => {const today = new Date(2026, 9, 14, 23, 59); assert.equal(calendarDayDifference('2026-10-15', today), 1); assert.equal(calendarDayDifference('2026-10-14', today), 0); assert.equal(calendarDayDifference('2026-10-13', today), -1); assert.equal(calendarDayDifference('2026-02-30', today), null); assert.equal(calendarDayDifference('', today), null);});
test('video embeds accept only exact supported hosts and canonical video IDs', () => {assert.deepEqual(safeVideoUrl('https://youtu.be/abcdefghijk?t=3'), {kind: 'youtube', url: 'https://www.youtube-nocookie.com/embed/abcdefghijk'}); assert.equal(safeVideoUrl('https://youtube.com.evil.example/watch?v=abcdefghijk'), null); assert.equal(safeVideoUrl('javascript:alert(1)'), null); assert.equal(safeVideoUrl('https://youtube.com/watch?v=../../evil'), null); assert.equal(safeVideoUrl('https://example.com/video.mp4?token=1')?.kind, 'file');});
