'use client';
// 카드 개인전 화면. 학생은 자기 순서대로 한 문제씩 풀고 바로 정답을 보며, 교실 화면은 남은 시간과 상위 5명을 보여 준다.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Clock3, Trophy} from 'lucide-react';
import CharacterAvatar from '@/components/character-avatar';
import {useCardsP2Copy} from '@/lib/cards-p2-copy';
import {raceStandings} from './room-machine';
import {roomRequest} from './use-play-room';
import type {PlayRoom, RaceAnswerResult, RaceMiss, RaceView, RoomPlayer, RoomPlayerSummary} from './room-types';
import type {PlayChoice} from './types';

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
export const raceClock = (ms: number) => {const total = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;};
function shuffled(choices: PlayChoice[], seed: string) {
  const hash = (value: string) => {let n = 2166136261; for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619); return n >>> 0;};
  return [...choices].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`));
}
/** The student's own game: fetches the current question, sends one answer at a time and shows the right answer before moving on. */
export function RaceStudent({room, now, viewerKey}: {room: PlayRoom; now: number; viewerKey: string}) {
  const p = useCardsP2Copy();
  const [view, setView] = useState<RaceView | null>(null), [feedback, setFeedback] = useState<{choiceId: string; result: RaceAnswerResult} | null>(null), [sending, setSending] = useState(false), [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const load = useCallback(async () => {
    try {setView(await roomRequest<RaceView>(`rooms/${room.id}/race`)); setError('');}
    catch (cause) {setError((cause as Error).message);}
  }, [room.id]);
  // A new question list only appears while the clock runs; a pause hides it and a resume reloads it.
  useEffect(() => {if (room.status === 'question') void load();}, [room.status, load]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const question = view?.question ?? null, choices = useMemo(() => question ? shuffled(question.choices, `${viewerKey}:${question.round}`) : [], [question, viewerKey]);
  const timeUp = room.status === 'question' && now > room.roundEndsAt;
  async function answer(choiceId: string) {
    if (!view || !question || sending || feedback || timeUp) return;
    setSending(true); setError('');
    try {
      const result = await roomRequest<RaceAnswerResult>(`rooms/${room.id}/race`, {step: view.step, choiceId});
      setFeedback({choiceId, result});
      // Long enough to read the right answer, short enough to keep the race moving.
      timer.current = setTimeout(() => {setFeedback(null); setView(result.next);}, result.correct ? 650 : 1500);
    } catch (cause) {setError((cause as Error).message); void load();}
    finally {setSending(false);}
  }
  const answerLabel = feedback ? question?.choices.find(choice => choice.id === feedback.result.correctChoiceId)?.label ?? '' : '';
  return <div className="play-race">
    <div className="play-room-progress">
      <strong>{view ? fill(p.raceProgress, {step: Math.min(view.step + (question ? 1 : 0), view.total), total: view.total}) : ''}</strong>
      <RaceClockInline room={room} now={now}/>
      {view && <span className="play-room-my-score" aria-live="polite"><Trophy size={18}/><b>{view.score.toLocaleString('ko-KR')}점</b><small>{fill(p.raceCorrect, {n: view.correct})}</small></span>}
    </div>
    <RaceTrack room={room} now={now}/>
    {error && <p role="alert" className="play-room-error">{error}</p>}
    {room.status === 'question' && !view && !error && <p role="status">문제를 펼치고 있어요…</p>}
    {view && !question && <div className="play-room-empty" role="status"><Trophy size={42}/><h2>{p.raceDone}</h2><p>{fill(p.raceCorrect, {n: view.correct})} · {view.score.toLocaleString('ko-KR')}점</p></div>}
    {question && <>
      <h2 className="play-room-question">{question.prompt}</h2>
      <div className="play-room-choices">{choices.map((choice, index) => {
        const right = feedback && choice.id === feedback.result.correctChoiceId, mine = feedback?.choiceId === choice.id;
        return <button key={choice.id} type="button" className={`${mine ? 'is-selected ' : ''}${right ? 'is-correct ' : ''}${mine && !feedback?.result.correct ? 'is-wrong' : ''}`} disabled={sending || !!feedback || timeUp || room.status !== 'question'} onClick={() => void answer(choice.id)}>
          <span className="play-room-choice-symbol" aria-hidden="true">{['□', '△', '○', '◇'][index]}</span><span>{choice.label}</span>{right && <strong>정답</strong>}
        </button>;
      })}</div>
      <p role="status" className={`play-room-answer-state ${feedback ? feedback.result.correct ? 'is-right' : 'is-miss' : ''}`}>{feedback ? feedback.result.correct ? p.raceRight : fill(p.raceWrong, {answer: answerLabel}) : timeUp ? p.raceTimeUp : ''}</p>
    </>}
  </div>;
}
function RaceClockInline({room, now}: {room: PlayRoom; now: number}) {
  const left = room.status === 'question' ? room.roundEndsAt - now : room.status === 'paused' ? room.roundEndsAt - room.pausedAt : 0;
  return <span className="play-race-clock"><Clock3 size={19}/>{raceClock(left)}</span>;
}
function RaceTrack({room, now}: {room: PlayRoom; now: number}) {
  const left = room.status === 'question' ? room.roundEndsAt - now : room.status === 'paused' ? room.roundEndsAt - room.pausedAt : 0;
  return <div className="play-room-time-track" aria-hidden="true"><i style={{width: `${Math.max(0, Math.min(100, left / room.questionMs * 100))}%`}}/></div>;
}

/** Projector: time left, how many finished, and only the top five so nobody near the bottom is put on the board. */
export function RaceHost({room, players, now}: {room: PlayRoom; players: RoomPlayer[]; now: number}) {
  const p = useCardsP2Copy();
  const joined = players.filter(player => room.playerKeys.includes(player.key));
  const board = raceStandings(joined).filter(player => !player.forfeited), done = joined.filter(player => player.answered >= room.roundsTotal).length;
  return <div className="play-race">
    <div className="play-room-progress"><strong>{fill(p.raceFinished, {done, total: joined.filter(player => !player.forfeited).length})}</strong><RaceClockInline room={room} now={now}/></div>
    <RaceTrack room={room} now={now}/>
    <section className="play-race-board" aria-label={p.raceBoard}><h3>{p.raceBoard}</h3><ol>{board.slice(0, 5).map(player => <li key={player.key}>
      <b>{player.place}등</b><CharacterAvatar character={player.character} imageSrc={player.imageSrc} outfit={player.outfit} spaceOutfit={player.spaceOutfit}/>
      <strong>{player.name}</strong><span>{fill(p.raceCorrect, {n: player.raceCorrect ?? 0})}</span><em>{player.score.toLocaleString('ko-KR')}점</em>
      <span className="play-race-bar" aria-label={fill(p.raceProgress, {step: Math.min(player.answered, room.roundsTotal), total: room.roundsTotal})}><i style={{width: `${Math.min(100, player.answered / room.roundsTotal * 100)}%`}}/></span>
    </li>)}</ol>{board.length > 5 && <p className="cards-muted">{fill(p.raceRest, {n: board.length - 5})}</p>}</section>
  </div>;
}

/** Final ranking. Students see the whole list only after the game, the same list as the board. */
export function RaceRanking({players}: {players: RoomPlayerSummary[]}) {
  const p = useCardsP2Copy(), ranked = raceStandings(players);
  return <ol aria-label={p.raceRanking}>{ranked.map(member => <li key={member.key} className={member.place > 0 && member.place <= 3 ? 'is-podium' : ''}>
    <b>{member.forfeited ? '기권' : `${member.place}등`}</b><CharacterAvatar character={member.character} imageSrc={member.imageSrc} outfit={member.outfit} spaceOutfit={member.spaceOutfit}/>
    <strong>{member.name}</strong><span>{member.score.toLocaleString('ko-KR')}점 · {fill(p.raceCorrect, {n: member.raceCorrect ?? 0})}{member.forfeited ? ' · 중간에 나옴' : ''}</span>
  </li>)}</ol>;
}

/** The student's own result line and the questions they missed. */
export function RaceStudentResult({room, viewerKey}: {room: PlayRoom; viewerKey: string}) {
  const p = useCardsP2Copy(), me = raceStandings(room.players).find(member => member.key === viewerKey);
  const [misses, setMisses] = useState<RaceMiss[] | null>(null), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {let alive = true; setFailed(false); roomRequest<{misses: RaceMiss[]}>(`rooms/${room.id}/race-misses`).then(data => {if (alive) setMisses(data.misses);}).catch(() => {if (alive) setFailed(true);}); return () => {alive = false;};}, [room.id, attempt]);
  if (!me) return null;
  const answered = me.answered ?? 0, correct = me.raceCorrect ?? 0;
  return <>
    {!me.forfeited && <p className="play-room-my-final">{fill(p.raceMyResult, {place: me.place, score: me.score.toLocaleString('ko-KR'), correct, answered, rate: answered ? Math.round(correct / answered * 100) : 0})}</p>}
    <section className="play-room-review" aria-label={p.raceMisses}><h3>{p.raceMisses}</h3>
      {failed ? <p role="alert">불러오지 못했어요. <button className="button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button></p> : !misses ? <p role="status">불러오는 중이에요</p> : !misses.length ? <p>{p.raceMissesNone}</p> : <ol>{misses.map((miss, index) => <li key={index}><strong>{miss.prompt}</strong><p>{p.raceMissChosen} · <s>{miss.chosen}</s></p><p className="play-room-review-answer">{p.raceMissAnswer} · <b>{miss.answer}</b></p></li>)}</ol>}
    </section>
  </>;
}
