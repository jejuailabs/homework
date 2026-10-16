'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowDown, ArrowLeft, ArrowRight, ArrowUp} from 'lucide-react';
export default function WorldJoystick({disabled, english, onMove}: {disabled: boolean; english: boolean; onMove: (x: number, y: number) => void}) {
  const pointer = useRef<number | null>(null), keys = useRef(new Set<string>());
  const [knob, setKnob] = useState({x: 0, y: 0});
  const stop = useCallback(() => {pointer.current = null; keys.current.clear(); setKnob({x: 0, y: 0}); onMove(0, 0);}, [onMove]);
  useEffect(() => {if (disabled) stop();}, [disabled, stop]);
  useEffect(() => {const visibility = () => {if (document.hidden) stop();}; window.addEventListener('blur', stop); document.addEventListener('visibilitychange', visibility); return () => {window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility); onMove(0, 0);};}, [stop, onMove]);
  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect(), radius = rect.width * .28;
    const x = (event.clientX - rect.left - rect.width / 2) / radius, y = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(x, y), capped = Math.min(1, length);
    const nx = length ? x / length : 0, ny = length ? y / length : 0;
    setKnob({x: nx * capped * radius, y: ny * capped * radius});
    const speed = capped <= .12 ? 0 : (capped - .12) / .88;
    onMove(nx * speed, ny * speed);
  }
  function keyboard(event: React.KeyboardEvent<HTMLButtonElement>, down: boolean) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (down) keys.current.add(event.key); else keys.current.delete(event.key);
    const pressed = (a: string, b: string) => Number(keys.current.has(a) || keys.current.has(b));
    const x = pressed('ArrowRight', 'd') - pressed('ArrowLeft', 'a'), y = pressed('ArrowDown', 's') - pressed('ArrowUp', 'w');
    const length = Math.max(1, Math.hypot(x, y)); setKnob({x: x / length * 30, y: y / length * 30}); onMove(x / length, y / length);
  }
  return <button type="button" className="ex-world-joystick" disabled={disabled} aria-label={english ? 'Movement joystick · drag to walk; arrow keys also work' : '이동 조이스틱 · 원하는 방향으로 끌어 걷기 · 방향키도 가능'} onPointerDown={event => {if (pointer.current !== null) return; event.preventDefault(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); move(event);}} onPointerMove={event => {if (pointer.current === event.pointerId) move(event);}} onPointerUp={event => {if (pointer.current === event.pointerId) {if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); stop();}}} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop} onKeyDown={event => keyboard(event, true)} onKeyUp={event => keyboard(event, false)}>
    <ArrowUp className="ex-stick-up" size={14}/><ArrowDown className="ex-stick-down" size={14}/><ArrowLeft className="ex-stick-left" size={14}/><ArrowRight className="ex-stick-right" size={14}/><span className="ex-stick-knob" style={{transform: `translate(${knob.x}px,${knob.y}px)`}} aria-hidden="true">🐾</span>
  </button>;
}
