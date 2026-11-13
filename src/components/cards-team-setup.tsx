'use client';
import {useMemo, useRef, useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import type {CardDirection, CardSet} from '@/lib/cards-types';
import {useCardsCopy} from '@/lib/cards-copy';
import {CARD_RACE_SECONDS, CARD_ROOM_SECONDS, CARD_ROOM_TEAMS, CARD_ROOM_VERSUS, cardHuntCapacity, cardRoomCapacity} from '@/modules/playground/cards-room';
import {useCardsP2Copy} from '@/lib/cards-p2-copy';
import {fillCopy} from '@/lib/cards-class-copy';
import '@/styles/cards-p2.css';
import {cardsRequest, CardsDialog} from './cards-shared';
import {CardModeIcon} from './cards-visuals';
import OpenRooms from '@/modules/playground/open-rooms';

/** Opens a live team room or a solo race (개인전) from this set. The server rebuilds the questions itself; nothing here goes to students. */
export default function CardsTeamSetup({set, classId, className, classes = [], onClose}: {set: CardSet; classId: string; className: string; classes?: {id: string; name: string}[]; onClose: () => void}) {
  const {t, locale} = useCardsCopy(), router = useRouter(), p = useCardsP2Copy();
  const [race, setRace] = useState(false), [raceSeconds, setRaceSeconds] = useState(CARD_RACE_SECONDS.initial), [versusPicked, setVersus] = useState<string[]>([]), [typedPicked, setTyped] = useState(false), others = classes.filter(room => room.id !== classId);
  const [direction, setDirection] = useState<CardDirection>('front-back'), [wanted, setWanted] = useState(10), [seconds, setSeconds] = useState(CARD_ROOM_SECONDS.initial), [teamCount, setTeamCount] = useState(CARD_ROOM_TEAMS.initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [roomsRevision, setRoomsRevision] = useState(0);
  // 개인전 is always multiple choice in this class; the team options stay as picked for switching back.
  const versus = race ? [] : versusPicked, typed = !race && typedPicked;
  const pending = useRef<{configuration: string; id: string} | null>(null);
  const choiceCapacity = useMemo(() => cardRoomCapacity(set.cards, direction), [set.cards, direction]), huntCapacity = useMemo(() => cardHuntCapacity(set.cards, direction), [set.cards, direction]);
  const capacity = typed ? {answers: 2, questions: huntCapacity} : choiceCapacity;
  const ready = capacity.answers >= 2 && capacity.questions >= 1, rounds = Math.max(1, Math.min(wanted, capacity.questions));
  async function open(event: FormEvent) {
    event.preventDefault(); if (busy || !ready) return; setBusy(true); setError('');
    // A retry of the same settings reuses its request ID, so a lost response cannot open a second room.
    const configuration = JSON.stringify([set.id, set.version, classId, race, direction, rounds, race ? raceSeconds : seconds, teamCount, versus, typed]);
    if (pending.current?.configuration !== configuration) pending.current = {configuration, id: crypto.randomUUID()};
    try {const room = await cardsRequest<{roomId: string}>('/api/playground/rooms', {method: 'POST', body: JSON.stringify(race ? {mode: 'race', cardSetId: set.id, classId, direction, rounds, seconds: raceSeconds, requestId: pending.current.id} : {mode: 'team', cardSetId: set.id, classId, direction, rounds, seconds, ...(versus.length ? {versusClassIds: [classId, ...versus]} : {teamCount}), ...(typed ? {answer: 'typed'} : {}), requestId: pending.current.id})}); router.push(`/teacher/playground/live/${room.roomId}?from=cards`);}
    catch (cause) {setError(locale === 'ko' && cause instanceof Error ? cause.message : t('error')); setBusy(false); setRoomsRevision(value => value + 1);}
  }
  return <CardsDialog title={`${race ? p.raceTitle : versus.length ? p.versus : t('teamGame')} · ${className}`} closeLabel={t('close')} onClose={() => {if (!busy) onClose();}}><form className="cards-publish" onSubmit={open}>
    <p className="cards-team-intro"><CardModeIcon mode="team" size={40}/><span>{race ? p.raceHint : t('teamGameHint')}</span></p>
    <OpenRooms classId={classId} refresh={roomsRevision} from="cards"/>
    <fieldset className="cards-fieldset" disabled={busy}>
      <div className="cards-team-answer" role="radiogroup" aria-label={p.gameMode}><strong>{p.gameMode}</strong><label className="cards-check"><input type="radio" name="game-mode" checked={!race} onChange={() => setRace(false)}/>{p.modeTeam}</label><label className="cards-check"><input type="radio" name="game-mode" checked={race} onChange={() => setRace(true)}/>{p.modeRace}</label></div>
      {!race && <div className="cards-team-answer" role="radiogroup" aria-label={p.answerMode}><strong>{p.answerMode}</strong><label className="cards-check"><input type="radio" name="answer-mode" checked={!typed} onChange={() => setTyped(false)}/>{p.answerChoice}</label><label className="cards-check"><input type="radio" name="answer-mode" checked={typed} onChange={() => setTyped(true)}/>{p.answerTyped}</label></div>}
      <label>{t('teamDirection')}<select value={direction} onChange={e => setDirection(e.target.value as CardDirection)}><option value="front-back">{t('frontBack')}</option><option value="back-front">{t('backFront')}</option></select></label>
      {ready && <div className="cards-team-options">
        <label>{t('teamQuestions')}<input type="number" required min={1} max={capacity.questions} value={rounds} onChange={e => setWanted(Number(e.target.value))}/></label>
        {race ? <label>{p.raceSeconds}<input type="number" required min={CARD_RACE_SECONDS.min} max={CARD_RACE_SECONDS.max} step={10} value={raceSeconds} onChange={e => setRaceSeconds(Number(e.target.value))}/></label> : <label>{t('teamSeconds')}<input type="number" required min={CARD_ROOM_SECONDS.min} max={CARD_ROOM_SECONDS.max} value={seconds} onChange={e => setSeconds(Number(e.target.value))}/></label>}
        {race ? null : versus.length ? <p className="cards-team-versus-count">{fillCopy(p.versusTeams, {n: versus.length + 1})}</p> : <label>{t('teamCount')}<select value={teamCount} onChange={e => setTeamCount(Number(e.target.value))}>{Array.from({length: CARD_ROOM_TEAMS.max - CARD_ROOM_TEAMS.min + 1}, (_, index) => index + CARD_ROOM_TEAMS.min).map(count => <option key={count} value={count}>{count}</option>)}</select></label>}
      </div>}
      {ready && !race && others.length > 0 && <div className="cards-team-versus"><strong>{p.versusPick}</strong><div>{others.map(room => <label className="cards-check" key={room.id}><input type="checkbox" checked={versusPicked.includes(room.id)} disabled={!versusPicked.includes(room.id) && versusPicked.length >= CARD_ROOM_VERSUS.max - 1} onChange={e => setVersus(current => e.target.checked ? [...current, room.id] : current.filter(item => item !== room.id))}/>{room.name}</label>)}</div><p className="cards-muted">{p.versusHint}</p></div>}
    </fieldset>
    {ready ? <p className="cards-muted">{typed ? p.huntHint : t('teamChoiceOnly')}</p> : <p role="alert" className="cards-error">{t('teamTooFew')}</p>}
    {error && <p role="alert" className="cards-error">{error}</p>}
    <div className="cards-actions cards-dialog-footer"><button className="button primary" disabled={busy || !ready}>{t(busy ? 'teamOpening' : 'teamOpen')}</button></div>
  </form></CardsDialog>;
}
