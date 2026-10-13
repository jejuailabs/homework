/** Preset Korean school calendar, evaluated at midnight in Asia/Seoul. */
export type DashboardPeriod = 'all' | 'year' | 'first' | 'second';
const kstOffset = 9 * 60 * 60 * 1000;

export function schoolYearAt(value: number) {
  const date = new Date(value + kstOffset);
  return date.getUTCFullYear() - (date.getUTCMonth() < 2 ? 1 : 0);
}

/** Filters assignment creation dates; this is not a historical status snapshot. */
export function assignmentInPeriod(createdAt: string | null, period: DashboardPeriod, year: number) {
  if (period === 'all') return true;
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  const start = Date.UTC(year, period === 'second' ? 7 : 2, 1) - kstOffset;
  const end = period === 'first' ? Date.UTC(year, 7, 1) - kstOffset : Date.UTC(year + 1, 2, 1) - kstOffset;
  return Number.isFinite(created) && created >= start && created < end;
}
