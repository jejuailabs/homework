import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays, cardsFor, effectiveRating, finalRatings, nextReview, publicQuestion, scheduleItem, validateContent, weakQuestions} from './engine';
import {lessonReviewRequest, lessonReviewResult, lessonSource} from './ai-request';

const choice = (n: number) => ({prompt: `문제 ${n}`, choices: ['가', '나', '다', '라'], answer: n % 4, explanation: `해설 ${n}`});
const draft = {
  concepts: [{id: 'a', title: '증발', summary: '물이 수증기로 변해요.', example: '빨래가 말라요.'}, {id: 'b', title: '응결', summary: '수증기가 물방울이 돼요.', example: ''}, {id: 'c', title: '강수', summary: '비나 눈이 내려요.', example: '소나기'}],
  questions: [1, 2, 3, 4, 5].map(n => ({conceptId: n < 3 ? 'a' : n < 5 ? 'b' : 'c', kind: 'choice', ...choice(n), twin: choice(n + 10)})),
};
const content = validateContent(draft);

test('content keeps linked concepts, renumbers ids and enforces counts and choices', () => {
  assert.deepEqual(content.questions.map(question => question.conceptId), ['c1', 'c1', 'c2', 'c2', 'c3']);
  assert.equal(content.questions[0].id, 'q1');
  assert.throws(() => validateContent({...draft, questions: draft.questions.slice(0, 4)}), /5~10개/);
  assert.throws(() => validateContent({...draft, questions: [{...draft.questions[0], choices: ['가', '가', '다', '라']}, ...draft.questions.slice(1)]}), /서로 다른 보기/);
  assert.throws(() => validateContent({...draft, questions: [{...draft.questions[0], conceptId: 'zz'}, ...draft.questions.slice(1)]}), /연결할 개념/);
  const ox = validateContent({...draft, questions: [{...draft.questions[0], kind: 'ox', answer: 1, twin: {...draft.questions[0].twin, answer: 0}}, ...draft.questions.slice(1)]});
  assert.deepEqual(ox.questions[0].choices, ['O', 'X']);
});

test('public questions never carry the answer or explanation, twins show the twin text', () => {
  const view = publicQuestion(content.questions[0], true);
  assert.equal(view.prompt, '문제 11');
  assert.equal('answer' in view || 'explanation' in view, false);
});

test('a wrong answer cannot be rated as fully understood', () => {
  assert.equal(effectiveRating(false, 'know'), 'unsure');
  assert.equal(effectiveRating(true, 'know'), 'know');
  assert.equal(effectiveRating(false, 'unknown'), 'unknown');
});

test('cards and retest cover only what was not fully understood; retest ratings win', () => {
  const pretest = {q1: {choice: 1, correct: true, rating: 'know' as const}, q2: {choice: 0, correct: false, rating: 'unsure' as const}, q3: {choice: 0, correct: false, rating: 'unknown' as const}, q4: {choice: 0, correct: true, rating: 'know' as const}, q5: {choice: 1, correct: true, rating: 'know' as const}};
  assert.deepEqual(weakQuestions(content, pretest).map(question => question.id), ['q2', 'q3']);
  assert.deepEqual(cardsFor(content, pretest).map(concept => concept.title), ['증발', '응결']);
  assert.deepEqual(finalRatings(content, {pretest, retest: {q2: {choice: 1, correct: true, rating: 'know'}, q3: {choice: 2, correct: false, rating: 'unsure'}}}), {q1: 'know', q2: 'know', q3: 'unsure', q4: 'know', q5: 'know'});
});

test('unknown returns in a week, unsure in two, and two clean reviews graduate', () => {
  assert.equal(scheduleItem('L', content.questions[0], 'know', '2026-10-27'), null);
  const weak = scheduleItem('L', content.questions[0], 'unknown', '2026-10-27')!;
  assert.equal(weak.dueDate, '2026-11-03');
  assert.equal(scheduleItem('L', content.questions[0], 'unsure', '2026-10-27')!.dueDate, '2026-11-10');
  const first = nextReview(weak, 'know', '2026-11-03');
  assert.equal(first.graduated, false); assert.equal(first.dueDate, addDays('2026-11-03', 14));
  assert.equal(nextReview(first, 'know', '2026-11-17').graduated, true);
  const slip = nextReview(first, 'unknown', '2026-11-17');
  assert.equal(slip.streak, 0); assert.equal(slip.dueDate, '2026-11-24');
});

test('lesson sources accept text, small images or one PDF and the request keeps material as data', () => {
  const meta = {subject: '과학', unit: '물의 여행', title: '물의 순환'};
  assert.throws(() => lessonSource({}, meta, '4'), /하나 이상/);
  assert.throws(() => lessonSource({images: ['data:image/gif;base64,AAAA']}, meta, '4'), /사진/);
  const source = lessonSource({text: '물은 증발해요.', pdf: {name: 'a.pdf', data: 'data:application/pdf;base64,JVBERi0='}}, meta, '4');
  const request = lessonReviewRequest(source, 'model-x');
  assert.equal(request.text.format.strict, true);
  assert.equal(request.input[0].content.at(-1)!.type, 'input_file');
  assert.match(request.instructions, /untrusted data/);
  assert.equal(lessonReviewResult(JSON.stringify(draft)).questions.length, 5);
  assert.throws(() => lessonReviewResult('nope'), /읽지 못했어요/);
});
