'use client';

import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent} from 'react';
import {Heart, Pause, Play, Square} from 'lucide-react';
import {isCorrectCardAnswer} from '@/lib/cards-logic';
import {GAME_MAX_MS, newRain, rainCap, rainCapped, rainCatch, rainLevel, rainPlayable, rainScore, rainStep, RAIN_LANES, RAIN_LIVES, RAIN_MAX_WORDS, type RainState} from '@/lib/cards-games';
import type {CardDirection, CardEntry} from '@/lib/cards-types';
import type {GameProps} from './home';
import {GameFrame, GameResult, gameRandom, SoundToggle, useGameCopy, useGameSound, useReducedMotion, useRecordSave} from './shared';

type Phase = 'setup' | 'play' | 'done';
const STEP_MAX = 100; // A slow frame or a background tab never jumps the game forward by more than this.

/** 단어 비. Falling cards by default; still cards for reduced motion, with the same timing and scoring. */
export function RainGame(props: GameProps) {
  const {distributionId, distribution, boards, setBoards} = props, {c, fill} = useGameCopy(), sound = useGameSound(), reduced = useReducedMotion();
  const cards = useMemo(() => rainPlayable(distribution.snapshot.cards), [distribution]), byId = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]), ids = useMemo(() => cards.map(card => card.id), [cards]);
  const [phase, setPhase] = useState<Phase>('setup'), [direction, setDirection] = useState<CardDirection>('front-back'), [still, setStill] = useState<boolean | null>(null);
  const [game, setGame] = useState<RainState | null>(null), [paused, setPaused] = useState(false), [answer, setAnswer] = useState(''), [flash, setFlash] = useState<'' | 'hit' | 'wrong'>(''), [lost, setLost] = useState('');
  const state = useRef<RainState | null>(null), last = useRef<number | null>(null), drawn = useRef(0), input = useRef<HTMLInputElement>(null);
  const save = useRecordSave(distributionId, 'rain', setBoards), staticMode = still ?? reduced;
  const prompt = useCallback((card: CardEntry) => direction === 'front-back' ? card.front : card.back, [direction]), expected = useCallback((card: CardEntry) => direction === 'front-back' ? card.back : card.front, [direction]);
  const finish = useCallback((value: RainState) => {
    state.current = value; setGame(value); setPhase('done'); sound.play('end');
    save.save({correct: value.correct, missed: value.missed, elapsedMs: Math.round(value.time), direction, still: staticMode});
  }, [save, sound, direction, staticMode]);
  // The frame loop reads the latest callbacks through a ref, so a re-render never restarts it.
  const live = useRef({finish, play: sound.play, lostText: (card: CardEntry) => fill(c.rainLost, {prompt: prompt(card), answer: expected(card)}), staticMode, ids, byId});
  useEffect(() => {live.current = {finish, play: sound.play, lostText: (card: CardEntry) => fill(c.rainLost, {prompt: prompt(card), answer: expected(card)}), staticMode, ids, byId};});
  useEffect(() => {
    if (phase !== 'play' || paused) {last.current = null; return;}
    let frame = 0;
    const loop = (stamp: number) => {
      const {finish, play, lostText, staticMode, ids, byId} = live.current, before = state.current!, dt = last.current === null ? 0 : Math.min(STEP_MAX, stamp - last.current);
      last.current = stamp;
      const after = rainCap(rainStep(before, dt, ids, gameRandom));
      state.current = after;
      if (after.missedCards.length > before.missedCards.length) {const card = byId.get(after.missedCards[after.missedCards.length - 1]); play('bad'); if (card) setLost(lostText(card));}
      if (after.over) {finish(after); return;}
      // Still cards only need a few redraws a second for their countdown.
      if (!staticMode || stamp - drawn.current > 200 || after.drops.length !== before.drops.length) {drawn.current = stamp; setGame(after);}
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, paused]);
  useEffect(() => {
    if (phase !== 'play') return;
    const onKey = (event: KeyboardEvent) => {if (event.key === 'Escape') {event.preventDefault(); setPaused(value => !value);}};
    const onHide = () => {if (document.hidden) setPaused(true);};
    window.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onHide);
    return () => {window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onHide);};
  }, [phase]);
  useEffect(() => {if (phase === 'play' && !paused) input.current?.focus();}, [phase, paused]);
  useEffect(() => {if (!flash) return; const timer = setTimeout(() => setFlash(''), 450); return () => clearTimeout(timer);}, [flash]);
  function start() {const value = newRain(ids, gameRandom); state.current = value; setGame(value); setAnswer(''); setLost(''); setPaused(false); save.reset(); setPhase('play');}
  function submit(event: FormEvent) {
    event.preventDefault();
    const current = state.current, text = answer.trim();
    if (!current || paused || !text) return;
    const caught = rainCatch(current, cardId => {const card = byId.get(cardId); return !!card && isCorrectCardAnswer(card, direction, text);});
    if (!caught) {setFlash('wrong'); sound.play('bad'); return;}
    const next = rainCap(caught);
    setAnswer(''); setFlash('hit'); sound.play('good');
    if (next.over) {finish(next); return;}
    state.current = next; setGame(next);
  }
  const tools = <SoundToggle sound={sound}/>;
  if (phase === 'setup') return <GameFrame distributionId={distributionId} game="rain" title={distribution.title} tools={tools}><div className="cg-setup">
    <fieldset><legend>{c.direction}</legend>{(['front-back', 'back-front'] as const).map(value => <label key={value}><input type="radio" name="cg-direction" checked={direction === value} onChange={() => setDirection(value)}/>{value === 'front-back' ? c.showFront : c.showBack}</label>)}</fieldset>
    <fieldset><legend>{c.motion}</legend>{[false, true].map(value => <label key={String(value)}><input type="radio" name="cg-motion" checked={staticMode === value} onChange={() => setStill(value)}/>{value ? c.motionStatic : c.motionFall}</label>)}{reduced && still === null && <p className="cg-muted">{c.motionNote}</p>}</fieldset>
    <p className="cg-muted">{c.rainBody} {c.rainKeys}</p>
    <div className="cs-actions"><button className="button primary" onClick={start} autoFocus><Play size={16}/>{c.play}</button></div>
  </div></GameFrame>;
  const value = game!, missedCards = [...new Set(value.missedCards)].map(cardId => byId.get(cardId)).filter((card): card is CardEntry => !!card);
  if (phase === 'done') return <GameFrame distributionId={distributionId} game="rain" title={distribution.title} tools={tools}>
    <GameResult game="rain" save={save} board={boards.games.rain} shown={boards.rankingsShown} onAgain={() => setPhase('setup')} stats={[{label: c.score, value: `${rainScore(value.correct)}${c.points}`}, {label: c.caught, value: String(value.correct)}, {label: c.missed, value: String(value.missed)}]}/>
    {rainCapped(value) && <p className="cg-muted" role="status">{fill(c.rainCapped, {words: RAIN_MAX_WORDS, minutes: GAME_MAX_MS / 60_000})}</p>}
    {missedCards.length > 0 && <section className="cg-missed"><h3>{c.missedList}</h3><ul>{missedCards.map(card => <li key={card.id}><b>{prompt(card)}</b><span>{expected(card)}</span></li>)}</ul></section>}
  </GameFrame>;
  return <GameFrame distributionId={distributionId} game="rain" title={distribution.title} tools={<>{tools}<button type="button" className="icon-button" aria-label={paused ? c.resume : c.pause} title={paused ? c.resume : c.pause} onClick={() => setPaused(!paused)}>{paused ? <Play size={18}/> : <Pause size={18}/>}</button></>}>
    <div className="cg-status"><span className="cg-lives" aria-label={`${c.lives} ${value.lives} / ${RAIN_LIVES}`}>{Array.from({length: RAIN_LIVES}, (_, index) => <Heart key={index} size={16} fill={index < value.lives ? 'currentColor' : 'none'} aria-hidden="true"/>)}</span><span>{c.score} <b>{rainScore(value.correct)}</b></span><span>{c.level} {rainLevel(value.correct)}</span></div>
    <div className={`cg-rain ${staticMode ? 'is-still' : ''} ${paused ? 'is-paused' : ''}`} style={{'--lanes': RAIN_LANES} as CSSProperties}>
      {!paused && value.drops.map(drop => {const card = byId.get(drop.cardId), progress = Math.min(1, (value.time - drop.born) / drop.life); return card && <div key={drop.id} className="cg-drop" style={{'--lane': drop.lane, '--p': progress.toFixed(3)} as CSSProperties}><span>{prompt(card)}</span>{staticMode && <><progress max={1} value={1 - progress} aria-label={c.timeLeft}/><small>{Math.ceil(drop.life * (1 - progress) / 1000)}{c.seconds}</small></>}</div>;})}
      {paused && <div className="cg-paused" role="status"><b>{c.paused}</b><p>{c.pausedNote}</p><div className="cs-actions"><button className="button primary" onClick={() => setPaused(false)}><Play size={16}/>{c.resume}</button><button className="button" onClick={() => finish(state.current!)}><Square size={16}/>{c.quit}</button></div></div>}
    </div>
    <form className={`cg-rain-input ${flash ? `is-${flash}` : ''}`} onSubmit={submit}><label htmlFor="cg-rain-answer" className="cs-sr-only">{c.answerLabel}</label><input ref={input} id="cg-rain-answer" value={answer} onChange={event => setAnswer(event.target.value)} placeholder={c.answerPlaceholder} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="send" disabled={paused} maxLength={200}/><button className="button primary" disabled={paused}>{c.enter}</button></form>
    <p className="cg-feedback" aria-live="polite">{flash === 'wrong' ? c.rainWrong : flash === 'hit' ? c.rainHit : lost}</p>
    <p className="cg-keys">{c.rainKeys}</p>
  </GameFrame>;
}
