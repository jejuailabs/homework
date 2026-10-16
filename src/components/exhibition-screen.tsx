'use client';
import {useEffect, useId, useRef, useState} from 'react';
import {ChevronDown, ChevronLeft, ChevronRight, Grid2X2, Maximize2, Pause, Play, X} from 'lucide-react';
import type {ArtScreenFrame, ScreenArtwork} from '@/lib/exhibition-screen-painter';
import '@/styles/exhibition-screen.css';

export default function ExhibitionScreen({artworks, english, paused, onFrame, onExpanded, openSignal=0}: {artworks: ScreenArtwork[]; english: boolean; paused: boolean; onFrame: (frame: ArtScreenFrame) => void; onExpanded: (expanded: boolean) => void; openSignal?:number}) {
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(true), [overview, setOverview] = useState(false), [expanded, setExpanded] = useState(false);
  const [visible,setVisible]=useState(true),[dockOpen,setDockOpen]=useState(false);const controlsId=useId();
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement>(null);
  const current = Math.min(index, Math.max(0, artworks.length - 1)), artwork = artworks[current];
  const page = Math.floor(current / 25), batch = artworks.slice(page * 25, page * 25 + 25);
  useEffect(() => {const media = matchMedia('(prefers-reduced-motion: reduce)');if(media.matches)setPlaying(false);const change=()=>{if(media.matches)setPlaying(false);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);}, []);
  useEffect(() => {onFrame({index: current, overview});}, [current, overview, onFrame, artworks]);
  useEffect(()=>{const root=opener.current?.closest('.ex-world');if(!root)return;const observer=new IntersectionObserver(entries=>setVisible(entries[0]?.isIntersecting??true));observer.observe(root);return()=>observer.disconnect();},[]);
  useEffect(() => {
    if (!playing || paused || !visible || overview || artworks.length < 2) return;
    const timer = setInterval(() => {if(!document.hidden)setIndex(i => (i + 1) % artworks.length);}, 6500);
    return () => clearInterval(timer);
  }, [playing, paused, visible, overview, artworks.length]);
  useEffect(() => {if(openSignal)setExpanded(true);},[openSignal]);
  useEffect(() => {if(!expanded)return;onExpanded(true);const element=dialog.current;element?.showModal();return()=>{element?.close();onExpanded(false);opener.current?.focus({preventScroll:true});};}, [expanded, onExpanded]);
  const manual = (i: number) => {setPlaying(false);setIndex((i + artworks.length) % artworks.length);};
  const previous = () => manual(overview ? (page > 0 ? page - 1 : Math.ceil(artworks.length / 25) - 1) * 25 : current - 1);
  const next = () => manual(overview ? ((page + 1) * 25) % artworks.length : current + 1);
  const controls = <><button type="button" onClick={previous} disabled={artworks.length < 2} aria-label={english ? 'Previous artwork' : '이전 작품'}><ChevronLeft size={18}/></button><button type="button" onClick={()=>{setOverview(false);setPlaying(!playing);}} disabled={artworks.length < 2} aria-label={playing&&!overview ? (english?'Pause slideshow':'자동 넘김 일시정지') : (english?'Play slideshow':'자동 넘김 시작')} aria-pressed={playing&&!overview}>{playing&&!overview?<Pause size={17}/>:<Play size={17}/>}</button><button type="button" onClick={next} disabled={artworks.length < 2} aria-label={english?'Next artwork':'다음 작품'}><ChevronRight size={18}/></button><span className="ex-screen-count">{artworks.length?current+1:0} / {artworks.length}</span><button type="button" onClick={()=>{setOverview(!overview);setPlaying(false);}} aria-pressed={overview} aria-label={english?'See all artworks':'전체 작품 모아보기'}><Grid2X2 size={17}/><span>{english?'Overview':'모아보기'}</span></button></>;
  return <>
    <div className={`ex-screen-dock${dockOpen?" is-controls-open":""}`} role="group" aria-label={english?'Art screen controls':'중앙 아트 스크린 조작'} onFocusCapture={()=>setPlaying(false)}><button className="ex-screen-mobile-toggle" type="button" aria-label={english?"Art screen controls":"아트 스크린 조작 열기·닫기"} aria-expanded={dockOpen} aria-controls={controlsId} onClick={()=>setDockOpen(value=>!value)}><Grid2X2 size={17}/><span>{english?"Art":"작품"} {artworks.length?current+1:0}/{artworks.length}</span><ChevronDown size={15}/></button><span className="ex-screen-brand">✦ {english?'ART SCREEN':'모아의 아트 스크린'}</span><div id={controlsId} className="ex-screen-buttons">{controls}<button ref={opener} type="button" onClick={()=>setExpanded(true)} aria-label={english?'Expand art screen':'아트 스크린 크게 보기'}><Maximize2 size={17}/></button></div><input aria-label={english?'Choose artwork':'모니터 작품 선택'} type="range" min={0} max={Math.max(0,artworks.length-1)} value={current} disabled={artworks.length<2} onChange={e=>manual(Number(e.target.value))}/></div>
    {expanded&&<dialog ref={dialog} className="ex-screen-dialog" tabIndex={-1} aria-label={english?'Our class art screen':'우리 반 아트 스크린'} onCancel={e=>{e.preventDefault();e.stopPropagation();setExpanded(false);}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)&&!(e.target instanceof HTMLInputElement)){e.preventDefault();e.stopPropagation();e.key==='ArrowLeft'?previous():next();}}}><header><div><small>MOA'S ART SCREEN</small><h2>{english?'Every little masterpiece':'작은 작품들이 모여, 큰 전시가 돼요'}</h2></div><button type="button" onClick={()=>setExpanded(false)} aria-label={english?'Close screen':'스크린 닫기'}><X size={21}/></button></header><div className={`ex-screen-content${overview?' is-overview':''}`}>
      {overview?<div className="ex-screen-overview">{batch.map((work,i)=><button type="button" key={work.id} onClick={()=>{manual(page*25+i);setOverview(false);requestAnimationFrame(()=>dialog.current?.focus());}}><img src={work.thumbnailUrl||work.url} alt={work.title} loading="lazy"/><span>{page*25+i+1}. {work.title}</span></button>)}</div>:artwork?<figure key={artwork.id}><img src={artwork.url||artwork.thumbnailUrl} alt={artwork.title}/><figcaption><strong>{artwork.title}</strong><span>{artwork.artistName||artwork.studentName||''}</span></figcaption></figure>:<p>{english?'Your artworks will appear here.':'작품을 올리면 이곳에서 함께 감상해요.'}</p>}
    </div><footer><div className="ex-screen-buttons">{controls}</div>{overview&&artworks.length>25&&<p>{english?'Overview page':'모아보기'} {page+1} / {Math.ceil(artworks.length/25)}</p>}<label><span>{english?'Choose artwork':'작품 선택'}</span><input type="range" min={0} max={Math.max(0,artworks.length-1)} value={current} disabled={artworks.length<2} onChange={e=>manual(Number(e.target.value))}/></label></footer></dialog>}
  </>;
}
