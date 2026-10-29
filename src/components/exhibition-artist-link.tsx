'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {LoaderCircle, UserCheck} from 'lucide-react';
import {linkableArtworks} from '@/lib/artwork-student-matching';

/** Teacher-only: links artworks uploaded without a student (e.g. titled "장유석") to the matching roster student. */
export default function ExhibitionArtistLink({exhibitionId, artworks, students, onDone}: {
  exhibitionId: string; artworks: {id: string; title: string; artistName?: string; studentId?: string | null}[];
  students: {id: string; name: string}[]; onDone: (message: string) => Promise<void> | void;
}) {
  const t = useTranslations('exhibition'), [busy, setBusy] = useState(false);
  const plan = linkableArtworks(artworks, students);
  if (!plan.length) return null;
  async function link() {
    setBusy(true);
    let linked = 0;
    // One at a time through the regular edit route, so student slots and stamps stay consistent.
    for (const item of plan) {
      const response = await fetch(`/api/exhibitions/${exhibitionId}/artworks/${item.artworkId}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({studentId: item.studentId, artistName: item.artistName})}).catch(() => null);
      if (response?.ok) linked++;
    }
    setBusy(false);
    await onDone(linked === plan.length ? t('linkArtistsDone', {count: linked}) : t('linkArtistsPartial', {count: linked, failed: plan.length - linked}));
  }
  return <div className="ex-artist-link" role="status">
    <p>{t('linkArtistsHint', {count: plan.length})}</p>
    <button type="button" className="ex-button ex-primary" disabled={busy} onClick={() => void link()}>{busy ? <LoaderCircle className="spin" size={16}/> : <UserCheck size={16}/>}{t('linkArtistsButton', {count: plan.length})}</button>
  </div>;
}
