import assert from 'node:assert/strict';
import test from 'node:test';
import {MONTHLY_CAP, REGIONS, creditMonth, gardenSettings, settingsInput, gardenStage, isPaidClass, percentOf, publicClassLabel, seoulMonth, sharingConfig, validMonth} from './policy';

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
test('public names show only what the teacher chose, never students', () => {
  const at = (visibility: string, school = '한빛초') => ({name: '햇살반', grade: '4', sharingGarden: {joined: true, region: 'jeju', school, visibility}});
  assert.equal(publicClassLabel(at('region')), '제주 · 4학년 어느 반');
  assert.equal(publicClassLabel(at('school')), '제주 · 한빛초 4학년');
  assert.equal(publicClassLabel(at('class')), '제주 · 한빛초 햇살반');
  assert.equal(publicClassLabel(at('class', '')), '제주 · 4학년 어느 반', 'no school typed → region only');
  assert.equal(publicClassLabel({name: '햇살반'}), '어느 반');
});
test('a class takes part only when the teacher turned it on with a region', () => {
  assert.equal(gardenSettings(undefined).joined, false);
  assert.equal(gardenSettings({joined: true}).joined, false, 'no region yet');
  assert.equal(gardenSettings({joined: true, region: 'mars'}).joined, false);
  assert.deepEqual(gardenSettings({joined: true, region: 'busan', school: ' 바다  초<b> ', visibility: 'nope'}), {joined: true, region: 'busan', school: '바다 초b', visibility: 'region'});
  assert.equal(REGIONS.length, 17);
});
test('settings input is checked before saving', () => {
  assert.throws(() => settingsInput({joined: 'yes', visibility: 'region'}), /참여 여부/);
  assert.throws(() => settingsInput({joined: true, region: '', visibility: 'region'}), /시·도/);
  assert.throws(() => settingsInput({joined: true, region: 'seoul', visibility: 'school', school: ''}), /학교 이름/);
  assert.throws(() => settingsInput({joined: true, region: 'seoul', visibility: 'all'}), /공개 범위/);
  assert.deepEqual(settingsInput({joined: false, region: '', visibility: 'region'}), {joined: false, region: '', school: '', visibility: 'region'});
  assert.deepEqual(settingsInput({joined: true, region: 'seoul', school: '한강초', visibility: 'class'}), {joined: true, region: 'seoul', school: '한강초', visibility: 'class'});
});
test('stages, progress and the paid placeholder', () => {
  assert.equal(gardenStage(0).label, '씨앗'); assert.equal(gardenStage(300).label, '새싹'); assert.equal(gardenStage(1499).label, '꽃'); assert.equal(gardenStage(9999).label, '꽃밭 완성');
  assert.equal(gardenStage(750).percent, 50);
  assert.equal(percentOf(750_000, 1_500_000), 50); assert.equal(percentOf(9e9, 1), 100); assert.equal(percentOf(5, 0), 0);
  assert.equal(isPaidClass({billing: {paid: true}}), true); assert.equal(isPaidClass({}), false);
  assert.deepEqual(sharingConfig({}), {recipient: '', requirePaid: false, monthlyGoalWon: 1_500_000});
  assert.equal(sharingConfig({SHARING_GARDEN_REQUIRE_PAID: 'true', SHARING_GARDEN_GOAL_WON: '300000'}).monthlyGoalWon, 300000);
});
