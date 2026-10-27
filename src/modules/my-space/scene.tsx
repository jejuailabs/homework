'use client';
import { useRef, useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { spaceItem, type Placement, type DiaryLayer } from './catalog';
function PrivatePicture({ src }: {
    src: string;
}) { const [failed, setFailed] = useState(false); useEffect(() => setFailed(false), [src]); return failed ? <span className="ms-missing-photo">사진을 다시 골라 주세요</span> : <img src={src} alt="내가 고른 사진" draggable={false} onError={() => setFailed(true)}/>; }
export function ItemArt({ id }: {
    id: string;
}) { const item = spaceItem(id); if (!item)
    return null; if (item.art)
    return <img src={item.previewArt || item.art} alt="" draggable={false}/>; if (item.kind === 'sticker')
    return item.motif === 'tape' ? <span className="ms-washi"/> : <span className="ms-sticker">{item.motif}</span>; return <span className={'ms-object ms-object-' + item.motif} style={{ background: item.color }}/>; }
export default function Scene({ layers, onChange, selected, onSelect, background, paper, children, disabled = false, diary = false, onGestureStart, onGestureEnd, selectionOnTop = false }: {
    layers: (Placement | DiaryLayer)[];
    onChange: (layers: any[]) => void;
    selected: string;
    onSelect: (id: string) => void;
    background?: string;
    paper?: string;
    children?: ReactNode;
    disabled?: boolean;
    diary?: boolean;
    onGestureStart?: () => void;
    onGestureEnd?: () => void;
    selectionOnTop?: boolean;
}) {
    const canvas = useRef<HTMLDivElement>(null), drag = useRef<{
        pointer: number;
        id: string;
        dx: number;
        dy: number;
    } | null>(null);
    const style = { ...(background ? { backgroundImage: `url("${background}")` } : {}), ...(paper ? { backgroundColor: spaceItem(paper)?.color } : {}) } as CSSProperties;
    return <div ref={canvas} className={`ms-scene ${diary ? 'ms-notebook' : ''} ${paper || ''}`} style={style} aria-label={diary ? '나의 다꾸 노트' : '나의 작은 방'} onPointerDown={e => { if (e.target === e.currentTarget)
        onSelect(''); }}>{layers.map((layer, i) => { const p = layer as DiaryLayer; return <div key={p.id} role="button" tabIndex={disabled ? -1 : 0} aria-label={`${p.kind === 'text' ? p.text || '글 조각' : spaceItem(p.itemId)?.name || '내 사진'} ${selected === p.id ? '선택됨' : ''}`} aria-pressed={selected === p.id} className={`ms-layer ${selected === p.id ? 'is-selected' : ''} ${p.kind === 'text' ? 'is-text' : ''}`} style={{ left: p.x + '%', top: p.y + '%', width: p.size + '%', transform: `translate(-50%,-50%) rotate(${p.rotation}deg) scaleX(${p.flip ? -1 : 1})`, zIndex: selectionOnTop && selected === p.id ? 100 : i + 2, color: p.color }} onClick={() => onSelect(p.id)} onPointerDown={e => { if (disabled)
        return; e.preventDefault(); e.stopPropagation(); onGestureStart?.(); onSelect(p.id); e.currentTarget.setPointerCapture(e.pointerId); const b = canvas.current!.getBoundingClientRect(); drag.current = { pointer: e.pointerId, id: p.id, dx: e.clientX - b.left - p.x * b.width / 100, dy: e.clientY - b.top - p.y * b.height / 100 }; }} onPointerMove={e => { const d = drag.current; if (disabled || !d || d.pointer !== e.pointerId || d.id !== p.id)
        return; const b = canvas.current!.getBoundingClientRect(); const x = Math.min(95, Math.max(5, (e.clientX - b.left - d.dx) / b.width * 100)), y = Math.min(95, Math.max(5, (e.clientY - b.top - d.dy) / b.height * 100)); onChange(layers.map(l => l.id === p.id ? { ...l, x, y } : l)); }} onPointerUp={() => { drag.current = null; onGestureEnd?.(); }} onPointerCancel={() => { drag.current = null; onGestureEnd?.(); }} onKeyDown={e => { if (disabled)
        return; const delta = e.shiftKey ? 5 : 1, dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0, dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0; if (dx || dy) {
        e.preventDefault();
        onChange(layers.map(l => l.id === p.id ? { ...l, x: Math.min(95, Math.max(5, l.x + dx)), y: Math.min(95, Math.max(5, l.y + dy)) } : l));
    } }}>{p.kind === 'text' ? <span>{p.text || '새로운 이야기'}</span> : p.kind === 'photo' ? <PrivatePicture src={'/api/my-space/images/' + p.assetId}/> : p.kind === 'art' ? <PrivatePicture src={'/api/my-space/art/' + p.assetId}/> : <ItemArt id={p.itemId}/>}</div>; })}{children}</div>;
}
