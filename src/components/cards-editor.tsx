'use client';
import {useEffect, useState, type FormEvent} from 'react';
import {ArrowDown, ArrowUp, Copy, FileUp, Plus, Trash2} from 'lucide-react';
import type {CardEntry, CardFolder, CardSet, CardSetType} from '@/lib/cards-types';
import {parseCardImport} from '@/lib/cards-import';
import {useCardsCopy} from '@/lib/cards-copy';
import {cardsRequest, CardsDialog, CardsRequestError} from './cards-shared';

type EditableCard = CardEntry & {alternativesText: string};
const newCard = (): EditableCard => ({id: crypto.randomUUID(), front: '', back: '', example: '', alternatives: [], alternativesText: ''});
export default function CardsEditor({set, folders, folderId, onClose, onSaved}: {set?: CardSet; folders: CardFolder[]; folderId?: string | null; onClose: () => void; onSaved: (set: CardSet) => void}) {
  const {t, locale} = useCardsCopy();
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(set?.title || ''), [description, setDescription] = useState(set?.description || ''), [type, setType] = useState<CardSetType>(set?.type || 'word');
  const [folder, setFolder] = useState(set?.folderId || folderId || ''), [rows, setRows] = useState<EditableCard[]>(() => set?.cards.map(card => ({...card, alternativesText: card.alternatives.join(' | ')})) || [newCard(), newCard(), newCard()]);
  const [bulk, setBulk] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [importOpen, setImportOpen] = useState(false);
  useEffect(() => {const leave = (event: BeforeUnloadEvent) => {if (dirty) {event.preventDefault(); event.returnValue = '';}}; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);}, [dirty]);
  function close() {if (!busy && (!dirty || window.confirm(t('discard')))) onClose();}
  function updateRow(id: string, patch: Partial<EditableCard>) {setRows(current => current.map(row => row.id === id ? {...row, ...patch} : row)); setDirty(true);}
  function move(index: number, delta: number) {setRows(current => {const result = [...current]; [result[index], result[index + delta]] = [result[index + delta], result[index]]; return result;}); setDirty(true);}
  function importRows() {
    const result = parseCardImport(bulk);
    if (result.errors.length) {const issue = result.errors[0]; setError(`${t('importError')} ${issue.line}: ${t(issue.reason === 'format' ? 'format' : issue.reason === 'empty' ? 'emptyCell' : 'tooLong')}`); return;}
    const current = rows.filter(row => row.front.trim() || row.back.trim() || row.example.trim() || row.alternativesText.trim());
    if (current.length + result.cards.length > 200) {setError(t('limit')); return;}
    setRows([...current, ...result.cards.map(card => ({...card, id: crypto.randomUUID(), alternativesText: card.alternatives.join(' | ')}))]); setBulk(''); setImportOpen(false); setError(''); setDirty(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError('');
    const cards = rows.filter(row => row.front.trim() || row.back.trim() || row.example.trim() || row.alternativesText.trim()).map(({alternativesText, ...card}) => ({...card, front: card.front.trim(), back: card.back.trim(), alternatives: alternativesText.split('|').map(s => s.trim()).filter(Boolean)}));
    if (!title.trim() || cards.some(card => !card.front || !card.back)) {setError(t('required')); return;}
    if (!cards.length || cards.length > 200) {setError(t('limit')); return;}
    setBusy(true);
    try {const result = await cardsRequest<{set: CardSet}>(`/api/cards/sets${set ? `/${set.id}` : ''}`, {method: set ? 'PATCH' : 'POST', body: JSON.stringify({requestId, title, description, type, folderId: folder || null, cards, ...(set ? {expectedVersion: set.version} : {})})}); setDirty(false); onSaved(result.set);}
    catch (cause) {setError(locale === 'ko' && cause instanceof Error ? cause.message : cause instanceof CardsRequestError && cause.status === 409 ? 'This set was edited elsewhere. Close this editor and reload before saving.' : t('error'));} finally {setBusy(false);}
  }
  return <CardsDialog title={t(set ? 'edit' : 'create')} closeLabel={t('close')} onClose={close}><form onSubmit={save} className="cards-editor">
    <fieldset disabled={busy} className="cards-fieldset">
      <div className="cards-form-grid"><label>{t('setTitle')}<input autoFocus required maxLength={120} value={title} onChange={e => {setTitle(e.target.value); setDirty(true);}}/></label><label>{t('type')}<select value={type} onChange={e => {setType(e.target.value as CardSetType); setDirty(true);}}><option value="word">{t('word')}</option><option value="sentence">{t('sentence')}</option></select></label></div>
      <div className="cards-form-grid"><label>{t('description')}<input maxLength={2000} value={description} onChange={e => {setDescription(e.target.value); setDirty(true);}}/></label><label>{t('folders')}<select value={folder} onChange={e => {setFolder(e.target.value); setDirty(true);}}><option value="">{t('noFolder')}</option>{folders.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <div className="cards-toolbar"><strong>{rows.length} {t('cards')}</strong><button type="button" className="button" onClick={() => setImportOpen(value => !value)}><FileUp size={17}/>{t('paste')}</button></div>
      {importOpen && <section className="cards-import"><p>{t('pasteHint')}</p><textarea aria-label={t('paste')} rows={5} value={bulk} onChange={e => {setBulk(e.target.value); setDirty(true);}} placeholder={t('pastePlaceholder')}/><div className="cards-actions"><label className="button cards-file-button"><FileUp size={16}/>{t('importFile')}<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={async e => {const file = e.target.files?.[0]; if (!file) return; if (file.size > 250_000 || !/\.(csv|tsv|txt)$/i.test(file.name)) {setError(t('fileError')); return;} try {setBulk(await file.text()); setDirty(true); setError('');} catch {setError(t('fileError'));} e.target.value = '';}}/></label><button type="button" className="button primary" onClick={importRows}>{t('append')}</button></div></section>}
      <div className="cards-editor-rows">{rows.map((row, index) => <section key={row.id} className="cards-editor-row" aria-label={`${t('row')} ${index + 1}`}><div className="cards-row-number">{index + 1}</div><div className="cards-row-fields"><div className="cards-form-grid"><label>{t('front')}<textarea rows={2} maxLength={500} value={row.front} onChange={e => updateRow(row.id, {front: e.target.value})}/></label><label>{t('back')}<textarea rows={2} maxLength={500} value={row.back} onChange={e => updateRow(row.id, {back: e.target.value})}/></label></div><details open={!!(row.example || row.alternativesText) || undefined}><summary>{t('showMore')}</summary><div className="cards-form-grid"><label>{t('example')}<input maxLength={1000} value={row.example} onChange={e => updateRow(row.id, {example: e.target.value})}/></label><label>{t('alternatives')}<input value={row.alternativesText} onChange={e => updateRow(row.id, {alternativesText: e.target.value})}/></label></div></details></div><div className="cards-row-actions"><button type="button" className="icon-button" aria-label={`${t('up')} ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={17}/></button><button type="button" className="icon-button" aria-label={`${t('down')} ${index + 1}`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown size={17}/></button><button type="button" className="icon-button" aria-label={`${t('copyRow')} ${index + 1}`} disabled={rows.length >= 200} onClick={() => {setRows(current => [...current.slice(0, index + 1), {...row, id: crypto.randomUUID()}, ...current.slice(index + 1)]); setDirty(true);}}><Copy size={17}/></button><button type="button" className="icon-button" aria-label={`${t('removeRow')} ${index + 1}`} disabled={rows.length === 1} onClick={() => {setRows(current => current.filter(item => item.id !== row.id)); setDirty(true);}}><Trash2 size={17}/></button></div></section>)}</div>
      <button type="button" className="button" disabled={rows.length >= 200} onClick={() => {setRows(current => [...current, newCard()]); setDirty(true);}}><Plus size={17}/>{t('addRow')}</button>
    </fieldset>
    <div className="cards-dialog-footer"><p className="cards-muted">{t('saveHint')}</p>{error && <p role="alert" className="cards-error">{error}</p>}<div className="cards-actions"><button type="button" className="button" disabled={busy} onClick={close}>{t('cancel')}</button><button type="submit" className="button primary" disabled={busy}>{t(busy ? 'saving' : 'save')}</button></div></div>
  </form></CardsDialog>;
}
