/**
 * "New" marks on the student screens: something the teacher posted recently that this student has not opened yet.
 * Only recent items count, so the first day of this feature does not light up every old homework or board.
 */
export const STUDENT_NEWS_WINDOW_DAYS = 14;
export const STUDENT_SEEN_KINDS = ['assignments', 'boards'] as const;
export type StudentSeenKind = typeof STUDENT_SEEN_KINDS[number];
export type StudentNewsCounts = {assignments: number; boards: number; exhibitions: number};

type NewsItem = {id: string; createdAt?: unknown};

export function newsCutoff(now: number, days = STUDENT_NEWS_WINDOW_DAYS) {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export function isRecent(createdAt: unknown, now: number, days = STUDENT_NEWS_WINDOW_DAYS) {
  if (typeof createdAt !== 'string') return false;
  const at = Date.parse(createdAt);
  return Number.isFinite(at) && at >= now - days * 24 * 60 * 60 * 1000 && at <= now + 5 * 60 * 1000;
}

/** Ids in a stored seen map (`{id: openedAt}`); anything else is treated as "nothing seen". */
export function seenIds(value: unknown): Set<string> {
  return new Set(value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : []);
}

export function newItemIds(items: readonly NewsItem[], seen: ReadonlySet<string>, now: number) {
  return items.filter(item => !seen.has(item.id) && isRecent(item.createdAt, now)).map(item => item.id);
}

/** Homework already submitted or reviewed was clearly opened, even before seen records existed. */
export function newAssignmentIds(items: readonly (NewsItem & {status?: string})[], seen: ReadonlySet<string>, now: number) {
  return newItemIds(items.filter(item => !item.status || item.status === 'pending'), seen, now);
}

export function seenRequest(raw: unknown): {kind: StudentSeenKind; id: string} | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const {kind, id} = raw as Record<string, unknown>;
  if (!STUDENT_SEEN_KINDS.includes(kind as StudentSeenKind)) return null;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  return {kind: kind as StudentSeenKind, id};
}

/** Short label for a badge: 1-9 as is, then "9+". */
export function badgeLabel(count: number) {
  return count > 9 ? '9+' : String(Math.max(0, Math.floor(count)));
}
