'use client';
import {useEffect, useState} from 'react';
import {LoaderCircle, PlugZap, ShieldAlert, ShieldCheck} from 'lucide-react';
import './styles.css';

type Info = {client: {id: string; name: string; redirectHost: string; trusted: boolean}; scopes: {scope: string; title: string; detail: string; warning?: string}[]; teacher: {email: string | null; displayName: string | null}};
const PARAMS = ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'resource'];

/** OAuth consent screen at /oauth/authorize. The server validates the request; the teacher may narrow scopes and pick an access period. */
export default function BerryConsent() {
  const [info, setInfo] = useState<Info | null>(null), [error, setError] = useState(''), [chosen, setChosen] = useState<string[]>([]), [days, setDays] = useState('30'), [busy, setBusy] = useState(false);
  useEffect(() => {
    const search = window.location.search;
    fetch(`/api/oauth/consent${search}`, {cache: 'no-store'}).then(async r => {
      if (r.status === 401) {window.location.replace(`/?next=${encodeURIComponent(window.location.pathname + search)}`); return null;}
      const body = await r.json();
      if (!r.ok) throw Error(body.error_description || '요청을 확인할 수 없어요.');
      return body as Info;
    }).then(data => {if (data) {setInfo(data); setChosen(data.scopes.map(s => s.scope).filter(scope => scope !== 'names'));}}).catch(e => setError(e instanceof Error ? e.message : '요청을 확인할 수 없어요.'));
  }, []);
  async function decide(decision: 'approve' | 'deny') {
    if (!info || busy) return;
    setBusy(true); setError('');
    const params = new URLSearchParams(window.location.search), body: Record<string, unknown> = {decision, scopes: chosen, accessDays: Number(days)};
    for (const key of PARAMS) {const value = params.get(key); if (value !== null) body[key] = value;}
    try {
      const r = await fetch('/api/oauth/consent', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
      const data = await r.json();
      if (!r.ok) throw Error(data.error_description || '처리하지 못했어요.');
      window.location.assign(data.redirect);
    } catch (e) {setError(e instanceof Error ? e.message : '처리하지 못했어요.'); setBusy(false);}
  }
  const toggle = (scope: string) => setChosen(list => list.includes(scope) ? list.filter(s => s !== scope) : [...list, scope]);
  return <main className="bc-consent">
    <section className="bc-card">
      <div className="bc-icon"><PlugZap size={28}/></div>
      {error && <p className="bc-error" role="alert"><ShieldAlert size={16}/>{error}</p>}
      {!info && !error && <p className="bc-muted"><LoaderCircle className="spin" size={18}/> 요청을 확인하고 있어요…</p>}
      {info && <>
        <h1><b>{info.client.name}</b>이(가) 선생님의 모두의 교실을 읽어도 될까요?</h1>
        <p className="bc-muted">돌아갈 주소: {info.client.redirectHost} · 계정: {info.teacher.email ?? info.teacher.displayName ?? '선생님'}</p>
        {!info.client.trusted && <p className="bc-error" role="note"><ShieldAlert size={16}/>모두의 교실이 확인하지 않은 앱이에요. 선생님이 직접 연결을 시작한 경우가 아니라면 거부해 주세요.</p>}
        <ul className="bc-scopes">
          {info.scopes.map(item => <li key={item.scope} className={item.warning ? 'is-warning' : ''}>
            <label><input type="checkbox" checked={chosen.includes(item.scope)} onChange={() => toggle(item.scope)} disabled={busy}/><span><strong>{item.title}</strong><small>{item.detail}</small>{item.warning && <em><ShieldAlert size={13}/>{item.warning}</em>}</span></label>
          </li>)}
        </ul>
        <label className="bc-days">접근 기간 <select value={days} onChange={e => setDays(e.target.value)} disabled={busy}><option value="7">7일</option><option value="14">14일</option><option value="30">30일</option></select><small>기간이 지나면 자동으로 끊겨요. 마이페이지에서 언제든 해제할 수 있어요.</small></label>
        <p className="bc-note"><ShieldCheck size={14}/> 학생은 기본적으로 "학생 07"처럼 가명으로 나가고, 상담·건강·가정 기록은 어떤 권한으로도 나가지 않아요. 쓰기 권한은 아직 없어요.</p>
        <div className="bc-actions">
          <button type="button" className="button soft" onClick={() => decide('deny')} disabled={busy}>거부</button>
          <button type="button" className="button" onClick={() => decide('approve')} disabled={busy || !chosen.length}>{busy ? <LoaderCircle className="spin" size={16}/> : <ShieldCheck size={16}/>} 허용하기</button>
        </div>
      </>}
    </section>
  </main>;
}
