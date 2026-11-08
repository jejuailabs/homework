'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {Timer} from 'lucide-react';
import {buildPairTiles, formatGameTime, isPair, PAIR_PENALTY_MS, pairTime, type PairTile} from '@/lib/cards-games';
import type {GameProps} from './home';
import {GameFrame, GameResult, gameRandom, SoundToggle, useGameCopy, useGameSound, useRecordSave} from './shared';
import {CardIllustration} from '@/components/card-illustration';

type Round = {tiles: PairTile[]; done: string[]; picked: string | null; wrong: string[]; mistakes: number; startedAt: number | null; finishedMs: number | null};
const newRound = (props: GameProps): Round => ({tiles: buildPairTiles(props.distribution.snapshot.cards, gameRandom) ?? [], done: [], picked: null, wrong: [], mistakes: 0, startedAt: null, finishedMs: null});

/** 짝 맞추기. The clock starts on the first tap; a wrong pick adds a little time and nothing else. */
export function PairGame(props: GameProps) {
  const {distributionId, distribution, boards, setBoards} = props, {c, fill} = useGameCopy(), sound = useGameSound();
  const cardsById = useMemo(() => new Map(distribution.snapshot.cards.map(card => [card.id, card])), [distribution.snapshot.cards]);
  const [round, setRound] = useState(() => newRound(props)), [now, setNow] = useState(0), [notice, setNotice] = useState('');
  const save = useRecordSave(distributionId, 'pair', setBoards), wrongTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pairs = round.tiles.length / 2, finished = round.finishedMs !== null;
  useEffect(() => {
    if (round.startedAt === null || finished) return;
    const tick = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(tick);
  }, [round.startedAt, finished]);
  useEffect(() => () => clearTimeout(wrongTimer.current), []);
  function pick(tile: PairTile) {
    if (finished || round.done.includes(tile.cardId) || round.wrong.length) return;
    const startedAt = round.startedAt ?? performance.now();
    if (!round.picked || round.picked === tile.key) {setRound({...round, startedAt, picked: round.picked === tile.key ? null : tile.key}); setNow(performance.now()); return;}
    const first = round.tiles.find(item => item.key === round.picked)!;
    if (isPair(first, tile)) {
      const done = [...round.done, tile.cardId], over = done.length === pairs, elapsed = Math.round(performance.now() - startedAt);
      sound.play(over ? 'end' : 'good'); setNotice(c.matched);
      setRound({...round, startedAt, done, picked: null, finishedMs: over ? elapsed : null});
      if (over) save.save({pairs, elapsedMs: elapsed, mistakes: round.mistakes});
      return;
    }
    sound.play('bad'); setNotice(`${c.notPair} · +${PAIR_PENALTY_MS / 1000}${c.seconds}`);
    setRound({...round, startedAt, picked: null, wrong: [first.key, tile.key], mistakes: round.mistakes + 1});
    wrongTimer.current = setTimeout(() => setRound(value => ({...value, wrong: []})), 650);
  }
  function again() {save.reset(); setNotice(''); setNow(0); setRound(newRound(props));}
  const elapsed = round.finishedMs ?? (round.startedAt === null ? 0 : Math.max(0, now - round.startedAt)), shown = pairTime(elapsed, round.mistakes);
  return <GameFrame distributionId={distributionId} game="pair" title={distribution.title} tools={<SoundToggle sound={sound}/>}>
    {finished ? <GameResult game="pair" save={save} board={boards.games.pair} shown={boards.rankingsShown} onAgain={again} stats={[{label: c.time, value: `${formatGameTime(shown)}${c.seconds}`}, {label: c.mistakes, value: String(round.mistakes)}]}/> : <>
      <div className="cg-status"><span className="cg-clock" role="timer" aria-label={c.time}><Timer size={16}/>{formatGameTime(shown)}{c.seconds}</span><span>{fill(c.pairLeft, {count: pairs - round.done.length})}</span><span className="cg-muted">{fill(c.penaltyNote, {seconds: PAIR_PENALTY_MS / 1000})}</span></div>
      <p className="cg-muted">{c.pairStart}</p>
      <div className="cg-pair-grid">{round.tiles.map(tile => {
        const done = round.done.includes(tile.cardId), card = cardsById.get(tile.cardId);
        return <button key={tile.key} type="button" className={`cg-tile is-${tile.side} ${round.picked === tile.key ? 'is-picked' : ''} ${round.wrong.includes(tile.key) ? 'is-wrong' : ''} ${done ? 'is-done' : ''}`} aria-pressed={round.picked === tile.key} disabled={done} onClick={() => pick(tile)}>
          <small>{tile.side === 'front' ? c.wordTile : c.meaningTile}</small>
          <span className="cg-pair-content">{tile.side === 'front' && card && <CardIllustration card={card} type={distribution.snapshot.type} variant="tile"/>}<span className="cg-pair-word">{tile.text}</span></span>
        </button>;
      })}</div>
      <p className="cs-sr-only" aria-live="polite">{notice}</p>
    </>}
  </GameFrame>;
}
