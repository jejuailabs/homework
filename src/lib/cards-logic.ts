// Pure card rules shared by the browser and the server, so instant practice feedback can never drift from server grading.
import { drillAnswerText, drillQuestion, gradeDrill } from './cards-drill';
import type { CardAfterDue, CardCoverage, CardDirection, CardEntry, CardMisses, CardMissSummary, CardRequiredModes, CardReviewState, CardReviewStates, CardStudyMode, CardTestQuestion, CardTestSettings } from './cards-types';

// One set of card size limits for the server, the editor and bulk import.
export const CARD_TEXT_LIMIT = 1000;
export const CARD_EXAMPLE_LIMIT = 2000;
export const CARD_ALTERNATIVE_LIMIT = 10;

export function normalizeCardAnswer(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}
// 연습문제 cards carry their own question kind: they are always asked front to back and graded by the drill rule.
export function cardAnswer(card: CardEntry, direction: CardDirection) { return card.drill ? drillAnswerText(card) : direction === 'front-back' ? card.back : card.front; }
export function isCorrectCardAnswer(card: CardEntry, direction: CardDirection, answer: string) {
  if (card.drill) return gradeDrill(card, answer);
  const expected = direction === 'front-back' ? [card.back, ...card.alternatives] : [card.front];
  return expected.some(value => normalizeCardAnswer(value) === normalizeCardAnswer(answer));
}
export function gradeCardAnswer(card: CardEntry, mode: CardStudyMode, direction: CardDirection, answer: string) {
  return { correct: mode === 'memorize' || isCorrectCardAnswer(card, direction, answer), expected: cardAnswer(card, direction) };
}

// Answer batches: the server takes 1-100 responses per request and no repeated cardId within one request.
export const STUDY_BATCH_SIZE = 10;
export const STUDY_IDLE_MS = 20_000;
export const STUDY_ANSWER_LIMIT = 1000;
export const STUDY_KEEPALIVE_BYTES = 60_000; // Browsers cap all in-flight keepalive bodies at 64 KiB.
export type StudyResponse = { cardId: string; answer: string };
export type StudyBuffered = StudyResponse & { direction: CardDirection };
export type StudyBatch = { requestId: string; mode: CardStudyMode; direction: CardDirection; responses: StudyResponse[]; lastCardId: string };
export type StudyOutbox = { buffer: StudyBuffered[]; sealed: StudyBatch[] };
export const emptyStudyOutbox = (): StudyOutbox => ({ buffer: [], sealed: [] });
export const studyOutboxSize = (outbox: StudyOutbox) => outbox.buffer.length + outbox.sealed.reduce((total, batch) => total + batch.responses.length, 0);
/** Freezes the buffer into a batch. The ID and content never change again, which is what makes a retry idempotent. */
export function sealStudyBuffer(outbox: StudyOutbox, mode: CardStudyMode, newId: () => string): StudyOutbox {
  const [first] = outbox.buffer;
  if (!first) return outbox;
  const responses = outbox.buffer.map(({ cardId, answer }) => ({ cardId, answer }));
  return { buffer: [], sealed: [...outbox.sealed, { requestId: newId(), mode, direction: first.direction, responses, lastCardId: responses[responses.length - 1].cardId }] };
}
export function addStudyResponse(outbox: StudyOutbox, response: StudyBuffered, mode: CardStudyMode, newId: () => string, limit = STUDY_BATCH_SIZE): StudyOutbox {
  const conflict = outbox.buffer.some(item => item.cardId === response.cardId || item.direction !== response.direction);
  const ready = conflict ? sealStudyBuffer(outbox, mode, newId) : outbox;
  const next = { ...ready, buffer: [...ready.buffer, { ...response, answer: response.answer.slice(0, STUDY_ANSWER_LIMIT) }] };
  return next.buffer.length >= limit ? sealStudyBuffer(next, mode, newId) : next;
}
/** The server refuses these for good, usually because the teacher changed the range or direction after the batch was answered. Retrying cannot help. */
export const staleStudyBatch = (code: string) => code === 'STUDY_DIRECTION' || code === 'STUDY_CARD' || code === 'REQUEST_CONFLICT';
export const settleStudyBatch = (outbox: StudyOutbox, requestId: string): StudyOutbox => ({ ...outbox, sealed: outbox.sealed.filter(batch => batch.requestId !== requestId) });
/** The oldest sealed batches that fit one keepalive allowance. Anything left stays stored for the next visit. */
export function keepaliveStudyBatches(outbox: StudyOutbox, limit = STUDY_KEEPALIVE_BYTES) {
  const encoder = new TextEncoder(), chosen: StudyBatch[] = [];
  let bytes = 0;
  for (const batch of outbox.sealed) {
    bytes += encoder.encode(JSON.stringify(batch)).length;
    if (bytes > limit) break;
    chosen.push(batch);
  }
  return chosen;
}
function validStudyBatch(value: unknown, mode: CardStudyMode): value is StudyBatch {
  const batch = value as StudyBatch | null;
  return !!batch && typeof batch.requestId === 'string' && !!batch.requestId && batch.mode === mode && (batch.direction === 'front-back' || batch.direction === 'back-front') && Array.isArray(batch.responses) && batch.responses.length >= 1 && batch.responses.length <= 100 && batch.responses.every(item => typeof item?.cardId === 'string' && typeof item?.answer === 'string') && new Set(batch.responses.map(item => item.cardId)).size === batch.responses.length && batch.responses.some(item => item.cardId === batch.lastCardId);
}
/** Reads the stored outbox defensively. A session saved before batching kept its one answer in `legacyPending`. */
export function restoreStudyOutbox(stored: unknown, mode: CardStudyMode, legacyPending?: unknown): StudyOutbox {
  const value = stored as Partial<StudyOutbox> | null | undefined;
  const buffer = Array.isArray(value?.buffer) ? value.buffer.filter(item => typeof item?.cardId === 'string' && typeof item?.answer === 'string' && (item.direction === 'front-back' || item.direction === 'back-front')) : [];
  const sealed = Array.isArray(value?.sealed) ? value.sealed.filter(batch => validStudyBatch(batch, mode)) : [];
  return { buffer, sealed: validStudyBatch(legacyPending, mode) ? [...sealed, legacyPending] : sealed };
}

/** First letter and length of the expected answer. Spaces are left out of the count, matching what a student actually types as letters. */
export function spellHint(expected: string) {
  const clean = expected.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  return { first: Array.from(clean)[0] ?? '', length: Array.from(clean.replace(/ /g, '')).length, words: clean ? clean.split(' ').length : 0 };
}

// Section rows on the student set page. Rows are cut from the whole set; each mode only offers the cards inside its required range.
export const CARD_SECTION_SIZE = 10;
export const CARD_SECTION_SIZES = [5, 10, 15, 20];
const sectionModes: CardStudyMode[] = ['memorize', 'recall', 'spell'];
export type CardSectionMode = { from: number; to: number; total: number; covered: number; percent: number; done: boolean };
export type CardSection = { number: number; from: number; to: number; modes: Record<CardStudyMode, CardSectionMode | null> };
export function buildCardSections(cards: Pick<CardEntry, 'id'>[], requirements: CardRequiredModes, coverage?: Partial<CardCoverage> | null, size = CARD_SECTION_SIZE): CardSection[] {
  const step = Number.isInteger(size) && size > 0 ? size : CARD_SECTION_SIZE, sections: CardSection[] = [];
  for (let from = 1; from <= cards.length; from += step) {
    const to = Math.min(from + step - 1, cards.length);
    const modes = Object.fromEntries(sectionModes.map(mode => {
      const rule = requirements[mode], start = Math.max(from, rule.rangeStart), end = Math.min(to, rule.rangeEnd);
      if (start > end) return [mode, null];
      const inside = cards.slice(start - 1, end), covered = inside.filter(card => (coverage?.[mode]?.[card.id] ?? 0) >= 1).length;
      return [mode, { from: start, to: end, total: inside.length, covered, percent: Math.round(covered / inside.length * 100), done: covered === inside.length }];
    })) as CardSection['modes'];
    sections.push({ number: sections.length + 1, from, to, modes });
  }
  return sections;
}
/** Reads ?from=&to= for the practice page. Anything outside the requirement range falls back to the whole range. */
export function cardRangePreset(from: string | undefined, to: string | undefined, min: number, max: number) {
  const start = Number(from), end = to === undefined ? max : Number(to);
  if (from === undefined || !Number.isInteger(start) || !Number.isInteger(end) || start > end || start > max || end < min) return { start: min, end: max };
  return { start: Math.max(start, min), end: Math.min(end, max) };
}

// Deadlines. Distributions published before afterDue existed have no field and stay open, so always read it through these helpers.
export const CARD_DUE_GRACE_MS = 5 * 60_000; // Answer batches queued offline before the deadline still need time to land.
export const cardAfterDue = (value: { afterDue?: CardAfterDue }): CardAfterDue => value.afterDue === 'late' || value.afterDue === 'lock' ? value.afterDue : 'open';
/** 'before' until the deadline has passed, then the rule the teacher chose. The server passes the grace; screens close right at the deadline. */
export function cardDueState(value: { dueAt: string | null; afterDue?: CardAfterDue }, time: number, grace = 0): CardAfterDue | 'before' {
  const due = value.dueAt ? Date.parse(value.dueAt) : Number.NaN;
  return Number.isFinite(due) && time > due + grace ? cardAfterDue(value) : 'before';
}

// Tests. Distributions published before these settings existed have neither field, so always read them through these helpers.
export const CARD_CHOICE_COUNT = 4;
export const CARD_TEST_GRACE_SECONDS = 60;
export const CARD_CHOICE_BYTES = 200_000; // Attempt documents share Firestore's 1 MiB limit with prompts and later results, and answers can be as long as the choices.
export const testFormat = (settings: Pick<CardTestSettings, 'format'>) => settings.format === 'choice' ? 'choice' as const : 'written' as const;
export const testTimeLimit = (settings: Pick<CardTestSettings, 'timeLimitSeconds'>) => settings.timeLimitSeconds ?? null;
export function shuffleWith<T>(values: T[], random: (max: number) => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) { const other = random(index + 1); [result[index], result[other]] = [result[other], result[index]]; }
  return result;
}
const cardPrompt = (card: CardEntry, direction: CardDirection) => card.drill || direction === 'front-back' ? card.front : card.back;
/** Wrong answers for this card. Different answers only, nothing that would be graded correct, and nothing from a card sharing this prompt: big and large both meaning 크다 are each a right answer to 크다. */
/** 뒤집은 뒤 읽어 줄 글. 한글이 없는 예문 줄을 먼저 읽고, 없으면 한글이 없는 쪽 면을 읽는다. 전부 한글인 세트는 답을 그대로 읽는다. */
export function cardRevealSpeech(card: CardEntry, expected: string) {
  const hangul = /[가-힣]/u, example = card.example.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !hangul.test(line)).join(' ');
  return example || [card.front, expected].find(text => text.trim() && !hangul.test(text)) || expected;
}
export function cardDistractors(card: CardEntry, pool: CardEntry[], direction: CardDirection) {
  const prompt = normalizeCardAnswer(cardPrompt(card, direction)), seen = new Set([normalizeCardAnswer(cardAnswer(card, direction))]), distractors: string[] = [];
  for (const other of pool) {
    const value = cardAnswer(other, direction), key = normalizeCardAnswer(value);
    if (other.id === card.id || seen.has(key) || normalizeCardAnswer(cardPrompt(other, direction)) === prompt || isCorrectCardAnswer(card, direction, value)) continue;
    seen.add(key); distractors.push(value);
  }
  return distractors;
}
export function buildCardChoices(card: CardEntry, pool: CardEntry[], direction: CardDirection, random: (max: number) => number, count = CARD_CHOICE_COUNT) {
  const expected = cardAnswer(card, direction), choices = shuffleWith([expected, ...shuffleWith(cardDistractors(card, pool, direction), random).slice(0, count - 1)], random);
  return choices.length >= 2 ? choices : null;
}
/** A question without `choices` is answered in writing; the key is left out because Firestore rejects undefined. */
export function buildTestQuestions(cards: CardEntry[], pool: CardEntry[], settings: Pick<CardTestSettings, 'direction' | 'format'>, newId: () => string, random: (max: number) => number): CardTestQuestion[] {
  const encoder = new TextEncoder();
  let bytes = 0;
  return cards.map(card => {
    const question: CardTestQuestion = { id: newId(), cardId: card.id, prompt: cardPrompt(card, settings.direction) };
    if (card.drill) {
      const drill = drillQuestion(card, random), { choices: drillChoices, ...rest } = drill;
      return { ...question, drill: rest, ...(drillChoices ? { choices: drillChoices } : {}) };
    }
    const choices = testFormat(settings) === 'choice' ? buildCardChoices(card, pool, settings.direction, random) : null;
    bytes += choices ? encoder.encode(choices.join('')).length : 0;
    return choices && bytes <= CARD_CHOICE_BYTES ? { ...question, choices } : question;
  });
}
export const testDeadline = (startedAt: string, limitSeconds: number) => Date.parse(startedAt) + limitSeconds * 1000;
/** Late work is still graded and only flagged, because a connection problem should never cost a student their answers. */
export const isTestOvertime = (startedAt: string, limitSeconds: number | null | undefined, time: number) => !!limitSeconds && time > testDeadline(startedAt, limitSeconds) + CARD_TEST_GRACE_SECONDS * 1000;
export function formatCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Mastery and date review. A small Leitner schedule, not FSRS: a level a student can read (씨앗·새싹·잎·꽃) and an interval a teacher can explain.
// Levels never go down, so restudying never shrinks progress. A miss only brings the card back for review tomorrow.
export const CARD_REVIEW_DAYS = [1, 3, 7, 14, 30];
export const CARD_MASTERY_MAX = 4;
/** Correct answers on one day raise a card to 새싹 at most; 잎 and 꽃 need a correct answer on a later day, when the card is due. */
export const CARD_SAME_DAY_LEVEL = 2;
/** A card counts as learned for the class view from 잎 up: it was answered right again on a later day. */
export const CARD_LEARNED_LEVEL = 3;
export const CARD_MISS_WEEKS = 4;
export const CARD_MISS_LIMIT = 400; // Keeps the per-student miss index far below Firestore's 1 MiB.
export const CARD_REVIEW_SESSION = 20;
export function cardReviewDate(time = Date.now()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time)); }
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
export function cardAddDays(date: string, days: number) { const at = new Date(`${date}T00:00:00Z`); at.setUTCDate(at.getUTCDate() + days); return at.toISOString().slice(0, 10); }
/** Monday of the date's week. */
export function cardWeekStart(date: string) { return cardAddDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7)); }
/** Reads one stored state defensively; anything malformed counts as never answered. */
export function cardReviewState(value: unknown): CardReviewState | null {
  const raw = value as Partial<CardReviewState> | null;
  if (!raw || typeof raw !== 'object' || !validDate(raw.d)) return null;
  const level = Number.isInteger(raw.l) ? Math.min(CARD_MASTERY_MAX, Math.max(0, raw.l!)) : 0, step = Number.isInteger(raw.b) ? Math.min(CARD_REVIEW_DAYS.length - 1, Math.max(0, raw.b!)) : 0;
  return { l: level, b: step, d: raw.d };
}
export function cardReviewStates(value: unknown): CardReviewStates {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([cardId, state]) => { const read = cardReviewState(state); return read ? [[cardId, read]] : []; }));
}
export const cardReviewIsDue = (state: CardReviewState | null | undefined, today: string) => !!state && state.d <= today;
/** The next state after one graded answer in recall, spell, a test or a review. Memorize answers never come here. */
export function nextCardReview(previous: CardReviewState | null | undefined, correct: boolean, today: string): CardReviewState {
  const state = cardReviewState(previous);
  if (!correct) return { l: state?.l ?? 0, b: 0, d: cardAddDays(today, CARD_REVIEW_DAYS[0]) };
  if (!state) return { l: 1, b: 0, d: cardAddDays(today, CARD_REVIEW_DAYS[0]) };
  if (cardReviewIsDue(state, today)) {
    const step = Math.min(CARD_REVIEW_DAYS.length - 1, state.b + 1);
    return { l: Math.min(CARD_MASTERY_MAX, state.l + 1), b: step, d: cardAddDays(today, CARD_REVIEW_DAYS[step]) };
  }
  return { ...state, l: state.l < CARD_SAME_DAY_LEVEL ? state.l + 1 : state.l };
}
/** Set mastery for the given cards: percent (average level out of 4), how many cards sit at each level 0-4, and how many are due today. */
export function cardMastery(cardIds: string[], states: CardReviewStates, today: string) {
  const levels = [0, 0, 0, 0, 0];
  let total = 0, due = 0;
  for (const cardId of cardIds) {
    const state = states[cardId], level = state?.l ?? 0;
    levels[level]++; total += level;
    if (cardReviewIsDue(state, today)) due++;
  }
  return { percent: cardIds.length ? Math.round(total / (cardIds.length * CARD_MASTERY_MAX) * 100) : 0, levels, due };
}
/** Cards due today, oldest review date first, then set order. */
export function dueCardIds(cardIds: string[], states: CardReviewStates, today: string, limit = CARD_REVIEW_SESSION) {
  const order = new Map(cardIds.map((cardId, index) => [cardId, index]));
  return cardIds.filter(cardId => cardReviewIsDue(states[cardId], today)).sort((a, b) => states[a].d.localeCompare(states[b].d) || order.get(a)! - order.get(b)!).slice(0, limit);
}
/** Adds this answer batch to the student's miss index. Misses stay for CARD_MISS_WEEKS; a correct answer in a review session clears its card. */
export function recordCardMisses(current: unknown, distributionId: string, missed: string[], cleared: string[], today: string): CardMisses {
  const oldest = cardAddDays(today, -CARD_MISS_WEEKS * 7), rows: [string, string, string][] = [];
  if (current && typeof current === 'object' && !Array.isArray(current)) for (const [setId, cards] of Object.entries(current)) {
    if (!cards || typeof cards !== 'object') continue;
    for (const [cardId, date] of Object.entries(cards)) if (validDate(date) && date >= oldest && !(setId === distributionId && (cleared.includes(cardId) || missed.includes(cardId)))) rows.push([setId, cardId, date]);
  }
  for (const cardId of new Set(missed)) rows.push([distributionId, cardId, today]);
  const kept = rows.sort((a, b) => b[2].localeCompare(a[2])).slice(0, CARD_MISS_LIMIT), misses: CardMisses = {};
  for (const [setId, cardId, date] of kept) (misses[setId] ??= {})[cardId] = date;
  return misses;
}
/** Every miss still inside the window, newest first. `allowed` limits the list to the sets this student can still open; `week` to one Monday-start week. */
export function cardMissList(misses: unknown, today: string, allowed?: Set<string>, week?: string) {
  const oldest = cardAddDays(today, -CARD_MISS_WEEKS * 7), rows: { distributionId: string; cardId: string; missedOn: string }[] = [];
  if (misses && typeof misses === 'object' && !Array.isArray(misses)) for (const [distributionId, cards] of Object.entries(misses)) {
    if (allowed && !allowed.has(distributionId) || !cards || typeof cards !== 'object') continue;
    for (const [cardId, missedOn] of Object.entries(cards)) if (validDate(missedOn) && missedOn >= oldest && (!week || cardWeekStart(missedOn) === week)) rows.push({ distributionId, cardId, missedOn });
  }
  return rows.sort((a, b) => b.missedOn.localeCompare(a.missedOn) || a.distributionId.localeCompare(b.distributionId) || a.cardId.localeCompare(b.cardId));
}
export function summarizeCardMisses(misses: unknown, today: string, allowed?: Set<string>): CardMissSummary {
  const rows = cardMissList(misses, today, allowed), weeks = new Map<string, number>();
  for (const row of rows) { const week = cardWeekStart(row.missedOn); weeks.set(week, (weeks.get(week) ?? 0) + 1); }
  return { total: rows.length, weeks: [...weeks].sort(([a], [b]) => b.localeCompare(a)).map(([week, count]) => ({ week, count })) };
}
