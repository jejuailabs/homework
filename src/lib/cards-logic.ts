// Pure card rules shared by the browser and the server, so instant practice feedback can never drift from server grading.
import type { CardCoverage, CardDirection, CardEntry, CardRequiredModes, CardStudyMode } from './cards-types';

export function normalizeCardAnswer(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}
export function cardAnswer(card: CardEntry, direction: CardDirection) { return direction === 'front-back' ? card.back : card.front; }
export function isCorrectCardAnswer(card: CardEntry, direction: CardDirection, answer: string) {
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
