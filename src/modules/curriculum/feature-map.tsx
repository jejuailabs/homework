'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {ChevronDown, ChevronRight, Search, Star, X} from 'lucide-react';
import {FEATURES, STATUS_LABELS, STEPS, TABS, searchFeatures, sectionName, type Feature} from './features';

/**
 * 기능 지도: 교육과정 기능 전체를 나무 모양(큰 메뉴 → 작성 단계 → 메뉴 → 기능)으로 보여 주고, 위 검색창으로 좁힌다.
 * 검색하지 않으면 지도를 둘러보고, 검색하면 맞는 기능만 남긴 채 그 가지를 펼친다.
 */
const TONE: Record<Feature['status'], string> = {live: 'is-live', elsewhere: 'is-elsewhere', planned: 'is-planned'};

export default function FeatureMap({onPick, onClose}: {onPick: (feature: Feature) => void; onClose: () => void}) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState<Set<string>>(() => new Set(['curriculum']));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {input.current?.focus();}, []);
  const hits = useMemo(() => query.trim() ? new Set(searchFeatures(query, 229).map(feature => feature.id)) : null, [query]);
  const shown = (feature: Feature) => !hits || hits.has(feature.id);
  const toggle = (key: string) => setOpen(old => {const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next;});
  const isOpen = (key: string) => !!hits || open.has(key);
  const total = hits ? hits.size : FEATURES.length;

  return <div className="cur-dialog fm-wrap" role="dialog" aria-modal="true" aria-label="기능 지도" onClick={onClose}>
    <div className="cur-dialog-card fm" onClick={event => event.stopPropagation()}>
      <header className="fm-head">
        <div><h3>기능 지도</h3><p className="cur-muted">교육과정 기능 {FEATURES.length}개가 어디 있는지 한눈에. 검색하면 맞는 가지만 남아요.</p></div>
        <button className="cur-icon" aria-label="닫기" onClick={onClose}><X size={18}/></button>
      </header>
      <div className="fm-search"><Search size={18}/><input ref={input} value={query} onChange={event => setQuery(event.target.value)} placeholder="하고 싶은 일 (예: 시수 맞추기, 주간학습, 나이스 올리기)" onKeyDown={event => {if (event.key === 'Escape') onClose();}}/>{query && <button className="cur-icon" aria-label="지우기" onClick={() => setQuery('')}><X size={16}/></button>}</div>
      <div className="fm-legend"><span className="is-live">지금 사용</span><span className="is-elsewhere">모두의 교실에 있음</span><span className="is-planned">준비 중</span><em>{hits ? `${total}개 찾음` : `${total}개`}</em></div>

      <div className="fm-tree">
        {TABS.map(tab => {
          const mine = FEATURES.filter(feature => feature.tab === tab.key), visible = mine.filter(shown);
          if (hits && !visible.length) return null;
          const live = mine.filter(feature => feature.status !== 'planned').length;
          return <section key={tab.key} className="fm-branch">
            <button className="fm-node is-tab" aria-expanded={isOpen(tab.key)} onClick={() => toggle(tab.key)}>
              {isOpen(tab.key) ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span className="cur-tab-no">{tab.no}</span><strong>{tab.name}</strong>
              <i className="fm-bar"><em style={{width: `${live / mine.length * 100}%`}}/></i><small>{hits ? `${visible.length}개` : `${live}/${mine.length}`}</small>
            </button>
            {isOpen(tab.key) && STEPS.filter(step => step.tab === tab.key).map(step => {
              const sections = step.sections.filter(key => mine.some(feature => feature.section === key && shown(feature)));
              if (!sections.length) return null;
              return <div key={step.key} className="fm-step">
                <p className="fm-step-name"><span>{step.no}</span>{step.name}<small>{step.who}</small></p>
                {sections.map(key => {
                  const list = mine.filter(feature => feature.section === key && shown(feature)), node = `${tab.key}:${key}`;
                  return <div key={key} className="fm-section">
                    <button className="fm-node" aria-expanded={isOpen(node)} onClick={() => toggle(node)}>
                      {isOpen(node) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<span>{sectionName(key)}</span>
                      <span className="fm-dots">{list.map(feature => <i key={feature.id} className={TONE[feature.status]}/>)}</span>
                    </button>
                    {isOpen(node) && <ul>{list.map(feature => <li key={feature.id}><button className={`fm-leaf ${TONE[feature.status]}`} onClick={() => onPick(feature)}>
                      <i/><span><strong>{feature.name}{feature.core && <Star size={12} className="cur-star" aria-label="핵심"/>}</strong><small>{feature.want}</small></span>
                      <em>{STATUS_LABELS[feature.status]}{feature.status === 'planned' ? ` · ${feature.phase}단계` : ''}</em>
                    </button></li>)}</ul>}
                  </div>;
                })}
              </div>;
            })}
          </section>;
        })}
        {hits && !hits.size && <p className="cur-muted fm-empty">맞는 기능이 없어요. 다른 말로 찾거나 베리에게 물어보세요.</p>}
      </div>
    </div>
  </div>;
}
