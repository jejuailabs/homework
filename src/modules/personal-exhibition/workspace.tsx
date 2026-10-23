'use client';

import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useLocale, useTranslations} from 'next-intl';
import {ArrowLeft, ArrowRight, Images, LayoutGrid, LoaderCircle, RefreshCw, Sparkles, X} from 'lucide-react';
import type {PersonalArtwork, PersonalExhibitionPage} from './types';
import './styles.css';

const ExhibitionWorld = dynamic(() => import('@/components/exhibition-world'), {ssr: false});
const artworkKey = (work: PersonalArtwork) => `${work.exhibitionId}:${work.id}`;

function ArtworkPicture({work, full = false}: {work: PersonalArtwork; full?: boolean}) {
  const t = useTranslations('exhibition'), [failed, setFailed] = useState(false);
  const url = full ? work.url : work.thumbnailUrl || work.url;
  useEffect(() => setFailed(false), [url]);
  return failed || !url ? <span className="pe-image-fallback"><Images size={30}/>{t('fileUnavailable')}</span> : <img src={url} alt={work.title} loading={full ? 'eager' : 'lazy'} onError={() => setFailed(true)}/>;
}

function ArtworkDialog({work, onClose}: {work: PersonalArtwork; onClose: () => void}) {
  const t = useTranslations('exhibition'), en = useLocale().startsWith('en');
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null, node = dialog.current;
    node?.showModal();
    return () => {node?.close(); if (previous?.isConnected) previous.focus({preventScroll: true});};
  }, []);
  return <dialog ref={dialog} className="ex-dialog ex-dialog-wide pe-dialog" aria-labelledby={titleId} onCancel={event => {event.preventDefault(); onClose();}}>
    <header className="ex-dialog-head"><h2 id={titleId}>{work.title}</h2><button type="button" className="ex-icon-btn" aria-label={t('close')} onClick={onClose}><X size={21}/></button></header>
    <div className="pe-detail"><ArtworkPicture work={work} full/><div className="pe-detail-meta"><strong>{work.artistName || work.studentName}</strong><time dateTime={work.artworkDate}>{work.artworkDate}</time><span className={`ex-status ex-status-${work.status}`}>{t(work.status)}</span></div>
      {work.description && <p>{work.description}</p>}{work.feedback && <section className="ex-feedback"><h3>{t('teacherFeedback')}</h3><p>{work.feedback}</p></section>}
      <Link className="ex-button" href={`/student/exhibitions?exhibition=${encodeURIComponent(work.exhibitionId)}`}>{en ? 'From' : '작품이 있는 전시'} · {work.exhibitionTitle}<ArrowRight size={16}/></Link>
    </div>
  </dialog>;
}

export default function PersonalExhibitionWorkspace() {
  const t = useTranslations('exhibition'), en = useLocale().startsWith('en'), router = useRouter();
  const [data, setData] = useState<PersonalExhibitionPage | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [view, setView] = useState<'room' | 'grid'>('room'), [selected, setSelected] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const load = useCallback(async (cursor?: string | null) => {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setLoading(true); setError(''); setSelected(null);
    if (!cursor) setData(null);
    try {
      const response = await fetch('/api/personal-exhibition' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''), {cache: 'no-store', signal: controller.signal});
      const result = await response.json();
      if (!response.ok) {
        if (['UNAUTHENTICATED', 'CODE_RESET'].includes(result.code)) router.replace('/');
        throw new Error(result.code);
      }
      if (controller.signal.aborted) return;
      setData(previous => {
        const works = new Map<string, PersonalArtwork>();
        for (const work of [...(cursor ? previous?.artworks || [] : []), ...result.artworks]) works.set(artworkKey(work), work);
        return {...result, artworks: [...works.values()].sort((a, b) => (b.artworkDate || b.createdAt).localeCompare(a.artworkDate || a.createdAt) || b.createdAt.localeCompare(a.createdAt))};
      });
    } catch {
      if (!controller.signal.aborted) setError(t('error'));
    } finally {if (!controller.signal.aborted) setLoading(false);}
  }, [router, t]);
  useEffect(() => {void load(); return () => requestRef.current?.abort();}, [load]);
  const worldArtworks = useMemo(() => (data?.artworks || []).map(work => ({...work, id: artworkKey(work)})), [data]);
  const current = data?.artworks.find(work => artworkKey(work) === selected);
  const title = data ? (en ? `${data.student.name}'s gallery` : `${data.student.name}의 전시실`) : t('personalTitle');

  return <div className="ex-workspace pe-workspace">
    <Link href="/student" className="ex-back"><ArrowLeft size={17}/>{en ? 'My classroom' : '내 교실로'}</Link>
    <header className="pe-heading"><div><span className="ex-eyebrow"><Sparkles size={14}/>{t('personalTitle')}</span><h1>{title}</h1><p>{t('personalEntryHint')}</p>{data && <small>{data.student.className} · {t('artworkCount', {count: data.artworks.length})}</small>}</div><img src="/characters/otter-moa.webp" alt=""/></header>
    <div className="pe-toolbar"><div className="ex-view-switch"><button type="button" aria-pressed={view === 'room'} onClick={() => setView('room')}><Images size={16}/>{t('room')}</button><button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={16}/>{t('grid')}</button></div><button type="button" className="ex-icon-btn" disabled={loading} aria-label={t('refresh')} onClick={() => void load()}><RefreshCw size={18}/></button></div>
    {error && <div className="pe-error" role="alert">{error}<button type="button" className="ex-button" disabled={loading} onClick={() => void load(data?.nextCursor)}>{t('retry')}</button></div>}
    {loading && !data ? <div className="ex-loading" role="status"><LoaderCircle size={24} className="spin"/><p>{t('loading')}</p></div> : data && <>
      {view === 'room' && <ExhibitionWorld stage="gallery" buildings={[]} rooms={[]} artworks={worldArtworks} roomTitle={title} buildingName={data.student.className} locale={en ? 'en' : 'ko'} paused={!!current} onEnterBuilding={() => {}} onEnterRoom={() => {}} onSelectArtwork={setSelected} onExit={() => router.push('/student')}/>}
      {!data.artworks.length && <section className="pe-empty"><Images size={35}/><h2>{data.hasMore ? (en ? 'There are earlier exhibitions to explore' : '이전 전시의 작품도 찾아볼까요?') : (en ? 'Your gallery is ready' : '나만의 전시실이 준비됐어요')}</h2><p>{data.hasMore ? (en ? 'Load more to find your works from earlier class exhibitions.' : '내 작품 더 불러오기를 누르면 이전 학급 전시의 작품도 찾아와요.') : (en ? 'Works you upload or your teacher links to you will appear here when their exhibition opens.' : '내가 올리거나 선생님이 연결한 작품은 학급 전시가 열리면 여기에 함께 모여요.')}</p><Link className="ex-button" href="/student/exhibitions">{en ? 'Visit class exhibitions' : '우리 반 전시실 보기'}<ArrowRight size={16}/></Link></section>}
      {view === 'grid' && !!data.artworks.length && <div className="pe-grid">{data.artworks.map(work => <button type="button" key={artworkKey(work)} className="pe-artwork" onClick={() => setSelected(artworkKey(work))}><div className="pe-artwork-image"><ArtworkPicture work={work}/></div><div className="pe-artwork-caption"><strong>{work.title}</strong><span>{work.exhibitionTitle}</span><time dateTime={work.artworkDate}>{work.artworkDate}</time>{work.status !== 'approved' && <small className={`ex-status ex-status-${work.status}`}>{t(work.status)}</small>}</div></button>)}</div>}
      {data.hasMore && <div className="ex-more-rooms"><button type="button" className="ex-button" disabled={loading} onClick={() => void load(data.nextCursor)}>{loading && <LoaderCircle className="spin" size={17}/>} {en ? 'Load more of my works' : '내 작품 더 불러오기'}</button></div>}
    </>}
    {current && <ArtworkDialog key={artworkKey(current)} work={current} onClose={() => setSelected(null)}/>}
  </div>;
}
