'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {Copy, LoaderCircle, PlugZap, ShieldCheck, Unplug} from 'lucide-react';
import {BERRY_SCOPE_LABELS, type BerryGrant, type BerryScope} from './types';
import './styles.css';

/** Teacher page listing connected apps (Berry, Claude, ChatGPT …) with revoke and setup instructions. */
export default function BerryConnections() {
  const [status, setStatus] = useState<{available: boolean; issuer: string} | null>(null), [grants, setGrants] = useState<BerryGrant[] | null>(null), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  const load = () => fetch('/api/oauth/grants', {cache: 'no-store'}).then(r => r.ok ? r.json() : Promise.reject()).then(data => setGrants(data.grants)).catch(() => setError('연결 목록을 불러오지 못했어요.'));
  useEffect(() => {fetch('/api/oauth/status', {cache: 'no-store'}).then(r => r.ok ? r.json() : Promise.reject()).then(data => {setStatus(data); if (data.available) void load();}).catch(() => setError('상태를 확인하지 못했어요.'));}, []);
  async function revoke(grant: BerryGrant) {
    if (!confirm(`${grant.clientName || '이 앱'}의 연결을 해제할까요? 앱은 더 이상 데이터를 읽을 수 없어요.`)) return;
    const r = await fetch(`/api/oauth/grants/${grant.id}`, {method: 'DELETE'});
    if (!r.ok) {setError('해제하지 못했어요.'); return;}
    void load();
  }
  const mcpUrl = status ? `${status.issuer}/api/mcp` : '';
  const active = (grants ?? []).filter(g => !g.revokedAt && Date.parse(g.expiresAt) > Date.now()), past = (grants ?? []).filter(g => !active.includes(g));
  return <section className="mp-shell bc-shell">
    <p className="bc-eyebrow"><Link href="/teacher/me">마이페이지</Link> › 외부 연결</p>
    <div className="bc-heading"><h2><PlugZap size={24}/> 외부 연결 (MCP)</h2><p>베리 앱, Claude, ChatGPT 같은 AI 도구가 선생님의 학급·숙제·교무수첩(요약)을 읽을 수 있게 연결해요. 연결마다 범위와 기간을 따로 정하고, 여기에서 언제든 끊어요.</p></div>
    {error && <p className="bc-error" role="alert">{error}</p>}
    {!status ? <p className="bc-muted"><LoaderCircle className="spin" size={18}/> 확인 중…</p> : !status.available ? <div className="bc-card is-soon"><h3>아직 준비 중이에요</h3><p>외부 연결은 시범 운영 중이라 차례대로 열려요.</p></div> : <>
      <div className="bc-card">
        <h3><ShieldCheck size={18}/> 연결하는 방법</h3>
        <ol className="bc-steps">
          <li>Claude(데스크톱·웹)나 ChatGPT의 <b>커넥터 추가</b>에서 아래 주소를 붙여 넣어요.</li>
          <li>모두의 교실 로그인 화면이 열리면 선생님 Google 계정으로 들어와 <b>허용할 범위와 기간</b>을 고르세요.</li>
          <li>이제 "이번 주 마감 숙제 알려 줘", "어제 미제출 학생 뽑아 줘"처럼 물어보면 돼요. 학생은 "학생 07"처럼 가명으로 보여요.</li>
        </ol>
        <div className="bc-url"><code>{mcpUrl}</code><button type="button" className="button soft" onClick={() => navigator.clipboard.writeText(mcpUrl).then(() => {setCopied(true); setTimeout(() => setCopied(false), 1500);}).catch(() => {})}><Copy size={14}/>{copied ? '복사됨' : '복사'}</button></div>
      </div>
      <div className="bc-card">
        <h3>연결된 앱 {grants && <small>{active.length}개</small>}</h3>
        {!grants ? <p className="bc-muted"><LoaderCircle className="spin" size={18}/></p> : !active.length ? <p className="bc-muted">아직 연결된 앱이 없어요.</p> : <ul className="bc-grants">
          {active.map(grant => <li key={grant.id}>
            <div><strong>{grant.clientName || '이름 없는 앱'}</strong><small>{new Date(grant.createdAt).toLocaleDateString('ko-KR')} 연결 · {new Date(grant.expiresAt).toLocaleDateString('ko-KR')}까지{grant.lastUsedAt ? ` · 마지막 사용 ${new Date(grant.lastUsedAt).toLocaleString('ko-KR')}` : ''}</small>
              <span className="bc-scope-list">{grant.scopes.map(scope => <em key={scope} className={scope === 'names' ? 'is-warning' : ''}>{BERRY_SCOPE_LABELS[scope as BerryScope]?.title ?? scope}</em>)}</span></div>
            <button type="button" className="button soft" onClick={() => void revoke(grant)}><Unplug size={14}/> 해제</button>
          </li>)}
        </ul>}
        {past.length > 0 && <details className="bc-past"><summary>지난 연결 {past.length}개</summary><ul>{past.map(grant => <li key={grant.id}>{grant.clientName || '이름 없는 앱'} · {grant.revokedAt ? `${new Date(grant.revokedAt).toLocaleDateString('ko-KR')} 해제` : '기간 만료'}</li>)}</ul></details>}
      </div>
    </>}
  </section>;
}
