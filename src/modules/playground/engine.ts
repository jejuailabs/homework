import {defaultPlaySettings, playKinds, type GradeBand, type PlayChoice, type PlayItem, type PlayKind, type PlayRank, type PlayScore, type PlaySession, type PlaySettings, type PlaySkill, type PublicPlaySession} from './types';

export class PlayError extends Error {
  constructor(message: string, public code = 'PLAY_INPUT', public status = 400) {super(message); this.name = 'PlayError';}
}

/** Korean compatibility forms are normalized, but spelling questions retain word boundaries. */
export function normalizeAnswer(raw: string, kind: PlayKind) {
  const value = raw.normalize('NFKC').trim().replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '').trim();
  return kind === 'spelling' ? value : value.replace(/[\s\p{P}\p{S}]/gu, '').toLocaleLowerCase('ko');
}

export function chosung(raw: string) {
  const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  return Array.from(raw.normalize('NFC'), letter => {
    const code = letter.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? initials[Math.floor(code / 588)] : letter;
  }).join('');
}

export function gradeBand(grade: unknown): GradeBand {
  if (typeof grade !== 'number' && (typeof grade !== 'string' || !/^[1-6]$/.test(grade))) throw new PlayError('선생님이 학급 학년을 설정하면 시작할 수 있어요.', 'PLAY_GRADE', 409);
  const value = Number(grade);
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new PlayError('초등 1~6학년을 선택해 주세요.', 'PLAY_GRADE', 409);
  return value <= 2 ? 'low' : value <= 4 ? 'mid' : 'high';
}

function checkedDate(date: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new PlayError('날짜를 확인해 주세요.', 'PLAY_DATE');
  return date;
}
export function playDate(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new PlayError('날짜를 확인해 주세요.', 'PLAY_DATE');
  return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
}
export function addDays(date: string, n: number) {
  if (!Number.isSafeInteger(n)) throw new PlayError('날짜 간격을 확인해 주세요.', 'PLAY_DATE');
  const value = new Date(`${checkedDate(date)}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + n);
  if (!Number.isFinite(value.getTime())) throw new PlayError('날짜 간격을 확인해 주세요.', 'PLAY_DATE');
  return checkedDate(value.toISOString().slice(0, 10));
}
export function weekStart(date: string) {
  const day = new Date(`${checkedDate(date)}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export function schoolYear(date: string) {checkedDate(date); return Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 3 ? 1 : 0);}

function hash(value: string) {
  let state = 2166136261;
  for (let i = 0; i < value.length; i++) state = Math.imul(state ^ value.charCodeAt(i), 16777619) >>> 0;
  return state;
}
function random(seed: string) {
  let value = hash(seed);
  return () => {value = (value + 0x6d2b79f5) >>> 0; let x = value; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296;};
}
/** IDs encode neither correctness nor the source order. Submit the ID, never a display index. */
export function choicesFor(item: PlayItem, seed: string): PlayChoice[] {
  const namespace = JSON.stringify([item.id, item.version, seed]);
  const choices = (item.choices || []).map(label => ({id: `c_${hash(namespace + label).toString(36)}_${hash(label + namespace).toString(36)}`, label}));
  const next = random(namespace);
  for (let i = choices.length - 1; i > 0; i--) {const j = Math.floor(next() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]];}
  return choices;
}

export const DAILY_SIZE = 10;
/** Today's set for one kind: teacher-assigned unseen items, then unseen, then already-tried ones; each tier in a per-seed shuffle. */
export function dailyPick(items: PlayItem[], seen: Set<string>, assigned: Set<string>, seed: string, size = DAILY_SIZE): string[] {
  const order = (rows: PlayItem[]) => rows.map(item => ({item, key: hash(`${seed}:${item.id}`)})).sort((a, b) => a.key - b.key || a.item.id.localeCompare(b.item.id)).map(row => row.item);
  const fresh = items.filter(item => !seen.has(item.id));
  return [...order(fresh.filter(item => assigned.has(item.id))), ...order(fresh.filter(item => !assigned.has(item.id))), ...order(items.filter(item => seen.has(item.id)))].slice(0, size).map(item => item.id);
}
export function hintsFor(item: PlayItem): string[] {
  if (item.hints.length || item.kind !== 'vocab') return [...item.hints];
  const answer = item.answers[0].normalize('NFC'), letters = Array.from(answer.replace(/\s/g, ''));
  return [`띄어쓰기를 빼면 ${letters.length}글자예요.`, `초성은 ${chosung(answer)}예요.`, `첫 글자는 ‘${letters[0]}’예요.`];
}
export function publicSession(session: PlaySession): PublicPlaySession {
  const hints = hintsFor(session.item), hintCount = Math.max(0, Math.min(hints.length, Math.trunc(session.hintsUsed) || 0));
  return {id: session.id, kind: session.kind, itemId: session.item.id, prompt: session.item.prompt, choices: choicesFor(session.item, session.seed), hints: hints.slice(0, hintCount), hintCount, maxHints: hints.length, ...(session.result ? {result: {...session.result}} : {})};
}
export function answerScore(correct: boolean, hintsUsed: number) {
  if (!Number.isSafeInteger(hintsUsed) || hintsUsed < 0) throw new PlayError('힌트 사용 기록을 다시 확인해 주세요.', 'PLAY_HINT');
  return correct ? hintsUsed === 0 ? 10 : hintsUsed === 1 ? 7 : 4 : 0;
}
/** Same recurrence as daily-quiz/nextQuizSkill; tests compare both implementations. */
export function nextPlaySkill(id: string, correct: boolean, unsure: boolean, date: string, previous?: PlaySkill): PlaySkill {
  checkedDate(date);
  const sameDay = previous?.lastDate === date;
  let interval = !correct ? 1 : unsure ? 3 : Math.min(30, !sameDay && previous?.correctStreak ? previous.interval * 2 : 7);
  if (sameDay) interval = Math.min(interval, previous.interval);
  return {id, dueDate: addDays(date, interval), interval, attempts: (previous?.attempts || 0) + 1, correctStreak: correct ? sameDay ? previous.correctStreak : (previous?.correctStreak || 0) + 1 : 0, lastDate: date, errors: (previous?.errors || 0) + (correct ? 0 : 1)};
}
export function rankRows(rows: {id: string; name: string; score: number}[]): PlayRank[] {
  const ranked = rows.map(row => ({...row, rank: 0})).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  ranked.forEach((row, i) => {row.rank = i && row.score === ranked[i - 1].score ? ranked[i - 1].rank : i + 1;});
  return ranked;
}
export function emptyScore(): PlayScore {return {solo: 0, wins: 0, draws: 0, losses: 0, games: 0, days: [], correct: 0, answered: 0};}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PlayError('입력 내용을 확인해 주세요.');
  return input as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new PlayError(`${label}을(를) 확인해 주세요.`);
  return value.normalize('NFC').trim();
}
function strings(value: unknown, label: string, min: number, max: number, length: number) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new PlayError(`${label}은(는) ${min}~${max}개로 입력해 주세요.`);
  return value.map(row => text(row, label, length));
}
export function validateItem(input: unknown, id?: string): PlayItem {
  const value = object(input), itemId = id ?? value.id;
  if (typeof itemId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(itemId)) throw new PlayError('문제 ID를 확인해 주세요.');
  if (!playKinds.includes(value.kind as PlayKind)) throw new PlayError('문제 종류를 선택해 주세요.');
  if (!['low', 'mid', 'high'].includes(value.gradeBand as string)) throw new PlayError('문제 학년대를 선택해 주세요.');
  const kind = value.kind as PlayKind, answers = strings(value.answers, '정답', 1, 8, 120), normalized = answers.map(answer => normalizeAnswer(answer, kind));
  if (normalized.some(answer => !answer) || new Set(normalized).size !== normalized.length) throw new PlayError('비어 있거나 겹치는 정답을 확인해 주세요.');
  const choices = value.choices === undefined ? undefined : strings(value.choices, '보기', 2, 4, 120);
  if (choices) {
    const options = choices.map(choice => normalizeAnswer(choice, kind));
    if (options.some(choice => !choice) || new Set(options).size !== options.length || options.filter(choice => normalized.includes(choice)).length !== 1 || !options.includes(normalized[0])) throw new PlayError('보기에 대표 정답을 한 번 넣고, 겹치는 보기를 지워 주세요.');
  }
  const source = value.source ?? 'teacher';
  if (!['bank', 'teacher', 'ai-approved'].includes(source as string)) throw new PlayError('문제 출처를 확인해 주세요.');
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new PlayError('문제 사용 설정을 확인해 주세요.');
  const tags = value.tags === undefined ? undefined : strings(value.tags, '주제', 0, 8, 30);
  return {id: itemId, version: text(value.version ?? 'teacher-v1', '문제 버전', 60), kind, gradeBand: value.gradeBand as GradeBand, prompt: text(value.prompt, '문제', 600), answers, ...(choices ? {choices} : {}), hints: strings(value.hints ?? [], '힌트', 0, 3, 300), reveal: text(value.reveal, '설명', 1200), ...(tags ? {tags} : {}), source: source as PlayItem['source'], enabled: value.enabled !== false};
}
export function validateSettings(input: unknown): PlaySettings {
  const value = object(input), result: PlaySettings = {...defaultPlaySettings, timeWindows: []};
  for (const field of ['enabled', 'allowDuels', 'showRankings', 'rewardsEnabled'] as const) {
    if (typeof value[field] !== 'boolean') throw new PlayError('사용 설정을 확인해 주세요.');
    result[field] = value[field];
  }
  for (const field of ['soloReward', 'duelReward'] as const) {
    if (typeof value[field] !== 'number' || !Number.isSafeInteger(value[field]) || value[field] < 0 || value[field] > 3) throw new PlayError('보말 지급량은 0~3 사이의 정수로 입력해 주세요.');
    result[field] = value[field];
  }
  if (!Array.isArray(value.timeWindows) || value.timeWindows.length > 10) throw new PlayError('대결 이용 시간대는 10개까지 설정할 수 있어요.');
  result.timeWindows = value.timeWindows.map(raw => {
    const window = object(raw), {start, end} = window;
    if (typeof start !== 'string' || typeof end !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end) throw new PlayError('이용 시간의 시작과 끝을 확인해 주세요.');
    return {start, end};
  }).sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < result.timeWindows.length; i++) if (result.timeWindows[i].start < result.timeWindows[i - 1].end) throw new PlayError('서로 겹치는 이용 시간대를 합쳐 주세요.');
  return result;
}
