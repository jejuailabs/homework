/** Teacher storage plan: one shared allowance for every upload in the teacher's classes. */
export const GIB = 1024 ** 3;
export const BASE_PLAN_BYTES = 200 * GIB;
export const PLAN_PERIOD_DAYS = 365;
// Per-feature ledgers keep their accounting but no longer cap usage on their own.
export const FEATURE_STORAGE_CEILING = 1024 ** 4;
export const storageCategories = ['homeworkVideo', 'homeworkPhoto', 'gallery', 'materials', 'boards'] as const;
export type StorageCategory = (typeof storageCategories)[number];
export type StoragePlanView = {
  baseBytes: number; extraBytes: number; quotaBytes: number;
  usedBytes: number; reservedBytes: number; remainingBytes: number;
  categories: Record<StorageCategory, number>;
  periodStart: string; periodEnd: string; daysLeft: number;
  level: 'ok' | 'warn' | 'critical'; computedAt: string;
};
const DAY = 86_400_000;

export function planPeriodEnd(start: string) {return new Date(Date.parse(start) + PLAN_PERIOD_DAYS * DAY).toISOString();}
export function daysUntil(end: string, now = Date.now()) {return Math.max(0, Math.ceil((Date.parse(end) - now) / DAY));}
export function usageLevel(usedBytes: number, quotaBytes: number): StoragePlanView['level'] {
  const ratio = quotaBytes > 0 ? usedBytes / quotaBytes : 1;
  return ratio >= 0.95 ? 'critical' : ratio >= 0.8 ? 'warn' : 'ok';
}
/** Pending uploads count against the allowance too, so parallel uploads cannot overshoot it. */
export function fitsPlan(usedBytes: number, reservedBytes: number, bytes: number, quotaBytes: number) {
  return usedBytes + reservedBytes + bytes <= quotaBytes;
}
export function formatStorage(bytes: number) {
  return bytes >= GIB ? `${(bytes / GIB).toFixed(bytes >= 100 * GIB ? 0 : 1)}GB` : bytes >= 1024 ** 2 ? `${Math.round(bytes / 1024 ** 2)}MB` : `${Math.round(bytes / 1024)}KB`;
}
