'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {ACTIVITY_FLUSH_MS, ACTIVITY_IDLE_MS, ACTIVITY_TICK_MS, activityScreen, isPublicScreen, type ActivityCounters, type ActivityScreen} from '@/lib/activity';

/**
 * Screen time stays in memory and leaves in one small request every five minutes or when the page is hidden.
 * Time counts only while the page is visible and someone touched it in the last two minutes or media is playing.
 */
let pending: ActivityCounters = {}, screen: ActivityScreen | null = null, lastInput = Date.now(), lastTick = Date.now(), started = false;

// A random id that changes every day lets anonymous visitors be counted once a day without following them across days.
function visitorId() {
  try {
    const day = new Date().toISOString().slice(0, 10), saved = JSON.parse(localStorage.getItem('ourclass-visitor') || 'null');
    if (saved?.day === day && /^[a-f0-9]{24}$/.test(saved.id)) return saved.id as string;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('ourclass-visitor', JSON.stringify({day, id}));
    return id;
  } catch {return '';}
}

function tick() {
  const now = Date.now(), elapsed = Math.min(now - lastTick, ACTIVITY_TICK_MS * 2);
  lastTick = now;
  if (!screen || document.visibilityState !== 'visible') return;
  const playing = Array.from(document.querySelectorAll('video,audio')).some(media => !(media as HTMLMediaElement).paused);
  if (!playing && now - lastInput > ACTIVITY_IDLE_MS) return;
  const cell = pending[screen] ??= {ms: 0, views: 0};
  cell.ms += elapsed;
}

function flush() {
  tick();
  const screens = pending, keys = Object.keys(screens) as ActivityScreen[];
  if (!keys.some(key => screens[key]!.ms >= 1000 || screens[key]!.views)) return;
  pending = {};
  const visitor = keys.every(isPublicScreen) ? visitorId() : '';
  try {void fetch('/api/activity', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({screens, ...(visitor ? {visitor} : {})}), keepalive: true, credentials: 'same-origin'}).catch(() => {});}
  catch {}
}

function start() {
  if (started) return;
  started = true;
  const touched = () => {lastInput = Date.now();};
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(type, touched, {passive: true, capture: true});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else {lastTick = lastInput = Date.now();}
  });
  window.addEventListener('pagehide', flush);
  // Sign-out sends what was counted while the session still exists.
  window.addEventListener('homework-session-ended', flush);
  setInterval(tick, ACTIVITY_TICK_MS);
  setInterval(flush, ACTIVITY_FLUSH_MS);
}

export default function ActivityTracker() {
  const path = usePathname();
  useEffect(() => {
    start();
    tick();
    screen = activityScreen(path);
    lastInput = Date.now();
    if (screen) (pending[screen] ??= {ms: 0, views: 0}).views++;
  }, [path]);
  return null;
}
