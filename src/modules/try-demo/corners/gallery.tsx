'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import {ArrowLeft, DoorOpen, X} from 'lucide-react';
import '@/styles/exhibition-sharing.css';
import {lockBodyScrollWhen} from '@/lib/body-scroll-lock';
import {useExhibitionViewport} from '@/components/use-exhibition-viewport';
import {isSpaceTheme} from '@/lib/space-exhibition/themes';
import {isOceanTheme} from '@/lib/ocean-exhibition/themes';
import {demoAsset, rooms, roomWorks, student, workImage} from '../data';
import {docentImage, docentItems} from '../docent';

// The real 3D rooms, unchanged. Each starts outside, so the visitor walks up to the door and goes in.
const Scene = dynamic(() => import('@/components/exhibition-world'), {ssr: false});
const SpaceScene = dynamic(() => import('@/components/space-exhibition-world'), {ssr: false});
const OceanScene = dynamic(() => import('@/components/ocean-exhibition-world'), {ssr: false});
const covers: Record<string, string> = {space: demoAsset('shots/space-outside.webp'), sea: demoAsset('shots/sea-outside.webp'), forest: docentImage('docent-1', true)};

function canRender3d() {
  try {const canvas = document.createElement('canvas'); return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));}
  catch {return false;}
}

export default function GalleryCorner() {
  const root = useRef<HTMLDivElement>(null);
  const [roomId, setRoomId] = useState(''), [selectedId, setSelectedId] = useState(''), [threeD, setThreeD] = useState(true);
  const [stage, setStage] = useState<'campus' | 'classroom' | 'gallery'>('campus');
  const room = rooms.find(r => r.id === roomId) ?? null;
  const artworks = useMemo(() => !room ? [] : room.id === 'forest'
    ? docentItems.map(d => ({id: d.id, title: d.title, artistName: student(d.studentId).name, url: docentImage(d.id), thumbnailUrl: docentImage(d.id, true), description: d.theme}))
    : roomWorks(room.id).map(w => ({id: w.id, title: w.title, artistName: student(w.studentId).name, url: workImage(w.id), thumbnailUrl: workImage(w.id, true), description: w.story})), [room]);
  const selected = artworks.find(w => w.id === selectedId) ?? null;
  useEffect(() => setThreeD(canRender3d()), []);
  useExhibitionViewport(root, !!room);
  useEffect(() => {if (room) return lockBodyScrollWhen(matchMedia('(max-width:760px), (max-height:520px) and (pointer:coarse)'));}, [room]);
  const open = (id: string) => {setSelectedId(''); setStage('campus'); setRoomId(id);};
  const leave = () => {setRoomId(''); setSelectedId('');};
  const world = {roomTitle: room?.title, artworks, paused: !!selected, onSelectArtwork: setSelectedId, onExit: leave, locale: 'ko'};

  if (!room) return <div className="try-pick">
    <div className="try-pick-head"><h2>어느 전시관에 들어가 볼까요?</h2><p>고르면 전시관 밖에서 시작해요. 문까지 걸어가 들어가 보세요.</p></div>
    <div className="try-pick-grid">{rooms.map(r => <button key={r.id} type="button" className="try-pick-card" onClick={() => open(r.id)}>
      <img src={covers[r.id]} alt=""/><span className="try-pick-tag">{r.hall}</span><strong>{r.title}</strong><small>{r.description}</small>
      <span className="try-pick-go"><DoorOpen size={18}/>들어가기</span>
    </button>)}</div>
    {!threeD && <p className="try-note">이 기기에서는 3D 전시관을 열 수 없어 작품 목록으로 보여 드려요.</p>}
  </div>;

  return <div className="try-gallery">
    <button type="button" className="try-pick-back" onClick={leave}><ArrowLeft size={16}/>다른 전시관 고르기</button>
    <div ref={root} className="public-exhibition is-immersive">
      {threeD && isSpaceTheme(room.theme) && <SpaceScene theme={room.theme} {...world}/>}
      {threeD && isOceanTheme(room.theme) && <OceanScene theme={room.theme} {...world}/>}
      {threeD && !isSpaceTheme(room.theme) && !isOceanTheme(room.theme) && <Scene theme="forest" stage={stage} buildingName="햇살초등학교"
        buildings={[{id: 'school', name: '햇살초등학교'}]} rooms={[{id: room.id, title: room.title, description: room.description, artworkCount: artworks.length}]}
        onEnterBuilding={() => setStage('classroom')} onEnterRoom={() => setStage('gallery')} {...world} onExit={() => stage === 'gallery' ? setStage('classroom') : stage === 'classroom' ? setStage('campus') : leave()}/>}
      {!threeD && <div className="public-exhibition-grid">{artworks.map(w => <button key={w.id} onClick={() => setSelectedId(w.id)}><img src={w.thumbnailUrl} alt={w.title} loading="lazy"/><strong>{w.title}</strong><span>{w.artistName}</span></button>)}</div>}
      {selected && <div className="public-art-backdrop" onClick={() => setSelectedId('')}><section role="dialog" aria-modal="true" aria-label={selected.title} onClick={event => event.stopPropagation()}>
        <button className="icon-button" aria-label="닫기" onClick={() => setSelectedId('')}><X/></button>
        <img src={selected.url} alt={selected.title}/><h2>{selected.title}</h2><p>{selected.artistName}</p><p className="public-art-description">{selected.description}</p>
      </section></div>}
    </div>
  </div>;
}
