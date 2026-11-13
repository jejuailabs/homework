'use client';

import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {ArrowLeft, Check, CheckCircle2, LoaderCircle, Mic, RefreshCw, Square, Volume2} from 'lucide-react';
import {usePreferences} from './providers';
import {micProblemText, useRecorder, type Take} from '@/modules/speech-studio/recorder';
import {SHADOW_TRIES, SPEAKING_MAX_SECONDS, SPEAKING_STEPS, shadowCheck, speakingCount, speakingGoalSteps, speakingNeed, speakingPercent, speakingStepDone, type SpeakingCounts, type SpeakingRequired, type SpeakingStep, type SpeakingTake, type SpeakingTakes} from '@/lib/cards-speaking';
import {SPELL_SPEEDS} from '@/lib/cards-logic';
import type {CardEntry} from '@/lib/cards-types';
import {speakWithDevice, ttsPlayer} from '@/lib/tts-client';
import ko from '@/messages/cards-speaking-steps-ko.json';
import en from '@/messages/cards-speaking-steps-en.json';
import '@/styles/cards-speaking-steps.css';

/**
 * 스피킹, run the way 클래스카드 runs it: a step picker (6 steps, each 필수 n회 or 자율, with "N% 진행"), then one step at a time over
 * the whole set. 입해석 hides the meaning until the sentence has played, 입영작 hides the English until the student has said it,
 * 집중듣기 plays it, 낭독 and 녹음 record while the sentence plays silently as a pace (stopping before half way drops the take),
 * and 쉐도잉 plays the sentence, then listens with the browser's speech recognition while it paces silently again (3 tries).
 * A sentence counts once per finished round; it is done in a step when its count reaches the step's need.
 */
export type SpeakingStudioProps = {
  title: string; cards: CardEntry[]; required: SpeakingRequired; counts: SpeakingCounts; canRecord: boolean; takes: SpeakingTakes; aloud: SpeakingTakes;
  /** Adds one to the step's count for a card and returns the new counts. Absent in a preview. */
  saveCount?: (step: SpeakingStep, cardId: string) => Promise<SpeakingCounts>;
  /** Uploads a 낭독 or 녹음 take. Absent in a preview. */
  saveTake?: (kind: 'aloud' | 'record', cardId: string, take: Take) => Promise<SpeakingTake>;
  exit: ReactNode; footer?: ReactNode; preview?: boolean;
};
type Copy = typeof ko;
const SPEED_KEY = 'cards-speaking-speed';
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
const hidesEnglish = (step: SpeakingStep) => step === 'comp' || step === 'record';
const records = (step: SpeakingStep): step is 'aloud' | 'record' => step === 'aloud' || step === 'record';
const tipOf: Record<SpeakingStep, keyof Copy> = {read: 'tipRead', comp: 'tipComp', listen: 'tipListen', aloud: 'tipAloud', shadow: 'tipShadow', record: 'tipRecord'};
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
/** How long the sentence takes when no audio length is known: about 0.42 s a word. */
const estimateMs = (text: string, rate: number) => (words(text) * 420 + 700) / rate;

type Native = {play: (text: string, options: {rate: number; muted?: boolean; onProgress?: (part: number) => void}) => Promise<boolean>; stop: () => void};
/** The sentence's voice: the shared TTS audio when there is one, otherwise the device voice (or, muted, a timer of the same length). */
function createNative(): Native {
  let audio: HTMLAudioElement | null = null, timer = 0, finish: ((done: boolean) => void) | null = null;
  function stop() {
    window.clearInterval(timer);
    if (audio) {audio.onended = null; audio.onerror = null; audio.pause(); audio = null;}
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const end = finish; finish = null; end?.(false);
  }
  async function play(text: string, {rate, muted, onProgress}: {rate: number; muted?: boolean; onProgress?: (part: number) => void}) {
    stop();
    const url = await ttsPlayer().link(text, {source: 'cards'}).catch(() => null);
    return new Promise<boolean>(resolve => {
      let over = false;
      const end = (done: boolean) => {if (over) return; over = true; window.clearInterval(timer); if (finish === end) finish = null; if (done) onProgress?.(1); resolve(done);};
      finish = end;
      const paced = () => {
        if (over) return;
        if (audio) {audio.onended = null; audio.onerror = null; audio.pause(); audio = null;}
        if (!muted) speakWithDevice(text, Math.min(2, Math.max(0.5, rate)));
        const total = estimateMs(text, rate), began = Date.now();
        window.clearInterval(timer);
        timer = window.setInterval(() => {const part = (Date.now() - began) / total; onProgress?.(Math.min(1, part)); if (part >= 1) end(true);}, 50);
      };
      if (!url) {paced(); return;}
      const sound = new Audio(url);
      sound.playbackRate = rate; sound.preservesPitch = true; sound.muted = !!muted; audio = sound;
      sound.onended = () => {audio = null; end(true);};
      sound.onerror = paced;
      sound.play().then(() => {timer = window.setInterval(() => {if (sound.duration) onProgress?.(Math.min(1, sound.currentTime / sound.duration));}, 50);}).catch(paced);
    });
  }
  return {play, stop};
}

type Recognition = {start: () => void; stop: () => void; abort: () => void; lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; onresult: ((event: {resultIndex: number; results: ArrayLike<ArrayLike<{transcript: string}> & {isFinal: boolean}>}) => void) | null; onerror: ((event: {error: string}) => void) | null; onend: (() => void) | null};
const recognitionClass = () => typeof window === 'undefined' ? undefined : (window as unknown as {SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition}).SpeechRecognition ?? (window as unknown as {webkitSpeechRecognition?: new () => Recognition}).webkitSpeechRecognition;

type Phase = 'ready' | 'playing' | 'reveal' | 'starting' | 'recording' | 'saving' | 'shadow-listen' | 'shadow-speak' | 'shadow-check' | 'shadow-result';

export function SpeakingStudio({title, cards, required, counts: initialCounts, canRecord, takes: initialTakes, aloud: initialAloud, saveCount, saveTake, exit, footer, preview}: SpeakingStudioProps) {
  const {locale} = usePreferences(), c: Copy = locale === 'ko' ? ko : en;
  const [counts, setCounts] = useState(initialCounts), [takes, setTakes] = useState(initialTakes), [aloud, setAloud] = useState(initialAloud);
  const [speed, setSpeed] = useState(1), [step, setStep] = useState<SpeakingStep | null>(null), [index, setIndex] = useState(0), [finished, setFinished] = useState(false);
  useEffect(() => {try {const saved = Number(localStorage.getItem(SPEED_KEY)); if (SPELL_SPEEDS.includes(saved)) setSpeed(saved);} catch {}}, []);
  const chooseSpeed = (value: number) => {setSpeed(value); try {localStorage.setItem(SPEED_KEY, String(value));} catch {}};
  const percent = speakingPercent(cards, counts, required), goalSteps = speakingGoalSteps(required), anyRequired = SPEAKING_STEPS.some(item => required[item] > 0);

  function open(next: SpeakingStep) {
    const need = speakingNeed(required, next), first = cards.findIndex(card => speakingCount(counts, next, card.id) < need);
    if (first < 0 && !window.confirm(c.reviewAsk)) return;
    setStep(next); setIndex(Math.max(0, first)); setFinished(false);
  }
  if (step) return <SpeakingStepRun key={step} c={c} step={step} title={title} cards={cards} index={index} setIndex={setIndex} counts={counts} setCounts={setCounts} required={required} speed={speed} canRecord={canRecord && !!(saveTake || preview)}
    takes={step === 'aloud' ? aloud : takes} setTake={(cardId, take) => (step === 'aloud' ? setAloud : setTakes)(value => ({...value, [cardId]: take}))} saveCount={saveCount} saveTake={saveTake} preview={preview}
    finished={finished} setFinished={setFinished} onLeave={() => setStep(null)}/>;

  return <section className="spk-page">
    <div className="spk-top">{exit}</div>
    {preview && <p className="spk-preview">{c.preview}</p>}
    <h1 className="spk-title">{title}</h1>
    <div className="spk-speed"><label htmlFor="spk-speed">{c.speed}</label><select id="spk-speed" value={speed} onChange={event => chooseSpeed(Number(event.target.value))}>{SPELL_SPEEDS.map(rate => <option key={rate} value={rate}>{rate.toFixed(1)} ({c.speedUnit})</option>)}</select></div>
    <div className="spk-picker"><p>{anyRequired ? c.pickGoal : c.pickFree}</p><div className="spk-steps">{SPEAKING_STEPS.map(item => {
      const state = speakingStepDone(cards, counts, required, item), done = state.total > 0 && state.done === state.total, need = required[item];
      const bar = need > 0 ? Math.round(state.done * 100 / Math.max(1, state.total)) : Math.round(state.touched * 100 / Math.max(1, state.total));
      return <button key={item} type="button" className={`spk-step ${done ? 'is-done' : ''} ${need > 0 ? 'is-required' : ''} ${anyRequired && !goalSteps.includes(item) ? 'is-extra' : ''}`} onClick={() => open(item)}>
        <strong>{c[item]}</strong><small>{done ? <CheckCircle2 size={15} aria-label="완료"/> : `(${need > 0 ? fill(c.requiredTimes, {n: need}) : c.free})`}</small>
        <span className="spk-step-bar" aria-hidden="true"><span style={{width: `${bar}%`}}/></span>
      </button>;
    })}</div></div>
    {footer}
    <p className="spk-percent">{fill(c.progress, {percent})}</p>
  </section>;
}

type RunProps = {
  c: Copy; step: SpeakingStep; title: string; cards: CardEntry[]; index: number; setIndex: (value: number) => void; counts: SpeakingCounts; setCounts: (value: SpeakingCounts | ((value: SpeakingCounts) => SpeakingCounts)) => void;
  required: SpeakingRequired; speed: number; canRecord: boolean; takes: SpeakingTakes; setTake: (cardId: string, take: SpeakingTake) => void;
  saveCount?: SpeakingStudioProps['saveCount']; saveTake?: SpeakingStudioProps['saveTake']; preview?: boolean; finished: boolean; setFinished: (value: boolean) => void; onLeave: () => void;
};

function SpeakingStepRun({c, step, title, cards, index, setIndex, counts, setCounts, required, speed, canRecord, takes, setTake, saveCount, saveTake, preview, finished, setFinished, onLeave}: RunProps) {
  const need = speakingNeed(required, step), card = cards[Math.min(index, cards.length - 1)], count = card ? speakingCount(counts, step, card.id) : 0, done = count >= need;
  const [phase, setPhase] = useState<Phase>('ready'), [progress, setProgress] = useState(0), [shown, setShown] = useState(false), [notice, setNotice] = useState(''), [failed, setFailed] = useState<null | (() => void)>(null);
  const [shadow, setShadow] = useState<{attempt: number; heard: string; result: '' | 'perfect' | 'pass' | 'miss' | 'silent'}>({attempt: 0, heard: '', result: ''}), [noRecognition, setNoRecognition] = useState(false), [withoutCheck, setWithoutCheck] = useState(false);
  const [localTakes, setLocalTakes] = useState<Record<string, string>>({});
  const native = useMemo(() => typeof window === 'undefined' ? null : createNative(), []), listRef = useRef<HTMLOListElement>(null), pace = useRef({part: 0}), recognition = useRef<Recognition | null>(null), alive = useRef(true);
  const cardRef = useRef(card); cardRef.current = card;
  const recordRate = Math.min(speed, 1) * 0.75;

  const recorder = useRecorder(take => void submit(take), SPEAKING_MAX_SECONDS);
  useEffect(() => {alive.current = true; return () => {alive.current = false; native?.stop(); recognition.current?.abort();};}, [native]);
  useEffect(() => {setNoRecognition(step === 'shadow' && !recognitionClass());}, [step]);
  // The sentence after the next one is fetched ahead, so its voice starts at once.
  useEffect(() => {for (const item of cards.slice(index, index + 2)) ttsPlayer().prefetch(item.front, {source: 'cards'});}, [cards, index]);
  // The current sentence sits a third of the way down the screen, as the student works down the paragraph.
  useEffect(() => {const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`); row?.scrollIntoView?.({block: 'center', behavior: 'smooth'});}, [index]);

  function reset() {native?.stop(); recognition.current?.abort(); setPhase('ready'); setProgress(0); setShown(false); setNotice(''); setShadow({attempt: 0, heard: '', result: ''});}
  function go(next: number) {
    if (recorder.state === 'recording') recorder.stop(true);
    reset();
    if (next >= cards.length) {setFinished(true); return;}
    setIndex(Math.max(0, next));
  }
  /** One finished round of this sentence: count it, then move on when the step's need is met (입영작 moves by itself). */
  async function counted(cardId: string, autoNext: boolean) {
    const before = speakingCount(counts, step, cardId);
    setCounts(value => ({...value, [step]: {...(value[step] ?? {}), [cardId]: (value[step]?.[cardId] ?? 0) + 1}}));
    if (saveCount) {
      const send = async () => {try {const next = await saveCount(step, cardId); if (alive.current) {setCounts(next); setFailed(null);}} catch {if (alive.current) setFailed(() => () => void send());}};
      void send();
    }
    if (autoNext && before + 1 >= need) window.setTimeout(() => {if (alive.current && cardRef.current?.id === cardId) go(index + 1);}, 400);
  }

  async function playNative(muted = false, rate = speed) {
    if (!card || !native) return false;
    setProgress(0);
    return native.play(card.front, {rate, muted, onProgress: part => {pace.current.part = part; setProgress(part);}});
  }
  // 입해석 · 입영작 · 집중듣기
  async function runPlain() {
    if (!card) return;
    // 입해석: the next press (during or after the sentence) shows the meaning and finishes the round.
    if (step === 'read' && (phase === 'playing' || phase === 'reveal')) {native?.stop(); setShown(true); setPhase('ready'); await counted(card.id, false); return;}
    setPhase('playing'); setShown(false);
    const ended = await playNative();
    if (!alive.current || cardRef.current?.id !== card.id) return;
    if (step === 'read') {if (ended) setPhase('reveal'); return;}
    setPhase('ready');
    if (ended) await counted(card.id, step === 'comp');
  }
  // 낭독 · 녹음: record while the sentence plays silently at 0.75× (no faster than 1×) as the pace.
  async function runRecord() {
    if (!card || !canRecord) return;
    setNotice(''); setPhase('starting');
    await recorder.start();
  }
  useEffect(() => {
    if (!records(step) || recorder.state !== 'recording' || phase !== 'starting') return;
    setPhase('recording'); pace.current.part = 0;
    void playNative(true, recordRate).then(ended => {if (ended && alive.current && recorder.state === 'recording') recorder.stop();});
  }, [recorder.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // A blocked or missing microphone ends the try.
  useEffect(() => {if ((recorder.problem || recorder.error) && (phase === 'starting' || phase === 'recording')) {native?.stop(); setPhase('ready');}}, [recorder.problem, recorder.error]); // eslint-disable-line react-hooks/exhaustive-deps
  function stopRecording() {
    native?.stop();
    if (pace.current.part < 0.5) {recorder.stop(true); setPhase('ready'); setNotice(c.tooShort); return;}
    recorder.stop();
  }
  async function submit(take: Take) {
    const target = cardRef.current;
    if (!target || !records(step)) return;
    setPhase('saving');
    const send = async () => {
      try {
        if (saveTake) {const saved = await saveTake(step, target.id, take); if (!alive.current) return; setTake(target.id, saved);}
        else setLocalTakes(value => ({...value, [target.id]: take.url}));
        setFailed(null); setPhase('ready');
        const before = speakingCount(counts, step, target.id);
        await counted(target.id, false);
        // When the need is met, the student hears their own take straight away.
        if (before + 1 >= need) window.setTimeout(() => {if (alive.current) playMine(target.id, take.url);}, 300);
      } catch {if (alive.current) {setPhase('ready'); setNotice(c.saveFailed); setFailed(() => () => void send());}}
    };
    await send();
  }
  const mineUrl = (cardId: string) => localTakes[cardId] ?? takes[cardId]?.url;
  const mine = useRef<HTMLAudioElement | null>(null);
  function playMine(cardId = card?.id ?? '', fallback?: string) {
    const url = fallback ?? mineUrl(cardId);
    if (!url) return;
    native?.stop(); mine.current?.pause();
    const audio = new Audio(url); mine.current = audio; void audio.play().catch(() => undefined);
  }
  // 쉐도잉: hear it, then say it while it paces silently; the browser's recognition is checked word by word.
  async function runShadow(attempt = shadow.attempt, replay = true) {
    if (!card) return;
    setNotice('');
    if (replay) {
      setPhase('shadow-listen');
      const ended = await playNative(false, speed);
      if (!ended || !alive.current || cardRef.current?.id !== card.id) {if (alive.current) setPhase('ready'); return;}
    }
    const Klass = withoutCheck ? undefined : recognitionClass();
    let heard = '';
    if (Klass) {
      const listen = new Klass(); recognition.current = listen;
      listen.lang = 'en-US'; listen.continuous = true; listen.interimResults = true; listen.maxAlternatives = 5;
      listen.onresult = event => {heard = Array.from({length: event.results.length}, (_, i) => event.results[i][0]?.transcript ?? '').join(' ');};
      listen.onerror = () => undefined;
      try {listen.start();} catch {}
    }
    await new Promise(resolve => window.setTimeout(resolve, 350));
    setPhase('shadow-speak');
    const ended = await playNative(true, speed * 0.75);
    if (!ended || !alive.current || cardRef.current?.id !== card.id) {recognition.current?.abort(); if (alive.current) setPhase('ready'); return;}
    if (!Klass) {setPhase('ready'); setShadow({attempt: 0, heard: '', result: ''}); await counted(card.id, false); return;}
    setPhase('shadow-check');
    await new Promise(resolve => window.setTimeout(resolve, 1200));
    recognition.current?.stop(); recognition.current = null;
    if (!alive.current || cardRef.current?.id !== card.id) return;
    if (!heard.trim()) {setPhase('shadow-result'); setShadow({attempt, heard: '', result: 'silent'}); return;}
    const check = shadowCheck(card.front, heard, attempt);
    if (check.pass || attempt + 1 >= SHADOW_TRIES) {
      setPhase('shadow-result'); setShadow({attempt: 0, heard, result: check.pass ? 'perfect' : 'pass'});
      await counted(card.id, false);
      return;
    }
    setPhase('shadow-result'); setShadow({attempt: attempt + 1, heard, result: 'miss'});
  }

  function main() {
    if (!card) return;
    if (step === 'shadow') {if (phase === 'ready' || phase === 'shadow-result') void runShadow(shadow.result === 'miss' || shadow.result === 'silent' ? shadow.attempt : 0, !(shadow.result === 'miss' || shadow.result === 'silent')); return;}
    if (records(step)) {if (phase === 'recording') stopRecording(); else if (phase === 'ready') void runRecord(); return;}
    void runPlain();
  }
  function stop() {
    if (phase === 'recording') {stopRecording(); return;}
    native?.stop(); recognition.current?.abort(); if (phase !== 'saving') setPhase('ready');
  }
  const busy = phase !== 'ready' && phase !== 'reveal' && phase !== 'shadow-result';
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || finished) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input,select,textarea,[contenteditable]')) return;
      // A focused button already answers Space itself.
      if (event.code === 'Space' && target?.closest('button')) return;
      if (event.code === 'Space') {event.preventDefault(); if (done && !busy && phase !== 'reveal') go(index + 1); else main(); return;}
      if (event.key === 'Escape') {event.preventDefault(); stop(); return;}
      if (event.key.toLowerCase() === 'r' && done && !busy) {event.preventDefault(); main(); return;}
      if (event.key.toLowerCase() === 'v' && records(step) && !busy) {void playNative(false);}
      if (event.key.toLowerCase() === 'a' && step === 'record') setShown(value => !value);
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });

  const label = c[step];
  if (finished) return <section className="spk-page"><div className="spk-top"><button type="button" className="spk-back" onClick={onLeave}><ArrowLeft size={16}/>{c.stopStudy}</button></div>
    <div className="spk-finish"><CheckCircle2 size={38}/><h2>{fill(c.stepDone, {step: label})}</h2><div className="spk-finish-actions"><button type="button" className="button" onClick={() => {setFinished(false); go(0);}}><RefreshCw size={16}/>{c.again}</button><button type="button" className="button primary" autoFocus onClick={onLeave}>{c.chooseStep}</button></div></div></section>;
  if (!card) return null;

  const live = phase === 'recording' || phase === 'shadow-speak';
  const mainLabel = phase === 'recording' ? c.stop : step === 'read' && phase === 'reveal' ? c.reveal : done ? c.more : need > 1 && count > 0 && !records(step) && step !== 'shadow' ? fill(c.repeat, {n: count + 1}) : fill(c.times, {label, n: count + 1, total: need});
  const rows = step === 'listen' ? [card] : cards;
  return <section className="spk-page spk-run">
    <div className="spk-top"><button type="button" className="spk-back" onClick={() => {stop(); onLeave();}}><ArrowLeft size={16}/>{c.stopStudy}</button>{step === 'listen' && <span className="spk-count">{fill(c.cardOf, {n: index + 1, total: cards.length})}</span>}</div>
    {preview && <p className="spk-preview">{c.preview}</p>}
    <p className="spk-tip"><span>TIP</span>{c[tipOf[step]]}</p>
    {records(step) && <p className="spk-mic-note">{c.micNote}</p>}
    <ol ref={listRef} className={`spk-paragraph ${step === 'listen' ? 'is-single' : ''}`} aria-label={title}>
      {rows.map(item => {
        const position = cards.indexOf(item), active = position === index, itemDone = speakingCount(counts, step, item.id) >= need;
        const englishHidden = hidesEnglish(step) && active && !itemDone && !(step === 'comp' && phase === 'playing') && !(step === 'record' && shown);
        const englishGone = hidesEnglish(step) && !active && !itemDone;
        const koreanHidden = step === 'read' && !itemDone && !(active && shown);
        return <li key={item.id} data-index={position} className={`${active ? 'is-active' : ''} ${itemDone ? 'is-done' : ''}`}>
          <button type="button" className="spk-say" aria-label={c.listenNative} disabled={busy || (hidesEnglish(step) && active && !itemDone && !shown)} onClick={() => {if (!active) {go(position); return;} void playNative(false);}}><Volume2 size={17}/></button>
          <div className="spk-lines" onClick={() => {if (!active && !busy) go(position);}}>
            <p className={`spk-en ${active && (phase === 'playing' || live || phase === 'shadow-listen') ? 'is-playing' : ''}`} lang="en">
              {englishHidden || englishGone ? <span className={`spk-cover ${active ? 'is-active' : ''}`} style={{width: `${Math.min(100, 8 + words(item.front) * 7)}%`}}>{active && (phase === 'recording' || phase === 'playing') && <span className="spk-fill" style={{width: `${Math.round(progress * 100)}%`}}/>}</span> : item.front}
            </p>
            {koreanHidden ? <span className={`spk-cover spk-cover-ko ${active ? 'is-active' : ''}`}>{active && phase === 'playing' && <span className="spk-fill" style={{width: `${Math.round(progress * 100)}%`}}/>}</span> : <p className="spk-ko" lang="ko">{item.back}</p>}
            {active && live && !(englishHidden || englishGone) && <span className="spk-pace" aria-hidden="true"><span style={{width: `${Math.round(progress * 100)}%`}}/></span>}
          </div>
          {itemDone && <Check className="spk-check" size={18} aria-label="완료"/>}
        </li>;
      })}
    </ol>
    {step === 'shadow' && noRecognition && !withoutCheck && <div className="spk-alert" role="status"><p>{c.shadowUnsupported}</p><button type="button" className="button" onClick={() => setWithoutCheck(true)}>{c.shadowWithout}</button></div>}
    {step === 'shadow' && phase !== 'ready' && <p className={`spk-shadow is-${shadow.result || phase}`} role="status">{phase === 'shadow-listen' ? c.shadowListen : phase === 'shadow-speak' ? c.shadowSpeak : phase === 'shadow-check' ? c.shadowChecking : shadow.result === 'perfect' ? c.shadowPerfect : shadow.result === 'pass' ? c.shadowPass : shadow.result === 'silent' ? c.shadowSilent : c.shadowMiss}{shadow.heard && phase === 'shadow-result' && <small>{c.shadowHeard}: “{shadow.heard}”</small>}</p>}
    {recorder.problem && <div className="spk-alert" role="alert"><b>{micProblemText[recorder.problem].title}</b><ul>{micProblemText[recorder.problem].steps.map(item => <li key={item}>{item}</li>)}</ul></div>}
    {recorder.error && <p className="spk-alert" role="alert">{recorder.error}</p>}
    {records(step) && !canRecord && <p className="spk-alert" role="status">{c.noRecord}</p>}
    {notice && <p className="spk-alert" role="status">{notice}</p>}
    {failed && <div className="spk-alert" role="alert"><p>{phase === 'ready' && notice === c.saveFailed ? c.saveFailed : c.countFailed}</p><button type="button" className="button" onClick={() => failed()}><RefreshCw size={16}/>{notice === c.saveFailed ? c.saveRetry : c.countRetry}</button></div>}
    <div className="spk-bar">
      {records(step) && <button type="button" className="button" disabled={busy || !mineUrl(card.id)} onClick={() => playMine()}>{c.listenMine}</button>}
      <span className="spk-main"><button type="button" className={`button ${done && phase === 'ready' ? '' : 'primary'} ${live ? 'is-live' : ''}`} disabled={phase === 'saving' || phase === 'starting' || phase === 'shadow-check' || phase === 'shadow-listen' || (step !== 'read' && phase === 'playing') || (records(step) && !canRecord)} onClick={main}>
        {phase === 'saving' || phase === 'starting' || phase === 'shadow-check' ? <LoaderCircle className="spin" size={17}/> : phase === 'recording' ? <Square size={16}/> : records(step) || step === 'shadow' ? <Mic size={17}/> : null}{phase === 'saving' ? c.saving : mainLabel}
      </button><small>{phase === 'recording' ? 'ESC' : done && !busy && phase !== 'reveal' ? 'R' : 'SPACE'}</small></span>
      {(phase === 'playing' || phase === 'shadow-listen' || phase === 'shadow-speak') && <span className="spk-main"><button type="button" className="button" onClick={stop}><Square size={15}/>{c.stop}</button><small>ESC</small></span>}
      {done && !busy && phase !== 'reveal' && <span className="spk-main"><button type="button" className="button primary" onClick={() => go(index + 1)}>{c.next}</button><small>SPACE</small></span>}
    </div>
    <div className="spk-nav"><button type="button" className="button" disabled={busy || index === 0} onClick={() => go(index - 1)}>{c.prev}</button><small>{c.keys}</small><button type="button" className="button" disabled={busy} onClick={() => go(index + 1)}>{c.next}</button></div>
  </section>;
}
