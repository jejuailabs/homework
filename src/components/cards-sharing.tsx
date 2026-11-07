'use client';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Copy, Eye, Folder, Layers, Search, Users} from 'lucide-react';
import type {CardEntry, CardFolder, CardSetSummary, CardSetType} from '@/lib/cards-types';
import {useCardsCopy} from '@/lib/cards-copy';
import {fillCopy} from '@/lib/cards-class-copy';
import {useCardsP2Copy} from '@/lib/cards-p2-copy';
import {cardsRequest, CardsDialog, CardsLoading} from './cards-shared';
import '@/styles/cards-p2.css';

type SharedFolder = {id: string; name: string; ownerName: string; sets: number};
type SharedRow = {id: string; title: string; description: string; type: CardSetType; cardCount: number; ownerName: string; folderName: string; allowCopy: boolean};
const failure = (locale: string, cause: unknown, fallback: string) => locale === 'ko' && cause instanceof Error ? cause.message : fallback;

/** 공유받은 세트: folders colleagues shared with me, a search within them, a preview and 내 세트로 복사. */
export function CardsSharedLibrary({folders: myFolders, query}: {folders: CardFolder[]; query: string}) {
  const {t, locale} = useCardsCopy(), p = useCardsP2Copy();
  const [home, setHome] = useState<{folders: SharedFolder[]} | null>(null), [open, setOpen] = useState<SharedFolder | null>(null), [rows, setRows] = useState<SharedRow[] | null>(null), [preview, setPreview] = useState<string | null>(null), [error, setError] = useState('');
  useEffect(() => {let alive = true; cardsRequest<{folders: SharedFolder[]}>('/api/cards/shared').then(data => {if (alive) setHome(data);}).catch(cause => {if (alive) setError(failure(locale, cause, t('error')));}); return () => {alive = false;};}, []);
  useEffect(() => {
    const q = query.trim();
    if (!q && !open) {setRows(null); return;}
    let alive = true; setRows(null);
    const timer = setTimeout(() => {
      const path = q ? `/api/cards/shared?q=${encodeURIComponent(q)}` : `/api/cards/shared/folders/${encodeURIComponent(open!.id)}`;
      cardsRequest<{sets: SharedRow[]}>(path).then(data => {if (alive) setRows(data.sets);}).catch(cause => {if (alive) setError(failure(locale, cause, t('error')));});
    }, q ? 300 : 0);
    return () => {alive = false; clearTimeout(timer);};
  }, [query, open]);
  if (!home) return error ? <p className="cards-error" role="alert">{error}</p> : <CardsLoading label={t('loading')}/>;
  const searching = !!query.trim();
  return <div className="cards-shared">
    <p className="cards-muted">{p.sharedHint}</p>
    {error && <p className="cards-error" role="alert">{error}</p>}
    {!searching && !open && (home.folders.length ? <ul className="cards-shared-folders">{home.folders.map(folder => <li key={folder.id}><button type="button" onClick={() => setOpen(folder)}><Folder size={20}/><span><strong>{folder.name}</strong><small>{fillCopy(p.sharedBy, {name: folder.ownerName})} · {fillCopy(p.sharedSetCount, {n: folder.sets})}</small></span></button></li>)}</ul> : <div className="cards-empty"><Users size={34}/><h3>{p.sharedEmpty}</h3><p>{p.sharedEmptyHint}</p></div>)}
    {(searching || open) && <>
      {open && !searching && <div className="cards-shared-crumb"><button type="button" className="button" onClick={() => setOpen(null)}>{p.sharedBack}</button><strong>{open.name}</strong><small>{fillCopy(p.sharedBy, {name: open.ownerName})}</small></div>}
      {!rows ? <CardsLoading label={t('loading')}/> : rows.length ? <div className="cards-set-list">{rows.map(row => <button type="button" key={row.id} className="cards-set-row cards-shared-row" onClick={() => setPreview(row.id)}><span className={`cards-set-icon ${row.type}`}><Layers size={25}/></span><span className="cards-set-copy"><small>{t(row.type)} · {row.cardCount} {t('cards')} · {row.ownerName} · {row.folderName}</small><strong>{row.title}</strong>{row.description && <span>{row.description}</span>}</span><span className={`cards-badge ${row.allowCopy ? 'accent' : ''}`}>{row.allowCopy ? p.copyAllowed : p.viewOnly}</span><Eye size={18}/></button>)}</div> : <div className="cards-empty"><Search size={30}/><h3>{searching ? p.sharedNoResults : p.sharedFolderEmpty}</h3></div>}
    </>}
    {preview && <CardsSharedPreview setId={preview} folders={myFolders} onClose={() => setPreview(null)}/>}
  </div>;
}

function CardsSharedPreview({setId, folders, onClose}: {setId: string; folders: CardFolder[]; onClose: () => void}) {
  const {t, locale} = useCardsCopy(), p = useCardsP2Copy(), router = useRouter();
  const [set, setSet] = useState<(SharedRow & {cards: CardEntry[]}) | null>(null), [folderId, setFolderId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {let alive = true; cardsRequest<{set: SharedRow & {cards: CardEntry[]}}>(`/api/cards/shared/sets/${encodeURIComponent(setId)}`).then(data => {if (alive) setSet(data.set);}).catch(cause => {if (alive) setError(failure(locale, cause, t('error')));}); return () => {alive = false;};}, [setId]);
  async function copy() {
    if (busy) return; setBusy(true); setError('');
    try {const result = await cardsRequest<{set: CardSetSummary}>(`/api/cards/shared/sets/${encodeURIComponent(setId)}/copy`, {method: 'POST', body: JSON.stringify({requestId: requestId.current, folderId: folderId || null})}); router.push(`/teacher/cards/${result.set.id}`);}
    catch (cause) {setError(failure(locale, cause, t('error'))); setBusy(false);}
  }
  return <CardsDialog title={set?.title ?? p.sharedPreview} closeLabel={t('close')} onClose={() => {if (!busy) onClose();}}>
    {!set ? error ? <p className="cards-error" role="alert">{error}</p> : <CardsLoading label={t('loading')}/> : <div className="cards-shared-preview">
      <div className="cards-meta"><span className="cards-badge">{t(set.type)}</span><span>{set.cardCount} {t('cards')}</span><span>{fillCopy(p.sharedBy, {name: set.ownerName})}</span></div>
      {set.description && <p className="cards-muted">{set.description}</p>}
      <ol className="cards-content-list cards-shared-cards">{set.cards.map((card, index) => <li key={card.id}><span/><span className="cards-card-number">{index + 1}</span><div><strong>{card.front}</strong>{card.example && <small>{card.example}</small>}</div><div>{card.back}</div></li>)}</ol>
      {error && <p className="cards-error" role="alert">{error}</p>}
      <div className="cards-actions cards-dialog-footer">{set.allowCopy ? <><label className="cards-shared-folder-pick">{t('folders')}<select value={folderId} onChange={e => setFolderId(e.target.value)}><option value="">{t('noFolder')}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button type="button" className="button primary" disabled={busy} onClick={() => void copy()}><Copy size={16}/>{busy ? t('saving') : p.copyToMine}</button></> : <p className="cards-muted">{p.copyNotAllowed}</p>}</div>
    </div>}
  </CardsDialog>;
}

/** 폴더 공유: the folder owner's list of colleague emails. Only sets marked 공유 in this folder become visible to them. */
export function CardsFolderShare({folder, onClose, onSaved}: {folder: CardFolder; onClose: () => void; onSaved: (notice: string) => void}) {
  const {t, locale} = useCardsCopy(), p = useCardsP2Copy();
  const [members, setMembers] = useState<string | null>(null), [count, setCount] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {let alive = true; cardsRequest<{members: string[]; sharedSets: number}>(`/api/cards/folders/${encodeURIComponent(folder.id)}/share`).then(data => {if (alive) {setMembers(data.members.join('\n')); setCount(data.sharedSets);}}).catch(cause => {if (alive) setError(failure(locale, cause, t('error')));}); return () => {alive = false;};}, [folder.id]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || members === null) return; setBusy(true); setError('');
    try {const data = await cardsRequest<{members: string[]; sharedSets: number}>(`/api/cards/folders/${encodeURIComponent(folder.id)}/share`, {method: 'PATCH', body: JSON.stringify({members})}); setMembers(data.members.join('\n')); setCount(data.sharedSets); onSaved(data.members.length ? fillCopy(p.folderShared, {n: data.members.length}) : p.folderUnshared);}
    catch (cause) {setError(failure(locale, cause, t('error')));} finally {setBusy(false);}
  }
  return <CardsDialog title={`${p.folderShare} · ${folder.name}`} closeLabel={t('close')} onClose={() => {if (!busy) onClose();}}>
    {members === null ? error ? <p className="cards-error" role="alert">{error}</p> : <CardsLoading label={t('loading')}/> : <form onSubmit={save} className="cards-folder-share">
      <p className="cards-muted">{p.folderShareHint}</p>
      <label>{p.folderShareMembers}<textarea rows={6} value={members} disabled={busy} placeholder="teacher@school.kr" onChange={e => setMembers(e.target.value)}/></label>
      <p className="cards-muted">{fillCopy(p.folderSharedSets, {n: count})}</p>
      {error && <p className="cards-error" role="alert">{error}</p>}
      <div className="cards-actions cards-dialog-footer"><button className="button primary" disabled={busy}>{busy ? t('saving') : t('save')}</button></div>
    </form>}
  </CardsDialog>;
}

/** 공유 설정 for one set: 비공개(기본) or 공유 폴더의 동료에게 공개, and whether they may copy it. */
export function CardsSetShare({set, folder, onClose, onSave}: {set: CardSetSummary; folder?: CardFolder; onClose: () => void; onSave: (sharing: {visibility: 'private' | 'shared'; allowCopy: boolean}) => Promise<void>}) {
  const {t, locale} = useCardsCopy(), p = useCardsP2Copy();
  const [visibility, setVisibility] = useState(set.sharing?.visibility ?? 'private'), [allowCopy, setAllowCopy] = useState(set.sharing?.allowCopy ?? false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save(event: FormEvent) {event.preventDefault(); if (busy) return; setBusy(true); setError(''); try {await onSave({visibility, allowCopy: visibility === 'shared' && allowCopy});} catch (cause) {setError(failure(locale, cause, t('error'))); setBusy(false);}}
  return <CardsDialog title={p.setShare} closeLabel={t('close')} onClose={() => {if (!busy) onClose();}}>
    <form onSubmit={save} className="cards-set-share">
      <fieldset className="cards-fieldset" disabled={busy}>
        <label className="cards-check"><input type="radio" name="visibility" checked={visibility === 'private'} onChange={() => setVisibility('private')}/>{p.visibilityPrivate}</label>
        <label className="cards-check"><input type="radio" name="visibility" checked={visibility === 'shared'} onChange={() => setVisibility('shared')}/>{p.visibilityShared}</label>
        <label className="cards-check cards-set-share-copy"><input type="checkbox" disabled={visibility !== 'shared'} checked={visibility === 'shared' && allowCopy} onChange={e => setAllowCopy(e.target.checked)}/>{p.allowCopy}</label>
      </fieldset>
      <p className="cards-muted">{!folder ? p.shareNeedsFolder : fillCopy(p.shareInFolder, {name: folder.name})}</p>
      {error && <p className="cards-error" role="alert">{error}</p>}
      <div className="cards-actions cards-dialog-footer"><button className="button primary" disabled={busy}>{busy ? t('saving') : t('save')}</button></div>
    </form>
  </CardsDialog>;
}
