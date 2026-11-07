'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Clock3, Layers, ListChecks, LoaderCircle, RefreshCw, RotateCcw, Search, Star, Type} from 'lucide-react';
import {buildCardSections, CARD_SECTION_SIZE, CARD_SECTION_SIZES, cardAddDays, cardDueState, cardMastery, cardReviewDate, cardWeekStart, formatCountdown, testDeadline, testFormat, testTimeLimit} from '@/lib/cards-logic';
import type {CardCoverage, CardDistribution, CardEntry, CardMissSummary, CardProgress, CardReviewItem, CardReviewStates, CardStudentDistribution, CardStudyMode, CardTestAttempt} from '@/lib/cards-types';
import type {Character} from '@/lib/characters';
import {CardBuddy, CardError, CardLoading, CardsPractice, CardsReviewSession, cardModes, cardRequest, flushStudyOutbox, useCardCopy, useReviewCopy} from './cards-study';
import {CardMasterySteps, CardProgressRing} from './cards-visuals';
import {CardModeIcon, CardSectionProgress} from './cards-visuals';
import {CardGamesEntry} from './cards-games/entry';
import {studentRows, type CardStudentLayout} from '@/lib/cards-class-plan';
import {useCardsClassCopy} from '@/lib/cards-class-copy';
import '@/styles/cards-class.css';
import {CardRewardMoment} from './cards-rewards';
import {CardDayLoad, CardMinutes, CardSoundSettings, CardTestWait} from './cards-care';
import {cardEstimateMinutes} from '@/lib/cards-load';
import {studentAgenda} from '@/lib/cards-planner';
import {chunkCards} from '@/lib/cards-chunks';
import {StudentChunkPractice} from './cards-chunks';
import {Scissors} from 'lucide-react';
import {useCardsP2Copy} from '@/lib/cards-p2-copy';
import {fillCopy} from '@/lib/cards-class-copy';
import '@/styles/cards-p2.css';

type StudentCardsData = {distributions: CardStudentDistribution[]; layout?: CardStudentLayout; profile?: {id: string; name: string; character: Character; className: string}; nextCursor?: string | null; serverTime?: string; review?: CardMissSummary};
/** testActive: this student's test on the set is running, so the cards came without answers and study waits (시험 정답 보호). */
type StudentDetail = {distribution: CardDistribution; progress: CardProgress; coverage?: Partial<CardCoverage>; cardStates?: CardReviewStates; serverTime?: string; testActive?: {attemptId: string}};
/** The server's clock as of the last load, so a wrong device clock can neither close a set early nor keep it open. */
const clockOf = (serverTime?: string) => {const time = Date.parse(serverTime ?? ''); return Number.isFinite(time) ? time : Date.now();};
/** Sends what this device still holds once a screen has closed at the deadline, and says so if the server would not take it. */
function OutboxFlush({distributionId, studentId, onSaved}: {distributionId: string; studentId?: string; onSaved?: () => void}) {
  const {copy: c} = useCardCopy(), [dropped, setDropped] = useState(false);
  useEffect(() => {
    if (!studentId) return;
    let live = true;
    void flushStudyOutbox(distributionId, studentId).then(result => {if (!live) return; setDropped(result.dropped); if (result.saved) onSaved?.();});
    return () => {live = false;};
  }, [distributionId, studentId, onSaved]);
  return dropped ? <p className="cs-alert" role="alert">{c.dueLockedSave}</p> : null;
}
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
/** A class team game is joined by the room's code; there is no per-student banner yet. */
function CardRoomJoin() {
  const {copy: c} = useCardCopy(), router = useRouter(), [code, setCode] = useState(''), valid = /^\d{4}$/.test(code);
  return <form className="cs-room-join" onSubmit={event => {event.preventDefault(); if (valid) router.push(`/student/playground/room/${code}?from=cards`);}}><CardModeIcon mode="team" size={30}/><label htmlFor="cs-room-code">{c.roomJoinLabel}</label><input id="cs-room-code" inputMode="numeric" autoComplete="off" maxLength={4} placeholder={c.roomJoinPlaceholder} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))}/><button className="button" disabled={!valid}>{c.roomJoin}</button></form>;
}
export default function StudentCardsList() {
  const {copy: c, locale, points} = useCardCopy(), {data, setData, loading, error, load} = useStudentCards();
  const [search, setSearch] = useState(''), [moreBusy, setMoreBusy] = useState(false), [moreError, setMoreError] = useState(false), [view, setView] = useState<'list' | 'agenda'>('list'), p2 = useCardsP2Copy();
  const filtered = data?.distributions.filter(item => item.title.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale))) || [];
  // The teacher's order and 차시 메모 (hidden rows never reach here). A search shows the matching sets alone.
  const classCopy = useCardsClassCopy(), rows = studentRows(filtered, search.trim() ? null : data?.layout);
  async function loadMore() {if (!data?.nextCursor || moreBusy) return; setMoreBusy(true); setMoreError(false); try {const next = await cardRequest<StudentCardsData>(`/api/cards/student?cursor=${encodeURIComponent(data.nextCursor)}`); setData(previous => previous ? {...previous, distributions: [...previous.distributions, ...next.distributions.filter(item => !previous.distributions.some(old => old.id === item.id))], nextCursor: next.nextCursor} : next);} catch {setMoreError(true);} finally {setMoreBusy(false);}}
  if (loading) return <CardLoading/>;
  if (error || !data) return <CardError retry={() => void load()}/>;
  return <section className="cs-workspace"><header className="cs-heading"><div><p className="cs-eyebrow"><Layers size={17}/>{c.title}{data.profile?.className && <span> / {data.profile.className}</span>}</p><h1>{c.ourSets}</h1><p>{c.listIntro}</p></div><CardBuddy character={data.profile?.character}/></header>
    <CardRoomJoin/>
    {!!data.review?.total && <MissedReviewRow summary={data.review} today={cardReviewDate(clockOf(data.serverTime))}/>}
    <CardDayLoad rows={data.distributions} time={clockOf(data.serverTime)}/>
    <div className="cards-view-tabs" role="tablist" aria-label={p2.agendaView}>{(['list', 'agenda'] as const).map(item => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)}>{item === 'list' ? p2.listView : p2.agendaView}</button>)}</div>
    {view === 'agenda' ? <StudentAgenda rows={data.distributions} today={cardReviewDate(clockOf(data.serverTime))}/> : <>
    <div className="cs-list-toolbar"><label className="cs-search"><Search size={18}/><span className="cs-sr-only">{c.search}</span><input type="search" placeholder={c.search} value={search} onChange={event => setSearch(event.target.value)}/></label><CardSoundSettings/><button className="icon-button" aria-label={c.refresh} onClick={() => void load()}><RefreshCw size={18}/></button></div>
    {!data.distributions.length ? <div className="cs-state"><Layers size={36}/><h2>{c.empty}</h2><p>{c.emptyBody}</p></div> : !filtered.length ? <div className="cs-state"><Search size={30}/><p>{c.noResults}</p></div> : <div className="cs-distributions">{rows.map(row => row.kind === 'memo' ? <p className={`cs-plan-memo${row.highlight ? ' is-highlight' : ''}`} key={`memo:${row.id}`}><span className="cs-sr-only">{classCopy.memoRole}: </span>{row.text}</p> : (item => <article className={`cs-distribution${row.highlight ? ' is-highlight' : ''}`} key={item.id}><div className="cs-set-icon"><Layers size={26}/></div><div className="cs-set-copy"><div className="cs-meta"><span>{c[item.type]}</span><span>{item.cardCount} {c.cards}</span>{row.highlight && <span className="cs-pick"><Star size={13} fill="currentColor"/>{classCopy.teacherPick}</span>}{item.progress.studyComplete && <span className="cs-tag"><CheckCircle2 size={13}/>{c.requiredComplete}</span>}{cardDueState(item, clockOf(data.serverTime)) === 'lock' && <span className="cs-tag">{c.dueClosedTag}</span>}</div><h2><Link href={`/student/cards/${item.id}`}>{item.title}</Link></h2><div className="cs-mode-summary">{cardModes.map(mode => {const goal = item.requiredModes[mode].requiredCount; return <span key={mode}><b>{c[mode]}</b>{goal > 0 ? <>{studied(item.progress, mode)}/{goal}<small>{c.required}</small></> : <small>{c.optional}</small>}</span>;})}</div><div className="cs-meta"><span><Clock3 size={13}/>{item.dueAt ? `${c.due} ${new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric'}).format(new Date(item.dueAt))}` : c.noDue}</span><span>{c.testGoal} {points(item.test.goalScore)}</span><CardMinutes minutes={cardEstimateMinutes(item, item.progress)}/></div></div><Link href={`/student/cards/${item.id}`} className="button soft" aria-label={`${item.title} · ${c.open}`}>{c.open}<ArrowRight size={17}/></Link></article>)(row.distribution))}</div>}
    {moreError && <p className="cs-alert" role="alert">{c.error}</p>}{data.nextCursor && <button className="button cs-load-more" disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy ? <LoaderCircle size={17} className="spin"/> : null}{moreError ? c.retry : c.more}</button>}
    </>}
  </section>;
}
/** 학습 일정: the next two weeks of study days and deadlines, from the list the student already has. */
function StudentAgenda({rows, today}: {rows: CardStudentDistribution[]; today: string}) {
  const {copy: c, locale} = useCardCopy(), p2 = useCardsP2Copy(), agenda = studentAgenda(rows, today);
  const label = (date: string) => new Intl.DateTimeFormat(locale, {month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC'}).format(new Date(`${date}T00:00:00Z`));
  return <section className="cards-agenda" aria-label={p2.agendaView}>{agenda.days.length ? <ol>{agenda.days.map(day => <li key={day.date} className={day.today ? 'is-today' : ''}><h2>{label(day.date)}{day.today && <span className="cs-tag">{p2.today}</span>}</h2><ul>{day.entries.map(entry => <li key={`${entry.kind}:${entry.row.id}`} className={`cards-agenda-entry is-${entry.kind}`}><span className="cs-tag">{entry.kind === 'plan' ? p2.planKind : p2.dueKind}</span><Link href={`/student/cards/${entry.row.id}`}>{entry.row.title}</Link>{entry.row.progress.studyComplete && <span className="cs-pick"><CheckCircle2 size={13}/>{c.requiredComplete}</span>}</li>)}</ul></li>)}</ol> : <div className="cs-state"><Clock3 size={30}/><p>{p2.agendaEmpty}</p></div>}{agenda.later > 0 && <p className="cs-muted">{fillCopy(p2.agendaLater, {n: agenda.later})}</p>}</section>;
}

export function StudentCardsDetail({distributionId}: {distributionId: string}) {
  const {copy: c, locale, points} = useCardCopy(), p2 = useCardsP2Copy(); const [data, setData] = useState<StudentDetail | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(false), [sectionSize, setSectionSize] = useState(CARD_SECTION_SIZE);
  const load = useCallback(async () => {setLoading(true); setError(false); try {setData(await cardRequest<StudentDetail>(`/api/cards/distributions/${distributionId}`));} catch {setError(true);} finally {setLoading(false);}}, [distributionId]);
  useEffect(() => {void load();}, [load]);
  const refresh = useCallback(() => {void cardRequest<StudentDetail>(`/api/cards/distributions/${distributionId}`).then(setData).catch(() => {});}, [distributionId]);
  if (loading) return <CardLoading/>;
  if (error || !data) return <CardError retry={() => void load()}/>;
  const {distribution: d, progress, coverage} = data;
  const sections = buildCardSections(d.snapshot.cards, d.requiredModes, coverage, sectionSize), dueState = cardDueState(d, clockOf(data.serverTime)), closed = dueState === 'lock', testing = !!data.testActive;
  return <section className="cs-workspace"><Link className="cs-back" href="/student/cards"><ArrowLeft size={16}/>{c.back}</Link><header className="cs-heading"><div><div className="cs-meta"><span className="cs-tag">{c[d.type]}</span><span>{d.cardCount} {c.cards}</span><span>{d.className}</span></div><h1>{d.title}</h1>{d.snapshot.description && <p>{d.snapshot.description}</p>}<p className="cs-muted">{d.dueAt ? `${c.due} ${new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(d.dueAt))}` : c.noDue}</p><div className="cs-meta"><CardMinutes minutes={cardEstimateMinutes(d, progress)}/><CardSoundSettings/></div></div><CardBuddy/></header>
    {closed && <OutboxFlush distributionId={distributionId} studentId={d.targetStudentIds[0]} onSaved={refresh}/>}{closed ? <p className="cs-alert" role="status">{c.dueLocked}</p> : dueState === 'late' ? <p className="cs-release-note" role="status">{c.dueLate}</p> : null}
    {testing ? <CardTestWait distributionId={distributionId}/> : <CardMasteryPanel distributionId={distributionId} cards={d.snapshot.cards} states={data.cardStates ?? {}} today={cardReviewDate(clockOf(data.serverTime))} closed={closed}/>}
    <section aria-labelledby="card-tools-heading"><h2 id="card-tools-heading" className="cs-section-title">{c.studyTools}</h2><div className="cs-mode-grid">{[...cardModes, 'test' as const].map(mode => {const Icon = modeIcons[mode], required = mode === 'test' ? d.test.goalScore : d.requiredModes[mode].requiredCount, amount = mode === 'test' ? progress.bestScore || 0 : studied(progress, mode); const body = <><span className="cs-mode-icon"><Icon size={25}/></span><h3>{c[mode]}<ArrowRight size={17}/></h3><p>{mode === 'test' ? `${c.goal} ${points(required)}` : required > 0 ? `${c.required} ${amount} / ${required}` : c.optional}</p>{required > 0 && <progress max={required} value={Math.min(required, amount)} aria-label={`${c[mode]} ${c.practiceCounts}`}/>}</>; /* A locked test page stays reachable after an attempt: it finishes a started test and shows past results. */ return (closed && !(mode === 'test' && progress.attempts > 0)) || (testing && mode !== 'test') ? <div className={`cs-mode cs-mode-${mode} is-disabled`} key={mode} aria-disabled="true">{body}</div> : <Link className={`cs-mode cs-mode-${mode}`} key={mode} href={`/student/cards/${distributionId}/${mode}`}>{body}</Link>;})}</div></section>
    <CardGamesEntry distributionId={distributionId} closed={closed} testing={testing}/>
    {d.type === 'sentence' && chunkCards(d.snapshot.cards).length > 0 && !testing && !closed && <Link className="cards-chunk-entry" href={`/student/cards/${distributionId}/chunk`}><Scissors size={22}/><span><strong>{p2.chunk}</strong><small>{p2.chunkEntryHint}</small></span><ArrowRight size={17}/></Link>}
    {!testing && <><section aria-labelledby="card-sections-heading" className="cs-sections-wrap"><div className="cs-card-list-title"><h2 id="card-sections-heading">{c.sections}</h2><label className="cs-section-size">{c.sectionSize}<select value={sectionSize} onChange={event => setSectionSize(Number(event.target.value))}>{CARD_SECTION_SIZES.map(value => <option key={value} value={value}>{value} {c.cards}</option>)}</select></label></div><ol className="cs-sections">{sections.map(section => <li key={section.from}><div className="cs-section-copy"><b>{c.sectionLabel.replace('{number}', String(section.number))}</b><span>{section.from}–{section.to}</span></div><CardSectionProgress steps={cardModes.filter(mode => section.modes[mode]).map(mode => ({label: c[mode], percent: section.modes[mode]!.percent}))}/><div className="cs-section-modes">{cardModes.map(mode => {const value = section.modes[mode]; if (value && closed) return <span key={mode} className="cs-section-mode is-disabled" aria-disabled="true">{c[mode]}</span>; return value && <Link key={mode} className={`cs-section-mode ${value.done ? 'is-done' : ''}`} href={`/student/cards/${distributionId}/${mode}?from=${value.from}&to=${value.to}`} aria-label={`${c.sectionLabel.replace('{number}', String(section.number))} ${c[mode]}${value.done ? ` · ${c.complete}` : ''}`}>{value.done && <CheckCircle2 size={13}/>}{c[mode]}</Link>;})}</div></li>)}</ol></section>
    <div className="cs-goal-strip"><span><ClipboardCheck size={19}/>{c.testGoal}{" "}<b>{points(d.test.goalScore)}</b></span><span>{c.attempts} {progress.attempts} / {d.test.maxAttempts || c.unlimited}</span><span>{c.best}{" "}<b>{progress.bestScore === null ? '—' : points(progress.bestScore)}</b></span><span>{c.latest}{" "}<b>{progress.latestScore === null ? '—' : points(progress.latestScore)}</b></span></div>
    <section aria-labelledby="card-list-heading"><div className="cs-card-list-title"><h2 id="card-list-heading">{c.cardList}</h2><span>{d.cardCount} {c.cards}</span></div><div className="cs-card-table"><div className="cs-card-table-head" aria-hidden="true"><span>#</span><span>{c.front}</span><span>{c.backSide}</span></div><ol>{d.snapshot.cards.map((card, index) => <li key={card.id}><span className="cs-card-number">{progress.starredCardIds.includes(card.id) ? <Star size={15} fill="currentColor" aria-label={c.star}/> : index + 1}</span><p>{card.front}</p><div><p>{card.back}</p>{card.example && <small>{card.example}</small>}<CardLevelTag level={data.cardStates?.[card.id]?.l ?? 0}/></div></li>)}</ol></div></section></>}
    <CardRewardMoment distributionId={distributionId} watch={`${progress.studyComplete}:${progress.goalReached}`}/>
  </section>;
}

export function StudentCardsStudy({distributionId, mode, from, to}: {distributionId: string; mode: CardStudyMode | 'test' | 'chunk'; from?: string; to?: string}) {
  if (mode === 'test') return <StudentCardsTest distributionId={distributionId}/>;
  if (mode === 'chunk') return <StudentChunkPractice distributionId={distributionId}/>;
  return <StudentPracticeLoader distributionId={distributionId} mode={mode} from={from} to={to}/>;
}
function LockedNotice({distributionId, studentId}: {distributionId: string; studentId?: string}) {const {copy: c} = useCardCopy(); return <div className="cs-state" role="status"><Clock3 size={32}/><p>{c.dueLocked}</p><OutboxFlush distributionId={distributionId} studentId={studentId}/><Link className="button" href={`/student/cards/${distributionId}`}><ArrowLeft size={16}/>{c.back}</Link></div>;}
function StudentPracticeLoader({distributionId, mode, from, to}: {distributionId: string; mode: CardStudyMode; from?: string; to?: string}) {
  const {copy: c} = useCardCopy();
  const [data, setData] = useState<StudentDetail | null>(null), [character, setCharacter] = useState<Character>('cat'), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const load = useCallback(async () => {setLoading(true); setError(false); try {const result = await cardRequest<StudentDetail>(`/api/cards/distributions/${distributionId}`); setData(result); const profile = await cardRequest<StudentCardsData>('/api/cards/student').catch(() => null); if (profile?.profile) setCharacter(profile.profile.character);} catch {setError(true);} finally {setLoading(false);}}, [distributionId]);
  useEffect(() => {void load();}, [load]);
  if (loading) return <CardLoading/>;
  if (error || !data) return <CardError retry={() => void load()}/>;
  if (cardDueState(data.distribution, clockOf(data.serverTime)) === 'lock') return <LockedNotice distributionId={distributionId} studentId={data.distribution.targetStudentIds[0]}/>;
  if (data.testActive) return <section className="cs-study"><CardTestWait distributionId={distributionId} back={<Link className="button" href={`/student/cards/${distributionId}`}><ArrowLeft size={16}/>{c.back}</Link>}/></section>;
  return <><CardRewardMoment distributionId={distributionId} watch={String(data.progress.studyComplete)}/><CardsPractice key={`${distributionId}:${mode}:${from}:${to}`} from={from} to={to} title={data.distribution.title} cards={data.distribution.snapshot.cards} type={data.distribution.type} mode={mode} distributionId={distributionId} studentId={data.distribution.targetStudentIds[0]} speechRate={data.distribution.speechRate} requirement={data.distribution.requiredModes[mode]} progress={data.progress} character={character} onProgress={progress => setData(previous => previous ? {...previous, progress} : previous)}/></>;
}

function StudentCardsTest({distributionId}: {distributionId: string}) {
  const {copy: c, locale, points} = useCardCopy();
  const [distribution, setDistribution] = useState<CardStudentDistribution | null>(null), [profile, setProfile] = useState<StudentCardsData['profile']>(), [attempts, setAttempts] = useState<CardTestAttempt[]>([]), [attempt, setAttempt] = useState<CardTestAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({}), [pendingSubmit, setPendingSubmit] = useState<Record<string, string> | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notCounted, setNotCounted] = useState('');
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
    catch (cause) {setError(cause instanceof Error && cause.message === 'DUE_CLOSED' ? c.dueLocked : c.testStartError);} finally {operationBusy.current = false; setBusy(false);}
  }
  function answer(questionId: string, text: string) {const next = {...answers, [questionId]: text}; setAnswers(next); if (attempt) writeDraft(draftKey(attempt.id), next);}
  async function submit(auto = false) {
    if (!attempt || operationBusy.current) return;
    const submittedAnswers = pendingSubmit || answers;
    // Blank answers are only sent when time ran out; the first failed auto-submit keeps that allowance through pendingSubmit.
    if (!auto && !pendingSubmit && attempt.questions.some(question => !submittedAnswers[question.id]?.trim())) {setError(c.allAnswers); return;}
    operationBusy.current = true; setBusy(true); setError('');
    setPendingSubmit(submittedAnswers); writeDraft(submitKey(attempt.id), submittedAnswers);
    try {const result = await cardRequest<{attempt: CardTestAttempt; progress: CardProgress; notCounted?: boolean}>(`/api/cards/distributions/${distributionId}/tests/${attempt.id}/submit`, {method: 'POST', body: JSON.stringify({answers: attempt.questions.map(question => ({questionId: question.id, answer: submittedAnswers[question.id] || ''}))})}); if (result.notCounted) setNotCounted(result.attempt.id); setAttempt(result.attempt); setPendingSubmit(null); setAttempts(previous => previous.map(item => item.id === result.attempt.id ? result.attempt : item)); setDistribution(previous => previous ? {...previous, progress: result.progress} : previous); clearDraft(draftKey(attempt.id), submitKey(attempt.id));}
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
  const dueState = cardDueState(d, Date.now() + clockOffset.current);
  const canStart = !locked && remaining !== 0 && dueState !== 'lock';
  const lastSubmitted = attempts.find(item => item.status === 'submitted');
  const hasWrong = !!lastSubmitted && (lastSubmitted.score ?? 100) < 100;
  const back = <Link className="cs-back" href={`/student/cards/${distributionId}`}><ArrowLeft size={16}/>{c.exit}</Link>;
  return <section className="cs-study"><div className="cs-study-top">{back}<span className="cs-tag">{c.test}</span></div><header className="cs-heading"><div><h1>{d.title}</h1><p>{c.testIntro}</p></div><CardBuddy character={profile?.character} happy={!!attempt && attempt.status === 'submitted' && notCounted !== attempt.id && (attempt.score || 0) >= d.test.goalScore}/></header>
    {error && <div className="cs-alert" role="alert">{error}</div>}
    <CardRewardMoment distributionId={distributionId} watch={String(d.progress.goalReached)}/>
    {!attempt ? <><div className="cs-options"><h2>{c.test}</h2><dl className="cs-test-settings"><div><dt>{c.total}</dt><dd>{d.test.questionCount} {c.cards}</dd></div><div><dt>{c.goal}</dt><dd>{points(d.test.goalScore)}</dd></div><div><dt>{c.remaining}</dt><dd>{remaining === null ? c.unlimited : remaining}</dd></div><div><dt>{c.direction}</dt><dd>{d.test.direction === 'front-back' ? c.frontBack : c.backFront}</dd></div><div><dt>{c.testFormat}</dt><dd>{testFormat(d.test) === 'choice' ? c.formatChoice : c.formatWritten}</dd></div><div><dt>{c.timeLimit}</dt><dd>{testTimeLimit(d.test) ? `${Math.round(testTimeLimit(d.test)! / 60)}${c.minutes}` : c.noTimeLimit}</dd></div></dl>{testTimeLimit(d.test) && <p className="cs-muted">{c.timeUpNote}</p>}<p className="cs-muted">{d.test.answerRelease === 'immediate' ? c.immediateRelease : d.test.answerRelease === 'after-due' ? c.afterDueRelease : c.neverRelease}</p>{locked && <p className="cs-alert">{c.prerequisite}</p>}{remaining === 0 && !current && <p className="cs-muted">{c.attemptLimit}</p>}{dueState === 'lock' ? <p className="cs-alert">{c.dueLocked}</p> : dueState === 'late' ? <p className="cs-muted">{c.dueLate}</p> : dueState === 'open' && <p className="cs-muted">{c.expired}</p>}<div className="cs-actions">{current ? <button className="button primary" onClick={() => selectAttempt(current)}>{c.testContinue}<ArrowRight size={17}/></button> : <><button className="button primary" disabled={!canStart || busy} onClick={() => void start()}>{busy ? <LoaderCircle className="spin" size={17}/> : <ClipboardCheck size={17}/>} {c.testStart}</button>{hasWrong && <button className="button" disabled={!canStart || busy} onClick={() => void start(true)}>{c.wrongTest}</button>}</>}</div></div><section className="cs-history"><div className="cs-card-list-title"><h2>{c.testHistory}</h2><button className="icon-button" aria-label={c.refresh} onClick={() => void load()}><RefreshCw size={17}/></button></div>{!attempts.length ? <p className="cs-muted">{c.noAttempts}</p> : attempts.map(item => <button key={item.id} className="cs-history-row" onClick={() => selectAttempt(item)}><span>#{item.number} {item.retryWrong ? c.wrongTest : c.test}</span><span>{new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(new Date(item.startedAt))}</span><b>{item.status === 'started' ? c.testInProgress : points(item.score || 0)}</b><ArrowRight size={16}/></button>)}</section></> : attempt.status === 'started' ? <form onSubmit={event => {event.preventDefault(); void submit();}}><div className="cs-test-status"><span>{c.answeredQuestions}: {attempt.questions.filter(question => answers[question.id]?.trim()).length} / {attempt.questions.length}</span>{timeLeft !== null && <span className={`cs-timer ${timeLeft <= 60_000 ? 'is-low' : ''}`} role="timer" aria-label={`${c.timeLeft} ${formatCountdown(timeLeft)}`}><Clock3 size={15}/>{formatCountdown(timeLeft)}</span>}<span className="cs-muted">{c.draftSaved}</span></div>{attempt.questions.map((question, index) => question.choices?.length ? <fieldset className="cs-test-question" key={question.id}><legend><span>{index + 1}.</span> {question.prompt}</legend><div className="cs-test-choices">{question.choices.map(choice => <label key={choice} className={`cs-test-choice ${answers[question.id] === choice ? 'is-selected' : ''}`}><input type="radio" name={`test-${question.id}`} value={choice} checked={answers[question.id] === choice} onChange={() => answer(question.id, choice)} required disabled={busy || !!pendingSubmit}/><span>{choice}</span></label>)}</div></fieldset> : <div className="cs-test-question" key={question.id}><label htmlFor={`test-${question.id}`}><span>{index + 1}.</span> {question.prompt}</label><input id={`test-${question.id}`} value={answers[question.id] || ''} onChange={event => answer(question.id, event.target.value)} required disabled={busy || !!pendingSubmit} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={c.placeholder}/></div>)}<div className="cs-actions"><button type="button" className="button" disabled={busy} onClick={() => {setAttempt(null); setError('');}}>{c.close}</button><button type="submit" className="button primary" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin"/>{c.submitting}</> : <><ClipboardCheck size={17}/>{pendingSubmit ? c.retrySubmit : c.testSubmit}</>}</button></div></form> : <div className="cs-test-result"><div className="cs-finish"><CheckCircle2 size={32}/><h2>{c.testResult}</h2><strong className="cs-score">{attempt.score}<small>/ 100</small></strong><p>{notCounted === attempt.id ? c.overtimeNotCounted : (attempt.score || 0) >= d.test.goalScore ? c.goalReached : c.goalNotReached}</p></div>{attempt.answersVisible && attempt.results ? <ol className="cs-test-results">{attempt.questions.map((question, index) => {const result = attempt.results?.find(item => item.questionId === question.id); return <li key={question.id} className={result?.correct ? 'is-correct' : 'is-incorrect'}><h3>{index + 1}. {question.prompt}</h3><p><strong>{result?.correct ? c.correct : c.incorrect}</strong></p><p>{c.answer}: {result?.answer || '—'}</p>{result?.expectedAnswer !== undefined && <p>{c.correctAnswer}: <b>{result.expectedAnswer}</b></p>}</li>;})}</ol> : <p className="cs-release-note">{d.test.answerRelease === 'never' ? c.answersNever : c.answersHidden}</p>}<div className="cs-actions"><button className="button" onClick={() => {setAttempt(null); setError('');}}>{c.testHistory}</button><Link className="button" href={`/student/cards/${distributionId}/spell`}>{c.spell}<ArrowRight size={17}/></Link>{canStart && !current && <button className="button primary" disabled={busy} onClick={() => void start()}>{c.newTest}</button>}</div></div>}
  </section>;
}

/** A card's mastery word under its meaning. Level 0 (never answered right) shows nothing, so a new set is not a wall of "not yet". */
function CardLevelTag({level}: {level: number}) {const r = useReviewCopy(); return level > 0 ? <span className={`cs-level cs-level-${level}`}>{r.mastery} · {r.levels[level]}</span> : null;}
/** Set mastery and today's date review, at the top of the set page. */
function CardMasteryPanel({distributionId, cards, states, today, closed}: {distributionId: string; cards: CardEntry[]; states: CardReviewStates; today: string; closed: boolean}) {
  const r = useReviewCopy(), mastery = cardMastery(cards.map(card => card.id), states, today), average = mastery.percent / 25;
  return <section className="cs-mastery" aria-labelledby="card-mastery-heading"><div className="cs-mastery-head"><CardProgressRing value={mastery.percent} label={r.mastery}/><div><h2 id="card-mastery-heading">{r.mastery} {mastery.percent}%</h2><p className="cs-muted">{r.masteryHint}</p></div></div>{average >= .5 && <CardMasterySteps level={average} size={132}/>}<ul className="cs-mastery-levels">{mastery.levels.map((count, level) => <li key={level}><b>{count}</b>{r.levels[level]}</li>)}</ul>
    <div className="cs-due-row">{mastery.due > 0 && !closed ? <><p><RotateCcw size={16}/> {r.dueToday.replace('{count}', String(mastery.due))}</p><Link className="button primary" href={`/student/cards/review?distributionId=${encodeURIComponent(distributionId)}`}>{r.review}<ArrowRight size={17}/></Link></> : <p className="cs-muted">{mastery.due ? r.dueClosed : r.dueNone}</p>}</div>
  </section>;
}
/** Pinned above the set list: cards missed in any set over the last four weeks, grouped by week. Counts come from one small index document. */
function MissedReviewRow({summary, today}: {summary: CardMissSummary; today: string}) {
  const r = useReviewCopy(), {locale} = useCardCopy(), thisWeek = cardWeekStart(today), lastWeek = cardAddDays(thisWeek, -7);
  const label = (week: string) => week === thisWeek ? r.thisWeek : week === lastWeek ? r.lastWeek : r.weekOf.replace('{date}', new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric', timeZone: 'UTC'}).format(new Date(`${week}T00:00:00Z`)));
  return <section className="cs-missed" aria-labelledby="cs-missed-heading"><div className="cs-missed-copy"><h2 id="cs-missed-heading"><RotateCcw size={18}/>{r.missedTitle}</h2><p>{r.missedBody.replace('{count}', String(summary.total))}</p></div><Link className="button primary" href="/student/cards/review">{r.missedStart}<ArrowRight size={17}/></Link>
    <ul className="cs-missed-weeks">{summary.weeks.map(week => <li key={week.week}><Link href={`/student/cards/review?week=${week.week}`}>{label(week.week)} <b>{week.count}</b></Link></li>)}</ul></section>;
}
/** /student/cards/review: today's due cards of one set (?distributionId=) or the missed cards across sets (optionally ?week=). */
export function StudentCardsReview({distributionId, week}: {distributionId?: string; week?: string}) {
  const {copy: c} = useCardCopy(), r = useReviewCopy(), [items, setItems] = useState<CardReviewItem[] | null>(null), [error, setError] = useState(''), [round, setRound] = useState(0);
  const load = useCallback(async () => {
    setItems(null); setError('');
    try {const query = distributionId ? `?distributionId=${encodeURIComponent(distributionId)}` : week ? `?week=${encodeURIComponent(week)}` : ''; setItems((await cardRequest<{items: CardReviewItem[]}>(`/api/cards/review${query}`)).items); setRound(value => value + 1);}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'REQUEST_FAILED');}
  }, [distributionId, week]);
  useEffect(() => {void load();}, [load]);
  const back = distributionId ? `/student/cards/${encodeURIComponent(distributionId)}` : '/student/cards';
  if (error === 'TEST_ACTIVE' && distributionId) return <section className="cs-study"><CardTestWait distributionId={distributionId} back={<Link className="button" href={back}><ArrowLeft size={16}/>{c.back}</Link>}/></section>;
  if (error === 'DUE_CLOSED') return <div className="cs-state" role="status"><Clock3 size={32}/><p>{r.dueClosed}</p><Link className="button" href={back}><ArrowLeft size={16}/>{c.back}</Link></div>;
  if (error) return <CardError retry={() => void load()}/>;
  if (!items) return <CardLoading/>;
  if (!items.length) return <div className="cs-state" role="status"><CardBuddy happy/><h2>{r.noReview}</h2><p>{r.noReviewBody}</p><Link className="button" href={back}><ArrowLeft size={16}/>{c.back}</Link></div>;
  return <CardsReviewSession key={round} items={items} title={distributionId ? r.dueTitle : r.missedTitle} intro={distributionId ? r.dueIntro : r.missedIntro} backHref={back} onReload={() => void load()}/>;
}
