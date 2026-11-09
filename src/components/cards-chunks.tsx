'use client';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, RotateCcw, Scissors, Volume2, Wand2} from 'lucide-react';
import type {CardDistribution, CardEntry} from '@/lib/cards-types';
import {cardWords, chunkCards, chunkOrderCorrect, chunkPieces, suggestChunks, toggleChunk} from '@/lib/cards-chunks';
import {cardDueState} from '@/lib/cards-logic';
import {useCardsP2Copy} from '@/lib/cards-p2-copy';
import {fillCopy} from '@/lib/cards-class-copy';
import {CardBuddy, CardError, CardLoading, cardRequest, useCardCopy} from './cards-study';
import {CardTestWait} from './cards-care';
import {speakWithDevice, ttsPlayer} from '@/lib/tts-client';
import '@/styles/cards-p2.css';

/** 끊어읽기 조각 편집: tap the gap between two words to put a break there or take it away. */
export function CardChunkEditor({text, chunks, onChange}: {text: string; chunks: number[]; onChange: (next: number[]) => void}) {
  const p = useCardsP2Copy(), words = cardWords(text);
  if (words.length < 2) return <p className="cards-muted">{p.chunkNeedWords}</p>;
  return <div className="cards-chunk-editor">
    <p className="cards-muted">{p.chunkEditHint}</p>
    <div className="cards-chunk-words">{words.map((word, index) => <span key={index} className="cards-chunk-word"><span>{word}</span>{index < words.length - 1 && <button type="button" className={`cards-chunk-gap${chunks.includes(index + 1) ? ' is-cut' : ''}`} aria-pressed={chunks.includes(index + 1)} aria-label={fillCopy(p.chunkGap, {a: word, b: words[index + 1]})} onClick={() => onChange(toggleChunk(chunks, index + 1, text))}>{chunks.includes(index + 1) ? '/' : '·'}</button>}</span>)}</div>
    <div className="cards-actions"><button type="button" className="button" onClick={() => onChange(suggestChunks(text))}><Wand2 size={15}/>{p.chunkSuggest}</button><button type="button" className="button" disabled={!chunks.length} onClick={() => onChange([])}>{p.chunkClear}</button><span className="cards-muted">{fillCopy(p.chunkCount, {n: chunkPieces(text, chunks).length})}</span></div>
  </div>;
}

/** 원어민 음성(서버 TTS), 안 되면 기기 목소리. */
function speakText(text: string, rate = 1) {
  if (typeof window === 'undefined' || !text) return;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  void ttsPlayer().speak(text, {rate, source: 'cards', fallback: () => speakWithDevice(text, rate)});
}
const shuffle = <T,>(values: T[]) => {const result = [...values]; for (let index = result.length - 1; index > 0; index--) {const other = Math.floor(Math.random() * (index + 1)); [result[index], result[other]] = [result[other], result[index]];} return result;};

/**
 * 끊어읽기 practice: for each cut sentence, read it chunk by chunk with its meaning, then rebuild it from shuffled chunks.
 * It runs in the browser only and records nothing: it is practice, not a required mode or a score.
 */
export function CardsChunkPractice({cards, speechRate = 1, onDone}: {cards: CardEntry[]; speechRate?: number; onDone?: () => void}) {
  const p = useCardsP2Copy(), deck = useMemo(() => chunkCards(cards), [cards]);
  const [index, setIndex] = useState(0), [step, setStep] = useState<'read' | 'build'>('read'), [shown, setShown] = useState(1), [picked, setPicked] = useState<number[]>([]), [order, setOrder] = useState<number[]>([]), [checked, setChecked] = useState<boolean | null>(null), [right, setRight] = useState(0), [done, setDone] = useState(false);
  const card = deck[index], pieces = useMemo(() => card ? chunkPieces(card.front, card.chunks) : [], [card]);
  const reset = useCallback((next: number) => {setIndex(next); setStep('read'); setShown(1); setPicked([]); setChecked(null); const cut = deck[next] ? chunkPieces(deck[next].front, deck[next].chunks) : []; let shuffled = shuffle(cut.map((_, i) => i)); if (cut.length > 1 && shuffled.every((value, i) => value === i)) shuffled = [...shuffled.slice(1), shuffled[0]]; setOrder(shuffled);}, [deck]);
  useEffect(() => {reset(0);}, [reset]);
  if (!deck.length) return <div className="cs-state"><Scissors size={30}/><p>{p.chunkNone}</p></div>;
  if (done) return <div className="cs-state cards-chunk-done"><CardBuddy happy/><h2>{p.chunkDone}</h2><p>{fillCopy(p.chunkScore, {right, total: deck.length})}</p><div className="cards-actions"><button className="button" onClick={() => {setRight(0); setDone(false); reset(0);}}><RotateCcw size={16}/>{p.chunkAgain}</button>{onDone && <button className="button primary" onClick={onDone}>{p.chunkFinish}</button>}</div><p className="cs-muted">{p.chunkNoRecord}</p></div>;
  const answer = picked.map(i => pieces[i]);
  function next() {if (index + 1 >= deck.length) setDone(true); else reset(index + 1);}
  return <div className="cards-chunk-practice">
    <div className="cards-chunk-progress"><span>{index + 1} / {deck.length}</span><span className="cs-tag">{step === 'read' ? p.chunkRead : p.chunkBuild}</span></div>
    {step === 'read' ? <>
      <p className="cards-chunk-line" aria-live="polite">{pieces.map((piece, i) => <span key={i} className={i < shown ? 'is-shown' : ''}>{i < shown ? piece : '…'}{i < pieces.length - 1 && <b aria-hidden="true"> / </b>}</span>)}</p>
      {shown >= pieces.length && <p className="cards-chunk-meaning">{card.back}</p>}
      <div className="cards-actions cards-chunk-actions"><button className="button" onClick={() => speakText(pieces[Math.max(0, shown - 1)], speechRate)}><Volume2 size={16}/>{p.chunkListen}</button>{shown < pieces.length ? <button className="button primary" onClick={() => {setShown(shown + 1); speakText(pieces[shown], speechRate);}}>{p.chunkNextPiece}<ArrowRight size={16}/></button> : <button className="button primary" onClick={() => setStep('build')}>{p.chunkToBuild}<ArrowRight size={16}/></button>}</div>
    </> : <>
      <p className="cards-chunk-meaning">{card.back}</p>
      <div className="cards-chunk-answer" aria-live="polite">{answer.length ? answer.map((piece, i) => <button key={i} type="button" className="cards-chunk-piece is-picked" disabled={checked === true} onClick={() => {setPicked(picked.filter((_, at) => at !== i)); setChecked(null);}}>{piece}</button>) : <span className="cs-muted">{p.chunkTapHint}</span>}</div>
      <div className="cards-chunk-bank">{order.map(i => <button key={i} type="button" className="cards-chunk-piece" disabled={picked.includes(i) || checked === true} onClick={() => {setPicked([...picked, i]); setChecked(null);}}>{pieces[i]}</button>)}</div>
      {checked !== null && <p role="status" className={`cards-chunk-feedback ${checked ? 'is-right' : 'is-wrong'}`}>{checked ? <><Check size={16}/>{p.chunkRight}</> : p.chunkWrong}</p>}
      <div className="cards-actions cards-chunk-actions">{checked === true ? <button className="button primary" onClick={next}>{index + 1 >= deck.length ? p.chunkFinish : p.chunkNext}<ArrowRight size={16}/></button> : <><button className="button" onClick={() => {setPicked([]); setChecked(null);}}>{p.chunkClear}</button><button className="button primary" disabled={picked.length !== pieces.length} onClick={() => {const ok = chunkOrderCorrect(pieces, answer); if (ok && checked === null) setRight(right + 1); setChecked(ok); if (ok) speakText(card.front, speechRate);}}>{p.chunkCheck}</button><button className="button" onClick={() => {setPicked(pieces.map((_, i) => i)); setChecked(true);}}>{p.chunkShow}</button></>}</div>
    </>}
  </div>;
}

type Detail = {distribution: CardDistribution; serverTime?: string; testActive?: {attemptId: string}};
/** /student/cards/[id]/chunk: loads the set like the other modes and waits while this student's test runs (시험 정답 보호). */
export function StudentChunkPractice({distributionId}: {distributionId: string}) {
  const {copy: c} = useCardCopy(), p = useCardsP2Copy();
  const [data, setData] = useState<Detail | null>(null), [error, setError] = useState(false);
  const load = useCallback(() => {setError(false); cardRequest<Detail>(`/api/cards/distributions/${distributionId}`).then(setData).catch(() => setError(true));}, [distributionId]);
  useEffect(() => {load();}, [load]);
  if (error) return <CardError retry={load}/>;
  if (!data) return <CardLoading/>;
  const back = <Link className="cs-back" href={`/student/cards/${distributionId}`}><ArrowLeft size={16}/>{c.back}</Link>;
  if (data.testActive) return <section className="cs-workspace">{back}<CardTestWait distributionId={distributionId}/></section>;
  const locked = cardDueState(data.distribution, Date.parse(data.serverTime ?? '') || Date.now()) === 'lock';
  return <section className="cs-workspace">{back}<header className="cs-heading"><div><p className="cs-eyebrow"><Scissors size={17}/>{p.chunkMode}</p><h1>{data.distribution.title}</h1><p>{p.chunkIntro}</p></div></header>
    {locked ? <p className="cs-alert" role="status">{c.dueLocked}</p> : <CardsChunkPractice cards={data.distribution.snapshot.cards} speechRate={data.distribution.speechRate ?? 1}/>}
  </section>;
}
