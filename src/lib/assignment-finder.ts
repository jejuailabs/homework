/**
 * The 숙제 list finder, shared by the teacher menu and Berry's list_assignments so both find homework the same way:
 * kind (image·text·video·legacy), title words, and order (newest, oldest, due soonest; no due date last).
 */
export const ASSIGNMENT_KINDS = ['image', 'text', 'video', 'legacy'] as const;
export const ASSIGNMENT_ORDERS = ['new', 'old', 'due'] as const;
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];
export type AssignmentOrder = (typeof ASSIGNMENT_ORDERS)[number];
export type FindableAssignment = {title?: unknown; submissionType?: unknown; createdAt?: unknown; dueAt?: unknown};

export const assignmentKind = (value: unknown): AssignmentKind => value === 'text' || value === 'image' || value === 'video' ? value : 'legacy';
const time = (value: unknown) => {const parsed = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : null;};
export const searchWords = (query: unknown) => String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);

export function findAssignments<T extends FindableAssignment>(tasks: T[], {kind, query, order = 'new'}: {kind?: AssignmentKind; query?: string; order?: AssignmentOrder}): T[] {
  const words = searchWords(query);
  return tasks.filter(task => (!kind || assignmentKind(task.submissionType) === kind) && words.every(word => String(task.title ?? '').toLowerCase().includes(word)))
    .sort((a, b) => {
      if (order === 'due') {const left = time(a.dueAt), right = time(b.dueAt); if (left !== right) return left === null ? 1 : right === null ? -1 : left - right;}
      const diff = (time(a.createdAt) ?? 0) - (time(b.createdAt) ?? 0);
      return order === 'old' ? diff : -diff;
    });
}

/** "2026-11" for grouping by month, in the viewer's local calendar; "" when the date is missing. */
export function monthKey(value: unknown) {
  const parsed = time(value);
  if (parsed === null) return '';
  const date = new Date(parsed);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
