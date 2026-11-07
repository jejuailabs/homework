'use client';
import {useEffect, useState} from 'react';
import {useCardsCopy} from '@/lib/cards-copy';
import {roomRequest} from './use-play-room';
import {roomTeamStickers, type RoomReviewItem, type RoomTeam} from './room-types';

export const teamSticker = (team: number) => `/cards/v1/cards-team-${roomTeamStickers[team]}.svg`;
const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

/** Teams arrive sorted by average score. Teams on the same score share a place. */
export function CardTeamPodium({teams, versus = false}: {teams: RoomTeam[]; versus?: boolean}) {
  const {t} = useCardsCopy();
  return <section className="play-room-podium" aria-label={t('teamPodium')}><img src="/cards/v1/cards-team-podium.svg" width={132} height={132} alt=""/><ol>{teams.map(team => <li key={team.id}><b>{fill(t('teamPlace'), {n: teams.findIndex(other => other.score === team.score) + 1})}</b><img src={teamSticker(team.id)} width={56} height={56} alt=""/><strong style={{color: team.color}}>{versus ? team.name : `${team.name} 팀`}</strong><span>{team.score.toLocaleString('ko-KR', {maximumFractionDigits: 1})}</span></li>)}</ol></section>;
}
/** The review is for the teacher to talk through together, so it stays on the host screen and is never stored or sent anywhere. */
export function CardRoomReview({roomId}: {roomId: string}) {
  const {t} = useCardsCopy(), [items, setItems] = useState<RoomReviewItem[] | null>(null), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {let alive = true; setFailed(false); roomRequest<{review: RoomReviewItem[]}>(`rooms/${roomId}/review`).then(data => {if (alive) setItems(data.review);}).catch(() => {if (alive) setFailed(true);}); return () => {alive = false;};}, [roomId, attempt]);
  return <section className="play-room-review" aria-label={t('teamReviewTitle')}><h3>{t('teamReviewTitle')}</h3>
    {failed ? <p role="alert">{t('error')} <button className="button" onClick={() => setAttempt(value => value + 1)}>{t('retry')}</button></p> : !items ? <p role="status">{t('loading')}</p> : !items.length ? <p>{t('teamReviewClean')}</p> : <ol>{items.map(item => <li key={item.round}><small>{fill(t('teamReviewQuestion'), {n: item.round + 1})}</small><strong>{item.prompt}</strong><p className="play-room-review-answer">{t('teamReviewAnswer')} · <b>{item.answer}</b></p><div className="play-room-review-track" aria-hidden="true"><i style={{width: `${item.wrong / item.total * 100}%`}}/></div><p>{fill(t('teamReviewWrong'), {total: item.total, wrong: item.wrong})}{item.commonWrongCount > 0 && <> · {fill(t('teamReviewCommon'), {choice: item.commonWrong, count: item.commonWrongCount})}</>}</p></li>)}</ol>}
  </section>;
}
