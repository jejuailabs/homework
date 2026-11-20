'use client';
import {useEffect, useState} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {ArrowLeft, ArrowRight, Check, LoaderCircle, X} from 'lucide-react';
import {corners, DEMO_CLASS, isCorner, type CornerId} from './data';
import './styles.css';

/**
 * The login-free tour. It is a self-contained window over the page: sample data only, no sign-in,
 * no request to this app's servers, and nothing a visitor does is kept after the window closes.
 * The only thing remembered (in this browser) is which corners were opened.
 */
const loading = () => <p className="try-loading" role="status"><LoaderCircle className="try-spin" size={20}/>체험을 준비하고 있어요…</p>;
const views = {
  gallery: dynamic(() => import('./corners/gallery'), {ssr: false, loading}),
  flow: dynamic(() => import('./corners/flow'), {ssr: false, loading}),
  bomal: dynamic(() => import('./corners/bomal'), {ssr: false, loading}),
  board: dynamic(() => import('./corners/board'), {ssr: false, loading}),
  cards: dynamic(() => import('./corners/cards'), {ssr: false, loading}),
  berry: dynamic(() => import('./corners/berry'), {ssr: false, loading}),
  artbook: dynamic(() => import('./corners/artbook'), {ssr: false, loading}),
  start: dynamic(() => import('./corners/start'), {ssr: false, loading}),
};
const SEEN = 'try:seen';
function readSeen(): CornerId[] {
  try {const value = JSON.parse(localStorage.getItem(SEEN) || '[]'); return Array.isArray(value) ? value.filter(isCorner) : [];}
  catch {return [];}
}

export default function TryShell({initial}: {initial: CornerId}) {
  const [corner, setCorner] = useState<CornerId>(initial), [seen, setSeen] = useState<CornerId[]>([]);
  useEffect(() => setSeen(readSeen()), []);
  useEffect(() => {
    // Each corner has its own address so a link can open it directly.
    const url = new URL(location.href);
    if (url.searchParams.get('go') !== corner) {url.searchParams.set('go', corner); history.replaceState(null, '', url);}
    setSeen(old => {
      if (old.includes(corner)) return old;
      const next = [...old, corner];
      try {localStorage.setItem(SEEN, JSON.stringify(next));} catch {}
      return next;
    });
    document.querySelector('.try-body')?.scrollTo({top: 0});
  }, [corner]);
  const index = corners.findIndex(c => c.id === corner), View = views[corner], previous = corners[index - 1], next = corners[index + 1];
  return <div className="try-shell" role="dialog" aria-modal="true" aria-label="모두의 교실 체험">
    <header className="try-bar">
      <div className="try-brand"><img src="/characters/otter-moa.webp" alt=""/><div><strong>모두의 교실 체험</strong><small>{DEMO_CLASS.school} {DEMO_CLASS.name} · 가상 학급</small></div></div>
      <span className="try-badge">체험 중 · 저장되지 않아요</span>
      <Link className="try-close" href="/" aria-label="체험 닫기"><X size={20}/></Link>
    </header>
    <nav className="try-steps" aria-label="체험 코너">{corners.map((c, i) => <button key={c.id} type="button" className={c.id === corner ? 'on' : ''} aria-current={c.id === corner ? 'step' : undefined} onClick={() => setCorner(c.id)}>
      <span className="try-step-no">{seen.includes(c.id) && c.id !== corner ? <Check size={13}/> : i + 1}</span><span>{c.label}</span></button>)}</nav>
    <div className="try-body">
      <p className="try-lead">{index + 1} / {corners.length} · {corners[index].lead}</p>
      <View/>
      <footer className="try-next">
        {previous ? <button type="button" className="button soft" onClick={() => setCorner(previous.id)}><ArrowLeft size={16}/>{previous.label}</button> : <span/>}
        {next ? <button type="button" className="button primary" onClick={() => setCorner(next.id)}>다음: {next.label}<ArrowRight size={16}/></button> : <Link className="button primary" href="/">선생님으로 시작하기<ArrowRight size={16}/></Link>}
      </footer>
    </div>
  </div>;
}
