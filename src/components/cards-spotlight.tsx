'use client';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {ArrowLeft, Check, Expand, LoaderCircle, Moon, RefreshCw, RotateCcw, Shrink, Trophy, Volume2, X} from 'lucide-react';
import type {CardEntry} from '@/lib/cards-types';
import {alive, missedCards, newTally, pickNext, recordTurn, shuffled, spotlightDone, spotlightLabel, spotlightRanking, undoTurn, type SpotlightMode, type SpotlightTally} from '@/lib/cards-classroom';
import AccessGate from './access-gate';
import {faceLabels, FitText, reducedMotion, SPEECH_RATES, typingTarget, useClassroomCopy, useFullscreen, useIdle, useLocalPrefs, useSpeech, useTeacherSet} from './cards-classroom-shared';
import {cardsRequest} from './cards-shared';
import {CardModeIcon} from './cards-visuals';
import {CardIllustration} from '@/components/card-illustration';
import '@/styles/cards-classroom.css';

type Classroom = {id: string; name: string; year: number};
type Student = {id: string; number: number; name: string; disabled?: boolean};
type Prompt = 'front' | 'back' | 'speech';
type Turn = {studentId: string; cardIndex: number; revealed: boolean};
const PREFS = {prompt: 'front', mode: 'score', teamCount: 0, rounds: 10, noRepeat: true, showName: false, rate: 1, dark: false};
const TEAM_COLORS = ['#e07a5f', '#3d8b7d', '#5b7fc7', '#c28a2c', '#9a6fc0', '#c4577f'];

export default function CardsSpotlight({setId, classId = ''}: {setId: string; classId?: string}) {return <AccessGate role="teacher"><Spotlight setId={setId} initialClassId={classId}/></AccessGate>;}

/** 지명 퀴즈. 반 명단과 세트를 읽기만 하고, 점수는 이 화면 안에만 둔다(서버 저장 없음). */
function Spotlight({setId, initialClassId}: {setId: string; initialClassId: string}) {
  const {c, locale} = useClassroomCopy(), {set, failed, retry} = useTeacherSet(setId), root = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useLocalPrefs('cards-spotlight:prefs', PREFS), {can, speak} = useSpeech(), full = useFullscreen(root), toggleFull = full.toggle, idle = useIdle();
  const [classes, setClasses] = useState<Classroom[] | null>(null), [classId, setClassId] = useState(initialClassId), [students, setStudents] = useState<Student[] | null>(null), [rosterError, setRosterError] = useState(false), [away, setAway] = useState<string[]>([]);
  const [phase, setPhase] = useState<'setup' | 'play' | 'done'>('setup'), [tally, setTally] = useState<SpotlightTally | null>(null), [used, setUsed] = useState<string[]>([]), [turn, setTurn] = useState<Turn | null>(null), [drawing, setDrawing] = useState<string | null>(null), [newRound, setNewRound] = useState(false);
  const deck = useRef<{order: number[]; next: number}>({order: [], next: 0}), flicker = useRef<ReturnType<typeof setInterval> | null>(null), finishDraw = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {if (flicker.current) clearInterval(flicker.current); if (finishDraw.current) clearTimeout(finishDraw.current);}, []);
  useEffect(() => {
    let alive = true; cardsRequest<{classes: Classroom[]}>('/api/classes').then(data => {
      if (!alive) return; const ordered = data.classes.slice().sort((a, b) => b.year - a.year); setClasses(ordered);
      let remembered = ''; try {remembered = sessionStorage.getItem('homework-current-class') || '';} catch {}
      setClassId(current => ordered.some(room => room.id === current) ? current : ordered.some(room => room.id === remembered) ? remembered : ordered[0]?.id || '');
    }).catch(() => {if (alive) {setClasses([]); setRosterError(true);}}); return () => {alive = false;};
  }, []);
  useEffect(() => {
    if (!classId) return; let alive = true; setStudents(null); setAway([]); setRosterError(false);
    cardsRequest<{students: Student[]}>(`/api/classes/${encodeURIComponent(classId)}/students`).then(data => {if (alive) setStudents(data.students.filter(student => !student.disabled).sort((a, b) => a.number - b.number));}).catch(() => {if (alive) {setStudents([]); setRosterError(true);}});
    return () => {alive = false;};
  }, [classId]);
  const byId = useMemo(() => new Map((students || []).map(student => [student.id, student])), [students]);
  const players = useMemo(() => (students || []).filter(student => !away.includes(student.id)), [students, away]);
  const label = useCallback((id: string) => {const student = byId.get(id); return student ? spotlightLabel(student, prefs.showName, locale) : '?';}, [byId, prefs.showName, locale]);
  const labels = set ? faceLabels(set.type, c) : null, prompt = prefs.prompt as Prompt, mode = prefs.mode as SpotlightMode;
  const rounds = Math.max(1, Math.min(100, prefs.rounds)), card: CardEntry | undefined = turn ? set?.cards[turn.cardIndex] : undefined;
  const question = card ? prompt === 'back' ? card.back : card.front : '', answer = card ? prompt === 'back' ? card.front : prompt === 'speech' ? `${card.front}\n${card.back}` : card.back : '';
  function nextCard() {if (!set) return 0; const state = deck.current; if (state.next >= state.order.length) {state.order = shuffled(set.cards.map((_, index) => index)); state.next = 0;} return state.order[state.next++];}
  function start() {
    if (!set || players.length < 1) return;
    deck.current = {order: [], next: 0}; setTally(newTally(mode, players.map(student => student.id), mode === 'score' ? prefs.teamCount : 0)); setUsed([]); setTurn(null); setNewRound(false); setPhase('play');
  }
  const draw = useCallback(() => {
    if (!tally || drawing || turn || phase !== 'play') return;
    const pool = tally.mode === 'survival' ? alive(tally) : Object.keys(tally.scores), last = tally.turns.at(-1)?.studentId || null;
    const pick = pickNext(pool, used, {noRepeat: prefs.noRepeat, last}); if (!pick.id) return;
    const reveal = () => {if (flicker.current) clearInterval(flicker.current); setDrawing(null); setUsed(pick.used); setNewRound(pick.newRound); const cardIndex = nextCard(); setTurn({studentId: pick.id!, cardIndex, revealed: false}); if (prompt === 'speech' && set) speak(set.cards[cardIndex].front, prefs.rate);};
    if (reducedMotion() || pool.length < 2) {reveal(); return;}
    setDrawing(pool[0]); let index = 0; flicker.current = setInterval(() => {index = (index + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length; setDrawing(pool[index]);}, 90);
    finishDraw.current = setTimeout(reveal, 1300);
  }, [tally, drawing, turn, phase, used, prefs.noRepeat, prefs.rate, prompt, set, speak]); // nextCard reads a ref
  const mark = useCallback((correct: boolean) => {
    if (!tally || !turn || !set) return;
    const next = recordTurn(tally, {studentId: turn.studentId, cardId: set.cards[turn.cardIndex].id, correct}); setTally(next); setTurn(null);
    if (spotlightDone(next, rounds)) setPhase('done');
  }, [tally, turn, set, rounds]);
  const undo = () => {if (tally && !turn) setTally(undoTurn(tally));};
  const toggleAnswer = useCallback(() => setTurn(current => current && {...current, revealed: !current.revealed}), []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (typingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      const k = event.key.toLowerCase(), onButton = event.target instanceof HTMLButtonElement;
      if (k === 'f') toggleFull(); else if (phase !== 'play') return;
      else if (k === 'enter' && !onButton && !turn) draw(); else if (k === ' ' && !onButton && turn) toggleAnswer(); else if (k === 'o' && turn) mark(true); else if (k === 'x' && turn) mark(false); else if (k === 's' && turn && card) speak(card.front, prefs.rate); else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [phase, turn, draw, toggleAnswer, mark, toggleFull, card, speak, prefs.rate]);
  const back = `/teacher/cards/${encodeURIComponent(setId)}${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`;
  const head = <header className="cards-board-top">
    <Link className="cards-board-icon" href={back} aria-label={c('back')} title={c('back')}><ArrowLeft size={22}/></Link>
    <h1><span><CardModeIcon mode="spotlight" size={26}/>{c('spotlightTitle')}</span>{set && <strong>{set.title}</strong>}</h1>
    {phase === 'play' && tally && <span className="cards-board-counter">{mode === 'survival' ? c('alive', {n: alive(tally).length}) : c('questionOf', {n: Math.min(rounds, tally.turns.length + 1), total: rounds})}</span>}
    <button className="cards-board-icon" aria-pressed={prefs.dark} aria-label={c('darkBoard')} title={c('darkBoard')} onClick={() => setPrefs({dark: !prefs.dark})}><Moon size={21}/></button>
    {full.supported && <button className="cards-board-icon" aria-label={c(full.on ? 'exitFullscreen' : 'fullscreen')} title={c(full.on ? 'exitFullscreen' : 'fullscreen')} onClick={toggleFull}>{full.on ? <Shrink size={21}/> : <Expand size={21}/>}</button>}
  </header>;
  const wrap = (body: ReactNode) => <div ref={root} className={`cards-board is-spotlight ${prefs.dark ? 'is-dark' : ''} ${idle && phase === 'play' ? 'is-idle' : ''}`}>{head}{body}</div>;
  if (!set) return wrap(<div className="cards-board-state" role="status">{failed ? <><p>{c('loadError')}</p><button className="button" onClick={retry}><RefreshCw size={16}/>{c('retry')}</button></> : <><LoaderCircle className="spin" size={30}/><p>{c('loading')}</p></>}</div>);
  if (!set.cards.length) return wrap(<div className="cards-board-state"><p>{c('emptySet')}</p><Link className="button" href={back}>{c('back')}</Link></div>);
  const teams = tally?.teams ? Array.from({length: tally.teamCount}, (_, team) => ({team, score: tally.teamScores[team], members: Object.keys(tally.teams!).filter(id => tally.teams![id] === team)})) : [];

  if (phase === 'setup') return wrap(<main className="cards-spot-setup">
    <p className="cards-spot-lead">{c('spotlightHint')}</p>
    <p className="cards-spot-notice" role="note">{c('notSaved')}</p>
    <div className="cards-spot-grid">
      <label>{c('chooseClass')}{classes === null ? <span className="cards-spot-muted">{c('loading')}</span> : classes.length ? <select value={classId} onChange={event => {setClassId(event.target.value); try {sessionStorage.setItem('homework-current-class', event.target.value);} catch {}}}>{classes.map(room => <option key={room.id} value={room.id}>{room.name} · {room.year}</option>)}</select> : <span className="cards-spot-muted">{c('noClass')}</span>}</label>
      <fieldset><legend>{c('prompt')}</legend><div className="cards-board-chips">{(['front', 'back', 'speech'] as Prompt[]).map(value => <button key={value} aria-pressed={prompt === value} disabled={value === 'speech' && !can} onClick={() => setPrefs({prompt: value})}>{value === 'speech' ? c('promptSpeech') : labels?.[value]}</button>)}</div><p>{can ? c('promptHint') : c('noSpeech')}</p></fieldset>
      <fieldset><legend>{c('mode')}</legend><div className="cards-board-chips">{(['score', 'survival'] as SpotlightMode[]).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setPrefs({mode: value})}>{c(value === 'score' ? 'modeScore' : 'modeSurvival')}</button>)}</div><p>{c(mode === 'score' ? 'modeScoreHint' : 'modeSurvivalHint')}</p></fieldset>
      {mode === 'score' && <><label>{c('scoring')}<select value={prefs.teamCount} onChange={event => setPrefs({teamCount: Number(event.target.value)})}><option value={0}>{c('individual')}</option>{[2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{c('teams', {n: count})}</option>)}</select></label><label>{c('rounds')}<input type="number" min={1} max={100} value={prefs.rounds} onChange={event => setPrefs({rounds: Math.max(1, Math.min(100, Number(event.target.value) || 1))})}/></label></>}
      {can && prompt === 'speech' && <label>{c('rate')}<select value={prefs.rate} onChange={event => setPrefs({rate: Number(event.target.value)})}>{SPEECH_RATES.map(value => <option key={value} value={value}>×{value}</option>)}</select></label>}
    </div>
    <label className="cards-spot-check"><input type="checkbox" checked={prefs.noRepeat} onChange={event => setPrefs({noRepeat: event.target.checked})}/>{c('noRepeat')}</label>
    <label className="cards-spot-check"><input type="checkbox" checked={prefs.showName} onChange={event => setPrefs({showName: event.target.checked})}/>{c('showName')}</label>
    <p className="cards-spot-muted">{c('privacyHint')}</p>
    {students === null && classId ? <p className="cards-spot-muted">{c('loading')}</p> : rosterError || !students?.length ? <p className="cards-spot-muted" role="alert">{classes?.length ? c('noStudents') : ''}</p> : <details className="cards-spot-roster"><summary>{c('participants')} · {c('participantsCount', {n: players.length})}</summary><p className="cards-spot-muted">{c('participantsHint')}</p><div className="cards-board-chips">{students.map(student => <button key={student.id} aria-pressed={!away.includes(student.id)} onClick={() => setAway(current => current.includes(student.id) ? current.filter(id => id !== student.id) : [...current, student.id])}>{student.number}. {student.name}</button>)}</div></details>}
    <div className="cards-spot-start"><button className="button primary" disabled={!players.length} onClick={start}>{c('start')}</button><span>{c('participantsCount', {n: players.length})}</span></div>
  </main>);

  if (phase === 'done' && tally) {
    const ranking = spotlightRanking(tally), missed = missedCards(tally), cardById = new Map(set.cards.map(item => [item.id, item]));
    return wrap(<main className="cards-spot-done">
      <h2><Trophy size={30}/>{c('results')}</h2>
      <p className="cards-spot-notice" role="note">{c('notSaved')}</p>
      {teams.length > 0 && <section><h3>{c('teamRanking')}</h3><ol className="cards-spot-teams">{teams.slice().sort((a, b) => b.score - a.score).map(row => <li key={row.team} style={{'--team': TEAM_COLORS[row.team]} as CSSProperties}><strong>{c('team', {n: row.team + 1})}</strong><b>{c('score', {n: row.score})}</b><small>{row.members.map(label).join(', ')}</small></li>)}</ol></section>}
      {mode === 'survival' && <section><h3>{c('survivors')}</h3><div className="cards-spot-survivors">{alive(tally).map(id => <strong key={id}>{label(id)}</strong>)}</div></section>}
      <section><h3>{c('ranking')}</h3><ol className="cards-spot-ranking">{ranking.map(row => <li key={row.id} className={row.out ? 'is-out' : ''}><span>{c('rank', {n: row.rank})}</span><strong>{label(row.id)}</strong><b>{mode === 'score' ? c('score', {n: row.score}) : row.out ? c('out') : ''}</b><small>{row.asked ? c('correctOf', {c: row.correct, n: row.asked}) : c('notAsked')}</small></li>)}</ol></section>
      <section><h3>{c('missed')}</h3>{missed.length ? <ul className="cards-spot-missed">{missed.map(row => {const item = cardById.get(row.cardId); return item && <li key={row.cardId}><strong>{item.front}</strong><span>{item.back}</span><small>{c('wrongTimes', {n: row.wrong})}</small></li>;})}</ul> : <p className="cards-spot-muted">{c('missedNone')}</p>}</section>
      <div className="cards-spot-start"><button className="button primary" onClick={start}><RotateCcw size={17}/>{c('playAgain')}</button><button className="button" onClick={() => setPhase('setup')}>{c('changeSettings')}</button><Link className="button" href={back}>{c('back')}</Link></div>
    </main>);
  }
  if (!tally) return wrap(null);
  const pool = mode === 'survival' ? alive(tally) : Object.keys(tally.scores), current = drawing || turn?.studentId || null;
  return wrap(<main className="cards-spot-play">
    <section className="cards-spot-stage">
      <div className={`cards-spot-name ${drawing ? 'is-drawing' : ''} ${turn ? 'is-picked' : ''}`} aria-live="polite">{current ? label(current) : <span>{c('drawFirst')}</span>}</div>
      {newRound && turn && <p className="cards-spot-muted">{c('newRound')}</p>}
      {turn && card ? <>
        <div className="cards-spot-question">
          {prompt === 'speech' ? <button className="cards-spot-listen" onClick={() => speak(card.front, prefs.rate)}><Volume2 size={56}/><span>{c('listen')}</span><small>{c('replay')}</small></button> : <FitText text={question} min={22} max={180}/>}
        </div>
        <div className={`cards-spot-answer ${turn.revealed ? 'is-open' : ''}`}>{turn.revealed ? <><small>{c('answer')}</small><div className="cards-spot-illustration"><CardIllustration card={card} type={set.type} variant="compact"/></div><FitText text={answer} min={18} max={110}/></> : <button className="button" onClick={toggleAnswer}>{c('revealAnswer')}</button>}</div>
        <div className="cards-spot-judge"><button className="cards-spot-right" onClick={() => mark(true)}><Check size={34}/>{c('correct')}</button><button className="cards-spot-wrong" onClick={() => mark(false)}><X size={34}/>{c('wrong')}</button></div>
      </> : <div className="cards-spot-judge"><button className="button primary cards-spot-draw" disabled={!!drawing || !pool.length} onClick={draw}><CardModeIcon mode="spotlight" size={30}/>{drawing ? c('drawing') : c('draw')}</button>{tally.turns.length > 0 && <button className="button" onClick={undo}><RotateCcw size={17}/>{c('undo')}</button>}</div>}
    </section>
    <aside className="cards-spot-board">
      {teams.length > 0 ? <ol className="cards-spot-teams">{teams.map(row => <li key={row.team} style={{'--team': TEAM_COLORS[row.team]} as CSSProperties} className={turn && tally.teams?.[turn.studentId] === row.team ? 'is-turn' : ''}><strong>{c('team', {n: row.team + 1})}</strong><b>{row.score}</b><small>{row.members.map(label).join(', ')}</small></li>)}</ol>
        : mode === 'survival' ? <div className="cards-spot-alive"><h3>{c('alive', {n: pool.length})}</h3><div>{Object.keys(tally.scores).map(id => <span key={id} className={tally.out.includes(id) ? 'is-out' : id === turn?.studentId ? 'is-turn' : ''}>{label(id)}</span>)}</div></div>
        : <ol className="cards-spot-ranking is-live">{spotlightRanking(tally).slice(0, 8).map(row => <li key={row.id} className={row.id === turn?.studentId ? 'is-turn' : ''}><span>{c('rank', {n: row.rank})}</span><strong>{label(row.id)}</strong><b>{row.score}</b></li>)}</ol>}
      <p className="cards-spot-muted">{c('picked', {n: new Set(tally.turns.map(item => item.studentId)).size, total: Object.keys(tally.scores).length})}</p>
      <button className="button" onClick={() => setPhase('done')}>{c('finish')}</button>
      <p className="cards-board-keys">{c('keysSpot')}</p>
      <p className="cards-spot-muted">{c('notSaved')}</p>
    </aside>
  </main>);
}
