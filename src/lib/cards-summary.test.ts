import assert from 'node:assert/strict';
import {cardSetUnfinished, summarizeStudentCards} from './cards-summary';
import type {CardRequiredModes} from './cards-types';

const rule = (requiredCount: number) => ({requiredCount, direction: 'front-back' as const, rangeStart: 1, rangeEnd: 10});
const required: CardRequiredModes = {memorize: rule(10), recall: rule(10), spell: rule(0)};
const optional: CardRequiredModes = {memorize: rule(0), recall: rule(0), spell: rule(0)};
const untouched = {studyComplete: true, counts: {memorize: 0, recall: 0, spell: 0}, attempts: 0};

assert.equal(cardSetUnfinished(required, {...untouched, studyComplete: false}), true, 'required study not met yet');
assert.equal(cardSetUnfinished(required, {...untouched, studyComplete: true}), false, 'required study met');
assert.equal(cardSetUnfinished(optional, untouched), true, 'an optional set nobody opened is still to do');
assert.equal(cardSetUnfinished(optional, {...untouched, counts: {memorize: 3, recall: 0, spell: 0}}), false, 'any study finishes an optional set');
assert.equal(cardSetUnfinished(optional, {...untouched, attempts: 1}), false, 'a test attempt finishes an optional set');

const now = Date.parse('2026-11-07T00:00:00Z');
const row = (dueAt: string | null, studyComplete = false) => ({dueAt, requiredModes: required, progress: {...untouched, studyComplete}}) as Parameters<typeof summarizeStudentCards>[0][number];
assert.deepEqual(summarizeStudentCards([], now), {assigned: 0, unfinished: 0, nearestDue: null, overdue: 0});
assert.deepEqual(summarizeStudentCards([row('2026-11-20T00:00:00Z'), row('2026-11-09T00:00:00Z'), row('2026-11-08T00:00:00Z', true), row(null)], now), {assigned: 4, unfinished: 3, nearestDue: '2026-11-09T00:00:00Z', overdue: 0}, 'the nearest deadline ignores finished sets');
assert.deepEqual(summarizeStudentCards([row('2026-11-01T00:00:00Z'), row('2026-11-09T00:00:00Z')], now), {assigned: 2, unfinished: 2, nearestDue: '2026-11-09T00:00:00Z', overdue: 1}, 'a passed deadline is counted, not shown as nearest');
assert.equal(summarizeStudentCards([row('not a date')], now).nearestDue, null, 'a bad date never breaks the home card');
console.log('cards summary tests ok');
