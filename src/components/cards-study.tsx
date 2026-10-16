'use client';

import {useCallback, useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import Link from 'next/link';
import {ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Keyboard, LoaderCircle, RefreshCw, RotateCcw, Shuffle, Star, Volume2, X} from 'lucide-react';
import {usePreferences} from './providers';
import {characterFiles, type Character} from '@/lib/characters';
import type {CardDirection, CardEntry, CardModeRequirement, CardProgress, CardSetType, CardStudyMode, CardStudyResult} from '@/lib/cards-types';
import ko from '@/messages/cards-study-ko.json';
import en from '@/messages/cards-study-en.json';
import '@/styles/cards-study.css';

export const cardModes = ['memorize', 'recall', 'spell'] as const;
export function useCardCopy() {const {locale} = usePreferences(); return {copy: locale === 'ko' ? ko : en, locale, points: (value: number) => locale === 'ko' ? `${value}${ko.score}` : `${value} ${en.score}`};}
export async function cardRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {cache: 'no-store', ...init, headers: {'Content-Type': 'application/json', ...init?.headers}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code || 'REQUEST_FAILED');
  return body as T;
}
export function CardBuddy({character = 'cat', happy = false}: {character?: Character; happy?: boolean}) {
  return <img className={`cs-buddy ${happy ? 'is-happy' : ''}`} src={`/characters/${characterFiles[character] || characterFiles.cat}.webp`} alt="" aria-hidden="true"/>;
}
export function CardLoading() {const {copy: c} = useCardCopy(); return <div className="cs-state" role="status"><CardBuddy/><LoaderCircle className="spin" size={23}/><p>{c.loading}</p></div>;}
export function CardError({retry}: {retry: () => void}) {const {copy: c} = useCardCopy(); return <div className="cs-state" role="alert"><p>{c.error}</p><button className="button" onClick={retry}><RefreshCw size={16}/>{c.retry}</button></div>;}
const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const textFor = (card: CardEntry, direction: CardDirection) => ({prompt: direction === 'front-back' ? card.front : card.back, expected: direction === 'front-back' ? card.back : card.front});
function mixed<T>(items: T[]): T[] {const result = [...items]; for (let i = result.length - 1; i > 0; i--) {const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];} return result;}
function stableMixed<T>(items: T[], seed: number): T[] {const result = [...items]; for (let i = result.length - 1; i > 0; i--) {seed = (Math.imul(seed + 1, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); [result[i], result[j]] = [result[j], result[i]];} return result;}

type SavedResponse = {requestId: string; mode: CardStudyMode; direction: CardDirection; responses: {cardId: string; answer: string}[]; lastCardId: string};
type PracticeSession = {queue: string[]; index: number; direction: CardDirection; outcomes: {cardId: string; correct: boolean}[]; pending?: SavedResponse; feedback?: {correct: boolean; expected: string}; finished?: boolean};
type PracticeProps = {title: string; cards: CardEntry[]; mode: CardStudyMode; type?: CardSetType; character?: Character; distributionId?: string; studentId?: string; requirement?: CardModeRequirement; progress?: CardProgress; onProgress?: (progress: CardProgress) => void; onClose?: () => void};

export function CardsPracticePreview(props: {title: string; cards: CardEntry[]; mode: CardStudyMode | 'test'; type?: CardSetType; onClose?: () => void}) {
  if (props.mode === 'test') return <CardsLocalTestPreview {...props}/>;
  return <CardsPractice key={props.mode} {...props} mode={props.mode}/>;
}

export function CardsPractice({title, cards, mode, type = 'word', character = 'cat', distributionId, studentId, requirement, progress, onProgress, onClose}: PracticeProps) {
  const {copy: c} = useCardCopy();
  const isPreview = !distributionId;
  const fixed = !!requirement?.requiredCount;
  const min = requirement ? requirement.rangeStart : 1, max = requirement ? Math.min(requirement.rangeEnd, cards.length) : cards.length;
  const [direction, setDirection] = useState<CardDirection>(requirement?.direction || 'front-back');
  const [rangeStart, setRangeStart] = useState(min), [rangeEnd, setRangeEnd] = useState(max), [shuffle, setShuffle] = useState(false), [repeat, setRepeat] = useState(1), [starredOnly, setStarredOnly] = useState(false);
  const [stars, setStars] = useState(progress?.starredCardIds || []), [starBusy, setStarBusy] = useState(false);
  const [session, setSession] = useState<PracticeSession | null>(null), [resume, setResume] = useState<PracticeSession | null>(null);
  const [answer, setAnswer] = useState(''), [revealed, setRevealed] = useState(false), [selectedTokens, setSelectedTokens] = useState<number[]>([]);
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [starError, setStarError] = useState(false), [canSpeak, setCanSpeak] = useState(false), [speechFailed, setSpeechFailed] = useState(false), [speed, setSpeed] = useState(1);
  const busy = useRef(false), inputRef = useRef<HTMLInputElement>(null);
  const storageKey = distributionId && studentId ? `cards-study:${studentId}:${distributionId}:${mode}` : null;
  const persist = useCallback((value: PracticeSession) => {if (storageKey) {try {if (value.finished) sessionStorage.removeItem(storageKey); else sessionStorage.setItem(storageKey, JSON.stringify(value));} catch {}}}, [storageKey]);
  const updateSession = useCallback((value: PracticeSession) => {setSession(value); persist(value);}, [persist]);
  useEffect(() => {
    setCanSpeak('speechSynthesis' in window);
    if (storageKey) {try {const value = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as PracticeSession | null; if (value && Array.isArray(value.queue) && value.queue.length && value.queue.every(id => cards.some(card => card.id === id)) && Number.isInteger(value.index) && value.index >= 0 && value.index < value.queue.length && (!fixed || value.direction === requirement?.direction)) setResume(value);} catch {}}
    return () => {if ('speechSynthesis' in window) window.speechSynthesis.cancel();};
  }, [storageKey, cards, fixed, requirement?.direction]);
  useEffect(() => {inputRef.current?.focus();}, [session?.index]);
  const card = session ? cards.find(item => item.id === session.queue[session.index]) : undefined;
  const content = card ? textFor(card, session!.direction) : null;
  const choices = useMemo(() => {
    if (!card || !session) return [];
    const expected = textFor(card, session.direction).expected;
    const others = [...new Set(cards.filter(item => item.id !== card.id).map(item => textFor(item, session.direction).expected))].filter(value => normalize(value) !== normalize(expected));
    return stableMixed([expected, ...stableMixed(others, session.index + 12).slice(0, 3)], session.index + 41);
  }, [card, cards, session?.direction, session?.index]);
  const tokens = useMemo(() => content ? stableMixed(content.expected.split(/\s+/).filter(Boolean).map((text, id) => ({text, id})), (session?.index || 0) + 18) : [], [content?.expected, session?.index]);
  const sentenceRecall = mode === 'recall' && type === 'sentence';
  const feedback = session?.feedback;
  const last = progress?.lastPosition?.mode === mode ? cards.findIndex(item => item.id === progress.lastPosition?.cardId) : -1;

  function start(resumeServer = false, wrongOnly = false) {
    setError('');
    if (rangeStart < min || rangeEnd > max || rangeStart > rangeEnd || !Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) {setError(c.rangeError); return;}
    let chosen = cards.slice(rangeStart - 1, rangeEnd).filter(item => !starredOnly || stars.includes(item.id));
    if (wrongOnly) {const wrong = new Set(session?.outcomes.filter(item => !item.correct).map(item => item.cardId)); chosen = cards.filter(item => wrong.has(item.id));}
    if (!chosen.length) {setError(c.noCards); return;}
    let queue = Array.from({length: Math.max(1, Math.min(10, repeat))}, () => shuffle ? mixed(chosen) : chosen).flat().map(item => item.id);
    if (resumeServer && last >= 0) {const index = queue.indexOf(cards[last].id); if (index >= 0 && index < queue.length - 1) queue = queue.slice(index + 1);}
    updateSession({queue, index: 0, direction, outcomes: []}); setRevealed(false); setAnswer(''); setSelectedTokens([]); setResume(null);
  }
  async function save(pending: SavedResponse, current: PracticeSession) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const result = await cardRequest<{progress: CardProgress; results: CardStudyResult[]}>(`/api/cards/distributions/${distributionId}/study`, {method: 'POST', body: JSON.stringify(pending)});
      const outcome = result.results[0];
      const next = {...current, pending: undefined, feedback: {correct: outcome.correct, expected: outcome.expectedAnswer}, outcomes: [...current.outcomes, {cardId: pending.responses[0].cardId, correct: outcome.correct}]};
      updateSession(next); onProgress?.(result.progress);
    } catch {setError(c.saveError);}
    finally {busy.current = false; setSaving(false);}
  }
  function check(value = answer) {
    if (!session || !card || feedback || session.pending || busy.current) return;
    if (mode !== 'memorize' && !value.trim()) return;
    const pending: SavedResponse = {requestId: crypto.randomUUID(), mode, direction: session.direction, responses: [{cardId: card.id, answer: value}], lastCardId: card.id};
    if (isPreview) {
      const expected = textFor(card, session.direction).expected;
      const correct = mode === 'memorize' || [expected, ...(session.direction === 'front-back' ? card.alternatives : [])].some(item => normalize(item) === normalize(value));
      updateSession({...session, feedback: {correct, expected}, outcomes: [...session.outcomes, {cardId: card.id, correct}]});
    } else {const next = {...session, pending}; updateSession(next); void save(pending, next);}
  }
  function next() {
    if (!session || !feedback || saving || session.pending) return;
    const finished = session.index >= session.queue.length - 1;
    updateSession({...session, index: finished ? session.index : session.index + 1, finished, feedback: undefined});
    setAnswer(''); setRevealed(false); setSelectedTokens([]); setError('');
  }
  function again() {if (!session || !card || saving || session.pending) return; updateSession({...session, queue: [...session.queue.slice(0, session.index), ...session.queue.slice(session.index + 1), card.id]}); setRevealed(false);}
  async function toggleStar() {
    if (!card || starBusy) return;
    const previous = stars, nextStars = stars.includes(card.id) ? stars.filter(id => id !== card.id) : [...stars, card.id];
    setStars(nextStars); if (isPreview) return;
    setStarBusy(true); setStarError(false);
    try {const result = await cardRequest<{progress: CardProgress}>(`/api/cards/distributions/${distributionId}/progress`, {method: 'PATCH', body: JSON.stringify({starredCardIds: nextStars})}); onProgress?.(result.progress);}
    catch {setStars(previous); setStarError(true);} finally {setStarBusy(false);}
  }
  function speak() {
    if (!content || !canSpeak) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(revealed || feedback ? content.expected : content.prompt);
    utterance.lang = /[가-힣]/.test(utterance.text) ? 'ko-KR' : 'en-US'; utterance.rate = speed;
    utterance.onerror = () => setSpeechFailed(true); setSpeechFailed(false); window.speechSynthesis.speak(utterance);
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || !session || session.finished || saving || session.pending) return;
      const target = event.target as HTMLElement;
      if (target.closest('button,a,select,textarea')) return;
      if (target.tagName === 'INPUT' && event.key !== 'Enter') return;
      if (event.key === 'Enter') {event.preventDefault(); if (feedback) next(); else if (mode === 'memorize') {if (!revealed) setRevealed(true); else check('');} else if (sentenceRecall) check(selectedTokens.map(id => tokens.find(item => item.id === id)?.text).join(' ')); else if (mode === 'spell') check();}
      if (event.code === 'Space' && mode === 'memorize') {event.preventDefault(); setRevealed(value => !value);}
      if (/^[1-9]$/.test(event.key) && mode === 'recall' && !feedback) {const index = Number(event.key) - 1; if (sentenceRecall) {const token = tokens[index]; if (token && !selectedTokens.includes(token.id)) setSelectedTokens(value => [...value, token.id]);} else if (choices[index]) check(choices[index]);}
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const exit = isPreview ? <button className="button" onClick={onClose || (() => {setSession(null); setResume(null);})}><X size={16}/>{c.closePreview}</button> : <Link className="cs-back" href={`/student/cards/${distributionId}`}><ArrowLeft size={16}/>{c.exit}</Link>;
  if (!session) return <section className="cs-study"><div className="cs-study-top">{exit}<span className="cs-tag">{c[mode]}</span></div>{isPreview && <p className="cs-preview-note">{c.preview}</p>}<header className="cs-heading"><div><h1>{title}</h1><p>{c.settings}</p></div><CardBuddy character={character}/></header>
    <div className="cs-options"><h2>{c[mode]}</h2>{resume && <div className="cs-resume"><p>{c.savedResume} <strong>{resume.index + 1} / {resume.queue.length}</strong></p><button className="button primary" onClick={() => {updateSession(resume); setDirection(resume.direction); setAnswer(resume.pending?.responses[0]?.answer || ""); setRevealed(!!resume.feedback || !!resume.pending);}}><ArrowRight size={16}/>{c.continue}</button></div>}
      <div className="cs-option-grid"><label>{c.direction}<select value={direction} disabled={fixed} onChange={event => setDirection(event.target.value as CardDirection)}><option value="front-back">{c.frontBack}</option><option value="back-front">{c.backFront}</option></select></label><label>{c.repeat}<select value={repeat} onChange={event => setRepeat(Number(event.target.value))}>{[1, 2, 3, 5, 10].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>{c.rangeStart}<input type="number" min={min} max={max} value={rangeStart} onChange={event => setRangeStart(Number(event.target.value))}/></label><label>{c.rangeEnd}<input type="number" min={min} max={max} value={rangeEnd} onChange={event => setRangeEnd(Number(event.target.value))}/></label></div>
      {fixed && <p className="cs-muted">{c.fixed} ({min}–{max})</p>}<div className="cs-checks"><label><input type="checkbox" checked={shuffle} onChange={event => setShuffle(event.target.checked)}/><Shuffle size={16}/>{c.shuffle}</label><label><input type="checkbox" checked={starredOnly} onChange={event => setStarredOnly(event.target.checked)}/><Star size={16}/>{c.starredOnly} ({stars.length})</label></div>
      {error && <p className="cs-alert" role="alert">{error}</p>}<div className="cs-actions"><button className="button primary" onClick={() => start()}>{resume ? c.restart : c.start}<ArrowRight size={17}/></button>{!resume && last >= 0 && last < cards.length - 1 && <button className="button" onClick={() => start(true)}>{c.continue}</button>}</div>{!resume && last >= 0 && <p className="cs-muted">{c.lastPosition}</p>}
    </div></section>;
  if (session.finished) {const correctCount = session.outcomes.filter(item => item.correct).length, wrongCount = session.outcomes.length - correctCount; const nextMode = mode === 'memorize' ? 'recall' : mode === 'recall' ? 'spell' : 'test'; return <section className="cs-study"><div className="cs-study-top">{exit}</div><div className="cs-finish"><CardBuddy character={character} happy/><CheckCircle2 size={34}/><h1>{c.doneTitle}</h1><p>{c.doneBody}</p>{isPreview && <p className="cs-preview-note">{c.preview}</p>}<dl className="cs-result-grid"><div><dt>{c.answered}</dt><dd>{session.outcomes.length}</dd></div><div><dt>{c.correctCount}</dt><dd>{correctCount}</dd></div><div><dt>{c.wrongCount}</dt><dd>{wrongCount}</dd></div></dl><div className="cs-actions"><button className="button" onClick={() => {setSession(null); setResume(null);}}><RotateCcw size={16}/>{c.restart}</button>{wrongCount > 0 && <button className="button" onClick={() => start(false, true)}>{c.retryWrong}</button>}{!isPreview && <Link className="button primary" href={`/student/cards/${distributionId}/${nextMode}`}>{c[nextMode]}<ArrowRight size={17}/></Link>}</div></div></section>;}
  if (!card || !content) return <CardError retry={() => setSession(null)}/>;
  return <section className="cs-study"><div className="cs-study-top">{exit}<span>{c[mode]} <strong>{session.index + 1} / {session.queue.length}</strong></span></div>{isPreview && <p className="cs-preview-note">{c.preview}</p>}<progress className="cs-progress" value={session.index} max={session.queue.length} aria-label={c.progress}/><header className="cs-session-title"><h1>{title}</h1><CardBuddy character={character} happy={feedback?.correct}/></header>
    <div className="cs-flashcard"><div className="cs-card-toolbar"><span className="cs-tag">{c[mode]}</span><div><button className="icon-button" aria-label={stars.includes(card.id) ? c.unstar : c.star} aria-pressed={stars.includes(card.id)} onClick={() => void toggleStar()} disabled={starBusy}><Star size={21} fill={stars.includes(card.id) ? 'currentColor' : 'none'}/></button>{canSpeak && <button className="icon-button" aria-label={c.listen} onClick={speak}><Volume2 size={22}/></button>}</div></div>
      <p className="cs-prompt" lang={/[가-힣]/.test(content.prompt) ? 'ko' : 'en'}>{content.prompt}</p>
      {mode === 'memorize' && <div className={`cs-card-back ${revealed || feedback ? 'is-revealed' : ''}`}>{revealed || feedback ? <><p className="cs-expected">{content.expected}</p>{card.example && <p className="cs-example">{card.example}</p>}</> : <button className="cs-reveal" onClick={() => setRevealed(true)}><BookOpen size={23}/>{c.reveal}<small>Space</small></button>}</div>}
      {mode === 'recall' && !sentenceRecall && <><p className="cs-instruction">{c.choose}</p><div className="cs-choices">{choices.map((choice, index) => <button key={choice} className={`cs-choice ${feedback && normalize(choice) === normalize(feedback.expected) ? 'is-correct' : ''}`} disabled={!!feedback || !!session.pending || saving} onClick={() => {setAnswer(choice); check(choice);}}><kbd>{index + 1}</kbd><span>{choice}</span></button>)}</div></>}
      {sentenceRecall && <><p className="cs-instruction">{c.arrange}</p><div className="cs-token-answer" aria-label={c.sentenceAnswer}>{selectedTokens.map((id, index) => <button key={id} className="cs-token" disabled={!!feedback || !!session.pending} onClick={() => setSelectedTokens(value => value.filter(item => item !== id))}>{tokens.find(item => item.id === id)?.text}<span className="cs-sr-only"> {index + 1}</span></button>)}</div><div className="cs-tokens">{tokens.map((token, index) => <button className="cs-token" key={token.id} disabled={selectedTokens.includes(token.id) || !!feedback || !!session.pending} onClick={() => setSelectedTokens(value => [...value, token.id])}>{token.text}<small>{index < 9 ? index + 1 : ''}</small></button>)}</div>{!feedback && <button className="cs-text-button" onClick={() => setSelectedTokens([])} disabled={!!session.pending}>{c.clear}</button>}</>}
      {mode === 'spell' && <form onSubmit={(event: FormEvent) => {event.preventDefault(); check();}}><label htmlFor="card-study-answer">{c.answer}</label><input id="card-study-answer" ref={inputRef} className="cs-answer" value={answer} onChange={event => setAnswer(event.target.value)} disabled={!!feedback || saving || !!session.pending} placeholder={c.placeholder} autoComplete="off" autoCapitalize="none" spellCheck={false}/></form>}
      {feedback && <div className={`cs-feedback ${feedback.correct ? 'is-correct' : 'is-incorrect'}`} role="status"><strong>{feedback.correct ? <CheckCircle2 size={20}/> : <RotateCcw size={20}/>} {feedback.correct ? c.correct : c.incorrect}</strong>{mode !== 'memorize' && <p>{c.correctAnswer}: <b>{feedback.expected}</b></p>}</div>}
    </div>
    {(error || starError) && <div className="cs-alert" role="alert"><p>{error || c.saveError}</p>{session.pending && <button className="button" disabled={saving} onClick={() => void save(session.pending!, session)}><RefreshCw size={16}/>{c.retrySave}</button>}</div>}
    {session.pending && !saving && !error && <div className="cs-alert" role="status"><p>{c.saveError}</p><button className="button" onClick={() => void save(session.pending!, session)}>{c.retrySave}</button></div>}
    <div className="cs-study-controls">{saving ? <span role="status"><LoaderCircle className="spin" size={17}/>{c.saving}</span> : feedback ? <><span className="cs-muted"><Check size={16}/>{isPreview ? c.preview : c.saved}</span><button className="button primary" autoFocus onClick={next}>{c.next}<ChevronRight size={18}/></button></> : mode === 'memorize' ? revealed ? <><button className="button" onClick={again} disabled={!!session.pending}><RotateCcw size={17}/>{c.again}</button><button className="button primary" onClick={() => check('')} disabled={!!session.pending}><Check size={17}/>{c.remember}</button></> : <button className="button primary" onClick={() => setRevealed(true)}>{c.reveal}</button> : (mode === 'spell' || sentenceRecall) ? <button className="button primary" disabled={!!session.pending || (sentenceRecall ? selectedTokens.length !== tokens.length : !answer.trim())} onClick={() => check(sentenceRecall ? selectedTokens.map(id => tokens.find(item => item.id === id)?.text).join(' ') : answer)}>{c.check}<Check size={17}/></button> : null}</div>
    <div className="cs-study-foot"><p><Keyboard size={16}/>{c.keyboard}</p>{canSpeak ? <label>{c.speed}<select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={0.7}>0.7×</option><option value={1}>1×</option><option value={1.2}>1.2×</option></select></label> : <p>{c.speechUnavailable}</p>}</div>{speechFailed && <p className="cs-muted" role="status">{c.speechUnavailable}</p>}
  </section>;
}

function CardsLocalTestPreview({title, cards, onClose}: {title: string; cards: CardEntry[]; onClose?: () => void}) {
  const {copy: c} = useCardCopy(); const [answers, setAnswers] = useState<Record<string, string>>({}), [submitted, setSubmitted] = useState(false);
  const correct = cards.filter(card => [card.back, ...card.alternatives].some(value => normalize(value) === normalize(answers[card.id] || ''))).length;
  return <section className="cs-study"><div className="cs-study-top"><h2>{title} · {c.test}</h2>{onClose && <button className="button" onClick={onClose}><X size={16}/>{c.closePreview}</button>}</div><p className="cs-preview-note">{c.preview}</p><form onSubmit={event => {event.preventDefault(); setSubmitted(true);}}>{cards.map((card, index) => <div className="cs-test-question" key={card.id}><label htmlFor={`preview-${card.id}`}>{index + 1}. {card.front}</label><input id={`preview-${card.id}`} required disabled={submitted} value={answers[card.id] || ''} onChange={event => setAnswers(value => ({...value, [card.id]: event.target.value}))} autoComplete="off"/>{submitted && <p>{c.correctAnswer}: {card.back}</p>}</div>)}{submitted ? <div className="cs-finish"><h3>{Math.round(correct / Math.max(1, cards.length) * 100)} {c.score}</h3><p>{c.testPreview}</p><button type="button" className="button" onClick={() => {setSubmitted(false); setAnswers({});}}>{c.restart}</button></div> : <button className="button primary" type="submit" disabled={!cards.length}>{c.testSubmit}</button>}</form></section>;
}
