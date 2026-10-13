'use client';

import {useEffect, useRef, useState, type PointerEvent} from 'react';
import {useLocale} from 'next-intl';
import {Check, Eraser, Pencil, RotateCcw, Trash2, X} from 'lucide-react';

type Stroke = {color: string; width: number; points: [number, number][]};
const colors = ['#374c43', '#f08890', '#eeb445', '#79b794', '#78aadd', '#b899d0'];

export default function BoardDrawingPad({onAttach, onClose}: {onAttach: (file: File) => void; onClose: () => void}) {
  const ko = useLocale() === 'ko';
  const canvas = useRef<HTMLCanvasElement>(null), strokes = useRef<Stroke[]>([]), active = useRef<Stroke | null>(null);
  const [color, setColor] = useState(colors[0]), [width, setWidth] = useState(5), [eraser, setEraser] = useState(false), [count, setCount] = useState(0), [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function paint() {
    const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1000, 700);
    for (const stroke of [...strokes.current, ...(active.current ? [active.current] : [])]) {
      ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      stroke.points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0][0] + .1, stroke.points[0][1]);
      ctx.stroke();
    }
  }
  useEffect(() => {paint();}, []);
  function position(event: PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - rect.left) * 1000 / rect.width, (event.clientY - rect.top) * 700 / rect.height];
  }
  function finish() {
    if (!active.current) return;
    strokes.current.push(active.current); active.current = null; setCount(strokes.current.length); paint();
  }
  async function attach() {
    if (busy || !count) return;
    setBusy(true); setError('');
    canvas.current?.toBlob(blob => {
      if (!blob) {setError(ko ? '그림을 저장하지 못했어요. 다시 눌러 주세요.' : 'Could not save your drawing. Please try again.'); setBusy(false); return;}
      onAttach(new File([blob], 'my-drawing.png', {type: 'image/png'}));
      setBusy(false); onClose();
    }, 'image/png');
  }
  return <section className="pb-drawing" aria-label={ko ? '그림 그리기' : 'Draw a picture'}>
    <div className="pb-flex"><strong>{ko ? '그림으로 이야기해요' : 'Tell it with a drawing'}</strong><button type="button" className="pb-icon" onClick={onClose} disabled={busy} aria-label={ko ? '그림판 닫기' : 'Close drawing'}><X size={18}/></button></div>
    <div className="pb-drawing-tools">
      {colors.map((value, index) => <button type="button" key={value} aria-label={`${ko ? '색상' : 'Color'} ${index + 1}`} aria-pressed={color === value && !eraser} style={{background: value, outline: color === value && !eraser ? '3px solid var(--accent)' : undefined}} onClick={() => {setColor(value); setEraser(false);}}/>)}
      <button type="button" aria-label={ko ? '지우개' : 'Eraser'} aria-pressed={eraser} onClick={() => setEraser(value => !value)}>{eraser ? <Eraser size={18}/> : <Pencil size={18}/>}</button>
      <select aria-label={ko ? '펜 굵기' : 'Brush size'} value={width} onChange={event => setWidth(Number(event.target.value))}><option value={5}>{ko ? '가는 펜' : 'Fine'}</option><option value={12}>{ko ? '굵은 펜' : 'Bold'}</option><option value={24}>{ko ? '붓' : 'Brush'}</option></select>
      <button type="button" disabled={!count || busy} aria-label={ko ? '마지막 선 되돌리기' : 'Undo stroke'} onClick={() => {strokes.current.pop(); setCount(strokes.current.length); paint();}}><RotateCcw size={18}/></button>
      <button type="button" disabled={!count || busy} aria-label={ko ? '그림 모두 지우기' : 'Clear drawing'} onClick={() => {if (window.confirm(ko ? '그린 내용을 모두 지울까요?' : 'Clear this drawing?')) {strokes.current = []; setCount(0); paint();}}}><Trash2 size={18}/></button>
    </div>
    <canvas ref={canvas} width={1000} height={700} aria-label={ko ? '손가락이나 마우스로 그리는 영역' : 'Draw with a finger or mouse'} style={{width: '100%', aspectRatio: '10 / 7', background: '#fff', borderRadius: 14, touchAction: 'none', border: '1px solid var(--border)'}} onPointerDown={event => {if (busy) return; event.currentTarget.setPointerCapture(event.pointerId); active.current = {color: eraser ? '#ffffff' : color, width: eraser ? width * 4 : width, points: [position(event)]}; paint();}} onPointerMove={event => {if (active.current) {active.current.points.push(position(event)); paint();}}} onPointerUp={finish} onPointerCancel={finish}/>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="pb-button primary" disabled={!count || busy} onClick={() => void attach()}><Check size={17}/>{ko ? '그림 첨부하기' : 'Attach drawing'}</button>
  </section>;
}
