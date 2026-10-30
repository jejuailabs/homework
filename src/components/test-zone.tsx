'use client';

import dynamic from 'next/dynamic';
import {useEffect, useRef, useState} from 'react';
import {ChevronUp, FlaskConical, X} from 'lucide-react';
import LearningKingBeta from './learning-king-beta';
import {useVerifiedViewer} from './viewer-context';
import {canPreviewRegionQuest} from '@/modules/region-quest/beta/access';
import '@/styles/test-zone.css';

const RegionQuestBeta = dynamic(() => import('@/modules/region-quest/beta/launcher'), {ssr: false});

export default function TestZone() {
  const {viewer} = useVerifiedViewer();
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {setExpanded(false); trigger.current?.focus();};

  useEffect(() => {
    if (!expanded) return;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (event.target instanceof Node && !root.current?.contains(event.target)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {event.preventDefault(); close();}
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);};
  }, [expanded]);

  return <div className="test-zone" ref={root}>
    <div id="test-zone-panel" className="test-zone-panel" ref={panel} hidden={!expanded} role="region" aria-labelledby="test-zone-title">
      <header><div><span>함께 만들어가는 실험실</span><h2 id="test-zone-title">Test Zone</h2></div><button type="button" className="icon-button" onClick={close} aria-label="Test Zone 닫기"><X size={18}/></button></header>
      <p>새로운 기능을 먼저 만나보세요.</p>
      <LearningKingBeta embedded/>
      {canPreviewRegionQuest(viewer?.role) && <RegionQuestBeta embedded/>}
      <small>교사·관리자 미리보기</small>
    </div>
    <button ref={trigger} type="button" className="test-zone-trigger" aria-controls="test-zone-panel" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><FlaskConical size={17}/><span>Test Zone</span><ChevronUp size={15} className={expanded ? 'is-open' : ''}/></button>
  </div>;
}
