'use client';
import {useEffect, useRef, useState} from 'react';
import {Camera, FileUp, Sparkles, Trash2, X} from 'lucide-react';
import ko from '@/messages/cards-import-ko.json';
import en from '@/messages/cards-import-en.json';
import {CARD_AI_COUNT_MAX, CARD_AI_LEVELS, CARD_AI_TEXT_LIMIT, CARD_AI_TOPIC_LENGTH, CARD_AI_WORD_LENGTH, CARD_PHOTO_CHARS, CARD_PHOTO_EDGE, CARD_PHOTO_LIMIT, cardAiFailureKey, chunkList, dedupeByFront, fitPhotoSize, parseCardWords, photoFileProblem, splitCardText, type CardAiDraft, type CardAiLevel, type CardAiRequest} from '@/lib/cards-ai-draft';
import {CARD_EXAMPLE_LIMIT, CARD_TEXT_LIMIT} from '@/lib/cards-logic';
import {CARD_XLSX_BYTES, groupImportErrors, parseCardImport, parseCardXlsx, type CardImportResult, type ImportedCard} from '@/lib/cards-import';
import type {CardSet, CardSetSummary} from '@/lib/cards-types';
import {useCardsCopy} from '@/lib/cards-copy';
import {cardsMetadataPages, cardsRequest, CardsDialog, CardsLoading, CardsRequestError} from './cards-shared';
import '@/styles/cards-import.css';

type Tab = 'words' | 'text' | 'photo' | 'passage' | 'topic' | 'table' | 'merge';
type DraftRow = CardAiDraft & {id: string; keep: boolean};
type Photo = {id: string; name: string; image: string};
const TABS: Tab[] = ['words', 'text', 'photo', 'passage', 'topic', 'table', 'merge'], AI_TABS: Tab[] = ['words', 'text', 'photo', 'passage', 'topic'], CARD_LIMIT = 200;

/** Shrinks in the browser: long edge 1600px, JPEG re-encode (drops EXIF and location). The photo only leaves in the draft request and is never stored. */
async function shrinkPhoto(file: File): Promise<string> {
  let source: ImageBitmap | HTMLImageElement, url = '';
  try {source = await createImageBitmap(file, {imageOrientation: 'from-image'});}
  catch {url = URL.createObjectURL(file); source = await new Promise<HTMLImageElement>((resolve, reject) => {const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url;});}
  try {
    for (const [edge, quality] of [[CARD_PHOTO_EDGE, .85], [CARD_PHOTO_EDGE, .7], [1200, .7]] as const) {
      const size = fitPhotoSize(source.width, source.height, edge), canvas = document.createElement('canvas');
      canvas.width = size.width; canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas');
      context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height); context.drawImage(source, 0, 0, size.width, size.height);
      const image = canvas.toDataURL('image/jpeg', quality);
      if (image.length <= CARD_PHOTO_CHARS) return image;
    }
    throw new Error('too large');
  } finally {if ('close' in source) source.close(); if (url) URL.revokeObjectURL(url);}
}

/** `fronts` has one entry per filled editor row. Draft rows stay here until the teacher presses 추가; nothing here saves a set. */
export default function CardsImportDialog({fronts, setId, onAppend, onClose}: {fronts: string[]; setId?: string; onAppend: (cards: ImportedCard[]) => void; onClose: () => void}) {
  const {t, locale} = useCardsCopy(), copy = locale === 'ko' ? ko : en;
  const [tab, setTab] = useState<Tab>('words'), [level, setLevel] = useState<CardAiLevel>('elementary'), [words, setWords] = useState(''), [text, setText] = useState(''), [bulk, setBulk] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]), [shrinking, setShrinking] = useState(false), [passage, setPassage] = useState(''), [topic, setTopic] = useState(''), [count, setCount] = useState(15);
  const [sets, setSets] = useState<CardSetSummary[] | null>(null), [mergeId, setMergeId] = useState(''), [merge, setMerge] = useState<{fresh: ImportedCard[]; duplicates: string[]} | null>(null), [mergeBusy, setMergeBusy] = useState(false);
  const [draft, setDraft] = useState<DraftRow[]>([]), [skipped, setSkipped] = useState<string[]>([]), [error, setError] = useState(''), [progress, setProgress] = useState<{done: number; total: number} | null>(null), [pending, setPending] = useState<CardAiRequest[]>([]);
  const control = useRef<AbortController | null>(null), messages = useRef<HTMLDivElement>(null), running = !!progress;
  useEffect(() => {if (error || skipped.length) messages.current?.scrollIntoView({block: 'nearest'});}, [error, skipped]); // 추가 sits below a long table.
  useEffect(() => {
    if (tab !== 'merge' || sets) return;
    cardsMetadataPages<CardSetSummary>('/api/cards/library', 'sets').then(list => setSets(list.filter(item => item.id !== setId && item.cardCount > 0))).catch(() => {setSets([]); setError(copy.mergeFailed);});
  }, [tab, sets, setId, copy.mergeFailed]);
  function close() {
    if ((running || draft.length || words.trim() || text.trim() || bulk.trim() || photos.length || passage.trim() || topic.trim()) && !window.confirm(t('discard'))) return;
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
        rows = [...rows, ...fresh.map(card => ({...card, id: crypto.randomUUID(), keep: true}))]; setDraft(rows);
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
    const counted = Number.isInteger(count) && count >= 1 && count <= CARD_AI_COUNT_MAX;
    if (tab === 'words') {
      const list = parseCardWords(words);
      if (!list.length) {setError(copy.noInput); return;}
      if (list.some(word => word.length > CARD_AI_WORD_LENGTH)) {setError(copy.wordTooLong); return;}
      const {fresh, duplicates} = dedupeByFront(list, [...fronts, ...draft.map(row => row.front)], word => word);
      setSkipped(duplicates);
      if (!fresh.length) return;
      if (fronts.length + draft.length + fresh.length > CARD_LIMIT) {setError(t('limit')); return;}
      void run(chunkList(fresh).map(chunk => ({mode: 'words', level, words: chunk})));
    } else if (tab === 'text') {
      if (!text.trim()) {setError(copy.noInput); return;}
      if (text.length > CARD_AI_TEXT_LIMIT) {setError(copy.textTooLong); return;}
      void run(splitCardText(text).map(chunk => ({mode: 'text', level, text: chunk})));
    } else if (tab === 'photo') {
      if (!photos.length) {setError(copy.noPhoto); return;}
      void run(photos.map(photo => ({mode: 'photo', level, image: photo.image})));
    } else if (tab === 'passage') {
      if (!/\p{L}/u.test(passage)) {setError(copy.noPassage); return;}
      if (passage.length > CARD_AI_TEXT_LIMIT) {setError(copy.passageTooLong); return;}
      if (!counted) {setError(copy.countRange); return;}
      void run([{mode: 'passage', level, text: passage, count}]);
    } else {
      if (!/\p{L}/u.test(topic) || topic.trim().length > CARD_AI_TOPIC_LENGTH) {setError(copy.noTopic); return;}
      if (!counted) {setError(copy.countRange); return;}
      void run([{mode: 'topic', level, topic: topic.trim(), count}]);
    }
  }
  async function pickPhotos(files: File[]) {
    setError('');
    if (photos.length + files.length > CARD_PHOTO_LIMIT) {setError(copy.photoLimit); return;}
    const problem = files.map(photoFileProblem).find(Boolean);
    if (problem) {setError(copy[problem === 'type' ? 'photoType' : 'photoSize']); return;}
    setShrinking(true);
    try {
      const added: Photo[] = [];
      for (const file of files) added.push({id: crypto.randomUUID(), name: file.name, image: await shrinkPhoto(file)});
      setPhotos(current => [...current, ...added]); setPending([]);
    } catch {setError(copy.photoDecode);} finally {setShrinking(false);}
  }
  function add() {
    const rows = draft.filter(row => row.keep).map(row => ({...row, front: row.front.trim(), back: row.back.trim(), example: row.example.trim()}));
    if (!rows.length) {setError(copy.noneKept); return;}
    if (rows.some(row => !row.front || !row.back)) {setError(copy.fillMissing); return;}
    const {fresh, duplicates} = dedupeByFront(rows, fronts, row => row.front);
    if (duplicates.length) {setDraft(current => current.filter(row => !row.keep || fresh.some(item => item.id === row.id))); setSkipped(duplicates); setError(''); return;}
    if (fronts.length + fresh.length > CARD_LIMIT) {setError(t('limit')); return;}
    onAppend(fresh.map(({front, back, example}) => ({front, back, example, alternatives: []})));
  }
  function appendTable(result: CardImportResult) {
    if (result.errors.length) {setError(groupImportErrors(result.errors).map(({reason, lines}) => `${t('importError')} ${lines.join(', ')}: ${t(reason === 'format' ? 'format' : reason === 'empty' ? 'emptyCell' : 'tooLong')}`).join('\n')); return;}
    if (fronts.length + result.cards.length > CARD_LIMIT) {setError(t('limit')); return;}
    onAppend(result.cards);
  }
  async function importFile(file: File) {
    setError('');
    if (/\.xlsx$/i.test(file.name)) {
      if (file.size > CARD_XLSX_BYTES) {setError(copy.fileError); return;}
      try {appendTable(await parseCardXlsx(new Uint8Array(await file.arrayBuffer())));} catch {setError(copy.xlsxError);}
      return;
    }
    if (file.size > 250_000 || !/\.(csv|tsv|txt)$/i.test(file.name)) {setError(/\.xls$/i.test(file.name) ? copy.xlsxError : copy.fileError); return;}
    try {setBulk(await file.text());} catch {setError(copy.fileError);}
  }
  async function chooseMerge(id: string) {
    setMergeId(id); setMerge(null); setError('');
    if (!id) return;
    setMergeBusy(true);
    try {
      const {set} = await cardsRequest<{set: CardSet}>(`/api/cards/sets/${encodeURIComponent(id)}`);
      const {fresh, duplicates} = dedupeByFront(set.cards, fronts, card => card.front);
      setMerge({fresh: fresh.map(({front, back, example, alternatives}) => ({front, back, example, alternatives})), duplicates});
    } catch {setError(copy.mergeFailed);} finally {setMergeBusy(false);}
  }
  function appendMerge() {
    if (!merge?.fresh.length) {setError(copy.mergeNothing); return;}
    if (fronts.length + merge.fresh.length > CARD_LIMIT) {setError(t('limit')); return;}
    onAppend(merge.fresh);
  }
  const editInput = (update: (value: string) => void) => (value: string) => {update(value); setPending([]);};
  const updateRow = (id: string, patch: Partial<DraftRow>) => setDraft(current => current.map(row => row.id === id ? {...row, ...patch} : row));
  const label = (key: 'front' | 'back' | 'example', index: number) => `${t(key)} ${index + 1}`;
  const kept = draft.filter(row => row.keep).length, ai = AI_TABS.includes(tab);
  const levelPicker = <label className="cards-import-level">{copy.level}<select value={level} disabled={running} onChange={e => {setLevel(e.target.value as CardAiLevel); setPending([]);}}>{CARD_AI_LEVELS.map(item => <option key={item} value={item}>{copy[item]}</option>)}</select></label>;
  const countPicker = <label className="cards-import-level">{copy.count}<input type="number" min={1} max={CARD_AI_COUNT_MAX} value={Number.isNaN(count) ? '' : count} disabled={running} onChange={e => {setCount(e.target.valueAsNumber); setPending([]);}}/></label>;
  return <CardsDialog title={copy.title} closeLabel={t('close')} onClose={close}>
    <div className="cards-import-tabs" role="tablist" aria-label={copy.title}>{TABS.map(item => <button key={item} type="button" role="tab" aria-selected={tab === item} disabled={running || shrinking} onClick={() => {setTab(item); setError('');}}>{copy[item]}</button>)}</div>
    {tab === 'table' && <section className="cards-import" role="tabpanel"><p>{copy.tableHint}</p><textarea aria-label={t('paste')} rows={5} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={t('pastePlaceholder')}/><div className="cards-actions"><label className="button cards-file-button"><FileUp size={16}/>{copy.importFile}<input type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => {const file = e.target.files?.[0]; e.target.value = ''; if (file) void importFile(file);}}/></label><button type="button" className="button primary" onClick={() => appendTable(parseCardImport(bulk))}>{t('append')}</button></div></section>}
    {tab === 'merge' && <section className="cards-import" role="tabpanel"><p>{copy.mergeHint}</p>
      {!sets ? <CardsLoading label={copy.mergeLoading}/> : !sets.length ? <p className="cards-muted">{copy.mergeEmpty}</p> : <label className="cards-import-merge">{copy.mergePick}<select value={mergeId} disabled={mergeBusy} onChange={e => void chooseMerge(e.target.value)}><option value="">{copy.mergeChoose}</option>{sets.map(item => <option key={item.id} value={item.id}>{item.title} · {item.cardCount}{t('cards')}{item.archived ? ` · ${copy.archived}` : ''}</option>)}</select></label>}
      {mergeBusy && <CardsLoading label={copy.mergeLoading}/>}
      {merge && <div className="cards-actions"><span className="cards-import-count">{copy.mergeReady} {merge.fresh.length}{t('cards')}</span><button type="button" className="button primary" disabled={!merge.fresh.length} onClick={appendMerge}>{copy.mergeAdd}</button></div>}
      {merge && !!merge.duplicates.length && <p className="cards-import-note">{copy.duplicates} {merge.duplicates.join(', ')}</p>}
    </section>}
    {ai && <section className="cards-import" role="tabpanel"><p>{copy[`${tab as 'words' | 'text' | 'photo' | 'passage' | 'topic'}Hint`]}</p>
      {tab === 'words' && <textarea key="words" aria-label={copy.words} rows={6} value={words} disabled={running} onChange={e => editInput(setWords)(e.target.value)} placeholder={copy.wordsPlaceholder}/>}
      {tab === 'text' && <textarea key="text" aria-label={copy.text} rows={8} value={text} disabled={running} onChange={e => editInput(setText)(e.target.value)} placeholder={copy.textPlaceholder}/>}
      {tab === 'passage' && <textarea key="passage" aria-label={copy.passage} rows={8} lang="en" value={passage} disabled={running} onChange={e => editInput(setPassage)(e.target.value)} placeholder={copy.passagePlaceholder}/>}
      {tab === 'topic' && <label className="cards-import-topic">{copy.topicLabel}<input maxLength={CARD_AI_TOPIC_LENGTH} value={topic} disabled={running} onChange={e => editInput(setTopic)(e.target.value)} placeholder={copy.topicPlaceholder}/></label>}
      {tab === 'photo' && <><p className="cards-import-note">{copy.photoPrivacy}</p>
        <div className="cards-actions"><label className={`button cards-file-button${running || shrinking || photos.length >= CARD_PHOTO_LIMIT ? ' disabled' : ''}`}><Camera size={16}/>{shrinking ? copy.photoReading : copy.photoPick}<input type="file" accept="image/*,.heic,.heif" multiple disabled={running || shrinking || photos.length >= CARD_PHOTO_LIMIT} onChange={e => {const files = [...e.target.files ?? []]; e.target.value = ''; if (files.length) void pickPhotos(files);}}/></label></div>
        {!!photos.length && <ul className="cards-import-photos">{photos.map((photo, index) => <li key={photo.id}>{/* eslint-disable-next-line @next/next/no-img-element -- a local data URL preview */}<img src={photo.image} alt={`${copy.photo} ${index + 1}`}/><span>{photo.name}</span><button type="button" className="icon-button" disabled={running} aria-label={`${copy.photoRemove} ${index + 1}`} onClick={() => {setPhotos(current => current.filter(item => item.id !== photo.id)); setPending([]);}}><X size={16}/></button></li>)}</ul>}</>}
      <div className="cards-actions">{levelPicker}{(tab === 'passage' || tab === 'topic') && countPicker}
        {(tab === 'text' || tab === 'passage') && <span className={`cards-import-count${(tab === 'text' ? text : passage).length > CARD_AI_TEXT_LIMIT ? ' over' : ''}`}>{(tab === 'text' ? text : passage).length.toLocaleString()} / {CARD_AI_TEXT_LIMIT.toLocaleString()}</span>}
        {running ? <button type="button" className="button" onClick={() => control.current?.abort()}>{copy.stop}</button> : <button type="button" className="button primary" disabled={shrinking} onClick={generate}><Sparkles size={16}/>{copy.generate}</button>}</div>
    </section>}
    {progress && <div className="cards-import-progress" role="status"><p>{copy.progress} {progress.done + 1}/{progress.total}</p><progress max={progress.total} value={progress.done}/></div>}
    <div ref={messages}>{error && <div role="alert" className="cards-error"><span style={{whiteSpace: 'pre-line'}}>{error}</span>{!!pending.length && <button type="button" className="button" onClick={() => void run(pending)}>{copy.retry}</button>}</div>}
    {!error && !running && !!pending.length && <div className="cards-actions secondary"><button type="button" className="button" onClick={() => void run(pending)}>{copy.resume}</button></div>}
    {!!skipped.length && <p className="cards-import-note">{copy.duplicates} {skipped.join(', ')}</p>}</div>
    {!!draft.length && <section className="cards-draft" aria-label={copy.draftCards}>
      <p className="cards-draft-notice">{copy.notice}</p>
      <fieldset disabled={running} className="cards-fieldset"><div className="cards-actions secondary"><button type="button" className="button" onClick={() => setDraft(current => current.map(row => ({...row, keep: true})))}>{copy.keepAll}</button><button type="button" className="button" onClick={() => setDraft(current => current.map(row => ({...row, keep: false})))}>{copy.keepNone}</button></div>
        <div className="cards-draft-head" aria-hidden="true"><span/><span>{t('front')}</span><span>{t('back')}</span><span>{t('example')}</span></div>
        {draft.map((row, index) => <div key={row.id} className={`cards-draft-row${row.keep ? '' : ' off'}`}><input type="checkbox" aria-label={`${copy.keep} ${index + 1}`} checked={row.keep} onChange={e => updateRow(row.id, {keep: e.target.checked})}/><input aria-label={label('front', index)} aria-invalid={row.keep && !row.front.trim()} maxLength={CARD_TEXT_LIMIT} value={row.front} onChange={e => updateRow(row.id, {front: e.target.value})}/><input aria-label={label('back', index)} aria-invalid={row.keep && !row.back.trim()} maxLength={CARD_TEXT_LIMIT} value={row.back} onChange={e => updateRow(row.id, {back: e.target.value})}/><input aria-label={label('example', index)} maxLength={CARD_EXAMPLE_LIMIT} value={row.example} onChange={e => updateRow(row.id, {example: e.target.value})}/><button type="button" className="icon-button" aria-label={`${copy.remove} ${index + 1}`} onClick={() => setDraft(current => current.filter(item => item.id !== row.id))}><Trash2 size={17}/></button></div>)}
      </fieldset>
      <div className="cards-dialog-footer"><p className="cards-muted">{copy.addHint}</p><div className="cards-actions"><strong>{copy.keptCount} {kept}/{draft.length}{t('cards')}</strong><button type="button" className="button primary" disabled={running || !kept} onClick={add}>{copy.add}</button></div></div>
    </section>}
  </CardsDialog>;
}
