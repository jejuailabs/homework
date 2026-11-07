'use client';

import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import Link from 'next/link';
import {ArrowLeft, CheckCircle2, LoaderCircle, RefreshCw, RotateCcw, Trophy, Volume2, VolumeX} from 'lucide-react';
import {usePreferences} from '../providers';
import {cardRequest, CardBuddy} from '../cards-study';
import {CardModeIcon} from '../cards-visuals';
import {setCardSound, useCardSound} from '../cards-care';
import {cardDueState} from '@/lib/cards-logic';
import {formatGameTime, lowerIsBetter, type CardGame, type GameRecord} from '@/lib/cards-games';
import type {CardDistribution} from '@/lib/cards-types';
import type {CardGameBoard} from '@/lib/server/cards-games';
import ko from '@/messages/cards-games-ko.json';
import en from '@/messages/cards-games-en.json';
import '@/styles/cards-games.css';

export type GameBoards = {games: Record<CardGame, CardGameBoard>; rankingsShown: boolean};
type Detail = {distribution: CardDistribution; serverTime?: string; testActive?: unknown};
export const gameRandom = (max: number) => Math.floor(Math.random() * max);
export function useGameCopy() {
  const {locale} = usePreferences(), c = locale === 'ko' ? ko : en;
  const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
  /** Pairs reads as a time, the rest as points. */
  const record = (game: CardGame, value: GameRecord) => lowerIsBetter(game) ? `${formatGameTime(value.score)}${c.seconds}` : `${value.score}${locale === 'ko' ? '' : ' '}${c.points}`;
  return {c, locale, fill, record};
}
export const gameIcon: Record<CardGame, 'pair' | 'rain' | 'puzzle'> = {pair: 'pair', rain: 'rain', puzzle: 'puzzle'};

/** The distribution (cards and deadline) and the class game boards, loaded together. */
export function useGameData(distributionId: string) {
  const [detail, setDetail] = useState<Detail | null>(null), [boards, setBoards] = useState<GameBoards | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {const [found, games] = await Promise.all([cardRequest<Detail>(`/api/cards/distributions/${distributionId}`), cardRequest<GameBoards>(`/api/cards/distributions/${distributionId}/games`)]); setDetail(found); setBoards(games);}
    catch {setError(true);} finally {setLoading(false);}
  }, [distributionId]);
  useEffect(() => {void load();}, [load]);
  const time = Date.parse(detail?.serverTime ?? ''), closed = !!detail && cardDueState(detail.distribution, Number.isFinite(time) ? time : Date.now()) === 'lock';
  return {distribution: detail?.distribution ?? null, boards, setBoards, loading, error, load, closed, testing: !!detail?.testActive};
}
export function GameLoading() {const {c} = useGameCopy(); return <div className="cg-state" role="status"><CardBuddy/><LoaderCircle className="spin" size={22}/><p>{c.loading}</p></div>;}
export function GameError({retry}: {retry: () => void}) {const {c} = useGameCopy(); return <div className="cg-state" role="alert"><p>{c.error}</p><button className="button" onClick={retry}><RefreshCw size={16}/>{c.retry}</button></div>;}

export function GameFrame({distributionId, game, title, tools, children}: {distributionId: string; game?: CardGame; title: string; tools?: ReactNode; children: ReactNode}) {
  const {c} = useGameCopy();
  return <section className="cg-page"><div className="cg-top"><Link className="cs-back" href={game ? `/student/cards/${distributionId}/games` : `/student/cards/${distributionId}`}><ArrowLeft size={16}/>{game ? c.toGames : c.back}</Link>{tools}</div>
    <header className="cg-heading">{game && <span className="cg-icon"><CardModeIcon mode={gameIcon[game]} size={30}/></span>}<div><p>{game ? title : c.games}</p><h1>{game ? c[game] : title}</h1></div></header>{children}</section>;
}

/** 우리 반 순위: the server already trimmed it to the top ten plus this student, with classmates' IDs removed. */
export function GameRanking({game, board, shown}: {game: CardGame; board: CardGameBoard; shown: boolean}) {
  const {c, fill, record} = useGameCopy();
  return <section className="cg-ranking" aria-labelledby={`cg-rank-${game}`}><h3 id={`cg-rank-${game}`}><Trophy size={17}/>{c.classRanking}</h3>
    {!shown ? <p className="cg-muted">{c.rankingHidden}</p> : !board.ranking.length ? <p className="cg-muted">{c.rankingEmpty}</p> : <><ol>{board.ranking.map((row, index) => <li key={`${row.rank}-${index}`} className={row.id ? 'is-me' : ''}><b>{row.rank}</b><span>{row.name}{row.id && <small>{c.me}</small>}</span><strong>{record(game, row)}</strong></li>)}</ol><p className="cg-muted">{c.rankingNote}</p></>}
    {board.best && <p className="cg-mine"><span>{c.myBest}</span><b>{record(game, board.best)}</b>{board.rank && <small>{fill(c.rankOf, {rank: board.rank})}</small>}<small>{fill(c.plays, {count: board.best.plays})}</small></p>}
  </section>;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'rate' | 'refused' | 'closed';
/** Sends one finished round. The request ID is fixed per round, so a retry after a dropped connection is counted once. */
export function useRecordSave(distributionId: string, game: CardGame, onBoards: (boards: GameBoards) => void) {
  const [status, setStatus] = useState<SaveStatus>('idle'), [improved, setImproved] = useState(false);
  const pending = useRef<{requestId: string; body: Record<string, unknown>} | null>(null), boardsRef = useRef(onBoards);
  useEffect(() => {boardsRef.current = onBoards;});
  const send = useCallback(async () => {
    const round = pending.current;
    if (!round) return;
    setStatus('saving');
    try {
      const result = await cardRequest<GameBoards & {improved: boolean}>(`/api/cards/distributions/${distributionId}/games`, {method: 'POST', body: JSON.stringify({requestId: round.requestId, game, ...round.body})});
      setImproved(result.improved); setStatus('saved'); boardsRef.current({games: result.games, rankingsShown: result.rankingsShown});
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setStatus(code === 'GAME_RATE' ? 'rate' : code === 'GAME_RESULT' ? 'refused' : code === 'DUE_CLOSED' ? 'closed' : 'error');
    }
  }, [distributionId, game]);
  const save = useCallback((body: Record<string, unknown>) => {pending.current = {requestId: crypto.randomUUID(), body}; setImproved(false); void send();}, [send]);
  const reset = useCallback(() => {pending.current = null; setStatus('idle'); setImproved(false);}, []);
  return {status, improved, save, retry: send, reset};
}

export function GameResult({game, stats, save, board, shown, onAgain}: {game: CardGame; stats: {label: string; value: string}[]; save: ReturnType<typeof useRecordSave>; board?: CardGameBoard; shown: boolean; onAgain: () => void}) {
  const {c} = useGameCopy(), {status} = save;
  const message = {idle: '', saving: c.saving, saved: save.improved ? c.newBest : c.keepGoing, error: c.saveError, rate: c.saveRate, refused: c.saveRefused, closed: c.saveClosed}[status];
  return <div className="cg-result"><div className="cg-finish"><CardBuddy happy={status === 'saved' && save.improved}/><h2>{c.finishTitle}</h2><dl>{stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>
    <p className={`cg-save is-${status}`} role="status">{status === 'saving' ? <LoaderCircle size={15} className="spin"/> : status === 'saved' ? <CheckCircle2 size={15}/> : null}{message}</p>
    {(status === 'error' || status === 'rate') && <button className="button" onClick={() => void save.retry()}><RefreshCw size={16}/>{c.retrySave}</button>}
    <div className="cs-actions"><button className="button primary" onClick={onAgain} autoFocus><RotateCcw size={16}/>{c.playAgain}</button></div></div>
    {board && <GameRanking game={game} board={board} shown={shown}/>}</div>;
}

/** Effects follow the one 카드놀이 sound setting (off until turned on, remembered on this device); the button here flips it. */
export function useGameSound() {
  const sound = useCardSound(), toggle = useCallback(() => setCardSound({effects: !sound.effects}), [sound.effects]);
  return {on: sound.effects, toggle, play: sound.play};
}
export function SoundToggle({sound}: {sound: ReturnType<typeof useGameSound>}) {
  const {c} = useGameCopy();
  return <button type="button" className="icon-button cg-sound" aria-pressed={sound.on} aria-label={sound.on ? c.soundOn : c.soundOff} title={sound.on ? c.soundOn : c.soundOff} onClick={sound.toggle}>{sound.on ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button>;
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {const query = window.matchMedia?.('(prefers-reduced-motion: reduce)'); if (!query) return; setReduced(query.matches); const change = () => setReduced(query.matches); query.addEventListener('change', change); return () => query.removeEventListener('change', change);}, []);
  return reduced;
}
