'use client';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowDown, ArrowUp, Check, Copy, Plus, Scissors, Sparkles, Trash2} from 'lucide-react';
import {chunkPieces, fitChunks} from '@/lib/cards-chunks';
import {useCardsP2Copy} from '@/lib/cards-p2-copy';
import {fillCopy} from '@/lib/cards-class-copy';
import {CardChunkEditor} from './cards-chunks';
import {DrillRowEditor, newDrill} from './cards-drill';
import type {CardEntry, CardFolder, CardSet, CardSetType} from '@/lib/cards-types';
import {findDuplicateFronts, removeDuplicateFronts, type ImportedCard} from '@/lib/cards-import';
import {CARD_EXAMPLE_LIMIT, CARD_TEXT_LIMIT} from '@/lib/cards-logic';
import {useCardsCopy} from '@/lib/cards-copy';
import importKo from '@/messages/cards-import-ko.json';
import importEn from '@/messages/cards-import-en.json';
import CardsImportDialog from './cards-import-dialog';
import {cardsRequest, CardsDialog, CardsRequestError} from './cards-shared';
import {CARD_AI_MEANING_MAX, cardAiFailureKey, type CardAiDraft} from '@/lib/cards-ai-draft';

type EditableCard = CardEntry & {alternativesText: string};
const newCard = (): EditableCard => ({id: crypto.randomUUID(), front: '', back: '', example: '', alternatives: [], alternativesText: ''});
/** 임시저장 keeps an unfinished set on the server: `saved` is the set this editor now writes to, so a later save updates it instead of making a second one. */
export default function CardsEditor({set, folders, folderId, onClose, onSaved, onDraftSaved}: {set?: CardSet; folders: CardFolder[]; folderId?: string | null; onClose: () => void; onSaved: (set: CardSet) => void; onDraftSaved?: (set: CardSet) => void}) {
  const {t, locale} = useCardsCopy(), p2 = useCardsP2Copy();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()), [chunkOpen, setChunkOpen] = useState<string | null>(null), [saved, setSaved] = useState(set), [notice, setNotice] = useState('');
  const [title, setTitle] = useState(set?.title || ''), [description, setDescription] = useState(set?.description || ''), [type, setType] = useState<CardSetType>(set?.type || 'word');
  const [folder, setFolder] = useState(set?.folderId || folderId || ''), [rows, setRows] = useState<EditableCard[]>(() => set?.cards.map(card => ({...card, alternativesText: card.alternatives.join(' | ')})) || [newCard(), newCard(), newCard()]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [importOpen, setImportOpen] = useState(false);
  useEffect(() => {const leave = (event: BeforeUnloadEvent) => {if (dirty) {event.preventDefault(); event.returnValue = '';}}; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);}, [dirty]);
  function close() {if (!busy && (!dirty || window.confirm(t('discard')))) onClose();}
  function updateRow(id: string, patch: Partial<EditableCard>) {setRows(current => current.map(row => row.id === id ? {...row, ...patch} : row)); setDirty(true);}
  // 뜻 자동 채우기: leaving an English front with an empty meaning queues it; one AI request fills the queued rows, and a
  // meaning lands only where the front is unchanged and the teacher has not written a meaning meanwhile.
  const [filling, setFilling] = useState<ReadonlySet<string>>(() => new Set()), [fillError, setFillError] = useState(''), fillQueue = useRef(new Map<string, string>()), fillTimer = useRef(0), fillBusy = useRef(false);
  const meaningCopy = locale === 'ko' ? importKo : importEn;
  function queueMeaning(row: EditableCard) {
    const front = row.front.trim();
    if (type === 'drill' || row.back.trim() || !/[A-Za-z]/.test(front) || /[ㄱ-힝]/.test(front)) return;
    fillQueue.current.set(row.id, front); window.clearTimeout(fillTimer.current); fillTimer.current = window.setTimeout(() => void fillMeanings(), 400);
  }
  async function fillMeanings() {
    if (fillBusy.current) return;
    const batch = [...fillQueue.current].slice(0, CARD_AI_MEANING_MAX);
    if (!batch.length) return;
    batch.forEach(([id]) => fillQueue.current.delete(id)); fillBusy.current = true; setFillError('');
    setFilling(current => new Set([...current, ...batch.map(([id]) => id)]));
    try {
      const {cards} = await cardsRequest<{cards: CardAiDraft[]}>('/api/cards/ai-draft', {method: 'POST', body: JSON.stringify({mode: 'meanings', level: 'middle', words: batch.map(([, front]) => front)})});
      const meanings = new Map(batch.map(([id, front], at) => [id, {front, back: cards[at]?.back.trim() ?? ''}]));
      setRows(current => current.map(row => {const found = meanings.get(row.id); return found?.back && !row.back.trim() && row.front.trim() === found.front ? {...row, back: found.back} : row;}));
    } catch (cause) {setFillError(meaningCopy[cause instanceof CardsRequestError ? cardAiFailureKey(cause.status, cause.code) : 'aiFailed']);}
    finally {
      fillBusy.current = false;
      setFilling(current => new Set([...current].filter(id => !batch.some(([done]) => done === id))));
      if (fillQueue.current.size) void fillMeanings();
    }
  }
  useEffect(() => () => window.clearTimeout(fillTimer.current), []);
  function move(index: number, delta: number) {setRows(current => {const result = [...current]; [result[index], result[index + delta]] = [result[index + delta], result[index]]; return result;}); setDirty(true);}
  const filledRows = rows.filter(row => row.front.trim() || row.back.trim() || row.example.trim() || row.alternativesText.trim());
  function appendRows(cards: ImportedCard[]) {setRows([...filledRows, ...cards.map(card => ({...card, id: crypto.randomUUID(), alternativesText: card.alternatives.join(' | ')}))]); setImportOpen(false); setError(''); setDirty(true);}
  const duplicates = findDuplicateFronts(rows);
  function save(event: FormEvent) {event.preventDefault(); void send(false);}
  async function send(draft: boolean) {
    if (busy) return; setError(''); setNotice('');
    const cards = rows.filter(row => row.front.trim() || row.back.trim() || row.example.trim() || row.alternativesText.trim()).map(({alternativesText, ...card}) => ({...card, front: card.front.trim(), back: card.back.trim(), alternatives: alternativesText.split('|').map(s => s.trim()).filter(Boolean)}));
    if (!draft && (!title.trim() || cards.some(card => !card.front || (type !== 'drill' && !card.back)))) {setError(type === 'drill' && title.trim() ? p2.drillMissingKind : t('required')); return;}
    if ((!draft && !cards.length) || cards.length > 200) {setError(t('limit')); return;}
    setBusy(true);
    try {
      const result = await cardsRequest<{set: CardSet}>(`/api/cards/sets${saved ? `/${saved.id}` : ''}`, {method: saved ? 'PATCH' : 'POST', body: JSON.stringify({requestId, title, description, type, folderId: folder || null, cards, ...(draft ? {draft: true} : {}), ...(saved ? {expectedVersion: saved.version} : {})})});
      setDirty(false);
      if (!draft) {onSaved(result.set); return;}
      // The next save is a new request against the draft just written.
      setSaved(result.set); setRequestId(crypto.randomUUID()); setTitle(result.set.title); setNotice(t('draftSaved')); onDraftSaved?.(result.set);
    }
    catch (cause) {setError(locale === 'ko' && cause instanceof Error ? cause.message : cause instanceof CardsRequestError && cause.status === 409 ? 'This set was edited elsewhere. Close this editor and reload before saving.' : t('error'));} finally {setBusy(false);}
  }
  const draftable = !saved || !!saved.draft;
  return <CardsDialog title={t(set && !set.draft ? 'edit' : 'create')} closeLabel={t('close')} onClose={close}><form onSubmit={save} className="cards-editor">
    <fieldset disabled={busy} className="cards-fieldset">
      <div className="cards-form-grid"><label>{t('setTitle')}<input autoFocus required maxLength={120} value={title} onChange={e => {setTitle(e.target.value); setDirty(true);}}/></label><label>{t('type')}<select value={type} onChange={e => {const next = e.target.value as CardSetType; setType(next); if (next === 'drill') setRows(current => current.map(row => row.drill ? row : {...row, drill: newDrill()})); setDirty(true);}}><option value="word">{t('word')}</option><option value="sentence">{t('sentence')}</option><option value="drill">{t('drill')}</option></select></label></div>
      <div className="cards-form-grid"><label>{t('description')}<input maxLength={2000} value={description} onChange={e => {setDescription(e.target.value); setDirty(true);}}/></label><label>{t('folders')}<select value={folder} onChange={e => {setFolder(e.target.value); setDirty(true);}}><option value="">{t('noFolder')}</option>{folders.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <div className="cards-toolbar"><strong>{rows.length} {t('cards')}</strong>{type !== 'drill' && <button type="button" className="button" onClick={() => setImportOpen(true)}><Sparkles size={17}/>{(locale === 'ko' ? importKo : importEn).open}</button>}</div>
      {type === 'drill' ? <p className="cards-muted">{p2.drillSetHint}</p> : <p className="cards-muted">{locale === 'ko' ? '앞면에 영어를 쓰고 다음 칸으로 넘어가면 비어 있는 뜻이 자동으로 채워져요. 채워진 뜻은 고쳐 쓸 수 있어요.' : 'Write English on the front and move on: an empty meaning is filled in for you. You can edit it.'}</p>}
      {fillError && <p className="cards-error" role="alert">{fillError}</p>}
      {!!duplicates.length && <div className="cards-import-note cards-toolbar" role="status"><span>{t('duplicateFronts')} {duplicates.map(group => `${group.numbers.join(', ')}${t('duplicateUnit')}: ${group.front}`).join(' / ')}</span><button type="button" className="button" onClick={() => {setRows(removeDuplicateFronts); setDirty(true);}}>{t('removeDuplicates')}</button></div>}
      <div className="cards-editor-rows">{rows.map((row, index) => <section key={row.id} className="cards-editor-row" aria-label={`${t('row')} ${index + 1}`}><div className="cards-row-number">{index + 1}</div><div className="cards-row-fields">{type === 'drill' ? <DrillRowEditor row={row} label={`drill-${row.id}`} onChange={patch => updateRow(row.id, patch)}/> : <><div className="cards-form-grid"><label>{t('front')}<textarea rows={2} maxLength={CARD_TEXT_LIMIT} value={row.front} onChange={e => updateRow(row.id, {front: e.target.value, ...(row.chunks?.length ? {chunks: fitChunks(row.chunks, e.target.value)} : {})})} onBlur={() => queueMeaning(row)}/></label><label>{t('back')}<textarea rows={2} maxLength={CARD_TEXT_LIMIT} value={row.back} placeholder={filling.has(row.id) ? (locale === 'ko' ? '뜻 채우는 중…' : 'Filling in the meaning…') : undefined} onChange={e => updateRow(row.id, {back: e.target.value})}/></label></div>{type === 'sentence' && <div className="cards-chunk-toggle"><button type="button" className="button" aria-expanded={chunkOpen === row.id} onClick={() => setChunkOpen(chunkOpen === row.id ? null : row.id)}><Scissors size={15}/>{fillCopy(p2.chunkEditTitle, {n: chunkPieces(row.front, row.chunks).length})}</button>{chunkOpen === row.id && <CardChunkEditor text={row.front} chunks={row.chunks ?? []} onChange={next => updateRow(row.id, {chunks: next})}/>}</div>}<details open={!!(row.example || row.alternativesText) || undefined}><summary>{t('showMore')}</summary><div className="cards-form-grid"><label>{t('example')}<input maxLength={CARD_EXAMPLE_LIMIT} value={row.example} onChange={e => updateRow(row.id, {example: e.target.value})}/></label><label>{t('alternatives')}<input value={row.alternativesText} onChange={e => updateRow(row.id, {alternativesText: e.target.value})}/></label></div></details></>}</div><div className="cards-row-actions"><button type="button" className="icon-button" aria-label={`${t('up')} ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={17}/></button><button type="button" className="icon-button" aria-label={`${t('down')} ${index + 1}`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown size={17}/></button><button type="button" className="icon-button" aria-label={`${t('copyRow')} ${index + 1}`} disabled={rows.length >= 200} onClick={() => {setRows(current => [...current.slice(0, index + 1), {...row, id: crypto.randomUUID()}, ...current.slice(index + 1)]); setDirty(true);}}><Copy size={17}/></button><button type="button" className="icon-button" aria-label={`${t('removeRow')} ${index + 1}`} disabled={rows.length === 1} onClick={() => {setRows(current => current.filter(item => item.id !== row.id)); setDirty(true);}}><Trash2 size={17}/></button></div></section>)}</div>
      <button type="button" className="button" disabled={rows.length >= 200} onClick={() => {setRows(current => [...current, type === 'drill' ? {...newCard(), drill: newDrill()} : newCard()]); setDirty(true);}}><Plus size={17}/>{t('addRow')}</button>
    </fieldset>
    <div className="cards-dialog-footer"><p className="cards-muted">{t('saveHint')}{draftable && <> {t('draftSaveHint')}</>}</p>{error && <p role="alert" className="cards-error">{error}</p>}{notice && <p role="status" className="cards-notice"><Check size={17}/>{notice}</p>}<div className="cards-actions"><button type="button" className="button" disabled={busy} onClick={close}>{t(notice && !dirty ? 'close' : 'cancel')}</button>{draftable && <button type="button" className="button" disabled={busy} onClick={() => void send(true)}>{t('draftSave')}</button>}<button type="submit" className="button primary" disabled={busy}>{t(busy ? 'saving' : 'save')}</button></div></div>
  </form>{importOpen && <CardsImportDialog fronts={filledRows.map(row => row.front)} setId={saved?.id} onAppend={appendRows} onClose={() => setImportOpen(false)}/>}</CardsDialog>;
}
