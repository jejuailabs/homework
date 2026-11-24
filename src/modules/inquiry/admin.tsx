'use client';
import {useEffect, useState} from 'react';
import {LoaderCircle} from 'lucide-react';
import {inquirySourceLabels, inquirySources, inquiryStatusLabels, inquiryStatuses, inquiryTopicLabels, type InquiryStatus, type InquirySummary} from './policy';
import './styles.css';

type Day = {day: string; views: Record<string, number>; submitted: Record<string, number>};
type Data = {items: InquirySummary[]; newCount: number; daily: Day[]; mailReady: boolean};
const date = (value: string) => new Date(value).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'});
const sum = (days: Day[], kind: 'views' | 'submitted', source?: string) => days.reduce((n, d) => n + (source ? d[kind][source] || 0 : Object.values(d[kind]).reduce((a, b) => a + b, 0)), 0);
const rate = (a: number, b: number) => b ? Math.round(a / b * 1000) / 10 + '%' : '-';

/** Operator view: how often the "use it for real" buttons are pressed, and the inquiries that came in. */
export default function AdminInquiries({revision = 0}: {revision?: number}) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [saving, setSaving] = useState(''), [tick, setTick] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError('');
    fetch('/api/inquiry/admin', {cache: 'no-store', signal: abort.signal}).then(async r => {const v = await r.json(); if (!r.ok) throw new Error(v.error || '문의를 불러오지 못했어요.'); setData(v);})
      .catch(e => {if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '문의를 불러오지 못했어요.');});
    return () => abort.abort();
  }, [revision, tick]);

  async function setStatus(id: string, status: InquiryStatus) {
    setSaving(id);
    try {
      const r = await fetch('/api/inquiry/admin/' + id, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status})});
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || '상태를 바꾸지 못했어요.');
      setTick(n => n + 1);
    } catch (e) {setError(e instanceof Error ? e.message : '상태를 바꾸지 못했어요.');}
    finally {setSaving('');}
  }

  if (error && !data) return <p role="alert">{error}</p>;
  if (!data) return <p><LoaderCircle className="spin" size={18}/> 불러오는 중</p>;
  const today = data.daily.slice(0, 1), week = data.daily.slice(0, 7), month = data.daily;
  return <div className="iq-admin">
    {!data.mailReady && <p className="inline-note">메일 발송이 아직 꺼져 있어요. Vercel 환경변수 RESEND_API_KEY · INQUIRY_MAIL_TO 를 넣으면 새 문의가 메일로도 옵니다. 지금은 이 화면에서만 볼 수 있어요.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="iq-admin-stats">
      {([['오늘', today], ['최근 7일', week], ['최근 30일', month]] as const).map(([label, days]) => <div key={label}><span>{label} 버튼 누름 → 문의</span><strong>{sum([...days], 'views')} → {sum([...days], 'submitted')}</strong><span>전환 {rate(sum([...days], 'submitted'), sum([...days], 'views'))}</span></div>)}
      <div><span>처리 안 한 새 문의</span><strong>{data.newCount}</strong></div>
    </div>
    <div className="iq-admin-wrap"><table>
      <caption style={{textAlign: 'left', fontWeight: 700, padding: '6px 0'}}>버튼 위치별 (최근 30일 · 같은 탭에서 여러 번 눌러도 1번)</caption>
      <thead><tr><th>누른 곳</th><th>오늘</th><th>7일</th><th>30일</th><th>30일 문의</th><th>전환</th></tr></thead>
      <tbody>{inquirySources.map(s => <tr key={s}><td>{inquirySourceLabels[s]}</td><td>{sum(today, 'views', s)}</td><td>{sum(week, 'views', s)}</td><td>{sum(month, 'views', s)}</td><td>{sum(month, 'submitted', s)}</td><td>{rate(sum(month, 'submitted', s), sum(month, 'views', s))}</td></tr>)}</tbody>
    </table></div>
    <div className="iq-admin-wrap"><table>
      <caption style={{textAlign: 'left', fontWeight: 700, padding: '6px 0'}}>받은 문의 (최근 100건)</caption>
      <thead><tr><th>받은 시각</th><th>종류</th><th>보낸 사람</th><th>내용</th><th>누른 곳</th><th>메일</th><th>상태</th></tr></thead>
      <tbody>{data.items.length ? data.items.map(i => <tr key={i.id}>
        <td>{date(i.createdAt)}</td><td>{inquiryTopicLabels[i.topic]}</td>
        <td><strong>{i.name}</strong><br/><a href={'mailto:' + i.email}>{i.email}</a>{i.phone && <><br/>{i.phone}</>}{i.school && <><br/>{i.school}</>}</td>
        <td className="iq-msg">{i.message || '-'}</td><td>{inquirySourceLabels[i.source]}</td>
        <td>{i.mail === 'sent' ? '보냄' : i.mail === 'off' ? '꺼짐' : '실패'}</td>
        <td><select aria-label={`${i.name} 문의 상태`} value={i.status} disabled={saving === i.id} onChange={e => void setStatus(i.id, e.target.value as InquiryStatus)}>{inquiryStatuses.map(s => <option key={s} value={s}>{inquiryStatusLabels[s]}</option>)}</select></td>
      </tr>) : <tr><td colSpan={7}>아직 받은 문의가 없어요.</td></tr>}</tbody>
    </table></div>
  </div>;
}
