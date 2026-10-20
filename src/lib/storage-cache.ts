const DAY = 86_400_000;
/** Browsers may keep a viewed file for a day instead of paying to download it again. */
export const FILE_CACHE_CONTROL = 'private,max-age=86400';
/**
 * Read links are signed for a fixed UTC-day window (valid 24–48 hours), so every
 * request on the same day yields the identical URL and hits the browser cache.
 */
export function stableReadWindow(now = Date.now()) {
  const start = Math.floor(now / DAY) * DAY;
  return {accessibleAt: new Date(start), expires: new Date(start + 2 * DAY)};
}
