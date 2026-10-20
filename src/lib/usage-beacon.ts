'use client';
import type {UsageCounterKey, UsageCounters} from './usage-events';

/**
 * Counts stay in memory and leave in one small request when the page is hidden
 * or once a minute, so recording never competes with an upload or playback.
 */
let pending: UsageCounters = {}, timer: ReturnType<typeof setTimeout> | null = null, listening = false;
const seen = new Set<string>();

function flush() {
  if (timer) {clearTimeout(timer); timer = null;}
  if (!Object.keys(pending).length) return;
  const counters = pending; pending = {};
  try {void fetch('/api/usage-events', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({counters}), keepalive: true, credentials: 'same-origin'}).catch(() => {});}
  catch {}
}

export function countUsage(key: UsageCounterKey, amount = 1) {
  if (typeof window === 'undefined' || !(amount > 0)) return;
  pending[key] = (pending[key] ?? 0) + amount;
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', () => {if (document.visibilityState === 'hidden') flush();});
    window.addEventListener('pagehide', flush);
  }
  timer ??= setTimeout(flush, 60_000);
}

/** Counts a file once per page session, however often the element re-renders or replays. */
export function countUsageOnce(key: UsageCounterKey, id: string) {
  const token = `${key}:${id}`;
  if (seen.has(token)) return;
  seen.add(token); countUsage(key);
}
