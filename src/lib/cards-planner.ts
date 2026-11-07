// 학습 일정: a date view of the class's sets. Each set can carry a 학습할 날 (planDate, YYYY-MM-DD, set by the teacher) and a
// deadline; both are read as Seoul dates. Pure, so the teacher planner and the student agenda show the same days.
import {cardAddDays, cardReviewDate, cardWeekStart} from './cards-logic';

export type CardPlannerRow = {id: string; title: string; planDate?: string | null; dueAt: string | null; active: boolean};
export type CardPlannerEntry<T extends CardPlannerRow> = {kind: 'plan' | 'due'; row: T};
export type CardPlannerDay<T extends CardPlannerRow> = {date: string; today: boolean; entries: CardPlannerEntry<T>[]};

export const validPlanDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
/** The deadline's day in Seoul. A deadline at 00:00 belongs to the day it closes. */
export const dueDate = (dueAt: string | null) => {const time = dueAt ? Date.parse(dueAt) : Number.NaN; return Number.isFinite(time) ? cardReviewDate(time) : null;};

function entriesOn<T extends CardPlannerRow>(rows: T[], date: string): CardPlannerEntry<T>[] {
  return [
    ...rows.filter(row => row.planDate === date).map(row => ({kind: 'plan' as const, row})),
    ...rows.filter(row => dueDate(row.dueAt) === date).map(row => ({kind: 'due' as const, row})),
  ];
}
/** Monday to Sunday of the week holding `date`, every day listed even when empty, plus sets with neither date. Stopped sets stay out. */
export function plannerWeek<T extends CardPlannerRow>(rows: T[], date: string, today = cardReviewDate()) {
  const live = rows.filter(row => row.active), start = cardWeekStart(date);
  const days: CardPlannerDay<T>[] = Array.from({length: 7}, (_, index) => {const day = cardAddDays(start, index); return {date: day, today: day === today, entries: entriesOn(live, day)};});
  return {start, end: cardAddDays(start, 6), days, unscheduled: live.filter(row => !validPlanDate(row.planDate) && !dueDate(row.dueAt))};
}
/** The student's agenda: the next `span` days from today that have something, then how many later items wait. Past days are left out. */
export function studentAgenda<T extends CardPlannerRow>(rows: T[], today = cardReviewDate(), span = 14) {
  const live = rows.filter(row => row.active), days: CardPlannerDay<T>[] = [];
  for (let index = 0; index < span; index++) {
    const day = cardAddDays(today, index), entries = entriesOn(live, day);
    if (entries.length) days.push({date: day, today: index === 0, entries});
  }
  const last = cardAddDays(today, span - 1), later = live.filter(row => (validPlanDate(row.planDate) && row.planDate > last) || ((dueDate(row.dueAt) ?? '') > last)).length;
  return {days, later};
}
