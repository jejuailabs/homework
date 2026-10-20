import {createHash} from 'node:crypto';
import {quizVocabulary} from './vocabulary';
import type {QuizAnswer, QuizPack, QuizPublicSession, QuizQuestion, QuizScope, QuizSession, QuizSkill, QuizSubject, Understanding} from './types';
export const QUIZ_VERSION = 'pilot-v1';
export const DAILY_REWARD_HALF_UNITS = 10; // 5 Bomal; production wallets are not touched.
export const REVIEW_LIMIT = 5;
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
export function quizPackId(scope: QuizScope, subject: QuizSubject) {return `${QUIZ_VERSION}_${scope.date}_g${scope.grade}_s${scope.semester}_${subject}`;}
export function seededRandom(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619) >>> 0;
  return () => {value += 0x6d2b79f5; let x = value; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296;};
}
const pickInt = (random: () => number, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const questionId = (seed: string, index: number) => createHash('sha256').update(`${seed}:${index}`).digest('hex').slice(0, 32);
function shuffle<T>(items: T[], random: () => number) {const result = [...items]; for (let i = result.length - 1; i > 0; i--) {const j = pickInt(random, 0, i); [result[i], result[j]] = [result[j], result[i]];} return result;}
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
function englishQuestion(scope: QuizScope, index: number, seed: string, skillId?: string): QuizQuestion {
  const words = quizVocabulary(scope.grade), random = seededRandom(seed), startDay = Math.floor(Date.parse(`${scope.date}T00:00:00Z`) / 86400000);
  const word = skillId ? words.find(word => word.id === skillId)! : words[(startDay * 10 + index + (scope.semester - 1) * 5) % words.length];
  if (!word) throw new QuizError('복습할 단어를 찾을 수 없어요.');
  const spell = (index + startDay) % 2 === 1, choices = spell ? [] : shuffle([word.meaning, ...shuffle(words.filter(item => item.id !== word.id), random).slice(0, 3).map(item => item.meaning)], random);
  return {id: questionId(seed, index), subject: 'english', skillId: word.id, skillLabel: `${word.word} · ${word.meaning}`, prompt: spell ? `‘${word.meaning}’에 해당하는 영어 단어를 쓰세요.` : `‘${word.word}’의 뜻을 고르세요.`, choices, answer: spell ? word.word : word.meaning, explanation: `${word.word} = ${word.meaning}`, kind: spell ? 'text' : 'choice'};
}
function mathQuestion(scope: QuizScope, index: number, seed: string, skillId?: string): QuizQuestion {
  const random = seededRandom(seed), grade = scope.grade;
  let operation = skillId?.split('-').at(-1) || (index % 2 ? 'sub' : 'add'), prompt = '', answer = '', label = '';
  if (grade <= 2) {
    const max = grade === 1 ? (scope.semester === 1 ? 10 : 20) : (scope.semester === 1 ? 99 : 999);
    if (operation === 'add') {const a = pickInt(random, 1, max - 1), b = pickInt(random, 1, max - a); prompt = `${a} + ${b}`; answer = String(a + b); label = `${max} 이내 덧셈`;}
    else {const a = pickInt(random, 2, max), b = pickInt(random, 1, a); prompt = `${a} − ${b}`; answer = String(a - b); label = `${max} 이내 뺄셈`;}
  } else if (grade <= 4) {
    operation = skillId?.split('-').at(-1) || (index % 2 ? 'div' : 'mul');
    const maxFactor = grade === 3 ? (scope.semester === 1 ? 9 : 99) : (scope.semester === 1 ? 99 : 999), a = pickInt(random, 2, maxFactor), b = pickInt(random, 2, grade === 4 && scope.semester === 2 ? 20 : 9);
    if (operation === 'mul') {prompt = `${a} × ${b}`; answer = String(a * b); label = '자연수 곱셈';}
    else {prompt = `${a * b} ÷ ${b}`; answer = String(a); label = '나누어떨어지는 나눗셈';}
  } else if (grade === 5) {
    const denominator = pickInt(random, 3, 12), other = scope.semester === 1 ? denominator : pickInt(random, 3, 12);
    let a = pickInt(random, 1, denominator - 1), b = pickInt(random, 1, other - 1), d1 = denominator, d2 = other;
    if (operation === 'sub' && a * d2 < b * d1) {[a, b] = [b, a]; [d1, d2] = [d2, d1];}
    prompt = `${a}/${d1} ${operation === 'sub' ? '−' : '+'} ${b}/${d2}`; answer = rational(operation === 'sub' ? a * d2 - b * d1 : a * d2 + b * d1, d1 * d2); label = scope.semester === 1 ? '같은 분모 분수의 덧셈·뺄셈' : '다른 분모 분수의 덧셈·뺄셈';
  } else {
    operation = skillId?.split('-').at(-1) || (index % 2 ? 'div' : 'mul');
    const a = pickInt(random, 1, 9), b = pickInt(random, 2, 10), c = pickInt(random, 1, 9), d = pickInt(random, 2, 10);
    if (scope.semester === 1) {prompt = `${a}/${b} ${operation === 'div' ? '÷' : '×'} ${c}/${d}`; answer = operation === 'div' ? rational(a * d, b * c) : rational(a * c, b * d); label = '분수의 곱셈·나눗셈';}
    else {const n = a * 10 + b, m = c * 10 + d; prompt = operation === 'div' ? `${(n * m / 100).toFixed(2)} ÷ ${(m / 10).toFixed(1)}` : `${(n / 10).toFixed(1)} × ${(m / 10).toFixed(1)}`; answer = operation === 'div' ? rational(n, 10) : rational(n * m, 100); label = '소수의 곱셈·나눗셈';}
  }
  return {id: questionId(seed, index), subject: 'math', skillId: `math-g${grade}-s${scope.semester}-${operation}`, skillLabel: label, prompt: `${prompt} = ?`, choices: [], answer, explanation: `${prompt} = ${answer}${grade >= 5 ? ' (같은 값의 분수·소수도 정답으로 인정해요.)' : ''}`, kind: 'number'};
}
export function generateQuizPack(scope: QuizScope, subject: QuizSubject): QuizPack {
  quizScope(scope);
  const id = quizPackId(scope, subject), questions: QuizQuestion[] = [];
  for (let i = 0; i < 10; i++) {
    let question: QuizQuestion, attempt = 0;
    do {const seed = `${id}_${i}_${attempt++}`; question = subject === 'english' ? englishQuestion(scope, i, seed) : mathQuestion(scope, i, seed);} while (questions.some(previous => previous.prompt === question.prompt) && attempt < 100);
    if (questions.some(previous => previous.prompt === question.prompt)) throw new QuizError('중복 없는 문제 준비에 실패했어요.', 'QUIZ_GENERATION', 500);
    questions.push(question);
  }
  return {...scope, id, subject, version: QUIZ_VERSION, questions};
}
export function generateQuizReview(scope: QuizScope, learnerId: string, skills: QuizSkill[]): QuizQuestion[] {
  return skills.filter(skill => skill.dueDate <= scope.date && skill.lastDate < scope.date).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)).slice(0, REVIEW_LIMIT).map((skill, i) => {
    const seed = `review_${scope.date}_g${scope.grade}_s${scope.semester}_${learnerId}_${skill.id}`;
    return skill.subject === 'english' ? englishQuestion(scope, i + 1, seed, skill.id) : mathQuestion(scope, i, seed, skill.id);
  });
}
export function nextQuizSkill(question: QuizQuestion, result: QuizAnswer, date: string, previous?: QuizSkill): QuizSkill {
  const sameDay = previous?.lastDate === date;
  let interval = !result.correct ? 1 : result.understanding === 'unknown' ? 1 : result.understanding === 'unsure' ? 3 : Math.min(30, !sameDay && previous?.correctStreak ? previous.interval * 2 : 7);
  if (sameDay) interval = Math.min(interval, previous.interval);
  return {id: question.skillId, subject: question.subject, label: question.skillLabel, dueDate: quizAddDays(date, interval), interval, attempts: (previous?.attempts || 0) + 1, correctStreak: result.correct ? sameDay ? previous.correctStreak : (previous?.correctStreak || 0) + 1 : 0, lastDate: date, lastQuestionId: question.id};
}
export function publicQuizSession(session: QuizSession): QuizPublicSession {
  const {answers, questions, ...rest} = session;
  return {...rest, questions: questions.map(question => {const {answer, explanation, skillId: _skillId, ...view} = question, result = answers[question.id]; return {...view, skillLabel: result ? question.skillLabel : question.subject === 'english' ? '기초 단어 확인' : question.skillLabel, ...(result ? {result: {...result, expected: answer, explanation}} : {})};})};
}
export function quizRanking(rows: {id: string; name: string; sessions: QuizSession[]}[]) {
  const scores = rows.map(row => {
    const daily = row.sessions.filter(session => session.mode !== 'review' && session.completed), correct = daily.reduce((total, session) => total + Object.values(session.answers).filter(answer => answer.correct).length, 0);
    return {id: row.id, name: row.name, score: correct, correct, completedDays: new Set(daily.map(session => session.date)).size, completedSubjects: daily.length, rank: 0};
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  scores.forEach((row, i) => {row.rank = i && row.score === scores[i - 1].score ? scores[i - 1].rank : i + 1;}); return scores;
}
