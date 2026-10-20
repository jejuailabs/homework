import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkQuizAnswer, generateQuizPack, generateQuizReview, nextQuizSkill, publicQuizSession, quizAddDays, quizNumber, quizRanking, quizScope, quizWeekStart, seoulQuizDate, validQuizCronSecret} from './engine';
import {quizVocabulary} from './vocabulary';
import type {QuizAnswer, QuizSession, QuizSkill} from './types';
const scope = {grade: 3, semester: 1, date: '2026-10-20'};
const result: QuizAnswer = {answer: '1', correct: false, understanding: 'unknown', submittedAt: '2026-10-20T00:00:00Z'};
test('scheduled preparation secret must be long enough and contain no HTTP header whitespace', () => {
  assert.equal(validQuizCronSecret('demo-only-quiz-scheduler-secret'), true);
  for (const value of [undefined, '', 'short', ' 1234567890123456', '1234567890123456\n', '12345678 90123456', '1234567890123456\r\n']) assert.equal(validQuizCronSecret(value), false);
});
test('quiz scope and Seoul calendar reject invalid dates and isolate grades and semesters', () => {
  assert.equal(seoulQuizDate(new Date('2026-10-19T15:00:00Z')), '2026-10-20');
  assert.equal(quizAddDays('2028-02-28', 1), '2028-02-29');
  assert.equal(quizWeekStart('2026-10-25'), '2026-10-19');
  assert.equal(quizWeekStart('2026-10-26'), '2026-10-26');
  for (const value of [{...scope, grade: 7}, {...scope, semester: 3}, {...scope, date: '2026-02-30'}, {...scope, date: '../secret'}]) assert.throws(() => quizScope(value));
});
test('six grades, two semesters and 40 dates produce deterministic unique ten-question packs with correct arithmetic', () => {
  for (let grade = 1; grade <= 6; grade++) for (const semester of [1, 2]) for (let day = 0; day < 40; day++) {
    const target = {grade, semester, date: quizAddDays(scope.date, day)};
    for (const subject of ['english', 'math'] as const) {
      const pack = generateQuizPack(target, subject); assert.deepEqual(pack, generateQuizPack(target, subject));
      assert.equal(pack.questions.length, 10); assert.equal(new Set(pack.questions.map(question => question.prompt)).size, 10);
      for (const question of pack.questions) {
        assert.equal(checkQuizAnswer(question, question.answer).correct, true);
        if (subject === 'english') {if (question.kind === 'choice') {assert.equal(question.choices.length, 4); assert.equal(new Set(question.choices).size, 4);}}
        else {
          const match = question.prompt.match(/^([\d./]+) ([+−×÷]) ([\d./]+) = \?$/)!; assert(match);
          const left = quizNumber(match[1])!, right = quizNumber(match[3])!, expected = quizNumber(question.answer)!;
          const [a, b, c, d, n, den] = [...left, ...right, ...expected].map(BigInt);
          const operation = match[2];
          if (operation === '+') assert.equal((a * d + c * b) * den, n * b * d);
          if (operation === '−') assert.equal((a * d - c * b) * den, n * b * d);
          if (operation === '×') assert.equal(a * c * den, n * b * d);
          if (operation === '÷') {assert.notEqual(c, 0n); assert.equal(a * d * den, n * b * c);}
        }
      }
    }
  }
});
test('pilot vocabulary has unique words and meanings within each grade', () => {
  for (let grade = 1; grade <= 6; grade++) {const words = quizVocabulary(grade); assert.equal(words.length, 30); assert.equal(new Set(words.map(word => word.id)).size, 30); assert.equal(new Set(words.map(word => word.meaning)).size, 30);}
});
test('marking accepts exact equivalent fractions and decimals while rejecting malformed answers', () => {
  const question = {...generateQuizPack({...scope, grade: 6}, 'math').questions[0], answer: '3/4'};
  for (const answer of ['6/8', '0.75', '０．７５', ' 3 / 4 ']) assert.equal(checkQuizAnswer(question, answer).correct, true);
  assert.equal(checkQuizAnswer(question, '0.76').correct, false);
  for (const answer of ['', '1/0', 'NaN', 'Infinity', '1e3', '1+2']) assert.throws(() => checkQuizAnswer(question, answer));
});
test('public sessions hide answers, explanations and answer-bearing skill identifiers until submission', () => {
  const pack = generateQuizPack(scope, 'english'), session: QuizSession = {...scope, id: 'session', mode: 'english', questions: pack.questions, answers: {}, completed: false, createdAt: 'now'};
  let publicView = publicQuizSession(session);
  assert(!('answers' in publicView));
  for (const question of publicView.questions) {assert(!('answer' in question)); assert(!('explanation' in question)); assert(!('skillId' in question)); assert.equal(question.skillLabel, '기초 단어 확인'); assert(!question.result);}
  const question = pack.questions[0]; session.answers[question.id] = {...result, answer: question.answer}; publicView = publicQuizSession(session);
  assert.equal(publicView.questions[0].result?.expected, question.answer); assert(!publicView.questions[1].result);
});
test('review intervals combine actual correctness with understanding; same-day successes cannot erase weakness', () => {
  const question = generateQuizPack(scope, 'math').questions[0];
  const wrong = nextQuizSkill(question, {...result, understanding: 'known'}, scope.date);
  assert.equal(wrong.interval, 1);
  const later = nextQuizSkill(question, {...result, correct: true, understanding: 'known'}, scope.date, wrong);
  assert.equal(later.interval, 1); assert.equal(later.correctStreak, 0);
  assert.equal(nextQuizSkill(question, {...result, correct: true, understanding: 'unsure'}, scope.date).interval, 3);
  assert.equal(nextQuizSkill(question, {...result, correct: true, understanding: 'known'}, scope.date).interval, 7);
  const unknown = nextQuizSkill(question, {...result, correct: true, understanding: 'unknown'}, scope.date); assert.equal(unknown.interval, 1);
});
test('personal reviews are frozen by the caller, select only due skills from prior dates and cap at five', () => {
  const skills: QuizSkill[] = generateQuizPack(scope, 'english').questions.map(question => nextQuizSkill(question, result, scope.date));
  assert.equal(generateQuizReview(scope, 'friend1', skills).length, 0);
  const tomorrow = {...scope, date: quizAddDays(scope.date, 1)}, review = generateQuizReview(tomorrow, 'friend1', skills);
  assert.equal(review.length, 5); assert.equal(new Set(review.map(question => question.skillId)).size, 5);
  assert.deepEqual(review, generateQuizReview(tomorrow, 'friend1', skills));
  assert(review.every(question => !question.id.includes('word-')));
});
test('weekly ranking counts only completed common daily first answers, with shared ranks and no review advantage', () => {
  const question = generateQuizPack(scope, 'math').questions[0], base: QuizSession = {...scope, id: 'session', mode: 'math', questions: [question], answers: {[question.id]: {...result, correct: true, understanding: 'known'}}, completed: true, createdAt: 'now'};
  const rows = quizRanking([{id: 'a', name: 'A', sessions: [base, {...base, mode: 'review'}]}, {id: 'b', name: 'B', sessions: [base]}, {id: 'c', name: 'C', sessions: [{...base, completed: false}]}]);
  assert.deepEqual(rows.map(row => row.rank), [1, 1, 3]); assert.deepEqual(rows.map(row => row.score), [1, 1, 0]); assert.equal(rows[0].completedDays, 1);
});
