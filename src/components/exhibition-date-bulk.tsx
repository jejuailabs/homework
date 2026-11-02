'use client';
import {useState, type ComponentType, type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {CalendarDays, LoaderCircle} from 'lucide-react';
import {artworkToday} from '@/lib/exhibition-metadata';
import type {ExhibitionArtwork} from '@/lib/exhibition-types';

type DialogProps = {title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean};

/** Changes the artwork date of every artwork in a room, or of the ones the current filter shows, in one step. */
export default function ExhibitionDateBulk({exhibitionId, artworks, shown, onClose, onDone, DialogComponent: Dialog}: {exhibitionId: string; artworks: ExhibitionArtwork[]; shown: ExhibitionArtwork[]; onClose: () => void; onDone: (message: string) => Promise<void>; DialogComponent: ComponentType<DialogProps>}) {
  const en = useLocale() === 'en';
  const [date, setDate] = useState(artworkToday()), [scope, setScope] = useState<'all' | 'shown'>('all'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const targets = scope === 'all' ? artworks : shown;
  async function apply() {
    if (busy || !date || !targets.length) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/exhibitions/${exhibitionId}/artwork-dates`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({artworkDate: date, ...(scope === 'shown' ? {artworkIds: shown.map(artwork => artwork.id)} : {})})});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await onDone(en ? `Changed the date of ${body.updated} artworks.` : `작품 ${body.updated}점의 날짜를 바꿨어요 (${date}).`);
    } catch (cause) {setError(cause instanceof Error && cause.message ? cause.message : en ? 'Could not change the dates.' : '날짜를 바꾸지 못했어요.'); setBusy(false);}
  }
  return <Dialog title={en ? 'Change artwork dates' : '작품 날짜 일괄 변경'} onClose={onClose} busy={busy}>
    <div className="ex-form">
      <p className="ex-form-hint">{en ? 'Set the day the children made their work. Each artwork can still be changed on its own afterwards.' : '아이들이 작품을 만든 날로 한 번에 맞춰요. 바꾼 뒤에도 작품마다 따로 고칠 수 있어요.'}</p>
      <label className="ex-date-bulk-field"><span><CalendarDays size={15}/>{en ? 'Artwork date' : '작품 날짜'}</span><input type="date" value={date} max={artworkToday()} disabled={busy} onChange={event => setDate(event.target.value)}/></label>
      <fieldset className="ex-date-bulk-scope" disabled={busy}>
        <label><input type="radio" name="date-scope" checked={scope === 'all'} onChange={() => setScope('all')}/>{en ? `Every artwork in this room (${artworks.length})` : `이 전시실의 모든 작품 (${artworks.length}점)`}</label>
        {shown.length !== artworks.length && <label><input type="radio" name="date-scope" checked={scope === 'shown'} onChange={() => setScope('shown')}/>{en ? `Only the artworks shown now (${shown.length})` : `지금 목록에 보이는 작품만 (${shown.length}점)`}</label>}
      </fieldset>
      {error && <p className="ex-form-error" role="alert">{error}</p>}
      <div className="ex-form-actions"><button type="button" className="ex-button" disabled={busy} onClick={onClose}>{en ? 'Cancel' : '취소'}</button><button type="button" className="ex-button ex-primary" disabled={busy || !date || !targets.length} onClick={() => void apply()}>{busy && <LoaderCircle size={17} className="spin"/>}{en ? `Apply to ${targets.length}` : `${targets.length}점에 적용`}</button></div>
    </div>
  </Dialog>;
}
