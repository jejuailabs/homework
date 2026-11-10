'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {ArrowLeft, ArrowRight, CheckCircle2, Download, LoaderCircle, Mic, RefreshCw, Square, Volume2} from 'lucide-react';
import {micProblemText, useRecorder, type Take} from '@/modules/speech-studio/recorder';
import {SPEAKING_MAX_SECONDS, speakingCards, speakingComplete, speakingRecorded, speakingZipName, type SpeakingFile, type SpeakingTake, type SpeakingTakes} from '@/lib/cards-speaking';
import type {CardDistribution} from '@/lib/cards-types';
import {cardRequest} from './cards-study';
import {useSpeech} from './cards-classroom-shared';
import {saveSpeakingZip, useSpeakingCopy} from './cards-speaking-copy';
import '@/styles/cards-speaking.css';

type Detail = {distribution: CardDistribution; testActive?: unknown};
type State = {enabled: boolean; canRecord: boolean; takes: SpeakingTakes};
type Pending = {take: Take; cardId: string};
const speakingUrl = (distributionId: string, rest = '') => `/api/cards/distributions/${encodeURIComponent(distributionId)}/speaking${rest}`;

/** /student/cards/[id]/speaking: one card at a time, record, listen back, and download everything once the set is done. */
export function StudentCardsSpeaking({distributionId}: {distributionId: string}) {
  const {c, fill} = useSpeakingCopy(), speech = useSpeech();
  const [detail, setDetail] = useState<Detail | null>(null), [data, setData] = useState<State | null>(null), [loading, setLoading] = useState(true), [loadFailed, setLoadFailed] = useState(false);
  const [index, setIndex] = useState(0), [status, setStatus] = useState<'' | 'saving' | 'saved' | 'failed'>(''), [message, setMessage] = useState(''), [pending, setPending] = useState<Pending | null>(null), [download, setDownload] = useState<{done: number; total: number} | null>(null), [downloadFailed, setDownloadFailed] = useState(false);
  const recordingCard = useRef('');

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const [found, saved] = await Promise.all([cardRequest<Detail>(`/api/cards/distributions/${encodeURIComponent(distributionId)}`), cardRequest<State>(speakingUrl(distributionId))]);
      setDetail(found); setData(saved);
    } catch {setLoadFailed(true);} finally {setLoading(false);}
  }, [distributionId]);
  useEffect(() => {void load();}, [load]);

  async function upload(take: Take, cardId: string) {
    setStatus('saving'); setMessage(''); setPending(null);
    try {
      const response = await fetch(speakingUrl(distributionId, `/${encodeURIComponent(cardId)}`), {method: 'POST', headers: {'Content-Type': 'audio/wav'}, body: new Blob([Uint8Array.from(take.wav)], {type: 'audio/wav'}), credentials: 'same-origin'});
      const result = await response.json().catch(() => ({})) as {take?: SpeakingTake; error?: string};
      if (!response.ok || !result.take) {setMessage(result.error ?? ''); throw new Error('save_failed');}
      URL.revokeObjectURL(take.url);
      setData(value => value && {...value, takes: {...value.takes, [cardId]: result.take!}});
      setStatus('saved');
    } catch {setPending({take, cardId}); setStatus('failed');}
  }
  const recorder = useRecorder(take => void upload(take, recordingCard.current), SPEAKING_MAX_SECONDS);

  if (loading) return <section className="csp-page"><p className="csp-status" role="status"><LoaderCircle className="spin" size={18}/> {c.loading}</p></section>;
  if (loadFailed || !detail || !data) return <section className="csp-page"><p className="csp-status is-error" role="alert">{c.error}</p><button className="button" onClick={() => void load()}><RefreshCw size={16}/>{c.retry}</button></section>;

  const d = detail.distribution, cards = speakingCards(d.snapshot.cards), card = cards[Math.min(index, cards.length - 1)], take = card ? data.takes[card.id] : undefined;
  const backLink = <Link className="cs-back" href={`/student/cards/${distributionId}`}><ArrowLeft size={16}/>{c.back}</Link>;
  const notice = detail.testActive ? c.testing : !data.enabled ? c.off : '';
  if (notice || !card) return <section className="csp-page">{backLink}<p className="cs-alert" role="status">{notice || c.off}</p></section>;

  const busy = recorder.state !== 'idle' || status === 'saving', recording = recorder.state === 'recording', problem = recorder.problem ? micProblemText[recorder.problem] : null;
  const done = speakingRecorded(cards, data.takes), complete = speakingComplete(cards, data.takes);
  const go = (next: number) => {speech.stop(); setStatus(''); setMessage(''); setIndex(next);};
  function record() {speech.stop(); setStatus(''); setMessage(''); recordingCard.current = card.id; void recorder.start();}
  async function downloadAll() {
    setDownloadFailed(false); setDownload({done: 0, total: cards.length});
    try {
      const {files} = await cardRequest<{files: SpeakingFile[]}>(speakingUrl(distributionId, '?all=1'));
      setDownload({done: 0, total: files.length});
      await saveSpeakingZip(files, speakingZipName(d.title), finished => setDownload({done: finished, total: files.length}));
    } catch {setDownloadFailed(true);} finally {setDownload(null);}
  }

  return <section className="csp-page">
    {backLink}
    <header className="csp-head"><div><h1>{c.title}</h1><p>{d.title}</p></div><span className="csp-count">{fill(c.progress, {done, total: cards.length})}</span></header>
    {!data.canRecord && <p className="cs-alert" role="status">{c.locked}</p>}
    <div className="csp-card">
      <small>{fill(c.card, {current: index + 1, total: cards.length})}</small>
      <p className="csp-front">{card.front}</p>
      <p className="csp-back">{card.back}</p>
      {card.example && <p className="csp-example">{card.example}</p>}
      <div className="csp-actions">
        {speech.can && <button type="button" className="button" disabled={busy} onClick={() => speech.speak(card.front, 1)}><Volume2 size={18}/>{c.listen}</button>}
        {data.canRecord && (recording
          ? <button type="button" className="button primary csp-record is-live" onClick={() => recorder.stop()}><Square size={18}/>{c.stop}</button>
          : <button type="button" className="button primary csp-record" disabled={busy} onClick={record}>{busy ? <LoaderCircle className="spin" size={18}/> : <Mic size={18}/>}{recorder.state === 'starting' ? c.starting : recorder.state === 'processing' ? c.processing : status === 'saving' ? c.saving : take ? c.rerecord : c.record}</button>)}
      </div>
      {recording && <><div className="csp-level" aria-hidden="true"><span style={{width: `${Math.round(recorder.level * 100)}%`}}/></div><p className="csp-timer" role="timer">{fill(c.seconds, {seconds: recorder.seconds, max: SPEAKING_MAX_SECONDS})}</p></>}
      {problem && <div className="csp-problem" role="alert"><b>{problem.title}</b><ul>{problem.steps.map(step => <li key={step}>{step}</li>)}</ul></div>}
      {recorder.error && <p className="csp-status is-error" role="alert">{recorder.error}</p>}
      <p className={`csp-status ${status === 'failed' ? 'is-error' : ''}`} role="status">{status === 'saved' ? c.saved : status === 'failed' ? message || c.saveFailed : ''}</p>
      {status === 'failed' && pending && <button type="button" className="button" onClick={() => void upload(pending.take, pending.cardId)}><RefreshCw size={16}/>{c.saveRetry}</button>}
      {take?.url && <div className="csp-mine"><b>{c.mine}</b><audio key={take.takeId} controls preload="metadata" src={take.url}/></div>}
    </div>
    <div className="csp-nav">
      <button type="button" className="button" disabled={busy || index === 0} onClick={() => go(index - 1)}><ArrowLeft size={16}/>{c.prev}</button>
      <button type="button" className="button" disabled={busy || index >= cards.length - 1} onClick={() => go(index + 1)}>{c.next}<ArrowRight size={16}/></button>
    </div>
    {complete && <div className="csp-done"><div><b><CheckCircle2 size={17}/> {c.doneTitle}</b><p>{c.doneBody}</p></div><button type="button" className="button primary" disabled={!!download} onClick={() => void downloadAll()}>{download ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>}{download ? fill(c.downloading, download) : c.download}</button></div>}
    {downloadFailed && <p className="csp-status is-error" role="alert">{c.downloadFailed}</p>}
    <nav className="csp-list" aria-label={c.cardList}><h2>{c.cardList}</h2><ol>{cards.map((item, position) => <li key={item.id}><button type="button" className={data.takes[item.id] ? 'is-done' : ''} aria-current={position === index} disabled={busy} onClick={() => go(position)}>{position + 1}</button></li>)}</ol></nav>
  </section>;
}
