'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import {Images, MessageCircleHeart, X} from 'lucide-react';
import '@/styles/exhibition-sharing.css';
import {lockBodyScrollWhen} from '@/lib/body-scroll-lock';
import {useExhibitionViewport} from '@/components/use-exhibition-viewport';
import {isSpaceTheme} from '@/lib/space-exhibition/themes';
import {isOceanTheme} from '@/lib/ocean-exhibition/themes';
import {guestbook, rooms, roomWorks, student, workImage, type DemoNote} from '../data';

// The real 3D rooms, unchanged. They only need a theme and a list of pictures.
const Scene = dynamic(() => import('@/components/exhibition-world'), {ssr: false});
const SpaceScene = dynamic(() => import('@/components/space-exhibition-world'), {ssr: false});
const OceanScene = dynamic(() => import('@/components/ocean-exhibition-world'), {ssr: false});

function canRender3d() {
  try {const canvas = document.createElement('canvas'); return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));}
  catch {return false;}
}

export default function GalleryCorner() {
  const root = useRef<HTMLDivElement>(null), modal = useRef<HTMLElement>(null);
  const [roomId, setRoomId] = useState(rooms[0].id), [scene, setScene] = useState(false), [selectedId, setSelectedId] = useState('');
  const [threeD, setThreeD] = useState(true), [notes, setNotes] = useState<Record<string, DemoNote[]>>({}), [draft, setDraft] = useState('');
  const room = rooms.find(r => r.id === roomId)!;
  const artworks = useMemo(() => roomWorks(roomId).map(w => ({...w, artistName: student(w.studentId).name, artworkDate: w.date, description: w.story, url: workImage(w.id), thumbnailUrl: workImage(w.id, true)})), [roomId]);
  const selected = artworks.find(w => w.id === selectedId) || null;
  useEffect(() => setThreeD(canRender3d()), []);
  useExhibitionViewport(root, scene);
  useEffect(() => {if (scene) return lockBodyScrollWhen(matchMedia('(max-width:760px), (max-height:520px) and (pointer:coarse)'));}, [scene]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {if (event.key === 'Escape') {event.preventDefault(); setSelectedId('');}};
    document.addEventListener('keydown', onKey);
    return () => {document.removeEventListener('keydown', onKey); previous?.focus();};
  }, [selected]);
  const select = (id: string) => {setDraft(''); setSelectedId(id);};
  const leave = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim().slice(0, 60);
    if (!selected || !text) return;
    setNotes(old => ({...old, [selected.id]: [...(old[selected.id] ?? []), {from: '나', text}]}));
    setDraft('');
  };
  const shown = selected ? [...(guestbook[selected.id] ?? []), ...(notes[selected.id] ?? [])] : [];
  const world = {roomTitle: room.title, artworks, paused: !!selected, onSelectArtwork: select, onExit: () => setScene(false), locale: 'ko'};

  return <div className="try-gallery">
    <div className="try-tabs" role="tablist" aria-label="전시실 고르기">{rooms.map(r => <button key={r.id} type="button" role="tab" aria-selected={r.id === roomId} className={r.id === roomId ? 'on' : ''} onClick={() => {setScene(false); setSelectedId(''); setRoomId(r.id);}}><strong>{r.title}</strong><small>{r.hall} · {r.month}</small></button>)}</div>
    <div ref={root} className={`public-exhibition${scene ? ' is-immersive' : ''}`}>
      <header><div><p className="page-kicker">OUR LITTLE GALLERY</p><h1>{room.title}</h1><p>{room.description}</p></div><img src="/characters/otter-moa.webp" alt=""/></header>
      <div className="public-exhibition-actions">
        {threeD ? <button className="button primary" onClick={() => setScene(!scene)}><Images size={17}/>{scene ? '작품 목록' : '전시실 걸어 보기'}</button> : <p className="try-note">이 기기에서는 3D 전시실 대신 작품 목록으로 보여 드려요.</p>}
        <span className="try-note">전시관 테마는 11가지예요. 위에서 다른 전시실을 눌러 보세요.</span>
      </div>
      {scene && isOceanTheme(room.theme) && <OceanScene theme={room.theme} {...world}/>}
      {scene && isSpaceTheme(room.theme) && <SpaceScene theme={room.theme} {...world}/>}
      {scene && !isSpaceTheme(room.theme) && !isOceanTheme(room.theme) && <Scene stage="gallery" buildings={[]} rooms={[]} onEnterBuilding={() => {}} onEnterRoom={() => {}} theme={room.theme} {...world}/>}
      <div className="public-exhibition-grid">{artworks.map(w => <button key={w.id} onClick={() => select(w.id)}><img src={w.thumbnailUrl} alt={w.title} loading="lazy"/><strong>{w.title}</strong><span>{w.artistName}</span><time>{w.artworkDate}</time></button>)}</div>
      {selected && <div className="public-art-backdrop" onClick={() => setSelectedId('')}><section ref={modal} role="dialog" aria-modal="true" aria-label={selected.title} onClick={event => event.stopPropagation()}>
        <button className="icon-button" aria-label="닫기" onClick={() => setSelectedId('')}><X/></button>
        <img src={selected.url} alt={selected.title}/><h2>{selected.title}</h2><p>{selected.artistName} · {selected.artworkDate}</p><p className="public-art-description">{selected.description}</p>
        <div className="try-guestbook"><h3><MessageCircleHeart size={17}/>따뜻한 방명록</h3>
          {shown.length ? <ul>{shown.map((n, i) => <li key={i}><strong>{n.from}</strong>{n.text}</li>)}</ul> : <p className="try-note">첫 응원을 남겨 보세요.</p>}
          <form onSubmit={leave}><input value={draft} maxLength={60} placeholder="응원 한마디 (체험에서는 저장되지 않아요)" aria-label="응원 한마디" onChange={e => setDraft(e.target.value)}/><button className="button soft" disabled={!draft.trim()}>남기기</button></form>
        </div>
      </section></div>}
    </div>
  </div>;
}
