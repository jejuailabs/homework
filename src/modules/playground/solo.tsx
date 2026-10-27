'use client';

import Link from 'next/link';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, ArrowRight, Check, Lightbulb, PencilLine, RefreshCw, Sparkles} from 'lucide-react';
import {notifyPointsChanged} from '@/lib/use-point-sync';
import {playLabels, type PlayKind, type PublicPlaySession} from './types';
import {playMutation} from './client';
import './styles.css';

const symbols = ['□', '△', '○', '◇'];
export default function PlaygroundSolo({kind, review = false}: {kind: PlayKind; review?: boolean}) {
  const [session, setSession] = useState<PublicPlaySession | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [answer, setAnswer] = useState(''), [choice, setChoice] = useState(''), [typing, setTyping] = useState(false), [unsure, setUnsure] = useState(false), [completed, setCompleted] = useState(0);
  const requestId = useRef<string | null>(null), title = useRef<HTMLHeadingElement>(null), result = useRef<HTMLDivElement>(null), locked = useRef(false);
  const [revision, setRevision] = useState(0), practiceId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController(); requestId.current ||= crypto.randomUUID(); setBusy(true); setError('');
    playMutation<{session: PublicPlaySession}>(`solo/${kind}/next`, {requestId: requestId.current, review: review && !practiceId.current, ...(practiceId.current ? {practiceItemId: practiceId.current} : {})}, 'POST', controller.signal)
      .then(value => {setSession(value.session); setAnswer(''); setChoice(''); setUnsure(false); setTyping(!value.session.choices.length);})
      .catch(cause => {if (!controller.signal.aborted) setError((cause as Error).message);})
      .finally(() => {if (!controller.signal.aborted) setBusy(false);});
    return () => controller.abort();
  }, [kind, review, revision]);
  useEffect(() => {if (session?.result) result.current?.focus(); else title.current?.focus();}, [session?.id, session?.result]);
  function next(practice = false) {if (busy) return; requestId.current = crypto.randomUUID(); practiceId.current = practice ? session?.itemId : undefined; setSession(null); setRevision(value => value + 1);}
  async function hint() {
    if (!session || busy || locked.current) return; locked.current = true; setBusy(true); setError('');
    try {const value = await playMutation<{session: PublicPlaySession}>(`solo/${kind}/hint`, {sessionId: session.id}); setSession(value.session);}
    catch (cause) {setError((cause as Error).message);} finally {locked.current = false; setBusy(false);}
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!session || session.result || busy || locked.current || (typing ? !answer.trim() : !choice)) return;
    locked.current = true; setBusy(true); setError('');
    try {const value = await playMutation<{session: PublicPlaySession}>(`solo/${kind}/answer`, {sessionId: session.id, ...(typing ? {answer} : {choiceId: choice}), unsure}); setSession(value.session); setCompleted(value => value + 1); if (value.session.result?.reward) notifyPointsChanged();}
    catch (cause) {setError((cause as Error).message);} finally {locked.current = false; setBusy(false);}
  }
  return <section className={`playground pg-solo pg-${kind}`}>
    <nav className="pg-breadcrumb" aria-label="현재 위치"><Link href="/student/playground"><ArrowLeft size={17}/>말놀이터</Link><span>{playLabels[kind]}{review ? ' · 다시 보기' : ''}</span></nav>
    <header className="pg-solo-heading"><div><p className="pg-eyebrow">{review ? '다시 만나서 반가워요' : '천천히 생각해도 괜찮아요'}</p><h1>{playLabels[kind]}{review && <small>복습</small>}</h1></div><span className="pg-soft-note"><Sparkles size={16}/>이번에 {completed}개 풀었어요</span></header>
    {error && <div className="pg-error" role="alert"><p>{error}</p>{!session && <button className="pg-button" disabled={busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16}/>다시 시도</button>}</div>}
    {!session && busy && <div className="pg-card pg-loading" role="status"><Sparkles size={28}/><p>새로운 생각을 꺼내고 있어요…</p></div>}
    {session && <article className="pg-question-card" aria-busy={busy}>
      <div className="pg-question-top"><span className="pg-chip">{review ? '다시 보는 맞춤법' : '혼자 풀기'}</span><span className="pg-help">힌트 {session.hintCount} / {session.maxHints}</span></div>
      <h2 className="pg-prompt" tabIndex={-1} ref={title}>{session.prompt}</h2>
      {session.hints.length > 0 && <ol className="pg-hints" aria-label="열어 본 힌트" aria-live="polite">{session.hints.map((hint, index) => <li key={index}><Lightbulb size={17}/><span>{hint}</span></li>)}</ol>}
      {!session.result ? <form onSubmit={submit}>
        {session.choices.length > 0 && <div className="pg-input-mode"><button type="button" aria-pressed={!typing} disabled={busy} onClick={() => setTyping(false)}>보기에서 고르기</button><button type="button" aria-pressed={typing} disabled={busy} onClick={() => setTyping(true)}><PencilLine size={14}/>직접 써 보기</button></div>}
        {typing ? <label className="pg-text-answer">내가 생각한 답<input value={answer} onChange={event => setAnswer(event.target.value)} autoComplete="off" maxLength={160} disabled={busy} placeholder="여기에 답을 써 주세요"/>{kind === 'spelling' && <small>띄어쓰기까지 확인해 주세요.</small>}</label> : <fieldset className="pg-choices" disabled={busy}><legend className="pg-sr-only">정답이라고 생각하는 보기를 골라 주세요</legend>{session.choices.map((item, index) => <label key={item.id} className={choice === item.id ? 'is-selected' : ''}><input type="radio" name="answer" value={item.id} checked={choice === item.id} onChange={() => setChoice(item.id)}/><span className="pg-choice-shape" aria-hidden="true">{symbols[index % symbols.length]}</span><span>{item.label}</span>{choice === item.id && <Check size={17} className="pg-choice-check" aria-hidden="true"/>}</label>)}</fieldset>}
        {kind === 'spelling' && <label className="pg-check-row"><input type="checkbox" checked={unsure} disabled={busy} onChange={event => setUnsure(event.target.checked)}/>조금 헷갈려요. 나중에 다시 볼래요.</label>}
        <div className="pg-question-actions"><button type="button" className="pg-button pg-secondary" disabled={busy || session.hintCount >= session.maxHints} onClick={() => void hint()}><Lightbulb size={18}/>{session.hintCount >= session.maxHints ? '힌트를 모두 봤어요' : '힌트 보기'}</button><button className="pg-button" type="submit" disabled={busy || (typing ? !answer.trim() : !choice)}>{busy ? '확인하고 있어요…' : '정답 확인'}<ArrowRight size={18}/></button></div>
      </form> : <div ref={result} tabIndex={-1} className={`pg-result ${session.result.correct ? 'is-correct' : ''}`} role="status">
        <span className="pg-result-icon" aria-hidden="true">{session.result.correct ? <Sparkles size={30}/> : <Lightbulb size={30}/>}</span><h3>{session.result.correct ? '맞았어요! 멋진 생각이에요.' : '새롭게 알게 되었어요!'}</h3><dl><div><dt>내가 고른 답</dt><dd>{session.result.answer}</dd></div><div><dt>정답</dt><dd>{session.result.expected}</dd></div></dl><p className="pg-explanation">{session.result.reveal}</p>
        <div className="pg-result-meta"><span>{session.result.practice ? '연습으로 풀었어요' : `${session.result.score}점 기록`}</span>{session.result.reward > 0 && <span>+{session.result.reward}보말</span>}{session.result.dueDate && <span>{session.result.dueDate}에 다시 만나요</span>}</div>
        <div className="pg-question-actions">{!session.result.correct && <button type="button" className="pg-button pg-secondary" disabled={busy} onClick={() => next(true)}><RefreshCw size={17}/>연습으로 다시 풀기</button>}<button type="button" className="pg-button" disabled={busy} onClick={() => next()}>{review ? '다음 복습' : '다음 문제'}<ArrowRight size={18}/></button></div>
      </div>}
      <p className="pg-footnote">{review ? '복습과 다시 풀기는 연습이에요. 점수와 보말을 다시 받지 않아요.' : '처음 제출한 답만 점수에 반영돼요. 답을 확인한 문제는 연습으로 다시 풀 수 있어요.'}</p>
    </article>}
    <Link className="pg-exit" href="/student/playground">오늘은 여기까지 · 놀이터로 돌아가기</Link>
  </section>;
}
