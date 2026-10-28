'use client';

import {useCallback, useEffect, useState} from 'react';
import {ArrowLeft, CalendarClock, LoaderCircle, RotateCw, Sparkles, Star} from 'lucide-react';
import {lessonRequest} from './client';
import QuestionCard, {ratingCopy} from './question-card';
import type {AnswerResult, DueReview, LessonConcept, ReviewRating, RunView, StudentHome} from './types';
import './styles.css';

const steps = [{id: 'pretest', label: '먼저 풀어 보기'}, {id: 'cards', label: '개념 카드'}, {id: 'retest', label: '다시 풀기'}, {id: 'done', label: '완료'}] as const;
const phaseChip = {new: '새 복습', pretest: '풀고 있어요', cards: '개념 카드', retest: '다시 풀기', done: '완료'} as const;
const shortDate = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

export default function StudentLessonReview() {
  const [home, setHome] = useState<StudentHome | null>(null), [error, setError] = useState(''), [open, setOpen] = useState<{kind: 'lesson'; id: string} | {kind: 'reviews'} | null>(null);
  const load = useCallback(async () => {try {setHome(await lessonRequest<StudentHome>('student')); setError('');} catch (cause) {setError((cause as Error).message);}}, []);
  useEffect(() => {void load();}, [load]);
  const back = () => {setOpen(null); void load();};
  if (open?.kind === 'lesson') return <LessonRun id={open.id} onBack={back}/>;
  if (open?.kind === 'reviews') return <Reviews onBack={back}/>;
  return <div className="lr-page lr-student">
    <header className="lr-heading"><div><span className="lr-eyebrow"><Sparkles size={14}/>복습하기</span><h1>오늘 배운 것, 내 것으로</h1><p>풀어 보고, 헷갈린 개념은 카드로 다시 보고, 한 번 더 풀어요. 잊어버릴 때쯤 다시 만나요.</p></div><img src="/characters/rabbit-tori.webp" alt=""/></header>
    {error && <p className="lr-error" role="alert">{error}</p>}
    {!home ? !error && <LoaderCircle className="spin"/> : <>
      <section className={`lr-due ${home.dueCount ? 'has-due' : ''}`}><CalendarClock size={26}/><div><strong>{home.dueCount ? `오늘 다시 볼 문제 ${Math.min(home.dueCount, 10)}개` : '오늘 복습할 문제가 없어요'}</strong><small>{home.dueCount ? '조금 헷갈렸던 문제가 돌아왔어요.' : home.nextDue ? `다음 복습은 ${shortDate(home.nextDue)}에 만나요.` : '수업 복습을 마치면 여기에 복습 문제가 생겨요.'}</small></div>{home.dueCount > 0 && <button type="button" className="button primary" onClick={() => setOpen({kind: 'reviews'})}>복습 시작</button>}</section>
      <h2 className="lr-section-title">선생님이 열어 준 복습</h2>
      {!home.lessons.length ? <section className="lr-empty"><p>선생님이 수업 복습을 열면 여기에 나타나요.</p></section> :
        <div className="lr-lesson-grid">{home.lessons.map(lesson => <button type="button" key={lesson.id} className={`lr-lesson-card is-${lesson.phase}`} onClick={() => setOpen({kind: 'lesson', id: lesson.id})}><span className={`lr-chip is-${lesson.phase}`}>{phaseChip[lesson.phase]}</span><small>{lesson.subject} · {lesson.unit}</small><strong>{lesson.title}</strong><span className="lr-meta">문제 {lesson.questionCount}개</span></button>)}</div>}
    </>}
  </div>;
}

function Stepper({phase}: {phase: RunView['phase']}) {
  const at = steps.findIndex(step => step.id === phase);
  return <ol className="lr-steps">{steps.map((step, index) => <li key={step.id} className={index < at ? 'is-done' : index === at ? 'is-current' : ''}><span>{index + 1}</span>{step.label}</li>)}</ol>;
}

function LessonRun({id, onBack}: {id: string; onBack: () => void}) {
  const [run, setRun] = useState<RunView | null>(null), [error, setError] = useState('');
  useEffect(() => {lessonRequest<{run: RunView}>(`student/lessons/${encodeURIComponent(id)}`).then(data => setRun(data.run)).catch(cause => setError((cause as Error).message));}, [id]);
  const act = async (path: string, data: object = {}) => {const result = await lessonRequest<{run: RunView}>(`student/lessons/${encodeURIComponent(id)}/${path}`, data); setRun(result.run);};
  const current = run?.questions.find(question => !run.answers[question.id]?.rating);
  const index = run && current ? run.questions.indexOf(current) : 0;
  return <div className="lr-page lr-student lr-run"><button type="button" className="lr-back" onClick={onBack}><ArrowLeft size={16}/>복습 목록</button>
    {error && <p className="lr-error" role="alert">{error}</p>}
    {!run ? !error && <LoaderCircle className="spin"/> : <>
      <header className="lr-run-head"><small>{run.lesson.subject} · {run.lesson.unit}</small><h1>{run.lesson.title}</h1><Stepper phase={run.phase}/></header>
      {(run.phase === 'pretest' || run.phase === 'retest') && current && <>
        <p className="lr-progress">{run.phase === 'retest' ? '같은 개념, 새로운 문제예요. ' : ''}{index + 1} / {run.questions.length}</p>
        <QuestionCard key={`${run.phase}:${current.id}`} question={current} chosen={run.answers[current.id]?.choice ?? null} rated={run.answers[current.id]?.rating}
          result={run.answers[current.id] ? {correct: run.answers[current.id].correct, answer: run.answers[current.id].answer, explanation: run.answers[current.id].explanation} : null}
          onAnswer={choice => act('answer', {questionId: current.id, choice})} onRate={rating => act('rate', {questionId: current.id, rating})}/>
      </>}
      {run.phase === 'cards' && <CardDeck cards={run.cards} onDone={() => act('cards-done')}/>}
      {run.phase === 'done' && run.summary && <section className="lr-done"><div className="lr-done-badge">🎉</div><h2>이 차시 복습을 마쳤어요!</h2>
        <div className="lr-done-counts">{(['know', 'unsure', 'unknown'] as ReviewRating[]).map(rating => <span key={rating} className={`is-${rating}`}><b>{ratingCopy[rating].face}</b>{ratingCopy[rating].label}<strong>{run.summary![rating]}</strong></span>)}</div>
        <p>{run.summary.unsure + run.summary.unknown ? `알쏭달쏭한 문제는 2주 뒤, 모르는 문제는 1주 뒤에 다시 만나요.${run.summary.nextReview ? ` 첫 복습은 ${shortDate(run.summary.nextReview)}이에요.` : ''}` : '모두 완전이해! 복습할 문제가 없어요.'}</p>
        {run.reward > 0 && <p className="lr-reward">보말 {run.reward}개를 받았어요 🐚</p>}<button type="button" className="button primary" onClick={onBack}>목록으로</button></section>}
    </>}
  </div>;
}

/** Flip each card, then collect its star; the retest opens when every star is collected. */
function CardDeck({cards, onDone}: {cards: LessonConcept[]; onDone: () => Promise<void>}) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set()), [stars, setStars] = useState<Set<string>>(new Set()), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const all = cards.every(card => stars.has(card.id));
  return <section className="lr-cards"><div className="lr-cards-head"><h2>헷갈린 개념, 카드로 다시 보기</h2><p className="lr-stars" aria-label={`별 ${stars.size}개 / ${cards.length}개`}>{cards.map(card => <Star key={card.id} size={22} className={stars.has(card.id) ? 'is-on' : ''}/>)}</p></div>
    <div className="lr-card-grid">{cards.map((card, index) => {const isFlipped = flipped.has(card.id);
      return <div key={card.id} className={`lr-flip ${isFlipped ? 'is-flipped' : ''} ${stars.has(card.id) ? 'is-starred' : ''}`}>
        <button type="button" className="lr-flip-inner" aria-expanded={isFlipped} onClick={() => setFlipped(old => new Set(old).add(card.id))}>
          <span className="lr-face lr-front"><small>개념 {index + 1}</small><strong>{card.title}</strong><em><RotateCw size={14}/>눌러서 뒤집기</em></span>
          <span className="lr-face lr-back"><strong>{card.title}</strong><span>{card.summary}</span>{card.example && <span className="lr-example">예: {card.example}</span>}</span>
        </button>
        {isFlipped && <button type="button" className="lr-star-button" disabled={stars.has(card.id)} onClick={() => setStars(old => new Set(old).add(card.id))}><Star size={16}/>{stars.has(card.id) ? '별을 모았어요' : '이해했어요, 별 받기'}</button>}
      </div>;})}</div>
    {error && <p className="lr-error" role="alert">{error}</p>}
    <div className="lr-actions"><button type="button" className="button primary" disabled={!all || busy} onClick={() => {setBusy(true); setError(''); onDone().catch(cause => {setError((cause as Error).message); setBusy(false);});}}>{busy && <LoaderCircle size={16} className="spin"/>}{all ? '별을 다 모았어요! 다시 풀기' : `별 ${cards.length - stars.size}개를 더 모아요`}</button></div>
  </section>;
}

function Reviews({onBack}: {onBack: () => void}) {
  const [items, setItems] = useState<DueReview[] | null>(null), [at, setAt] = useState(0), [results, setResults] = useState<Record<string, AnswerResult & {choice: number}>>({}), [rated, setRated] = useState<Record<string, ReviewRating>>({}), [error, setError] = useState('');
  useEffect(() => {lessonRequest<{reviews: DueReview[]}>('student/reviews').then(data => {setItems(data.reviews); setResults(Object.fromEntries(data.reviews.filter(item => item.answered).map(item => [item.itemId, item.answered!])));}).catch(cause => setError((cause as Error).message));}, []);
  const item = items?.[at];
  return <div className="lr-page lr-student lr-run"><button type="button" className="lr-back" onClick={onBack}><ArrowLeft size={16}/>복습 목록</button>
    {error && <p className="lr-error" role="alert">{error}</p>}
    {!items ? !error && <LoaderCircle className="spin"/> : !item ? <section className="lr-done"><div className="lr-done-badge">🌱</div><h2>오늘 복습 끝!</h2><p>두 번 연속 완전이해한 문제는 졸업해요. 남은 문제는 다음 복습 때 다시 만나요.</p><button type="button" className="button primary" onClick={onBack}>목록으로</button></section> : <>
      <header className="lr-run-head"><small>{item.subject} · {item.lessonTitle}</small><h1>오늘의 복습</h1></header><p className="lr-progress">{at + 1} / {items.length}</p>
      <QuestionCard key={item.itemId} question={item.question} chosen={results[item.itemId]?.choice ?? null} result={results[item.itemId] || null} rated={rated[item.itemId]}
        onAnswer={async choice => {const result = await lessonRequest<AnswerResult>(`student/reviews/${encodeURIComponent(item.itemId)}/answer`, {choice}); setResults(old => ({...old, [item.itemId]: {...result, choice}}));}}
        onRate={async rating => {await lessonRequest(`student/reviews/${encodeURIComponent(item.itemId)}/rate`, {rating}); setRated(old => ({...old, [item.itemId]: rating})); setTimeout(() => setAt(value => value + 1), 450);}}/>
    </>}
  </div>;
}
