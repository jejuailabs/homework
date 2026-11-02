'use client';
import {useEffect, useState} from 'react';
import {GoogleAuthProvider, signInWithPopup} from 'firebase/auth';
import {LoaderCircle, ShieldAlert, Smartphone} from 'lucide-react';
import {auth} from '@/lib/firebase-client';
import '@/modules/berry-connector/styles.css';

type State = 'checking' | 'signin' | 'ready' | 'unavailable' | 'invalid' | 'done';
const validReturn = (value: string | null) => {
  if (!value || value.length > 300) return false;
  try {return ['berry:', 'exp:', 'exps:'].includes(new URL(value).protocol);} catch {return false;}
};

/** /berry/app-login: the Berry phone app opens this in the system browser; the teacher approves and returns with a one-time code. */
export default function BerryAppLogin() {
  const [state, setState] = useState<State>('checking'), [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function check() {
    const params = new URLSearchParams(window.location.search);
    if (!validReturn(params.get('return')) || !/^[A-Za-z0-9_-]{43,128}$/.test(params.get('challenge') ?? '')) {setState('invalid'); return;}
    const me = await fetch('/api/me', {cache: 'no-store'});
    if (!me.ok) {setState('signin'); return;}
    const profile = await me.json();
    if (profile.role === 'student') {setState('unavailable'); return;}
    setName(profile.displayName ?? profile.email ?? '');
    const status = await fetch('/api/berry/status', {cache: 'no-store'}).then(r => r.json()).catch(() => ({available: false}));
    setState(status.available ? 'ready' : 'unavailable');
  }
  useEffect(() => {check().catch(() => setState('signin'));}, []);
  async function google() {
    setBusy(true); setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      const res = await fetch('/api/auth/session', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({idToken: await auth.currentUser?.getIdToken()})});
      if (!res.ok) throw Error();
      await check();
    } catch (e) {setError(`로그인을 완료하지 못했어요. (${(e as {code?: string}).code?.replace(/^auth\//, '') ?? 'session'})`);}
    finally {setBusy(false);}
  }
  async function approve() {
    setBusy(true); setError('');
    const params = new URLSearchParams(window.location.search), back = params.get('return')!;
    try {
      const res = await fetch('/api/berry/app/code', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({challenge: params.get('challenge')})});
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      setState('done');
      window.location.href = `${back}${back.includes('?') ? '&' : '?'}code=${encodeURIComponent(data.code)}`;
    } catch (e) {setError(e instanceof Error && e.message ? e.message : '처리하지 못했어요.'); setBusy(false);}
  }
  return <main className="bcx-page">
    <section className="bcx-sheet bcx-center">
      <span className="bcx-mark"><Smartphone size={26}/></span>
      <h1 className="bcx-title">베리 앱 로그인</h1>
      {state === 'checking' && <p className="bcx-loading"><LoaderCircle className="spin" size={18}/> 확인하고 있어요…</p>}
      {state === 'invalid' && <p className="bcx-alert" role="alert"><ShieldAlert size={16}/>베리 앱에서 다시 시작해 주세요.</p>}
      {state === 'unavailable' && <p className="bcx-alert" role="alert"><ShieldAlert size={16}/>이 계정은 아직 베리를 쓸 수 없어요.</p>}
      {state === 'signin' && <>
        <p>모두의 교실 선생님 계정으로 로그인해 주세요.</p>
        <button type="button" className="button google-button" onClick={google} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <span className="google-letter">G</span>} Google로 로그인</button>
      </>}
      {state === 'ready' && <>
        <p><b>{name || '선생님'}</b> 계정으로<br/>휴대폰의 베리 앱에 로그인할까요?</p>
        <button type="button" className="button primary" onClick={approve} disabled={busy}>{busy && <LoaderCircle className="spin" size={16}/>}베리 앱에 로그인</button>
        <p className="bcx-fine"><ShieldAlert size={13}/>베리 앱에서 직접 연 화면일 때만 눌러 주세요.</p>
      </>}
      {state === 'done' && <p>베리 앱으로 돌아가는 중이에요…</p>}
      {error && <p className="bcx-alert" role="alert"><ShieldAlert size={16}/>{error}</p>}
    </section>
  </main>;
}

/** /berry/app-done: where the browser lands after the ourclass connection started from the app. */
export function BerryAppDone() {
  const [status, setStatus] = useState('');
  useEffect(() => {setStatus(new URLSearchParams(window.location.search).get('status') ?? '');}, []);
  return <main className="bcx-page">
    <section className="bcx-sheet bcx-center">
      <span className="bcx-mark"><Smartphone size={26}/></span>
      <h1 className="bcx-title">{status === 'connected' ? '연결됐어요' : status ? '연결하지 못했어요' : '베리'}</h1>
      <p>{status === 'connected' ? '이 창을 닫고 베리 앱으로 돌아가세요.' : '베리 앱으로 돌아가 다시 시도해 주세요.'}</p>
    </section>
  </main>;
}
