'use client';
import {useEffect, useRef, useState} from 'react';
import {Compass, LoaderCircle, RotateCcw, ShieldAlert, X} from 'lucide-react';
import {lockBodyScroll} from '@/lib/body-scroll-lock';
import {useVerifiedViewer} from '@/components/viewer-context';
import {createRegionQuestStorageSession, isRegionQuestFrameMessage} from './storage';
import styles from './launcher.module.css';

export default function RegionQuestBeta({embedded = false}: {embedded?: boolean}) {
  const {viewer} = useVerifiedViewer();
  const [open, setOpen] = useState(false);
  const [openedForUid, setOpenedForUid] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {setOpen(false);setOpenedForUid(null);setContent('');setError('');};

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const release = lockBodyScroll();
    element.showModal();
    return () => {element.close();release();trigger.current?.focus();};
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!viewer || viewer.role === 'student' || viewer.uid !== openedForUid) {close();return;}
    let session: ReturnType<typeof createRegionQuestStorageSession> | null = null;
    let storageFrame: Window | null = null;
    const onMessage = (event: MessageEvent) => {
      const target = frame.current?.contentWindow ?? null;
      if (!target || !isRegionQuestFrameMessage(event, target)) return;
      const message = event.data;
      if (message.type === 'region-quest-close') {close();return;}
      if (message.type === 'region-quest-load') {
        let result: ReturnType<ReturnType<typeof createRegionQuestStorageSession>['load']> = {state: null, available: false};
        try {
          if (!session || storageFrame !== target) {
            session = createRegionQuestStorageSession(window.localStorage, viewer.uid);
            storageFrame = target;
          }
          result = session.load();
        } catch {/* The game remains usable when storage is blocked. */}
        target.postMessage({type: 'region-quest-state', requestId: message.requestId, ...result}, '*');
      } else if (message.type === 'region-quest-save') {
        let ok = false;
        try {ok = storageFrame === target && session !== null && session.save(message.state);} catch {/* No cloud fallback. */}
        target.postMessage({type: 'region-quest-saved', requestId: message.requestId, ok}, '*');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, openedForUid, viewer?.uid, viewer?.role]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setContent('');setError('');
    void fetch('/api/region-quest/beta', {cache: 'no-store', credentials: 'same-origin', signal: controller.signal})
      .then(async response => {
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          window.dispatchEvent(new Event('homework-session-ended'));
          throw new Error('교사 또는 관리자 계정으로 다시 로그인해 주세요.');
        }
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('탐험을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        const html = await response.text();
        if (!controller.signal.aborted) setContent(html);
      })
      .catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '연결을 확인해 주세요.');});
    return () => controller.abort();
  }, [open, attempt]);

  return <>
    <button type="button" ref={trigger} className={embedded ? 'test-zone-item' : styles.launcher} onClick={() => {setOpenedForUid(viewer?.uid ?? null);setOpen(true);}} aria-haspopup="dialog" aria-expanded={open}>
      <Compass size={18} aria-hidden="true"/><span>우리동네 탐험</span>
    </button>
    {open && <dialog ref={dialog} className={styles.dialog} aria-labelledby="region-quest-beta-title" onCancel={event => {event.preventDefault();close();}} onClose={close}>
      <header className={styles.header}>
        <div><h2 id="region-quest-beta-title">우리동네 탐험 <small>베타</small></h2><p>교사·관리자 미리보기 · 애월 장난감 마을</p></div>
        <button type="button" className={styles.close} aria-label="우리동네 탐험 닫기" onClick={close} autoFocus><X size={20} aria-hidden="true"/><span>닫기</span></button>
      </header>
      <div className={styles.body} aria-busy={!content && !error}>
        {error ? <div className={styles.state} role="alert"><ShieldAlert size={28} aria-hidden="true"/><p>{error}</p><button type="button" onClick={() => setAttempt(n => n + 1)}><RotateCcw size={16} aria-hidden="true"/>다시 불러오기</button></div>
          : content ? <iframe ref={frame} title="우리동네 탐험 베타 — 애월 자유 탐험" srcDoc={content} sandbox="allow-scripts" referrerPolicy="no-referrer"/>
          : <div className={styles.state} role="status"><LoaderCircle size={28} aria-hidden="true"/><p>애월의 작은 마을을 준비하고 있어요.</p></div>}
      </div>
    </dialog>}
  </>;
}
