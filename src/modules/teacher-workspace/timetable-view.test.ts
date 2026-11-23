import assert from 'node:assert/strict';
import {DEFAULT_BELLS, bellsInput, bellsOrDefault, changedCells, daySlots, nowPeriod, schoolDay, subjectHue} from './timetable-view';

// Period times: seven rows, each after the one before.
assert.deepEqual(bellsInput(DEFAULT_BELLS), DEFAULT_BELLS);
assert.throws(() => bellsInput(DEFAULT_BELLS.slice(0, 6)), /모두/);
assert.throws(() => bellsInput(DEFAULT_BELLS.map((bell, index) => index === 2 ? {start: '10:40', end: '10:40'} : bell)), /3교시 시간/);
assert.throws(() => bellsInput(DEFAULT_BELLS.map((bell, index) => index === 1 ? {start: '09:30', end: '10:10'} : bell)), /2교시가 앞 교시와 겹쳐요/);
assert.deepEqual(bellsOrDefault('nonsense'), DEFAULT_BELLS);

// "지금·다음" counts only the periods that have a lesson today.
assert.deepEqual(nowPeriod(DEFAULT_BELLS, '09:10', [1, 2, 3]), {current: 1, left: 30, next: 2, wait: 40});
assert.deepEqual(nowPeriod(DEFAULT_BELLS, '09:45', [1, 2, 3]), {current: null, left: 0, next: 2, wait: 5}, 'between periods');
assert.deepEqual(nowPeriod(DEFAULT_BELLS, '10:00', [1, 3]), {current: null, left: 0, next: 3, wait: 40}, 'a free period is not "now"');
assert.deepEqual(nowPeriod(DEFAULT_BELLS, '16:00', [1, 2]), {current: null, left: 0, next: null, wait: 0}, 'after school');
assert.deepEqual(nowPeriod(DEFAULT_BELLS, '08:00', []), {current: null, left: 0, next: null, wait: 0});

// A subject keeps its colour everywhere, whatever is written around it.
assert.equal(subjectHue('국어'), subjectHue('국어 (읽기)'));
assert.notEqual(subjectHue('국어'), subjectHue('수학'));
assert.equal(subjectHue('코딩'), subjectHue('코딩'));
assert.ok(subjectHue('코딩') >= 0 && subjectHue('코딩') < 360);

// Cells that differ from the week before: changed, added and removed.
const base = [{day: 1, period: 1, subject: '국어'}, {day: 1, period: 2, subject: '수학'}, {day: 2, period: 1, subject: '과학', room: '과학실'}];
const week = [{day: 1, period: 1, subject: '국어'}, {day: 1, period: 2, subject: '체육'}, {day: 2, period: 1, subject: '과학'}, {day: 3, period: 4, subject: '음악'}];
assert.deepEqual([...changedCells(week, base)].sort(), ['1:2', '2:1', '3:4']);
assert.deepEqual([...changedCells(base, base)], []);
assert.deepEqual([...changedCells([], base)].sort(), ['1:1', '1:2', '2:1']);
assert.deepEqual(daySlots([{day: 1, period: 3, subject: '사회'}, {day: 2, period: 1, subject: '영어'}, {day: 1, period: 1, subject: '국어'}], 1).map(slot => slot.period), [1, 3]);
assert.deepEqual([schoolDay('2026-11-23'), schoolDay('2026-11-27'), schoolDay('2026-11-28'), schoolDay('2026-11-29')], [1, 5, 0, 0]);
console.log('teacher workspace timetable view tests passed');
