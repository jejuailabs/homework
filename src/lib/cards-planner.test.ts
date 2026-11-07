import assert from 'node:assert/strict';
import {dueDate, plannerWeek, studentAgenda, validPlanDate} from './cards-planner';

assert.equal(validPlanDate('2026-11-10'), true);
assert.equal(validPlanDate('2026-02-30'), false, 'a date that does not exist is refused');
assert.equal(validPlanDate('2026-1-5'), false);
assert.equal(dueDate('2026-11-12T14:59:00.000Z'), '2026-11-12', 'read in Seoul time');
assert.equal(dueDate('2026-11-12T15:00:00.000Z'), '2026-11-13', 'midnight in Seoul is the next day');
assert.equal(dueDate(null), null);

const rows = [
  {id: 'a', title: '1과', planDate: '2026-11-10', dueAt: '2026-11-13T05:00:00.000Z', active: true},
  {id: 'b', title: '2과', planDate: null, dueAt: null, active: true},
  {id: 'c', title: '3과', planDate: '2026-11-16', dueAt: null, active: true},
  {id: 'd', title: '멈춤', planDate: '2026-11-10', dueAt: null, active: false},
  {id: 'e', title: '먼 마감', planDate: null, dueAt: '2026-12-20T05:00:00.000Z', active: true},
];
const week = plannerWeek(rows, '2026-11-12', '2026-11-11');
assert.equal(week.start, '2026-11-09'); assert.equal(week.end, '2026-11-15'); assert.equal(week.days.length, 7);
assert.deepEqual(week.days.map(day => day.entries.map(entry => `${entry.kind}:${entry.row.id}`)), [[], ['plan:a'], [], [], ['due:a'], [], []], 'Monday to Sunday, plan and due days, stopped sets left out');
assert.equal(week.days[2].today, true);
assert.deepEqual(week.unscheduled.map(row => row.id), ['b'], 'only sets with neither date wait in the unscheduled list');

const agenda = studentAgenda(rows, '2026-11-11', 14);
assert.deepEqual(agenda.days.map(day => [day.date, day.entries.map(entry => `${entry.kind}:${entry.row.id}`)]), [['2026-11-13', ['due:a']], ['2026-11-16', ['plan:c']]], 'past days and empty days are skipped');
assert.equal(agenda.later, 1, 'one deadline waits beyond two weeks');
console.log('cards planner tests ok');
