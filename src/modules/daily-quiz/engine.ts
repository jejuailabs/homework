import {createHash} from 'node:crypto';
import {ANNUAL_QUIZ_VERSION, ANNUAL_STAGES, MATH_PRACTICE_VERSION, quizCalendar, quizPracticeMathStage, quizMathStage, quizStageWordIndices, quizWordIndices} from './curriculum';
import {quizVocabulary} from './vocabulary';
import type {QuizAnswer, QuizEnglishRange, QuizPack, QuizPublicSession, QuizQuestion, QuizRange, QuizScope, QuizSession, QuizSkill, QuizSubject, Understanding} from './types';
export const QUIZ_VERSION = 'pilot-v1';
export const ENGLISH_PACK_VERSION = ANNUAL_QUIZ_VERSION;
export const DAILY_REWARD_HALF_UNITS = 10; // 5 Bomal per completed common subject.
export const REVIEW_LIMIT = 5;
export function validQuizCronSecret(value: unknown): value is string {return typeof value === 'string' && value.length >= 16 && !/\s/.test(value);}
export class QuizError extends Error {constructor(message: string, public code = 'QUIZ_INPUT', public status = 400) {super(message);}}
export function seoulQuizDate(now = new Date()) {return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);}
export function quizDate(value: unknown): string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new QuizError('날짜를 확인해 주세요.');
  return value;
}
export function quizAddDays(date: string, count: number) {const at = new Date(`${quizDate(date)}T00:00:00Z`); at.setUTCDate(at.getUTCDate() + count); return at.toISOString().slice(0, 10);}
export function quizWeekStart(date: string) {const day = new Date(`${quizDate(date)}T00:00:00Z`).getUTCDay(); return quizAddDays(date, -(day + 6) % 7);}
export function quizScope(value: {grade?: unknown; semester?: unknown; date?: unknown}): QuizScope {
  const grade = Number(value.grade), semester = Number(value.semester);
  if (!Number.isInteger(grade) || grade < 1 || grade > 6 || ![1, 2].includes(semester)) throw new QuizError('초등 1~6학년과 학기를 선택해 주세요.');
  return {grade, semester, date: quizDate(value.date)};
}
export function quizPackId(scope: QuizScope, subject: QuizSubject) {return `${ANNUAL_QUIZ_VERSION}_${scope.date}_g${scope.grade}_${subject}`;}
export const QUIZ_RANGE_MIN_WORDS = 5, QUIZ_RANGE_MAX_WORDS = 30;
const stageOf = (value: unknown, message: string) => {const stage = Number(value); if (typeof value !== 'number' || !Number.isInteger(stage) || stage < 0 || stage >= ANNUAL_STAGES) throw new QuizError(message); return stage;};
/** Validates a teacher range against the class grade; word ranges keep vocabulary order so equal choices share one pack. */
export function quizRange(value: {english?: unknown; math?: unknown}, grade: number): QuizRange {
  let english: QuizEnglishRange | null = null, math: QuizRange['math'] = null;
  const rawEnglish = value.english as Record<string, unknown> | null | undefined, rawMath = value.math as Record<string, unknown> | null | undefined;
  if (rawEnglish !== null && rawEnglish !== undefined) {
    if (typeof rawEnglish !== 'object' || Array.isArray(rawEnglish)) throw new QuizError('영어 범위를 확인해 주세요.');
    if (rawEnglish.kind === 'stages') {
      const from = stageOf(rawEnglish.from, '영어 단계를 확인해 주세요.'), to = stageOf(rawEnglish.to, '영어 단계를 확인해 주세요.');
      if (from > to) throw new QuizError('영어 시작 단계가 끝 단계보다 뒤에 있어요.');
      english = {kind: 'stages', from, to};
    } else if (rawEnglish.kind === 'words') {
      if (!Array.isArray(rawEnglish.words) || rawEnglish.words.some(word => typeof word !== 'string')) throw new QuizError('영어 단어를 선택해 주세요.');
      const chosen = new Set(rawEnglish.words as string[]), words = quizVocabulary(grade).map(word => word.id).filter(id => chosen.has(id));
      if (words.length !== chosen.size) throw new QuizError('이 학년 단어 목록에 없는 단어가 있어요.');
      if (words.length < QUIZ_RANGE_MIN_WORDS || words.length > QUIZ_RANGE_MAX_WORDS) throw new QuizError(`영어 단어는 ${QUIZ_RANGE_MIN_WORDS}~${QUIZ_RANGE_MAX_WORDS}개를 골라 주세요.`);
      english = {kind: 'words', words};
    } else throw new QuizError('영어 범위 종류를 확인해 주세요.');
  }
  if (rawMath !== null && rawMath !== undefined) {
    if (typeof rawMath !== 'object' || Array.isArray(rawMath)) throw new QuizError('연산 단계를 확인해 주세요.');
    math = {stage: stageOf(rawMath.stage, '연산 단계를 확인해 주세요.')};
  }
  return {english, math};
}
export function quizRangePackId(scope: QuizScope, classId: string, english: QuizEnglishRange) {
  return `${quizPackId(scope, 'english')}_c${classId}_${createHash('sha256').update(JSON.stringify(english)).digest('hex').slice(0, 12)}`;
}
/** Ten English slots for a teacher range: 6 from the last stage and 4 from earlier stages, or rotated chosen words.
 * Fewer than ten chosen words are each asked once as a choice, then the remaining slots become spelling. */
export function quizRangeWordPicks(english: QuizEnglishRange, date: string, grade: number): {index: number; spell: boolean}[] {
  const words = quizVocabulary(grade), day = Math.max(0, quizCalendar(date).day), selected: number[] = [];
  const take = (pool: number[], amount: number, offset: number) => {
    for (let n = 0; n < pool.length && amount; n++) {const value = pool[(offset + n) % pool.length]; if (!selected.includes(value)) {selected.push(value); amount--;}}
  };
  if (english.kind === 'words') {
    const pool = english.words.map(id => words.findIndex(word => word.id === id));
    if (pool.length < 10) return [...pool.map(index => ({index, spell: false})), ...pool.slice(0, 10 - pool.length).map(index => ({index, spell: true}))];
    take(pool, 10, day * 10 % pool.length);
  } else {
    const last = quizStageWordIndices(english.to, words.length), earlier = Array.from({length: english.to - english.from}, (_, i) => quizStageWordIndices(english.from + i, words.length)).flat();
    take(last, earlier.length ? 6 : 10, day % (last.length || 1));
    take(earlier, 10 - selected.length, day * 4 % (earlier.length || 1));
    take([...earlier, ...last], 10 - selected.length, 0);
  }
  return selected.map((index, i) => ({index, spell: i >= selected.length - 2}));
}
/** Per-grade content index shown to teachers. */
export function quizEnglishIndex(grade: number) {
  const words = quizVocabulary(grade);
  return Array.from({length: ANNUAL_STAGES}, (_, stage) => ({stage, words: quizStageWordIndices(stage, words.length).map(index => words[index])}));
}
export function quizMathIndex(grade: number) {
  const scope = {grade, semester: 1, date: '2026-03-02'};
  return Array.from({length: ANNUAL_STAGES}, (_, stage) => ({stage, labels: [...new Set([0, 1].map(index => mathQuestion(scope, index, `index_${grade}_${stage}_${index}`, undefined, undefined, stage).skillLabel))]}));
}
export function seededRandom(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619) >>> 0;
  return () => {value += 0x6d2b79f5; let x = value; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296;};
}
const pickInt = (random: () => number, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const questionId = (seed: string, index: number) => createHash('sha256').update(`${seed}:${index}`).digest('hex').slice(0, 32);
function shuffle<T>(items: T[], random: () => number) {const result = [...items]; for (let i = result.length - 1; i > 0; i--) {const j = pickInt(random, 0, i); [result[i], result[j]] = [result[j], result[i]];} return result;}
function spellingSlots(indices: number[], _seed: string) {const count = Math.round(indices.length * 0.2); return new Set(count ? indices.slice(-count) : []);}
/** Also fixes the presentation of previously saved packs without changing answers or rewards. */
export function spellingLast<T extends {subject: QuizSubject; kind: string}>(questions: T[]): T[] {
  return [...questions.filter(q => !(q.subject === 'english' && q.kind === 'text')), ...questions.filter(q => q.subject === 'english' && q.kind === 'text')];
}
function gcd(a: number, b: number): number {return b ? gcd(b, a % b) : Math.abs(a);}
function rational(n: number, d = 1) {const divisor = gcd(n, d); n /= divisor; d /= divisor; return d === 1 ? String(n) : `${n}/${d}`;}
export function quizNumber(value: string): [number, number] | null {
  const raw = value.normalize('NFKC').replace(/\s/g, '');
  let n: number, d: number;
  if (/^-?\d{1,9}\/\d{1,9}$/.test(raw)) [n, d] = raw.split('/').map(Number);
  else if (/^-?\d{1,9}(?:\.\d{1,6})?$/.test(raw)) {d = 10 ** (raw.split('.')[1]?.length || 0); n = Math.round(Number(raw) * d);}
  else return null;
  if (!d || !Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return null;
  const divisor = gcd(n, d); return [n / divisor, d / divisor];
}
export function checkQuizAnswer(question: QuizQuestion, raw: unknown): {answer: string; correct: boolean} {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 100) throw new QuizError('답을 입력하거나 보기를 선택해 주세요.');
  const answer = raw.trim();
  if (question.kind === 'choice' && !question.choices.includes(answer)) throw new QuizError('문제의 보기 중에서 선택해 주세요.');
  if (question.kind === 'number') {
    const supplied = quizNumber(answer), expected = quizNumber(question.answer);
    if (!supplied || !expected) throw new QuizError('숫자, 소수 또는 분수(a/b)로 입력해 주세요.');
    return {answer, correct: supplied[0] === expected[0] && supplied[1] === expected[1]};
  }
  return {answer, correct: answer.normalize('NFKC').toLowerCase() === question.answer.normalize('NFKC').toLowerCase()};
}
function englishQuestion(scope: QuizScope, index: number, seed: string, skillId?: string, spell = false, wordIndex?: number): QuizQuestion {
  const words = quizVocabulary(scope.grade), random = seededRandom(seed);
  const word = skillId ? words.find(word => word.id === skillId)! : words[wordIndex ?? quizWordIndices(scope.date, words.length)[index]];
  if (!word) throw new QuizError('복습할 단어를 찾을 수 없어요.');
  const choices = spell ? [] : shuffle([word.meaning, ...shuffle(words.filter(item => item.id !== word.id), random).slice(0, 3).map(item => item.meaning)], random);
  return {id: questionId(seed, index), subject: 'english', skillId: word.id, skillLabel: `${word.word} · ${word.meaning}`, prompt: spell ? `‘${word.meaning}’에 해당하는 영어 단어를 쓰세요.` : `‘${word.word}’의 뜻을 고르세요.`, choices, answer: spell ? word.word : word.meaning, explanation: `${word.word} = ${word.meaning}`, kind: spell ? 'text' : 'choice'};
}
/** teacherStage replaces personal progress for one day: 7 questions at that stage and 3 from the stage before it. */
function mathQuestion(scope: QuizScope, index: number, seed: string, skillId?: string, practiceDays?: number, teacherStage?: number): QuizQuestion {
  const random = seededRandom(seed), grade = scope.grade;
  const retained = skillId?.match(/^annual-g\d-t(\d+)-(add|sub|mul|div)$/);
  const stage = retained ? Number(retained[1]) : teacherStage !== undefined ? index < 7 || !teacherStage ? teacherStage : teacherStage - 1 : practiceDays === undefined ? quizMathStage(scope.date, index) : quizPracticeMathStage(practiceDays, index);
  let operation = retained?.[2] || (index % 2 ? 'sub' : 'add'), prompt = '', answer = '', label = '';
  let family: 'whole' | 'product' | 'fraction-sum' | 'fraction-product' | 'decimal-sum' | 'decimal-product' = 'whole';
  if (grade === 2 && stage >= 9 || grade === 3 && stage >= 3 || grade === 4) family = 'product';
  if (grade === 5 && stage >= 2) family = stage >= 9 ? 'decimal-sum' : 'fraction-sum';
  if (grade === 6) family = stage < 2 ? 'fraction-sum' : stage < 7 ? 'fraction-product' : 'decimal-product';
  if (family === 'whole') {
    const ranges = grade === 1 ? [10,10,10,10,20,20,20,20,50,50,99,99] : grade === 2 ? [20,20,50,99,99,99,999,999,999,999,999,999] : grade === 3 ? [99,999,999] : [999,999];
    const max = ranges[stage] || 999;
    if (operation === 'add') {const a = pickInt(random, 1, max - 1), b = pickInt(random, 1, max - a); prompt = `${a} + ${b}`; answer = String(a + b); label = `${max} 이내 덧셈`;}
    else {const a = pickInt(random, 2, max), b = pickInt(random, 1, a); prompt = `${a} − ${b}`; answer = String(a - b); label = `${max} 이내 뺄셈`;}
  } else if (family === 'product') {
    operation = retained?.[2] || (index % 2 && (grade !== 2 || stage >= 11) ? 'div' : 'mul');
    const maxFactor = grade === 2 ? 9 : grade === 3 ? stage < 7 ? 9 : stage < 10 ? 30 : 99 : stage < 4 ? 99 : 999;
    const maxDivisor = grade === 2 ? stage < 11 ? 5 : 9 : grade === 4 && stage >= 8 ? 20 : 9;
    const a = pickInt(random, 2, maxFactor), b = pickInt(random, 2, maxDivisor);
    prompt = operation === 'mul' ? `${a} × ${b}` : `${a * b} ÷ ${b}`; answer = String(operation === 'mul' ? a * b : a);
    label = operation === 'mul' ? `${maxFactor}까지 수의 곱셈` : `${maxDivisor}까지 수로 나누는 나눗셈`;
  } else if (family === 'fraction-sum') {
    const denominator = pickInt(random, 3, stage < 5 ? 6 : 12), other = grade === 5 && stage < 6 ? denominator : pickInt(random, 3, stage < 5 ? 6 : 12);
    let a = pickInt(random, 1, denominator - 1), b = pickInt(random, 1, other - 1), d1 = denominator, d2 = other;
    if (operation === 'sub' && a * d2 < b * d1) {[a, b] = [b, a]; [d1, d2] = [d2, d1];}
    prompt = `${a}/${d1} ${operation === 'sub' ? '−' : '+'} ${b}/${d2}`; answer = rational(operation === 'sub' ? a * d2 - b * d1 : a * d2 + b * d1, d1 * d2);
    label = grade === 5 && stage < 6 ? '같은 분모 분수의 덧셈·뺄셈' : '분수의 덧셈·뺄셈';
  } else if (family === 'decimal-sum') {
    const places = stage < 11 ? 10 : 100;
    let a = pickInt(random, 1, 99), b = pickInt(random, 1, 99);
    if (operation === 'sub' && a < b) [a, b] = [b, a];
    prompt = `${(a / places).toFixed(places === 10 ? 1 : 2)} ${operation === 'sub' ? '−' : '+'} ${(b / places).toFixed(places === 10 ? 1 : 2)}`;
    answer = rational(operation === 'sub' ? a - b : a + b, places); label = '소수의 덧셈·뺄셈';
  } else {
    operation = retained?.[2] || (index % 2 && stage >= 4 ? 'div' : 'mul');
    const a = pickInt(random, 1, 9), b = pickInt(random, 2, stage < 5 ? 6 : 10), c = pickInt(random, 1, 9), d = pickInt(random, 2, stage < 5 ? 6 : 10);
    if (family === 'fraction-product') {prompt = `${a}/${b} ${operation === 'div' ? '÷' : '×'} ${c}/${d}`; answer = operation === 'div' ? rational(a * d, b * c) : rational(a * c, b * d); label = '분수의 곱셈·나눗셈';}
    else {const n = stage < 9 ? a : a * 10 + b, m = c * 10 + d; prompt = operation === 'div' ? `${(n * m / 100).toFixed(2)} ÷ ${(m / 10).toFixed(1)}` : `${(n / 10).toFixed(1)} × ${(m / 10).toFixed(1)}`; answer = operation === 'div' ? rational(n, 10) : rational(n * m, 100); label = '소수의 곱셈·나눗셈';}
  }
  return {id: questionId(seed, index), subject: 'math', skillId: `annual-g${grade}-t${stage}-${operation}`, skillLabel: label, prompt: `${prompt} = ?`, choices: [], answer, explanation: `${prompt} = ${answer}${grade >= 5 ? ' (같은 값의 분수·소수도 정답으로 인정해요.)' : ''}`, kind: 'number'};
}
/** A class range yields its own English pack ID; without one the shared grade pack is unchanged. */
export function generateQuizPack(scope: QuizScope, subject: QuizSubject, range?: {classId: string; english: QuizEnglishRange}): QuizPack {
  quizScope(scope);
  const custom = subject === 'english' && range ? quizRangeWordPicks(range.english, scope.date, scope.grade) : null;
  const id = custom ? quizRangePackId(scope, range!.classId, range!.english) : quizPackId(scope, subject), questions: QuizQuestion[] = [];
  const spelling = spellingSlots(Array.from({length: 10}, (_, i) => i), `${id}_spelling`);
  for (let i = 0; i < 10; i++) {
    let question: QuizQuestion, attempt = 0;
    do {const seed = `${id}_${i}_${attempt++}`; question = subject === 'english' ? englishQuestion(scope, i, seed, undefined, custom ? custom[i].spell : spelling.has(i), custom?.[i].index) : mathQuestion(scope, i, seed);} while (questions.some(previous => previous.prompt === question.prompt) && attempt < 100);
    if (questions.some(previous => previous.prompt === question.prompt)) throw new QuizError('중복 없는 문제 준비에 실패했어요.', 'QUIZ_GENERATION', 500);
    questions.push(question);
  }
  return {...scope, id, subject, version: ANNUAL_QUIZ_VERSION, questions};
}
export function generatePracticeMathPack(scope: QuizScope, completedDays: number, teacherStage?: number): QuizPack {
  quizScope(scope);
  const id = `${MATH_PRACTICE_VERSION}_${scope.date}_g${scope.grade}_d${completedDays}${teacherStage === undefined ? '' : `_t${teacherStage}`}`, questions: QuizQuestion[] = [];
  for (let i = 0; i < 10; i++) {
    let question: QuizQuestion, attempt = 0;
    do {question = mathQuestion(scope, i, `${id}_${i}_${attempt++}`, undefined, completedDays, teacherStage);} while (questions.some(q => q.prompt === question.prompt) && attempt < 100);
    if (questions.some(q => q.prompt === question.prompt)) throw new QuizError('중복 없는 연산 준비에 실패했어요.', 'QUIZ_GENERATION', 500);
    questions.push(question);
  }
  return {...scope, id, subject: 'math', version: MATH_PRACTICE_VERSION, questions};
}
export function generateQuizReview(scope: QuizScope, learnerId: string, skills: QuizSkill[]): QuizQuestion[] {
  const due = skills.filter(skill => skill.dueDate <= scope.date && skill.lastDate < scope.date).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)).slice(0, REVIEW_LIMIT);
  const spelling = spellingSlots(due.flatMap((skill, i) => skill.subject === 'english' ? [i] : []), `review_${scope.date}_${learnerId}_spelling`);
  return spellingLast(due.map((skill, i) => {
    const seed = `review_${scope.date}_g${scope.grade}_s${scope.semester}_${learnerId}_${skill.id}`;
    return skill.subject === 'english' ? englishQuestion(scope, i + 1, seed, skill.id, spelling.has(i)) : mathQuestion(scope, i, seed, skill.id);
  }));
}
export function nextQuizSkill(question: QuizQuestion, result: QuizAnswer, date: string, previous?: QuizSkill): QuizSkill {
  const sameDay = previous?.lastDate === date;
  let interval = !result.correct ? 1 : result.understanding === 'unknown' ? 1 : result.understanding === 'unsure' ? 3 : Math.min(30, !sameDay && previous?.correctStreak ? previous.interval * 2 : 7);
  if (sameDay) interval = Math.min(interval, previous.interval);
  return {id: question.skillId, subject: question.subject, label: question.skillLabel, dueDate: quizAddDays(date, interval), interval, attempts: (previous?.attempts || 0) + 1, correctStreak: result.correct ? sameDay ? previous.correctStreak : (previous?.correctStreak || 0) + 1 : 0, lastDate: date, lastQuestionId: question.id};
}
export function publicQuizSession(session: QuizSession): QuizPublicSession {
  const {answers, questions, ...rest} = session;
  return {...rest, questions: spellingLast(questions).map(question => {const {answer, explanation, skillId: _skillId, ...view} = question, result = answers[question.id]; return {...view, skillLabel: result ? question.skillLabel : question.subject === 'english' ? '기초 단어 확인' : question.skillLabel, ...(result ? {result: {...result, expected: answer, explanation}} : {})};})};
}
export function quizRanking(rows: {id: string; name: string; sessions: QuizSession[]}[]) {
  const scores = rows.map(row => {
    const daily = row.sessions.filter(session => session.mode !== 'review' && session.completed), correct = daily.reduce((total, session) => total + Object.values(session.answers).filter(answer => answer.correct).length, 0);
    return {id: row.id, name: row.name, score: correct, correct, completedDays: new Set(daily.map(session => session.date)).size, completedSubjects: daily.length, rank: 0};
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  scores.forEach((row, i) => {row.rank = i && row.score === scores[i - 1].score ? scores[i - 1].rank : i + 1;}); return scores;
}
