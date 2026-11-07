'use client';
import {useEffect, useRef, useState} from 'react';
import {FileUp, Sparkles, Trash2} from 'lucide-react';
import ko from '@/messages/cards-import-ko.json';
import en from '@/messages/cards-import-en.json';
import {CARD_AI_LEVELS, CARD_AI_TEXT_LIMIT, CARD_AI_WORD_LENGTH, cardAiFailureKey, chunkList, dedupeByFront, parseCardWords, splitCardText, type CardAiDraft, type CardAiLevel, type CardAiRequest} from '@/lib/cards-ai-draft';
import {parseCardImport, type ImportedCard} from '@/lib/cards-import';
import {useCardsCopy} from '@/lib/cards-copy';
import {cardsRequest, CardsDialog, CardsRequestError} from './cards-shared';
import '@/styles/cards-import.css';

type Tab = 'words' | 'text' | 'table';
type DraftRow = CardAiDraft & {id: string};
const TABS: Tab[] = ['words', 'text', 'table'], CARD_LIMIT = 200;

/** `fronts` has one entry per filled editor row. Draft rows stay here until the teacher presses 추가; nothing here saves a set. */
export default function CardsImportDialog({fronts, onAppend, onClose}: {fronts: string[]; onAppend: (cards: ImportedCard[]) => void; onClose: () => void}) {
  const {t, locale} = useCardsCopy(), copy = locale === 'ko' ? ko : en;
  const [tab, setTab] = useState<Tab>('words'), [level, setLevel] = useState<CardAiLevel>('elementary'), [words, setWords] = useState(''), [text, setText] = useState(''), [bulk, setBulk] = useState('');
  const [draft, setDraft] = useState<DraftRow[]>([]), [skipped, setSkipped] = useState<string[]>([]), [error, setError] = useState(''), [progress, setProgress] = useState<{done: number; total: number} | null>(null), [pending, setPending] = useState<CardAiRequest[]>([]);
  const control = useRef<AbortController | null>(null), messages = useRef<HTMLDivElement>(null), running = !!progress;
  useEffect(() => {if (error || skipped.length) messages.current?.scrollIntoView({block: 'nearest'});}, [error, skipped]); // 추가 sits below a long table.
  function close() {
    if ((running || draft.length || words.trim() || text.trim() || bulk.trim()) && !window.confirm(t('discard'))) return;
    control.current?.abort(); onClose();
  }
  async function run(requests: CardAiRequest[]) {
    const abort = new AbortController(); control.current = abort; setError(''); setPending([]);
    let rows = draft;
    for (let index = 0; index < requests.length; index++) {
      setProgress({done: index, total: requests.length});
      try {
        const {cards} = await cardsRequest<{cards: CardAiDraft[]}>('/api/cards/ai-draft', {method: 'POST', body: JSON.stringify(requests[index]), signal: abort.signal});
        const {fresh, duplicates} = dedupeByFront(cards, [...fronts, ...rows.map(row => row.front)], card => card.front);
        rows = [...rows, ...fresh.map(card => ({...card, id: crypto.randomUUID()}))]; setDraft(rows);
        if (duplicates.length) setSkipped(current => [...current, ...duplicates]);
      } catch (cause) {
        setPending(requests.slice(index));
        if (!abort.signal.aborted) setError(copy[cause instanceof CardsRequestError ? cardAiFailureKey(cause.status, cause.code) : 'aiFailed']);
        setProgress(null); return;
      }
    }
    setProgress(null);
    if (!rows.length) setError(copy.nothingFound);
  }
  function generate() {
    setError(''); setSkipped([]);
    if (tab === 'words') {
      const list = parseCardWords(words);
      if (!list.length) {setError(copy.noInput); return;}
      if (list.some(word => word.length > CARD_AI_WORD_LENGTH)) {setError(copy.wordTooLong); return;}
      const {fresh, duplicates} = dedupeByFront(list, [...fronts, ...draft.map(row => row.front)], word => word);
      setSkipped(duplicates);
      if (!fresh.length) return;
      if (fronts.length + draft.length + fresh.length > CARD_LIMIT) {setError(t('limit')); return;}
      void run(chunkList(fresh).map(chunk => ({mode: 'words', level, words: chunk})));
    } else {
      if (!text.trim()) {setError(copy.noInput); return;}
      if (text.length > CARD_AI_TEXT_LIMIT) {setError(copy.textTooLong); return;}
      void run(splitCardText(text).map(chunk => ({mode: 'text', level, text: chunk})));
    }
  }
  function add() {
    const rows = draft.map(row => ({...row, front: row.front.trim(), back: row.back.trim(), example: row.example.trim()}));
    if (rows.some(row => !row.front || !row.back)) {setError(copy.fillMissing); return;}
    const {fresh, duplicates} = dedupeByFront(rows, fronts, row => row.front);
    if (duplicates.length) {setDraft(fresh); setSkipped(duplicates); setError(''); return;}
    if (fronts.length + fresh.length > CARD_LIMIT) {setError(t('limit')); return;}
    onAppend(fresh.map(({front, back, example}) => ({front, back, example, alternatives: []})));
  }
  function importTable() {
    const result = parseCardImport(bulk);
    if (result.errors.length) {const issue = result.errors[0]; setError(`${t('importError')} ${issue.line}: ${t(issue.reason === 'format' ? 'format' : issue.reason === 'empty' ? 'emptyCell' : 'tooLong')}`); return;}
    if (fronts.length + result.cards.length > CARD_LIMIT) {setError(t('limit')); return;}
    onAppend(result.cards);
  }
  const editInput = (update: (value: string) => void) => (value: string) => {update(value); setPending([]);};
  const updateRow = (id: string, patch: Partial<CardAiDraft>) => setDraft(current => current.map(row => row.id === id ? {...row, ...patch} : row));
  const label = (key: 'front' | 'back' | 'example', index: number) => `${t(key)} ${index + 1}`;
  return <CardsDialog title={copy.title} closeLabel={t('close')} onClose={close}>
    <div className="cards-import-tabs" role="tablist" aria-label={copy.title}>{TABS.map(item => <button key={item} type="button" role="tab" aria-selected={tab === item} disabled={running} onClick={() => {setTab(item); setError('');}}>{copy[item]}</button>)}</div>
    {tab === 'table' ? <section className="cards-import" role="tabpanel"><p>{t('pasteHint')}</p><textarea aria-label={t('paste')} rows={5} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={t('pastePlaceholder')}/><div className="cards-actions"><label className="button cards-file-button"><FileUp size={16}/>{t('importFile')}<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={async e => {const file = e.target.files?.[0]; if (!file) return; if (file.size > 250_000 || !/\.(csv|tsv|txt)$/i.test(file.name)) {setError(t('fileError')); return;} try {setBulk(await file.text()); setError('');} catch {setError(t('fileError'));} e.target.value = '';}}/></label><button type="button" className="button primary" onClick={importTable}>{t('append')}</button></div></section>
    : <section className="cards-import" role="tabpanel"><p>{copy[tab === 'words' ? 'wordsHint' : 'textHint']}</p>
      {tab === 'words' ? <textarea key="words" aria-label={copy.words} rows={6} value={words} disabled={running} onChange={e => editInput(setWords)(e.target.value)} placeholder={copy.wordsPlaceholder}/> : <textarea key="text" aria-label={copy.text} rows={8} value={text} disabled={running} onChange={e => editInput(setText)(e.target.value)} placeholder={copy.textPlaceholder}/>}
      <div className="cards-actions"><label className="cards-import-level">{copy.level}<select value={level} disabled={running} onChange={e => {setLevel(e.target.value as CardAiLevel); setPending([]);}}>{CARD_AI_LEVELS.map(item => <option key={item} value={item}>{copy[item]}</option>)}</select></label>
        {tab === 'text' && <span className={`cards-import-count${text.length > CARD_AI_TEXT_LIMIT ? ' over' : ''}`}>{text.length.toLocaleString()} / {CARD_AI_TEXT_LIMIT.toLocaleString()}</span>}
        {running ? <button type="button" className="button" onClick={() => control.current?.abort()}>{copy.stop}</button> : <button type="button" className="button primary" onClick={generate}><Sparkles size={16}/>{copy.generate}</button>}</div>
    </section>}
    {progress && <div className="cards-import-progress" role="status"><p>{copy.progress} {progress.done + 1}/{progress.total}</p><progress max={progress.total} value={progress.done}/></div>}
    <div ref={messages}>{error && <div role="alert" className="cards-error"><span>{error}</span>{!!pending.length && <button type="button" className="button" onClick={() => void run(pending)}>{copy.retry}</button>}</div>}
    {!error && !running && !!pending.length && <div className="cards-actions secondary"><button type="button" className="button" onClick={() => void run(pending)}>{copy.resume}</button></div>}
    {!!skipped.length && <p className="cards-import-note">{copy.duplicates} {skipped.join(', ')}</p>}</div>
    {!!draft.length && <section className="cards-draft" aria-label={copy.draftCards}>
      <p className="cards-draft-notice">{copy.notice}</p>
      <fieldset disabled={running} className="cards-fieldset"><div className="cards-draft-head" aria-hidden="true"><span>{t('front')}</span><span>{t('back')}</span><span>{t('example')}</span></div>
        {draft.map((row, index) => <div key={row.id} className="cards-draft-row"><input aria-label={label('front', index)} aria-invalid={!row.front.trim()} maxLength={500} value={row.front} onChange={e => updateRow(row.id, {front: e.target.value})}/><input aria-label={label('back', index)} aria-invalid={!row.back.trim()} maxLength={500} value={row.back} onChange={e => updateRow(row.id, {back: e.target.value})}/><input aria-label={label('example', index)} maxLength={1000} value={row.example} onChange={e => updateRow(row.id, {example: e.target.value})}/><button type="button" className="icon-button" aria-label={`${copy.remove} ${index + 1}`} onClick={() => setDraft(current => current.filter(item => item.id !== row.id))}><Trash2 size={17}/></button></div>)}
      </fieldset>
      <div className="cards-dialog-footer"><p className="cards-muted">{copy.addHint}</p><div className="cards-actions"><strong>{draft.length} {t('cards')}</strong><button type="button" className="button primary" disabled={running} onClick={add}>{copy.add}</button></div></div>
    </section>}
  </CardsDialog>;
}
