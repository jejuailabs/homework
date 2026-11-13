// 카드 스피킹 규칙. 선생님이 배부한 세트에서 켜면 학생이 카드마다 한 개의 녹음을 남긴다.
// 녹음은 어디서나 재생되도록 16kHz 모노 WAV로 저장하고, 다시 녹음하면 이전 파일을 지운다.
import {safeSegment} from './storage-export';
import type {CardEntry} from './cards-types';

export const SPEAKING_MAX_SECONDS = 30, SPEAKING_RATE_HZ = 16000;
export const SPEAKING_MAX_BYTES = 44 + SPEAKING_RATE_HZ * 2 * SPEAKING_MAX_SECONDS;
export const SPEAKING_ZIP_MAX_BYTES = 1024 ** 3;

export type SpeakingTake = {takeId: string; bytes: number; seconds: number; at: string; url?: string};
export type SpeakingTakes = Record<string, SpeakingTake>;
export type SpeakingFile = {path: string; bytes: number; url: string};
export type SpeakingStudentRow = {id: string; number: number; name: string; recorded: number; lastAt: string | null; percent?: number};

export const speakingCards = (cards: CardEntry[]) => cards.filter(card => card.front.trim());
/** Takes for cards still in the set; a snapshot never changes, but this keeps the count honest. */
export const speakingRecorded = (cards: CardEntry[], takes: SpeakingTakes) => speakingCards(cards).filter(card => takes[card.id]).length;
export const speakingComplete = (cards: CardEntry[], takes: SpeakingTakes) => speakingCards(cards).length > 0 && speakingRecorded(cards, takes) === speakingCards(cards).length;
/** "003_look after.wav": the card's place in the set first, so files sort in study order. */
export function speakingFileName(position: number, front: string) {
  return `${String(position + 1).padStart(3, '0')}_${safeSegment(front.slice(0, 40), 'card')}.wav`;
}
export function speakingFolderName(number: number, name: string) {
  return safeSegment(`${number ? `${String(number).padStart(2, '0')}번_` : ''}${name}`, '학생');
}
/**
 * 스피킹 6단계, in 클래스카드 order: 입해석 (read the English, say the meaning), 입영작 (read the meaning, say the English),
 * 집중듣기 (listen), 낭독 (read aloud while recording), 쉐도잉 (repeat after the voice; the browser listens) and
 * 녹음 - 입영작 (record the English from the meaning). 낭독 and 녹음 keep a recording per card; the others keep counts only.
 */
export const SPEAKING_STEPS = ['read', 'comp', 'listen', 'aloud', 'shadow', 'record'] as const;
export type SpeakingStep = typeof SPEAKING_STEPS[number];
export type SpeakingCounts = Partial<Record<SpeakingStep, Record<string, number>>>;
/** 필수 횟수 per step, set by the teacher. 0 is 자율 (optional, once counts as done). */
export type SpeakingRequired = Record<SpeakingStep, number>;
export const SPEAKING_REQUIRED_MAX = 10, SPEAKING_COUNT_MAX = 999;
export const emptySpeakingRequired = (): SpeakingRequired => ({read: 0, comp: 0, listen: 0, aloud: 0, shadow: 0, record: 0});
export function parseSpeakingRequired(value: unknown): SpeakingRequired {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(SPEAKING_STEPS.map(step => {const n = Number(raw[step]); return [step, Number.isInteger(n) && n >= 0 ? Math.min(n, SPEAKING_REQUIRED_MAX) : 0];})) as SpeakingRequired;
}
export function parseSpeakingCounts(value: unknown): SpeakingCounts {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}, out: SpeakingCounts = {};
  for (const step of SPEAKING_STEPS) {
    const rows = raw[step];
    if (!rows || typeof rows !== 'object') continue;
    out[step] = Object.fromEntries(Object.entries(rows as Record<string, unknown>).filter(([, n]) => Number.isInteger(n) && (n as number) > 0).map(([id, n]) => [id, Math.min(n as number, SPEAKING_COUNT_MAX)]));
  }
  return out;
}
/** Times a card must be done in this step: the teacher's 필수 count, or once when the step is 자율. */
export const speakingNeed = (required: SpeakingRequired, step: SpeakingStep) => Math.max(1, required[step] || 0);
export const speakingCount = (counts: SpeakingCounts, step: SpeakingStep, cardId: string) => counts[step]?.[cardId] ?? 0;
/** Steps that count toward the progress: the 필수 steps when the teacher set any, otherwise all six. */
export const speakingGoalSteps = (required: SpeakingRequired) => SPEAKING_STEPS.some(step => required[step] > 0) ? SPEAKING_STEPS.filter(step => required[step] > 0) : [...SPEAKING_STEPS];
export function speakingStepDone(cards: CardEntry[], counts: SpeakingCounts, required: SpeakingRequired, step: SpeakingStep) {
  const list = speakingCards(cards), need = speakingNeed(required, step);
  return {done: list.filter(card => speakingCount(counts, step, card.id) >= need).length, touched: list.filter(card => speakingCount(counts, step, card.id) > 0).length, total: list.length};
}
/** "N% 진행": cards finished in each counted step, averaged over those steps. */
export function speakingPercent(cards: CardEntry[], counts: SpeakingCounts, required: SpeakingRequired) {
  const steps = speakingGoalSteps(required), total = speakingCards(cards).length;
  if (!total) return 0;
  return Math.round(steps.reduce((sum, step) => sum + speakingStepDone(cards, counts, required, step).done, 0) * 100 / total / steps.length);
}

/** 쉐도잉 채점 (browser speech recognition): words of the sentence, lower case, no punctuation. */
export const shadowWords = (text: string) => text.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}'\s]/gu, ' ').split(/\s+/u).filter(Boolean);
function editDistance(a: string, b: string) {
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {const kept = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = kept;}
  }
  return row[b.length];
}
/** How many sentence words were heard and how many must be, by sentence length. Each later try is a little more forgiving. */
export function shadowCheck(sentence: string, heard: string, attempt = 0) {
  const answer = shadowWords(sentence), spoken = shadowWords(heard), length = answer.length;
  const matched = answer.filter(word => spoken.some(said => said === word || editDistance(said, word) < 0.3 * Math.max(said.length, word.length) * (attempt + 1))).length;
  const limit = length < 4 ? 0 : length === 4 ? 1 : length === 5 ? 2 : Math.min(length - 4, 5);
  const minSpoken = length < 3 ? 1 : length === 3 ? 2 : length === 4 ? 3 : length === 5 ? 4 : length < 10 ? length - 2 : length < 15 ? length - 3 : length < 20 ? length - 4 : length - 5;
  return {matched, spoken: spoken.length, pass: matched >= limit && spoken.length >= minSpoken};
}
export const SHADOW_TRIES = 3;

export const speakingZipName =(title: string, who = '') => `${safeSegment(title, '카드')}_스피킹${who ? `_${safeSegment(who)}` : ''}.zip`;
