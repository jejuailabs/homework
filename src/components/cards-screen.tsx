'use client';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, ChevronLeft, ChevronRight, Expand, LoaderCircle, Moon, Pause, Play, RefreshCw, Settings2, Shrink, Shuffle, Volume2, X} from 'lucide-react';
import type {CardEntry} from '@/lib/cards-types';
import {cardRange, shuffled} from '@/lib/cards-classroom';
import AccessGate from './access-gate';
import {CardIllustration, CardIllustrationToggle} from '@/components/card-illustration';
import {faceLabels, FitText, reducedMotion, SPEECH_RATES, typingTarget, useClassroomCopy, useFullscreen, useIdle, useLocalPrefs, useSpeech, useTeacherSet} from './cards-classroom-shared';
import '@/styles/cards-classroom.css';

type Field = 'front' | 'back' | 'example';
const FIELDS: Field[] = ['front', 'back', 'example'], INTERVALS = [3, 5, 8, 10, 15];
const PREFS = {front: true, back: false, example: false, dark: false, interval: 5, rate: 1};

export default function CardsScreen({setId, classId = ''}: {setId: string; classId?: string}) {return <AccessGate role="teacher"><Screen setId={setId} classId={classId}/></AccessGate>;}

/** 전자칠판용 카드 넘기기. 교사 세트를 읽기만 하고 아무것도 저장하지 않는다(화면 취향만 이 기기에 남긴다). */
function Screen({setId, classId}: {setId: string; classId: string}) {
  const {c} = useClassroomCopy(), {set, failed, retry} = useTeacherSet(setId), root = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useLocalPrefs('cards-screen:prefs', PREFS), {can, speak} = useSpeech(), full = useFullscreen(root), toggleFull = full.toggle, idle = useIdle();
  const [from, setFrom] = useState(1), [to, setTo] = useState(0), [shuffleOn, setShuffleOn] = useState(false), [seed, setSeed] = useState(0), [pos, setPos] = useState(0), [revealed, setRevealed] = useState(false), [playing, setPlaying] = useState(false), [panel, setPanel] = useState(false);
  const total = set?.cards.length || 0, range = useMemo(() => cardRange(total, from, to || total), [total, from, to]);
  const order = useMemo(() => shuffleOn ? shuffled(range.indices) : range.indices, [range.indices, shuffleOn, seed]);
  useEffect(() => {setPos(0); setRevealed(false);}, [order]);
  const card: CardEntry | undefined = set?.cards[order[Math.min(pos, order.length - 1)]];
  const present = FIELDS.filter(field => card?.[field]?.trim()), hidden = present.some(field => !prefs[field]), labels = set ? faceLabels(set.type, c) : null;
  const go = useCallback((step: number) => {setPos(current => Math.max(0, Math.min(order.length - 1, current + step))); setRevealed(false);}, [order.length]);
  const flip = useCallback(() => {if (hidden) setRevealed(value => !value);}, [hidden]);
  const say = useCallback(() => {if (card) speak(card.front, prefs.rate);}, [card, speak, prefs.rate]);
  // 자동 넘김: 가린 칸이 있으면 먼저 뒤집고 다음 차례에 넘긴다. 마지막 카드에서 멈춘다.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {if (hidden && !revealed) setRevealed(true); else if (pos >= order.length - 1) setPlaying(false); else go(1);}, prefs.interval * 1000);
    return () => clearTimeout(timer);
  }, [playing, hidden, revealed, pos, order.length, prefs.interval, go]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (typingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      const onButton = event.target instanceof HTMLButtonElement, k = event.key.toLowerCase();
      if (['arrowright', 'pagedown'].includes(k)) go(1); else if (['arrowleft', 'pageup'].includes(k)) go(-1);
      else if (k === 'home') go(-order.length); else if (k === 'end') go(order.length);
      else if ((k === ' ' || k === 'enter') && !onButton) flip(); else if (['arrowup', 'arrowdown'].includes(k)) flip();
      else if (k === 'a') setPlaying(value => !value); else if (k === 's') say(); else if (k === 'f') toggleFull(); else if (k === 'escape' && panel) setPanel(false);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [go, flip, say, toggleFull, order.length, panel]);
  const back = `/teacher/cards/${encodeURIComponent(setId)}${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`;
  const motion = !reducedMotion();
  return <div ref={root} className={`cards-board ${prefs.dark ? 'is-dark' : ''} ${idle && !panel ? 'is-idle' : ''}`}>
    <header className="cards-board-top">
      <Link className="cards-board-icon" href={back} aria-label={c('back')} title={c('back')}><ArrowLeft size={22}/></Link>
      <h1><span>{c('screenTitle')}</span>{set && <strong>{set.title}</strong>}</h1>
      {set && order.length > 0 && <span className="cards-board-counter" aria-live="polite">{c('counter', {n: pos + 1, total: order.length})}</span>}
      <button className="cards-board-icon" aria-pressed={prefs.dark} aria-label={c('darkBoard')} title={c('darkBoard')} onClick={() => setPrefs({dark: !prefs.dark})}><Moon size={21}/></button>
      <button className="cards-board-icon" aria-expanded={panel} aria-label={c('settings')} title={c('settings')} onClick={() => setPanel(!panel)}><Settings2 size={21}/></button>
      {full.supported && <button className="cards-board-icon" aria-label={c(full.on ? 'exitFullscreen' : 'fullscreen')} title={c(full.on ? 'exitFullscreen' : 'fullscreen')} onClick={full.toggle}>{full.on ? <Shrink size={21}/> : <Expand size={21}/>}</button>}
    </header>
    {!set ? <div className="cards-board-state" role="status">{failed ? <><p>{c('loadError')}</p><button className="button" onClick={retry}><RefreshCw size={16}/>{c('retry')}</button></> : <><LoaderCircle className="spin" size={30}/><p>{c('loading')}</p></>}</div>
      : !card ? <div className="cards-board-state"><p>{c('emptySet')}</p><Link className="button" href={back}>{c('back')}</Link></div>
      : <main className="cards-board-stage">
        <div key={`${card.id}:${revealed}`} className={`cards-board-card ${revealed ? 'is-revealed' : ''} ${motion && revealed ? 'is-flipping' : ''}`} onClick={flip} aria-live="polite">
          {(prefs.front || revealed) && (prefs.back || revealed) && set.type === 'word' && <div className="cards-board-illustration"><CardIllustration card={card} type={set.type} variant="compact"/></div>}
          {present.map(field => <section key={field} className={`cards-board-slot is-${field}`}>
            <small>{labels?.[field]}</small>
            {prefs[field] || revealed ? <FitText text={card[field]} min={field === 'example' ? 16 : 22} max={field === 'front' ? 220 : field === 'back' ? 150 : 80}/> : <div className="cards-board-cover">{c('hiddenSlot')}</div>}
          </section>)}
        </div>
      </main>}
    {set && card && <footer className="cards-board-bar">
      <button className="cards-board-nav" disabled={pos === 0} aria-label={c('prev')} title={c('prev')} onClick={() => go(-1)}><ChevronLeft size={34}/></button>
      <div className="cards-board-controls">
        <button className="button" disabled={!hidden} onClick={flip}>{c(revealed ? 'hide' : 'flip')}</button>
        <button className="button" aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={18}/> : <Play size={18}/>}{c(playing ? 'pause' : 'play')}</button>
        <select aria-label={c('interval')} value={prefs.interval} onChange={event => setPrefs({interval: Number(event.target.value)})}>{INTERVALS.map(value => <option key={value} value={value}>{c('seconds', {n: value})}</option>)}</select>
        {can ? <><button className="button" onClick={say}><Volume2 size={18}/>{c('speak')}</button><select aria-label={c('rate')} value={prefs.rate} onChange={event => setPrefs({rate: Number(event.target.value)})}>{SPEECH_RATES.map(value => <option key={value} value={value}>×{value}</option>)}</select></> : null}
      </div>
      <button className="cards-board-nav" disabled={pos >= order.length - 1} aria-label={c('next')} title={c('next')} onClick={() => go(1)}><ChevronRight size={34}/></button>
      <div className="cards-board-progress" aria-hidden="true"><i style={{width: `${(pos + 1) / order.length * 100}%`}}/></div>
    </footer>}
    {panel && set && <aside className="cards-board-panel" aria-label={c('settings')}>
      <div className="cards-board-panel-head"><h2>{c('settings')}</h2><button className="cards-board-icon" aria-label={c('close')} onClick={() => setPanel(false)}><X size={20}/></button></div>
      <CardIllustrationToggle/>
      <fieldset><legend>{c('shownFields')}</legend><div className="cards-board-chips">{FIELDS.map(field => <button key={field} aria-pressed={prefs[field]} onClick={() => {setPrefs({[field]: !prefs[field]}); setRevealed(false);}}>{labels?.[field]}</button>)}</div><p>{c('shownHint')}</p></fieldset>
      <fieldset><legend>{c('range')}</legend><div className="cards-board-range"><label>{c('rangeFrom')}<input type="number" min={1} max={total} value={from} onChange={event => setFrom(Number(event.target.value) || 1)}/></label><label>{c('rangeTo')}<input type="number" min={1} max={total} value={to || total} onChange={event => setTo(Number(event.target.value) || total)}/></label></div><p>{c('rangeNow', {start: range.start, end: range.end, count: range.indices.length})}</p></fieldset>
      <fieldset><legend>{c('shuffle')}</legend><div className="cards-board-chips"><button aria-pressed={shuffleOn} onClick={() => setShuffleOn(!shuffleOn)}><Shuffle size={16}/>{c('shuffle')}</button>{shuffleOn && <button onClick={() => setSeed(value => value + 1)}><RefreshCw size={16}/>{c('shuffleAgain')}</button>}</div></fieldset>
      <fieldset><legend>{c('play')}</legend><p>{c('autoHint')}</p></fieldset>
      {!can && <p>{c('noSpeech')}</p>}
      <p className="cards-board-keys">{c('keysHint')}</p>
    </aside>}
  </div>;
}
