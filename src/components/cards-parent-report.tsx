'use client';
import {useCallback, useEffect, useState} from 'react';
import {BookOpenCheck, ClipboardCheck, Heart, LoaderCircle, Lock, Sprout} from 'lucide-react';
import {useCardsFamilyCopy} from '@/lib/cards-family-copy';
import {CardProgressRing} from './cards-visuals';
import '@/styles/cards-family.css';

type Report = {
  student: {name: string}; note: string; expiresAt: string;
  set: {title: string; type: 'word' | 'sentence'; cardCount: number; dueAt: string | null};
  progress: {mastery: number; studyPercent: number | null; studyComplete: boolean; lastStudiedAt: string | null};
  test: {goalScore: number; maxAttempts: number; bestScore: number | null; latestScore: number | null; goalReached: boolean; scores: {number: number; score: number; submittedAt: string; retry: boolean}[]};
  practice: {words: {front: string; back: string; count: number}[]; hidden: boolean};
};

/** 학부모 링크 화면. 로그인 없이 토큰 하나로 학생 한 명의 이 세트 기록만 읽는다. 저장·입력 동작은 없다. */
export default function CardsParentReport({token}: {token: string}) {
  const {locale, copy: c, fill} = useCardsFamilyCopy();
  const [data, setData] = useState<Report | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/cards-parent/${encodeURIComponent(token)}`, {cache: 'no-store', referrerPolicy: 'no-referrer', signal});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {setError(response.status === 404 ? c.gone : response.status === 429 ? c.rateLimited : c.error); return;}
      setData(body as Report);
    } catch (cause) {if ((cause as Error).name !== 'AbortError') setError(c.error);} finally {if (!signal?.aborted) setLoading(false);}
  }, [token, c]);
  useEffect(() => {const controller = new AbortController(); void load(controller.signal); return () => controller.abort();}, [load]);
  const date = (value: string, time = false) => new Intl.DateTimeFormat(locale, time ? {month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'} : {year: 'numeric', month: 'long', day: 'numeric'}).format(new Date(value));
  if (loading && !data) return <main className="cpr-page"><div className="cpr-state" role="status"><LoaderCircle className="spin" size={26}/><p>{c.loading}</p></div></main>;
  if (error || !data) return <main className="cpr-page"><div className="cpr-state" role="alert"><img src="/cards/v1/cards-empty-report.svg" alt="" width={120} height={120}/><p>{error || c.error}</p>{error !== c.gone && <button type="button" className="button" onClick={() => void load()}>{c.retry}</button>}</div></main>;
  const {student, set, progress, test, practice} = data, best = test.bestScore;
  return <main className="cpr-page">
    <header className="cpr-hero">
      {/* Placeholder for the cards-parent-report-cover image (later asset). A general scene only: no student information goes here. */}
      <div className="cpr-cover" data-asset-slot="cards-parent-report-cover" role="img" aria-label={c.coverSlot}><img src="/cards/v1/cards-team-sprout.svg" alt="" width={84} height={84}/><img src="/cards/v1/cards-streak-card.svg" alt="" width={96} height={96}/><img src="/cards/v1/cards-team-sun.svg" alt="" width={72} height={72}/></div>
      <p className="cpr-kicker">{c.pageTitle}</p>
      <h1>{student.name ? fill('headline', {name: student.name}) : c.headlineAnonymous}</h1>
      <p className="cpr-set"><span>{c.setLabel}</span><strong>{set.title}</strong><small>{c[set.type]} · {set.cardCount}{locale === 'ko' ? c.cards : ` ${c.cards}`} · {set.dueAt ? `${c.due} ${date(set.dueAt, true)}` : c.noDue}</small></p>
    </header>
    <section className="cpr-metrics" aria-label={c.pageTitle}>
      <article><CardProgressRing value={progress.mastery} size={76} label={c.mastery}/><div><h2>{c.mastery}</h2><p>{c.masteryHint}</p></div></article>
      <article><span className="cpr-icon"><BookOpenCheck size={26}/></span><div><h2>{c.study}</h2>{progress.studyPercent === null ? <p>{c.studyNone}</p> : <><strong>{progress.studyPercent}%</strong><div className="cpr-bar" aria-hidden="true"><span style={{width: `${progress.studyPercent}%`}}/></div>{progress.studyComplete && <p className="cpr-good">{c.studyDone}</p>}</>}</div></article>
      <article><span className="cpr-icon"><ClipboardCheck size={26}/></span><div><h2>{c.test}</h2>{best === null ? <p>{c.noTest}</p> : <><strong>{c.best} {fill('points', {n: best})}</strong><p>{c.goal} {fill('points', {n: test.goalScore})}</p>{test.goalReached && <p className="cpr-good">{c.goalReached}</p>}</>}</div></article>
    </section>
    {!!test.scores.length && <section className="cpr-card"><h2>{c.scores}</h2><ol className="cpr-scores">{test.scores.map(row => <li key={row.number}><span>{fill('attempt', {n: row.number})}{row.retry ? ` · ${c.retryTest}` : ''}</span><div className="cpr-bar" aria-hidden="true"><span style={{width: `${Math.max(2, row.score)}%`}} className={row.score >= test.goalScore ? 'is-goal' : ''}/></div><b>{fill('points', {n: row.score})}</b><small>{row.submittedAt ? date(row.submittedAt) : ''}</small></li>)}</ol></section>}
    <section className="cpr-card"><h2><Sprout size={20}/>{c.practice}</h2>
      {practice.hidden ? <p className="cpr-muted"><Lock size={15}/> {c.practiceHidden}</p> : !practice.words.length ? <p className="cpr-muted">{c.practiceNone}</p> : <><p className="cpr-muted">{c.practiceHint}</p><ul className="cpr-words">{practice.words.map((word, index) => <li key={`${word.front}:${index}`}><strong>{word.front}</strong><span>{word.back}</span><small>{fill('missed', {n: word.count})}</small></li>)}</ul></>}
    </section>
    <section className="cpr-card cpr-note"><h2><Heart size={19}/>{c.noteTitle}</h2><p>{data.note || c.noteDefault}</p></section>
    <footer className="cpr-foot"><p>{c.lastStudied}: {progress.lastStudiedAt ? date(progress.lastStudiedAt, true) : c.never}</p><p>{c.privacy}</p><p>{fill('expires', {date: date(data.expiresAt)})}</p></footer>
  </main>;
}
