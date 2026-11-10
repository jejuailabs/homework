'use client';

import {useState} from 'react';
import Link from 'next/link';
import {ArrowRight, Clock3} from 'lucide-react';
import {CardModeIcon} from '../cards-visuals';
import {CARD_GAMES, pairCount, PAIR_MIN, puzzleCount, rainReady, type CardGame} from '@/lib/cards-games';
import type {CardDistribution} from '@/lib/cards-types';
import {GameError, GameFrame, GameLoading, GameRanking, gameIcon, useGameCopy, useGameData} from './shared';
import {PairGame} from './pair';
import {RainGame} from './rain';
import {PuzzleGame} from './puzzle';
import {CardTestWait} from '../cards-care';

export const gamePlayable = (game: CardGame, distribution: CardDistribution) => {
  const {cards, type} = distribution.snapshot;
  return game === 'pair' ? pairCount(cards) >= PAIR_MIN : game === 'rain' ? rainReady(cards) : puzzleCount(cards, type) > 0;
};

/** /student/cards/[id]/games: the three games, each student's own best, and the class ranking. */
export function StudentCardGames({distributionId}: {distributionId: string}) {
  const {c, record} = useGameCopy(), {distribution, boards, loading, error, load, closed, testing} = useGameData(distributionId), [tab, setTab] = useState<CardGame>('pair');
  if (loading) return <GameLoading/>;
  if (error || !distribution || !boards) return <GameError retry={() => void load()}/>;
  const unavailable = {pair: c.unavailablePair, rain: c.unavailableRain, puzzle: c.unavailablePuzzle};
  // 시험 정답 보호: the cards came back without answers, so the games wait for the test.
  if (testing) return <GameFrame distributionId={distributionId} title={distribution.title}><CardTestWait distributionId={distributionId}/></GameFrame>;
  return <GameFrame distributionId={distributionId} title={distribution.title}>
    {closed && <p className="cs-alert" role="status"><Clock3 size={15}/> {c.locked}</p>}
    <div className="cg-games">{CARD_GAMES.map(game => {
      const playable = gamePlayable(game, distribution) && !closed, best = boards.games[game].best;
      const body = <><span className="cg-icon"><CardModeIcon mode={gameIcon[game]} size={34}/></span><span className="cg-game-copy"><b>{c[game]}</b><small>{gamePlayable(game, distribution) ? c[`${game}Body`] : unavailable[game]}</small><em>{c.myBest} {best ? record(game, best) : c.noRecord}</em></span>{playable && <ArrowRight size={18}/>}</>;
      return playable ? <Link key={game} className="cg-game" href={`/student/cards/${distributionId}/games/${game}`}>{body}</Link> : <div key={game} className="cg-game is-disabled" aria-disabled="true">{body}</div>;
    })}</div>
    <div className="cg-tabs" role="group" aria-label={c.classRanking}>{CARD_GAMES.map(game => <button type="button" key={game} aria-pressed={tab === game} onClick={() => setTab(game)}>{c[game]}</button>)}</div>
    <GameRanking game={tab} board={boards.games[tab]} shown={boards.rankingsShown}/>
  </GameFrame>;
}

/** /student/cards/[id]/games/[game]. */
export function StudentCardGame({distributionId, game}: {distributionId: string; game: CardGame}) {
  const {c} = useGameCopy(), data = useGameData(distributionId);
  if (data.loading) return <GameLoading/>;
  if (data.error || !data.distribution || !data.boards) return <GameError retry={() => void data.load()}/>;
  const props = {distributionId, distribution: data.distribution, boards: data.boards, setBoards: data.setBoards};
  if (data.testing) return <GameFrame distributionId={distributionId} game={game} title={data.distribution.title}><CardTestWait distributionId={distributionId}/></GameFrame>;
  if (data.closed || !gamePlayable(game, data.distribution)) return <GameFrame distributionId={distributionId} game={game} title={data.distribution.title}><p className="cs-alert" role="status">{data.closed ? c.locked : {pair: c.unavailablePair, rain: c.unavailableRain, puzzle: c.unavailablePuzzle}[game]}</p></GameFrame>;
  return game === 'pair' ? <PairGame {...props}/> : game === 'rain' ? <RainGame {...props}/> : <PuzzleGame {...props}/>;
}
export type GameProps = {distributionId: string; distribution: CardDistribution; boards: NonNullable<ReturnType<typeof useGameData>['boards']>; setBoards: ReturnType<typeof useGameData>['setBoards']};
