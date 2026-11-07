'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Clock3, Layers, ListChecks, LoaderCircle, RefreshCw, Search, Star, Type} from 'lucide-react';
import {buildCardSections, CARD_SECTION_SIZE, CARD_SECTION_SIZES, formatCountdown, testDeadline, testFormat, testTimeLimit} from '@/lib/cards-logic';
import type {CardCoverage, CardDistribution, CardProgress, CardStudentDistribution, CardStudyMode, CardTestAttempt} from '@/lib/cards-types';
import type {Character} from '@/lib/characters';
import {CardBuddy, CardError, CardLoading, CardsPractice, cardModes, cardRequest, useCardCopy} from './cards-study';
import {CardSectionProgress} from './cards-visuals';

type StudentCardsData = {distributions: CardStudentDistribution[]; profile?: {id: string; name: string; character: Character; className: string}; nextCursor?: string | null};
type StudentDetail = {distribution: CardDistribution; progress: CardProgress; coverage?: Partial<CardCoverage>};
const modeIcons = {memorize: BookOpen, recall: ListChecks, spell: Type, test: ClipboardCheck};
function studied(progress: CardProgress, mode: CardStudyMode) {return progress.completedCounts?.[mode] || 0;}
// Answers survive a closed tab, so they live in localStorage. Drafts from the earlier sessionStorage version are still read.
const readDraft = (key: string) => {try {return localStorage.getItem(key) ?? sessionStorage.getItem(key);} catch {return null;}};
const writeDraft = (key: string, value: unknown) => {try {localStorage.setItem(key, JSON.stringify(value));} catch {}};
const clearDraft = (...keys: string[]) => {try {for (const key of keys) {localStorage.removeItem(key); sessionStorage.removeItem(key);}} catch {}};
function useStudentCards() {
  const [data, setData] = useState<StudentCardsData | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const load = useCallback(async () => {setLoading(true); setError(false); try {setData(await cardRequest<StudentCardsData>('/api/cards/student'));} catch {setError(true);} finally {setLoading(false);}}, []);
  useEffect(() => {void load();}, [load]);
  return {data, setData, loading, error, load};
}
export default function StudentCardsList() {
  const {copy: c, locale, points} = useCardCopy(), {data, setData, loading, error, load} = useStudentCards();
  const [search, setSearch] = useState(''), [moreBusy, setMoreBusy] = useState(false), [moreError, setMoreError] = useState(false);
  const filtered = data?.distributions.filter(item => item.title.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale))) || [];
  async function loadMore() {if (!data?.nextCursor || moreBusy) return; setMoreBusy(true); setMoreError(false); try {const next = await cardRequest<StudentCardsData>(`/api/cards/student?cursor=${encodeURIComponent(data.nextCursor)}`); setData(previous => previous ? {...previous, distributions: [...previous.distributions, ...next.distributions.filter(item => !previous.distributions.some(old => old.id === item.id))], nextCursor: next.nextCursor} : next);} catch {setMoreError(true);} finally {setMoreBusy(false);}}
  if (loading) return <CardLoading/>;
  if (error || !data) return <CardError retry={() => void load()}/>;
  return <section className="cs-workspace"><header className="cs-heading"><div><p className="cs-eyebrow"><Layers size={17}/>{c.title}{data.profile?.className && <span> / {data.profile.className}</span>}</p><h1>{c.ourSets}</h1><p>{c.listIntro}</p></div><CardBuddy character={data.profile?.character}/></header>
    <div className="cs-list-toolbar"><label className="cs-search"><Search size={18}/><span className="cs-sr-only">{c.search}</span><input type="search" placeholder={c.search} value={search} onChange={event => setSearch(event.target.value)}/></label><button className="icon-button" aria-label={c.refresh} onClick={() => void load()}><RefreshCw size={18}/></button></div>
    {!data.distributions.length ? <div className="cs-state"><Layers size={36}/><h2>{c.empty}</h2><p>{c.emptyBody}</p></div> : !filtered.length ? <div className="cs-state"><Search size={30}/><p>{c.noResults}</p></div> : <div className="cs-distributions">{filtered.map(item => <article className="cs-distribution" key={item.id}><div className="cs-set-icon"><Layers size={26}/></div><div className="cs-set-copy"><div className="cs-meta"><span>{c[item.type]}</span><span>{item.cardCount} {c.cards}</span>{item.progress.studyComplete && <span className="cs-tag"><CheckCircle2 size={13}/>{c.requiredComplete}</span>}</div><h2><Link href={`/student/cards/${item.id}`}>{item.title}</Link></h2><div className="cs-mode-summary">{cardModes.map(mode => {const goal = item.requiredModes[mode].requiredCount; return <span key={mode}><b>{c[mode]}</b>{goal > 0 ? <>{studied(item.progress, mode)}/{goal}<small>{c.required}</small></> : <small>{c.optional}</small>}</span>;})}</div><div className="cs-meta"><span><Clock3 size={13}/>{item.dueAt ? `${c.due} ${new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric'}).format(new Date(item.dueAt))}` : c.noDue}</span><span>{c.testGoal} {points(item.test.goalScore)}</span></div></div><Link href={`/student/cards/${item.id}`} className="button soft" aria-label={`${item.title} · ${c.open}`}>{c.open}<ArrowRight size={17}/></Link></article>)}</div>}
    {moreError && <p className="cs-alert" role="alert">{c.error}</p>}{data.nextCursor && <button className="button cs-load-more" disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy ? <LoaderCircle size={17} className="spin"/> : null}{moreError ? c.retry : c.more}</button>}
  </section>;
}

export function StudentCardsDetail({distributionId}: {distributionId: string}) {
  const {copy: c, locale, points} = useCardCopy(); const [data, setData] = useState<StudentDetail | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(false), [sectionSize, setSectionSize] = useState(CARD_SECTION_SIZE);
  const load = useCallback(async () => {setLoading(true); setError(false); try {setData(await cardRequest<StudentDetail>(`/api/cards/distributions/${distributionId}`));} catch {setError(true);} finally {setLoading(false);}}, [distributionId]);
  useEffect(() => {void load();}, [load]);
  if (loading) return <CardLoading/>;
  if (error || !data) return <CardError retry={() => void load()}/>;
  const {distribution: d, progress, coverage} = data;
  const sections = buildCardSections(d.snapshot.cards, d.requiredModes, coverage, sectionSize);
  return <section className="cs-workspace"><Link className="cs-back" href="/student/cards"><ArrowLeft size={16}/>{c.back}</Link><header className="cs-heading"><div><div className="cs-meta"><span className="cs-tag">{c[d.type]}</span><span>{d.cardCount} {c.cards}</span><span>{d.className}</span></div><h1>{d.title}</h1>{d.snapshot.description && <p>{d.snapshot.description}</p>}<p className="cs-muted">{d.dueAt ? `${c.due} ${new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(d.dueAt))}` : c.noDue}</p></div><CardBuddy/></header>
    <section aria-labelledby="card-tools-heading"><h2 id="card-tools-heading" className="cs-section-title">{c.studyTools}</h2><div className="cs-mode-grid">{[...cardModes, 'test' as const].map(mode => {const Icon = modeIcons[mode], required = mode === 'test' ? d.test.goalScore : d.requiredModes[mode].requiredCount, amount = mode === 'test' ? progress.bestScore || 0 : studied(progress, mode); return <Link className={`cs-mode cs-mode-${mode}`} key={mode} href={`/student/cards/${distributionId}/${mode}`}><span className="cs-mode-icon"><Icon size={25}/></span><h3>{c[mode]}<ArrowRight size={17}/></h3><p>{mode === 'test' ? `${c.goal} ${points(required)}` : required > 0 ? `${c.required} ${amount} / ${required}` : c.optional}</p>{required > 0 && <progress max={required} value={Math.min(required, amount)} aria-label={`${c[mode]} ${c.practiceCounts}`}/>}</Link>;})}</div></section>
    <section aria-labelledby="card-sections-heading" className="cs-sections-wrap"><div className="cs-card-list-title"><h2 id="card-sections-heading">{c.sections}</h2><label className="cs-section-size">{c.sectionSize}<select value={sectionSize} onChange={event => setSectionSize(Number(event.target.value))}>{CARD_SECTION_SIZES.map(value => <option key={value} value={value}>{value} {c.cards}</option>)}</select></label></div><ol className="cs-sections">{sections.map(section => <li key={section.from}><div className="cs-section-copy"><b>{c.sectionLabel.replace('{number}', String(section.number))}</b><span>{section.from}–{section.to}</span></div><CardSectionProgress steps={cardModes.filter(mode => section.modes[mode]).map(mode => ({label: c[mode], percent: section.modes[mode]!.percent}))}/><div className="cs-section-modes">{cardModes.map(mode => {const value = section.modes[mode]; return value && <Link key={mode} className={`cs-section-mode ${value.done ? 'is-done' : ''}`} href={`/student/cards/${distributionId}/${mode}?from=${value.from}&to=${value.to}`} aria-label={`${c.sectionLabel.replace('{number}', String(section.number))} ${c[mode]}${value.done ? ` · ${c.complete}` : ''}`}>{value.done && <CheckCircle2 size={13}/>}{c[mode]}</Link>;})}</div></li>)}</ol></section>
    <div className="cs-goal-strip"><span><ClipboardCheck size={19}/>{c.testGoal}{" "}<b>{points(d.test.goalScore)}</b></span><span>{c.attempts} {progress.attempts} / {d.test.maxAttempts || c.unlimited}</span><span>{c.best}{" "}<b>{progress.bestScore === null ? '—' : points(progress.bestScore)}</b></span><span>{c.latest}{" "}<b>{progress.latestScore === null ? '—' : points(progress.latestScore)}</b></span></div>
    <section aria-labelledby="card-list-heading"><div className="cs-card-list-title"><h2 id="card-list-heading">{c.cardList}</h2><span>{d.cardCount} {c.cards}</span></div><div className="cs-card-table"><div className="cs-card-table-head" aria-hidden="true"><span>#</span><span>{c.front}</span><span>{c.backSide}</span></div><ol>{d.snapshot.cards.map((card, index) => <li key={card.id}><span className="cs-card-number">{progress.starredCardIds.includes(card.id) ? <Star size={15} fill="currentColor" aria-label={c.star}/> : index + 1}</span><p>{card.front}</p><div><p>{card.back}</p>{card.example && <small>{card.example}</small>}</div></li>)}</ol></div></section>
  </section>;
}

export function StudentCardsStudy({distributionId, mode, from, to}: {distributionId: string; mode: CardStudyMode | 'test'; from?: string; to?: string}) {
  if (mode === 'test') return <StudentCardsTest distributionId={distributionId}/>;
  return <StudentPracticeLoader distributionId={distributionId} mode={mode} from={from} to={to}/>;
}
function StudentPracticeLoader({distributionId, mode, from, to}: {distributionId: string; mode: CardStudyMode; from?: string; to?: string}) {
  const [data, setData] = useState<StudentDetail | null>(null), [character, setCharacter] = useState<Character>('cat'), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const load = useCallback(async () => {setLoading(true); setError(false); try {const result = await cardRequest<StudentDetail>(`/api/cards/distributions/${distributionId}`); setData(result); const profile = await cardRequest<StudentCardsData>('/api/cards/student').catch(() => null); if (profile?.profile) setCharacter(profile.profile.character);} catch {setError(true);} finally {setLoading(false);}}, [distributionId]);
  useEffect(() => {void load();}, [load]);
  if (loading) return <CardLoading/>;
  if (error || !data) return <CardError retry={() => void load()}/>;
  return <CardsPractice key={`${distributionId}:${mode}:${from}:${to}`} from={from} to={to} title={data.distribution.title} cards={data.distribution.snapshot.cards} type={data.distribution.type} mode={mode} distributionId={distributionId} studentId={data.distribution.targetStudentIds[0]} requirement={data.distribution.requiredModes[mode]} progress={data.progress} character={character} onProgress={progress => setData(previous => previous ? {...previous, progress} : previous)}/>;
}

function StudentCardsTest({distributionId}: {distributionId: string}) {
  const {copy: c, locale, points} = useCardCopy();
  const [distribution, setDistribution] = useState<CardStudentDistribution | null>(null), [profile, setProfile] = useState<StudentCardsData['profile']>(), [attempts, setAttempts] = useState<CardTestAttempt[]>([]), [attempt, setAttempt] = useState<CardTestAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({}), [pendingSubmit, setPendingSubmit] = useState<Record<string, string> | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const requestId = useRef({id: '', retryWrong: false}), operationBusy = useRef(false), clockOffset = useRef(0), autoSubmitted = useRef(''), autoOpened = useRef(false), submitRef = useRef<(auto?: boolean) => Promise<void>>(async () => {});
  // The countdown runs on server time, so a wrong tablet clock cannot end a test early.
  const syncClock = (serverTime?: string) => {if (serverTime && Number.isFinite(Date.parse(serverTime))) clockOffset.current = Date.parse(serverTime) - Date.now();};
  const draftKey = (attemptId: string) => `cards-test-draft:${profile?.id || ''}:${distributionId}:${attemptId}`;
  const submitKey = (attemptId: string) => `cards-test-submit:${profile?.id || ''}:${distributionId}:${attemptId}`;
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [data, history] = await Promise.all([cardRequest<StudentCardsData>('/api/cards/student'), cardRequest<{attempts: CardTestAttempt[]; serverTime?: string}>(`/api/cards/distributions/${distributionId}/tests`)]);
      syncClock(history.serverTime);
      let found = data.distributions.find(item => item.id === distributionId);
      let cursor = data.nextCursor;
      while (!found && cursor) {const next = await cardRequest<StudentCardsData>(`/api/cards/student?cursor=${encodeURIComponent(cursor)}`); found = next.distributions.find(item => item.id === distributionId); cursor = next.nextCursor;}
      if (!found) throw new Error('NOT_FOUND');
      setDistribution(found); setProfile(data.profile); setAttempts(history.attempts);
      requestId.current = {id: '', retryWrong: false};
      try {for (const kind of ['all', 'wrong']) sessionStorage.removeItem(`cards-test-start:${data.profile?.id || ''}:${distributionId}:${kind}`);} catch {}
    } catch {setError(c.error);} finally {setLoading(false);}
  }, [distributionId, c.error]);
  useEffect(() => {void load();}, [load]);
  function selectAttempt(value: CardTestAttempt) {
    setError(''); setAttempt(value); setAnswers({}); setPendingSubmit(null);
    if (value.status === 'started') {
      try {
        const sent = JSON.parse(readDraft(submitKey(value.id)) || 'null');
        const cached = sent || JSON.parse(readDraft(draftKey(value.id)) || '{}');
        if (cached && typeof cached === 'object') {const restored = Object.fromEntries(value.questions.map(question => [question.id, typeof cached[question.id] === 'string' ? cached[question.id] : ''])); setAnswers(restored); if (sent) {setPendingSubmit(restored); setError(c.testSaveError);}}
      } catch {}
    } else clearDraft(draftKey(value.id), submitKey(value.id));
  }
  async function start(retryWrong = false) {
    if (operationBusy.current || !distribution) return;
    operationBusy.current = true; setBusy(true); setError('');
    const startKey = `cards-test-start:${profile?.id || ''}:${distributionId}:${retryWrong ? 'wrong' : 'all'}`;
    if (!requestId.current.id || requestId.current.retryWrong !== retryWrong) {try {const id = sessionStorage.getItem(startKey) || crypto.randomUUID(); requestId.current = {id, retryWrong}; sessionStorage.setItem(startKey, id);} catch {requestId.current = {id: crypto.randomUUID(), retryWrong};}}
    try {const result = await cardRequest<{attempt: CardTestAttempt; serverTime?: string}>(`/api/cards/distributions/${distributionId}/tests`, {method: 'POST', body: JSON.stringify({requestId: requestId.current.id, retryWrong})}); syncClock(result.serverTime); setAttempts(previous => [result.attempt, ...previous.filter(item => item.id !== result.attempt.id)]); selectAttempt(result.attempt); requestId.current = {id: '', retryWrong}; try {sessionStorage.removeItem(startKey);} catch {}}
    catch {setError(c.testStartError);} finally {operationBusy.current = false; setBusy(false);}
  }
  function answer(questionId: string, text: string) {const next = {...answers, [questionId]: text}; setAnswers(next); if (attempt) writeDraft(draftKey(attempt.id), next);}
  async function submit(auto = false) {
    if (!attempt || operationBusy.current) return;
    const submittedAnswers = pendingSubmit || answers;
    // Blank answers are only sent when time ran out; the first failed auto-submit keeps that allowance through pendingSubmit.
    if (!auto && !pendingSubmit && attempt.questions.some(question => !submittedAnswers[question.id]?.trim())) {setError(c.allAnswers); return;}
    operationBusy.current = true; setBusy(true); setError('');
    setPendingSubmit(submittedAnswers); writeDraft(submitKey(attempt.id), submittedAnswers);
    try {const result = await cardRequest<{attempt: CardTestAttempt; progress: CardProgress}>(`/api/cards/distributions/${distributionId}/tests/${attempt.id}/submit`, {method: 'POST', body: JSON.stringify({answers: attempt.questions.map(question => ({questionId: question.id, answer: submittedAnswers[question.id] || ''}))})}); setAttempt(result.attempt); setPendingSubmit(null); setAttempts(previous => previous.map(item => item.id === result.attempt.id ? result.attempt : item)); setDistribution(previous => previous ? {...previous, progress: result.progress} : previous); clearDraft(draftKey(attempt.id), submitKey(attempt.id));}
    catch {setError(c.testSaveError);} finally {operationBusy.current = false; setBusy(false);}
  }
  useEffect(() => {submitRef.current = submit;});
  const running = attempt?.status === 'started' ? attempt : null, limit = running?.timeLimitSeconds ?? null;
  useEffect(() => {
    if (!running || !limit) return;
    const deadline = testDeadline(running.startedAt, limit);
    const tick = () => {const left = deadline - (Date.now() + clockOffset.current); setTimeLeft(left); if (left <= 0 && autoSubmitted.current !== running.id) {autoSubmitted.current = running.id; void submitRef.current(true);}};
    tick(); const interval = setInterval(tick, 1000);
    return () => {clearInterval(interval); setTimeLeft(null);};
  }, [running?.id, running?.startedAt, limit]);
  useEffect(() => {
    // After a reload a timed test keeps counting, so reopen it rather than leaving the student on the summary.
    const started = attempts.find(item => item.status === 'started');
    if (!autoOpened.current && distribution && started?.timeLimitSeconds) {autoOpened.current = true; selectAttempt(started);}
  }, [attempts, distribution]);
  if (loading) return <CardLoading/>;
  if (!distribution) return <CardError retry={() => void load()}/>;
  const d = distribution, current = attempts.find(item => item.status === 'started');
  const remaining = d.test.maxAttempts ? Math.max(0, d.test.maxAttempts - attempts.length) : null;
  const locked = d.test.requireStudy && !d.progress.studyComplete;
  const expired = !!d.dueAt && Date.parse(d.dueAt) < Date.now();
  const canStart = !locked && remaining !== 0;
  const lastSubmitted = attempts.find(item => item.status === 'submitted');
  const hasWrong = !!lastSubmitted && (lastSubmitted.score ?? 100) < 100;
  const back = <Link className="cs-back" href={`/student/cards/${distributionId}`}><ArrowLeft size={16}/>{c.exit}</Link>;
  return <section className="cs-study"><div className="cs-study-top">{back}<span className="cs-tag">{c.test}</span></div><header className="cs-heading"><div><h1>{d.title}</h1><p>{c.testIntro}</p></div><CardBuddy character={profile?.character} happy={!!attempt && attempt.status === 'submitted' && (attempt.score || 0) >= d.test.goalScore}/></header>
    {error && <div className="cs-alert" role="alert">{error}</div>}
    {!attempt ? <><div className="cs-options"><h2>{c.test}</h2><dl className="cs-test-settings"><div><dt>{c.total}</dt><dd>{d.test.questionCount} {c.cards}</dd></div><div><dt>{c.goal}</dt><dd>{points(d.test.goalScore)}</dd></div><div><dt>{c.remaining}</dt><dd>{remaining === null ? c.unlimited : remaining}</dd></div><div><dt>{c.direction}</dt><dd>{d.test.direction === 'front-back' ? c.frontBack : c.backFront}</dd></div><div><dt>{c.testFormat}</dt><dd>{testFormat(d.test) === 'choice' ? c.formatChoice : c.formatWritten}</dd></div><div><dt>{c.timeLimit}</dt><dd>{testTimeLimit(d.test) ? `${Math.round(testTimeLimit(d.test)! / 60)}${c.minutes}` : c.noTimeLimit}</dd></div></dl>{testTimeLimit(d.test) && <p className="cs-muted">{c.timeUpNote}</p>}<p className="cs-muted">{d.test.answerRelease === 'immediate' ? c.immediateRelease : d.test.answerRelease === 'after-due' ? c.afterDueRelease : c.neverRelease}</p>{locked && <p className="cs-alert">{c.prerequisite}</p>}{remaining === 0 && !current && <p className="cs-muted">{c.attemptLimit}</p>}{expired && <p className="cs-muted">{c.expired}</p>}<div className="cs-actions">{current ? <button className="button primary" onClick={() => selectAttempt(current)}>{c.testContinue}<ArrowRight size={17}/></button> : <><button className="button primary" disabled={!canStart || busy} onClick={() => void start()}>{busy ? <LoaderCircle className="spin" size={17}/> : <ClipboardCheck size={17}/>} {c.testStart}</button>{hasWrong && <button className="button" disabled={!canStart || busy} onClick={() => void start(true)}>{c.wrongTest}</button>}</>}</div></div><section className="cs-history"><div className="cs-card-list-title"><h2>{c.testHistory}</h2><button className="icon-button" aria-label={c.refresh} onClick={() => void load()}><RefreshCw size={17}/></button></div>{!attempts.length ? <p className="cs-muted">{c.noAttempts}</p> : attempts.map(item => <button key={item.id} className="cs-history-row" onClick={() => selectAttempt(item)}><span>#{item.number} {item.retryWrong ? c.wrongTest : c.test}</span><span>{new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(new Date(item.startedAt))}</span><b>{item.status === 'started' ? c.testInProgress : points(item.score || 0)}</b><ArrowRight size={16}/></button>)}</section></> : attempt.status === 'started' ? <form onSubmit={event => {event.preventDefault(); void submit();}}><div className="cs-test-status"><span>{c.answeredQuestions}: {attempt.questions.filter(question => answers[question.id]?.trim()).length} / {attempt.questions.length}</span>{timeLeft !== null && <span className={`cs-timer ${timeLeft <= 60_000 ? 'is-low' : ''}`} role="timer" aria-label={`${c.timeLeft} ${formatCountdown(timeLeft)}`}><Clock3 size={15}/>{formatCountdown(timeLeft)}</span>}<span className="cs-muted">{c.draftSaved}</span></div>{attempt.questions.map((question, index) => question.choices?.length ? <fieldset className="cs-test-question" key={question.id}><legend><span>{index + 1}.</span> {question.prompt}</legend><div className="cs-test-choices">{question.choices.map(choice => <label key={choice} className={`cs-test-choice ${answers[question.id] === choice ? 'is-selected' : ''}`}><input type="radio" name={`test-${question.id}`} value={choice} checked={answers[question.id] === choice} onChange={() => answer(question.id, choice)} required disabled={busy || !!pendingSubmit}/><span>{choice}</span></label>)}</div></fieldset> : <div className="cs-test-question" key={question.id}><label htmlFor={`test-${question.id}`}><span>{index + 1}.</span> {question.prompt}</label><input id={`test-${question.id}`} value={answers[question.id] || ''} onChange={event => answer(question.id, event.target.value)} required disabled={busy || !!pendingSubmit} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={c.placeholder}/></div>)}<div className="cs-actions"><button type="button" className="button" disabled={busy} onClick={() => {setAttempt(null); setError('');}}>{c.close}</button><button type="submit" className="button primary" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin"/>{c.submitting}</> : <><ClipboardCheck size={17}/>{pendingSubmit ? c.retrySubmit : c.testSubmit}</>}</button></div></form> : <div className="cs-test-result"><div className="cs-finish"><CheckCircle2 size={32}/><h2>{c.testResult}</h2><strong className="cs-score">{attempt.score}<small>/ 100</small></strong><p>{(attempt.score || 0) >= d.test.goalScore ? c.goalReached : c.goalNotReached}</p></div>{attempt.answersVisible && attempt.results ? <ol className="cs-test-results">{attempt.questions.map((question, index) => {const result = attempt.results?.find(item => item.questionId === question.id); return <li key={question.id} className={result?.correct ? 'is-correct' : 'is-incorrect'}><h3>{index + 1}. {question.prompt}</h3><p><strong>{result?.correct ? c.correct : c.incorrect}</strong></p><p>{c.answer}: {result?.answer || '—'}</p>{result?.expectedAnswer !== undefined && <p>{c.correctAnswer}: <b>{result.expectedAnswer}</b></p>}</li>;})}</ol> : <p className="cs-release-note">{d.test.answerRelease === 'never' ? c.answersNever : c.answersHidden}</p>}<div className="cs-actions"><button className="button" onClick={() => {setAttempt(null); setError('');}}>{c.testHistory}</button><Link className="button" href={`/student/cards/${distributionId}/spell`}>{c.spell}<ArrowRight size={17}/></Link>{canStart && !current && <button className="button primary" disabled={busy} onClick={() => void start()}>{c.newTest}</button>}</div></div>}
  </section>;
}
