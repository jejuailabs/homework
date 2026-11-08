import type {CardEntry, CardProgress, CardReportStudent, CardRequiredModes, CardStudentDistribution} from './cards-types';
import {CARD_LEARNED_LEVEL} from './cards-logic';

/**
 * One meaning of "not finished yet", shared by the student home and Berry so the two never disagree.
 * A set with required study is finished when the requirement is met; an optional set (every required count 0)
 * would otherwise read as finished before anyone opens it, so it counts as to-do until the first activity.
 */
export function cardSetUnfinished(requiredModes: CardRequiredModes, progress: Pick<CardProgress, 'studyComplete' | 'counts' | 'attempts'>) {
  if (Object.values(requiredModes).some(rule => rule.requiredCount > 0)) return !progress.studyComplete;
  return !progress.attempts && !Object.values(progress.counts).some(Boolean);
}

export type StudentCardsSummary = {assigned: number; unfinished: number; nearestDue: string | null; overdue: number};

/** Home card numbers: sets assigned, sets still to do, and the closest deadline among those still to do. */
export function summarizeStudentCards(rows: Pick<CardStudentDistribution, 'dueAt' | 'requiredModes' | 'progress'>[], now = Date.now()): StudentCardsSummary {
  const todo = rows.filter(row => cardSetUnfinished(row.requiredModes, row.progress));
  const dues = todo.map(row => row.dueAt).filter((due): due is string => !!due && Number.isFinite(Date.parse(due)));
  const upcoming = dues.filter(due => Date.parse(due) >= now).sort((a, b) => Date.parse(a) - Date.parse(b));
  return {assigned: rows.length, unfinished: todo.length, nearestDue: upcoming[0] ?? null, overdue: dues.length - upcoming.length};
}

export type CardReportFilter = 'all' | 'unfinished' | 'untested' | 'belowGoal';
type ReportRow = Pick<CardReportStudent, 'mistakes'> & {progress: Pick<CardProgress, 'studyComplete' | 'counts' | 'attempts' | 'bestScore' | 'goalReached'>};
const HARD_WORD_LIMIT = 6, HARD_WORD_LABEL = 12;
const hasActivity = (progress: ReportRow['progress']) => progress.attempts > 0 || Object.values(progress.counts).some(Boolean);

/** Class status bar. "Done" follows cardSetUnfinished so an optional set nobody opened is waiting, not done. */
export function cardClassStatus(rows: ReportRow[], requiredModes: CardRequiredModes) {
  const done = rows.filter(row => !cardSetUnfinished(requiredModes, row.progress)).length;
  const waiting = rows.filter(row => cardSetUnfinished(requiredModes, row.progress) && !hasActivity(row.progress)).length;
  return {done, active: rows.length - done - waiting, waiting};
}
/** Score filters read bestScore, so a test that was started and never submitted still counts as not taken. */
export function filterCardReport<T extends ReportRow>(rows: T[], filter: CardReportFilter, requiredModes: CardRequiredModes) {
  if (filter === 'unfinished') return rows.filter(row => cardSetUnfinished(requiredModes, row.progress));
  if (filter === 'untested') return rows.filter(row => row.progress.bestScore === null);
  if (filter === 'belowGoal') return rows.filter(row => row.progress.bestScore !== null && !row.progress.goalReached);
  return rows;
}
/** wrongRate is a percentage of the students with any activity; wrongCount is every miss. Long or repeated fronts get a short unique label for the chart. */
export function cardHardWords(rows: ReportRow[], cards: Pick<CardEntry, 'id' | 'front'>[], limit = HARD_WORD_LIMIT) {
  const learners = rows.filter(row => hasActivity(row.progress)).length, order = new Map(cards.map((card, index) => [card.id, index]));
  const misses = new Map<string, {students: number; total: number}>();
  for (const row of rows) for (const {cardId, count} of row.mistakes) {
    if (!order.has(cardId) || count <= 0) continue;
    const entry = misses.get(cardId) ?? {students: 0, total: 0};
    misses.set(cardId, {students: entry.students + 1, total: entry.total + count});
  }
  const seen = new Set<string>();
  return learners ? [...misses].sort(([, a], [, b]) => b.students - a.students || b.total - a.total).slice(0, limit).map(([cardId, {students, total}]) => {
    const index = order.get(cardId)!, front = Array.from(cards[index].front), short = front.length > HARD_WORD_LABEL ? `${front.slice(0, HARD_WORD_LABEL - 1).join('')}…` : cards[index].front;
    const word = seen.has(short) ? `${short} (${index + 1})` : short;
    seen.add(word);
    return {word, wrongRate: students / learners * 100, wrongCount: total};
  }) : [];
}
/** Cards the class has not learned yet: the share of students with any activity still below 잎 on each card. Same shape as cardHardWords so the same chart draws it. */
export function cardUnmastered(rows: (ReportRow & {levels?: Record<string, number>})[], cards: Pick<CardEntry, 'id' | 'front'>[], limit = HARD_WORD_LIMIT) {
  const learners = rows.filter(row => hasActivity(row.progress));
  if (!learners.length) return [];
  const seen = new Set<string>();
  return cards.map((card, index) => ({card, index, below: learners.filter(row => (row.levels?.[card.id] ?? 0) < CARD_LEARNED_LEVEL).length})).filter(row => row.below > 0)
    .sort((a, b) => b.below - a.below || a.index - b.index).slice(0, limit).map(({card, index, below}) => {
      const front = Array.from(card.front), short = front.length > HARD_WORD_LABEL ? `${front.slice(0, HARD_WORD_LABEL - 1).join('')}…` : card.front;
      const word = seen.has(short) ? `${short} (${index + 1})` : short;
      seen.add(word);
      return {word, wrongRate: below / learners.length * 100, wrongCount: below};
    });
}
/** 복습 세트 (§39): every card someone in the class missed, most students first, then most misses, then set order. */
export function cardReviewCandidates<C extends Pick<CardEntry, 'id'>>(rows: Pick<CardReportStudent, 'mistakes'>[], cards: C[], limit = 30) {
  const order = new Map(cards.map((card, index) => [card.id, index])), misses = new Map<string, {students: number; total: number}>();
  for (const row of rows) for (const {cardId, count} of row.mistakes) {
    if (!order.has(cardId) || count <= 0) continue;
    const entry = misses.get(cardId) ?? {students: 0, total: 0};
    misses.set(cardId, {students: entry.students + 1, total: entry.total + count});
  }
  return [...misses].sort(([a, x], [b, y]) => y.students - x.students || y.total - x.total || order.get(a)! - order.get(b)!).slice(0, limit)
    .map(([cardId, value]) => ({card: cards[order.get(cardId)!], ...value}));
}
