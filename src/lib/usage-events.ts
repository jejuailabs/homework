/** Pilot usage counters. Values are aggregated per day, never per file or per person. */
export const usageCounterKeys = [
  'videoPlay', 'imageView',
  'videoRejectSize', 'videoRejectDuration', 'imageRejectSize',
  'imageCompressed', 'imageSmall', 'imageUnsupported', 'imageTooLarge', 'imageNotSmaller', 'imageFailed', 'imageTimeout',
  'imageBytesIn', 'imageBytesOut', 'imageCompressMs',
] as const;
export type UsageCounterKey = (typeof usageCounterKeys)[number];
export type UsageCounters = Partial<Record<UsageCounterKey, number>>;
// Generous per-flush caps: they bound abuse without dropping a busy real session.
const caps: Partial<Record<UsageCounterKey, number>> = {imageBytesIn: 2 * 1024 ** 3, imageBytesOut: 2 * 1024 ** 3, imageCompressMs: 3_600_000};

export function cleanUsageCounters(value: unknown): UsageCounters {
  const result: UsageCounters = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const key of usageCounterKeys) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) continue;
    result[key] = Math.min(Math.round(raw), caps[key] ?? 1000);
  }
  return result;
}

export const compressionCounter = {compressed: 'imageCompressed', small: 'imageSmall', unsupported: 'imageUnsupported', 'too-large': 'imageTooLarge', 'not-smaller': 'imageNotSmaller', failed: 'imageFailed', timeout: 'imageTimeout'} as const satisfies Record<string, UsageCounterKey>;
