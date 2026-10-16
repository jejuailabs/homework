import assert from 'node:assert/strict';
import test from 'node:test';
import { answersReleased, canStudyDistribution, cardMutationFingerprint, CARD_LIMIT, completedCounts, expectedCardVersion, isCorrectCardAnswer, normalizeCardAnswer, ownsCardResource, parseCards, parseDueAt, parseRequirements, parseTestSettings, publicProgress, studyResponses, testAnswers } from './cards-policy';
import type { CardCoverage, } from './cards-policy';
import type { CardSnapshot } from '../cards-types';

const cards = parseCards(Array.from({ length: 50 }, (_, index) => ({ id: `card-${index}`, front: `word ${index}`, back: `뜻 ${index}`, alternatives: [`meaning ${index}`] })));
const snapshot: CardSnapshot = { title: '50장 세트', description: '', type: 'word', cards };
const requirements = parseRequirements({ memorize: { requiredCount: 50 } }, cards.length);
const settings = parseTestSettings({ questionCount: 10, requireStudy: true, maxAttempts: 2 }, cards.length);
const emptyCoverage = (): CardCoverage => ({ memorize: {}, recall: {}, spell: {} });

test('set inputs preserve stable IDs, Korean text, examples and alternatives', () => {
  const parsed = parseCards([{ id: 'apple', front: ' apple ', back: ' 사과 ', example: ' An apple. ', alternatives: ['능금', '능금'] }]);
  assert.deepEqual(parsed, [{ id: 'apple', front: 'apple', back: '사과', example: 'An apple.', alternatives: ['능금'] }]);
  assert.match(parseCards([{ front: 'a', back: 'b' }])[0].id, /^[A-Za-z0-9_-]+$/);
});
test('cards reject empty, duplicate, dangerous IDs, oversized entries and more than 200 cards', () => {
  assert.equal(CARD_LIMIT, 200);
  for (const value of [[], [{ front: '', back: 'b' }], [{ id: 'same', front: 'a', back: 'b' }, { id: 'same', front: 'c', back: 'd' }], [{ id: '../escape', front: 'a', back: 'b' }], ...['__proto__', 'constructor', 'prototype'].map(id => [{ id, front: 'a', back: 'b' }]), [{ front: 'a'.repeat(1001), back: 'b' }], Array.from({ length: 201 }, () => ({ front: 'a', back: 'b' }))]) assert.throws(() => parseCards(value));
});
test('set document byte limit accounts for UTF-8 rather than only string length', () => {
  const value = Array.from({ length: 200 }, () => ({ front: '가'.repeat(1000), back: '나'.repeat(1000) }));
  assert.throws(() => parseCards(value), /너무 커요/);
});
test('requirements use one-based inclusive ranges and enforce ten repetitions maximum', () => {
  assert.deepEqual(requirements.memorize, { requiredCount: 50, direction: 'front-back', rangeStart: 1, rangeEnd: 50 });
  assert.throws(() => parseRequirements({ spell: { rangeStart: 0 } }, 50));
  assert.throws(() => parseRequirements({ spell: { rangeStart: 20, rangeEnd: 10 } }, 50));
  assert.throws(() => parseRequirements({ recall: { requiredCount: 501 } }, 50));
  assert.throws(() => parseRequirements({ memorize: { requiredCount: 1.2 } }, 50));
});
test('test settings reject unsupported release modes and malformed limits', () => {
  assert.equal(settings.questionCount, 10);
  for (const value of [{ questionCount: 51 }, { maxAttempts: 0 }, { goalScore: 101 }, { requireStudy: 'true' }, { direction: 'arbitrary' }, { answerRelease: 'student-choice' }]) assert.throws(() => parseTestSettings(value, 50));
});
test('distribution ownership has no admin or superadmin bypass', () => {
  for (const role of ['teacher', 'admin', 'superadmin'] as const) {
    assert.equal(ownsCardResource({ role, uid: 'owner' }, { ownerUid: 'owner' }), true);
    assert.equal(ownsCardResource({ role, uid: 'other' }, { ownerUid: 'owner' }), false);
  }
  assert.equal(ownsCardResource({ role: 'student', uid: 'owner' }, { ownerUid: 'owner' }), false);
});
test('student access requires own class, frozen target membership and active distribution', () => {
  const distribution = { classId: 'class-a', targetStudentIds: ['one'], active: true };
  const student = { role: 'student' as const, classId: 'class-a', studentId: 'one' };
  assert.equal(canStudyDistribution(student, distribution), true);
  assert.equal(canStudyDistribution({ ...student, classId: 'class-b' }, distribution), false);
  assert.equal(canStudyDistribution({ ...student, studentId: 'new-transfer' }, distribution), false);
  assert.equal(canStudyDistribution(student, { ...distribution, active: false }), false);
  assert.equal(canStudyDistribution({ ...student, role: 'admin' }, distribution), false);
});
test('normalization accepts Unicode compatibility, whitespace, case and teacher alternatives', () => {
  assert.equal(normalizeCardAnswer('  ＡＰＰＬＥ\n pie '), 'apple pie');
  assert.equal(isCorrectCardAnswer(cards[0], 'front-back', ' MEANING   0 '), true);
  assert.equal(isCorrectCardAnswer(cards[0], 'back-front', 'WORD 0'), true);
  assert.equal(isCorrectCardAnswer(cards[0], 'back-front', 'meaning 0'), false);
  assert.equal(isCorrectCardAnswer(cards[0], 'front-back', '뜻 1'), false);
});
test('practice responses are graded by server rules and memorize records exposure', () => {
  const value = studyResponses([{ cardId: 'card-0', answer: 'wrong', correct: true }, { cardId: 'card-1', answer: 'meaning 1' }], snapshot, 'spell', 'front-back', requirements);
  assert.deepEqual(value.map(answer => answer.correct), [false, true]);
  assert.equal(studyResponses([{ cardId: 'card-0' }], snapshot, 'memorize', 'front-back', requirements)[0].correct, true);
});
test('practice rejects duplicate/unknown/out-of-range cards and wrong fixed direction', () => {
  assert.throws(() => studyResponses([{ cardId: 'card-0' }, { cardId: 'card-0' }], snapshot, 'memorize', 'front-back', requirements));
  assert.throws(() => studyResponses([{ cardId: 'unknown' }], snapshot, 'memorize', 'front-back', requirements));
  const limited = parseRequirements({ memorize: { rangeStart: 10, rangeEnd: 20, requiredCount: 11 } }, 50);
  assert.throws(() => studyResponses([{ cardId: 'card-0' }], snapshot, 'memorize', 'front-back', limited));
  assert.throws(() => studyResponses([{ cardId: 'card-10' }], snapshot, 'memorize', 'back-front', limited));
});
test('optional practice allows either presentation direction', () => {
  const value = studyResponses([{ cardId: 'card-0', answer: 'word 0' }], snapshot, 'spell', 'back-front', requirements);
  assert.equal(value[0].correct, true);
});
test('repeating one card cannot replace coverage of the required range', () => {
  const coverage = emptyCoverage();
  coverage.memorize['card-0'] = 100;
  assert.equal(completedCounts(snapshot, requirements, coverage).memorize, 1);
  const state = publicProgress({ counts: { memorize: 100, recall: 0, spell: 0 }, coverage }, snapshot, requirements, settings);
  assert.equal(state.studyComplete, false);
  assert.equal(state.completedCounts.memorize, 1);
});
test('50-card report progress matches complete coverage and repeat requirements', () => {
  const coverage = emptyCoverage();
  cards.forEach(card => { coverage.memorize[card.id] = 1; });
  assert.equal(publicProgress({ coverage }, snapshot, requirements, settings).studyComplete, true);
  const repeated = parseRequirements({ memorize: { requiredCount: 100 } }, 50);
  assert.equal(completedCounts(snapshot, repeated, coverage).memorize, 50);
  assert.equal(publicProgress({ coverage }, snapshot, repeated, settings).studyComplete, false);
  cards.forEach(card => { coverage.memorize[card.id] = 2; });
  assert.equal(publicProgress({ coverage }, snapshot, repeated, settings).studyComplete, true);
});
test('partial repetitions accept any distinct cards instead of fixing an arbitrary first-card subset', () => {
  const coverage = emptyCoverage();
  cards.slice(25).forEach(card => { coverage.memorize[card.id] = 1; });
  const partial = parseRequirements({ memorize: { requiredCount: 25 } }, 50);
  assert.equal(completedCounts(snapshot, partial, coverage).memorize, 25);
  assert.equal(publicProgress({ coverage }, snapshot, partial, settings).studyComplete, true);
});
test('zero required study starts complete but test goal still requires a score', () => {
  const initial = publicProgress(undefined, snapshot, parseRequirements(undefined, 50), settings);
  assert.equal(initial.studyComplete, true);
  assert.equal(initial.goalReached, false);
  assert.equal(initial.bestScore, null);
});
test('answer release follows server time, with never still hiding after the deadline', () => {
  const dueAt = '2026-10-14T10:00:00.000Z', deadline = Date.parse(dueAt);
  assert.equal(answersReleased({ ...settings, answerRelease: 'after-due' }, dueAt, deadline - 1), false);
  assert.equal(answersReleased({ ...settings, answerRelease: 'after-due' }, dueAt, deadline), true);
  assert.equal(answersReleased({ ...settings, answerRelease: 'after-due' }, null, deadline), false);
  assert.equal(answersReleased({ ...settings, answerRelease: 'never' }, dueAt, deadline + 1), false);
  assert.equal(answersReleased({ ...settings, answerRelease: 'immediate' }, null, deadline), true);
});
test('test answer payloads must cover every pinned question exactly once', () => {
  const questions = ['q1', 'q2'];
  const parsed = testAnswers([{ questionId: 'q2', answer: 'two' }, { questionId: 'q1', answer: '' }], questions);
  assert.equal(parsed.get('q1'), '');
  assert.throws(() => testAnswers([{ questionId: 'q1', answer: 'one' }], questions));
  assert.throws(() => testAnswers([{ questionId: 'q1', answer: 'one' }, { questionId: 'q1', answer: 'two' }], questions));
  assert.throws(() => testAnswers([{ questionId: 'q1', answer: 'one' }, { questionId: 'outside', answer: 'two' }], questions));
});
test('deadline validation does not accept numeric dates or unparseable content', () => {
  assert.equal(parseDueAt(null), null);
  assert.equal(parseDueAt('2026-10-14T19:00:00+09:00'), '2026-10-14T10:00:00.000Z');
  assert.throws(() => parseDueAt(123));
  assert.throws(() => parseDueAt('tomorrow'));
});
test('mutation receipts compare content independently of JSON property ordering', () => {
  assert.equal(cardMutationFingerprint({ setId: 'set', test: { goal: 80, count: 10 } }), cardMutationFingerprint({ test: { count: 10, goal: 80 }, setId: 'set' }));
  assert.notEqual(cardMutationFingerprint({ targetStudentIds: ['one'] }), cardMutationFingerprint({ targetStudentIds: ['two'] }));
  assert.notEqual(cardMutationFingerprint({ cards: ['one', 'two'] }), cardMutationFingerprint({ cards: ['two', 'one'] }));
});
test('publication rejects stale or invalid expected versions, while accepting the reviewed current version', () => {
  assert.doesNotThrow(() => expectedCardVersion(3, 3));
  assert.doesNotThrow(() => expectedCardVersion(undefined, 3));
  assert.throws(() => expectedCardVersion(2, 3), { status: 409, code: 'STALE_VERSION' });
  assert.throws(() => expectedCardVersion(0, 3), { status: 400 });
  assert.throws(() => expectedCardVersion('3', 3), { status: 400 });
});
