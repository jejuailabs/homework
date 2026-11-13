'use client';

import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {CheckCircle2, LoaderCircle, Mic, Pause, Play, RefreshCw, RotateCcw, Volume2} from 'lucide-react';
import {usePreferences} from './providers';
import {classify, inAppBrowser, micProblemText, toTake, type MicProblem, type Take} from '@/modules/speech-studio/recorder';
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

type Phase = 'listen' | 'record' | 'saving' | 'saved' | 'quiet' | 'paused' | 'failed';
/** A take whose loudest moment stays under this (of full scale) heard nothing worth keeping. */
const QUIET_PEAK = 0.03, SAVED_PAUSE_MS = 1300, QUIET_PAUSE_MS = 1800;
const peakOf = (samples: Float32Array) => {let peak = 0; for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i])); return peak;};

/**
 * The microphone for a whole session. It is asked for inside the 시작 tap (phones refuse or hide a prompt that does not come from a
 * tap), checked once on screen, and kept open from card to card, so each recording starts at once instead of waiting for the
 * microphone to open again. It closes when the student leaves the screen.
 */
function useMicSession() {
  const stream = useRef<MediaStream | null>(null), meter = useRef<{context: AudioContext; frame: number} | null>(null);
  const [problem, setProblem] = useState<MicProblem | null>(null), [level, setLevel] = useState(0), [open, setOpen] = useState(false);
  const close = useCallback(() => {
    if (meter.current) {window.clearInterval(meter.current.frame); void meter.current.context.close().catch(() => undefined); meter.current = null;}
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    setOpen(false); setLevel(0);
  }, []);
  useEffect(() => close, [close]);
  async function start(): Promise<boolean> {
    if (stream.current && stream.current.getAudioTracks().some(track => track.readyState === 'live')) return true;
    setProblem(null);
    if (!window.isSecureContext) {setProblem('insecure'); return false;}
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {setProblem(inAppBrowser() ? 'in-app' : 'unsupported'); return false;}
    try {
      const media = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}, video: false});
      stream.current = media; setOpen(true);
      const AudioCtor = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      if (AudioCtor) {
        const context = new AudioCtor(), analyser = context.createAnalyser(), data = new Uint8Array(512);
        analyser.fftSize = 512; context.createMediaStreamSource(media).connect(analyser);
        void context.resume().catch(() => undefined);
        const tick = () => {analyser.getByteTimeDomainData(data); let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v - 128)); setLevel(Math.min(1, peak / 70));};
        meter.current = {context, frame: window.setInterval(tick, 90)};
      }
      return true;
    } catch (reason) {setProblem(classify(reason)); close(); return false;}
  }
  /** Records the open microphone for `ms`. `cancel` drops the take. */
  function record(ms: number) {
    let cancelled = false, timer = 0, cancelOne = () => {cancelled = true;};
    const media = stream.current;
    const result = new Promise<Blob | null>(resolve => {
      if (!media) {resolve(null); return;}
      const parts: Blob[] = [], recorder = new MediaRecorder(media);
      recorder.ondataavailable = event => {if (event.data.size) parts.push(event.data);};
      recorder.onstop = () => resolve(cancelled || !parts.length ? null : new Blob(parts, {type: recorder.mimeType || 'audio/webm'}));
      recorder.start(250);
      timer = window.setTimeout(() => {if (recorder.state === 'recording') recorder.stop();}, ms);
      cancelOne = () => {cancelled = true; window.clearTimeout(timer); if (recorder.state === 'recording') recorder.stop(); else resolve(null);};
    });
    return {result, cancel: () => cancelOne()};
  }
  return {start, close, record, problem, level, open};
}
export type RepeatProps = {
  title: string; cards: CardEntry[]; takes: SpeakingTakes; canRecord: boolean;
  /** Uploads a take and returns it; absent in the teacher's preview, where takes stay on this screen. */
  saveTake?: (cardId: string, take: Take) => Promise<SpeakingTake>;
  exit: ReactNode; footer?: ReactNode; preview?: boolean;
};

export function SpeakingRepeat({title, cards, takes: initialTakes, canRecord, saveTake, exit, footer, preview}: RepeatProps) {
  const {locale} = usePreferences(), c = locale === 'ko' ? ko : en;
  const [takes, setTakes] = useState<Record<string, {url?: string}>>(initialTakes);
  const [view, setView] = useState<'menu' | 'check' | 'run' | 'list'>('menu'), [index, setIndex] = useState(0), [single, setSingle] = useState(false);
  const [phase, setPhase] = useState<Phase>('listen'), [recordMs, setRecordMs] = useState(0), [failure, setFailure] = useState(''), [speed, setSpeed] = useState(1);
  const player = useRef<HTMLAudioElement | null>(null), run = useRef(0), alive = useRef(true), pending = useRef<{cardId: string; take: Take} | null>(null), stopTimer = useRef(0), recordRun = useRef(-1);
  const indexRef = useRef(index), singleRef = useRef(single); indexRef.current = index; singleRef.current = single;
  const done = cards.filter(card => takes[card.id]).length, complete = cards.length > 0 && done === cards.length;
  useEffect(() => {try {const saved = Number(localStorage.getItem(SPEED_KEY)); if (SPELL_SPEEDS.includes(saved)) setSpeed(saved);} catch {}}, []);
  useEffect(() => {alive.current = true; return () => {alive.current = false; run.current++; player.current?.pause(); window.clearTimeout(stopTimer.current); if ('speechSynthesis' in window) window.speechSynthesis.cancel();};}, []);
  // The next two voices are fetched ahead so each card starts at once.
  useEffect(() => {for (const card of cards.slice(index, index + 3)) ttsPlayer().prefetch(card.front, {source: 'cards'});}, [cards, index]);

  const quiet = useRef(0), mic = useMicSession(), take = useRef<{cancel: () => void} | null>(null), queued = useRef<{at: number; one: boolean} | null>(null), [checked, setChecked] = useState(false), [heard, setHeard] = useState(false), [recordError, setRecordError] = useState('');
  useEffect(() => {if (view === 'check' && mic.level > 0.12) setHeard(true);}, [mic.level, view]);

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
    // Recording starts the moment the voice ends, on the microphone that is already open, for twice the voice's length.
    const length = repeatRecordMs(ms);
    if (!(await mic.start())) {setPhase('failed'); setFailure('mic'); return;}
    if (!alive.current || mine !== run.current) return;
    setRecordMs(length); setPhase('record'); recordRun.current = mine;
    const handle = mic.record(length); take.current = handle;
    const blob = await handle.result;
    if (take.current === handle) take.current = null;
    if (!alive.current || mine !== run.current || !blob) return;
    try {
      const made = await toTake(blob, SPEAKING_MAX_SECONDS);
      if (!alive.current || mine !== run.current) return;
      // Nothing was heard: keep nothing, say so, and run the same card again (after two silent tries, stop and let the student check).
      if (peakOf(made.samples) < QUIET_PEAK) {
        URL.revokeObjectURL(made.url);
        quiet.current += 1;
        if (quiet.current >= 2) {quiet.current = 0; setPhase('failed'); setFailure('quiet'); return;}
        setPhase('quiet');
        await new Promise(resolve => window.setTimeout(resolve, QUIET_PAUSE_MS));
        if (alive.current && mine === run.current) void play(at);
        return;
      }
      quiet.current = 0;
      await keep(made);
    }
    catch (reason) {if (alive.current && mine === run.current) {setRecordError(reason instanceof Error ? reason.message : ''); setPhase('failed'); setFailure('record');}}
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
      // The server has the take: say so for a moment before the next card.
      const mine = run.current;
      setPhase('saved');
      await new Promise(resolve => window.setTimeout(resolve, SAVED_PAUSE_MS));
      if (!alive.current || mine !== run.current) return;
      if (singleRef.current) {setSingle(false); finish(); return;}
      void play(at + 1);
    } catch {if (alive.current) {setPhase('failed'); setFailure('save');}}
  }
  function finish() {run.current++; take.current?.cancel(); mic.close(); setView('list'); setSingle(false);}
  /** From a tap: sound is unlocked and the microphone asked for here; the first time, the student checks the microphone before cards start. */
  async function begin(at: number, one = false) {
    unlockAudio(); setRecordError('');
    const ok = await mic.start();
    if (!ok || !alive.current) return;
    setSingle(one);
    if (!checked) {queued.current = {at, one}; setHeard(false); setView('check'); return;}
    setView('run'); void play(at);
  }
  function confirmMic() {const next = queued.current ?? {at: 0, one: false}; queued.current = null; setChecked(true); setView('run'); void play(next.at);}
  function pause() {
    run.current++; player.current?.pause(); window.clearTimeout(stopTimer.current);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    take.current?.cancel(); take.current = null;
    setPhase('paused');
  }
  function retry() {
    if (failure === 'save' && pending.current) {const saved = pending.current.take; void keep(saved); return;}
    unlockAudio(); void (async () => {if (await mic.start()) void play(indexRef.current);})();
  }
  function hear(url?: string) {if (!url) return; if (!player.current) player.current = new Audio(); const audio = player.current; audio.onended = null; audio.src = url; audio.playbackRate = 1; audio.muted = false; void audio.play().catch(() => undefined);}
  async function hearNative(text: string) {const url = await Promise.race([ttsPlayer().link(text, {source: 'cards'}).catch(() => null), new Promise<null>(resolve => window.setTimeout(() => resolve(null), 5000))]); if (url) hear(url); else if ('speechSynthesis' in window) {window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; window.speechSynthesis.speak(u);}}

  const card = cards[index];
  if (view === 'run' && card) {
    const problem = mic.problem ? micProblemText[mic.problem] : null;
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
          {phase === 'saved' && <><CheckCircle2 size={24}/><b>{c.savedGood}</b></>}
          {phase === 'quiet' && <><Mic size={22}/><b>{c.quietAgain}</b></>}
          {phase === 'paused' && <b>{c.paused}</b>}
        </div>
        {phase === 'record' && <div className="rpt-meter" aria-hidden="true"><span key={`${index}-${recordMs}-${recordRun.current}`} className="is-on" style={{animationDuration: `${recordMs}ms`}}/></div>}
        {phase === 'record' && <div className="rpt-level" aria-hidden="true"><span style={{width: `${Math.round(mic.level * 100)}%`}}/></div>}
      </div>
      {phase === 'failed' && <div className="rpt-alert" role="alert">{problem ? <><b>{problem.title}</b><ul>{problem.steps.map(step => <li key={step}>{step}</li>)}</ul></> : <p>{failure === 'quiet' ? c.quietStop : failure === 'record' ? recordError || c.recordFailed : c.saveFailed}</p>}<button type="button" className="button" onClick={retry}><RefreshCw size={16}/>{c.retry}</button></div>}
      <p className="rpt-note">{c.micNote}</p>
      <div className="rpt-bar">
        {phase === 'paused' || phase === 'failed'
          ? <><button type="button" className="button" onClick={finish}>{c.listTitle}</button>{phase === 'paused' && <button type="button" className="button primary" onClick={() => {unlockAudio(); void (async () => {if (await mic.start()) void play(index);})();}}><Play size={17}/>{c.resume}</button>}</>
          : <button type="button" className="button" disabled={phase === 'saving'} onClick={pause}><Pause size={17}/>{c.pause}</button>}
      </div>
    </section>;
  }

  const micAlert = mic.problem && view !== 'run' && <div className="rpt-alert" role="alert"><b>{micProblemText[mic.problem].title}</b><ul>{micProblemText[mic.problem].steps.map(step => <li key={step}>{step}</li>)}</ul></div>;
  if (view === 'check') return <section className="rpt-page">
    <div className="rpt-top"><span className="rpt-tag">{c.title}</span></div>
    {preview && <p className="rpt-preview">{c.preview}</p>}
    <div className="rpt-card rpt-check">
      <Mic size={34}/>
      <h2>{c.checkTitle}</h2>
      <p>{c.checkBody}</p>
      <div className="rpt-level rpt-level-big" aria-label={c.checkMeter}><span style={{width: `${Math.round(mic.level * 100)}%`}}/></div>
      <p className={`rpt-check-state ${heard ? 'is-ok' : ''}`} role="status">{heard ? c.checkOk : c.checkWaiting}</p>
    </div>
    <div className="rpt-bar"><button type="button" className="button" onClick={() => {mic.close(); setView('menu');}}>{c.checkBack}</button><button type="button" className="button primary" disabled={!heard} onClick={confirmMic}><Play size={17}/>{c.checkStart}</button></div>
    {!heard && <p className="rpt-note">{c.checkHelp}</p>}
  </section>;

  if (view === 'list') return <section className="rpt-page">
    <div className="rpt-top">{exit}</div>
    {preview && <p className="rpt-preview">{c.preview}</p>}
    <header className="rpt-head"><h1>{c.title} <span className="rpt-required">{c.required}</span></h1><span className="rpt-count">{fill(c.progress, {done, total: cards.length})}</span></header>
    {complete && <p className="rpt-done"><CheckCircle2 size={18}/>{c.doneTitle}</p>}
    {micAlert}
    {footer}
    <ol className="rpt-list" aria-label={c.listTitle}>{cards.map((item, position) => {const take = takes[item.id]; return <li key={item.id} className={take ? 'is-done' : ''}>
      <div><p lang="en">{item.front}</p>{item.back && <small lang="ko">{item.back}</small>}</div>
      <div className="rpt-list-actions">
        <button type="button" className="button" onClick={() => void hearNative(item.front)}><Volume2 size={15}/>{c.native}</button>
        <button type="button" className="button" disabled={!take?.url} onClick={() => hear(take?.url)}><Play size={15}/>{take ? c.mine : c.noTake}</button>
        {canRecord && <button type="button" className="button" onClick={() => void begin(position, true)}><RotateCcw size={15}/>{c.rerecord}</button>}
      </div>
    </li>;})}</ol>
    {canRecord && !complete && <div className="rpt-bar"><button type="button" className="button primary" onClick={() => void begin(Math.max(0, cards.findIndex(item => !takes[item.id])))}><Mic size={17}/>{c.continue}</button></div>}
  </section>;

  const firstMissing = cards.findIndex(item => !takes[item.id]);
  return <section className="rpt-page">
    <div className="rpt-top">{exit}</div>
    {preview && <p className="rpt-preview">{c.preview}</p>}
    <header className="rpt-head"><h1>{c.title} <span className="rpt-required">{c.required}</span></h1><span className="rpt-count">{fill(c.progress, {done, total: cards.length})}</span></header>
    <p className="rpt-sub">{title}</p>
    <p className="rpt-intro">{c.intro}</p>
    {!canRecord && <p className="rpt-alert" role="status">{c.closed}</p>}
    {micAlert}
    <div className="rpt-speed"><label htmlFor="rpt-speed">{locale === 'ko' ? '재생 속도' : 'Speed'}</label><select id="rpt-speed" value={speed} onChange={event => {const value = Number(event.target.value); setSpeed(value); try {localStorage.setItem(SPEED_KEY, String(value));} catch {}}}>{SPELL_SPEEDS.map(rate => <option key={rate} value={rate}>{rate.toFixed(1)}×</option>)}</select></div>
    <div className="rpt-bar rpt-start">
      {canRecord && !complete && <button type="button" className="button primary" onClick={() => void begin(Math.max(0, firstMissing))}><Mic size={18}/>{done ? c.continue : c.start}</button>}
      {canRecord && done > 0 && <button type="button" className="button" onClick={() => void begin(0)}><RotateCcw size={16}/>{c.restart}</button>}
      {done > 0 && <button type="button" className="button" onClick={() => setView('list')}>{c.listTitle}</button>}
    </div>
    {complete && footer}
  </section>;
}
