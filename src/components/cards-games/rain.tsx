'use client';

import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import {Heart, Pause, Play, Square} from 'lucide-react';
import {buildCardChoices, cardAnswer} from '@/lib/cards-logic';
import {GAME_MAX_MS, newRain, rainCap, rainCapped, rainCatch, rainLevel, rainMiss, rainPlayable, rainScore, rainStep, rainTarget, RAIN_CHOICES, RAIN_LANES, RAIN_LIVES, RAIN_MAX_WORDS, type RainState} from '@/lib/cards-games';
import type {CardEntry} from '@/lib/cards-types';
import type {GameProps} from './home';
import {GameFrame, GameResult, gameRandom, SoundToggle, useGameCopy, useGameSound, useReducedMotion, useRecordSave} from './shared';
import {CardIllustration} from '@/components/card-illustration';

type Phase = 'setup' | 'play' | 'done';
const STEP_MAX = 100; // A slow frame or a background tab never jumps the game forward by more than this.
const TAP_GUARD = 250; // A tap this soon after the choices change was meant for the word before.
const prompt = (card: CardEntry) => card.front, expected = (card: CardEntry) => cardAnswer(card, 'front-back');

/** 단어 비. The word closest to the ground is asked as four choices; still cards for reduced motion, with the same timing and scoring. */
export function RainGame(props: GameProps) {
  const {distributionId, distribution, boards, setBoards} = props, {c, fill} = useGameCopy(), sound = useGameSound(), reduced = useReducedMotion();
  const cards = useMemo(() => rainPlayable(distribution.snapshot.cards), [distribution]), byId = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]), ids = useMemo(() => cards.map(card => card.id), [cards]);
  const [phase, setPhase] = useState<Phase>('setup'), [still, setStill] = useState<boolean | null>(null);
  const [game, setGame] = useState<RainState | null>(null), [paused, setPaused] = useState(false), [flash, setFlash] = useState<'' | 'hit' | 'wrong'>(''), [lost, setLost] = useState('');
  const state = useRef<RainState | null>(null), last = useRef<number | null>(null), drawn = useRef(0), changedAt = useRef(0), choiceBox = useRef<HTMLDivElement>(null);
  const save = useRecordSave(distributionId, 'rain', setBoards), staticMode = still ?? reduced;
  const finish = useCallback((value: RainState) => {
    state.current = value; setGame(value); setPhase('done'); sound.play('end');
    save.save({correct: value.correct, missed: value.missed, elapsedMs: Math.round(value.time), still: staticMode});
  }, [save, sound, staticMode]);
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); setPaused(value => !value); return;}
      if (!event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && /^[1-4]$/.test(event.key)) {event.preventDefault(); chooser.current(Number(event.key) - 1);}
    };
    const onHide = () => {if (document.hidden) setPaused(true);};
    window.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onHide);
    return () => {window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onHide);};
  }, [phase]);
  useEffect(() => {if (!flash) return; const timer = setTimeout(() => setFlash(''), 450); return () => clearTimeout(timer);}, [flash]);
  function start() {const value = newRain(ids, gameRandom); state.current = value; setGame(value); setLost(''); setPaused(false); save.reset(); setPhase('play');}
  const target = game && phase === 'play' && !paused ? rainTarget(game) : null, targetCard = target ? byId.get(target.cardId) : undefined;
  const targetId = target?.id, targetCardId = target?.cardId;
  const choices = useMemo(() => {
    const card = targetCardId ? byId.get(targetCardId) : undefined;
    return card ? buildCardChoices(card, cards, 'front-back', gameRandom, RAIN_CHOICES) ?? [] : [];
  }, [targetId, targetCardId, byId, cards]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {changedAt.current = performance.now();}, [targetId]);
  // On a phone the app header would push the choices off screen, so play starts with them in view.
  useEffect(() => {if (phase === 'play') choiceBox.current?.scrollIntoView({block: 'nearest'});}, [phase]);
  function choose(index: number) {
    const current = state.current, card = targetCard, value = choices[index];
    if (!current || paused || !target || !card || value === undefined || performance.now() - changedAt.current < TAP_GUARD || !current.drops.some(drop => drop.id === target.id)) return;
    const right = value === expected(card), changed = right ? rainCatch(current, cardId => cardId === card.id) : rainMiss(current, target.id);
    if (!changed) return;
    const next = rainCap(changed);
    setFlash(right ? 'hit' : 'wrong'); sound.play(right ? 'good' : 'bad');
    if (!right) setLost(fill(c.rainWrong, {prompt: prompt(card), answer: expected(card)}));
    if (next.over) {finish(next); return;}
    state.current = next; setGame(next);
  }
  const chooser = useRef(choose);
  useEffect(() => {chooser.current = choose;});
  const tools = <SoundToggle sound={sound}/>;
  if (phase === 'setup') return <GameFrame distributionId={distributionId} game="rain" title={distribution.title} tools={tools}><div className="cg-setup">
    <fieldset><legend>{c.motion}</legend>{[false, true].map(value => <label key={String(value)}><input type="radio" name="cg-motion" checked={staticMode === value} onChange={() => setStill(value)}/>{value ? c.motionStatic : c.motionFall}</label>)}{reduced && still === null && <p className="cg-muted">{c.motionNote}</p>}</fieldset>
    <p className="cg-muted">{c.rainBody}</p>
    <div className="cs-actions"><button className="button primary" onClick={start} autoFocus><Play size={16}/>{c.play}</button></div>
  </div></GameFrame>;
  const value = game!, missedCards = [...new Set(value.missedCards)].map(cardId => byId.get(cardId)).filter((card): card is CardEntry => !!card);
  if (phase === 'done') return <GameFrame distributionId={distributionId} game="rain" title={distribution.title} tools={tools}>
    <GameResult game="rain" save={save} board={boards.games.rain} shown={boards.rankingsShown} onAgain={() => setPhase('setup')} stats={[{label: c.score, value: `${rainScore(value.correct)}${c.points}`}, {label: c.caught, value: String(value.correct)}, {label: c.missed, value: String(value.missed)}]}/>
    {rainCapped(value) && <p className="cg-muted" role="status">{fill(c.rainCapped, {words: RAIN_MAX_WORDS, minutes: GAME_MAX_MS / 60_000})}</p>}
    {missedCards.length > 0 && <section className="cg-missed"><h3>{c.missedList}</h3><ul>{missedCards.map(card => <li key={card.id}><b className="cg-missed-word"><CardIllustration card={card} type={distribution.snapshot.type} variant="thumb"/><span>{prompt(card)}</span></b><span>{expected(card)}</span></li>)}</ul></section>}
  </GameFrame>;
  return <GameFrame distributionId={distributionId} game="rain" title={distribution.title} tools={<>{tools}<button type="button" className="icon-button" aria-label={paused ? c.resume : c.pause} title={paused ? c.resume : c.pause} onClick={() => setPaused(!paused)}>{paused ? <Play size={18}/> : <Pause size={18}/>}</button></>}>
    <div className="cg-status"><span className="cg-lives" aria-label={`${c.lives} ${value.lives} / ${RAIN_LIVES}`}>{Array.from({length: RAIN_LIVES}, (_, index) => <Heart key={index} size={16} fill={index < value.lives ? 'currentColor' : 'none'} aria-hidden="true"/>)}</span><span>{c.score} <b>{rainScore(value.correct)}</b></span><span>{c.level} {rainLevel(value.correct)}</span></div>
    <div className={`cg-rain ${staticMode ? 'is-still' : ''} ${paused ? 'is-paused' : ''}`} style={{'--lanes': RAIN_LANES} as CSSProperties}>
      {!paused && value.drops.map(drop => {const card = byId.get(drop.cardId), progress = Math.min(1, (value.time - drop.born) / drop.life); return card && <div key={drop.id} className={`cg-drop ${drop.id === target?.id ? 'is-target' : ''}`} style={{'--lane': drop.lane, '--p': progress.toFixed(3)} as CSSProperties}><span>{prompt(card)}</span>{staticMode && <><progress max={1} value={1 - progress} aria-label={c.timeLeft}/><small>{Math.ceil(drop.life * (1 - progress) / 1000)}{c.seconds}</small></>}</div>;})}
      {paused && <div className="cg-paused" role="status"><b>{c.paused}</b><p>{c.pausedNote}</p><div className="cs-actions"><button className="button primary" onClick={() => setPaused(false)}><Play size={16}/>{c.resume}</button><button className="button" onClick={() => finish(state.current!)}><Square size={16}/>{c.quit}</button></div></div>}
    </div>
    <div ref={choiceBox} className={`cg-choices ${flash === 'wrong' ? 'is-wrong' : ''}`} role="group" aria-label={targetCard ? fill(c.choices, {prompt: prompt(targetCard)}) : c.choicesWaiting}>{Array.from({length: RAIN_CHOICES}, (_, index) => choices[index]).map((choice, index) => <button key={index} type="button" className="cg-choice" disabled={choice === undefined} onClick={() => choose(index)}><kbd>{index + 1}</kbd><span>{choice ?? '\u00a0'}</span></button>)}</div>
    <p className="cg-feedback" aria-live="polite">{flash === 'hit' ? c.rainHit : lost}</p>
    <p className="cg-keys">{c.rainKeys}</p>
  </GameFrame>;
}
