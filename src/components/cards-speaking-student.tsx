'use client';

import {useCallback, useEffect, useState} from 'react';
import Link from 'next/link';
import {ArrowLeft, Download, LoaderCircle, RefreshCw} from 'lucide-react';
import type {Take} from '@/modules/speech-studio/recorder';
import {speakingCards, speakingComplete, speakingZipName, type SpeakingCounts, type SpeakingFile, type SpeakingRequired, type SpeakingTake, type SpeakingTakes} from '@/lib/cards-speaking';
import type {CardDistribution, CardEntry} from '@/lib/cards-types';
import {cardRequest} from './cards-study';
import {saveSpeakingZip, useSpeakingCopy} from './cards-speaking-copy';
import {SpeakingRepeat} from './cards-speaking-repeat';
import '@/styles/cards-speaking.css';

type Detail = {distribution: CardDistribution; testActive?: unknown};
type State = {enabled: boolean; canRecord: boolean; takes: SpeakingTakes; aloud?: SpeakingTakes; counts?: SpeakingCounts; required?: SpeakingRequired};
const speakingUrl = (distributionId: string, rest = '') => `/api/cards/distributions/${encodeURIComponent(distributionId)}/speaking${rest}`;

/** /student/cards/[id]/speaking: the 스피킹 study tool (6 steps), saved to this distribution. */
export function StudentCardsSpeaking({distributionId}: {distributionId: string}) {
  const {c} = useSpeakingCopy();
  const [detail, setDetail] = useState<Detail | null>(null), [data, setData] = useState<State | null>(null), [loading, setLoading] = useState(true), [loadFailed, setLoadFailed] = useState(false);
  const [download, setDownload] = useState<{done: number; total: number} | null>(null), [downloadFailed, setDownloadFailed] = useState(false), [takes, setTakes] = useState<SpeakingTakes>({});

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const [found, saved] = await Promise.all([cardRequest<Detail>(`/api/cards/distributions/${encodeURIComponent(distributionId)}`), cardRequest<State>(speakingUrl(distributionId))]);
      setDetail(found); setData(saved); setTakes(saved.takes);
    } catch {setLoadFailed(true);} finally {setLoading(false);}
  }, [distributionId]);
  useEffect(() => {void load();}, [load]);

  // 듣고 따라 말하기 saves each card's take as the distribution's 녹음 take; the other five steps are hidden for now.
  const saveTake = useCallback(async (cardId: string, take: Take) => {
    const response = await fetch(speakingUrl(distributionId, `/${encodeURIComponent(cardId)}`), {method: 'POST', headers: {'Content-Type': 'audio/wav'}, body: new Blob([Uint8Array.from(take.wav)], {type: 'audio/wav'}), credentials: 'same-origin'});
    const result = await response.json().catch(() => ({})) as {take?: SpeakingTake};
    if (!response.ok || !result.take) throw new Error('save_failed');
    URL.revokeObjectURL(take.url);
    setTakes(value => ({...value, [cardId]: result.take!}));
    return result.take;
  }, [distributionId]);

  const backLink = <Link className="cs-back" href={`/student/cards/${distributionId}`}><ArrowLeft size={16}/>{c.back}</Link>;
  if (loading) return <section className="csp-page"><p className="csp-status" role="status"><LoaderCircle className="spin" size={18}/> {c.loading}</p></section>;
  if (loadFailed || !detail || !data) return <section className="csp-page"><p className="csp-status is-error" role="alert">{c.error}</p><button className="button" onClick={() => void load()}><RefreshCw size={16}/>{c.retry}</button></section>;
  const d = detail.distribution, cards = speakingCards(d.snapshot.cards);
  const notice = detail.testActive ? c.testing : !data.enabled ? c.off : '';
  if (notice || !cards.length) return <section className="csp-page">{backLink}<p className="cs-alert" role="status">{notice || c.off}</p></section>;

  async function downloadAll() {
    setDownloadFailed(false); setDownload({done: 0, total: cards.length});
    try {
      const {files} = await cardRequest<{files: SpeakingFile[]}>(speakingUrl(distributionId, '?all=1'));
      setDownload({done: 0, total: files.length});
      await saveSpeakingZip(files, speakingZipName(d.title), finished => setDownload({done: finished, total: files.length}));
    } catch {setDownloadFailed(true);} finally {setDownload(null);}
  }
  // Once every sentence has a 녹음 take, the student can keep them as one ZIP, as before.
  const footer = speakingComplete(cards, takes) ? <div className="csp-done"><div><b>{c.doneTitle}</b><p>{c.doneBody}</p></div><button type="button" className="button primary" disabled={!!download} onClick={() => void downloadAll()}>{download ? <LoaderCircle className="spin" size={17}/> : <Download size={17}/>}{download ? `${download.done}/${download.total}` : c.download}</button>{downloadFailed && <p className="csp-status is-error" role="alert">{c.downloadFailed}</p>}</div> : null;
  return <SpeakingRepeat title={d.title} cards={cards} canRecord={data.canRecord} takes={data.takes} saveTake={saveTake} exit={backLink} footer={footer}/>;
}

/** The teacher's look at the same tool from the set page: nothing is saved. */
export function SpeakingPreview({title, cards, onClose}: {title: string; cards: CardEntry[]; onClose: () => void}) {
  const {c} = useSpeakingCopy();
  return <SpeakingRepeat preview title={title} cards={speakingCards(cards)} canRecord takes={{}} exit={<button type="button" className="cs-back" onClick={onClose}><ArrowLeft size={16}/>{c.back}</button>}/>;
}
