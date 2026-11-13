import { createHash, randomUUID } from 'node:crypto';
import { ApiError, id, text, type Role } from './policy';
import { CARD_ALTERNATIVE_LIMIT, CARD_DUE_GRACE_MS, CARD_EXAMPLE_LIMIT, CARD_TEXT_LIMIT, cardAnswer, cardDueState, cardMastery, cardReviewDate, cardReviewStates, gradeCardAnswer, isCorrectCardAnswer, normalizeCardAnswer } from '../cards-logic';
import { validPlanDate } from '../cards-planner';
import { fitChunks } from '../cards-chunks';
import { parseDrill, type CardDrill } from '../cards-drill';
/** A drill set needs every card to be a question; any other set drops drill data it was sent. */
export function drillConsistent<T extends { drill?: CardDrill }>(cards: T[], type: CardSetType): T[] {
  if (type === 'drill') {
    const missing = cards.findIndex(card => !card.drill);
    if (missing >= 0) throw new ApiError(400, `${missing + 1}번 문항의 유형을 골라 주세요.`, 'DRILL_INVALID');
    return cards;
  }
  return cards.map(card => { if (!card.drill) return card; const { drill: _drill, ...rest } = card; return rest as T; });
}
/** Drill sets have no study modes and are asked front to back; nothing a client sends changes that. */
export function drillDistribution<R, T extends { direction: CardDirection; requireStudy: boolean }>(type: CardSetType, requiredModes: R, test: T, empty: () => R): { requiredModes: R; test: T } {
  return type === 'drill' ? { requiredModes: empty(), test: { ...test, direction: 'front-back', requireStudy: false } } : { requiredModes, test };
}
import type { CardAfterDue, CardCoverage, CardDirection, CardEntry, CardProgress, CardRequiredModes, CardSetType, CardSnapshot, CardStudyMode, CardTestSettings } from '../cards-types';

export { cardAnswer, isCorrectCardAnswer, normalizeCardAnswer };
export type { CardCoverage };
export const CARD_LIMIT = 200;
export const CARD_LIST_LIMIT = 200;
export const CARD_TIME_LIMIT_MIN = 60;
export const CARD_TIME_LIMIT_MAX = 7200;
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
  if (value !== 'word' && value !== 'sentence' && value !== 'drill') throw new ApiError(400, '단어·문장·연습문제 세트 가운데 골라 주세요.');
  return value;
}
export function parseCards(value: unknown): CardEntry[] {
  if (!Array.isArray(value) || !value.length || value.length > CARD_LIMIT) throw new ApiError(400, `카드는 1~${CARD_LIMIT}장까지 만들 수 있어요.`);
  const cards = value.map((entry, index) => {
    const raw = object(entry), label = `${index + 1}번 카드`;
    const alternatives = raw.alternatives ?? [];
    if (!Array.isArray(alternatives) || alternatives.length > CARD_ALTERNATIVE_LIMIT) throw new ApiError(400, `${label}의 대체 정답은 ${CARD_ALTERNATIVE_LIMIT}개까지 입력해 주세요.`);
    const cardId = raw.id === undefined ? randomUUID() : id(raw.id, `${label} ID`);
    if (['__proto__', 'constructor', 'prototype'].includes(cardId)) throw new ApiError(400, `${label} ID를 확인해 주세요.`);
    const front = text(raw.front, `${label} 앞면`, CARD_TEXT_LIMIT);
    // 연습문제: the back is the answer the drill data names, worked out here so the editor never has to repeat it.
    let drillData: { drill: CardDrill; back: string } | null = null;
    if (raw.drill !== undefined) {
      const parsed = parseDrill(raw.drill, { front, example: text(raw.example, `${label} 지문`, CARD_EXAMPLE_LIMIT, true), back: text(raw.back, `${label} 정답`, CARD_TEXT_LIMIT, true), alternatives: (Array.isArray(alternatives) ? alternatives : []).filter((answer): answer is string => typeof answer === 'string').map(answer => answer.trim()).filter(Boolean) });
      if ('error' in parsed) throw new ApiError(400, `${index + 1}번 문항: ${parsed.error}`, 'DRILL_INVALID');
      drillData = parsed;
    }
    // 끊어읽기 marks are kept only where they fall between two words of the front; an edited sentence simply drops the ones that no longer fit.
    if (raw.chunks !== undefined && !Array.isArray(raw.chunks)) throw new ApiError(400, `${label}의 끊어읽기 표시를 확인해 주세요.`);
    const chunks = fitChunks(raw.chunks, front);
    return { id: cardId, front, back: drillData ? text(drillData.back, `${index + 1}번 문항 정답`, CARD_TEXT_LIMIT) : text(raw.back, `${label} 뒷면`, CARD_TEXT_LIMIT), example: text(raw.example, `${label} 예문`, CARD_EXAMPLE_LIMIT, true), alternatives: [...new Set(alternatives.map(answer => text(answer, `${label} 대체 정답`, CARD_TEXT_LIMIT)))], ...(chunks.length ? { chunks } : {}), ...(drillData ? { drill: drillData.drill } : {}) };
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
  const format = raw.format ?? 'written';
  if (format !== 'written' && format !== 'choice') throw new ApiError(400, '테스트 문제 형식을 확인해 주세요.');
  const timeLimitSeconds = raw.timeLimitSeconds === undefined || raw.timeLimitSeconds === null ? null : integer(raw.timeLimitSeconds, CARD_TIME_LIMIT_MIN, CARD_TIME_LIMIT_MAX, '테스트 제한 시간(초)');
  return { questionCount: integer(raw.questionCount ?? Math.min(20, cardCount), 1, cardCount, '테스트 문항 수'), goalScore: integer(raw.goalScore ?? 80, 0, 100, '목표 점수'), maxAttempts: integer(raw.maxAttempts ?? 3, 1, 20, '응시 횟수'), requireStudy, direction: cardDirection(raw.direction ?? 'front-back'), answerRelease: answerRelease as CardTestSettings['answerRelease'], format: format as CardTestSettings['format'], timeLimitSeconds };
}
export function parseDueAt(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new ApiError(400, '마감 날짜를 확인해 주세요.');
  return new Date(value).toISOString();
}
export function parseAfterDue(value: unknown): CardAfterDue {
  if (value === undefined || value === null) return 'open';
  if (value !== 'open' && value !== 'late' && value !== 'lock') throw new ApiError(400, '마감 후 처리 방법을 확인해 주세요.');
  return value;
}
/** 학습 일정의 학습할 날: a Seoul calendar date or null. It only places the set on the planner; it never opens or closes study. */
export function parsePlanDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!validPlanDate(value)) throw new ApiError(400, '학습할 날을 확인해 주세요.');
  return value;
}
/** 읽어 주기 기본 속도 (0.5~1.5배, 0.1 단위). null means the student's own choice, starting at 1×. */
export function parseSpeechRate(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.5 || value > 1.5 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-9) throw new ApiError(400, '읽어 주기 속도를 확인해 주세요.');
  return Math.round(value * 10) / 10;
}
type Deadline = { dueAt: string | null; afterDue?: CardAfterDue };
/** Starting study or a new test is refused once a locked deadline and its grace have passed. Finishing a started test is not. */
export function assertDueOpen(deadline: Deadline, time = Date.now()) {
  if (cardDueState(deadline, time, CARD_DUE_GRACE_MS) === 'lock') throw new ApiError(403, '마감이 지나 더 이상 학습할 수 없어요.', 'DUE_CLOSED');
}
const afterDeadline = (value: unknown, dueAt: string | null): value is string => typeof value === 'string' && !!dueAt && Date.parse(value) > Date.parse(dueAt);
/** The first activity after the deadline. A stamp from before a moved deadline no longer counts, so the next late activity sets it again. */
export function lateMark(current: unknown, deadline: Deadline, stamp: string): string | null {
  if (afterDeadline(current, deadline.dueAt)) return current;
  return cardDueState(deadline, Date.parse(stamp), CARD_DUE_GRACE_MS) === 'late' ? stamp : null;
}
export function ownsCardResource(ctx: { uid: string; role: Role }, resource: { ownerUid: string }) {
  return ctx.role !== 'student' && ctx.uid === resource.ownerUid;
}
export function canStudyDistribution(ctx: { role: Role; classId?: string; studentId?: string }, distribution: { classId: string; targetStudentIds: string[]; active: boolean; allStudents?: boolean }) {
  return ctx.role === 'student' && distribution.active && ctx.classId === distribution.classId && !!ctx.studentId && (!!distribution.allStudents || distribution.targetStudentIds.includes(ctx.studentId));
}
/** An all-students distribution also reaches students who joined after it; everyone originally targeted stays on the report. */
export function reportStudentIds(distribution: { targetStudentIds: string[]; allStudents?: boolean }, activeIds: string[]) {
  return distribution.allStudents ? [...new Set([...distribution.targetStudentIds, ...activeIds])] : distribution.targetStudentIds;
}
/** Turning all-students off keeps everyone who could study until now, later joiners included, instead of stranding them. */
export function widenedTargets<T extends { id: string; name: string; number: number }>(distribution: { targetStudentIds: string[]; targetStudents?: T[] }, active: T[]) {
  const known = new Map([...(distribution.targetStudents ?? []), ...active].map(student => [student.id, student]));
  const targetStudentIds = [...new Set([...distribution.targetStudentIds, ...active.map(student => student.id)])];
  return { targetStudentIds, targetStudents: targetStudentIds.flatMap(studentId => known.get(studentId) ?? []), targetCount: targetStudentIds.length };
}
type EditableDistribution = { cardCount: number; requiredModes: CardRequiredModes; test: CardTestSettings; dueAt: string | null };
/** The fields a PATCH may change, each through the validator used at creation. Nested settings merge over the saved ones, so a partial edit never resets the rest. */
export function distributionPatch(input: Value, current: EditableDistribution) {
  const update: { active?: boolean; allStudents?: boolean; requiredModes?: CardRequiredModes; test?: CardTestSettings; dueAt?: string | null; afterDue?: CardAfterDue; speechRate?: number | null; planDate?: string | null } = {};
  for (const key of ['active', 'allStudents'] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') throw new ApiError(400, '배부 상태를 확인해 주세요.');
    update[key] = input[key];
  }
  if (input.requiredModes !== undefined) {
    const raw = object(input.requiredModes);
    update.requiredModes = parseRequirements(Object.fromEntries(CARD_MODES.map(mode => [mode, { ...current.requiredModes[mode], ...(raw[mode] === undefined ? {} : object(raw[mode])) }])), current.cardCount);
  }
  if (input.test !== undefined) update.test = parseTestSettings({ ...current.test, ...object(input.test) }, current.cardCount);
  if (input.dueAt !== undefined) update.dueAt = parseDueAt(input.dueAt);
  if (input.afterDue !== undefined) update.afterDue = parseAfterDue(input.afterDue);
  if (input.speechRate !== undefined) update.speechRate = parseSpeechRate(input.speechRate);
  if (input.planDate !== undefined) update.planDate = parsePlanDate(input.planDate);
  if (!Object.keys(update).length) throw new ApiError(400, '바꿀 배부 설정을 확인해 주세요.');
  if ((update.test ?? current.test).answerRelease === 'after-due' && !(update.dueAt === undefined ? current.dueAt : update.dueAt)) throw new ApiError(400, '마감 후 정답 공개에는 마감 날짜가 필요해요.');
  return update;
}
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
export function publicProgress(raw: Record<string, any> | undefined, snapshot: CardSnapshot, requirements: CardRequiredModes, test: CardTestSettings, deadline?: Deadline, today = cardReviewDate()): CardProgress {
  const credited = completedCounts(snapshot, requirements, raw?.coverage ?? { memorize: {}, recall: {}, spell: {} });
  // Records from before mastery have no cardStates and read as 0%, nothing due.
  const mastery = cardMastery(snapshot.cards.map(card => card.id), cardReviewStates(raw?.cardStates), today);
  return { counts: raw?.counts ?? emptyModeCounts(), correctCounts: raw?.correctCounts ?? emptyModeCounts(), completedCounts: credited, attempts: raw?.attempts ?? 0, bestScore: raw?.bestScore ?? null, latestScore: raw?.latestScore ?? null, starredCardIds: raw?.starredCardIds ?? [], lastPosition: raw?.lastPosition ?? null, updatedAt: raw?.updatedAt ?? null, lateAt: deadline?.afterDue === 'late' && afterDeadline(raw?.lateAt, deadline.dueAt) ? raw!.lateAt : null, studyComplete: CARD_MODES.every(mode => credited[mode] >= requirements[mode].requiredCount), goalReached: typeof raw?.bestScore === 'number' && raw.bestScore >= test.goalScore, mastery: mastery.percent, reviewDue: mastery.due };
}
export function answersReleased(settings: CardTestSettings, dueAt: string | null, time = Date.now()) {
  return settings.answerRelease === 'immediate' || (settings.answerRelease === 'after-due' && dueAt !== null && Date.parse(dueAt) <= time);
}
export function studyResponses(value: unknown, snapshot: CardSnapshot, mode: CardStudyMode, direction: CardDirection, requirements: CardRequiredModes) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new ApiError(400, '학습 응답은 1~100개씩 저장해 주세요.');
  const rule = requirements[mode];
  // 문장 세트 스펠 always builds the English sentence, whatever direction the teacher set for the other modes.
  const sentenceSpell = mode === 'spell' && snapshot.type === 'sentence';
  if (!sentenceSpell && rule.requiredCount > 0 && rule.direction !== direction) throw new ApiError(400, '선생님이 정한 카드 제시 방향으로 학습해 주세요.', 'STUDY_DIRECTION');
  const allowed = new Map(snapshot.cards.slice(rule.rangeStart - 1, rule.rangeEnd).map(card => [card.id, card]));
  const seen = new Set<string>();
  return value.map(entry => {
    const raw = object(entry), cardId = id(raw.cardId);
    const card = allowed.get(cardId);
    if (!card || seen.has(cardId)) throw new ApiError(400, '학습 구간 또는 중복 카드를 확인해 주세요.', 'STUDY_CARD');
    seen.add(cardId);
    const answer = text(raw.answer, '학습 답', 1000, true);
    const graded = gradeCardAnswer(card, mode, direction, answer, snapshot.type);
    return { cardId, answer, correct: graded.correct, expectedAnswer: graded.expected };
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
