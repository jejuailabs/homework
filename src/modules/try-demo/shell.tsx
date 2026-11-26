'use client';
import {useEffect, useState} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {ArrowLeft, Bot, Building2, LoaderCircle, MessageCircleQuestion, Mic, NotebookPen, X} from 'lucide-react';
import {corners, DEMO_CLASS, isCorner, type CornerId} from './data';
import './styles.css';
import './tour.css';

/**
 * Login-free tour: four buttons, each opening a real screen. The 3D rooms and the 평어 sample run in the browser;
 * Berry and the docent's answers come from the live service through /api/try (one demo teacher, limited per visitor).
 * The only thing kept in this browser is which corners were opened.
 */
const loading = () => <p className="try-loading"><LoaderCircle className="spin" size={18}/>불러오는 중…</p>;
const views: Record<CornerId, React.ComponentType> = {
  gallery: dynamic(() => import('./corners/gallery'), {ssr: false, loading}),
  docent: dynamic(() => import('./corners/docent'), {ssr: false, loading}),
  berry: dynamic(() => import('./corners/berry'), {ssr: false, loading}),
  review: dynamic(() => import('./corners/review'), {ssr: false, loading}),
};
const icons: Record<CornerId, React.ComponentType<{size?: number}>> = {gallery: Building2, docent: Mic, berry: Bot, review: NotebookPen};
const SEEN = 'try:seen';

export default function TryShell({initial}: {initial: CornerId | null}) {
  const [corner, setCorner] = useState<CornerId | null>(initial), [seen, setSeen] = useState<CornerId[]>([]);
  useEffect(() => {
    try {const value = JSON.parse(localStorage.getItem(SEEN) || '[]'); if (Array.isArray(value)) setSeen(value.filter(isCorner));} catch {}
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    if (corner) url.searchParams.set('go', corner); else url.searchParams.delete('go');
    history.replaceState(null, '', url);
    document.querySelector('.try-body')?.scrollTo({top: 0});
    if (!corner) return;
    setSeen(old => {
      if (old.includes(corner)) return old;
      const next = [...old, corner];
      try {localStorage.setItem(SEEN, JSON.stringify(next));} catch {}
      return next;
    });
  }, [corner]);
  const View = corner ? views[corner] : null, current = corners.find(c => c.id === corner);
  return <div className="try-shell" role="dialog" aria-modal="true" aria-label="모두의 교실 체험">
    <header className="try-bar">
      {corner ? <button type="button" className="try-home" onClick={() => setCorner(null)}><ArrowLeft size={18}/><span>체험 처음으로</span></button>
        : <div className="try-brand"><img src="/characters/otter-moa.webp" alt=""/><div><strong>모두의 교실 체험</strong><small>{DEMO_CLASS.school} {DEMO_CLASS.name} · 체험 학급</small></div></div>}
      {current && <strong className="try-bar-title">{current.label}</strong>}
      <Link className="try-real" href="/contact?from=try-header"><MessageCircleQuestion size={17}/><span>정식으로 쓰려면?</span></Link>
      <Link className="try-close" href="/" aria-label="체험 닫기"><X size={20}/></Link>
    </header>
    <div className="try-body">
      {View ? <View/> : <section className="try-home-grid" aria-label="체험 고르기">
        <div className="try-home-head"><h1>무엇을 먼저 해 볼까요?</h1><p>로그인 없이, 실제 화면 그대로 체험해요.</p></div>
        {corners.map(c => {const Icon = icons[c.id]; return <button key={c.id} type="button" className={`try-home-card is-${c.id}`} onClick={() => setCorner(c.id)}>
          <span className="try-home-icon"><Icon size={30}/></span><strong>{c.label}</strong><span>{c.text}</span>{seen.includes(c.id) && <em>해 봤어요</em>}
        </button>;})}
        <Link className="try-home-contact" href="/contact?from=try-end">마음에 드셨나요? 우리 반에서 쓰려면 사용 요청을 남겨 주세요 →</Link>
      </section>}
    </div>
  </div>;
}
