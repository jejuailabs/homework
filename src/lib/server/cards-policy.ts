import { createHash, randomUUID } from 'node:crypto';
import { ApiError, id, text, type Role } from './policy';
import type { CardDirection, CardEntry, CardProgress, CardRequiredModes, CardSetType, CardSnapshot, CardStudyMode, CardTestSettings } from '../cards-types';

export const CARD_LIMIT = 200;
export const CARD_LIST_LIMIT = 200;
export const CARD_MODES: CardStudyMode[] = ['memorize', 'recall', 'spell'];
type Value = Record<string, unknown>;
export function object(value: unknown): Value {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, '입력 내용을 확인해 주세요.');
  return value as Value;
}
export function integer(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new ApiError(400, `${label}은(는) ${min}~${max} 사이의 정수로 입력해 주세요.`);
  return value;
}
export function cardMutationFingerprint(value: unknown): string {
  // JSON object key order is not meaningful. Array order is retained (including card order).
  const canonical = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(canonical) : entry && typeof entry === 'object' ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, child]) => [key, canonical(child)])) : entry;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function expectedCardVersion(value: unknown, current: number) {
  if (value === undefined) return;
  integer(value, 1, Number.MAX_SAFE_INTEGER, '세트 버전');
  if (value !== current) throw new ApiError(409, '다른 화면에서 수정된 세트예요. 새로 열어 확인해 주세요.', 'STALE_VERSION');
}
export function cardDirection(value: unknown): CardDirection {
  if (value !== 'front-back' && value !== 'back-front') throw new ApiError(400, '카드 제시 방향을 확인해 주세요.');
  return value;
}
export function cardMode(value: unknown): CardStudyMode {
  if (!CARD_MODES.includes(value as CardStudyMode)) throw new ApiError(400, '학습 모드를 확인해 주세요.');
  return value as CardStudyMode;
}
export function cardType(value: unknown): CardSetType {
  if (value !== 'word' && value !== 'sentence') throw new ApiError(400, '단어 또는 문장 세트를 선택해 주세요.');
  return value;
}
export function parseCards(value: unknown): CardEntry[] {
  if (!Array.isArray(value) || !value.length || value.length > CARD_LIMIT) throw new ApiError(400, `카드는 1~${CARD_LIMIT}장까지 만들 수 있어요.`);
  const cards = value.map((entry, index) => {
    const raw = object(entry), label = `${index + 1}번 카드`;
    const alternatives = raw.alternatives ?? [];
    if (!Array.isArray(alternatives) || alternatives.length > 10) throw new ApiError(400, `${label}의 대체 정답은 10개까지 입력해 주세요.`);
    const cardId = raw.id === undefined ? randomUUID() : id(raw.id, `${label} ID`);
    if (['__proto__', 'constructor', 'prototype'].includes(cardId)) throw new ApiError(400, `${label} ID를 확인해 주세요.`);
    return { id: cardId, front: text(raw.front, `${label} 앞면`, 1000), back: text(raw.back, `${label} 뒷면`, 1000), example: text(raw.example, `${label} 예문`, 2000, true), alternatives: [...new Set(alternatives.map(answer => text(answer, `${label} 대체 정답`, 1000)))] };
  });
  if (new Set(cards.map(card => card.id)).size !== cards.length) throw new ApiError(400, '중복된 카드 ID가 있어요.');
  // Leave room for distribution settings and Firestore's document size overhead.
  if (Buffer.byteLength(JSON.stringify(cards), 'utf8') > 650_000) throw new ApiError(413, '카드 내용이 너무 커요. 세트를 나누어 주세요.');
  return cards;
}
export function parseRequirements(value: unknown, cardCount: number): CardRequiredModes {
  const input = value === undefined ? {} : object(value);
  return Object.fromEntries(CARD_MODES.map(mode => {
    const raw = input[mode] === undefined ? {} : object(input[mode]);
    const rangeStart = integer(raw.rangeStart ?? 1, 1, cardCount, '시작 카드');
    const rangeEnd = integer(raw.rangeEnd ?? cardCount, rangeStart, cardCount, '마지막 카드');
    return [mode, { requiredCount: integer(raw.requiredCount ?? 0, 0, (rangeEnd - rangeStart + 1) * 10, '필수 학습량'), direction: cardDirection(raw.direction ?? 'front-back'), rangeStart, rangeEnd }];
  })) as CardRequiredModes;
}
export function parseTestSettings(value: unknown, cardCount: number): CardTestSettings {
  const raw = value === undefined ? {} : object(value);
  const requireStudy = raw.requireStudy ?? false;
  const answerRelease = raw.answerRelease ?? 'immediate';
  if (typeof requireStudy !== 'boolean') throw new ApiError(400, '테스트 응시 조건을 확인해 주세요.');
  if (!['immediate', 'after-due', 'never'].includes(answerRelease as string)) throw new ApiError(400, '정답 공개 시점을 확인해 주세요.');
  return { questionCount: integer(raw.questionCount ?? Math.min(20, cardCount), 1, cardCount, '테스트 문항 수'), goalScore: integer(raw.goalScore ?? 80, 0, 100, '목표 점수'), maxAttempts: integer(raw.maxAttempts ?? 3, 1, 20, '응시 횟수'), requireStudy, direction: cardDirection(raw.direction ?? 'front-back'), answerRelease: answerRelease as CardTestSettings['answerRelease'] };
}
export function parseDueAt(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new ApiError(400, '마감 날짜를 확인해 주세요.');
  return new Date(value).toISOString();
}
export function ownsCardResource(ctx: { uid: string; role: Role }, resource: { ownerUid: string }) {
  return ctx.role !== 'student' && ctx.uid === resource.ownerUid;
}
export function canStudyDistribution(ctx: { role: Role; classId?: string; studentId?: string }, distribution: { classId: string; targetStudentIds: string[]; active: boolean }) {
  return ctx.role === 'student' && distribution.active && ctx.classId === distribution.classId && !!ctx.studentId && distribution.targetStudentIds.includes(ctx.studentId);
}
export function normalizeCardAnswer(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}
export function cardAnswer(card: CardEntry, direction: CardDirection) { return direction === 'front-back' ? card.back : card.front; }
export function isCorrectCardAnswer(card: CardEntry, direction: CardDirection, answer: string) {
  const expected = direction === 'front-back' ? [card.back, ...card.alternatives] : [card.front];
  return expected.some(value => normalizeCardAnswer(value) === normalizeCardAnswer(answer));
}
export type CardCoverage = Record<CardStudyMode, Record<string, number>>;
export const emptyModeCounts = () => ({ memorize: 0, recall: 0, spell: 0 });
export function completedCounts(snapshot: CardSnapshot, requirements: CardRequiredModes, coverage: CardCoverage) {
  return Object.fromEntries(CARD_MODES.map(mode => {
    const rule = requirements[mode], cards = snapshot.cards.slice(rule.rangeStart - 1, rule.rangeEnd);
    const base = Math.floor(rule.requiredCount / cards.length), extra = rule.requiredCount % cards.length;
    const wholeRounds = cards.reduce((count, card) => count + Math.min(coverage[mode]?.[card.id] ?? 0, base), 0);
    const partialRound = Math.min(extra, cards.filter(card => (coverage[mode]?.[card.id] ?? 0) > base).length);
    return [mode, wholeRounds + partialRound];
  })) as Record<CardStudyMode, number>;
}
export function publicProgress(raw: Record<string, any> | undefined, snapshot: CardSnapshot, requirements: CardRequiredModes, test: CardTestSettings): CardProgress {
  const credited = completedCounts(snapshot, requirements, raw?.coverage ?? { memorize: {}, recall: {}, spell: {} });
  return { counts: raw?.counts ?? emptyModeCounts(), correctCounts: raw?.correctCounts ?? emptyModeCounts(), completedCounts: credited, attempts: raw?.attempts ?? 0, bestScore: raw?.bestScore ?? null, latestScore: raw?.latestScore ?? null, starredCardIds: raw?.starredCardIds ?? [], lastPosition: raw?.lastPosition ?? null, updatedAt: raw?.updatedAt ?? null, studyComplete: CARD_MODES.every(mode => credited[mode] >= requirements[mode].requiredCount), goalReached: typeof raw?.bestScore === 'number' && raw.bestScore >= test.goalScore };
}
export function answersReleased(settings: CardTestSettings, dueAt: string | null, time = Date.now()) {
  return settings.answerRelease === 'immediate' || (settings.answerRelease === 'after-due' && dueAt !== null && Date.parse(dueAt) <= time);
}
export function studyResponses(value: unknown, snapshot: CardSnapshot, mode: CardStudyMode, direction: CardDirection, requirements: CardRequiredModes) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new ApiError(400, '학습 응답은 1~100개씩 저장해 주세요.');
  const rule = requirements[mode];
  if (rule.requiredCount > 0 && rule.direction !== direction) throw new ApiError(400, '선생님이 정한 카드 제시 방향으로 학습해 주세요.', 'STUDY_DIRECTION');
  const allowed = new Map(snapshot.cards.slice(rule.rangeStart - 1, rule.rangeEnd).map(card => [card.id, card]));
  const seen = new Set<string>();
  return value.map(entry => {
    const raw = object(entry), cardId = id(raw.cardId);
    const card = allowed.get(cardId);
    if (!card || seen.has(cardId)) throw new ApiError(400, '학습 구간 또는 중복 카드를 확인해 주세요.', 'STUDY_CARD');
    seen.add(cardId);
    const answer = text(raw.answer, '학습 답', 1000, true);
    return { cardId, answer, correct: mode === 'memorize' || isCorrectCardAnswer(card, direction, answer), expectedAnswer: cardAnswer(card, direction) };
  });
}
export function testAnswers(value: unknown, questionIds: string[]) {
  if (!Array.isArray(value) || value.length !== questionIds.length) throw new ApiError(400, '모든 테스트 문항의 답을 확인해 주세요.', 'TEST_ANSWERS');
  const answers = new Map<string, string>();
  for (const entry of value) {
    const raw = object(entry), questionId = id(raw.questionId);
    if (!questionIds.includes(questionId) || answers.has(questionId)) throw new ApiError(400, '테스트 문항이 일치하지 않아요.', 'TEST_ANSWERS');
    answers.set(questionId, text(raw.answer, '테스트 답', 1000, true));
  }
  return answers;
}
