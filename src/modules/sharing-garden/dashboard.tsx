'use client';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {Eye, EyeOff, Flower2, Heart, QrCode, Sparkles, Trophy, Users} from 'lucide-react';
import {CLASS_PLAN_WON, GARDEN_STAGES, MONTHLY_CAP, gardenStage, type ClassView, type NationalView} from './policy';
import {demoDashboard} from './demo';
import './styles.css';

export type DashboardData = NationalView & {role: 'guest' | 'student' | 'teacher'; classes: (ClassView & {id: string; name?: string})[]};
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const monthLabel = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;

export function ClassGardenCard({view, name, canEdit, onToggle, busy}: {view: ClassView; name?: string; canEdit?: boolean; onToggle?: (show: boolean) => void; busy?: boolean}) {
  const stage = gardenStage(view.credited), left = MONTHLY_CAP - view.credited, full = left <= 0;
  return <article className={`sg-class${full ? ' is-full' : ''}`}>
    <header><span className="sg-class-emoji" aria-hidden>{stage.emoji}</span><div><small>우리 반 이번 달 나눔 꽃밭</small><strong>{name || '우리 반'}</strong></div><b>{stage.label}</b></header>
    <div className="sg-bed" aria-hidden>{GARDEN_STAGES.slice(1).map((step, index) => <span key={step.min} className={view.credited >= step.min ? 'is-on' : ''} style={{animationDelay: `${index * 90}ms`}}>{step.emoji}</span>)}</div>
    <div className="sg-gauge" role="progressbar" aria-valuemin={0} aria-valuemax={MONTHLY_CAP} aria-valuenow={view.credited} aria-label="우리 반 이번 달 나눔 점수"><i style={{width: `${stage.percent}%`}}/>{GARDEN_STAGES.slice(1, -1).map(step => <em key={step.min} style={{left: `${step.min / MONTHLY_CAP * 100}%`}}/>)}</div>
    <p className="sg-gauge-text"><strong>{view.credited.toLocaleString('ko-KR')}</strong> / {MONTHLY_CAP.toLocaleString('ko-KR')}점 · <span>{full ? '이번 달 꽃밭 완성! 1,500원이 나눔에 더해져요 🎉' : `${left.toLocaleString('ko-KR')}점 더 모으면 꽃밭 완성`}</span></p>
    {canEdit && onToggle && <button type="button" className="sg-toggle" disabled={busy} onClick={() => onToggle(!view.showName)}>{view.showName ? <Eye size={15}/> : <EyeOff size={15}/>}{view.showName ? '전국 순위에 반 이름 공개 중' : '전국 순위에 반 이름 숨김'}</button>}
    {full && <div className="sg-petals" aria-hidden>{Array.from({length: 14}, (_, i) => <span key={i} style={{left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.35}s`}}>🌸</span>)}</div>}
  </article>;
}

export default function SharingGardenDashboard() {
  const [data, setData] = useState<DashboardData | null>(null), [error, setError] = useState(''), [demo, setDemo] = useState(false), [busy, setBusy] = useState(''), [qr, setQr] = useState('');
  const load = useCallback(async () => {
    const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';
    setDemo(isDemo);
    if (isDemo) { setData(demoDashboard()); return; }
    try {
      const response = await fetch('/api/sharing-garden', {cache: 'no-store'});
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || '잠시 후 다시 열어 주세요.');
      setData(json);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '잠시 후 다시 열어 주세요.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function toggle(classId: string, showName: boolean) {
    if (demo) { setData(current => current && {...current, classes: current.classes.map(row => row.id === classId ? {...row, showName} : row)}); return; }
    setBusy(classId);
    try {
      const response = await fetch(`/api/sharing-garden/classes/${classId}/visibility`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({showName})});
      if (!response.ok) throw new Error((await response.json()).error);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '바꾸지 못했어요.'); } finally { setBusy(''); }
  }
  async function showQr() {
    const QRCode = (await import('qrcode')).default;
    setQr(await QRCode.toDataURL(`${window.location.origin}/sharing-garden`, {width: 240, margin: 2, color: {dark: '#254e41', light: '#ffffff'}}));
  }
  const reached = (data?.goalPercent || 0) >= 100;
  const garden = useMemo(() => data ? Array.from({length: 60}, (_, i) => i < Math.round(Math.min(100, data.goalPercent) / 100 * 60)) : [], [data]);
  if (error && !data) return <main className="sg-page"><p className="error-message">{error}</p></main>;
  if (!data) return <main className="sg-page"><div className="center-state"><Flower2 className="spin"/><p>전국 꽃밭을 불러오는 중이에요.</p></div></main>;
  return <main className="sg-page">
    {data.unavailable && <p className="sg-demo">전국 집계를 잠시 불러오지 못했어요. 조금 뒤 다시 열어 주세요.</p>}
    {demo && <p className="sg-demo">예시 화면이에요. 실제 집계가 아닌 시연용 숫자예요.</p>}
    <section className={`sg-hero${reached ? ' is-reached' : ''}`}>
      <div className="sg-hero-copy">
        <span className="sg-kicker"><Heart size={14}/> 모두의 교실 나눔 꽃밭 · {monthLabel(data.month)}{data.preview && <em>미리보기</em>}</span>
        <h1>아이들의 힘이 전국에서 모여<br/>의미 있는 곳에 쓰여요</h1>
        <p>우리 반이 함께 모은 성장 꽃 1점은 1원이 되어, 학급마다 한 달 최대 {won(MONTHLY_CAP)}까지 <b>학급 이름과 모두의 교실 이름으로</b> 기부돼요. (학급 구독료 {won(CLASS_PLAN_WON)}의 5%)</p>
      </div>
      <div className="sg-goal">
        <small>이번 달 전국 나눔</small>
        <strong className="sg-big">{won(data.monthWon)}</strong>
        <div className="sg-goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.goalPercent} aria-label="이번 달 목표 진행"><i style={{width: `${Math.min(100, data.goalPercent)}%`}}/></div>
        <p>목표 {won(data.goalWon)} 중 <b>{data.goalPercent}%</b>{reached ? ' · 목표 달성! 고마워요 🎉' : ''}</p>
        {reached && <div className="sg-petals" aria-hidden>{Array.from({length: 18}, (_, i) => <span key={i} style={{left: `${(i * 29) % 100}%`, animationDelay: `${(i % 9) * 0.3}s`}}>{i % 3 ? '🌸' : '✨'}</span>)}</div>}
      </div>
    </section>

    <section className="sg-stats">
      <div><Users size={18}/><small>이번 달 참여 학급</small><strong>{data.monthClasses.toLocaleString('ko-KR')}반</strong></div>
      <div><Flower2 size={18}/><small>꽃밭 완성 학급</small><strong>{data.fullClasses.toLocaleString('ko-KR')}반</strong></div>
      <div><Sparkles size={18}/><small>지금까지 모은 나눔</small><strong>{won(data.totalWon)}</strong></div>
      <div><Heart size={18}/><small>이번 달 나눔처</small><strong className="sg-recipient">{data.recipient || '선생님들과 함께 고르는 중'}</strong></div>
    </section>

    {data.classes.length > 0 && <section className="sg-mine">
      <div className="sg-section-head"><h2>우리 반 꽃밭</h2>{data.role === 'teacher' && <button type="button" className="button soft" onClick={() => void showQr()}><QrCode size={16}/>학부모 QR</button>}</div>
      {qr && <div className="sg-qr"><img src={qr} alt="나눔 꽃밭 QR"/><p>학부모님이 이 QR로 전국 나눔 꽃밭을 볼 수 있어요. 학생 이름은 어디에도 나오지 않아요.</p><button type="button" className="button" onClick={() => setQr('')}>닫기</button></div>}
      <div className="sg-mine-grid">{data.classes.map(row => <ClassGardenCard key={row.id} view={row} name={row.name} canEdit={data.role === 'teacher'} busy={busy === row.id} onToggle={show => void toggle(row.id, show)}/>)}</div>
    </section>}

    <section className="sg-field-wrap">
      <div className="sg-section-head"><h2>전국 꽃밭</h2><small>꽃 한 송이 = 목표의 1/60</small></div>
      <div className="sg-field" aria-label={`이번 달 목표의 ${data.goalPercent}%만큼 꽃이 피었어요`}>{garden.map((on, i) => <span key={i} className={on ? 'is-on' : ''} style={{animationDelay: `${(i % 12) * 60}ms`}}>{on ? (i % 5 === 0 ? '🌻' : i % 3 === 0 ? '🌷' : '🌸') : '·'}</span>)}</div>
    </section>

    <section className="sg-rank">
      <div className="sg-section-head"><h2><Trophy size={18}/> 이번 달 나눔 꽃밭 순위</h2><small>반 이름은 선생님이 공개한 반만 보여요</small></div>
      {data.ranking.length ? <ol>{data.ranking.map(row => <li key={row.rank} className={row.mine ? 'is-mine' : ''}><b>{row.rank}</b><span>{row.label}{row.mine ? ' (우리 반)' : ''}</span><i><em style={{width: `${Math.min(100, row.won / MONTHLY_CAP * 100)}%`}}/></i><strong>{won(row.won)}{row.full ? ' 💐' : ''}</strong></li>)}</ol> : <p className="empty-note">이번 달 첫 꽃을 피울 반을 기다리고 있어요.</p>}
    </section>

    <section className="sg-how">
      <h2>이렇게 모여요</h2>
      <ol>
        <li><span>📝</span><b>숙제 확인</b><p>선생님이 숙제를 확인하면 학생마다 성장 꽃 10점</p></li>
        <li><span>🌱</span><b>반이 함께</b><p>반 친구들의 꽃이 모여 이번 달 학급 꽃밭이 자라요</p></li>
        <li><span>💐</span><b>한 달 1,500점</b><p>학급마다 매달 1,500점(1,500원)까지 나눔에 더해져요</p></li>
        <li><span>💌</span><b>함께 기부</b><p>월말에 모아 학급 이름과 모두의 교실 이름으로 기부해요</p></li>
      </ol>
    </section>
  </main>;
}
