import {WorkspaceError} from './shared';
import type {TimetableSlot} from './types';

/**
 * Pure helpers for how the weekly timetable is shown: period times ("bells"), which period is running now,
 * a steady colour per subject, and which cells differ from the week before. No storage, no Node built-ins.
 */
export type Bell = {start: string; end: string};
export const DEFAULT_BELLS: Bell[] = [
  {start: '09:00', end: '09:40'}, {start: '09:50', end: '10:30'}, {start: '10:40', end: '11:20'}, {start: '11:30', end: '12:10'},
  {start: '13:00', end: '13:40'}, {start: '13:50', end: '14:30'}, {start: '14:40', end: '15:20'},
];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Seven period times in order, each ending after it starts and not before the previous one ends. */
export function bellsInput(value: unknown): Bell[] {
  if (!Array.isArray(value) || value.length !== 7) throw new WorkspaceError('1~7교시 시간을 모두 넣어 주세요.');
  let last = -1;
  return value.map((raw, index) => {
    const bell = (raw ?? {}) as Record<string, unknown>, start = String(bell.start ?? ''), end = String(bell.end ?? '');
    if (!HHMM.test(start) || !HHMM.test(end) || minutes(end) <= minutes(start)) throw new WorkspaceError(`${index + 1}교시 시간을 확인해 주세요.`);
    if (minutes(start) < last) throw new WorkspaceError(`${index + 1}교시가 앞 교시와 겹쳐요.`);
    last = minutes(end);
    return {start, end};
  });
}
export const bellsOrDefault = (value: unknown): Bell[] => {try {return bellsInput(value);} catch {return DEFAULT_BELLS;}};

export type NowPeriod = {current: number | null; left: number; next: number | null; wait: number};
/**
 * Where a clock time falls among the periods that actually have a lesson today. `current` is the running period
 * with `left` minutes to go; `next` is the following lesson and `wait` the minutes until it starts.
 */
export function nowPeriod(bells: Bell[], hhmm: string, periods: number[]): NowPeriod {
  const at = minutes(hhmm), taught = [...periods].sort((a, b) => a - b).filter(period => bells[period - 1]);
  const current = taught.find(period => at >= minutes(bells[period - 1].start) && at < minutes(bells[period - 1].end)) ?? null;
  const next = taught.find(period => minutes(bells[period - 1].start) > at) ?? null;
  return {current, left: current ? minutes(bells[current - 1].end) - at : 0, next, wait: next ? minutes(bells[next - 1].start) - at : 0};
}

/** Hues teachers tend to expect for the usual subjects; anything else gets a steady hue from its name. */
const HUES: [RegExp, number][] = [
  [/국어/, 4], [/수학/, 214], [/사회|역사/, 28], [/과학/, 145], [/영어/, 268], [/체육/, 182], [/음악/, 330], [/미술/, 48],
  [/도덕/, 100], [/실과/, 20], [/창체|창의|자율|동아리|봉사|진로/, 240], [/통합|바른|슬기|즐거/, 160], [/안전/, 60],
];
export function subjectHue(subject: string): number {
  const name = subject.replace(/\s+/g, '');
  for (const [pattern, hue] of HUES) if (pattern.test(name)) return hue;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 360;
  return hash;
}

const key = (slot: {day: number; period: number}) => `${slot.day}:${slot.period}`;
const same = (a?: TimetableSlot, b?: TimetableSlot) => (a?.subject ?? '') === (b?.subject ?? '') && (a?.room ?? '') === (b?.room ?? '');
/** Cells ("day:period") where this week differs from the week it would otherwise have repeated. */
export function changedCells(week: TimetableSlot[], base: TimetableSlot[]): Set<string> {
  const now = new Map(week.map(slot => [key(slot), slot])), before = new Map(base.map(slot => [key(slot), slot])), out = new Set<string>();
  for (const cell of new Set([...now.keys(), ...before.keys()])) if (!same(now.get(cell), before.get(cell))) out.add(cell);
  return out;
}
/** One day's lessons in period order. */
export const daySlots = (slots: TimetableSlot[], day: number) => slots.filter(slot => slot.day === day).sort((a, b) => a.period - b.period);
/** Mon=1 … Fri=5 for a date, 0 at the weekend. */
export const schoolDay = (date: string) => {const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return day >= 1 && day <= 5 ? day : 0;};
