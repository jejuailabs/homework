import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNoOverlap, canvasMission, CanvasGroupError, splitIntoGroups, validateCanvasGroups} from './canvas-groups';

const roster = new Set(['a', 'b', 'c', 'd', 'e']);

test('auto split deals pupils in number order so group sizes differ by at most one', () => {
  const groups = splitIntoGroups([{id: 'c', number: 3}, {id: 'a', number: 1}, {id: 'e', number: 5}, {id: 'b', number: 2}, {id: 'd', number: 4}], 2);
  assert.deepEqual(groups, [['a', 'c', 'e'], ['b', 'd']]);
  assert.equal(splitIntoGroups([], 1).length, 2);
});

test('groups need at least one known pupil each and a pupil joins only one group', () => {
  assert.deepEqual(validateCanvasGroups([{name: ' 별 ', studentIds: ['a']}, {studentIds: ['b', 'c']}], roster), [{name: '별', studentIds: ['a']}, {name: '2모둠', studentIds: ['b', 'c']}]);
  assert.throws(() => validateCanvasGroups([{studentIds: ['a']}], roster), CanvasGroupError);
  assert.throws(() => validateCanvasGroups([{studentIds: ['a']}, {studentIds: []}], roster), /2모둠에 학생/);
  assert.throws(() => validateCanvasGroups([{studentIds: ['a']}, {studentIds: ['z']}], roster), /우리 반 학생/);
  assert.throws(() => validateCanvasGroups([{studentIds: ['a']}, {studentIds: ['a']}], roster), (error: CanvasGroupError) => error.status === 409);
});

test('editing one group cannot pull in a pupil who is already in a sibling group', () => {
  const siblings = [{id: 'one', studentIds: ['a', 'b']}, {id: 'two', studentIds: ['c']}];
  assert.doesNotThrow(() => assertNoOverlap('one', ['a', 'b', 'd'], siblings));
  assert.throws(() => assertNoOverlap('one', ['a', 'c'], siblings), /다른 모둠/);
});

test('missions are optional, trimmed and bounded', () => {
  assert.equal(canvasMission(undefined), '');
  assert.equal(canvasMission('  물의 순환을\r\n그려요  '), '물의 순환을\n그려요');
  assert.throws(() => canvasMission('가'.repeat(601)), /600자/);
  assert.throws(() => canvasMission(3), CanvasGroupError);
});
