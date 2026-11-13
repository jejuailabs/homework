import assert from 'node:assert/strict';
import test from 'node:test';
import { answersReleased, assertDueOpen, canStudyDistribution, cardMutationFingerprint, distributionPatch, lateMark, parseAfterDue, parseSpeechRate, reportStudentIds, CARD_LIMIT, completedCounts, expectedCardVersion, isCorrectCardAnswer, normalizeCardAnswer, ownsCardResource, parseCards, parseDueAt, parseRequirements, parseTestSettings, publicProgress, studyResponses, testAnswers } from './cards-policy';
import { addStudyResponse, cardAfterDue, cardDistractors, cardDueState, buildCardChoices, buildCardSections, buildTestQuestions, cardAnswer as logicCardAnswer, cardRangePreset, emptyStudyOutbox, formatCountdown, isTestOvertime, testFormat, testTimeLimit, gradeCardAnswer, keepaliveStudyBatches, restoreStudyOutbox, spellHint, sentenceWords, spellLetterDiff, sealStudyBuffer, settleStudyBatch, staleStudyBatch, studyOutboxSize, type StudyBatch } from '../cards-logic';
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
test('sentence-set spell builds the English sentence: punctuation, spacing and case are not graded, first letters also count', () => {
  const sentence = { title: 's', description: '', type: 'sentence' as const, cards: [{ id: 's-0', front: "We have nails on our hands and feet.", back: '우리의 손과 발에는 손톱, 발톱이 있다.', example: '', alternatives: [] }, { id: 's-1', front: "I don't like it, Tom!", back: '톰, 나는 그게 싫어!', example: '', alternatives: [] }] };
  const fixedFront = parseRequirements({ spell: { requiredCount: 2, direction: 'front-back' } }, 2);
  const graded = studyResponses([{ cardId: 's-0', answer: 'we have  nails on our hands and feet' }, { cardId: 's-1', answer: "I dont like it Tom" }], sentence, 'spell', 'back-front', fixedFront);
  assert.deepEqual(graded.map(item => item.correct), [true, false]);
  assert.equal(graded[0].expectedAnswer, sentence.cards[0].front);
  assert.equal(studyResponses([{ cardId: 's-1', answer: "i don't like it, tom" }], sentence, 'spell', 'back-front', fixedFront)[0].correct, true);
  assert.equal(studyResponses([{ cardId: 's-0', answer: 'Whnoohaf' }], sentence, 'spell', 'front-back', fixedFront)[0].correct, true);
  assert.equal(studyResponses([{ cardId: 's-0', answer: '(힌트 보기)' }], sentence, 'spell', 'back-front', fixedFront)[0].correct, false);
  assert.equal(studyResponses([{ cardId: 's-0', answer: '우리의 손과 발에는 손톱, 발톱이 있다.' }], sentence, 'spell', 'back-front', fixedFront)[0].correct, false);
  assert.equal(gradeCardAnswer(sentence.cards[0], 'spell', 'front-back', 'We have nails on our hands and feet', 'sentence').correct, true);
  assert.deepEqual(sentenceWords("I don't like it, Tom!"), ['I', "don't", 'like', 'it', 'Tom']);
  assert.deepEqual(spellLetterDiff('We have nails', 'We havx'), { ok: 'We hav', wrong: 'x' });
  // Word sets keep the teacher's fixed direction.
  assert.throws(() => studyResponses([{ cardId: 'card-0', answer: 'word 0' }], snapshot, 'spell', 'back-front', parseRequirements({ spell: { requiredCount: 1, direction: 'front-back' } }, cards.length)));
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
test('client grading matches server grading, including alternatives only for front-back', () => {
  const answers = ['  ＭＥＡＮＩＮＧ   0 ', 'meaning 0', '뜻 0', ' 뜻  0', 'WORD 0', 'word0', 'wrong', ''];
  for (const direction of ['front-back', 'back-front'] as const) for (const answer of answers) {
    const server = studyResponses([{ cardId: 'card-0', answer }], snapshot, 'spell', direction, requirements)[0];
    assert.deepEqual(gradeCardAnswer(cards[0], 'spell', direction, answer), { correct: server.correct, expected: server.expectedAnswer });
  }
  assert.equal(gradeCardAnswer(cards[0], 'memorize', 'front-back', '').correct, true);
});
test('answer batches seal at ten, before a repeated card and on a direction change', () => {
  let count = 0;
  const newId = () => `batch-${++count}`, add = (outbox: ReturnType<typeof emptyStudyOutbox>, cardId: string, direction: 'front-back' | 'back-front' = 'front-back') => addStudyResponse(outbox, { cardId, answer: '', direction }, 'memorize', newId);
  let outbox = emptyStudyOutbox();
  for (let index = 0; index < 9; index++) outbox = add(outbox, `card-${index}`);
  assert.deepEqual([outbox.buffer.length, outbox.sealed.length], [9, 0]);
  outbox = add(outbox, 'card-9');
  assert.deepEqual([outbox.buffer.length, outbox.sealed.length], [0, 1]);
  assert.equal(outbox.sealed[0].lastCardId, 'card-9');
  outbox = add(add(add(outbox, 'card-1'), 'card-2'), 'card-1');
  assert.deepEqual(outbox.buffer.map(item => item.cardId), ['card-1']);
  assert.deepEqual(outbox.sealed[1].responses.map(item => item.cardId), ['card-1', 'card-2']);
  assert.equal(outbox.sealed[1].lastCardId, 'card-2');
  outbox = add(outbox, 'card-3', 'back-front');
  assert.equal(outbox.sealed[2].direction, 'front-back');
  assert.equal(studyOutboxSize(outbox), 14);
  // Every sealed batch satisfies the server's own request rules.
  for (const batch of outbox.sealed) assert.equal(studyResponses(batch.responses, snapshot, 'memorize', batch.direction, requirements).length, batch.responses.length);
});
test('a sealed batch keeps its request ID and content until the server accepts it', () => {
  const ids = ['first', 'second'], newId = () => ids.shift()!;
  const outbox = sealStudyBuffer(addStudyResponse(emptyStudyOutbox(), { cardId: 'card-0', answer: 'a', direction: 'front-back' }, 'spell', newId), 'spell', newId);
  assert.equal(sealStudyBuffer(outbox, 'spell', newId), outbox);
  assert.equal(ids.length, 1);
  const stored = JSON.parse(JSON.stringify(outbox));
  assert.deepEqual(restoreStudyOutbox(stored, 'spell'), outbox);
  assert.equal(studyOutboxSize(settleStudyBatch(outbox, 'other')), 1);
  assert.equal(studyOutboxSize(settleStudyBatch(outbox, 'first')), 0);
});
test('stored outboxes tolerate damage and carry over an answer saved before batching', () => {
  const legacy: StudyBatch = { requestId: 'old', mode: 'spell', direction: 'front-back', responses: [{ cardId: 'card-0', answer: 'a' }], lastCardId: 'card-0' };
  assert.deepEqual(restoreStudyOutbox(undefined, 'spell'), emptyStudyOutbox());
  assert.deepEqual(restoreStudyOutbox({ buffer: 'x', sealed: [{ requestId: 1 }, { ...legacy, lastCardId: 'gone' }, { ...legacy, mode: 'recall' }] }, 'spell'), emptyStudyOutbox());
  assert.deepEqual(restoreStudyOutbox(undefined, 'spell', legacy).sealed, [legacy]);
  assert.equal(restoreStudyOutbox({ sealed: [{ ...legacy, responses: [...legacy.responses, ...legacy.responses] }] }, 'spell').sealed.length, 0);
});
test('keepalive sends stop before the browser body allowance', () => {
  const big = (requestId: string): StudyBatch => ({ requestId, mode: 'spell', direction: 'front-back', responses: [{ cardId: 'card-0', answer: '가'.repeat(1000) }], lastCardId: 'card-0' });
  assert.deepEqual(keepaliveStudyBatches({ buffer: [], sealed: [big('a'), big('b'), big('c')] }, 7000).map(batch => batch.requestId), ['a', 'b']);
  assert.deepEqual(keepaliveStudyBatches(emptyStudyOutbox()), []);
});
test('spell hint gives the first letter and the letter count, matching normalization of spaces', () => {
  assert.deepEqual(spellHint('  Apple '), { first: 'A', length: 5, words: 1 });
  assert.deepEqual(spellHint('ice   cream'), { first: 'i', length: 8, words: 2 });
  assert.deepEqual(spellHint('사과'), { first: '사', length: 2, words: 1 });
  // The note says internal spaces collapse but are not removed: one space is still required.
  assert.equal(normalizeCardAnswer('ICE    cream'), normalizeCardAnswer('ice cream'));
  assert.notEqual(normalizeCardAnswer('icecream'), normalizeCardAnswer('ice cream'));
});
test('section rows cut the set into N cards with a shorter last row and read per-mode coverage', () => {
  const twentyThree = cards.slice(0, 23), rules = parseRequirements({ spell: { rangeStart: 5, rangeEnd: 12, requiredCount: 8 } }, 23);
  const coverage = emptyCoverage();
  twentyThree.slice(0, 10).forEach(card => { coverage.memorize[card.id] = 1; });
  twentyThree.slice(10, 13).forEach(card => { coverage.recall[card.id] = 3; });
  const rows = buildCardSections(twentyThree, rules, coverage);
  assert.deepEqual(rows.map(row => [row.from, row.to]), [[1, 10], [11, 20], [21, 23]]);
  assert.deepEqual(rows[0].modes.memorize, { from: 1, to: 10, total: 10, covered: 10, percent: 100, done: true });
  assert.equal(rows[1].modes.recall!.percent, 30);
  assert.equal(rows[1].modes.recall!.done, false);
  assert.deepEqual([rows[0].modes.spell!.from, rows[0].modes.spell!.to], [5, 10]);
  assert.deepEqual([rows[1].modes.spell!.from, rows[1].modes.spell!.to], [11, 12]);
  assert.equal(rows[2].modes.spell, null);
});
test('sections default safely when a progress document has no coverage', () => {
  for (const coverage of [undefined, null, {}, { memorize: {} }]) assert.equal(buildCardSections(cards, requirements, coverage)[0].modes.memorize!.covered, 0);
  assert.equal(buildCardSections(cards, requirements, undefined).length, 5);
  assert.equal(buildCardSections(cards, requirements, undefined, 0).length, 5);
});
test('section links preset the range only inside the requirement', () => {
  assert.deepEqual(cardRangePreset('11', '20', 1, 50), { start: 11, end: 20 });
  assert.deepEqual(cardRangePreset('5', '30', 10, 20), { start: 10, end: 20 });
  assert.deepEqual(cardRangePreset(undefined, undefined, 1, 50), { start: 1, end: 50 });
  for (const [from, to] of [['abc', '5'], ['20', '10'], ['60', '70'], ['1.5', '3'], ['1', '5']]) assert.deepEqual(cardRangePreset(from, to, 10, 50), { start: 10, end: 50 });
});
const random = (max: number) => Math.floor(Math.random() * max);
test('test settings add format and time limit with safe defaults for old distributions', () => {
  assert.deepEqual([settings.format, settings.timeLimitSeconds], ['written', null]);
  assert.deepEqual([testFormat({}), testTimeLimit({})], ['written', null]);
  const value = parseTestSettings({ format: 'choice', timeLimitSeconds: 600 }, 50);
  assert.deepEqual([value.format, value.timeLimitSeconds], ['choice', 600]);
  for (const bad of [{ format: 'oral' }, { timeLimitSeconds: 59 }, { timeLimitSeconds: 7201 }, { timeLimitSeconds: 90.5 }, { timeLimitSeconds: '600' }]) assert.throws(() => parseTestSettings(bad, 50));
});
test('choices hold the expected answer plus three distinct distractors that are not also correct', () => {
  const pool = parseCards([{ id: 'a', front: 'apple', back: '사과', alternatives: ['능금'] }, { id: 'b', front: 'pear', back: '  배 ' }, { id: 'c', front: 'peach', back: '능금' }, { id: 'd', front: 'plum', back: '자두' }, { id: 'e', front: 'plum2', back: '자두' }, { id: 'f', front: 'kiwi', back: '키위' }, { id: 'g', front: 'apple2', back: '사과' }]);
  for (let round = 0; round < 50; round++) {
    const choices = buildCardChoices(pool[0], pool, 'front-back', random)!;
    assert.equal(choices.length, 4);
    assert.ok(choices.includes('사과'));
    assert.equal(new Set(choices.map(normalizeCardAnswer)).size, 4);
    assert.equal(choices.filter(choice => isCorrectCardAnswer(pool[0], 'front-back', choice)).length, 1);
  }
  assert.equal(buildCardChoices(pool[0], pool, 'back-front', random)!.filter(choice => choice === logicCardAnswer(pool[0], 'back-front')).length, 1);
});
test('few distinct answers shrink the choices, and under two falls back to a written question', () => {
  const pool = parseCards([{ id: 'a', front: 'one', back: '하나' }, { id: 'b', front: 'two', back: '둘' }, { id: 'c', front: 'three', back: '둘' }]);
  assert.equal(buildCardChoices(pool[0], pool, 'front-back', random)!.length, 2);
  const same = parseCards([{ id: 'a', front: 'one', back: '같음' }, { id: 'b', front: 'two', back: ' 같음' }]);
  assert.equal(buildCardChoices(same[0], same, 'front-back', random), null);
  let ids = 0;
  const [question] = buildTestQuestions([same[0]], same, { direction: 'front-back', format: 'choice' }, () => `q${++ids}`, random);
  assert.equal('choices' in question, false);
});
test('written tests store no choices, and retests draw distractors from the whole set', () => {
  assert.equal('choices' in buildTestQuestions(cards.slice(0, 1), cards, { direction: 'back-front' }, () => 'q', random)[0], false);
  const [question] = buildTestQuestions(cards.slice(0, 1), cards, { direction: 'front-back', format: 'choice' }, () => 'q', random);
  assert.equal(question.prompt, 'word 0');
  assert.equal(question.choices!.length, 4);
});
test('huge choice text stops short of the document limit by falling back to written questions', () => {
  const large = parseCards(Array.from({ length: 200 }, (_, index) => ({ id: `big-${index}`, front: `w${index}`, back: `${index}`.padEnd(1000, '가') })).slice(0, 180));
  const questions = buildTestQuestions(large, large, { direction: 'front-back', format: 'choice' }, () => 'q', random);
  const bytes = questions.reduce((total, question) => total + Buffer.byteLength((question.choices ?? []).join('')), 0);
  assert.ok(bytes <= 400_000);
  assert.ok(questions.some(question => question.choices) && questions.some(question => !question.choices));
});
test('choice answers grade through the same rule and blanks stay allowed', () => {
  const [question] = buildTestQuestions(cards.slice(0, 1), cards, { direction: 'front-back', format: 'choice' }, () => 'q1', random);
  const answers = testAnswers([{ questionId: 'q1', answer: '뜻 0' }], ['q1']);
  assert.equal(isCorrectCardAnswer(cards[0], 'front-back', answers.get(question.id)!), true);
  assert.equal(isCorrectCardAnswer(cards[0], 'front-back', testAnswers([{ questionId: 'q1', answer: '' }], ['q1']).get('q1')!), false);
});
test('overtime begins sixty seconds after the limit and never applies without one', () => {
  const startedAt = '2026-11-07T00:00:00.000Z', start = Date.parse(startedAt);
  assert.equal(isTestOvertime(startedAt, 600, start + 660_000), false);
  assert.equal(isTestOvertime(startedAt, 600, start + 660_001), true);
  assert.equal(isTestOvertime(startedAt, null, start + 1e9), false);
  assert.equal(isTestOvertime(startedAt, undefined, start + 1e9), false);
});
test('the countdown rounds up and never shows a negative time', () => {
  assert.equal(formatCountdown(61_000), '1:01');
  assert.equal(formatCountdown(500), '0:01');
  assert.equal(formatCountdown(-5000), '0:00');
});

const lateDeadline = { dueAt: '2026-11-10T00:00:00.000Z', afterDue: 'late' as const };
const at = (minutes: number) => new Date(Date.parse(lateDeadline.dueAt) + minutes * 60_000).toISOString();
test('after-due rule defaults to open for old distributions and rejects anything else', () => {
  assert.equal(parseAfterDue(undefined), 'open');
  assert.equal(parseAfterDue('lock'), 'lock');
  assert.throws(() => parseAfterDue('closed'), /마감 후 처리/);
  assert.equal(cardAfterDue({}), 'open');
  assert.equal(cardDueState({ dueAt: at(0) }, Date.parse(at(60))), 'open', 'an old document stays open after its deadline');
  assert.equal(cardDueState({ dueAt: null, afterDue: 'lock' }, Date.parse(at(60))), 'before', 'no deadline never locks');
});
test('a locked deadline closes only after the five minute grace', () => {
  const locked = { dueAt: lateDeadline.dueAt, afterDue: 'lock' as const };
  assert.doesNotThrow(() => assertDueOpen(locked, Date.parse(at(-1))));
  assert.doesNotThrow(() => assertDueOpen(locked, Date.parse(at(5))), 'an offline batch landing inside the grace is kept');
  assert.throws(() => assertDueOpen(locked, Date.parse(at(5)) + 1), (error: Error & { status?: number; code?: string }) => error.status === 403 && error.code === 'DUE_CLOSED');
  assert.doesNotThrow(() => assertDueOpen({ ...locked, afterDue: 'late' }, Date.parse(at(60))));
  assert.doesNotThrow(() => assertDueOpen({ dueAt: locked.dueAt }, Date.parse(at(60))), 'old documents are never locked');
  assert.equal(cardDueState(locked, Date.parse(at(1))), 'lock', 'screens close at the deadline, before the server does');
});
test('late stamp is set once, only in late mode, and survives only while the deadline it passed still stands', () => {
  assert.equal(lateMark(undefined, lateDeadline, at(4)), null, 'a batch inside the grace is not late');
  assert.equal(lateMark(undefined, lateDeadline, at(6)), at(6));
  assert.equal(lateMark(at(6), lateDeadline, at(30)), at(6), 'the first late activity is kept');
  assert.equal(lateMark(undefined, { ...lateDeadline, afterDue: 'open' }, at(30)), null);
  assert.equal(lateMark(undefined, { ...lateDeadline, afterDue: 'lock' }, at(30)), null);
  assert.equal(lateMark(at(6), { ...lateDeadline, dueAt: at(60) }, at(30)), null, 'extending the deadline clears an older stamp');
  assert.equal(publicProgress({ lateAt: at(6) }, snapshot, requirements, settings, lateDeadline).lateAt, at(6));
  assert.equal(publicProgress({ lateAt: at(6) }, snapshot, requirements, settings, { ...lateDeadline, afterDue: 'open' }).lateAt, null, 'switching to keep-open hides the tag');
  assert.equal(publicProgress({ lateAt: at(6) }, snapshot, requirements, settings, { ...lateDeadline, dueAt: at(60) }).lateAt, null);
  assert.equal(publicProgress(undefined, snapshot, requirements, settings).lateAt, null);
});

test('the server accepts exactly the card sizes bulk import accepts', () => {
  assert.doesNotThrow(() => parseCards([{ front: 'a'.repeat(1000), back: 'b'.repeat(1000), example: 'c'.repeat(2000), alternatives: ['d'.repeat(1000)] }]));
  for (const card of [{ front: 'a'.repeat(1001), back: 'b' }, { front: 'a', back: 'b'.repeat(1001) }, { front: 'a', back: 'b', example: 'c'.repeat(2001) }, { front: 'a', back: 'b', alternatives: ['d'.repeat(1001)] }]) assert.throws(() => parseCards([card]));
});
test('an all-students distribution reaches any student of the class, and old documents keep their target list', () => {
  const room = { classId: 'class', targetStudentIds: ['first'], active: true };
  const joined = { role: 'student' as const, classId: 'class', studentId: 'joined-later' };
  assert.equal(canStudyDistribution(joined, room), false, 'a document without the field stays limited to its targets');
  assert.equal(canStudyDistribution(joined, { ...room, allStudents: false }), false);
  assert.equal(canStudyDistribution(joined, { ...room, allStudents: true }), true);
  assert.equal(canStudyDistribution({ ...joined, classId: 'other' }, { ...room, allStudents: true }), false, 'another class never gets in');
  assert.equal(canStudyDistribution(joined, { ...room, allStudents: true, active: false }), false, 'a closed distribution stays closed');
  assert.equal(canStudyDistribution({ role: 'teacher', classId: 'class', studentId: 'joined-later' }, { ...room, allStudents: true }), false);
});
test('the report lists original targets plus the active roster only for all-students distributions', () => {
  assert.deepEqual(reportStudentIds({ targetStudentIds: ['a', 'left'], allStudents: true }, ['a', 'new']), ['a', 'left', 'new']);
  assert.deepEqual(reportStudentIds({ targetStudentIds: ['a', 'left'] }, ['a', 'new']), ['a', 'left']);
});
test('distribution edits use the creation validators and leave everything unnamed alone', () => {
  const current = { cardCount: 50, requiredModes: requirements, test: settings, dueAt: null };
  assert.deepEqual(distributionPatch({ active: false }, current), { active: false });
  assert.deepEqual(distributionPatch({ allStudents: true }, current), { allStudents: true });
  assert.deepEqual(distributionPatch({ afterDue: 'lock' }, current), { afterDue: 'lock' });
  assert.equal(distributionPatch({ dueAt: '2026-12-01T00:00:00.000Z' }, current).dueAt, '2026-12-01T00:00:00.000Z');
  assert.equal(distributionPatch({ dueAt: null }, { ...current, dueAt: '2026-12-01T00:00:00.000Z' }).dueAt, null, 'a deadline can be removed');
  const test = distributionPatch({ test: { format: 'choice', timeLimitSeconds: 300 } }, current).test!;
  assert.deepEqual([test.format, test.timeLimitSeconds, test.questionCount, test.requireStudy, test.maxAttempts], ['choice', 300, 10, true, 2], 'a partial test edit keeps the saved values');
  const modes = distributionPatch({ requiredModes: { recall: { requiredCount: 20 } } }, current).requiredModes!;
  assert.equal(modes.recall.requiredCount, 20);
  assert.deepEqual(modes.memorize, requirements.memorize, 'modes that were not named keep their rule');
  for (const [input, pattern] of [[{}, /바꿀 배부 설정/], [{ active: 'yes' }, /배부 상태/], [{ allStudents: 1 }, /배부 상태/], [{ afterDue: 'soon' }, /마감 후 처리/], [{ dueAt: 'tomorrow' }, /마감 날짜/], [{ test: { questionCount: 51 } }, /문항 수/], [{ test: { format: 'oral' } }, /문제 형식/], [{ requiredModes: { memorize: { requiredCount: 501 } } }, /필수 학습량/], [{ requiredModes: { spell: { rangeEnd: 51 } } }, /마지막 카드/]] as [Record<string, unknown>, RegExp][]) assert.throws(() => distributionPatch(input, current), pattern, JSON.stringify(input));
  const afterDue = parseTestSettings({ answerRelease: 'after-due' }, 50);
  assert.throws(() => distributionPatch({ test: { answerRelease: 'after-due' } }, current), /마감 날짜/, 'answers released after a deadline need a deadline');
  assert.throws(() => distributionPatch({ dueAt: null }, { ...current, test: afterDue, dueAt: '2026-12-01T00:00:00.000Z' }), /마감 날짜/, 'and that deadline cannot be removed afterwards');
  assert.doesNotThrow(() => distributionPatch({ dueAt: '2026-12-01T00:00:00.000Z', test: { answerRelease: 'after-due' } }, current));
});

test('a card sharing the prompt is never a wrong choice, in any direction', () => {
  const cards = [{ id: 'a', front: 'big', back: '크다', example: '', alternatives: [] }, { id: 'b', front: 'large', back: '크다', example: '', alternatives: [] }, { id: 'c', front: 'small', back: '작다', example: '', alternatives: [] }, { id: 'd', front: 'bank', back: '은행', example: '', alternatives: [] }, { id: 'e', front: 'bank', back: '둑', example: '', alternatives: [] }];
  assert.deepEqual(cardDistractors(cards[0], cards, 'back-front'), ['small', 'bank']);
  assert.ok(!buildCardChoices(cards[0], cards, 'back-front', () => 0)!.includes('large'));
  assert.deepEqual(cardDistractors(cards[3], cards, 'front-back'), ['크다', '작다']);
  assert.equal(buildTestQuestions([cards[1]], cards, { direction: 'back-front', format: 'choice' }, () => 'q', () => 0)[0].choices?.includes('big'), false);
});

test('only refusals that can never succeed drop a study batch', () => {
  for (const code of ['STUDY_DIRECTION', 'STUDY_CARD', 'REQUEST_CONFLICT']) assert.equal(staleStudyBatch(code), true);
  for (const code of ['INTERNAL_ERROR', 'REQUEST_FAILED', 'DUE_CLOSED', 'UNAUTHENTICATED', 'Failed to fetch']) assert.equal(staleStudyBatch(code), false);
});

test('speech rate default is 0.5-1.5 in tenths, null for the student choice, and PATCH can change it', () => {
  assert.equal(parseSpeechRate(undefined), null); assert.equal(parseSpeechRate(null), null); assert.equal(parseSpeechRate(0.7), 0.7); assert.equal(parseSpeechRate(1.2), 1.2);
  for (const bad of [0.4, 1.6, 0.75, '1', Number.NaN]) assert.throws(() => parseSpeechRate(bad));
  const current = { cardCount: 4, requiredModes: parseRequirements(undefined, 4), test: parseTestSettings(undefined, 4), dueAt: null };
  assert.deepEqual(distributionPatch({ speechRate: 0.5 }, current), { speechRate: 0.5 });
  assert.deepEqual(distributionPatch({ speechRate: null }, current), { speechRate: null });
});

test('끊어읽기: chunk marks are kept only between words of the front and left out when empty', () => {
  const [cut, plain] = parseCards([{ id: 'c1', front: 'I went to the park', back: '공원에 갔다', chunks: [2, 2, 9, 0] }, { id: 'c2', front: 'Hello there', back: '안녕', chunks: [] }]);
  assert.deepEqual(cut.chunks, [2]);
  assert.equal('chunks' in plain, false, 'Firestore never gets an empty or undefined field');
  assert.throws(() => parseCards([{ front: 'a b', back: 'b', chunks: '1' }]));
});

test('학습 일정: the plan date is a real Seoul calendar date or nothing', () => {
  const current = { cardCount: 4, requiredModes: parseRequirements(undefined, 4), test: parseTestSettings(undefined, 4), dueAt: null };
  assert.deepEqual(distributionPatch({ planDate: '2026-11-20' }, current), { planDate: '2026-11-20' });
  assert.deepEqual(distributionPatch({ planDate: null }, current), { planDate: null });
  assert.deepEqual(distributionPatch({ planDate: '' }, current), { planDate: null });
  for (const bad of ['2026-02-30', '2026/11/20', '2026-11-20T00:00:00Z', 20261120]) assert.throws(() => distributionPatch({ planDate: bad }, current));
});
