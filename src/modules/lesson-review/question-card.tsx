'use client';

import {useState} from 'react';
import {Check, LoaderCircle, X} from 'lucide-react';
import type {AnswerResult, PublicQuestion, ReviewRating} from './types';

const shapes = ['□', '△', '○', '◇'];
export const ratingCopy: Record<ReviewRating, {label: string; face: string; hint: string}> = {
  know: {label: '완전이해', face: '😊', hint: '친구에게 설명할 수 있어요'},
  unsure: {label: '알쏭달쏭', face: '🤔', hint: '맞혔지만 조금 헷갈려요'},
  unknown: {label: '완전모름', face: '😵', hint: '처음 보는 것 같아요'},
};

/** Answer first, then see why, then say honestly how well it is understood. */
export default function QuestionCard({question, result, chosen, rated, onAnswer, onRate}: {
  question: PublicQuestion; result: AnswerResult | null; chosen: number | null; rated?: ReviewRating;
  onAnswer: (choice: number) => Promise<void>; onRate: (rating: ReviewRating) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run(action: () => Promise<void>) {setBusy(true); setError(''); try {await action();} catch (cause) {setError((cause as Error).message);} finally {setBusy(false);}}
  return <article className="lr-question">
    <p className="lr-prompt">{question.prompt}</p>
    <div className={`lr-choices ${question.kind === 'ox' ? 'is-ox' : ''}`}>{question.choices.map((choice, index) => {
      const state = !result ? '' : index === result.answer ? 'is-answer' : index === chosen ? 'is-wrong' : 'is-dim';
      return <button key={index} type="button" className={state} disabled={busy || !!result} onClick={() => void run(() => onAnswer(index))}>
        {question.kind === 'choice' && <span className="lr-shape" aria-hidden="true">{shapes[index]}</span>}<span>{choice}</span>
        {result && index === result.answer && <Check size={18} aria-label="정답"/>}{result && index === chosen && index !== result.answer && <X size={18} aria-label="내 답"/>}
      </button>;
    })}</div>
    {result && <div className={`lr-result ${result.correct ? 'is-correct' : 'is-wrong'}`} role="status"><strong>{result.correct ? '맞았어요!' : '아쉬워요, 정답을 확인해요.'}</strong><p>{result.explanation}</p></div>}
    {result && <div className="lr-rating"><p>이 문제, 얼마나 이해했나요?</p><div>{(Object.keys(ratingCopy) as ReviewRating[]).map(rating => {
      const blocked = rating === 'know' && !result.correct;
      return <button key={rating} type="button" className={`lr-rate is-${rating} ${rated === rating ? 'is-chosen' : ''}`} disabled={busy || !!rated || blocked} title={blocked ? '틀린 문제는 알쏭달쏭이나 완전모름으로 골라요.' : ratingCopy[rating].hint} onClick={() => void run(() => onRate(rating))}>
        <span aria-hidden="true">{ratingCopy[rating].face}</span><strong>{ratingCopy[rating].label}</strong><small>{blocked ? '틀린 문제는 고를 수 없어요' : ratingCopy[rating].hint}</small>
      </button>;
    })}</div></div>}
    {busy && <LoaderCircle className="spin lr-busy" size={20}/>}{error && <p className="lr-error" role="alert">{error}</p>}
  </article>;
}
