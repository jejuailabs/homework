import assert from 'node:assert/strict';
import {cardDistributionSettings} from './card-settings';

// Saying nothing must match the app's dialog, not the server's "0 required" default.
const plain = cardDistributionSettings({}, 30, false);
assert.equal(plain.requiredModes.memorize.requiredCount, 30);
assert.equal(plain.requiredModes.recall.requiredCount, 30);
assert.equal(plain.requiredModes.spell.requiredCount, 0, 'spell stays optional unless asked for');
assert.equal(plain.requiredModes.spell.direction, 'back-front');
assert.deepEqual(plain.test, {questionCount: 20, goalScore: 80, maxAttempts: 3, requireStudy: false, direction: 'back-front', answerRelease: 'immediate'});
assert.equal(plain.lines[0], '필수 학습: 암기 30 · 리콜 30 · 스펠 선택', 'the preview card shows what will be required');
assert.ok(plain.lines[1].startsWith('테스트: 20문항 · 목표 80점 · 3회'));
assert.equal(cardDistributionSettings({}, 5, false).test.questionCount, 5, 'questions never exceed the cards');

// The teacher can still ask for optional study, ranges and test rules.
const optional = cardDistributionSettings({required_modes: {memorize: {count: 0}, recall: {count: 0}}}, 10, false);
assert.ok(Object.values(optional.requiredModes).every(rule => rule.requiredCount === 0));
assert.equal(optional.lines[0], '필수 학습: 암기 선택 · 리콜 선택 · 스펠 선택');
const custom = cardDistributionSettings({required_modes: {memorize: {range_start: 11, range_end: 20}, spell: {count: 20, range_start: 11, range_end: 20, direction: 'front-back'}}, test: {question_count: 10, goal_score: 90, max_attempts: 1, require_study: true, direction: 'front-back', answer_release: 'after-due'}}, 30, true);
assert.deepEqual(custom.requiredModes.memorize, {requiredCount: 10, direction: 'front-back', rangeStart: 11, rangeEnd: 20}, 'a range without a count means one round of it');
assert.deepEqual(custom.requiredModes.spell, {requiredCount: 20, direction: 'front-back', rangeStart: 11, rangeEnd: 20});
assert.deepEqual(custom.test, {questionCount: 10, goalScore: 90, maxAttempts: 1, requireStudy: true, direction: 'front-back', answerRelease: 'after-due'});
assert.equal(custom.lines[0], '필수 학습: 암기 10 (11~20번) · 리콜 30 · 스펠 20 (11~20번)');
assert.ok(custom.lines[1].endsWith('정답 마감 이후 · 필수 학습 후 응시'));
assert.equal(cardDistributionSettings({required_modes: {spell: {}}}, 8, false).requiredModes.spell.requiredCount, 8, 'naming spell makes it required');

const bad = (args: Parameters<typeof cardDistributionSettings>[0], pattern: RegExp, hasDue = false) => assert.throws(() => cardDistributionSettings(args, 10, hasDue), (error: Error) => pattern.test(error.message));
bad({required_modes: {memorize: {count: 101}}}, /필수 학습량/);
bad({required_modes: {memorize: {count: 2.5}}}, /필수 학습량/);
bad({required_modes: {memorize: {count: '10'}}}, /필수 학습량/);
bad({required_modes: {memorize: {range_start: 5, range_end: 3}}}, /마지막 카드/);
bad({required_modes: {writing: {count: 1}}}, /writing/);
bad({required_modes: []}, /required_modes/);
bad({test: {question_count: 11}}, /문항 수/);
bad({test: {goal_score: 101}}, /목표 점수/);
bad({test: {max_attempts: 0}}, /응시 횟수/);
bad({test: {answer_release: 'after-due'}}, /마감/);
bad({test: {answer_release: 'soon'}}, /answer_release/, true);
bad({test: {require_study: 'yes'}}, /require_study/);
bad({test: {direction: 'sideways'}}, /방향/);
console.log('card settings tests ok');
