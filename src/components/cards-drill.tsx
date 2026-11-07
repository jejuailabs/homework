'use client';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, ListChecks, Plus, RotateCcw, Trash2, X} from 'lucide-react';
import type {CardDistribution, CardEntry, CardTestQuestion} from '@/lib/cards-types';
import {CARD_DRILL_CHOICES, CARD_DRILL_KINDS, blankAnswer, drillAnswerText, drillQuestion, gradeDrill, isBlankKind, passageBlanks, readBlankAnswer, type CardDrill, type CardDrillKind} from '@/lib/cards-drill';
import {cardDueState} from '@/lib/cards-logic';
import {useCardsP2Copy} from '@/lib/cards-p2-copy';
import {fillCopy} from '@/lib/cards-class-copy';
import {CardBuddy, CardError, CardLoading, cardRequest, useCardCopy} from './cards-study';
import {CardTestWait} from './cards-care';
import '@/styles/cards-p2.css';

export const drillKindLabel = (p: ReturnType<typeof useCardsP2Copy>, kind: CardDrillKind) => ({choice: p.drillChoice, ox: p.drillOx, 'choice-blank': p.drillChoiceBlank, short: p.drillShort, 'short-blank': p.drillShortBlank})[kind];
export const newDrill = (kind: CardDrillKind = 'choice'): CardDrill => kind === 'choice' ? {kind, choices: ['', '', '', ''], answer: 0} : kind === 'ox' ? {kind, answer: 0} : kind === 'choice-blank' ? {kind, blanks: []} : {kind};

type Row = {front: string; back: string; example: string; alternativesText: string; drill?: CardDrill};
/** One 연습문제 row in the set editor. The back (answer shown in reports) is worked out by the server from what is entered here. */
export function DrillRowEditor({row, label, onChange}: {row: Row; label: string; onChange: (patch: Partial<Row>) => void}) {
  const p = useCardsP2Copy(), drill = row.drill ?? newDrill(), blanks = isBlankKind(drill.kind) ? passageBlanks(row.example) : [];
  const setDrill = (next: Partial<CardDrill>) => onChange({drill: {...drill, ...next}});
  return <div className="cards-drill-row">
    <div className="cards-form-grid"><label>{p.drillKind}<select value={drill.kind} onChange={e => onChange({drill: newDrill(e.target.value as CardDrillKind)})}>{CARD_DRILL_KINDS.map(kind => <option key={kind} value={kind}>{drillKindLabel(p, kind)}</option>)}</select></label><label>{isBlankKind(drill.kind) ? p.drillInstruction : p.drillQuestion}<textarea rows={2} maxLength={1000} value={row.front} onChange={e => onChange({front: e.target.value})}/></label></div>
    <label className="cards-drill-passage">{isBlankKind(drill.kind) ? p.drillPassageBlanks : p.drillPassage}<textarea rows={isBlankKind(drill.kind) ? 3 : 2} maxLength={2000} value={row.example} placeholder={isBlankKind(drill.kind) ? (drill.kind === 'short-blank' ? 'I [have/own] a dog.' : 'I [have] a dog.') : ''} onChange={e => onChange({example: e.target.value})}/></label>
    {isBlankKind(drill.kind) && <p className="cards-muted">{drill.kind === 'short-blank' ? p.drillShortBlankHint : p.drillChoiceBlankHint}</p>}
    {drill.kind === 'choice' && <fieldset className="cards-drill-choices"><legend>{p.drillChoices}</legend>{(drill.choices ?? []).map((choice, index) => <div key={index} className="cards-drill-choice"><input type="radio" name={`${label}-answer`} aria-label={fillCopy(p.drillAnswerPick, {n: index + 1})} checked={drill.answer === index} onChange={() => setDrill({answer: index})}/><span>{index + 1}</span><input aria-label={fillCopy(p.drillChoiceN, {n: index + 1})} maxLength={300} value={choice} onChange={e => setDrill({choices: (drill.choices ?? []).map((value, at) => at === index ? e.target.value : value)})}/><button type="button" className="icon-button" aria-label={fillCopy(p.drillRemoveChoice, {n: index + 1})} disabled={(drill.choices ?? []).length <= CARD_DRILL_CHOICES.min} onClick={() => {const choices = (drill.choices ?? []).filter((_, at) => at !== index), current = drill.answer ?? 0; setDrill({choices, answer: Math.min(index === current ? 0 : index < current ? current - 1 : current, choices.length - 1)});}}><Trash2 size={15}/></button></div>)}<button type="button" className="button" disabled={(drill.choices ?? []).length >= CARD_DRILL_CHOICES.max} onClick={() => setDrill({choices: [...(drill.choices ?? []), '']})}><Plus size={15}/>{p.drillAddChoice}</button><p className="cards-muted">{p.drillChoiceHint}</p></fieldset>}
    {drill.kind === 'ox' && <div className="cards-drill-ox" role="radiogroup" aria-label={p.drillAnswer}>{['O', 'X'].map((mark, index) => <label key={mark} className="cards-check"><input type="radio" name={`${label}-ox`} checked={drill.answer === index} onChange={() => setDrill({answer: index})}/>{mark}</label>)}</div>}
    {drill.kind === 'short' && <div className="cards-form-grid"><label>{p.drillAnswer}<input maxLength={1000} value={row.back} onChange={e => onChange({back: e.target.value})}/></label><label>{p.drillAlternatives}<input value={row.alternativesText} onChange={e => onChange({alternativesText: e.target.value})}/></label></div>}
    {drill.kind === 'choice-blank' && blanks.map((answers, index) => <label key={index} className="cards-drill-blank">{fillCopy(p.drillBlankWrong, {n: index + 1, answer: answers[0]})}<input value={(drill.blanks?.[index]?.wrong ?? []).join(', ')} onChange={e => {const next = blanks.map((_, at) => ({wrong: at === index ? e.target.value.split(',').map(value => value.trimStart()) : drill.blanks?.[at]?.wrong ?? []})); setDrill({blanks: next});}}/></label>)}
    {drill.kind === 'short-blank' && blanks.length > 0 && <p className="cards-muted">{blanks.map((answers, index) => `(${index + 1}) ${answers.join(' / ')}`).join('  ')}</p>}
  </div>;
}

type Question = Pick<CardTestQuestion, 'prompt' | 'choices' | 'drill'>;
/** A drill question for practice and tests: passage, then choices, a text box or one control per blank. */
export function DrillQuestionView({question, number, name, value, onChange, disabled}: {question: Question; number: number; name: string; value: string; onChange: (value: string) => void; disabled?: boolean}) {
  const {copy: c} = useCardCopy(), p = useCardsP2Copy(), blanks = question.drill?.blanks;
  const values = blanks ? readBlankAnswer(value, blanks.length) ?? blanks.map(() => '') : [];
  const setBlank = (index: number, text: string) => onChange(blankAnswer(values.map((item, at) => at === index ? text : item)));
  return <fieldset className="cs-test-question cs-drill-question"><legend><span>{number}.</span> {question.prompt}</legend>
    {question.drill?.passage && <p className="cs-drill-passage">{question.drill.passage}</p>}
    {blanks ? <div className="cs-drill-blanks">{blanks.map((blank, index) => <label key={index}><span>( {index + 1} )</span>{blank.choices ? <select value={values[index]} disabled={disabled} required onChange={e => setBlank(index, e.target.value)}><option value="">{p.drillPick}</option>{blank.choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}</select> : <input value={values[index]} disabled={disabled} required autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={e => setBlank(index, e.target.value)}/>}</label>)}</div>
      : question.choices?.length ? <div className="cs-test-choices">{question.choices.map((choice, index) => <label key={choice} className={`cs-test-choice ${value === choice ? 'is-selected' : ''}`}><input type="radio" name={name} value={choice} checked={value === choice} onChange={() => onChange(choice)} required disabled={disabled}/><span>{question.drill?.kind === 'ox' ? choice : `${index + 1}. ${choice}`}</span></label>)}</div>
      : <input aria-label={`${number}. ${question.prompt}`} value={value} onChange={e => onChange(e.target.value)} required disabled={disabled} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={c.placeholder}/>}
  </fieldset>;
}
/** How a stored answer reads back to a student or teacher: blank answers are listed, others shown as written. */
export const drillAnswerLabel = (question: Question, answer: string) => question.drill?.blanks ? (readBlankAnswer(answer, question.drill.blanks.length) ?? []).map((item, index) => `(${index + 1}) ${item || '—'}`).join(' ') : answer;

/** 연습문제 풀기: every question once in order, checked in the browser with the same rule the server uses. Nothing is recorded. */
export function CardsDrillPractice({cards, onDone}: {cards: CardEntry[]; onDone?: () => void}) {
  const p = useCardsP2Copy(), {copy: c} = useCardCopy(), deck = useMemo(() => cards.filter(card => card.drill), [cards]);
  const [index, setIndex] = useState(0), [value, setValue] = useState(''), [checked, setChecked] = useState<boolean | null>(null), [right, setRight] = useState(0), [done, setDone] = useState(false), [seed, setSeed] = useState(0);
  const card = deck[index], question = useMemo(() => card ? (({choices, ...drill}) => ({prompt: card.front, choices, drill}))(drillQuestion(card, max => Math.floor(Math.random() * max))) : null, [card, seed]);
  if (!deck.length) return <div className="cs-state"><ListChecks size={30}/><p>{p.drillNone}</p></div>;
  if (done) return <div className="cs-state cards-chunk-done"><CardBuddy happy={right === deck.length}/><h2>{p.drillDone}</h2><p>{fillCopy(p.drillScore, {right, total: deck.length})}</p><div className="cards-actions"><button className="button" onClick={() => {setIndex(0); setRight(0); setDone(false); setValue(''); setChecked(null); setSeed(seed + 1);}}><RotateCcw size={16}/>{p.chunkAgain}</button>{onDone && <button className="button primary" onClick={onDone}>{p.chunkFinish}</button>}</div><p className="cs-muted">{p.drillNoRecord}</p></div>;
  function check() {const ok = gradeDrill(card, value); setChecked(ok); if (ok) setRight(right + 1);}
  function next() {if (index + 1 >= deck.length) {setDone(true); return;} setIndex(index + 1); setValue(''); setChecked(null);}
  return <form className="cards-drill-practice" onSubmit={event => {event.preventDefault(); if (checked === null) check(); else next();}}>
    <div className="cards-chunk-progress"><span>{index + 1} / {deck.length}</span><span className="cs-tag">{drillKindLabel(p, card.drill!.kind)}</span></div>
    {question && <DrillQuestionView question={question} number={index + 1} name={`drill-${card.id}`} value={value} onChange={setValue} disabled={checked !== null}/>}
    {checked !== null && <p role="status" className={`cards-chunk-feedback ${checked ? 'is-right' : 'is-wrong'}`}>{checked ? <><Check size={16}/>{p.chunkRight}</> : <><X size={16}/>{c.correctAnswer}: {drillAnswerText(card)}</>}</p>}
    <div className="cards-actions cards-chunk-actions">{checked === null ? <button className="button primary">{p.chunkCheck}</button> : <button className="button primary">{index + 1 >= deck.length ? p.chunkFinish : p.drillNext}<ArrowRight size={16}/></button>}</div>
  </form>;
}

type Detail = {distribution: CardDistribution; serverTime?: string; testActive?: {attemptId: string}};
/** /student/cards/[id]/drill */
export function StudentDrillPractice({distributionId}: {distributionId: string}) {
  const {copy: c} = useCardCopy(), p = useCardsP2Copy();
  const [data, setData] = useState<Detail | null>(null), [error, setError] = useState(false);
  const load = useCallback(() => {setError(false); cardRequest<Detail>(`/api/cards/distributions/${distributionId}`).then(setData).catch(() => setError(true));}, [distributionId]);
  useEffect(() => {load();}, [load]);
  if (error) return <CardError retry={load}/>;
  if (!data) return <CardLoading/>;
  const back = <Link className="cs-back" href={`/student/cards/${distributionId}`}><ArrowLeft size={16}/>{c.back}</Link>;
  if (data.testActive) return <section className="cs-workspace">{back}<CardTestWait distributionId={distributionId}/></section>;
  const locked = cardDueState(data.distribution, Date.parse(data.serverTime ?? '') || Date.now()) === 'lock';
  return <section className="cs-workspace">{back}<header className="cs-heading"><div><p className="cs-eyebrow"><ListChecks size={17}/>{p.drillPractice}</p><h1>{data.distribution.title}</h1><p>{p.drillIntro}</p></div></header>
    {locked ? <p className="cs-alert" role="status">{c.dueLocked}</p> : <CardsDrillPractice cards={data.distribution.snapshot.cards}/>}
  </section>;
}
