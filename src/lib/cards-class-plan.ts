// 우리 반 학습 기본값과 차시 메모·과제 순서. Pure rules shared by the server, the teacher screens and Berry.
import type {CardAfterDue, CardDirection, CardRequiredModes, CardSetType, CardStudyMode, CardTestFormat, CardTestSettings} from './cards-types';

export const CARD_CLASS_MODES: CardStudyMode[] = ['memorize', 'recall', 'spell'];
export const CARD_CLASS_TYPES: CardSetType[] = ['word', 'sentence'];
/** Required study as a share of the cards in range: 100 is one round. */
export const CARD_PERCENTS = [50, 100, 150, 200, 300];
export const CARD_SPEECH_RATES = [0.5, 0.7, 1, 1.2, 1.5];
export const CARD_PLAN_MEMOS = 100, CARD_PLAN_MEMO_CHARS = 200, CARD_PLAN_SETS = 500;

export type CardModeDefault = {on: boolean; percent: number; direction: CardDirection};
export type CardClassTest = {questionCount: number; goalScore: number; maxAttempts: number; requireStudy: boolean; direction: CardDirection; answerRelease: CardTestSettings['answerRelease']; format: CardTestFormat; timeLimitMinutes: number | null};
export type CardClassDefaults = {modes: Record<CardStudyMode, CardModeDefault>; speechRate: number; test: CardClassTest; afterDue: CardAfterDue};
export type CardClassDefaultsByType = Record<CardSetType, CardClassDefaults>;
/** One row of a class's list. A set row names a distribution; a memo row is the teacher's own short note between rows. */
export type CardPlanItem = {kind: 'set'; id: string; highlight?: boolean; hidden?: boolean} | {kind: 'memo'; id: string; text: string; highlight?: boolean; hidden?: boolean};
export type CardClassSettings = {defaults: CardClassDefaultsByType; plan: CardPlanItem[]; revision: number; updatedAt: string | null; saved: boolean};
/** What a student's list carries besides the sets: memos in place and which rows are highlighted. Hidden rows are already gone. */
export type CardStudentLayout = ({kind: 'set'; id: string; highlight: boolean} | {kind: 'memo'; id: string; text: string; highlight: boolean})[];

export const classSettingsPath = (classId: string) => `/api/cards/classes/${encodeURIComponent(classId)}/settings`;
export class CardPlanError extends Error {}
const fail = (message: string): never => {throw new CardPlanError(message);};
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** The same values the publish dialog used before class defaults existed. */
export function appCardDefaults(): CardClassDefaults {
  return {
    modes: {memorize: {on: true, percent: 100, direction: 'front-back'}, recall: {on: true, percent: 100, direction: 'front-back'}, spell: {on: false, percent: 100, direction: 'back-front'}},
    speechRate: 1,
    test: {questionCount: 20, goalScore: 80, maxAttempts: 3, requireStudy: false, direction: 'back-front', answerRelease: 'immediate', format: 'written', timeLimitMinutes: null},
    afterDue: 'late',
  };
}

// strict: a save names a bad value; lenient: a stored doc with an odd value reads as the app default for that field.
function pick<T>(value: unknown, ok: (value: unknown) => boolean, fallback: T, strict: boolean, label: string): T {
  if (value === undefined) return fallback;
  if (ok(value)) return value as T;
  return strict ? fail(`${label}을(를) 확인해 주세요.`) : fallback;
}
const whole = (min: number, max: number) => (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const oneOf = (...values: unknown[]) => (value: unknown) => values.includes(value);
const direction = oneOf('front-back', 'back-front');

export function parseClassDefaults(raw: unknown, strict = false): CardClassDefaults {
  const base = appCardDefaults();
  if (raw === undefined || raw === null) return base;
  if (!isObject(raw)) return strict ? fail('우리 반 학습 기본값을 확인해 주세요.') : base;
  const modes = isObject(raw.modes) ? raw.modes : {}, test = isObject(raw.test) ? raw.test : {};
  return {
    modes: Object.fromEntries(CARD_CLASS_MODES.map(mode => {
      const value = isObject(modes[mode]) ? modes[mode] as Record<string, unknown> : {}, fallback = base.modes[mode];
      return [mode, {on: pick(value.on, v => typeof v === 'boolean', fallback.on, strict, '학습 켜기'), percent: pick(value.percent, oneOf(...CARD_PERCENTS), fallback.percent, strict, '필수 학습 비율'), direction: pick(value.direction, direction, fallback.direction, strict, '제시 방향')}];
    })) as CardClassDefaults['modes'],
    speechRate: pick(raw.speechRate, oneOf(...CARD_SPEECH_RATES), base.speechRate, strict, '읽어 주기 속도'),
    test: {
      questionCount: pick(test.questionCount, whole(1, 200), base.test.questionCount, strict, '문항 수'),
      goalScore: pick(test.goalScore, whole(0, 100), base.test.goalScore, strict, '목표 점수'),
      maxAttempts: pick(test.maxAttempts, whole(1, 20), base.test.maxAttempts, strict, '응시 횟수'),
      requireStudy: pick(test.requireStudy, v => typeof v === 'boolean', base.test.requireStudy, strict, '응시 조건'),
      direction: pick(test.direction, direction, base.test.direction, strict, '테스트 방향'),
      answerRelease: pick(test.answerRelease, oneOf('immediate', 'after-due', 'never'), base.test.answerRelease, strict, '정답 공개'),
      format: pick(test.format, oneOf('written', 'choice'), base.test.format, strict, '문제 형식'),
      timeLimitMinutes: pick(test.timeLimitMinutes, v => v === null || whole(1, 120)(v), base.test.timeLimitMinutes, strict, '제한 시간'),
    },
    afterDue: pick(raw.afterDue, oneOf('open', 'late', 'lock'), base.afterDue, strict, '마감 후 처리'),
  };
}
export function parseClassDefaultsByType(raw: unknown, strict = false): CardClassDefaultsByType {
  const value = isObject(raw) ? raw : strict && raw !== undefined && raw !== null ? fail('우리 반 학습 기본값을 확인해 주세요.') : {};
  return {word: parseClassDefaults(value.word, strict), sentence: parseClassDefaults(value.sentence, strict)};
}

/** 100% of a 12-card range is 12; off is 0 (optional study). Never more than the server's 10 rounds. */
export function percentToCount(percent: number, rangeSize: number, on = true) {
  if (!on || rangeSize < 1) return 0;
  return Math.min(rangeSize * 10, Math.max(1, Math.round(rangeSize * percent / 100)));
}
/** A new distribution's settings from the class defaults, over the whole set. */
export function distributionFromDefaults(defaults: CardClassDefaults, cardCount: number): {requiredModes: CardRequiredModes; test: CardTestSettings; afterDue: CardAfterDue; speechRate: number} {
  const requiredModes = Object.fromEntries(CARD_CLASS_MODES.map(mode => {
    const rule = defaults.modes[mode];
    return [mode, {requiredCount: percentToCount(rule.percent, cardCount, rule.on), direction: rule.direction, rangeStart: 1, rangeEnd: cardCount}];
  })) as CardRequiredModes;
  const {timeLimitMinutes, ...test} = defaults.test;
  return {requiredModes, test: {...test, questionCount: Math.min(test.questionCount, cardCount), timeLimitSeconds: timeLimitMinutes ? timeLimitMinutes * 60 : null}, afterDue: defaults.afterDue, speechRate: defaults.speechRate};
}
/**
 * The PATCH body that brings one existing distribution in line with the defaults. Each mode keeps its own card range and
 * gets the percent of that range. An "after the deadline" answer release is left alone on a distribution with no deadline,
 * because the server would refuse it.
 */
export function patchFromDefaults(defaults: CardClassDefaults, distribution: {cardCount: number; dueAt: string | null; requiredModes: CardRequiredModes}) {
  const requiredModes = Object.fromEntries(CARD_CLASS_MODES.map(mode => {
    const rule = defaults.modes[mode], range = distribution.requiredModes[mode], size = range ? range.rangeEnd - range.rangeStart + 1 : distribution.cardCount;
    return [mode, {requiredCount: percentToCount(rule.percent, size, rule.on), direction: rule.direction}];
  }));
  const {timeLimitMinutes, answerRelease, ...test} = defaults.test;
  return {requiredModes, test: {...test, questionCount: Math.min(test.questionCount, distribution.cardCount), timeLimitSeconds: timeLimitMinutes ? timeLimitMinutes * 60 : null, ...(answerRelease === 'after-due' && !distribution.dueAt ? {} : {answerRelease})}, afterDue: defaults.afterDue, speechRate: defaults.speechRate};
}

const planId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
/** A saved list, checked and bounded: at most 100 memos of 200 characters and 500 set rows, no repeated row. */
export function parsePlan(raw: unknown, strict = false): CardPlanItem[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return strict ? fail('수업 순서를 확인해 주세요.') : [];
  const seen = new Set<string>(), items: CardPlanItem[] = [];
  let memos = 0, sets = 0;
  for (const entry of raw) {
    const bad = (message: string) => {if (strict) fail(message);};
    if (!isObject(entry) || !planId(entry.id) || (entry.kind !== 'set' && entry.kind !== 'memo')) {bad('수업 순서를 확인해 주세요.'); continue;}
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) {bad('같은 줄이 두 번 들어 있어요.'); continue;}
    const flags = {...(entry.highlight === true ? {highlight: true} : {}), ...(entry.hidden === true ? {hidden: true} : {})};
    if (entry.kind === 'set') {
      if (++sets > CARD_PLAN_SETS) {bad(`세트 줄은 ${CARD_PLAN_SETS}개까지예요.`); continue;}
      seen.add(key); items.push({kind: 'set', id: entry.id as string, ...flags}); continue;
    }
    const text = typeof entry.text === 'string' ? entry.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) {bad('빈 메모는 저장할 수 없어요.'); continue;}
    if ([...text].length > CARD_PLAN_MEMO_CHARS) {bad(`메모는 ${CARD_PLAN_MEMO_CHARS}자까지 쓸 수 있어요.`); continue;}
    if (++memos > CARD_PLAN_MEMOS) {bad(`메모는 ${CARD_PLAN_MEMOS}개까지 넣을 수 있어요.`); continue;}
    seen.add(key); items.push({kind: 'memo', id: entry.id as string, text, ...flags});
  }
  return items;
}

export type CardPlanRow<T> = {kind: 'set'; id: string; distribution: T; highlight: boolean; hidden: boolean} | {kind: 'memo'; id: string; text: string; highlight: boolean; hidden: boolean};
/**
 * The class list in the teacher's order. Distributions the plan does not mention yet (published after the last save, or
 * every row of a class that never saved one) come first, newest first, so a new set is easy to spot. Plan rows whose
 * distribution is gone are skipped.
 */
export function orderWithPlan<T extends {id: string; createdAt: string}>(distributions: T[], plan: CardPlanItem[]): CardPlanRow<T>[] {
  const byId = new Map(distributions.map(item => [item.id, item])), placed = new Set(plan.filter(item => item.kind === 'set').map(item => item.id));
  const fresh = distributions.filter(item => !placed.has(item.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const rows: CardPlanRow<T>[] = fresh.map(distribution => ({kind: 'set', id: distribution.id, distribution, highlight: false, hidden: false}));
  for (const item of plan) {
    if (item.kind === 'memo') rows.push({kind: 'memo', id: item.id, text: item.text, highlight: !!item.highlight, hidden: !!item.hidden});
    else if (byId.has(item.id)) rows.push({kind: 'set', id: item.id, distribution: byId.get(item.id)!, highlight: !!item.highlight, hidden: !!item.hidden});
  }
  return rows;
}
/** What a student sees: hidden rows dropped (the data stays), memos kept in place. */
export function studentPlan<T extends {id: string; createdAt: string}>(distributions: T[], plan: CardPlanItem[]): {distributions: T[]; layout: CardStudentLayout} {
  const rows = orderWithPlan(distributions, plan).filter(row => !row.hidden);
  return {distributions: rows.flatMap(row => row.kind === 'set' ? [row.distribution] : []), layout: rows.map(row => row.kind === 'set' ? {kind: 'set', id: row.id, highlight: row.highlight} : {kind: 'memo', id: row.id, text: row.text, highlight: row.highlight})};
}
/** Rows back into the list the server stores. */
export function planFromRows<T>(rows: CardPlanRow<T>[]): CardPlanItem[] {
  return rows.map(row => ({kind: row.kind, id: row.id, ...(row.kind === 'memo' ? {text: row.text} : {}), ...(row.highlight ? {highlight: true} : {}), ...(row.hidden ? {hidden: true} : {})}) as CardPlanItem);
}
export function moveRow<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= rows.length || to < 0 || to >= rows.length) return rows;
  const next = rows.slice(), [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}
/** A student's list with memos between the sets. With a search, or without a layout, it is just the sets. */
export type CardStudentRow<T> = {kind: 'set'; id: string; distribution: T; highlight: boolean} | {kind: 'memo'; id: string; text: string; highlight: boolean};
export function studentRows<T extends {id: string}>(distributions: T[], layout?: CardStudentLayout | null): CardStudentRow<T>[] {
  const plain = (distribution: T): CardStudentRow<T> => ({kind: 'set', id: distribution.id, distribution, highlight: false});
  if (!layout?.length) return distributions.map(plain);
  const byId = new Map(distributions.map(item => [item.id, item])), used = new Set<string>(), rows: CardStudentRow<T>[] = [];
  for (const entry of layout) {
    if (entry.kind === 'memo') {rows.push(entry); continue;}
    const distribution = byId.get(entry.id);
    if (!distribution) continue;
    used.add(entry.id); rows.push({kind: 'set', id: entry.id, distribution, highlight: entry.highlight});
  }
  // Rows from a later page are not in the first page's layout; they follow at the end.
  return [...rows, ...distributions.filter(item => !used.has(item.id)).map(plain)];
}
