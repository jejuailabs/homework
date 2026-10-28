'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowRight, BookHeart, LockKeyhole, ShieldCheck, X} from 'lucide-react';
import type {DiaryPage} from './catalog';
import DiaryEditor from './diary-editor';
import DiaryCalendar from './diary-calendar-view';
import {diaryRequest, DiaryRequestError, type DiaryStatus} from './diary-client';
import {diaryToday} from './diary-calendar';
import './diary.css';
type Exit = () => Promise<boolean>;
const blankStatus: DiaryStatus = {available: true, configured: true, unlocked: false};
const problem = (error: unknown) => error instanceof Error ? error.message : '다시 시도해 주세요.';

export default function Diary({owned, registerBeforeLeave}: {owned: string[]; enabled?: boolean; registerBeforeLeave?: (fn: Exit | null) => void}) {
  const [status, setStatus] = useState<DiaryStatus | null>(null), [selected, setSelected] = useState<DiaryPage | null>(null);
  const [calendarMonth,setCalendarMonth]=useState(()=>diaryToday().slice(0,7));
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [curtain, setCurtain] = useState(false);
  const [pin, setPin] = useState(''), [confirmation, setConfirmation] = useState(''), [recover, setRecover] = useState(false), [ticket, setTicket] = useState(''), [claim, setClaim] = useState(false);
  const saveBeforeLeave = useRef<Exit | null>(null), statusRef = useRef(status), inLock = useRef(false), dirty = useRef(false);
  const exportJob=useRef<AbortController|null>(null);
  statusRef.current = status;
  const registerSave = useCallback((fn: Exit | null) => {saveBeforeLeave.current = fn;}, []);
  const markDirty = useCallback((value: boolean) => {dirty.current = value;}, []);
  const lock = useCallback(async (automatic = false): Promise<boolean> => {
    if (inLock.current) return false;
    inLock.current = true;
    exportJob.current?.abort();
    if (automatic) setCurtain(true);
    try {
      const saved = await saveBeforeLeave.current?.() ?? true;
      if (!saved && !automatic) return false;
      await diaryRequest('/lock', 'POST', {});
      setStatus(current => ({...(current || blankStatus), unlocked: false}));
      if (saved) setSelected(null);
      else setNotice('저장하지 못한 글이 이 화면에 남아 있어요. 잠금을 다시 열고 저장해 주세요.');
      setPin(''); setCurtain(false); return saved;
    } catch (e) {
      setError(problem(e));
      if (automatic) {setStatus(current => ({...(current || blankStatus), unlocked: false})); setNotice('화면을 잠갔어요. 연결이 돌아오면 다시 열고 저장해 주세요.'); setCurtain(false);}
      return false;
    } finally {inLock.current = false;}
  }, []);
  useEffect(() => {let alive = true; void diaryRequest<DiaryStatus>('/status').then(value => {if (alive) {setStatus(value);if(value.unlocked&&document.visibilityState==='hidden'){statusRef.current=value;void lock(true);}}}).catch(e => {if (alive) setError(problem(e));}); return () => {alive = false;};}, [lock]);
  useEffect(() => {registerBeforeLeave?.(() => statusRef.current?.unlocked ? lock() : Promise.resolve(!dirty.current)); return () => registerBeforeLeave?.(null);}, [lock, registerBeforeLeave]);
  useEffect(()=>()=>{exportJob.current?.abort();if(statusRef.current?.unlocked)void fetch('/api/secret-diary/lock',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});},[]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const activity = () => {clearTimeout(timer); if (statusRef.current?.unlocked) timer = setTimeout(() => void lock(true), 5 * 60 * 1000);};
    const hidden = () => {if (document.visibilityState === 'hidden' && statusRef.current?.unlocked) void lock(true);};
    const ended = () => {exportJob.current?.abort();setSelected(null); setStatus({...blankStatus, unlocked: false}); setPin(''); dirty.current = false;};
    const pageHide = () => {if (statusRef.current?.unlocked) void fetch('/api/secret-diary/lock', {method: 'POST', credentials: 'same-origin', keepalive: true, headers: {'Content-Type': 'application/json'}, body: '{}'}).catch(() => {});};
    window.addEventListener('pointerdown', activity, true); window.addEventListener('keydown', activity, true); window.addEventListener('input', activity, true); document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pageHide); window.addEventListener('homework-session-ended', ended); activity();
    return () => {clearTimeout(timer); window.removeEventListener('pointerdown', activity, true); window.removeEventListener('keydown', activity, true); window.removeEventListener('input', activity, true); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pageHide); window.removeEventListener('homework-session-ended', ended);};
  }, [lock, status?.unlocked]);
  async function unlock() {
    if (busy) return;
    if (!/^\d{6}$/.test(pin)) {setError('숫자 6자리로 입력해 주세요.'); return;}
    if (!claim && (!status?.configured || recover) && pin !== confirmation) {setError('잠금번호 두 개가 같아야 해요.'); return;}
    setBusy(true); setError('');
    try {
      await diaryRequest(claim ? '/transfer/claim' : recover ? '/recover' : status?.configured ? '/unlock' : '/setup', 'POST', claim ? {token: ticket.trim(), pin} : recover ? {ticket: ticket.trim(), pin} : {pin});
      const value = await diaryRequest<DiaryStatus>('/status'); setStatus(value); setPin(''); setConfirmation(''); setTicket(''); setRecover(false); setClaim(false); if(document.visibilityState==='hidden'){statusRef.current=value;await lock(true);}else setCurtain(false);
      if (value.recoveredAt) setNotice('잠금번호를 다시 설정한 기록이 있어요. 일기는 그대로 보관되어 있어요.');
    } catch (e) {setError(problem(e));} finally {setBusy(false);}
  }
  async function requestRecovery() {
    setBusy(true); setError('');
    try {await diaryRequest('/recovery-request', 'POST', {}); setStatus(current => ({...(current || blankStatus), recoveryPending: true})); setRecover(true); setNotice('복구 요청을 보냈어요. 운영 담당자가 본인을 확인한 뒤 알려주는 복구 코드를 입력해 주세요.');}
    catch (e) {setError(problem(e));} finally {setBusy(false);}
  }
  async function save(page: DiaryPage) {
    try {const saved=(await diaryRequest<{page: DiaryPage}>('/pages/' + page.id, 'PUT', {...page, schemaVersion: 2})).page;setCalendarMonth(saved.date.slice(0,7));return saved;}
    catch (e) {if (e instanceof DiaryRequestError && [401, 423].includes(e.status)) {setStatus(current => ({...(current || blankStatus), unlocked: false})); setNotice('잠금을 다시 열면 쓰던 글을 이어서 저장할 수 있어요.');} throw e;}
  }
  function newPage(date = diaryToday()) {setError(''); setSelected({id: crypto.randomUUID(), schemaVersion: 2, version: 0, date, title: '오늘의 작은 이야기', paper: 'paper-cream', mood: '', layers: [], updatedAt: ''});}
  const locked = !status?.unlocked || curtain, allOwned = [...new Set([...owned, ...(status?.owned || [])])];
  return <section className="sd-diary" aria-label="나만의 비밀일기장">
    {error && <p className="sd-message sd-error" role="alert">{error}<button type="button" aria-label="오류 안내 닫기" onClick={() => setError('')}><X size={14}/></button></p>}
    {notice && <p className="sd-message" role="status">{notice}<button type="button" aria-label="안내 닫기" onClick={() => setNotice('')}><X size={14}/></button></p>}
    {!status ? <div className="sd-loading"><BookHeart size={36}/><p>일기장을 꺼내고 있어요…</p>{error && <button onClick={() => void diaryRequest<DiaryStatus>('/status').then(setStatus).catch(e => setError(problem(e)))}>다시 열기</button>}</div> : locked ? <div className="sd-lock-screen">
      <div className="sd-lock-book"><img src="/diary/v1/diary-rabbit.svg" alt=""/><span>MY LITTLE DIARY</span><h2>나만의<br/>비밀일기장</h2><LockKeyhole size={28}/></div>
      <div className="sd-lock-form"><span className="sd-eyebrow">마음을 놓고, 나답게</span><h2>{!status.available ? '일기장을 준비하고 있어요' : recover ? '일기장을 다시 열어요' : status.configured ? '오늘은 어떤 하루였나요?' : '우리만의 잠금번호를 정해요'}</h2>
      {!status.available ? <p>안전한 보관 설정을 준비 중이에요. 기존 기록은 그대로 남아 있어요. 운영 담당자에게 알려 주세요.</p> : <>
        <p>{recover ? '담당자에게 받은 복구 코드와 새 잠금번호를 입력해요. 이전 일기는 사라지지 않아요.' : '일기는 기본 비공개예요. 보여주고 싶을 때만 내가 내려받아 전해요. 잠금번호를 잊으면 도움을 받아 다시 열 수 있어요.'}</p>
        <form onSubmit={e => {e.preventDefault(); void unlock();}}>
          {(recover || claim) && <label>{claim ? '이전 계정의 연결 코드' : '복구 코드'}<input value={ticket} onChange={e => setTicket(e.target.value)} autoComplete="off" maxLength={200} required/></label>}
          <label>{claim ? '이전 일기장 잠금번호' : recover ? '새 잠금번호' : '잠금번호'}<input className="sd-pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} autoComplete={status.configured && !recover ? 'current-password' : 'new-password'} placeholder="● ● ● ● ● ●" required/></label>
          {!claim && (!status.configured || recover) && <label>잠금번호 한 번 더<input className="sd-pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={confirmation} onChange={e => setConfirmation(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" required/></label>}
          <button className="sd-primary" disabled={busy || curtain}>{busy ? '확인하고 있어요…' : claim ? '이전 일기장 이어 쓰기' : recover ? '새 잠금번호로 열기' : status.configured ? '일기장 펼치기' : '내 일기장 만들기'}<ArrowRight size={17}/></button>
        </form>
        {status.configured && <div className="sd-lock-help"><button disabled={busy} onClick={() => void requestRecovery()}>{status.recoveryPending ? '복구 요청을 보냈어요 · 코드 입력하기' : '잠금번호가 기억나지 않아요'}</button>{recover && <button onClick={() => {setRecover(false); setPin(''); setConfirmation('');}}>잠금번호로 열기</button>}</div>}
        {!status.configured && <div className="sd-lock-help"><button disabled={busy} onClick={() => {setClaim(!claim); setPin(''); setTicket(''); setConfirmation('');}}>{claim ? '새 일기장 만들기' : '이전 계정의 일기장 이어 쓰기'}</button></div>}
        <small><ShieldCheck size={14}/>선생님의 학생 로그인 코드와 다른 잠금번호예요.</small>
      </>}
      </div>
    </div> : !selected && <DiaryCalendar month={calendarMonth} onMonth={setCalendarMonth} owned={allOwned} onOpen={setSelected} onNew={newPage} onLock={() => void lock()} onStatus={setStatus} onError={e => {setError(problem(e)); if (e instanceof DiaryRequestError && [401, 423].includes(e.status)) setStatus(current => ({...(current || blankStatus), unlocked: false}));}} onNotice={setNotice}/>}
    {selected && <div hidden={locked} inert={locked}><DiaryEditor key={selected.id} page={selected} owned={allOwned} locked={locked} onSave={save} onBack={() => {setSelected(null); dirty.current = false;}} onLock={() => lock()} onContinue={page => newPage(page.date)} onShare={async page => {if(!window.confirm("이 날짜의 일기 한 장을 현재 담임 선생님께 보여줄까요? 나중에 고친 내용은 자동으로 공개되지 않아요. 선생님이 이미 저장한 사본은 회수할 수 없어요.")) return; await diaryRequest("/pages/"+page.id+"/share","POST",{version:page.version}); setNotice("선택한 한 장을 선생님께 보여드렸어요. 기록 보관함에서 공개를 취소할 수 있어요.");}} onExport={async page => {if (window.confirm('내려받는 PDF는 잠겨 있지 않아요. 나만 사용하는 기기에 보관해 주세요. 내려받을까요?')) {exportJob.current?.abort();const controller=new AbortController();exportJob.current=controller;const {exportDiaryPdf} = await import('./diary-export'); await exportDiaryPdf([page], '나의 하루 일기.pdf',controller.signal);}}} registerBeforeLeave={registerSave} onDirtyChange={markDirty}/></div>}
  </section>;
}
