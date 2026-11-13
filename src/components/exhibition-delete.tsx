'use client';
import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {ArrowRight, LoaderCircle, Trash2} from 'lucide-react';
import {DELETE_PHRASE} from '@/lib/delete-phrase';

/** Danger zone: the delete button only unlocks after the teacher types the exact phrase "삭제를원함". */
export function DeleteZone({heading, summary, warning, endpoint, payload, failed, onDeleted, startOpen = false, onCancel}: {heading: string; summary: string; warning: string; endpoint: string; payload?: Record<string, unknown>; failed: string; onDeleted: () => Promise<void> | void; startOpen?: boolean; onCancel?: () => void}) {
  const t = useTranslations('exhibition');
  const [open, setOpen] = useState(startOpen), [typed, setTyped] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const ready = typed.trim() === DELETE_PHRASE;
  async function remove() {
    if (!ready || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, {method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...payload, confirm: true, confirmText: typed.trim()})});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || failed);
      await onDeleted();
    } catch (reason) {setError((reason as Error).message); setBusy(false);}
  }
  const cancel = () => {setOpen(false); setTyped(''); setError(''); onCancel?.();};
  return <section className={`ex-delete-zone${open ? ' is-open' : ''}`} aria-label={heading}>
    <div className="ex-delete-head"><div><h3><Trash2 size={15}/>{heading}</h3>{!open && <p>{summary}</p>}</div>
      {!open && <button type="button" className="ex-button ex-danger-outline" onClick={() => setOpen(true)}>{heading}</button>}</div>
    {open && <>
      <p className="ex-delete-warning">{warning}</p>
      <label className="ex-delete-type"><span>{t('deleteTypeHint', {phrase: DELETE_PHRASE})}</span><input value={typed} disabled={busy} autoComplete="off" spellCheck={false} placeholder={DELETE_PHRASE} onChange={event => setTyped(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); void remove();}}}/></label>
      {error && <p className="ex-form-error" role="alert">{error}</p>}
      <div className="ex-delete-actions"><button type="button" className="ex-button" disabled={busy} onClick={cancel}>{t('cancel')}</button><button type="button" className="ex-button ex-danger" disabled={busy || !ready} onClick={() => void remove()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Trash2 size={16}/>}{t(busy ? 'deleting' : 'deleteNow')}</button></div>
    </>}
  </section>;
}

/** Room settings: deletes the room and everything in it right away. */
export default function ExhibitionDelete({exhibitionId, title, artworkCount, onDeleted, startOpen, onCancel}: {exhibitionId: string; title: string; artworkCount: number; onDeleted: () => Promise<void> | void; startOpen?: boolean; onCancel?: () => void}) {
  const t = useTranslations('exhibition');
  return <DeleteZone heading={t('deleteRoom')} summary={t('deleteSummary')} warning={t('deleteWarning', {title, count: artworkCount})} endpoint={`/api/exhibitions/${exhibitionId}`} failed={t('deleteFailed')} onDeleted={onDeleted} startOpen={startOpen} onCancel={onCancel}/>;
}

/**
 * 전시관 delete in two steps: when rooms are still inside, the teacher first sees them and confirms they go too,
 * then types the phrase for the final delete. The server refuses without both. Classes are never touched.
 */
export function HallDelete({kind, name, onDeleted, onCancel}: {kind: string; name: string; onDeleted: () => Promise<void> | void; onCancel: () => void}) {
  const t = useTranslations('exhibition');
  const [rooms, setRooms] = useState<{id: string; title: string}[] | null>(null), [error, setError] = useState('');
  const [step, setStep] = useState<'rooms' | 'type'>('rooms');
  useEffect(() => {
    let alive = true;
    fetch(`/api/exhibitions/halls/${kind}`, {cache: 'no-store'}).then(async response => {const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || t('deleteHallFailed')); if (alive) {setRooms(data.rooms || []); if (!data.rooms?.length) setStep('type');}}).catch(reason => {if (alive) setError((reason as Error).message);});
    return () => {alive = false;};
    // The translator can change identity on preference hydration; it must not restart the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  if (error) return <p className="ex-form-error" role="alert">{error}</p>;
  if (!rooms) return <p role="status" className="ex-hall-loading"><LoaderCircle className="spin" size={18}/>{t('loadingRooms')}</p>;
  if (step === 'rooms') return <section className="ex-delete-zone is-open" aria-label={t('deleteHall')}>
    <div className="ex-delete-head"><div><h3><Trash2 size={15}/>{t('deleteHallRoomsTitle', {count: rooms.length})}</h3></div></div>
    <p className="ex-delete-warning">{t('deleteHallRoomsWarning', {name})}</p>
    <ul className="ex-delete-rooms">{rooms.map(room => <li key={room.id}>{room.title}</li>)}</ul>
    <div className="ex-delete-actions"><button type="button" className="ex-button" onClick={onCancel}>{t('cancel')}</button><button type="button" className="ex-button ex-danger" onClick={() => setStep('type')}>{t('deleteHallRoomsConfirm')}<ArrowRight size={16}/></button></div>
  </section>;
  return <DeleteZone startOpen heading={t('deleteHall')} summary="" warning={t('deleteHallWarning', {name})} endpoint={`/api/exhibitions/halls/${kind}`} payload={{includeRooms: rooms.length > 0}} failed={t('deleteHallFailed')} onCancel={onCancel} onDeleted={onDeleted}/>;
}
