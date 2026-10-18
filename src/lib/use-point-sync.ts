'use client';
import {useEffect, useRef} from 'react';
import type {PointBalanceState} from './points-types';

const eventName = 'homework-points-changed';
/** Notify this tab and other tabs without putting private balances in messages. */
export function notifyPointsChanged() {
  window.dispatchEvent(new Event(eventName));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(eventName);
    channel.postMessage('changed');
    channel.close();
  }
}

/** Refresh only the visible wallet, never the room/diary draft or full roster. */
export function usePointSync(onBalance: (value: PointBalanceState) => void, enabled: boolean) {
  const callback = useRef(onBalance);
  callback.current = onBalance;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false, serial = 0, failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(eventName);
    const schedule = () => { clearTimeout(timer); if (!stopped && document.visibilityState === 'visible') timer = setTimeout(refresh, Math.min(30000, 5000 * 2 ** failures)); };
    async function refresh() {
      clearTimeout(timer);
      controller?.abort();
      const current = ++serial;
      if (stopped || document.visibilityState !== 'visible' || !navigator.onLine) { schedule(); return; }
      controller = new AbortController();
      const requestController = controller;
      const timeout = setTimeout(() => requestController.abort(), 10000);
      try {
        const response = await fetch('/api/points/balance', {cache: 'no-store', signal: controller.signal});
        if (stopped || current !== serial) return;
        if (response.status === 401 || response.status === 403) {
          stopped = true;
          window.dispatchEvent(new Event('homework-session-ended'));
          return;
        }
        if (!response.ok) throw new Error('Balance refresh failed');
        const value: PointBalanceState = await response.json();
        if (stopped || current !== serial) return;
        failures = 0;
        callback.current(value);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') failures = Math.min(3, failures + 1);
      } finally { clearTimeout(timeout); if (current === serial) schedule(); }
    }
    const visibility = () => { if (document.visibilityState === 'visible') void refresh(); else { clearTimeout(timer); ++serial; controller?.abort(); } };
    const stop = () => { stopped = true; ++serial; clearTimeout(timer); controller?.abort(); };
    const wake = () => { void refresh(); };
    schedule();
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener(eventName, wake);
    window.addEventListener('homework-session-ended', stop);
    document.addEventListener('visibilitychange', visibility);
    if (channel) channel.onmessage = wake;
    return () => {
      stop(); channel?.close();
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener(eventName, wake);
      window.removeEventListener('homework-session-ended', stop);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [enabled]);
}
