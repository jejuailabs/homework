'use client';
import {useEffect, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {ArrowRight, LoaderCircle, MessageCircleQuestion, Play, Rocket, Sparkles, X} from 'lucide-react';
import {berryAssetUrl} from '@/lib/berry-brand';
import {corners, demoAsset, isCorner, type CornerId} from './data';
import {docentImage} from './docent';
import './styles.css';
import './tour.css';

/**
 * Login-free tour: a home with four picture cards; each opens its real screen in a modal over the home.
 * The 3D rooms and the 평어 sample run in the browser; Berry and the docent's answers come from the live service
 * through /api/try. The only thing kept in this browser is which corners were opened.
 */
const loading = () => <p className="try-loading"><LoaderCircle className="spin" size={18}/>불러오는 중…</p>;
const views: Record<CornerId, React.ComponentType> = {
  gallery: dynamic(() => import('./corners/gallery'), {ssr: false, loading}),
  docent: dynamic(() => import('./corners/docent'), {ssr: false, loading}),
  berry: dynamic(() => import('./corners/berry'), {ssr: false, loading}),
  review: dynamic(() => import('./corners/review'), {ssr: false, loading}),
};
const SEEN = 'try:seen';

/** The picture side of each card: the real thing it opens, plus a character. */
function Visual({id}: {id: CornerId}) {
  if (id === 'gallery') return <div className="try-card-visual is-gallery">
    <img className="try-cover" src={demoAsset('shots/space-outside.webp')} alt="토성 옆에 떠 있는 우주 전시관"/>
    <img className="try-cover-mini" src={demoAsset('shots/sea-outside.webp')} alt=""/>
    <img className="try-char try-char-gallery" src="/characters/cat-mochi.webp" alt=""/>
  </div>;
  if (id === 'docent') return <div className="try-card-visual is-docent">
    <img className="try-cover" src={docentImage('docent-1', true)} alt="3학년 친구의 태권도 띠 발표 자료"/>
    <span className="try-play"><Play size={26}/></span>
    <span className="try-wave" aria-hidden="true"><i/><i/><i/><i/><i/></span>
    <img className="try-char try-char-docent" src="/characters/otter-moa.webp" alt=""/>
  </div>;
  if (id === 'berry') return <div className="try-card-visual is-berry">
    <p className="try-mock-bubble me">숙제 검사해 줘</p>
    <p className="try-mock-bubble berry">검사 기다리는 숙제가 2개예요. 카드에서 저장을 누르면 반영돼요.</p>
    <img className="try-char try-char-blue" src={berryAssetUrl('blue-haenyeo')} alt=""/>
    <img className="try-char try-char-rasp" src={berryAssetUrl('rasp-hallabong')} alt=""/>
  </div>;
  return <div className="try-card-visual is-review">
    <div className="try-mock-paper"><b>행동특성 및 종합의견</b><span/><span/><span/><span className="short"/><em><Sparkles size={13}/>377자 · 생활기록부 말투</em></div>
    <img className="try-char try-char-review" src="/characters/rabbit-tori.webp" alt=""/>
  </div>;
}

export default function TryShell({initial}: {initial: CornerId | null}) {
  const [corner, setCorner] = useState<CornerId | null>(initial), [seen, setSeen] = useState<CornerId[]>([]);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    try {const value = JSON.parse(localStorage.getItem(SEEN) || '[]'); if (Array.isArray(value)) setSeen(value.filter(isCorner));} catch {}
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    if (corner) url.searchParams.set('go', corner); else url.searchParams.delete('go');
    history.replaceState(null, '', url);
    if (!corner) return;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {if (event.key === 'Escape' && !document.querySelector('.try-modal-backdrop, .public-art-backdrop')) setCorner(null);};
    document.addEventListener('keydown', onKey);
    setSeen(old => {
      if (old.includes(corner)) return old;
      const next = [...old, corner];
      try {localStorage.setItem(SEEN, JSON.stringify(next));} catch {}
      return next;
    });
    return () => document.removeEventListener('keydown', onKey);
  }, [corner]);
  const View = corner ? views[corner] : null, current = corners.find(c => c.id === corner);

  return <div className="try-shell" aria-label="모두의 교실 체험">
    <header className="try-bar">
      <div className="try-brand"><img src={berryAssetUrl('berry-duo-logo')} alt=""/><div><strong>모두의 교실 체험</strong><small>햇살초 3학년 2반 · 체험 학급</small></div></div>
      <Link className="try-close" href="/" aria-label="체험 닫기"><X size={20}/></Link>
    </header>
    <div className="try-body">
      <section className="try-hero">
        <div className="try-hero-text">
          <p className="try-hero-kicker">로그인 없이, 실제 화면 그대로</p>
          <h1>우리 반 교실,<br/>먼저 걸어 보세요</h1>
          <p>전시관을 걷고, 아이 목소리를 듣고, 부담임 베리에게 일을 맡겨 보세요.</p>
        </div>
        <div className="try-hero-cast" aria-hidden="true">
          <img className="cast-a" src={berryAssetUrl('blue-hallabong')} alt=""/>
          <img className="cast-b" src={berryAssetUrl('rasp-haenyeo')} alt=""/>
          <img className="cast-c" src="/characters/otter-moa.webp" alt=""/>
        </div>
      </section>
      <section className="try-home-grid" aria-label="체험 고르기">
        {corners.map((c, i) => <button key={c.id} type="button" className={`try-home-card is-${c.id}`} onClick={() => setCorner(c.id)}>
          <Visual id={c.id}/>
          <div className="try-card-text">
            <span className="try-card-no">{String(i + 1).padStart(2, '0')}</span>
            <strong>{c.label}</strong><span>{c.text}</span>
            <span className="try-card-go">{seen.includes(c.id) ? '다시 해 보기' : '체험하기'}<ArrowRight size={16}/></span>
          </div>
          {seen.includes(c.id) && <em className="try-card-seen">해 봤어요</em>}
        </button>)}
      </section>
      <section className="try-start-band" aria-label="내 교실 시작하기">
        <img className="try-start-cast" src={berryAssetUrl('rasp-hallabong')} alt=""/>
        <div className="try-start-copy"><strong>체험해 보니 괜찮으셨나요?</strong><span>Google 계정 하나면 1분 만에 우리 반 교실이 열려요. 따로 쓰는 가입 양식은 없어요.</span></div>
        <div className="try-start-actions">
          <Link className="try-start-main" href="/?start=teacher"><Rocket size={20}/>바로 내 교실 써 보기</Link>
          <Link className="try-start-sub" href="/contact?from=try-end"><MessageCircleQuestion size={17}/>사용 문의 남기기</Link>
        </div>
      </section>
    </div>

    {View && current && <div className="try-corner-backdrop" onClick={() => setCorner(null)}>
      <section ref={dialog} tabIndex={-1} className={`try-corner is-${current.id}`} role="dialog" aria-modal="true" aria-label={current.label} onClick={event => event.stopPropagation()}>
        <header className="try-corner-head"><div><strong>{current.label}</strong><small>{current.lead}</small></div><button type="button" className="try-close" aria-label="닫기" onClick={() => setCorner(null)}><X size={20}/></button></header>
        <div className="try-corner-body"><View/></div>
      </section>
    </div>}
  </div>;
}
