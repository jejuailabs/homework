'use client';
import {clearClassMetadata} from '@/lib/class-metadata-cache';
import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import Link from 'next/link';
import {onAuthStateChanged} from 'firebase/auth';
import {ExternalLink, Maximize2, Minimize2, Minus, Plus, X} from 'lucide-react';
import {auth} from '@/lib/firebase-client';
import {toolCatalog} from '@/lib/tool-catalog';
import type {ClassroomRosterEntry} from './classroom-shared';
import ToolRunner from './tool-runner';
import '@/styles/tool-windows.css';
import '@/styles/tools.css';

export type ToolWindowContext = {uid: string; classId: string; className: string; roster: ClassroomRosterEntry[]};
type ToolWindow = {id: string; toolId: string; context: ToolWindowContext; slot: number; minimized: boolean; maximized: boolean; x: number; y: number; order: number};
type WindowActions = {open: (toolId: string, context: ToolWindowContext) => void};
const WindowContext = createContext<WindowActions | null>(null);
export const useToolWindows = () => useContext(WindowContext);
export default function ToolWindowsProvider({children}: {children: ReactNode}) {
  const locale = useLocale() === 'en' ? 'en' : 'ko', en = locale === 'en';
  const [windows, setWindows] = useState<ToolWindow[]>([]), [mobile, setMobile] = useState(false), [notice, setNotice] = useState('');
  const order = useRef(1), authUid = useRef<string | null | undefined>(undefined);
  useEffect(() => {const media = matchMedia('(max-width:700px)'); const update = () => setMobile(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update);}, []);
  useEffect(() => onAuthStateChanged(auth, user => {if (authUid.current !== undefined && authUid.current !== (user?.uid || null)) {setWindows([]);clearClassMetadata(true);} authUid.current = user?.uid || null;}), []);
  useEffect(() => {const clear = () => setWindows([]); window.addEventListener('homework-session-ended', clear); return () => window.removeEventListener('homework-session-ended', clear);}, []);
  const open = useCallback((toolId: string, context: ToolWindowContext) => {
    if (!context.uid || !toolCatalog.some(tool => tool.id === toolId)) return;
    const id = crypto.randomUUID(), nextOrder = ++order.current;
    setWindows(previous => {
      const mine = previous.filter(win => win.context.uid === context.uid);
      let slot = 1; while (mine.some(win => win.toolId === toolId && win.context.classId === context.classId && win.slot === slot)) slot++;
      const offset = mine.length % 5 * 24;
      return [...mine, {id, toolId, context: {...context, roster: [...context.roster]}, slot, minimized: false, maximized: toolId==='canvas', x: Math.max(8, Math.min(innerWidth - (toolId==='canvas'?1120:680) - 12, 110 + offset)), y: 96 + offset, order: nextOrder}];
    });
  }, []);
  function patch(id: string, changes: Partial<ToolWindow>) {setWindows(old => old.map(win => win.id === id ? {...win, ...changes} : win));}
  function activate(id: string) {patch(id, {minimized: false, order: ++order.current});}
  const active = windows.filter(win => !win.minimized).sort((a,b) => b.order - a.order)[0]?.id;
  function external(win: ToolWindow) {
    const url = new URL(`/teacher/tools/${win.toolId}`, location.origin); url.searchParams.set('classId', win.context.classId); url.searchParams.set('instance', `${win.slot}-external-${Date.now()}`);
    const popup = window.open(url, '_blank', 'popup,width=900,height=760,noopener,noreferrer');
    // noopener browsers may return null even when a window opens; offer a normal link either way.
    if (!popup) setNotice(en ? 'A new window was requested. If it did not open, allow pop-ups or use the link below.' : '새 창을 요청했어요. 열리지 않았다면 팝업을 허용하거나 아래 링크를 눌러 주세요.');
  }
  return <WindowContext.Provider value={{open}}>{children}
    {windows.map(win => {const tool = toolCatalog.find(tool => tool.id === win.toolId)!;return <FloatingTool key={win.id} win={win} mobile={mobile} visible={!win.minimized && (!mobile || active === win.id)} title={`${tool[locale]}${win.slot > 1 ? ` ${win.slot}` : ''}`} en={en} activate={() => {if (active !== win.id) activate(win.id);}} patch={changes => patch(win.id, changes)} close={() => setWindows(old => old.filter(value => value.id !== win.id))} duplicate={() => open(win.toolId,win.context)} external={() => external(win)}>
      <ToolRunner tool={tool} locale={locale} classId={win.context.classId} uid={win.context.uid} roster={win.context.roster} instance={String(win.slot)}/>
    </FloatingTool>;})}
    {!!windows.length && <nav className="tool-taskbar" hidden={windows.some(w=>w.id===active&&w.maximized&&!w.minimized)} aria-label={en ? 'Running tools' : '실행 중인 도구'}><Link className="button" href="/teacher/tools" onClick={() => setWindows(old => old.map(win => ({...win,minimized:true})))}>＋ {en ? 'Add tool' : '도구 열기'}</Link>{windows.map(win => {const tool = toolCatalog.find(tool => tool.id === win.toolId)!;return <button type="button" key={win.id} aria-pressed={!win.minimized && active === win.id} onClick={() => activate(win.id)}>{win.minimized ? '○' : '●'} {tool[locale]}{win.slot > 1 ? ` ${win.slot}` : ''}</button>;})}<button type="button" onClick={() => setWindows(old => old.map(win => ({...win,minimized:true})))}>{en ? 'Minimize all' : '모두 접기'}</button></nav>}
    {notice && <aside className="tool-window-notice" role="status"><p>{notice}</p><a href={windows.length ? `/teacher/tools/${windows.at(-1)!.toolId}` : '/teacher/tools'} target="_blank" rel="noopener noreferrer">{en ? 'Open tool in a new tab' : '새 탭으로 도구 열기'}</a><button type="button" onClick={() => setNotice('')} aria-label={en ? 'Close' : '닫기'}><X size={16}/></button></aside>}
  </WindowContext.Provider>;
}
export function FloatingTool({win, mobile, visible, title, en, children, activate, patch, close, duplicate, external}: {win: ToolWindow; mobile: boolean; visible: boolean; title: string; en: boolean; children: ReactNode; activate: () => void; patch: (changes: Partial<ToolWindow>) => void; close: () => void; duplicate: () => void; external: () => void}) {
  const root = useRef<HTMLElement>(null), drag = useRef<{id: number; dx: number; dy: number} | null>(null);
  useEffect(() => {if (visible) root.current?.focus({preventScroll: true});}, [visible]);
  return <section ref={root} role="dialog" aria-modal="false" aria-labelledby={`tool-window-${win.id}`} tabIndex={-1} className={`tool-floating-window${win.maximized ? ' is-maximized' : ''}`} data-tool={win.toolId} data-instance={win.slot} style={{display: visible ? undefined : 'none', left: win.x, top: win.y, zIndex: 100 + win.order}} onPointerDownCapture={activate}>
    <header className="tool-window-titlebar" onDoubleClick={event=>{if(!(event.target as HTMLElement).closest('button'))patch({maximized:!win.maximized});}} onPointerDown={event => {if (mobile || win.maximized || (event.target as HTMLElement).closest('button')) return; const rect = root.current!.getBoundingClientRect(); drag.current = {id:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top}; event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event => {if (drag.current?.id !== event.pointerId) return;const width=root.current!.getBoundingClientRect().width;patch({x:Math.max(0,Math.min(innerWidth-width,event.clientX-drag.current.dx)),y:Math.max(0,Math.min(innerHeight-110,event.clientY-drag.current.dy))});}} onPointerUp={() => {drag.current=null;}} onPointerCancel={() => {drag.current=null;}} onLostPointerCapture={() => {drag.current=null;}}>
      <div><strong id={`tool-window-${win.id}`}>{title}</strong><small>{win.context.className || (en ? 'Manual input' : '직접 입력')}</small></div><div className="tool-window-controls"><button type="button" onClick={duplicate} aria-label={en ? 'Open another instance' : '같은 도구 하나 더 열기'} title={en ? 'Open another instance' : '같은 도구 하나 더 열기'}><Plus size={15}/></button><button type="button" onClick={external} aria-label={en ? 'Open a new browser window' : '새 브라우저 창에서 열기'}><ExternalLink size={15}/></button><button type="button" onClick={() => patch({minimized:true})} aria-label={en ? 'Minimize' : '최소화'}><Minus size={16}/></button><button type="button" onClick={() => patch({maximized:!win.maximized})} aria-label={en?(win.maximized?'Restore window':'Fill screen'):(win.maximized?'이전 창 크기로':'화면 가득 확대')} title={en?(win.maximized?'Restore window':'Fill screen'):(win.maximized?'이전 창 크기로':'화면 가득 확대')}>{win.maximized ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</button><button type="button" onClick={close} aria-label={en ? 'Close tool' : '도구 닫기'}><X size={17}/></button></div>
    </header><div className="tool-window-body">{children}</div>
  </section>;
}

