'use client';
import {useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent} from 'react';
import {Pipette, Plus, X} from 'lucide-react';
import {hexFromRgb, rgbFromHex} from './raster';

/** Paint dish: the current colour, recent colours and a popover mixer (hue ring + shade square). */
const BASE = ['#1f2328', '#ffffff', '#e5484d', '#f76b15', '#ffc53d', '#8ec641', '#2e9e6a', '#3e9fd8', '#3d63dd', '#8e4ec6', '#e93d82', '#a1662f', '#f5c4a1', '#8b8d98'];

function hsv(hex: string) {
  const [r, g, b] = rgbFromHex(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return {h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max};
}
function fromHsv(h: number, s: number, v: number) {
  const f = (n: number) => {const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));};
  return hexFromRgb([f(5) * 255, f(3) * 255, f(1) * 255]);
}

export default function ColorDish({color, recent, onColor, onPick, picking, w}: {color: string; recent: string[]; onColor: (color: string, commit?: boolean) => void; onPick: () => void; picking: boolean; w: (ko: string, en: string) => string}) {
  const [open, setOpen] = useState(false);
  return <div className="sb-dish">
    <div className="sb-dish-row">
      <button type="button" className="sb-dish-current" style={{'--sb-color': color} as CSSProperties} aria-label={w(`지금 색 ${color}, 색 섞기 열기`, `Current colour ${color}, open mixer`)} aria-expanded={open} onClick={() => setOpen(v => !v)}><span/></button>
      <div className="sb-dish-recent" role="group" aria-label={w('최근 쓴 색', 'Recent colours')}>
        {recent.map(c => <button type="button" key={c} style={{background: c}} aria-label={c} aria-pressed={c === color} onClick={() => onColor(c, true)}/>)}
      </div>
      <button type="button" className="sb-mini" aria-pressed={picking} onClick={onPick} title={w('그림에서 색 고르기', 'Pick from the page')} aria-label={w('그림에서 색 고르기', 'Pick from the page')}><Pipette size={16}/></button>
      <button type="button" className="sb-mini" onClick={() => setOpen(v => !v)} aria-label={w('색 섞기', 'Mix a colour')}><Plus size={16}/></button>
    </div>
    {open && <Mixer color={color} onColor={onColor} onClose={() => setOpen(false)} w={w}/>}
  </div>;
}

function Mixer({color, onColor, onClose, w}: {color: string; onColor: (color: string, commit?: boolean) => void; onClose: () => void; w: (ko: string, en: string) => string}) {
  const ring = useRef<HTMLCanvasElement>(null), [state, setState] = useState(() => hsv(color)), [hex, setHex] = useState(color);
  useEffect(() => {setHex(color);}, [color]);
  useEffect(() => {
    const canvas = ring.current, ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
    const size = canvas.width, c = size / 2, image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy); if (d > c || d < c * 0.72) continue;
      const [r, g, b] = rgbFromHex(fromHsv((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, 1, 1)), i = (y * size + x) * 4;
      image.data.set([r, g, b, 255], i);
    }
    ctx.putImageData(image, 0, 0);
  }, []);
  const set = (next: {h: number; s: number; v: number}, commit = false) => {setState(next); onColor(fromHsv(next.h, next.s, next.v), commit);};
  const dragRing = (event: ReactPointerEvent<HTMLCanvasElement>, commit = false) => {
    const rect = event.currentTarget.getBoundingClientRect(), dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
    set({...state, h: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, s: state.s || 0.8, v: state.v || 0.8}, commit);
  };
  const dragSquare = (event: ReactPointerEvent<HTMLDivElement>, commit = false) => {
    const rect = event.currentTarget.getBoundingClientRect(), s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), v = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    set({...state, s, v}, commit);
  };
  return <div className="sb-mixer" role="dialog" aria-label={w('색 섞기', 'Colour mixer')}>
    <div className="sb-mixer-head"><strong>{w('색 섞기', 'Mix a colour')}</strong><button type="button" className="sb-mini" onClick={onClose} aria-label={w('닫기', 'Close')}><X size={16}/></button></div>
    <div className="sb-mixer-wheel">
      <canvas ref={ring} width={220} height={220} onPointerDown={event => {event.currentTarget.setPointerCapture(event.pointerId); dragRing(event);}} onPointerMove={event => {if (event.buttons) dragRing(event);}} onPointerUp={event => dragRing(event, true)} aria-label={w('색상 고리', 'Hue ring')}/>
      <span className="sb-mixer-hue" style={{transform: `rotate(${state.h}deg) translateX(98px)`}}/>
      <div className="sb-mixer-square" style={{background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,${fromHsv(state.h, 1, 1)})`}} onPointerDown={event => {event.currentTarget.setPointerCapture(event.pointerId); dragSquare(event);}} onPointerMove={event => {if (event.buttons) dragSquare(event);}} onPointerUp={event => dragSquare(event, true)} aria-label={w('밝기와 진하기', 'Shade')}>
        <span style={{left: `${state.s * 100}%`, top: `${(1 - state.v) * 100}%`}}/>
      </div>
    </div>
    <div className="sb-mixer-base">{BASE.map(c => <button type="button" key={c} style={{background: c}} aria-label={c} aria-pressed={c === color} onClick={() => {setState(hsv(c)); onColor(c, true);}}/>)}</div>
    <label className="sb-mixer-hex"><span>{w('색 번호', 'Hex')}</span><input value={hex} maxLength={7} onChange={event => {setHex(event.target.value); if (/^#[0-9a-f]{6}$/i.test(event.target.value)) {setState(hsv(event.target.value)); onColor(event.target.value.toLowerCase(), true);}}}/></label>
  </div>;
}
