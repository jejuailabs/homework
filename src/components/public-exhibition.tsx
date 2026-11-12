'use client';
import {lockBodyScrollWhen} from '@/lib/body-scroll-lock';
import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {useLocale} from 'next-intl';
import dynamic from 'next/dynamic';
import {Images, LoaderCircle, Upload, X} from 'lucide-react';
import '@/styles/exhibition-sharing.css';
import {useExhibitionViewport} from './use-exhibition-viewport';
import ArtworkExtensions from '@/modules/artwork-extensions/slot';
import type {ArtworkModuleOptions} from '@/modules/artwork-extensions/types';
const Scene = dynamic(() => import('./exhibition-world'), {ssr: false});
const SpaceScene = dynamic(() => import('./space-exhibition-world'), {ssr: false});
import type {ExhibitionTheme} from '@/lib/exhibition-types';
import {isSpaceTheme} from '@/lib/space-exhibition/themes';
type Work = {id: string; title: string; artistName: string; artworkDate: string; description: string; url: string; thumbnailUrl: string; videoUrl?: string; audioUrl?: string};
type Room = {id: string; title: string; description: string; theme: ExhibitionTheme; allowStudentUploads: boolean; artworkModules?:ArtworkModuleOptions};
export default function PublicExhibition({token}: {token: string}) {
  const modal = useRef<HTMLElement>(null),root=useRef<HTMLDivElement>(null);
  const en = useLocale() === 'en', [data, setData] = useState<{exhibition: Room; artworks: Work[]} | null>(null), [error, setError] = useState(''), [selected, setSelected] = useState<Work | null>(null), [scene, setScene] = useState(false);
  useEffect(() => {const controller = new AbortController();fetch(`/api/exhibition-view/${encodeURIComponent(token)}`, {cache: 'no-store', signal: controller.signal}).then(async response => {const body = await response.json();if (!response.ok) throw new Error(body.error);setData(body);}).catch(error => {if (!controller.signal.aborted)setError(error.message);});return () => controller.abort();}, [token]);
  useEffect(()=>{if(!data)return;const id=new URLSearchParams(location.search).get('artwork');if(id)setSelected(data.artworks.find(work=>work.id===id)||null);},[data]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = modal.current?.querySelector<HTMLButtonElement>('button');
    close?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); setSelected(null);}
      if(event.key==='Tab'){const items=Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),audio[controls],video[controls],[tabindex="0"]')||[]).filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    };
    document.addEventListener('keydown', onKey);
    return () => {document.removeEventListener('keydown', onKey); previous?.focus();};
  }, [selected]);
  useExhibitionViewport(root,scene);
  useEffect(()=>{if(scene)return lockBodyScrollWhen(matchMedia("(max-width:760px), (max-height:520px) and (pointer:coarse)"));},[scene]);
  if (error) return <div className="public-exhibition-empty"><img src="/characters/otter-moa.webp" alt=""/><p role="alert">{error}</p></div>;
  if (!data) return <div className="center-state"><LoaderCircle className="spin"/>{en ? 'Opening the exhibition…' : '전시실을 열고 있어요…'}</div>;
  return <div ref={root} className={`public-exhibition${scene?" is-immersive":""}`}><header><div><p className="page-kicker">OUR LITTLE GALLERY</p><h1>{data.exhibition.title}</h1><p>{data.exhibition.description}</p></div><img src="/characters/otter-moa.webp" alt=""/></header><div className="public-exhibition-actions"><button className="button" onClick={() => setScene(!scene)}><Images size={17}/>{scene ? (en ? 'Picture list' : '작품 목록') : (en ? 'Walk through the gallery' : '전시실 둘러보기')}</button>{data.exhibition.allowStudentUploads && <Link className="button primary" href={`/?next=${encodeURIComponent(`/student/exhibitions?exhibition=${data.exhibition.id}`)}`}><Upload size={17}/>{en ? 'Student: exhibit my work' : '학생 입장 · 내 작품 올리기'}</Link>}</div>
    {scene && isSpaceTheme(data.exhibition.theme) && <SpaceScene theme={data.exhibition.theme} roomTitle={data.exhibition.title} artworks={data.artworks} paused={!!selected} onSelectArtwork={id => setSelected(data.artworks.find(work => work.id === id) || null)} onExit={()=>setScene(false)} locale={en ? 'en' : 'ko'}/>}
    {scene && !isSpaceTheme(data.exhibition.theme) && <Scene stage="gallery" buildings={[]} rooms={[]} roomTitle={data.exhibition.title} artworks={data.artworks} paused={!!selected} onSelectArtwork={id => setSelected(data.artworks.find(work => work.id === id) || null)} onExit={()=>setScene(false)} onEnterBuilding={()=>{}} onEnterRoom={()=>{}} locale={en ? 'en' : 'ko'} theme={data.exhibition.theme}/>}
    {!data.artworks.length && <p className="public-exhibition-empty">{en ? 'The teacher is preparing the exhibition.' : '선생님이 작품 전시를 준비하고 있어요.'}</p>}
    <div className="public-exhibition-grid">{data.artworks.map(work => <button key={work.id} onClick={() => setSelected(work)}><img src={work.thumbnailUrl} alt={work.title} loading="lazy"/>{work.videoUrl && <span className="public-art-play">▶ {en ? 'Video' : '영상'}</span>}<strong>{work.title}</strong><span>{work.artistName}</span><time>{work.artworkDate}</time></button>)}</div>
    {selected && <div className="public-art-backdrop" onClick={() => setSelected(null)}><section ref={modal} role="dialog" aria-modal="true" aria-label={selected.title} onClick={event => event.stopPropagation()}><button className="icon-button" aria-label={en ? 'Close' : '닫기'} onClick={() => setSelected(null)}><X/></button>{selected.videoUrl ? <video className="public-art-video" src={selected.videoUrl} poster={selected.url} controls playsInline preload="metadata" aria-label={selected.title}/> : <img src={selected.url} alt={selected.title}/>}<h2>{selected.title}</h2><p>{selected.artistName} · {selected.artworkDate}</p><p className="public-art-description">{selected.description}</p>{selected.audioUrl && <div className="ex-artwork-audio"><span>{en ? 'Sound with this artwork' : '함께 듣는 소리'}</span><audio src={selected.audioUrl} controls preload="none" aria-label={selected.title}/></div>}<ArtworkExtensions key={selected.id} endpoint={`/api/artwork-modules/exhibition/${data.exhibition.id}/${selected.id}?share=${encodeURIComponent(token)}`} options={data.exhibition.artworkModules} title={selected.title} artist={selected.artistName} en={en}/></section></div>}
  </div>;
}
