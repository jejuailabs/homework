'use client';

import {useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Keyboard, Lightbulb, LoaderCircle, RefreshCw, RotateCcw, Shuffle, Star, Volume2, X} from 'lucide-react';
import {usePreferences} from './providers';
import {CardIllustration, CardIllustrationToggle} from './card-illustration';

import {characterFiles, type Character} from '@/lib/characters';
import {addStudyResponse, cardAnswer, cardDistractors, cardRangePreset, emptyStudyOutbox, gradeCardAnswer, keepaliveStudyBatches, normalizeCardAnswer, restoreStudyOutbox, sealStudyBuffer, settleStudyBatch, spellHint, staleStudyBatch, STUDY_ANSWER_LIMIT, STUDY_IDLE_MS, studyOutboxSize, type StudyBatch, type StudyOutbox} from '@/lib/cards-logic';
import type {CardDirection, CardEntry, CardModeRequirement, CardProgress, CardReviewItem, CardSetType, CardStudyMode} from '@/lib/cards-types';
import ko from '@/messages/cards-study-ko.json';
import en from '@/messages/cards-study-en.json';
import reviewKo from '@/messages/cards-review-ko.json';
import reviewEn from '@/messages/cards-review-en.json';
import '@/styles/cards-study.css';
import '@/styles/cards-review.css';
import {CardSoundSettings, useCardSound} from './cards-care';
import {speakWithDevice, ttsPlayer} from '@/lib/tts-client';

export const cardModes = ['memorize', 'recall', 'spell'] as const;
export function useCardCopy() {const {locale} = usePreferences(); return {copy: locale === 'ko' ? ko : en, locale, points: (value: number) => locale === 'ko' ? `${value}${ko.score}` : `${value} ${en.score}`};}
export function useReviewCopy() {const {locale} = usePreferences(); return locale === 'ko' ? reviewKo : reviewEn;}
export async function cardRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {cache: 'no-store', ...init, headers: {'Content-Type': 'application/json', ...init?.headers}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code || 'REQUEST_FAILED');
  return body as T;
}
const studyStorageKey = (studentId: string, distributionId: string, mode: CardStudyMode) => `cards-study:${studentId}:${distributionId}:${mode}`;
/** Answers still on this device when a screen closes at the deadline: the server's grace may yet take them, so they go out before the notice shows. A connection failure keeps them for the next visit. */
export async function flushStudyOutbox(distributionId: string, studentId: string) {
  let saved = false, dropped = false;
  for (const mode of ['memorize', 'recall', 'spell'] as CardStudyMode[]) {
    const key = studyStorageKey(studentId, distributionId, mode);
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (!value) continue;
      let outbox = sealStudyBuffer(restoreStudyOutbox(value.outbox, mode, value.v ? undefined : value.pending), mode, newRequestId);
      const write = () => sessionStorage.setItem(key, JSON.stringify({...value, v: 2, outbox}));
      write(); // The sealed IDs are stored first, so a second visit repeats the same batches instead of counting them again.
      for (const batch of outbox.sealed) {
        try {await cardRequest(`/api/cards/distributions/${distributionId}/study`, {method: 'POST', body: JSON.stringify(batch)}); saved = true;}
        catch (cause) {
          if (!(cause instanceof Error && (cause.message === 'DUE_CLOSED' || staleStudyBatch(cause.message)))) break;
          dropped = true;
        }
        outbox = settleStudyBatch(outbox, batch.requestId); write();
      }
      if (!studyOutboxSize(outbox) && value.finished) sessionStorage.removeItem(key);
    } catch {}
  }
  return {saved, dropped};
}
export function CardBuddy({character = 'cat', happy = false}: {character?: Character; happy?: boolean}) {
  return <img className={`cs-buddy ${happy ? 'is-happy' : ''}`} src={`/characters/${characterFiles[character] || characterFiles.cat}.webp`} alt="" aria-hidden="true"/>;
}
export function CardLoading() {const {copy: c} = useCardCopy(); return <div className="cs-state" role="status"><CardBuddy/><LoaderCircle className="spin" size={23}/><p>{c.loading}</p></div>;}
export function CardError({retry}: {retry: () => void}) {const {copy: c} = useCardCopy(); return <div className="cs-state" role="alert"><p>{c.error}</p><button className="button" onClick={retry}><RefreshCw size={16}/>{c.retry}</button></div>;}
const normalize = normalizeCardAnswer;
const textFor = (card: CardEntry, direction: CardDirection) => ({prompt: direction === 'front-back' ? card.front : card.back, expected: cardAnswer(card, direction)});
function mixed<T>(items: T[]): T[] {const result = [...items]; for (let i = result.length - 1; i > 0; i--) {const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];} return result;}
function stableMixed<T>(items: T[], seed: number): T[] {const result = [...items]; for (let i = result.length - 1; i > 0; i--) {seed = (Math.imul(seed + 1, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); [result[i], result[j]] = [result[j], result[i]];} return result;}

type PracticeSession = {queue: string[]; index: number; direction: CardDirection; outcomes: {cardId: string; correct: boolean}[]; feedback?: {correct: boolean; expected: string; answer?: string}; finished?: boolean};
const newRequestId = () => crypto.randomUUID();
type PracticeProps = {title: string; cards: CardEntry[]; mode: CardStudyMode; type?: CardSetType; character?: Character; distributionId?: string; studentId?: string; requirement?: CardModeRequirement; progress?: CardProgress; from?: string; to?: string; onProgress?: (progress: CardProgress) => void; onClose?: () => void; speechRate?: number | null};

export function CardsPracticePreview(props: {title: string; cards: CardEntry[]; mode: CardStudyMode | 'test'; type?: CardSetType; onClose?: () => void}) {
  if (props.mode === 'test') return <CardsLocalTestPreview {...props}/>;
  return <CardsPractice key={props.mode} {...props} mode={props.mode}/>;
}

export function CardsPractice({title, cards, mode, type = 'word', character = 'cat', distributionId, studentId, requirement, progress, from, to, onProgress, onClose, speechRate}: PracticeProps) {
  const {copy: c} = useCardCopy();
  const isPreview = !distributionId;
  const fixed = !!requirement?.requiredCount;
  const min = requirement ? requirement.rangeStart : 1, max = requirement ? Math.min(requirement.rangeEnd, cards.length) : cards.length;
  const [direction, setDirection] = useState<CardDirection>(requirement?.direction || 'front-back');
  const [rangeStart, setRangeStart] = useState(() => cardRangePreset(from, to, min, max).start), [rangeEnd, setRangeEnd] = useState(() => cardRangePreset(from, to, min, max).end), [shuffle, setShuffle] = useState(false), [repeat, setRepeat] = useState(1), [starredOnly, setStarredOnly] = useState(false);
  const [stars, setStars] = useState(progress?.starredCardIds || []), [starBusy, setStarBusy] = useState(false);
  const [session, setSession] = useState<PracticeSession | null>(null), [resume, setResume] = useState<PracticeSession | null>(null);
  const [answer, setAnswer] = useState(''), [revealed, setRevealed] = useState(false), [selectedTokens, setSelectedTokens] = useState<number[]>([]);
  const [dueClosed, setDueClosed] = useState(false), [rulesChanged, setRulesChanged] = useState(false);
  const [saving, setSaving] = useState(false), [saveFailed, setSaveFailed] = useState(false), [unsaved, setUnsaved] = useState(0), [error, setError] = useState(''), [starError, setStarError] = useState(false), [canSpeak, setCanSpeak] = useState(false), [speechFailed, setSpeechFailed] = useState(false), [speed, setSpeed] = useState(speechRate || 1);
  const [voiceUsed, setVoiceUsed] = useState(false);
  const [hintIndex, setHintIndex] = useState<number | null>(null), sound = useCardSound();
  const inputRef = useRef<HTMLInputElement>(null), router = useRouter();
  // Answers grade instantly and wait here. Async saves must merge with the latest values, so these live in refs as well as state.
  const sessionRef = useRef<PracticeSession | null>(null), resumeRef = useRef<PracticeSession | null>(null), outboxRef = useRef<StudyOutbox>(emptyStudyOutbox()), flushing = useRef<Promise<void> | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), failures = useRef(0), progressCallback = useRef(onProgress);
  useEffect(() => {progressCallback.current = onProgress;});
  const storageKey = distributionId && studentId ? studyStorageKey(studentId, distributionId, mode) : null;
  const persist = useCallback(() => {
    if (!storageKey) return;
    const outbox = outboxRef.current, base = sessionRef.current && !sessionRef.current.finished ? sessionRef.current : resumeRef.current;
    try {
      if (base) sessionStorage.setItem(storageKey, JSON.stringify({...base, v: 2, outbox}));
      else if (studyOutboxSize(outbox)) sessionStorage.setItem(storageKey, JSON.stringify({v: 2, finished: true, queue: [], index: 0, direction: 'front-back', outcomes: [], outbox}));
      else sessionStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);
  const updateSession = useCallback((value: PracticeSession | null) => {sessionRef.current = value; setSession(value); persist();}, [persist]);
  const writeOutbox = useCallback((value: StudyOutbox) => {outboxRef.current = value; setUnsaved(studyOutboxSize(value)); if (!studyOutboxSize(value)) setSaveFailed(false); persist();}, [persist]);
  const sendBatch = useCallback(async (batch: StudyBatch, keepalive = false) => {
    const result = await cardRequest<{progress: CardProgress}>(`/api/cards/distributions/${distributionId}/study`, {method: 'POST', keepalive, body: JSON.stringify(batch)});
    writeOutbox(settleStudyBatch(outboxRef.current, batch.requestId));
    progressCallback.current?.(result.progress);
  }, [distributionId, writeOutbox]);
  const drainRef = useRef<() => Promise<void>>(async () => {});
  const schedule = useCallback((delay: number) => {clearTimeout(timer.current); timer.current = setTimeout(() => void drainRef.current(), delay);}, []);
  const pump = useCallback(() => {
    if (flushing.current) return flushing.current;
    if (!outboxRef.current.sealed.length) return Promise.resolve();
    flushing.current = (async () => {
      setSaving(true);
      try {
        for (let batch = outboxRef.current.sealed[0]; batch; batch = outboxRef.current.sealed[0]) {
          // Answered under settings the teacher has since changed: the server will never take this batch, and it must not hold up the ones behind it.
          await sendBatch(batch).catch(cause => {if (!(cause instanceof Error && staleStudyBatch(cause.message))) throw cause; writeOutbox(settleStudyBatch(outboxRef.current, batch.requestId)); setRulesChanged(true);});
        }
        failures.current = 0; setSaveFailed(false);
      } catch (cause) {
        // The server will never take these answers, so stop retrying and say why instead of showing a save error forever.
        if (cause instanceof Error && cause.message === 'DUE_CLOSED') {failures.current = 0; writeOutbox(emptyStudyOutbox()); setDueClosed(true);}
        else {failures.current++; setSaveFailed(true); schedule(Math.min(STUDY_IDLE_MS * 2 ** (failures.current - 1), 160_000));}
      }
      finally {flushing.current = null; setSaving(false);}
    })();
    return flushing.current;
  }, [schedule, sendBatch, writeOutbox]);
  const seal = useCallback(() => writeOutbox(sealStudyBuffer(outboxRef.current, mode, newRequestId)), [mode, writeOutbox]);
  const drain = useCallback(() => {clearTimeout(timer.current); seal(); return pump();}, [pump, seal]);
  useEffect(() => {drainRef.current = drain;}, [drain]);
  useEffect(() => {
    setCanSpeak('speechSynthesis' in window || typeof Audio !== 'undefined');
    if (storageKey) {try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as (PracticeSession & {v?: number; pending?: StudyBatch; outbox?: unknown}) | null;
      const legacy = value && !value.v ? value.pending : undefined, restored = restoreStudyOutbox(value?.outbox, mode, legacy);
      if (value && !value.finished && Array.isArray(value.queue) && value.queue.length && value.queue.every(id => cards.some(card => card.id === id)) && Number.isInteger(value.index) && value.index >= 0 && value.index < value.queue.length && (!fixed || value.direction === requirement?.direction)) {
        const {v: _v, pending: _pending, outbox: _outbox, ...saved} = value, waiting = legacy?.responses?.[0], waitingCard = cards.find(card => card.id === waiting?.cardId);
        // A session saved before batching was waiting for the server's verdict on this card; it can now be graded here.
        if (waiting && waitingCard && !saved.feedback) {const {correct, expected} = gradeCardAnswer(waitingCard, mode, saved.direction, waiting.answer); saved.feedback = {correct, expected, answer: waiting.answer}; saved.outcomes = [...saved.outcomes, {cardId: waitingCard.id, correct}];}
        resumeRef.current = saved; setResume(saved);
      }
      writeOutbox(restored); if (studyOutboxSize(restored)) void drainRef.current();
    } catch {}}
    return () => {ttsPlayer().stop(); if ('speechSynthesis' in window) window.speechSynthesis.cancel();};
  }, [storageKey, cards, fixed, requirement?.direction, mode, writeOutbox]);
  useEffect(() => {
    if (!distributionId) return;
    // Hidden pages and client navigation can end at any moment, so every batch goes out with keepalive. Retries are idempotent.
    const sendNow = () => {if (!studyOutboxSize(outboxRef.current)) return; clearTimeout(timer.current); seal(); for (const batch of keepaliveStudyBatches(outboxRef.current)) void sendBatch(batch, true).catch(() => {});};
    const visibility = () => {if (document.visibilityState === 'hidden') sendNow(); else if (studyOutboxSize(outboxRef.current)) void drainRef.current();};
    const online = () => {if (studyOutboxSize(outboxRef.current)) void drainRef.current();};
    window.addEventListener('pagehide', sendNow); window.addEventListener('online', online); document.addEventListener('visibilitychange', visibility);
    return () => {window.removeEventListener('pagehide', sendNow); window.removeEventListener('online', online); document.removeEventListener('visibilitychange', visibility); sendNow(); clearTimeout(timer.current);};
  }, [distributionId, seal, sendBatch]);
  useEffect(() => {inputRef.current?.focus();}, [session?.index]);
  const card = session ? cards.find(item => item.id === session.queue[session.index]) : undefined;
  const content = card ? textFor(card, session!.direction) : null;
  const choices = useMemo(() => {
    if (!card || !session) return [];
    const expected = textFor(card, session.direction).expected;
    const others = cardDistractors(card, cards, session.direction);
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
    resumeRef.current = null; setResume(null); setHintIndex(null);
    updateSession({queue, index: 0, direction, outcomes: []}); setRevealed(false); setAnswer(''); setSelectedTokens([]);
  }
  function closeSession() {resumeRef.current = null; setResume(null); updateSession(null);}
  function check(value = answer) {
    const current = sessionRef.current;
    if (!current || !card || current.feedback) return;
    if (mode !== 'memorize' && !value.trim()) return;
    const {correct, expected} = gradeCardAnswer(card, mode, current.direction, value);
    if (mode !== 'memorize') sound.play(correct ? 'good' : 'bad');
    if (isPreview) {updateSession({...current, feedback: {correct, expected}, outcomes: [...current.outcomes, {cardId: card.id, correct}]}); return;}
    const outbox = addStudyResponse(outboxRef.current, {cardId: card.id, answer: value, direction: current.direction}, mode, newRequestId);
    outboxRef.current = outbox; setUnsaved(studyOutboxSize(outbox));
    updateSession({...current, feedback: {correct, expected, answer: value}, outcomes: [...current.outcomes, {cardId: card.id, correct}]});
    if (outbox.sealed.length) void pump();
    schedule(STUDY_IDLE_MS);
  }
  function next() {
    const current = sessionRef.current;
    if (!current?.feedback) return;
    const finished = current.index >= current.queue.length - 1;
    updateSession({...current, index: finished ? current.index : current.index + 1, finished, feedback: undefined});
    if (finished) sound.play('end');
    if (finished && !isPreview) void drain();
    setAnswer(''); setRevealed(false); setSelectedTokens([]); setError('');
  }
  function again() {if (!session || !card) return; updateSession({...session, queue: [...session.queue.slice(0, session.index), ...session.queue.slice(session.index + 1), card.id]}); setRevealed(false);}
  function leave(event: MouseEvent, href: string) {
    if (isPreview || !studyOutboxSize(outboxRef.current)) return;
    // Give the save a moment so the next screen shows this progress; anything slower still goes out with keepalive on unmount.
    event.preventDefault();
    void Promise.race([drain(), new Promise(resolve => setTimeout(resolve, 1500))]).then(() => router.push(href));
  }
  async function toggleStar() {
    if (!card || starBusy) return;
    const previous = stars, nextStars = stars.includes(card.id) ? stars.filter(id => id !== card.id) : [...stars, card.id];
    setStars(nextStars); if (isPreview) return;
    setStarBusy(true); setStarError(false);
    try {const result = await cardRequest<{progress: CardProgress}>(`/api/cards/distributions/${distributionId}/progress`, {method: 'PATCH', body: JSON.stringify({starredCardIds: nextStars})}); onProgress?.(result.progress);}
    catch {setStars(previous); setStarError(true);} finally {setStarBusy(false);}
  }
  // 원어민 음성(서버 TTS)이 켜져 있으면 그 소리로, 꺼졌거나 실패하면 기기 목소리로 읽는다.
  function speak(text = content ? (revealed || feedback ? content.expected : content.prompt) : '') {
    if (!text || !canSpeak) return;
    setVoiceUsed(true); setSpeechFailed(false);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    void ttsPlayer().speak(text, {rate: speed, fallback: () => speakWithDevice(text, speed, () => setSpeechFailed(true))});
  }
  // 카드 자동 읽기 (소리 설정, 기본 꺼짐): each new card's prompt once. The speaker button works either way.
  useEffect(() => {if (sound.autoSpeech && content && !session?.finished) speak(content.prompt);}, [session?.index, session?.direction, session?.finished, sound.autoSpeech, canSpeak]);
  // Once sound is in use, fetch this card's answer and the next card's prompt ahead, so they play at once.
  useEffect(() => {
    if (!session || session.finished || !content || !(sound.autoSpeech || voiceUsed)) return;
    const player = ttsPlayer(), upcoming = cards.find(item => item.id === session.queue[session.index + 1]);
    player.prefetch(content.expected);
    if (upcoming) player.prefetch(textFor(upcoming, session.direction).prompt);
  }, [session?.index, session?.direction, session?.finished, sound.autoSpeech, voiceUsed, revealed, feedback]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || !session || session.finished) return;
      const target = event.target as HTMLElement;
      if (target.closest('button,a,select,textarea,input[type="checkbox"],input[type="radio"]')) return;
      if (target.tagName === 'INPUT' && event.key !== 'Enter') return;
      if (event.key === 'Enter') {event.preventDefault(); if (feedback) next(); else if (mode === 'memorize') {if (!revealed) setRevealed(true); else check('');} else if (sentenceRecall) check(selectedTokens.map(id => tokens.find(item => item.id === id)?.text).join(' ')); else if (mode === 'spell') check();}
      if (event.code === 'Space' && mode === 'memorize') {event.preventDefault(); setRevealed(value => !value);}
      if (/^[1-9]$/.test(event.key) && mode === 'recall' && !feedback) {const index = Number(event.key) - 1; if (sentenceRecall) {const token = tokens[index]; if (token && !selectedTokens.includes(token.id)) setSelectedTokens(value => [...value, token.id]);} else if (choices[index]) check(choices[index]);}
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const exit = isPreview ? <button className="button" onClick={onClose || closeSession}><X size={16}/>{c.closePreview}</button> : <Link className="cs-back" href={`/student/cards/${distributionId}`} onClick={event => leave(event, `/student/cards/${distributionId}`)}><ArrowLeft size={16}/>{c.exit}</Link>;
  const answersLost = dueClosed || rulesChanged;
  const saveNotice = dueClosed ? <div className="cs-alert" role="alert"><p>{c.dueLockedSave}</p></div> : rulesChanged ? <div className="cs-alert" role="alert"><p>{c.rulesChangedSave}</p></div> : saveFailed && <div className="cs-alert" role="alert"><p>{c.saveError} {c.saveKeepGoing}</p><button className="button" disabled={saving} onClick={() => void drain()}><RefreshCw size={16}/>{c.retrySave}</button></div>;
  if (!session) return <section className="cs-study"><div className="cs-study-top">{exit}<span className="cs-tag">{c[mode]}</span></div>{isPreview && <p className="cs-preview-note">{c.preview}</p>}<header className="cs-heading"><div><h1>{title}</h1><p>{c.settings}</p></div><CardBuddy character={character}/></header>
    <div className="cs-options"><h2>{c[mode]}</h2>{resume && <div className="cs-resume"><p>{c.savedResume} <strong>{resume.index + 1} / {resume.queue.length}</strong></p><button className="button primary" onClick={() => {resumeRef.current = null; setResume(null); updateSession(resume); setDirection(resume.direction); setAnswer(resume.feedback?.answer || ''); setRevealed(!!resume.feedback);}}><ArrowRight size={16}/>{c.continue}</button></div>}
      <div className="cs-option-grid"><label>{c.direction}<select value={direction} disabled={fixed} onChange={event => setDirection(event.target.value as CardDirection)}><option value="front-back">{c.frontBack}</option><option value="back-front">{c.backFront}</option></select></label><label>{c.repeat}<select value={repeat} onChange={event => setRepeat(Number(event.target.value))}>{[1, 2, 3, 5, 10].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>{c.rangeStart}<input type="number" min={min} max={max} value={rangeStart} onChange={event => setRangeStart(Number(event.target.value))}/></label><label>{c.rangeEnd}<input type="number" min={min} max={max} value={rangeEnd} onChange={event => setRangeEnd(Number(event.target.value))}/></label></div>
      {fixed && <p className="cs-muted">{c.fixed} ({min}–{max})</p>}<div className="cs-checks"><label><input type="checkbox" checked={shuffle} onChange={event => setShuffle(event.target.checked)}/><Shuffle size={16}/>{c.shuffle}</label><label><input type="checkbox" checked={starredOnly} onChange={event => setStarredOnly(event.target.checked)}/><Star size={16}/>{c.starredOnly} ({stars.length})</label>{type === 'word' && <CardIllustrationToggle/>}</div>
      {error && <p className="cs-alert" role="alert">{error}</p>}{saveNotice}<div className="cs-actions"><button className="button primary" onClick={() => start()}>{resume ? c.restart : c.start}<ArrowRight size={17}/></button>{!resume && last >= 0 && last < cards.length - 1 && <button className="button" onClick={() => start(true)}>{c.continue}</button>}</div>{!resume && last >= 0 && <p className="cs-muted">{c.lastPosition}</p>}
    </div></section>;
  if (session.finished) {const correctCount = session.outcomes.filter(item => item.correct).length, wrongCount = session.outcomes.length - correctCount; const nextMode = mode === 'memorize' ? 'recall' : mode === 'recall' ? 'spell' : 'test', nextHref = `/student/cards/${distributionId}/${nextMode}${from && nextMode !== 'test' ? `?from=${encodeURIComponent(from)}${to ? `&to=${encodeURIComponent(to)}` : ''}` : ''}`; return <section className="cs-study"><div className="cs-study-top">{exit}</div><div className="cs-finish"><CardBuddy character={character} happy/><CheckCircle2 size={34}/><h1>{c.doneTitle}</h1><p>{c.doneBody}</p>{isPreview ? <p className="cs-preview-note">{c.preview}</p> : answersLost || saveFailed ? saveNotice : <p className="cs-save-status" role="status">{unsaved ? <><LoaderCircle className="spin" size={16}/>{c.saving}</> : <><Check size={16}/>{c.saved}</>}</p>}<dl className="cs-result-grid"><div><dt>{c.answered}</dt><dd>{session.outcomes.length}</dd></div><div><dt>{c.correctCount}</dt><dd>{correctCount}</dd></div><div><dt>{c.wrongCount}</dt><dd>{wrongCount}</dd></div></dl><div className="cs-actions"><button className="button" onClick={closeSession}><RotateCcw size={16}/>{c.restart}</button>{wrongCount > 0 && <button className="button" onClick={() => start(false, true)}>{c.retryWrong}</button>}{!isPreview && <Link className="button primary" href={nextHref} onClick={event => leave(event, nextHref)}>{c[nextMode]}<ArrowRight size={17}/></Link>}</div></div></section>;}
  if (!card || !content) return <CardError retry={() => setSession(null)}/>;
  return <section className="cs-study"><div className="cs-study-top">{exit}<span>{c[mode]} <strong>{session.index + 1} / {session.queue.length}</strong></span></div>{isPreview && <p className="cs-preview-note">{c.preview}</p>}<progress className="cs-progress" value={session.index} max={session.queue.length} aria-label={c.progress}/><header className="cs-session-title"><h1>{title}</h1><CardBuddy character={character} happy={feedback?.correct}/></header>
    <div className="cs-flashcard"><div className="cs-card-toolbar"><span className="cs-tag">{c[mode]}</span><div>{type === 'word' && <CardIllustrationToggle/>}<button className="icon-button" aria-label={stars.includes(card.id) ? c.unstar : c.star} aria-pressed={stars.includes(card.id)} onClick={() => void toggleStar()} disabled={starBusy}><Star size={21} fill={stars.includes(card.id) ? 'currentColor' : 'none'}/></button>{canSpeak && <button className="icon-button" aria-label={c.listen} onClick={() => speak()}><Volume2 size={22}/></button>}</div></div>
      <div className="ci-study-word"><CardIllustration card={card} type={type} enabled={mode === 'memorize' || !!feedback} showCaption={revealed || !!feedback}/><p className="cs-prompt" lang={/[가-힣]/.test(content.prompt) ? 'ko' : 'en'}>{content.prompt}</p></div>
      {mode === 'memorize' && <div className={`cs-card-back ${revealed || feedback ? 'is-revealed' : ''}`}>{revealed || feedback ? <><p className="cs-expected">{content.expected}</p>{card.example && <p className="cs-example">{card.example}</p>}</> : <button className="cs-reveal" onClick={() => setRevealed(true)}><BookOpen size={23}/>{c.reveal}<small>Space</small></button>}</div>}
      {mode === 'recall' && !sentenceRecall && <><p className="cs-instruction">{c.choose}</p><div className="cs-choices">{choices.map((choice, index) => <button key={choice} className={`cs-choice ${feedback && normalize(choice) === normalize(feedback.expected) ? 'is-correct' : ''}`} disabled={!!feedback} onClick={() => {setAnswer(choice); check(choice);}}><kbd>{index + 1}</kbd><span>{choice}</span></button>)}</div></>}
      {sentenceRecall && <><p className="cs-instruction">{c.arrange}</p><div className="cs-token-answer" aria-label={c.sentenceAnswer}>{selectedTokens.map((id, index) => <button key={id} className="cs-token" disabled={!!feedback} onClick={() => setSelectedTokens(value => value.filter(item => item !== id))}>{tokens.find(item => item.id === id)?.text}<span className="cs-sr-only"> {index + 1}</span></button>)}</div><div className="cs-tokens">{tokens.map((token, index) => <button className="cs-token" key={token.id} disabled={selectedTokens.includes(token.id) || !!feedback} onClick={() => setSelectedTokens(value => [...value, token.id])}>{token.text}<small>{index < 9 ? index + 1 : ''}</small></button>)}</div>{!feedback && <button className="cs-text-button" onClick={() => setSelectedTokens([])}>{c.clear}</button>}</>}
      {mode === 'spell' && <form onSubmit={(event: FormEvent) => {event.preventDefault(); check();}}><label htmlFor="card-study-answer">{c.answer}</label><input id="card-study-answer" ref={inputRef} className="cs-answer" value={answer} maxLength={STUDY_ANSWER_LIMIT} onChange={event => setAnswer(event.target.value)} disabled={!!feedback} placeholder={c.placeholder} autoComplete="off" autoCapitalize="none" spellCheck={false}/>{!feedback && <div className="cs-hint"><button type="button" className="cs-text-button" onClick={() => {setHintIndex(session.index); inputRef.current?.focus();}}><Lightbulb size={15}/>{c.hintButton}</button>{hintIndex === session.index && (() => {const hint = spellHint(content.expected); return <p role="status"><b>{hint.first}</b> {(hint.words > 1 ? c.hintLengthWords : c.hintLength).replace('{length}', String(hint.length)).replace('{words}', String(hint.words))}</p>;})()}<small>{c.spellNote}</small></div>}</form>}
      {feedback && <div className={`cs-feedback ${feedback.correct ? 'is-correct' : 'is-incorrect'}`} role="status"><strong>{feedback.correct ? <CheckCircle2 size={20}/> : <RotateCcw size={20}/>} {feedback.correct ? c.correct : c.incorrect}</strong>{mode !== 'memorize' && <p>{c.correctAnswer}: <b>{feedback.expected}</b></p>}</div>}
    </div>
    {(error || starError) && <div className="cs-alert" role="alert"><p>{error || c.saveError}</p></div>}{saveNotice}
    <div className="cs-study-controls">{feedback ? <><span className="cs-muted">{!answersLost && <><Check size={16}/>{isPreview ? c.preview : unsaved ? c.saveQueued : c.saved}</>}</span><button className="button primary" autoFocus onKeyDown={event => {if (event.repeat) event.preventDefault();}} onClick={next}>{c.next}<ChevronRight size={18}/></button></> : mode === 'memorize' ? revealed ? <><button className="button" onClick={again}><RotateCcw size={17}/>{c.again}</button><button className="button primary" onClick={() => check('')}><Check size={17}/>{c.remember}</button></> : <button className="button primary" onClick={() => setRevealed(true)}>{c.reveal}</button> : (mode === 'spell' || sentenceRecall) ? <button className="button primary" disabled={sentenceRecall ? selectedTokens.length !== tokens.length : !answer.trim()} onClick={() => check(sentenceRecall ? selectedTokens.map(id => tokens.find(item => item.id === id)?.text).join(' ') : answer)}>{c.check}<Check size={17}/></button> : null}</div>
    <div className="cs-study-foot"><p><Keyboard size={16}/>{c.keyboard}</p><CardSoundSettings/>{canSpeak ? <label>{c.speed}<select value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[...new Set([0.5, 0.7, 1, 1.2, 1.5, speed])].sort((a, b) => a - b).map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label> : <p>{c.speechUnavailable}</p>}</div>{speechFailed && <p className="cs-muted" role="status">{c.speechUnavailable}</p>}
  </section>;
}

function CardsLocalTestPreview({title, cards, onClose}: {title: string; cards: CardEntry[]; onClose?: () => void}) {
  const {copy: c} = useCardCopy(); const [answers, setAnswers] = useState<Record<string, string>>({}), [submitted, setSubmitted] = useState(false);
  const correct = cards.filter(card => [card.back, ...card.alternatives].some(value => normalize(value) === normalize(answers[card.id] || ''))).length;
  return <section className="cs-study"><div className="cs-study-top"><h2>{title} · {c.test}</h2>{onClose && <button className="button" onClick={onClose}><X size={16}/>{c.closePreview}</button>}</div><p className="cs-preview-note">{c.preview}</p><form onSubmit={event => {event.preventDefault(); setSubmitted(true);}}>{cards.map((card, index) => <div className="cs-test-question" key={card.id}><label htmlFor={`preview-${card.id}`}>{index + 1}. {card.front}</label><input id={`preview-${card.id}`} required disabled={submitted} value={answers[card.id] || ''} onChange={event => setAnswers(value => ({...value, [card.id]: event.target.value}))} autoComplete="off"/>{submitted && <p>{c.correctAnswer}: {card.back}</p>}</div>)}{submitted ? <div className="cs-finish"><h3>{Math.round(correct / Math.max(1, cards.length) * 100)} {c.score}</h3><p>{c.testPreview}</p><button type="button" className="button" onClick={() => {setSubmitted(false); setAnswers({});}}>{c.restart}</button></div> : <button className="button primary" type="submit" disabled={!cards.length}>{c.testSubmit}</button>}</form></section>;
}

/**
 * One review session: today's due cards in one set, or missed cards gathered from several sets. Answers grade here at once and go to each set's
 * study endpoint with review:true in batches, so the server re-grades them, moves the review dates and clears reviewed misses. Nothing counts toward required study.
 */
export function CardsReviewSession({items, title, intro, backHref, onReload}: {items: CardReviewItem[]; title: string; intro: string; backHref: string; onReload?: () => void}) {
  const {copy: c} = useCardCopy(), r = useReviewCopy();
  const [index, setIndex] = useState(0), [answer, setAnswer] = useState(''), [feedback, setFeedback] = useState<{correct: boolean; expected: string} | null>(null), [outcomes, setOutcomes] = useState<boolean[]>([]);
  const [unsaved, setUnsaved] = useState(0), [saving, setSaving] = useState(false), [failed, setFailed] = useState(false), [dropped, setDropped] = useState(false);
  const outboxes = useRef(new Map<string, StudyOutbox>()), flushing = useRef<Promise<void> | null>(null), inputRef = useRef<HTMLInputElement>(null), sound = useCardSound();
  const item = items[index] as CardReviewItem | undefined, finished = index >= items.length;
  const content = item ? textFor(item.card, item.direction) : null;
  const size = () => [...outboxes.current.values()].reduce((total, outbox) => total + studyOutboxSize(outbox), 0);
  const post = (distributionId: string, batch: StudyBatch, keepalive = false) => cardRequest(`/api/cards/distributions/${distributionId}/study`, {method: 'POST', keepalive, body: JSON.stringify({...batch, review: true})});
  const pump = useCallback(() => {
    if (flushing.current) return flushing.current;
    flushing.current = (async () => {
      setSaving(true); setFailed(false);
      try {
        // Batches sealed while this loop runs (the last answer, say) are picked up before it ends.
        for (let next = [...outboxes.current].find(([, outbox]) => outbox.sealed.length); next; next = [...outboxes.current].find(([, outbox]) => outbox.sealed.length)) {
          const [distributionId, {sealed: [batch]}] = next;
          // A closed set, a passed deadline or changed cards will never take these answers; drop them and say so instead of retrying forever.
          await post(distributionId, batch).catch(cause => {if (!(cause instanceof Error && (cause.message === 'DUE_CLOSED' || cause.message === 'NOT_FOUND' || staleStudyBatch(cause.message)))) throw cause; setDropped(true);});
          outboxes.current.set(distributionId, settleStudyBatch(outboxes.current.get(distributionId)!, batch.requestId));
        }
      } catch {setFailed(true);} finally {flushing.current = null; setSaving(false); setUnsaved(size());}
    })();
    return flushing.current;
  }, []);
  const sealAll = useCallback(() => {for (const [distributionId, outbox] of outboxes.current) outboxes.current.set(distributionId, sealStudyBuffer(outbox, 'recall', newRequestId));}, []);
  useEffect(() => {
    const sendNow = () => {if (!size()) return; sealAll(); for (const [distributionId, outbox] of outboxes.current) for (const batch of keepaliveStudyBatches(outbox)) void post(distributionId, batch, true).catch(() => {});};
    const hidden = () => {if (document.visibilityState === 'hidden') sendNow();};
    window.addEventListener('pagehide', sendNow); document.addEventListener('visibilitychange', hidden);
    return () => {window.removeEventListener('pagehide', sendNow); document.removeEventListener('visibilitychange', hidden); sendNow();};
  }, [sealAll]);
  useEffect(() => {inputRef.current?.focus();}, [index]);
  function check(value: string) {
    if (!item || feedback || !value.trim()) return;
    const {correct, expected} = gradeCardAnswer(item.card, 'recall', item.direction, value);
    const outbox = addStudyResponse(outboxes.current.get(item.distributionId) ?? emptyStudyOutbox(), {cardId: item.card.id, answer: value, direction: item.direction}, 'recall', newRequestId);
    outboxes.current.set(item.distributionId, outbox); setUnsaved(size());
    setFeedback({correct, expected}); setOutcomes(previous => [...previous, correct]); sound.play(correct ? 'good' : 'bad');
    if (outbox.sealed.length) void pump();
  }
  function next() {
    if (!feedback) return;
    setFeedback(null); setAnswer(''); setIndex(value => value + 1);
    if (index + 1 >= items.length) {sealAll(); void pump();}
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || finished || !item) return;
      const target = event.target as HTMLElement;
      if (target.closest('button,a,select,textarea,input[type="checkbox"],input[type="radio"]') || target.tagName === 'INPUT' && event.key !== 'Enter') return;
      if (event.key === 'Enter' && feedback) {event.preventDefault(); next();}
      if (/^[1-9]$/.test(event.key) && !feedback && item.choices?.[Number(event.key) - 1]) check(item.choices[Number(event.key) - 1]);
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const exit = <Link className="cs-back" href={backHref}><ArrowLeft size={16}/>{c.exit}</Link>;
  const status = dropped ? <p className="cs-alert" role="alert">{r.reviewDropped}</p> : failed ? <div className="cs-alert" role="alert"><p>{c.saveError}</p><button className="button" disabled={saving} onClick={() => {sealAll(); void pump();}}><RefreshCw size={16}/>{c.retrySave}</button></div> : null;
  if (finished) {
    const right = outcomes.filter(Boolean).length;
    return <section className="cs-study"><div className="cs-study-top">{exit}</div><div className="cs-finish"><CardBuddy happy/><CheckCircle2 size={34}/><h1>{r.reviewDone}</h1><p>{r.reviewDoneBody}</p>{status ?? <p className="cs-save-status" role="status">{unsaved || saving ? <><LoaderCircle className="spin" size={16}/>{c.saving}</> : <><Check size={16}/>{c.saved}</>}</p>}<dl className="cs-result-grid"><div><dt>{c.answered}</dt><dd>{outcomes.length}</dd></div><div><dt>{c.correctCount}</dt><dd>{right}</dd></div><div><dt>{c.wrongCount}</dt><dd>{outcomes.length - right}</dd></div></dl><div className="cs-actions"><Link className="button" href={backHref}><ArrowLeft size={16}/>{c.back}</Link>{onReload && <button className="button primary" disabled={!!unsaved || saving} onClick={onReload}><RotateCcw size={16}/>{r.reviewAgain}</button>}</div></div></section>;
  }
  if (!item || !content) return null;
  return <section className="cs-study"><div className="cs-study-top">{exit}<span>{title} <strong>{index + 1} / {items.length}</strong></span></div><progress className="cs-progress" value={index} max={items.length} aria-label={c.progress}/><header className="cs-session-title"><div><h1>{title}</h1>{index === 0 && <p className="cs-muted">{intro}</p>}</div><CardBuddy happy={feedback?.correct}/></header>
    <div className="cs-flashcard"><div className="cs-card-toolbar"><span className="cs-tag">{c.recall}</span><span className="cs-review-from">{r.reviewSet} · {item.title}</span><CardIllustrationToggle/></div>
      <div className="ci-study-word"><CardIllustration card={item.card} enabled={!!feedback} showCaption/><p className="cs-prompt" lang={/[가-힣]/.test(content.prompt) ? 'ko' : 'en'}>{content.prompt}</p></div>
      {item.choices ? <><p className="cs-instruction">{c.choose}</p><div className="cs-choices">{item.choices.map((choice, position) => <button key={choice} className={`cs-choice ${feedback && normalize(choice) === normalize(feedback.expected) ? 'is-correct' : ''}`} disabled={!!feedback} onClick={() => {setAnswer(choice); check(choice);}}><kbd>{position + 1}</kbd><span>{choice}</span></button>)}</div></>
        : <form onSubmit={event => {event.preventDefault(); check(answer);}}><label htmlFor="card-review-answer">{c.answer}</label><input id="card-review-answer" ref={inputRef} className="cs-answer" value={answer} maxLength={STUDY_ANSWER_LIMIT} onChange={event => setAnswer(event.target.value)} disabled={!!feedback} placeholder={r.typeAnswer} autoComplete="off" autoCapitalize="none" spellCheck={false}/></form>}
      {feedback && <div className={`cs-feedback ${feedback.correct ? 'is-correct' : 'is-incorrect'}`} role="status"><strong>{feedback.correct ? <CheckCircle2 size={20}/> : <RotateCcw size={20}/>} {feedback.correct ? c.correct : c.incorrect}</strong><p>{c.correctAnswer}: <b>{feedback.expected}</b></p></div>}
    </div>
    {status}
    <div className="cs-study-controls">{feedback ? <><span className="cs-muted"><Check size={16}/>{unsaved ? c.saveQueued : c.saved}</span><button className="button primary" autoFocus onClick={next}>{c.next}<ChevronRight size={18}/></button></> : !item.choices && <button className="button primary" disabled={!answer.trim()} onClick={() => check(answer)}>{c.check}<Check size={17}/></button>}</div>
  </section>;
}
