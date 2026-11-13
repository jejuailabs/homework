'use client';
import {useEffect, useState} from 'react';
import {Trophy} from 'lucide-react';
import {CARD_GAMES, formatGameTime, lowerIsBetter, type CardGame} from '@/lib/cards-games';
import type {CardGameBoard} from '@/lib/server/cards-games';
import {cardsRequest} from './cards-shared';

type Boards = {games: Record<CardGame, CardGameBoard>};
const names: Record<CardGame, [string, string]> = {pair: ['짝 맞추기', 'Pairs'], rain: ['단어 비', 'Word rain'], puzzle: ['문장 퍼즐', 'Sentence puzzle']};

/** 선생님 리포트: 복습 게임 학생별 최고 기록. 선생님이 읽으면 서버가 순위 스위치와 상관없이 반 전체 기록을 준다. */
export function CardsGameScores({distributionId, locale}: {distributionId: string; locale: string}) {
  const ko = locale === 'ko', [boards, setBoards] = useState<Boards | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true; setBoards(null); setFailed(false);
    cardsRequest<Boards>(`/api/cards/distributions/${encodeURIComponent(distributionId)}/games`).then(data => {if (alive) setBoards(data);}).catch(() => {if (alive) setFailed(true);});
    return () => {alive = false;};
  }, [distributionId]);
  const record = (game: CardGame, score: number) => lowerIsBetter(game) ? `${formatGameTime(score)}${ko ? '초' : 's'}` : `${score}${ko ? '점' : ' pts'}`;
  const students = new Map<string, {name: string; games: Partial<Record<CardGame, {score: number; rank: number}>>}>();
  if (boards) for (const game of CARD_GAMES) for (const row of boards.games[game]?.ranking ?? []) {
    const entry = students.get(row.id) ?? {name: row.name, games: {}};
    entry.games[game] = {score: row.score, rank: row.rank}; students.set(row.id, entry);
  }
  const rows = [...students.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'ko', {numeric: true}));
  return <section className="cards-game-scores" aria-labelledby="cards-game-scores-title">
    <h2 id="cards-game-scores-title"><Trophy size={18}/>{ko ? '복습 게임 개인 점수' : 'Review game scores'}</h2>
    <p className="cards-muted">{ko ? '학생마다 게임별 최고 기록이에요. 짝 맞추기는 시간이 짧을수록, 나머지는 점수가 높을수록 좋아요. 성적에는 들어가지 않아요.' : 'Each student\'s best per game. Lower is better for pairs, higher for the others. Not part of grades.'}</p>
    {failed ? <p className="cards-muted" role="alert">{ko ? '게임 기록을 불러오지 못했어요.' : 'Could not load game records.'}</p>
      : !boards ? <p className="cards-muted" role="status">{ko ? '불러오는 중…' : 'Loading…'}</p>
      : !rows.length ? <p className="cards-muted">{ko ? '아직 게임 기록이 없어요.' : 'No game records yet.'}</p>
      : <div className="cards-table-wrap"><table className="cards-report-table"><thead><tr><th>{ko ? '이름' : 'Name'}</th>{CARD_GAMES.map(game => <th key={game}>{names[game][ko ? 0 : 1]}</th>)}</tr></thead>
        <tbody>{rows.map(([id, row]) => <tr key={id}><th scope="row">{row.name}</th>{CARD_GAMES.map(game => {const best = row.games[game]; return <td key={game}>{best ? <>{record(game, best.score)} <small className="cards-muted">{best.rank}{ko ? '위' : 'th'}</small></> : '—'}</td>;})}</tr>)}</tbody></table></div>}
  </section>;
}
