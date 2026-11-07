import assert from 'node:assert/strict';
import {cardDistributionSettings} from './card-settings';

// Saying nothing must match the app's dialog, not the server's "0 required" default.
const plain = cardDistributionSettings({}, 30, false);
assert.equal(plain.requiredModes.memorize.requiredCount, 30);
assert.equal(plain.requiredModes.recall.requiredCount, 30);
assert.equal(plain.requiredModes.spell.requiredCount, 0, 'spell stays optional unless asked for');
assert.equal(plain.requiredModes.spell.direction, 'back-front');
assert.deepEqual(plain.test, {questionCount: 20, goalScore: 80, maxAttempts: 3, requireStudy: false, direction: 'back-front', answerRelease: 'immediate', format: 'written', timeLimitSeconds: null});
assert.equal(plain.afterDue, 'late', 'the same default as the dialog');
assert.equal(plain.lines.length, 2, 'no deadline, no after-deadline line');
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
assert.deepEqual(custom.test, {questionCount: 10, goalScore: 90, maxAttempts: 1, requireStudy: true, direction: 'front-back', answerRelease: 'after-due', format: 'written', timeLimitSeconds: null});
assert.equal(custom.lines[0], '필수 학습: 암기 10 (11~20번) · 리콜 30 · 스펠 20 (11~20번)');
assert.ok(custom.lines[1].endsWith('정답 마감 이후 · 필수 학습 후 응시'));
assert.equal(cardDistributionSettings({required_modes: {spell: {}}}, 8, false).requiredModes.spell.requiredCount, 8, 'naming spell makes it required');

const timed = cardDistributionSettings({after_due: 'lock', test: {format: 'choice', time_limit_seconds: 600}}, 10, true);
assert.equal(timed.afterDue, 'lock');
assert.equal(timed.test.format, 'choice');
assert.equal(timed.test.timeLimitSeconds, 600);
assert.ok(timed.lines[1].includes('객관식 · 제한 10분'), 'the preview card shows the format and the time limit');
assert.equal(timed.lines[2], '마감 후: 학습과 테스트 닫기', 'and what happens after the deadline');
assert.ok(cardDistributionSettings({test: {time_limit_seconds: 90}}, 10, false).lines[1].includes('제한 90초'));

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
bad({test: {format: 'oral'}}, /format/);
bad({test: {time_limit_seconds: 59}}, /제한 시간/);
bad({test: {time_limit_seconds: 7201}}, /제한 시간/);
bad({after_due: 'soon'}, /after_due/, true);
bad({after_due: 'lock'}, /마감/);
console.log('card settings tests ok');
