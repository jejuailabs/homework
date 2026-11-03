import assert from 'node:assert/strict';
import test from 'node:test';
import {activityDuration, activityScreen, cleanActivity, seoulDay, seoulHour, shiftDay, summarizeActivity} from './activity';

test('paths map to a fixed set of screens; login and callbacks are not counted', () => {
  assert.equal(activityScreen('/teacher'), 'teacher-home');
  assert.equal(activityScreen('/teacher/exhibitions/abc?archive=1'), 'teacher-exhibitions');
  assert.equal(activityScreen('/student/my-space'), 'student-my-space');
  assert.equal(activityScreen('/student/something-new'), 'student-other');
  assert.equal(activityScreen('/gallery/token123'), 'public-gallery');
  assert.equal(activityScreen('/board/token123'), 'public-board');
  assert.equal(activityScreen('/admin/activity'), 'admin');
  assert.equal(activityScreen('/'), null);
  assert.equal(activityScreen('/oauth/consent'), null);
});

test('a flush keeps known screens, whole numbers and at most ten minutes in total', () => {
  assert.deepEqual(cleanActivity({'teacher-homework': {ms: 1500.4, views: 2}, 'bogus': {ms: 9}, 'student-home': {ms: -1, views: 0}}), {'teacher-homework': {ms: 1500, views: 2}});
  const big = cleanActivity({'teacher-homework': {ms: 9 * 60_000, views: 1}, 'teacher-tools': {ms: 9 * 60_000, views: 1}});
  assert.equal(big['teacher-homework']!.ms + big['teacher-tools']!.ms, 10 * 60_000);
  // Anonymous visitors may only report public pages.
  assert.deepEqual(Object.keys(cleanActivity({'public-gallery': {ms: 1000, views: 1}, 'teacher-home': {ms: 1000, views: 1}}, true)), ['public-gallery']);
  assert.deepEqual(cleanActivity(null), {});
  assert.deepEqual(cleanActivity([1]), {});
});

test('Seoul calendar decides the day and hour', () => {
  const time = Date.parse('2026-03-31T16:30:00Z');
  assert.equal(seoulDay(time), '2026-04-01');
  assert.equal(seoulHour(time), 1);
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
});

test('person-days fold into role, screen, hour, class and teacher totals', () => {
  const summary = summarizeActivity([
    {role: 'teacher', uid: 't1', totalMs: 600_000, hours: {'9': 600_000}, screens: {'teacher-homework': {ms: 400_000, views: 3}, 'teacher-tools': {ms: 200_000, views: 1}}},
    {role: 'student', uid: 's1', classId: 'c1', totalMs: 300_000, hours: {'10': 300_000}, screens: {'student-my-space': {ms: 300_000, views: 2}}},
    {role: 'student', uid: 's2', classId: 'c1', totalMs: 100_000, hours: {'10': 100_000}, screens: {'student-my-space': {ms: 100_000, views: 1}}},
    {role: 'parent', totalMs: 60_000, hours: {'20': 60_000}, screens: {'public-gallery': {ms: 60_000, views: 1}}},
    {role: 'student', uid: 's3', classId: 'c1', totalMs: 0, screens: {}},
    {role: 'hacker', totalMs: 1},
    {role: 'teacher', uid: 't2', totalMs: 999 * 86_400_000, screens: {'teacher-home': {ms: 1, views: 1}}},
  ]);
  assert.deepEqual(summary.roles.student, {users: 2, ms: 400_000, views: 3});
  assert.equal(summary.roles.teacher!.users, 2);
  assert.equal(summary.roles.teacher!.ms, 600_000 + 86_400_000);
  assert.deepEqual(summary.screens['student-my-space']!.student, {users: 2, ms: 400_000, views: 3});
  assert.equal(summary.hours.student![10], 400_000);
  assert.deepEqual(summary.classes.c1, {users: 2, ms: 400_000});
  assert.deepEqual(summary.teachers.t1, {ms: 600_000, views: 4});
  assert.equal(summary.roles.parent!.users, 1);
  assert.equal(summary.roles.admin, undefined);
});

test('durations read as hours and minutes', () => {
  assert.equal(activityDuration(0), '0분');
  assert.equal(activityDuration(40_000), '40초');
  assert.equal(activityDuration(12 * 60_000), '12분');
  assert.equal(activityDuration(65 * 60_000), '1시간 5분');
  assert.equal(activityDuration(120 * 60_000), '2시간');
});
