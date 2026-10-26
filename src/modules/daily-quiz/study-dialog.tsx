'use client';
import {lockBodyScroll} from '@/lib/body-scroll-lock';
import {useEffect, useRef, type FormEvent} from 'react';
import {ArrowRight, Check, LoaderCircle, Shell, Sparkles, X} from 'lucide-react';
import {understandingLabels, type QuizMode, type QuizPublicSession, type Understanding} from './types';

const friends = {english: {file: 'rabbit-tori', name: '토리'}, math: {file: 'hamster-kong', name: '콩이'}, review: {file: 'otter-moa', name: '모아'}};
const names = {english: '영어 단어 여행', math: '차근차근 연산 여행', review: '다시 만나는 복습 여행'};
export default function QuizStudyDialog({mode, session, grade, answer, busy, error, notice, onAnswer, onSubmit, onUnderstand, onClose}: {
  mode: QuizMode; session?: QuizPublicSession; grade: number; answer: string; busy: boolean; error: string; notice: string;
  onAnswer: (value: string) => void; onSubmit: (event: FormEvent) => void; onUnderstand: (value: Understanding) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), prompt = useRef<HTMLHeadingElement>(null), friend = friends[mode];
  const question = session?.questions.find(q => !q.result?.understanding), finished = session?.questions.filter(q => q.result?.understanding).length || 0, total = session?.questions.length || (mode === 'review' ? 5 : 10);
  useEffect(() => {
    const node = dialog.current, releaseScroll = lockBodyScroll();
    node?.showModal();
    return () => {node?.close(); releaseScroll();};
  }, []);
  useEffect(() => {if (question) prompt.current?.focus();}, [question?.id]);
  const message = !session ? '여행 가방에 문제를 담고 있어!' : !question ? '끝까지 해냈구나! 정말 멋진 여행이었어.' : question.result ? question.result.correct ? '잘했어! 어떻게 풀었는지 같이 살펴보자.' : '괜찮아! 이번에 배우면 다음엔 더 잘할 수 있어.' : question.kind === 'text' ? '마지막 단어 도전! 천천히 떠올려 봐.' : '서두르지 않아도 괜찮아. 하나씩 풀어 보자!';
  return <dialog ref={dialog} className="quiz-study-dialog" aria-labelledby="quiz-study-title" onClose={onClose} onCancel={event => {if (busy) event.preventDefault(); else onClose();}}>
    <div className="quiz-study-header"><div><span className="quiz-study-eyebrow"><Sparkles size={14}/>{grade}학년 · 나의 작은 도전</span><h2 id="quiz-study-title">{names[mode]}</h2></div><button type="button" className="quiz-study-close" aria-label="풀이 닫기 · 나중에 이어하기" disabled={busy} onClick={onClose}><X size={23}/></button></div>
    <div className="quiz-study-body">
      <div className="quiz-study-companion"><img src={`/characters/${friend.file}.webp`} alt={`${friend.name}와 함께 풀어요`} draggable={false}/><div className="quiz-study-bubble"><strong>{friend.name}의 응원</strong><p>{message}</p></div></div>
      <div className="quiz-study-progress"><span>{session && !question ? '오늘의 여행 완료!' : `${Math.min(finished + 1, total)}번째 문제`}<b>{finished} / {total}</b></span><progress value={finished} max={total} aria-label="완료한 문제 수"/><div className="quiz-study-steps" aria-hidden="true">{Array.from({length: total}, (_, i) => <i key={i} className={i < finished ? 'done' : i === finished ? 'now' : ''}>{i < finished ? <Check size={12}/> : i + 1}</i>)}</div></div>
      {error && <p className="quiz-study-error" role="alert">{error}</p>}
      {!session ? <div className="quiz-study-loading" role="status">{busy ? <><LoaderCircle className="spin" size={25}/>문제를 준비하고 있어요…</> : '닫은 뒤 다시 시작해 주세요.'}</div> : question ? <section className="quiz-study-question">
        <span className="quiz-study-subject">{question.subject === 'math' ? '숫자와 친해져요' : question.kind === 'text' ? '마지막 20% · 단어 쓰기' : '차근차근 · 뜻 고르기'}</span>
        <h3 className={`quiz-study-prompt ${question.subject === 'math' ? 'is-math' : ''}`} ref={prompt} tabIndex={-1}>{question.prompt}</h3>
        {!question.result ? <form onSubmit={onSubmit}>
          {question.kind === 'choice' ? <div className="quiz-study-choices" role="group" aria-label="정답 보기">{question.choices.map((choice, i) => <button type="button" key={choice} aria-pressed={answer === choice} className={answer === choice ? 'selected' : ''} disabled={busy} onClick={() => onAnswer(choice)}><span className="quiz-study-choice-number">{answer === choice ? <Check size={17}/> : i + 1}</span><span className="quiz-study-choice-text">{choice}</span></button>)}</div> : <label className="quiz-study-answer"><span>내 답을 적어 주세요</span><input aria-label="내 답" value={answer} maxLength={100} autoComplete="off" spellCheck={false} disabled={busy} inputMode={question.kind === 'number' && grade < 5 ? 'numeric' : 'text'} placeholder={question.kind === 'number' ? grade >= 5 ? '예: 3/4 또는 0.75' : '정답 숫자' : '영어 단어'} onChange={event => onAnswer(event.target.value)}/></label>}
          <button className="quiz-study-submit" disabled={busy || !answer.trim()}>{busy ? <LoaderCircle className="spin" size={19}/> : <Check size={19}/>}답 확인하기</button>
        </form> : <div className={`quiz-study-feedback ${question.result.correct ? 'is-correct' : ''}`} aria-live="polite"><strong>{question.result.correct ? '정답! 잘했어요' : '함께 다시 알아봐요'}</strong><div className="quiz-study-solution"><span>내 답 <b>{question.result.answer}</b></span><span>정답 <b>{question.result.expected}</b></span></div><p>{question.result.explanation}</p><p className="quiz-study-understanding-hint">이제 얼마나 알겠나요? 고르면 다음 문제로 가요.</p><div className="quiz-study-understanding">{(['known', 'unsure', 'unknown'] as const).map((value, i) => <button type="button" key={value} disabled={busy} onClick={() => onUnderstand(value)}><span aria-hidden="true">{['😊', '🤔', '🌱'][i]}</span>{understandingLabels[value]}<ArrowRight size={15}/></button>)}</div></div>}
      </section> : <section className="quiz-study-finished"><div className="quiz-study-prize"><Shell size={30}/><Sparkles size={22}/></div><h3>오늘의 도전, 모두 해냈어요!</h3><p>{mode === 'review' ? `${total}문제를 다시 만나 더 단단해졌어요.` : `10문제를 끝까지 풀었어요. 보말 5개가 기록됐어요!`}</p>{notice && <p role="status">{notice}</p>}<button type="button" className="quiz-study-submit" onClick={onClose}>친구들 곁으로 돌아가기<ArrowRight size={18}/></button></section>}
      {busy && session && <p className="quiz-study-saving" role="status">풀이를 저장하고 있어요…</p>}
      <p className="quiz-study-footer">{session?.completed ? '내일도 작은 도전을 함께해요.' : '중간에 닫아도 저장한 풀이부터 이어 할 수 있어요.'}</p>
    </div>
  </dialog>;
}
