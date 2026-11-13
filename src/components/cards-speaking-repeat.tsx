'use client';

import {useEffect, useRef, useState, type ReactNode} from 'react';
import {CheckCircle2, LoaderCircle, Mic, Pause, Play, RefreshCw, RotateCcw, Volume2} from 'lucide-react';
import {usePreferences} from './providers';
import {micProblemText, useRecorder, type Take} from '@/modules/speech-studio/recorder';
import {pcmWav} from '@/modules/voice-caption/wav';
import {SPEAKING_MAX_SECONDS, type SpeakingTake, type SpeakingTakes} from '@/lib/cards-speaking';
import {SPELL_SPEEDS} from '@/lib/cards-logic';
import type {CardEntry} from '@/lib/cards-types';
import {ttsPlayer} from '@/lib/tts-client';
import ko from '@/messages/cards-speaking-repeat-ko.json';
import en from '@/messages/cards-speaking-repeat-en.json';
import '@/styles/cards-speaking-repeat.css';

/**
 * 듣고 따라 말하기 (필수): one card after another with no buttons in between. The English shows, the native voice plays, and as soon as
 * it ends the microphone records for twice as long as the voice took; the take is saved and the next card starts by itself.
 * 일시정지 stops and drops the take in progress. When every card has a take, a list lets the student hear the voice, hear their
 * own take and record a card again. Takes are the distribution's 녹음 takes, so the teacher's listen and download stay as they were.
 */
export const REPEAT_RECORD_FACTOR = 2;
const MIN_RECORD_MS = 1500, MAX_RECORD_MS = SPEAKING_MAX_SECONDS * 1000 - 500;
export const repeatRecordMs = (voiceMs: number) => Math.round(Math.min(MAX_RECORD_MS, Math.max(MIN_RECORD_MS, voiceMs * REPEAT_RECORD_FACTOR)));
const SPEED_KEY = 'cards-repeat-speed';
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
/** About 0.42 s a word, for when the voice's real length cannot be measured. */
const estimateMs = (text: string, rate: number) => (text.trim().split(/\s+/).length * 420 + 600) / rate;

type Phase = 'listen' | 'record' | 'saving' | 'paused' | 'failed';
export type RepeatProps = {
  title: string; cards: CardEntry[]; takes: SpeakingTakes; canRecord: boolean;
  /** Uploads a take and returns it; absent in the teacher's preview, where takes stay on this screen. */
  saveTake?: (cardId: string, take: Take) => Promise<SpeakingTake>;
  exit: ReactNode; footer?: ReactNode; preview?: boolean;
};

export function SpeakingRepeat({title, cards, takes: initialTakes, canRecord, saveTake, exit, footer, preview}: RepeatProps) {
  const {locale} = usePreferences(), c = locale === 'ko' ? ko : en;
  const [takes, setTakes] = useState<Record<string, {url?: string}>>(initialTakes);
  const [view, setView] = useState<'menu' | 'run' | 'list'>('menu'), [index, setIndex] = useState(0), [single, setSingle] = useState(false);
  const [phase, setPhase] = useState<Phase>('listen'), [recordMs, setRecordMs] = useState(0), [failure, setFailure] = useState(''), [speed, setSpeed] = useState(1);
  const player = useRef<HTMLAudioElement | null>(null), run = useRef(0), alive = useRef(true), pending = useRef<{cardId: string; take: Take} | null>(null), stopTimer = useRef(0), recordRun = useRef(-1);
  const indexRef = useRef(index), singleRef = useRef(single); indexRef.current = index; singleRef.current = single;
  const done = cards.filter(card => takes[card.id]).length, complete = cards.length > 0 && done === cards.length;
  useEffect(() => {try {const saved = Number(localStorage.getItem(SPEED_KEY)); if (SPELL_SPEEDS.includes(saved)) setSpeed(saved);} catch {}}, []);
  useEffect(() => {alive.current = true; return () => {alive.current = false; run.current++; player.current?.pause(); window.clearTimeout(stopTimer.current); if ('speechSynthesis' in window) window.speechSynthesis.cancel();};}, []);
  // The next two voices are fetched ahead so each card starts at once.
  useEffect(() => {for (const card of cards.slice(index, index + 3)) ttsPlayer().prefetch(card.front, {source: 'cards'});}, [cards, index]);

  const recorder = useRecorder(take => void keep(take), SPEAKING_MAX_SECONDS);
  // The flow runs across awaits, so it always reaches the recorder of the latest render (an older copy still thinks it is busy).
  const live = useRef(recorder); live.current = recorder;
  // Recording starts the moment the voice ends; it stops by itself after twice the voice's length.
  useEffect(() => {
    if (recorder.state !== 'recording') return;
    // Paused while the microphone was still starting: drop it.
    if (phase !== 'record' || recordRun.current !== run.current || !recordMs) {recorder.stop(true); return;}
    window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => {if (alive.current) live.current.stop();}, recordMs);
  }, [recorder.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {if ((recorder.problem || recorder.error) && phase === 'record') {setPhase('failed'); setFailure('mic');}}, [recorder.problem, recorder.error]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Phones only let sound play from a tap: the one audio element is started inside the 시작 tap and reused for every card. */
  function unlockAudio() {
    if (!player.current) player.current = new Audio();
    const audio = player.current;
    audio.muted = true; audio.src = URL.createObjectURL(new Blob([Uint8Array.from(pcmWav(new Float32Array(800)))], {type: 'audio/wav'}));
    void audio.play().then(() => audio.pause()).catch(() => undefined).finally(() => {audio.muted = false;});
  }
  /** Plays the card's voice and resolves with how long it took (0 when it was stopped). */
  async function voice(text: string, mine: number): Promise<number> {
    // A slow or stuck voice request must not stop the flow: after 5 s the device voice reads instead.
    const url = await Promise.race([ttsPlayer().link(text, {source: 'cards'}).catch(() => null), new Promise<null>(resolve => window.setTimeout(() => resolve(null), 5000))]);
    if (mine !== run.current) return 0;
    const began = performance.now();
    if (url && player.current) {
      const audio = player.current;
      const played = await new Promise<boolean>(resolve => {
        const guard = window.setTimeout(() => {audio.pause(); resolve(false);}, Math.max(15000, estimateMs(text, speed) * 3));
        audio.onended = () => {window.clearTimeout(guard); resolve(true);}; audio.onerror = () => {window.clearTimeout(guard); resolve(false);};
        audio.src = url; audio.playbackRate = speed; audio.preservesPitch = true; audio.muted = false;
        audio.play().catch(() => {window.clearTimeout(guard); resolve(false);});
      });
      audio.onended = null; audio.onerror = null;
      if (mine !== run.current) return 0;
      if (played) return performance.now() - began;
    }
    // No server voice (or it failed): the device voice reads it, and its own end is the signal.
    const guess = estimateMs(text, speed);
    if (!('speechSynthesis' in window)) {await new Promise(resolve => window.setTimeout(resolve, guess)); return mine === run.current ? guess : 0;}
    const start = performance.now();
    await new Promise<void>(resolve => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = Math.min(2, Math.max(0.5, speed));
      const timer = window.setTimeout(resolve, guess * 2.5);
      utterance.onend = () => {window.clearTimeout(timer); resolve();}; utterance.onerror = () => {window.clearTimeout(timer); resolve();};
      window.speechSynthesis.speak(utterance);
    });
    return mine === run.current ? Math.max(performance.now() - start, 600) : 0;
  }
  async function play(at: number) {
    const card = cards[at];
    if (!card) {finish(); return;}
    const mine = ++run.current;
    setIndex(at); setFailure(''); setRecordMs(0); setPhase('listen');
    const ms = await voice(card.front, mine);
    if (!alive.current || mine !== run.current || !ms) return;
    setRecordMs(repeatRecordMs(ms)); setPhase('record');
    recordRun.current = mine;
    // The last take may still be finishing; wait until the recorder is free.
    for (let tries = 0; live.current.state !== 'idle' && tries < 40; tries++) await new Promise(resolve => window.setTimeout(resolve, 50));
    if (!alive.current || mine !== run.current) return;
    await live.current.start();
  }
  async function keep(take: Take) {
    const at = indexRef.current, card = cards[at];
    if (!card || !alive.current || recordRun.current !== run.current) return;
    pending.current = {cardId: card.id, take};
    setPhase('saving');
    try {
      const saved = saveTake ? await saveTake(card.id, take) : {url: take.url};
      if (!alive.current) return;
      pending.current = null;
      setTakes(value => ({...value, [card.id]: {url: saved.url}}));
      if (singleRef.current) {setSingle(false); setView('list'); return;}
      void play(at + 1);
    } catch {if (alive.current) {setPhase('failed'); setFailure('save');}}
  }
  function finish() {run.current++; setView('list'); setSingle(false);}
  function begin(at: number, one = false) {unlockAudio(); setSingle(one); setView('run'); void play(at);}
  function pause() {
    run.current++; player.current?.pause(); window.clearTimeout(stopTimer.current);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (live.current.state === 'recording' || live.current.state === 'starting') live.current.stop(true);
    setPhase('paused');
  }
  function retry() {
    if (failure === 'save' && pending.current) {const {take} = pending.current; void keep(take); return;}
    unlockAudio(); void play(indexRef.current);
  }
  function hear(url?: string) {if (!url) return; if (!player.current) player.current = new Audio(); const audio = player.current; audio.onended = null; audio.src = url; audio.playbackRate = 1; audio.muted = false; void audio.play().catch(() => undefined);}
  async function hearNative(text: string) {const url = await Promise.race([ttsPlayer().link(text, {source: 'cards'}).catch(() => null), new Promise<null>(resolve => window.setTimeout(() => resolve(null), 5000))]); if (url) hear(url); else if ('speechSynthesis' in window) {window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; window.speechSynthesis.speak(u);}}

  const card = cards[index];
  if (view === 'run' && card) {
    const problem = recorder.problem ? micProblemText[recorder.problem] : null;
    return <section className="rpt-page">
      <div className="rpt-top"><span className="rpt-tag">{c.title}</span><span className="rpt-count">{fill(c.cardOf, {n: index + 1, total: cards.length})}</span></div>
      {preview && <p className="rpt-preview">{c.preview}</p>}
      <progress className="rpt-progress" value={done} max={cards.length} aria-label={fill(c.progress, {done, total: cards.length})}/>
      <div className={`rpt-card is-${phase}`}>
        <p className="rpt-front" lang="en">{card.front}</p>
        {card.back && <p className="rpt-back" lang="ko">{card.back}</p>}
        <div className="rpt-state" role="status" aria-live="polite">
          {phase === 'listen' && <><Volume2 size={22}/><b>{c.listen}</b></>}
          {phase === 'record' && <><Mic size={22}/><b>{c.speak}</b></>}
          {phase === 'saving' && <><LoaderCircle className="spin" size={20}/><b>{c.saving}</b></>}
          {phase === 'paused' && <b>{c.paused}</b>}
        </div>
        {phase === 'record' && <div className="rpt-meter" aria-hidden="true"><span key={`${index}-${recordMs}`} className={recorder.state === 'recording' ? 'is-on' : ''} style={{animationDuration: `${recordMs}ms`}}/></div>}
        {phase === 'record' && <div className="rpt-level" aria-hidden="true"><span style={{width: `${Math.round(recorder.level * 100)}%`}}/></div>}
      </div>
      {phase === 'failed' && <div className="rpt-alert" role="alert">{problem ? <><b>{problem.title}</b><ul>{problem.steps.map(step => <li key={step}>{step}</li>)}</ul></> : <p>{recorder.error || c.saveFailed}</p>}<button type="button" className="button" onClick={retry}><RefreshCw size={16}/>{c.retry}</button></div>}
      <p className="rpt-note">{c.micNote}</p>
      <div className="rpt-bar">
        {phase === 'paused' || phase === 'failed'
          ? <><button type="button" className="button" onClick={finish}>{c.listTitle}</button>{phase === 'paused' && <button type="button" className="button primary" onClick={() => {unlockAudio(); void play(index);}}><Play size={17}/>{c.resume}</button>}</>
          : <button type="button" className="button" disabled={phase === 'saving'} onClick={pause}><Pause size={17}/>{c.pause}</button>}
      </div>
    </section>;
  }

  if (view === 'list') return <section className="rpt-page">
    <div className="rpt-top">{exit}</div>
    {preview && <p className="rpt-preview">{c.preview}</p>}
    <header className="rpt-head"><h1>{c.title} <span className="rpt-required">{c.required}</span></h1><span className="rpt-count">{fill(c.progress, {done, total: cards.length})}</span></header>
    {complete && <p className="rpt-done"><CheckCircle2 size={18}/>{c.doneTitle}</p>}
    {footer}
    <ol className="rpt-list" aria-label={c.listTitle}>{cards.map((item, position) => {const take = takes[item.id]; return <li key={item.id} className={take ? 'is-done' : ''}>
      <div><p lang="en">{item.front}</p>{item.back && <small lang="ko">{item.back}</small>}</div>
      <div className="rpt-list-actions">
        <button type="button" className="button" onClick={() => void hearNative(item.front)}><Volume2 size={15}/>{c.native}</button>
        <button type="button" className="button" disabled={!take?.url} onClick={() => hear(take?.url)}><Play size={15}/>{take ? c.mine : c.noTake}</button>
        {canRecord && <button type="button" className="button" onClick={() => begin(position, true)}><RotateCcw size={15}/>{c.rerecord}</button>}
      </div>
    </li>;})}</ol>
    {canRecord && !complete && <div className="rpt-bar"><button type="button" className="button primary" onClick={() => begin(Math.max(0, cards.findIndex(item => !takes[item.id])))}><Mic size={17}/>{c.continue}</button></div>}
  </section>;

  const firstMissing = cards.findIndex(item => !takes[item.id]);
  return <section className="rpt-page">
    <div className="rpt-top">{exit}</div>
    {preview && <p className="rpt-preview">{c.preview}</p>}
    <header className="rpt-head"><h1>{c.title} <span className="rpt-required">{c.required}</span></h1><span className="rpt-count">{fill(c.progress, {done, total: cards.length})}</span></header>
    <p className="rpt-sub">{title}</p>
    <p className="rpt-intro">{c.intro}</p>
    {!canRecord && <p className="rpt-alert" role="status">{c.closed}</p>}
    <div className="rpt-speed"><label htmlFor="rpt-speed">{locale === 'ko' ? '재생 속도' : 'Speed'}</label><select id="rpt-speed" value={speed} onChange={event => {const value = Number(event.target.value); setSpeed(value); try {localStorage.setItem(SPEED_KEY, String(value));} catch {}}}>{SPELL_SPEEDS.map(rate => <option key={rate} value={rate}>{rate.toFixed(1)}×</option>)}</select></div>
    <div className="rpt-bar rpt-start">
      {canRecord && !complete && <button type="button" className="button primary" onClick={() => begin(Math.max(0, firstMissing))}><Mic size={18}/>{done ? c.continue : c.start}</button>}
      {canRecord && done > 0 && <button type="button" className="button" onClick={() => begin(0)}><RotateCcw size={16}/>{c.restart}</button>}
      {done > 0 && <button type="button" className="button" onClick={() => setView('list')}>{c.listTitle}</button>}
    </div>
    {complete && footer}
  </section>;
}
