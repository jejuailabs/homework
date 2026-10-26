'use client';
import {lockBodyScroll} from '@/lib/body-scroll-lock';
import {useEffect, useRef, useState} from 'react';
import {FlaskConical, LoaderCircle, RotateCcw, ShieldAlert, X} from 'lucide-react';
import {useVerifiedViewer} from './viewer-context';
import {createJourneyStorageSession, isJourneyFrameMessage, type JourneyStorageResult} from '@/modules/learning-king/journey-storage';

export default function LearningKingBeta() {
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
    const releaseScroll = lockBodyScroll();
    element.showModal();
    return () => {
      element.close();
      releaseScroll();
      trigger.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!viewer || viewer.role === 'student' || viewer.uid !== openedForUid) {
      close();
      return;
    }
    let storageSession: ReturnType<typeof createJourneyStorageSession> | null = null;
    let storageFrame: Window | null = null;
    const onMessage = (event: MessageEvent) => {
      const target = frame.current?.contentWindow ?? null;
      if (!isJourneyFrameMessage(event, target) || !target) return;
      if (event.data.type === 'learning-king-beta-close') {
        close();
      } else if (event.data.type === 'learning-king-journey-load') {
        let result: JourneyStorageResult = {state: null, available: false};
        try {
          if (!storageSession || storageFrame !== target) {
            storageSession = createJourneyStorageSession(window.localStorage, viewer.uid);
            storageFrame = target;
          }
          result = storageSession.load();
        } catch {/* Browser storage may be disabled. */}
        target.postMessage({type: 'learning-king-journey-state', ...result}, '*');
      } else if (event.data.type === 'learning-king-journey-save') {
        let ok = false;
        try {ok = storageFrame === target && storageSession !== null && storageSession.save(event.data.state);} catch {/* Stay usable in memory when storage is blocked. */}
        target.postMessage({type: 'learning-king-journey-saved', ok}, '*');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, openedForUid, viewer?.uid, viewer?.role]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setContent('');setError('');
    void fetch('/api/learning-king-beta', {cache: 'no-store', credentials: 'same-origin', signal: controller.signal})
      .then(async response => {
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          window.dispatchEvent(new Event('homework-session-ended'));
          throw new Error('교사 또는 관리자 계정으로 다시 로그인해 주세요.');
        }
        if (!response.ok) throw new Error('미리보기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('미리보기 화면을 확인하지 못했어요. 다시 시도해 주세요.');
        const html = await response.text();
        if (!controller.signal.aborted) setContent(html);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '연결을 확인하고 다시 시도해 주세요.');
      });
    return () => controller.abort();
  }, [open, attempt]);

  return <>
    <button type="button" ref={trigger} className="learning-king-beta-launcher" onClick={() => {setOpenedForUid(viewer?.uid ?? null);setOpen(true);}} aria-haspopup="dialog" aria-expanded={open}>
      <FlaskConical size={17} aria-hidden="true"/><span>학습왕 베타</span>
    </button>
    {open && <dialog ref={dialog} className="learning-king-beta-dialog" aria-labelledby="learning-king-beta-title" aria-describedby="learning-king-beta-description" onCancel={event => {event.preventDefault();close();}} onClose={close}>
      <header className="learning-king-beta-header">
        <div><h2 id="learning-king-beta-title">학습왕 베타</h2><p id="learning-king-beta-description">교사·관리자 미리보기 · 수학 여행과 랭킹 예시</p></div>
        <button type="button" className="learning-king-beta-close" aria-label="학습왕 베타 닫기" onClick={close} autoFocus><X size={20} aria-hidden="true"/><span>닫기</span></button>
      </header>
      <div className="learning-king-beta-body" aria-busy={!content && !error}>
        {error ? <div className="learning-king-beta-state" role="alert"><ShieldAlert size={28} aria-hidden="true"/><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}><RotateCcw size={16} aria-hidden="true"/>다시 불러오기</button></div>
          : content ? <iframe ref={frame} title="학습왕 베타 랭킹 대시보드와 혼자 도전" srcDoc={content} sandbox="allow-scripts" referrerPolicy="no-referrer"/>
          : <div className="learning-king-beta-state" role="status"><LoaderCircle className="spin" size={28} aria-hidden="true"/><p>학습왕 베타를 준비하고 있어요.</p></div>}
      </div>
    </dialog>}
  </>;
}
