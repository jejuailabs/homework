'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowRight, Check, Eraser, SkipForward, Timer, Volume2} from 'lucide-react';
import {buildPuzzles, formatGameTime, puzzlePoints, puzzlePrefix, puzzleScore, puzzleSolved, puzzleSpeech, puzzleStart, type PuzzleItem} from '@/lib/cards-games';
import type {GameProps} from './home';
import {GameFrame, GameResult, gameRandom, SoundToggle, useGameCopy, useGameSound, useRecordSave} from './shared';
import {CardIllustration} from '@/components/card-illustration';
import {useSpeech} from '@/components/cards-classroom-shared';

type Feedback = {kind: 'right' | 'wrong' | 'shown'; prefix: number} | null;
type Round = {items: PuzzleItem[]; starts: number[][]; index: number; placed: number[]; wrong: number; results: number[]; feedback: Feedback; startedAt: number; finishedMs: number | null};
function newRound({distribution}: GameProps): Round {
  const items = buildPuzzles(distribution.snapshot.cards, distribution.snapshot.type, gameRandom);
  return {items, starts: items.map(item => puzzleStart(item.chunks, gameRandom)), index: 0, placed: [], wrong: 0, results: [], feedback: null, startedAt: performance.now(), finishedMs: null};
}

/** 문장 퍼즐: the chunk idea from sentence recall, with a score that only shrinks a little per retry. */
export function PuzzleGame(props: GameProps) {
  const {distributionId, distribution, boards, setBoards} = props, {c, fill} = useGameCopy(), sound = useGameSound(), speech = useSpeech();
  const [round, setRound] = useState(() => newRound(props)), [now, setNow] = useState(() => performance.now());
  const save = useRecordSave(distributionId, 'puzzle', setBoards);
  const item = round.items[round.index], start = round.starts[round.index] ?? [], finished = round.finishedMs !== null, settled = round.feedback?.kind === 'right' || round.feedback?.kind === 'shown';
  const illustrationCard = distribution.snapshot.type === 'word' ? distribution.snapshot.cards.find(card => card.id === item?.cardId) : undefined;
  const pool = start.filter(chunk => !round.placed.includes(chunk)), spoken = item ? puzzleSpeech(item.chunks) : '';
  const read = () => {if (spoken && speech.can) speech.speak(spoken, 1);};
  useEffect(() => {if (finished) return; const tick = setInterval(() => setNow(performance.now()), 250); return () => clearInterval(tick);}, [finished]);
  const place = (chunk: number) => {if (!settled) setRound(value => ({...value, placed: [...value.placed, chunk], feedback: value.feedback?.kind === 'wrong' ? null : value.feedback}));};
  const unplace = (chunk: number) => {if (!settled) setRound(value => ({...value, placed: value.placed.filter(other => other !== chunk), feedback: null}));};
  function check() {
    if (!item || settled || round.placed.length !== item.chunks.length) return;
    if (puzzleSolved(item.chunks, round.placed)) {sound.play('good'); read(); setRound({...round, feedback: {kind: 'right', prefix: item.chunks.length}, results: [...round.results, round.wrong]}); return;}
    sound.play('bad'); setRound({...round, wrong: round.wrong + 1, feedback: {kind: 'wrong', prefix: puzzlePrefix(item.chunks, round.placed)}});
  }
  const skip = () => {if (item && !settled) {read(); setRound({...round, placed: item.chunks.map((_, index) => index), feedback: {kind: 'shown', prefix: 0}, results: [...round.results, -1]});}};
  function next() {
    speech.stop();
    if (round.index + 1 < round.items.length) {setRound({...round, index: round.index + 1, placed: [], wrong: 0, feedback: null}); return;}
    const elapsed = Math.round(performance.now() - round.startedAt);
    sound.play('end'); setRound({...round, finishedMs: elapsed}); save.save({results: round.results, elapsedMs: elapsed});
  }
  const keys = useRef({place, unplace, check, next, pool, round, settled});
  useEffect(() => {keys.current = {place, unplace, check, next, pool, round, settled};});
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const k = keys.current, target = event.target as HTMLElement | null;
      if (k.round.finishedMs !== null || event.altKey || event.ctrlKey || event.metaKey || target?.closest?.('input,textarea,select')) return;
      if (/^[1-9]$/.test(event.key)) {const chunk = k.pool[Number(event.key) - 1]; if (chunk !== undefined) {event.preventDefault(); k.place(chunk);}}
      else if (event.key === 'Backspace' && k.round.placed.length) {event.preventDefault(); k.unplace(k.round.placed[k.round.placed.length - 1]);}
      else if (event.key === 'Enter' && !(target instanceof HTMLButtonElement)) {event.preventDefault(); if (k.settled) k.next(); else k.check();}
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  function again() {speech.stop(); save.reset(); setRound(newRound(props));}
  const elapsed = round.finishedMs ?? Math.max(0, now - round.startedAt), solved = round.results.filter(value => value >= 0).length;
  return <GameFrame distributionId={distributionId} game="puzzle" title={distribution.title} tools={<SoundToggle sound={sound}/>}>
    {finished ? <GameResult game="puzzle" save={save} board={boards.games.puzzle} shown={boards.rankingsShown} onAgain={again} stats={[{label: c.score, value: `${puzzleScore(round.results)}${c.points}`}, {label: c.puzzleSolved, value: `${solved} / ${round.items.length}`}, {label: c.time, value: `${formatGameTime(elapsed)}${c.seconds}`}]}/> : item && <>
      <div className="cg-status"><span>{fill(c.puzzleProgress, {current: round.index + 1, total: round.items.length})}</span><span className="cg-clock"><Timer size={16}/>{formatGameTime(elapsed)}{c.seconds}</span><span>{c.score} {puzzleScore(round.results)}</span></div>
      <div className="cg-puzzle">
        <div className="cg-puzzle-heading">{illustrationCard && <CardIllustration card={illustrationCard} type="word" variant="compact"/>}<p className="cg-hint"><small>{c.puzzleHint}</small>{item.hint}</p></div>
        <p className="cg-muted">{c.puzzleArrange}</p>
        <div className={`cg-answer ${round.feedback ? `is-${round.feedback.kind}` : ''}`} aria-label={c.puzzleAnswer}>{round.placed.map((chunk, position) => <button key={chunk} type="button" className={`cg-chunk ${round.feedback?.kind === 'wrong' ? position < round.feedback.prefix ? 'is-ok' : 'is-off' : ''}`} disabled={settled} onClick={() => unplace(chunk)}>{item.chunks[chunk]}</button>)}</div>
        <div className="cg-pool">{pool.map((chunk, position) => <button key={chunk} type="button" className="cg-chunk" disabled={settled} onClick={() => place(chunk)}>{position < 9 && <kbd>{position + 1}</kbd>}{item.chunks[chunk]}</button>)}</div>
        <p className="cg-feedback" role="status">{round.feedback?.kind === 'right' ? `${c.puzzleRight} +${puzzlePoints(round.wrong)}${c.points}` : round.feedback?.kind === 'wrong' ? round.feedback.prefix ? fill(c.puzzleWrong, {count: round.feedback.prefix}) : c.puzzleWrongNone : round.feedback?.kind === 'shown' ? fill(c.puzzleShown, {sentence: item.chunks.join(' ')}) : ''}</p>
        <div className="cs-actions">{settled ? <>{spoken && speech.can && <button type="button" className="button" onClick={read}><Volume2 size={16}/>{c.puzzleListen}</button>}<button className="button primary" autoFocus onClick={next}>{c.puzzleNext}<ArrowRight size={16}/></button></> : <><button type="button" className="button" onClick={skip}><SkipForward size={16}/>{c.puzzleSkip}</button><button type="button" className="button" disabled={!round.placed.length} onClick={() => setRound({...round, placed: [], feedback: null})}><Eraser size={16}/>{c.puzzleClear}</button><button type="button" className="button primary" disabled={round.placed.length !== item.chunks.length} onClick={check}><Check size={16}/>{c.puzzleCheck}</button></>}</div>
        <p className="cg-keys">{c.puzzleKeys}</p>
      </div>
    </>}
  </GameFrame>;
}
