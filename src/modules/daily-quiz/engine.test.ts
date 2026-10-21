import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkQuizAnswer, generatePracticeMathPack, generateQuizPack, generateQuizReview, nextQuizSkill, publicQuizSession, quizAddDays, quizEnglishIndex, quizMathIndex, quizNumber, quizPackId, quizRange, quizRangePackId, quizRanking, quizScope, quizWeekStart, seoulQuizDate, validQuizCronSecret} from './engine';
import {quizVocabulary} from './vocabulary';
import {quizCalendar, quizWordIndices, quizMathStage, quizMathProgress, quizPracticeMathStage} from './curriculum';
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
        if (subject === 'english') {assert.equal(pack.questions.filter(item => item.kind === 'text').length, 2); if (question.kind === 'choice') {assert.equal(question.choices.length, 4); assert.equal(new Set(question.choices).size, 4);}}
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
test('annual vocabulary has unique words and meanings within each grade', () => {
  for (let grade = 1; grade <= 6; grade++) {const words = quizVocabulary(grade); assert.equal(words.length, 120); assert.equal(new Set(words.map(word => word.id)).size, 120); assert.equal(new Set(words.map(word => word.meaning)).size, 120);}
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
  assert.equal(review.filter(question => question.kind === 'text').length, 1);
});
test('short and mixed reviews round only the English question count to twenty percent', () => {
  const tomorrow = {...scope, date: quizAddDays(scope.date, 1)};
  const english = generateQuizPack(scope, 'english').questions.map(question => nextQuizSkill(question, result, scope.date));
  const math = generateQuizPack(scope, 'math').questions.slice(0, 2).map(question => nextQuizSkill(question, result, scope.date));
  for (let count = 1; count <= 5; count++) {
    const review = generateQuizReview(tomorrow, 'friend1', english.slice(0, count));
    assert.equal(review.filter(question => question.kind === 'text').length, Math.round(count * 0.2));
  }
  const mixed = generateQuizReview(tomorrow, 'friend1', [...math, ...english]);
  assert.equal(mixed.filter(question => question.kind === 'text').length, Math.round(mixed.filter(question => question.subject === 'english').length * 0.2));
});
test('annual packs share the calendar across semester selectors without resetting pilot session IDs', () => {
  for (const subject of ['english', 'math'] as const) {
    const pack = generateQuizPack(scope, subject);
    assert.equal(pack.version, 'annual-v1'); assert(pack.id.startsWith('annual-v1_'));
    assert.deepEqual(pack.questions, generateQuizPack({...scope, semester: 2}, subject).questions);
  }
});
test('March through November covers all 120 words gradually, December through February revisits the full range', () => {
  const seen = new Set<number>(); let previousStage = 0;
  for (let day = 0; day < 275; day++) {
    const date = quizAddDays('2026-03-01', day), plan = quizCalendar(date), indices = quizWordIndices(date, 120);
    assert.equal(indices.length, 10); assert.equal(new Set(indices).size, 10);
    assert(plan.stage >= previousStage && plan.stage <= previousStage + 1); previousStage = plan.stage;
    assert(indices.every(index => index < (plan.stage + 1) * 10)); indices.forEach(index => seen.add(index));
    const stages = Array.from({length: 10}, (_, i) => quizMathStage(date, i));
    assert(stages.every(stage => stage <= plan.stage)); assert(stages.slice(0, 6).every(stage => stage === plan.stage));
  }
  assert.equal(seen.size, 120); assert.equal(previousStage, 11);
  const cumulative = new Set<number>();
  for (let day = 0; day < 12; day++) quizWordIndices(quizAddDays('2026-12-01', day), 120).forEach(index => cumulative.add(index));
  assert.equal(cumulative.size, 120);
  assert.equal(quizCalendar('2027-02-28').schoolYear, 2026); assert.equal(quizCalendar('2027-02-28').cumulative, true);
  assert.equal(quizCalendar('2027-03-01').stage, 0); assert.equal(quizCalendar('2027-03-01').schoolYear, 2027);
});
test('every grade can generate unique daily questions across a full school year and review preserves the earlier arithmetic stage', () => {
  for (let grade = 1; grade <= 6; grade++) for (let day = 0; day < 365; day++) {
    const date = quizAddDays('2027-03-01', day);
    for (const subject of ['english', 'math'] as const) {
      const questions = generateQuizPack({grade, semester: quizCalendar(date).semester, date}, subject).questions;
      assert.equal(new Set(questions.map(q => q.prompt)).size, 10);
      assert(questions.every(q => checkQuizAnswer(q, q.answer).correct));
    }
  }
  const first = {...scope, grade: 2, date: '2026-03-01'}, question = generateQuizPack(first, 'math').questions[0];
  const skill = nextQuizSkill(question, result, first.date);
  const review = generateQuizReview({...first, date: '2026-11-30'}, 'learner', [skill])[0];
  assert.equal(review.skillId, question.skillId); assert(review.prompt.includes('+'));
});
test('weekly ranking counts only completed common daily first answers, with shared ranks and no review advantage', () => {
  const question = generateQuizPack(scope, 'math').questions[0], base: QuizSession = {...scope, id: 'session', mode: 'math', questions: [question], answers: {[question.id]: {...result, correct: true, understanding: 'known'}}, completed: true, createdAt: 'now'};
  const rows = quizRanking([{id: 'a', name: 'A', sessions: [base, {...base, mode: 'review'}]}, {id: 'b', name: 'B', sessions: [base]}, {id: 'c', name: 'C', sessions: [{...base, completed: false}]}]);
  assert.deepEqual(rows.map(row => row.rank), [1, 1, 3]); assert.deepEqual(rows.map(row => row.score), [1, 1, 0]); assert.equal(rows[0].completedDays, 1);
});


test('a new pupil always starts arithmetic at the beginning of their grade, even in October or February', () => {
  for (let grade = 1; grade <= 6; grade++) for (const date of ['2026-03-01', '2026-10-20', '2027-02-28']) {
    const pack = generatePracticeMathPack({...scope, grade, date}, 0);
    assert.equal(pack.questions.length, 10);
    assert.equal(new Set(pack.questions.map(q => q.prompt)).size, 10);
    assert(pack.questions.every(q => q.skillId.startsWith(`annual-g${grade}-t0-`)));
    assert(pack.questions.every(q => checkQuizAnswer(q, q.answer).correct));
    assert.deepEqual(pack, generatePracticeMathPack({...scope, grade, date}, 0));
  }
  const october = generatePracticeMathPack(scope, 0);
  assert(october.questions.every(q => /^[0-9]+ [＋+−] [0-9]+/.test(q.prompt)));
});

test('only completed practice days advance arithmetic; later packs include earlier skills for review', () => {
  assert.equal(quizMathProgress(0).stage, 0); assert.equal(quizMathProgress(9).stage, 0);
  assert.equal(quizMathProgress(10).stage, 1); assert.equal(quizMathProgress(119).stage, 11);
  assert.equal(quizMathProgress(120).cumulative, true);
  for (const invalid of [-1, NaN, Infinity, 0.5]) assert.equal(quizMathProgress(invalid).stage, 0);
  for (let completed = 0; completed <= 130; completed++) for (let grade = 1; grade <= 6; grade++) {
    const pack = generatePracticeMathPack({...scope, grade}, completed), plan = quizMathProgress(completed);
    assert.equal(new Set(pack.questions.map(q => q.prompt)).size, 10);
    pack.questions.forEach((q, i) => {
      assert.equal(Number(q.skillId.match(/-t(\d+)-/)![1]), quizPracticeMathStage(completed, i));
      assert(checkQuizAnswer(q, q.answer).correct);
    });
    if (!plan.cumulative) assert(pack.questions.slice(0, 6).every(q => q.skillId.includes(`-t${plan.stage}-`)));
  }
});

test('English spelling is always last, including resumed legacy sessions, without changing saved question IDs or answers', () => {
  for (let grade = 1; grade <= 6; grade++) {
    const pack = generateQuizPack({...scope, grade}, 'english');
    assert.deepEqual(pack.questions.map(q => q.kind), [...Array(8).fill('choice'), 'text', 'text']);
    const legacy = [pack.questions[8], ...pack.questions.slice(0, 8), pack.questions[9]];
    const answered = legacy[1];
    const session: QuizSession = {...scope, grade, id: 'legacy', mode: 'english', questions: legacy, answers: {[answered.id]: {...result, answer: answered.answer, understanding: 'known'}}, completed: false, createdAt: 'now'};
    const view = publicQuizSession(session);
    assert.deepEqual(view.questions.map(q => q.kind), [...Array(8).fill('choice'), 'text', 'text']);
    assert.equal(view.questions.find(q => q.id === answered.id)?.result?.answer, answered.answer);
    assert.deepEqual(new Set(view.questions.map(q => q.id)), new Set(legacy.map(q => q.id)));
    assert.equal(session.questions[0].kind, 'text');
    assert(view.questions.filter(q => !q.result).every(q => !('answer' in q) && !('skillId' in q)));
  }
});

test('teacher ranges validate stages and grade words, and keep a stable vocabulary order', () => {
  const words = quizVocabulary(3).map(word => word.id);
  assert.deepEqual(quizRange({english: {kind: 'stages', from: 2, to: 4}, math: {stage: 0}}, 3), {english: {kind: 'stages', from: 2, to: 4}, math: {stage: 0}});
  assert.deepEqual(quizRange({}, 3), {english: null, math: null});
  assert.deepEqual(quizRange({english: {kind: 'words', words: [words[9], words[0], words[4], words[2], words[1]]}}, 3).english, {kind: 'words', words: [words[0], words[1], words[2], words[4], words[9]]});
  for (const value of [
    {english: {kind: 'stages', from: 5, to: 4}}, {english: {kind: 'stages', from: -1, to: 2}}, {english: {kind: 'stages', from: 0, to: 12}}, {english: {kind: 'stages', from: '1', to: 2}},
    {english: {kind: 'words', words: words.slice(0, 4)}}, {english: {kind: 'words', words: words.slice(0, 31)}}, {english: {kind: 'words', words: [...words.slice(0, 4), quizVocabulary(6).at(-1)!.id]}},
    {english: {kind: 'words', words: 'cat'}}, {english: {kind: 'other'}}, {english: 'stages'}, {math: {stage: 12}}, {math: {stage: 1.5}}, {math: []},
  ]) assert.throws(() => quizRange(value as never, 3), value.toString());
});

test('English range packs stay inside the chosen stages or words, use a class pack ID, and leave the shared pack unchanged', () => {
  const index = quizEnglishIndex(3), shared = generateQuizPack(scope, 'english');
  assert.equal(index.length, 12); assert(index.every(block => block.words.length === 10));
  assert.equal(new Set(index.flatMap(block => block.words.map(word => word.id))).size, 120);
  for (let from = 0; from < 12; from++) for (const to of [from, Math.min(11, from + 2), 11]) for (const date of ['2026-03-01', '2026-10-21', '2027-01-15']) {
    const english = {kind: 'stages' as const, from, to}, pack = generateQuizPack({...scope, date}, 'english', {classId: 'classA', english});
    const allowed = new Set(index.slice(from, to + 1).flatMap(block => block.words.map(word => word.id))), last = new Set(index[to].words.map(word => word.id));
    assert.equal(pack.id, quizRangePackId({...scope, date}, 'classA', english)); assert.notEqual(pack.id, quizPackId({...scope, date}, 'english'));
    assert.equal(new Set(pack.questions.map(q => q.skillId)).size, 10);
    assert(pack.questions.every(q => allowed.has(q.skillId)));
    assert.equal(pack.questions.filter(q => last.has(q.skillId)).length, from === to ? 10 : 6);
    assert.deepEqual(pack.questions.map(q => q.kind), [...Array(8).fill('choice'), 'text', 'text']);
    assert(pack.questions.every(q => checkQuizAnswer(q, q.answer).correct));
    assert.deepEqual(pack, generateQuizPack({...scope, date}, 'english', {classId: 'classA', english}));
  }
  assert.notEqual(generateQuizPack(scope, 'english', {classId: 'classB', english: {kind: 'stages', from: 0, to: 0}}).id, generateQuizPack(scope, 'english', {classId: 'classA', english: {kind: 'stages', from: 0, to: 0}}).id);
  assert.deepEqual(generateQuizPack(scope, 'english'), shared);
  const words = quizVocabulary(3).map(word => word.id);
  for (const count of [5, 7, 10, 23, 30]) {
    const chosen = words.slice(30, 30 + count), pack = generateQuizPack(scope, 'english', {classId: 'classA', english: {kind: 'words', words: chosen}});
    assert.equal(new Set(pack.questions.map(q => q.prompt)).size, 10);
    assert(pack.questions.every(q => chosen.includes(q.skillId)));
    const choices = pack.questions.filter(q => q.kind === 'choice');
    assert.equal(choices.length, count < 10 ? count : 8);
    if (count < 10) assert.deepEqual(new Set(choices.map(q => q.skillId)), new Set(chosen));
    assert.deepEqual(pack.questions.map(q => q.kind), [...Array(choices.length).fill('choice'), ...Array(10 - choices.length).fill('text')]);
  }
});

test('a teacher math stage replaces personal progress for the day with 7 chosen-stage and 3 previous-stage questions', () => {
  for (let grade = 1; grade <= 6; grade++) {
    const index = quizMathIndex(grade);
    assert.equal(index.length, 12); assert(index.every(row => row.labels.length >= 1 && row.labels.every(Boolean)));
    for (let stage = 0; stage < 12; stage++) for (const completed of [0, 37, 125]) {
      const pack = generatePracticeMathPack({...scope, grade}, completed, stage);
      const stages = pack.questions.map(q => Number(q.skillId.match(/-t(\d+)-/)![1]));
      assert.deepEqual(stages, [...Array(7).fill(stage), ...Array(3).fill(Math.max(0, stage - 1))]);
      assert.equal(new Set(pack.questions.map(q => q.prompt)).size, 10);
      assert(pack.questions.every(q => checkQuizAnswer(q, q.answer).correct));
      assert.notEqual(pack.id, generatePracticeMathPack({...scope, grade}, completed).id);
      assert.deepEqual(pack, generatePracticeMathPack({...scope, grade}, completed, stage));
    }
  }
  assert.deepEqual(generatePracticeMathPack(scope, 12), generatePracticeMathPack(scope, 12, undefined));
});
