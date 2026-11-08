import assert from 'node:assert/strict';
import {cardClassStatus, cardHardWords, cardReviewCandidates, cardSetUnfinished, cardUnmastered, filterCardReport, summarizeStudentCards} from './cards-summary';
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

const pupil = (patch: Record<string, unknown> = {}, mistakes: {cardId: string; count: number}[] = []) => ({mistakes, progress: {studyComplete: false, counts: {memorize: 0, recall: 0, spell: 0}, attempts: 0, bestScore: null as number | null, goalReached: false, ...patch}});
const done = pupil({studyComplete: true, counts: {memorize: 5, recall: 0, spell: 0}, attempts: 1, bestScore: 90, goalReached: true}, [{cardId: 'a', count: 3}]);
const working = pupil({counts: {memorize: 2, recall: 0, spell: 0}, attempts: 1, bestScore: 40}, [{cardId: 'a', count: 1}, {cardId: 'b', count: 4}, {cardId: 'gone', count: 9}]);
const started = pupil({counts: {memorize: 1, recall: 0, spell: 0}, attempts: 1});
const idle = pupil();
const roster = [done, working, started, idle];
assert.deepEqual(cardClassStatus(roster, required), {done: 1, active: 2, waiting: 1}, 'every student lands in exactly one band');
assert.deepEqual(cardClassStatus([idle, started], optional), {done: 1, active: 0, waiting: 1}, 'an unopened optional set is waiting even though studyComplete is true');
assert.deepEqual(filterCardReport(roster, 'all', required), roster);
assert.deepEqual(filterCardReport(roster, 'unfinished', required), [working, started, idle]);
assert.deepEqual(filterCardReport(roster, 'untested', required), [started, idle], 'a started test without a score is not a taken test');
assert.deepEqual(filterCardReport(roster, 'belowGoal', required), [working], 'students with no score are not below the goal, they are untested');
const words = cardHardWords(roster, [{id: 'a', front: 'apple'}, {id: 'b', front: 'banana'}]);
assert.deepEqual(words.map(word => [word.word, Math.round(word.wrongRate), word.wrongCount]), [['apple', 67, 4], ['banana', 33, 4]], 'rate is students who missed over students with activity; idle students and cards outside the snapshot are ignored');
assert.deepEqual(cardHardWords([idle], [{id: 'a', front: 'apple'}]), [], 'no activity, no chart and no division by zero');
const twin = [pupil({attempts: 1}, [{cardId: 'a', count: 1}, {cardId: 'b', count: 1}, {cardId: 'c', count: 1}])];
assert.deepEqual(cardHardWords(twin, [{id: 'a', front: 'same'}, {id: 'b', front: 'same'}, {id: 'c', front: '가'.repeat(30)}]).map(word => word.word), ['same', 'same (2)', `${'가'.repeat(11)}…`], 'chart labels stay short and unique');
console.log('cards summary tests ok');

const learned = [{id: 'a', front: 'apple'}, {id: 'b', front: 'banana'}, {id: 'c', front: 'cherry'}];
assert.deepEqual(cardUnmastered([{...done, levels: {a: 4, b: 3, c: 1}}, {...working, levels: {a: 2}}, {...idle, levels: {}}], learned), [{word: 'cherry', wrongRate: 100, wrongCount: 2}, {word: 'apple', wrongRate: 50, wrongCount: 1}, {word: 'banana', wrongRate: 50, wrongCount: 1}], 'below 잎 counts students with activity only; ties keep set order');
assert.deepEqual(cardUnmastered([{...done, levels: {a: 3, b: 4, c: 3}}], learned), [], 'every card at 잎 or above leaves nothing');
assert.deepEqual(cardUnmastered([{...idle}], learned), [], 'no activity, no list');
assert.deepEqual(cardUnmastered([{...working}], learned).length, 3, 'old reports without levels read as not learned');
console.log('cards mastery summary tests ok');

// review candidates: every missed card, most students then most misses then set order
{
  const cards = ['a', 'b', 'c', 'd'].map(id => ({id, front: id}));
  const rows = [{mistakes: [{cardId: 'c', count: 1}, {cardId: 'b', count: 1}, {cardId: 'gone', count: 9}]}, {mistakes: [{cardId: 'c', count: 2}, {cardId: 'a', count: 3}, {cardId: 'd', count: 0}]}, {mistakes: [{cardId: 'b', count: 1}]}];
  assert.deepEqual(cardReviewCandidates(rows, cards).map(row => [row.card.id, row.students, row.total]), [['c', 2, 3], ['b', 2, 2], ['a', 1, 3]]);
  assert.equal(cardReviewCandidates(rows, cards, 1).length, 1);
  assert.deepEqual(cardReviewCandidates([], cards), []);
}
