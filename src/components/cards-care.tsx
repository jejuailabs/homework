'use client';

import {useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode} from 'react';
import Link from 'next/link';
import {ClipboardCheck, Clock3, Hourglass, Volume2, VolumeX} from 'lucide-react';
import {usePreferences} from './providers';
import {cardDayLoad} from '@/lib/cards-load';
import type {CardStudentDistribution} from '@/lib/cards-types';
import ko from '@/messages/cards-care-ko.json';
import en from '@/messages/cards-care-en.json';
import '@/styles/cards-care.css';

// 부담 줄이기(소리 끄기·예상 소요시간·과부하 안내)와 시험 중 학습 대기 안내.
export function useCardsCareCopy() {
  const {locale} = usePreferences(), c = locale === 'ko' ? ko : en;
  return {c, locale, fill: (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))};
}

/** One sound setting for all of 카드놀이 on this device. Both start off; the old games switch (cards-games-sound) carries over. */
export type CardSound = {effects: boolean; autoSpeech: boolean};
const SOUND_KEY = 'cards-sound', OFF: CardSound = {effects: false, autoSpeech: false}, listeners = new Set<() => void>();
let cached: CardSound | null = null;
function readSound(): CardSound {
  if (cached) return cached;
  try {
    const saved = JSON.parse(localStorage.getItem(SOUND_KEY) || 'null');
    cached = saved && typeof saved === 'object' ? {effects: saved.effects === true, autoSpeech: saved.autoSpeech === true} : {...OFF, effects: localStorage.getItem('cards-games-sound') === 'on'};
  } catch {cached = OFF;}
  return cached;
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => {if (event.key === SOUND_KEY) {cached = null; listener();}};
  listeners.add(listener); window.addEventListener('storage', storage);
  return () => {listeners.delete(listener); window.removeEventListener('storage', storage);};
}
export function setCardSound(change: Partial<CardSound>) {
  cached = {...readSound(), ...change};
  try {localStorage.setItem(SOUND_KEY, JSON.stringify(cached));} catch {}
  for (const listener of listeners) listener();
}
/** The setting plus short tones made on the spot (no files). Nothing plays while effects are off. */
export function useCardSound() {
  const sound = useSyncExternalStore(subscribe, readSound, () => OFF), context = useRef<AudioContext | null>(null);
  const play = useCallback((kind: 'good' | 'bad' | 'end') => {
    if (!sound.effects || typeof window === 'undefined' || !('AudioContext' in window)) return;
    try {
      const audio = context.current ?? (context.current = new AudioContext()), now = audio.currentTime;
      const notes = kind === 'good' ? [660, 880] : kind === 'bad' ? [220] : [523, 659, 784];
      notes.forEach((frequency, index) => {
        const tone = audio.createOscillator(), gain = audio.createGain(), start = now + index * .09;
        tone.type = kind === 'bad' ? 'triangle' : 'sine'; tone.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.12, start + .015); gain.gain.exponentialRampToValueAtTime(.0001, start + .14);
        tone.connect(gain).connect(audio.destination); tone.start(start); tone.stop(start + .16);
      });
    } catch {}
  }, [sound.effects]);
  useEffect(() => () => {void context.current?.close().catch(() => {});}, []);
  return {...sound, play};
}
/** The 소리 control: effects and auto speech, remembered on this device. */
export function CardSoundSettings() {
  const {c} = useCardsCareCopy(), sound = useCardSound(), on = sound.effects || sound.autoSpeech;
  return <details className="cc-sound"><summary aria-label={c.sound}>{on ? <Volume2 size={17}/> : <VolumeX size={17}/>}<span>{c.sound}</span></summary><div className="cc-sound-panel">
    <label><input type="checkbox" checked={sound.effects} onChange={event => setCardSound({effects: event.target.checked})}/>{c.soundEffects}</label>
    <label><input type="checkbox" checked={sound.autoSpeech} onChange={event => setCardSound({autoSpeech: event.target.checked})}/>{c.autoSpeech}</label>
    <p>{c.soundHint}</p></div></details>;
}

/** Study, review and games wait while this student's test on the set runs. */
export function CardTestWait({distributionId, back}: {distributionId: string; back?: ReactNode}) {
  const {c} = useCardsCareCopy();
  return <div className="cc-wait" role="status"><Hourglass size={28}/><h2>{c.testWait}</h2><p>{c.testWaitBody}</p><div className="cs-actions"><Link className="button primary" href={`/student/cards/${distributionId}/test`}><ClipboardCheck size={17}/>{c.testGo}</Link>{back}</div></div>;
}
export function CardMinutes({minutes}: {minutes: number}) {
  const {c, fill} = useCardsCareCopy();
  return <span className="cc-minutes"><Clock3 size={13}/>{minutes ? fill(c.minutesLeft, {minutes}) : c.minutesNone}</span>;
}
/** Top of the student list: today's estimate, and above 30 minutes a gentle nudge with the nearest deadlines first. */
export function CardDayLoad({rows, time}: {rows: CardStudentDistribution[]; time: number}) {
  const {c, fill, locale} = useCardsCareCopy(), load = cardDayLoad(rows, time);
  const [open, setOpen] = useState(false);
  if (!load.minutes) return null;
  return <section className={`cc-day${load.heavy ? ' is-heavy' : ''}`} aria-live="polite"><p><Clock3 size={16}/><b>{fill(c.dayTotal, {minutes: load.minutes})}</b></p>
    {load.heavy && <><p>{c.dayHeavy}</p><ol aria-label={c.dayOrder}>{load.order.slice(0, open ? undefined : 3).map(({row, minutes}) => <li key={row.id}><Link href={`/student/cards/${row.id}`}>{row.title}</Link><span>{row.dueAt ? new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric'}).format(new Date(row.dueAt)) : '—'} · {fill(c.minutesShort, {minutes})}</span></li>)}</ol>{load.order.length > 3 && !open && <button type="button" className="cs-text-button" onClick={() => setOpen(true)}>+{load.order.length - 3}</button>}</>}
    <small>{c.estimateNote}</small></section>;
}
