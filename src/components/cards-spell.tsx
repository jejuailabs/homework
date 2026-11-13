'use client';

import {useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {Volume2, VolumeX} from 'lucide-react';
import {usePreferences} from './providers';
import {SPELL_SPEEDS, spellLetterDiff} from '@/lib/cards-logic';
import ko from '@/messages/cards-spell-ko.json';
import en from '@/messages/cards-spell-en.json';
import '@/styles/cards-spell.css';

/**
 * 스펠학습, laid out the way 클래스카드 runs it. A sentence set picks one of 어순배열 (pick the words in order; a wrong pick ends the try),
 * 딕테이션 (listen and type, or only each word's first letter) and 영작 (read the meaning and type, with sentence or letter feedback, or first letters).
 * A word set types the answer. Every set shares the same rhythm: a miss offers 지금 재시도 (Enter) or 나중에 다시 (Space), a hit offers 한번 더 or 다음 카드,
 * and 힌트 보기 (Ctrl+H) shows the whole answer but sends the card round again.
 */
export type SpellMethod = 'scramble' | 'dictation' | 'dictation-initial' | 'write' | 'write-letter' | 'write-initial';
export const SPELL_METHODS: SpellMethod[] = ['scramble', 'dictation', 'dictation-initial', 'write', 'write-letter', 'write-initial'];
export type SpellFeedback = {correct: boolean; expected: string; answer?: string; hinted?: boolean};
export type SpellToken = {text: string; id: number};
export function useSpellCopy() {const {locale} = usePreferences(); return locale === 'ko' ? ko : en;}

const family = (method: SpellMethod) => method.startsWith('dictation') ? 'dictation' : method.startsWith('write') ? 'write' : 'scramble';

export function SpellMethodPicker({method, onChange, speed, onSpeed}: {method: SpellMethod; onChange: (method: SpellMethod) => void; speed: number; onSpeed: (speed: number) => void}) {
  const s = useSpellCopy(), current = family(method);
  const dictationKind = method === 'dictation-initial' ? 'dictation-initial' : 'dictation', writeKind = method === 'write-letter' || method === 'write-initial' ? method : 'write';
  return <fieldset className="cspl-methods"><legend>{s.method}</legend>
    <label className="cspl-method"><input type="radio" name="spell-method" checked={current === 'scramble'} onChange={() => onChange('scramble')}/><span>{s.scramble}</span></label>
    <label className="cspl-method"><input type="radio" name="spell-method" checked={current === 'dictation'} onChange={() => onChange(dictationKind)}/><span>{s.dictation}</span><select aria-label={`${s.dictation} ${s.method}`} value={dictationKind} disabled={current !== 'dictation'} onChange={event => onChange(event.target.value as SpellMethod)}><option value="dictation">{s.dictationFull}</option><option value="dictation-initial">{s.initialOnly}</option></select></label>
    <label className="cspl-method"><input type="radio" name="spell-method" checked={current === 'write'} onChange={() => onChange(writeKind)}/><span>{s.write}</span><select aria-label={`${s.write} ${s.method}`} value={writeKind} disabled={current !== 'write'} onChange={event => onChange(event.target.value as SpellMethod)}><option value="write">{s.writeSentence}</option><option value="write-letter">{s.writeLetter}</option><option value="write-initial">{s.initialOnly}</option></select></label>
    <label className="cspl-method cspl-speed"><span>{s.speed}</span><select value={speed} onChange={event => onSpeed(Number(event.target.value))}>{SPELL_SPEEDS.map(rate => <option key={rate} value={rate}>{rate.toFixed(1)} ({s.speedUnit})</option>)}</select></label>
  </fieldset>;
}

type BoardProps = {
  sentence: boolean; method: SpellMethod; meaning: string; expected: string; feedback?: SpellFeedback;
  answer: string; onAnswer: (value: string) => void; onSubmit: () => void;
  tokens: SpellToken[]; picked: number[]; wrongToken: number | null; onPick: (token: SpellToken) => void;
  canSpeak: boolean; onListen: () => void; onHint: () => void; focusKey: string;
};
/** The card itself: the meaning (or the 발음 듣기 button), the answer line or box, the word chips and the hint link. */
export function SpellBoard({sentence, method, meaning, expected, feedback, answer, onAnswer, onSubmit, tokens, picked, wrongToken, onPick, canSpeak, onListen, onHint, focusKey}: BoardProps) {
  const s = useSpellCopy(), field = useRef<HTMLTextAreaElement & HTMLInputElement>(null), kind = sentence ? family(method) : 'word';
  useEffect(() => {if (!feedback) field.current?.focus();}, [focusKey, feedback]);
  const enter = (event: ReactKeyboardEvent) => {if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); if (!feedback) onSubmit();}};
  const tone = feedback ? feedback.correct ? 'is-correct' : 'is-incorrect' : '';
  // As in 클래스카드, the sentence plays only once the try is graded; before that it would give the answer away.
  const speaker = canSpeak && <button type="button" className="cspl-speaker" aria-label={s.listen} disabled={!feedback} onClick={onListen}>{feedback ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button>;
  if (kind === 'scramble') {
    const shown = feedback?.correct || feedback?.hinted ? expected : picked.map(id => tokens.find(token => token.id === id)?.text).join(' ');
    return <div className="cspl-board"><p className="cspl-meaning" lang="ko">{meaning}</p>
      <div className={`cspl-line ${tone}`}>{speaker}<span className="cspl-line-text" lang="en">{shown}</span></div>
      <div className="cspl-chips" aria-label={s.scrambleGuide}>{tokens.map(token => {const used = picked.includes(token.id), wrong = wrongToken === token.id; return <button key={token.id} type="button" className={`cspl-chip ${used ? 'is-used' : ''} ${wrong ? 'is-wrong' : ''}`} disabled={!!feedback || used} aria-hidden={used || undefined} onClick={() => onPick(token)}>{used ? <span className="cspl-chip-ghost">{token.text}</span> : token.text}</button>;})}</div>
      {!feedback && <p className="cspl-guide">{s.scrambleGuide}</p>}
    </div>;
  }
  const placeholder = kind === 'word' ? s.wordPlaceholder : method === 'dictation' ? s.dictationPlaceholder : method === 'dictation-initial' ? s.dictationInitialPlaceholder : method === 'write-initial' ? s.writeInitialPlaceholder : s.writePlaceholder;
  const box = kind === 'word'
    ? <input ref={field} className={`cspl-input ${tone}`} value={answer} maxLength={1000} disabled={!!feedback} placeholder={placeholder} aria-label={placeholder} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} onPaste={event => event.preventDefault()} onChange={event => onAnswer(event.target.value)} onKeyDown={enter}/>
    : <textarea ref={field} className={`cspl-input cspl-textarea ${tone}`} rows={4} value={answer} maxLength={1000} disabled={!!feedback} placeholder={placeholder} aria-label={placeholder} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} lang="en" onPaste={event => event.preventDefault()} onChange={event => onAnswer(event.target.value)} onKeyDown={enter}/>;
  return <div className="cspl-board">
    {kind === 'dictation' ? <button type="button" className="cspl-listen" onClick={onListen} disabled={!canSpeak}><Volume2 size={17}/>{s.listen}</button> : kind === 'write' && <p className="cspl-meaning cspl-meaning-strong" lang="ko">{speaker}{meaning}</p>}
    {box}
    {!feedback && <button type="button" className="cspl-hint-link" onClick={onHint}>{s.hint}<small>Ctrl+H</small></button>}
  </div>;
}

/** The bar along the bottom once a try is graded. Enter and Space work as the two buttons. */
export function SpellFeedbackBar({feedback, method, sentence, saveNote, onEnter, onSpace}: {feedback: SpellFeedback; method: SpellMethod; sentence: boolean; saveNote: React.ReactNode; onEnter: () => void; onSpace: () => void}) {
  const s = useSpellCopy(), diff = sentence && method === 'write-letter' && !feedback.correct && feedback.answer && !feedback.hinted ? spellLetterDiff(feedback.expected, feedback.answer) : null;
  return <div className={`cspl-bar ${feedback.correct ? 'is-correct' : 'is-incorrect'}`} role="status">
    <div className="cspl-bar-copy">{feedback.correct ? <strong className="cspl-good">{s.goodJob}</strong> : <>
      {feedback.hinted && <strong>{s.hintedCorrect}</strong>}
      <p><span className="cspl-badge">{s.answerLabel}</span><b lang={sentence ? 'en' : undefined}>{feedback.expected}</b></p>
      {diff && <p><span className="cspl-badge is-mine">{s.mine}</span><span className="cspl-diff-ok">{diff.ok}</span><span className="cspl-diff-wrong">{diff.wrong || '…'}</span></p>}
    </>}{saveNote}</div>
    <div className="cspl-bar-actions">
      <span><button type="button" className="button cspl-soft" onClick={onEnter}>{feedback.correct ? s.onceMore : s.retryNow}</button><small>ENTER</small></span>
      <span><button type="button" className="button primary" onClick={onSpace}>{feedback.correct ? s.nextCard : s.later}</button><small>SPACE</small></span>
    </div>
  </div>;
}

/** 힌트 보기: the whole answer over the card until any key or the back link. */
export function SpellHint({text, sentence, onClose}: {text: string; sentence: boolean; onClose: () => void}) {
  const s = useSpellCopy(), back = useRef<HTMLButtonElement>(null);
  useEffect(() => {back.current?.focus();}, []);
  return <div className="cspl-hint" role="dialog" aria-modal="true" aria-label={s.hintTitle} onClick={onClose}>
    <p className="cspl-hint-title">{s.hintTitle}</p>
    <div className="cspl-hint-answer" lang={sentence ? 'en' : undefined}>{text}</div>
    <button ref={back} type="button" className="cspl-hint-link" onClick={onClose}>{s.hintBack}<small>{s.hintAnyKey}</small></button>
  </div>;
}
