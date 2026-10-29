'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {LoaderCircle, Trash2} from 'lucide-react';

/** Danger zone in the room settings: deletes the room and everything in it right away. */
export default function ExhibitionDelete({exhibitionId, title, artworkCount, onDeleted}: {exhibitionId: string; title: string; artworkCount: number; onDeleted: () => Promise<void> | void}) {
  const t = useTranslations('exhibition');
  const [open, setOpen] = useState(false), [agreed, setAgreed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function remove() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/exhibitions/${exhibitionId}`, {method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({confirm: true})});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t('deleteFailed'));
      await onDeleted();
    } catch (reason) {setError((reason as Error).message); setBusy(false);}
  }
  return <section className={`ex-delete-zone${open ? ' is-open' : ''}`} aria-label={t('deleteRoom')}>
    <div className="ex-delete-head"><div><h3><Trash2 size={15}/>{t('deleteRoom')}</h3>{!open && <p>{t('deleteSummary')}</p>}</div>
      {!open && <button type="button" className="ex-button ex-danger-outline" onClick={() => setOpen(true)}>{t('deleteRoom')}</button>}</div>
    {open && <>
      <p className="ex-delete-warning">{t('deleteWarning', {title, count: artworkCount})}</p>
      <label className="ex-checkbox ex-delete-agree"><input type="checkbox" checked={agreed} disabled={busy} onChange={event => setAgreed(event.target.checked)}/><span>{t('deleteAgree')}</span></label>
      {error && <p className="ex-form-error" role="alert">{error}</p>}
      <div className="ex-delete-actions"><button type="button" className="ex-button" disabled={busy} onClick={() => {setOpen(false); setAgreed(false); setError('');}}>{t('cancel')}</button><button type="button" className="ex-button ex-danger" disabled={busy || !agreed} onClick={() => void remove()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Trash2 size={16}/>}{t(busy ? 'deleting' : 'deleteNow')}</button></div>
    </>}
  </section>;
}
