import assert from 'node:assert/strict';
import {carriedCardStates, carriedMisses, checkStudentLinks, fitRequirements, remapPlan, suggestStudentLinks, transferredSettings} from './cards-transfer';
import type {CardRequiredModes, CardTestSettings} from './cards-types';

const from = [{id: 'a1', name: '김민준', number: 1}, {id: 'a2', name: '이서연', number: 2}, {id: 'a3', name: '박지우', number: 3}, {id: 'a4', name: '박지우', number: 4}, {id: 'a5', name: '최하늘', number: 5, disabled: true}];
const to = [{id: 'b1', name: '김민준 ', number: 7}, {id: 'b2', name: '박지우', number: 8}, {id: 'b3', name: '최하늘', number: 9}, {id: 'b4', name: '정다온', number: 10}, {id: 'b5', name: '이서연', number: 11, disabled: true}];

// Suggestions: a name that appears once on each side; two 박지우 stay for the teacher; a moved-away (disabled) old student may still be matched.
assert.deepEqual(suggestStudentLinks(from, to), [{from: 'a1', to: 'b1'}, {from: 'a5', to: 'b3'}]);
assert.equal(checkStudentLinks([{from: 'a1', to: 'b1'}, {from: 'a3', to: 'b2'}], from, to), null);
assert.match(checkStudentLinks([{from: 'a1', to: 'b1'}, {from: 'a1', to: 'b2'}], from, to)!, /한 학생에게만/);
assert.match(checkStudentLinks([{from: 'a2', to: 'b5'}], from, to)!, /다시 골라/, 'a disabled target student cannot receive a record');
assert.match(checkStudentLinks([{from: 'zz', to: 'b1'}], from, to)!, /다시 골라/);

const modes: CardRequiredModes = {memorize: {requiredCount: 300, direction: 'front-back', rangeStart: 5, rangeEnd: 40}, recall: {requiredCount: 20, direction: 'back-front', rangeStart: 1, rangeEnd: 20}, spell: {requiredCount: 0, direction: 'front-back', rangeStart: 1, rangeEnd: 40}};
const fitted = fitRequirements(modes, 12);
assert.deepEqual(fitted.memorize, {requiredCount: 80, direction: 'front-back', rangeStart: 5, rangeEnd: 12}, 'ranges and counts fit a shorter version');
assert.deepEqual(fitted.recall, {requiredCount: 20, direction: 'back-front', rangeStart: 1, rangeEnd: 12});

const test: CardTestSettings = {questionCount: 30, goalScore: 80, maxAttempts: 3, requireStudy: true, direction: 'front-back', answerRelease: 'after-due', format: 'choice', timeLimitSeconds: 600};
const dropped = transferredSettings({requiredModes: modes, test, dueAt: '2027-02-01T00:00:00.000Z', afterDue: 'lock', speechRate: 0.8, planDate: '2027-01-30'}, 12, false);
assert.equal(dropped.dueAt, null); assert.equal(dropped.afterDue, 'late'); assert.equal(dropped.planDate, null);
assert.equal(dropped.test.answerRelease, 'immediate', 'without a deadline, after-due answers show after submitting');
assert.equal(dropped.test.questionCount, 12); assert.equal(dropped.speechRate, 0.8); assert.equal(dropped.test.timeLimitSeconds, 600);
const kept = transferredSettings({requiredModes: modes, test, dueAt: '2027-02-01T00:00:00.000Z', afterDue: 'lock', planDate: '2027-01-30'}, 40, true);
assert.equal(kept.dueAt, '2027-02-01T00:00:00.000Z'); assert.equal(kept.afterDue, 'lock'); assert.equal(kept.test.answerRelease, 'after-due'); assert.equal(kept.planDate, '2027-01-30'); assert.equal(kept.speechRate, null);

assert.deepEqual(carriedCardStates({c1: {l: 3, b: 2, d: '2026-11-20'}, gone: {l: 4, b: 4, d: '2026-12-01'}}, ['c1', 'c2']), {c1: {l: 3, b: 2, d: '2026-11-20'}}, 'mastery moves only for cards the new version still has');
assert.deepEqual(carriedMisses({d1: {c1: '2026-11-01', gone: '2026-11-02'}, d9: {c1: '2026-11-03'}}, new Map([['d1', {id: 'n1', cardIds: ['c1']}]])), {n1: {c1: '2026-11-01'}});

const plan = [{kind: 'memo' as const, id: 'm1', text: '1단원'}, {kind: 'set' as const, id: 'd1', highlight: true}, {kind: 'set' as const, id: 'd2', hidden: true}];
assert.deepEqual(remapPlan(plan, new Map([['d1', 'n1']])), [{kind: 'memo', id: 'm1-c', text: '1단원'}, {kind: 'set', id: 'n1', highlight: true}], 'sets that did not move are left out; memos come along');
assert.deepEqual(remapPlan(plan, new Map([['d1', 'n1']]), [{kind: 'set', id: 'own'}, {kind: 'set', id: 'n1'}]).map(item => item.id), ['own', 'n1', 'm1-c'], 'added after the target rows, never twice');
console.log('cards transfer tests ok');
