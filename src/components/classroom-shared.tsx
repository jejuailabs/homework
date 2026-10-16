'use client';

import {createContext, useContext, useEffect, useRef, useState, type ReactNode, type SetStateAction} from 'react';

export type ClassroomRosterEntry = {id: string; name: string; number?: number};
export const ClassroomContext = createContext<{en: boolean; scope?: string; roster?: ClassroomRosterEntry[]}>({en: false});
export const useClassroom = () => useContext(ClassroomContext);
export const useWords = () => { const {en} = useClassroom(); return (ko: string, english: string) => en ? english : ko; };

/** No shared anonymous storage: the caller must supply the signed-in user's scope. */
export function useClassroomSaved<T>(key: string, initial: T, valid?: (value: unknown) => value is T): [T, (value: SetStateAction<T>) => void] {
  const {scope} = useClassroom();
  const initialRef = useRef(initial);
  const validRef = useRef(valid);
  const [record, setRecord] = useState({value: initialRef.current, ready: false});
  const storageKey = scope ? `homework:classroom:v1:${encodeURIComponent(scope)}:${key}` : null;
  useEffect(() => {
    let value = initialRef.current;
    if (storageKey) try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) {
        const candidate: unknown = JSON.parse(raw);
        if (validRef.current ? validRef.current(candidate) : typeof candidate === typeof initialRef.current && candidate !== null && Array.isArray(candidate) === Array.isArray(initialRef.current)) value = candidate as T;
      }
    } catch { /* Storage restrictions and malformed local data must not stop a lesson. */ }
    setRecord({value, ready: true});
  }, [storageKey]);
  useEffect(() => {
    if (!record.ready || !storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(record.value)); } catch { /* Quota or private browsing: continue in memory. */ }
  }, [record, storageKey]);
  return [record.value, value => setRecord(previous => ({ready: previous.ready, value: typeof value === 'function' ? (value as (old: T) => T)(previous.value) : value}))];
}

export function ToolField({title, children, hint}: {title: string; children: ReactNode; hint?: string}) {
  return <label className="classroom-field"><span>{title}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function ToolHint({children}: {children: ReactNode}) { return <p className="classroom-hint">{children}</p>; }
export function ToolActions({children}: {children: ReactNode}) { return <div className="classroom-actions">{children}</div>; }
export function ToolButton({children, onClick, primary, disabled, title}: {children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean; title?: string}) {
  return <button type="button" className={'button' + (primary ? ' primary' : '')} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}
export function Participants({value, onChange, max = 100}: {value: string; onChange: (value: string) => void; max?: number}) {
  const w = useWords(); const {roster} = useClassroom();
  return <div><ToolField title={w('참여자 · 한 줄에 한 명', 'Participants · one per line')} hint={w(`최대 ${max}명. 번호를 함께 쓰면 같은 이름도 구분할 수 있어요.`, `Up to ${max}. Add a number to distinguish identical names.`)}><textarea value={value} onChange={event => onChange(event.target.value)} rows={5} maxLength={10000}/></ToolField>{!!roster?.length && <ToolButton onClick={() => onChange(roster.slice(0, max).map(person => `${person.number ? `${person.number}. ` : ''}${person.name}`).join('\n'))}>{w('학급 명단 가져오기', 'Use class roster')}</ToolButton>}</div>;
}
export function downloadClassroomFile(contents: BlobPart, name: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function useClassroomAudio() {
  const context = useRef<AudioContext | null>(null);
  useEffect(() => () => { void context.current?.close().catch(() => {}); context.current = null; }, []);
  async function play(pattern: 'bell' | 'success' | 'start' | 'attention' | 'drum' | 'sparkle' = 'bell', volume = .4) {
    try {
      if (!context.current || context.current.state === 'closed') context.current = new AudioContext();
      const audio = context.current;
      if (audio.state === 'suspended') await audio.resume();
      const patterns = {bell: [784, 659, 523], success: [523, 659, 784, 1047], start: [392, 523, 784], attention: [660, 660, 880], drum: [100, 80, 120, 70], sparkle: [1047, 1319, 1568, 2093]};
      patterns[pattern].forEach((frequency, index) => {
        const oscillator = audio.createOscillator(); const gain = audio.createGain();
        const start = audio.currentTime + index * .18;
        oscillator.type = pattern === 'drum' ? 'triangle' : 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(Math.min(.7, Math.max(0, volume)) * .3, start + .01); gain.gain.exponentialRampToValueAtTime(.001, start + .42);
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .45);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Sound is optional, visual status remains available. */ }
  }
  async function unlock() { try { if (!context.current || context.current.state === 'closed') context.current = new AudioContext(); await context.current.resume(); } catch {} }
  async function stop() { const current = context.current; context.current = null; if (current) await current.close().catch(() => {}); }
  return {play, unlock, stop};
}
