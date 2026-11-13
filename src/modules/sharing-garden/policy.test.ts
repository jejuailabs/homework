import assert from 'node:assert/strict';
import test from 'node:test';
import {MONTHLY_CAP, creditMonth, gardenStage, isPaidClass, percentOf, publicClassLabel, seoulMonth, sharingConfig, validMonth} from './policy';

test('a class month keeps every point but credits at most 1,500', () => {
  assert.deepEqual(creditMonth(undefined, 10), {points: 10, credited: 10, added: 10, full: false, justFilled: false});
  const near = creditMonth({points: 1495, credited: 1495}, 10);
  assert.equal(near.points, 1505); assert.equal(near.credited, MONTHLY_CAP); assert.equal(near.added, 5); assert.equal(near.justFilled, true);
  const over = creditMonth({points: 1505, credited: 1500}, 10);
  assert.equal(over.points, 1515); assert.equal(over.credited, 1500); assert.equal(over.added, 0); assert.equal(over.justFilled, false); assert.equal(over.full, true);
});
test('bad stored values never inflate the credit', () => {
  assert.equal(creditMonth({points: -50, credited: 99999}, 10).credited, 10);
  assert.equal(creditMonth({points: 'x', credited: null}, -10).points, 0);
  assert.equal(creditMonth({points: 1.9}, 0).points, 1);
});
test('months follow Korea time', () => {
  assert.equal(seoulMonth(new Date('2026-11-30T15:30:00Z')), '2026-12');
  assert.equal(seoulMonth(new Date('2026-11-30T14:59:00Z')), '2026-11');
  assert.ok(validMonth('2026-01')); assert.ok(!validMonth('2026-13')); assert.ok(!validMonth('../x'));
});
test('class names appear only when the teacher opts in', () => {
  assert.equal(publicClassLabel({name: '햇살반', grade: '4', sharingGarden: {showName: true}}), '햇살반');
  assert.equal(publicClassLabel({name: '햇살반', grade: '4학년'}), '4학년 어느 반');
  assert.equal(publicClassLabel({name: '햇살반'}), '이름을 숨긴 반');
});
test('stages, progress and the paid placeholder', () => {
  assert.equal(gardenStage(0).label, '씨앗'); assert.equal(gardenStage(300).label, '새싹'); assert.equal(gardenStage(1499).label, '꽃'); assert.equal(gardenStage(9999).label, '꽃밭 완성');
  assert.equal(gardenStage(750).percent, 50);
  assert.equal(percentOf(750_000, 1_500_000), 50); assert.equal(percentOf(9e9, 1), 100); assert.equal(percentOf(5, 0), 0);
  assert.equal(isPaidClass({billing: {paid: true}}), true); assert.equal(isPaidClass({}), false);
  assert.deepEqual(sharingConfig({}), {recipient: '', requirePaid: false, monthlyGoalWon: 1_500_000});
  assert.equal(sharingConfig({SHARING_GARDEN_REQUIRE_PAID: 'true', SHARING_GARDEN_GOAL_WON: '300000'}).monthlyGoalWon, 300000);
});
