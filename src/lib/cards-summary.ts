import type {CardProgress, CardRequiredModes, CardStudentDistribution} from './cards-types';

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
