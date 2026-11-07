// Hourly limits for teacher actions that write many documents or reach other teachers (옮기기·복제·공유·복사).
export const CARD_TEACHER_LIMITS = { transfer: 20, clone: 10, share: 60, copy: 60 } as const;
export type CardTeacherAction = keyof typeof CARD_TEACHER_LIMITS;
/** The stamps of the last hour (broken and future ones dropped, newest `limit` kept) and whether one more fits now. */
export function hourlyRate(recent: unknown, now: number, limit: number) {
  const kept = (Array.isArray(recent) ? recent : []).filter((at): at is number => typeof at === 'number' && now - at < 3600_000 && at <= now).slice(-limit);
  return { kept, allowed: kept.length < limit };
}
