'use client';
import {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react';
import {Flower2, Heart, MapPin, QrCode, Settings2, Sparkles, Trophy, Users} from 'lucide-react';
import {CLASS_PLAN_WON, GARDEN_STAGES, MONTHLY_CAP, REGIONS, gardenStage, publicClassLabel, type ClassView, type GardenSettings, type NationalView, type Visibility} from './policy';
import {demoDashboard} from './demo';
import './styles.css';

export type DashboardData = NationalView & {role: 'guest' | 'student' | 'teacher'; classes: (ClassView & {id: string; name?: string; grade?: string})[]};
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const monthLabel = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;
const VISIBILITY_TEXT: Record<Visibility, string> = {region: '지역만', school: '지역 + 학교', class: '지역 + 학교 + 반 이름'};

/** The teacher's switch: join, region, school, and how much of it the public sees. */
function GardenSettingsForm({row, onSave, busy}: {row: DashboardData['classes'][number]; onSave: (next: GardenSettings) => void; busy: boolean}) {
  const [draft, setDraft] = useState<GardenSettings>(row.settings);
  useEffect(() => setDraft(row.settings), [row.settings]);
  const preview = publicClassLabel({name: row.name, grade: row.grade, sharingGarden: {...draft, joined: true}});
  const changed = JSON.stringify(draft) !== JSON.stringify(row.settings);
  return <div className="sg-settings">
    <label className="sg-switch"><input type="checkbox" checked={draft.joined} onChange={event => setDraft({...draft, joined: event.target.checked})}/><span/><b>{draft.joined ? '나눔 꽃밭에 참여 중' : '나눔 꽃밭에 참여하지 않음'}</b></label>
    <p className="sg-settings-note">참여하면 숙제를 확인할 때마다 반의 나눔 꽃이 쌓여요. 참여는 학급마다 선생님이 정하고, 아이들 개인 성장 꽃은 참여와 상관없이 그대로예요.</p>
    <div className="sg-settings-grid">
      <label>시·도<select value={draft.region} onChange={event => setDraft({...draft, region: event.target.value as GardenSettings['region']})}><option value="">고르기</option>{REGIONS.map(region => <option key={region.code} value={region.code}>{region.name}</option>)}</select></label>
      <label>학교 이름<input value={draft.school} maxLength={30} placeholder="예: 한빛초등학교" onChange={event => setDraft({...draft, school: event.target.value})}/></label>
      <label>공개 범위<select value={draft.visibility} onChange={event => setDraft({...draft, visibility: event.target.value as Visibility})}>{(Object.keys(VISIBILITY_TEXT) as Visibility[]).map(key => <option key={key} value={key}>{VISIBILITY_TEXT[key]}</option>)}</select></label>
    </div>
    <p className="sg-settings-preview">전국 순위에는 <b>{preview}</b>(으)로 보여요. 학생 이름은 어디에도 나오지 않아요.</p>
    <button type="button" className="button primary" disabled={busy || !changed} onClick={() => onSave(draft)}>{busy ? '저장 중…' : '저장'}</button>
  </div>;
}

export function ClassGardenCard({view, name, children}: {view: ClassView; name?: string; children?: ReactNode}) {
  const stage = gardenStage(view.credited), left = MONTHLY_CAP - view.credited, full = left <= 0, joined = view.settings.joined;
  return <article className={`sg-class${full ? ' is-full' : ''}${joined ? '' : ' is-off'}`}>
    <header><span className="sg-class-emoji" aria-hidden>{joined ? stage.emoji : '🌰'}</span><div><small>{joined ? view.label : '참여하지 않은 반'}</small><strong>{name || '우리 반'}</strong></div><b>{joined ? stage.label : '꺼짐'}</b></header>
    {joined && <>
      <div className="sg-bed" aria-hidden>{GARDEN_STAGES.slice(1).map((step, index) => <span key={step.min} className={view.credited >= step.min ? 'is-on' : ''} style={{animationDelay: `${index * 90}ms`}}>{step.emoji}</span>)}</div>
      <div className="sg-gauge" role="progressbar" aria-valuemin={0} aria-valuemax={MONTHLY_CAP} aria-valuenow={view.credited} aria-label="우리 반 이번 달 나눔 점수"><i style={{width: `${stage.percent}%`}}/>{GARDEN_STAGES.slice(1, -1).map(step => <em key={step.min} style={{left: `${step.min / MONTHLY_CAP * 100}%`}}/>)}</div>
      <p className="sg-gauge-text"><strong>{view.credited.toLocaleString('ko-KR')}</strong> / {MONTHLY_CAP.toLocaleString('ko-KR')}점 · <span>{full ? '이번 달 꽃밭 완성! 1,500원이 나눔에 더해져요 🎉' : `${left.toLocaleString('ko-KR')}점 더 모으면 꽃밭 완성`}</span></p>
    </>}
    {children}
    {joined && full && <div className="sg-petals" aria-hidden>{Array.from({length: 14}, (_, i) => <span key={i} style={{left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.35}s`}}>🌸</span>)}</div>}
  </article>;
}

/** 시·도 tiles laid out roughly like the map of Korea; colour deepens with this month's total. */
function RegionMap({regions, mine}: {regions: NationalView['regions']; mine: Set<string>}) {
  const top = Math.max(1, ...regions.map(region => region.won));
  return <div className="sg-map" role="list" aria-label="시·도별 이번 달 나눔">
    {REGIONS.map(place => {
      const row = regions.find(region => region.code === place.code), value = row?.won || 0, level = value ? Math.max(1, Math.ceil(value / top * 4)) : 0;
      return <div key={place.code} role="listitem" className={`sg-tile l${level}${mine.has(place.code) ? ' is-mine' : ''}`} style={{gridRow: place.row, gridColumn: place.col}}>
        <b>{place.name}</b><span>{value ? won(value) : '-'}</span><small>{row?.classes ? `${row.classes}반` : ''}</small>
      </div>;
    })}
  </div>;
}

export default function SharingGardenDashboard() {
  const [data, setData] = useState<DashboardData | null>(null), [error, setError] = useState(''), [demo, setDemo] = useState(false), [busy, setBusy] = useState(''), [qr, setQr] = useState(''), [openId, setOpenId] = useState('');
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
  async function save(classId: string, settings: GardenSettings) {
    setError('');
    if (demo) { setData(current => current && {...current, classes: current.classes.map(row => row.id === classId ? {...row, settings: {...settings, joined: settings.joined && !!settings.region}, label: publicClassLabel({name: row.name, grade: row.grade, sharingGarden: settings})} : row)}); return; }
    setBusy(classId);
    try {
      const response = await fetch(`/api/sharing-garden/classes/${classId}/settings`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(settings)});
      if (!response.ok) throw new Error((await response.json()).error);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '저장하지 못했어요.'); } finally { setBusy(''); }
  }
  async function showQr() {
    const QRCode = (await import('qrcode')).default;
    setQr(await QRCode.toDataURL(`${window.location.origin}/sharing-garden`, {width: 240, margin: 2, color: {dark: '#254e41', light: '#ffffff'}}));
  }
  const reached = (data?.goalPercent || 0) >= 100;
  const garden = useMemo(() => data ? Array.from({length: 60}, (_, i) => i < Math.round(Math.min(100, data.goalPercent) / 100 * 60)) : [], [data]);
  const myRegions = useMemo(() => new Set((data?.classes || []).filter(row => row.settings.joined).map(row => row.settings.region as string)), [data]);
  if (error && !data) return <main className="sg-page"><p className="error-message">{error}</p></main>;
  if (!data) return <main className="sg-page"><div className="center-state"><Flower2 className="spin"/><p>전국 꽃밭을 불러오는 중이에요.</p></div></main>;
  const teacher = data.role === 'teacher';
  return <main className="sg-page">
    {data.unavailable && <p className="sg-demo">전국 집계를 잠시 불러오지 못했어요. 조금 뒤 다시 열어 주세요.</p>}
    {demo && <p className="sg-demo">예시 화면이에요. 실제 집계가 아닌 시연용 숫자예요.</p>}
    {error && <p className="error-message">{error}</p>}
    <section className={`sg-hero${reached ? ' is-reached' : ''}`}>
      <div className="sg-hero-copy">
        <span className="sg-kicker"><Heart size={14}/> 모두의 교실 나눔 꽃밭 · {monthLabel(data.month)}{data.preview && <em>미리보기</em>}</span>
        <h1>아이들의 힘이 전국에서 모여<br/>의미 있는 곳에 쓰여요</h1>
        <p>참여한 반이 함께 모은 성장 꽃 1점은 1원이 되어, 학급마다 한 달 최대 {won(MONTHLY_CAP)}까지 <b>학급 이름과 모두의 교실 이름으로</b> 기부돼요. (학급 구독료 {won(CLASS_PLAN_WON)}의 5%)</p>
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
      <div className="sg-section-head"><h2>우리 반 꽃밭</h2>{teacher && <button type="button" className="button soft" onClick={() => void showQr()}><QrCode size={16}/>학부모 QR</button>}</div>
      {qr && <div className="sg-qr"><img src={qr} alt="나눔 꽃밭 QR"/><p>학부모님이 이 QR로 전국 나눔 꽃밭을 볼 수 있어요. 학생 이름은 어디에도 나오지 않아요.</p><button type="button" className="button" onClick={() => setQr('')}>닫기</button></div>}
      <div className="sg-mine-grid">{data.classes.map(row => <ClassGardenCard key={row.id} view={row} name={row.name}>
        {teacher && <>
          <button type="button" className="sg-toggle" aria-expanded={openId === row.id} onClick={() => setOpenId(openId === row.id ? '' : row.id)}><Settings2 size={15}/>{row.settings.joined ? '참여·공개 설정' : '참여 설정하기'}</button>
          {(openId === row.id || (!row.settings.joined && data.classes.length === 1)) && <GardenSettingsForm row={row} busy={busy === row.id} onSave={next => void save(row.id, next)}/>}
        </>}
      </ClassGardenCard>)}</div>
    </section>}

    <section className="sg-region-wrap">
      <div className="sg-section-head"><h2><MapPin size={18}/> 지역별 나눔 지도</h2><small>색이 진할수록 이번 달 많이 모였어요</small></div>
      <div className="sg-region-body">
        <RegionMap regions={data.regions} mine={myRegions}/>
        <ol className="sg-region-rank">{[...data.regions].filter(region => region.won > 0).sort((a, b) => b.won - a.won).slice(0, 5).map((region, index) => <li key={region.code}><b>{index + 1}</b><span>{region.name}</span><small>{region.classes}반</small><strong>{won(region.won)}</strong></li>)}</ol>
      </div>
    </section>

    <section className="sg-field-wrap">
      <div className="sg-section-head"><h2>전국 꽃밭</h2><small>꽃 한 송이 = 목표의 1/60</small></div>
      <div className="sg-field" aria-label={`이번 달 목표의 ${data.goalPercent}%만큼 꽃이 피었어요`}>{garden.map((on, i) => <span key={i} className={on ? 'is-on' : ''} style={{animationDelay: `${(i % 12) * 60}ms`}}>{on ? (i % 5 === 0 ? '🌻' : i % 3 === 0 ? '🌷' : '🌸') : '·'}</span>)}</div>
    </section>

    <section className="sg-rank">
      <div className="sg-section-head"><h2><Trophy size={18}/> 이번 달 나눔 꽃밭 순위</h2><small>학교·반 이름은 선생님이 공개한 만큼만 보여요</small></div>
      {data.ranking.length ? <ol>{data.ranking.map(row => <li key={row.rank} className={row.mine ? 'is-mine' : ''}><b>{row.rank}</b><span>{row.label}{row.mine ? ' (우리 반)' : ''}</span><i><em style={{width: `${Math.min(100, row.won / MONTHLY_CAP * 100)}%`}}/></i><strong>{won(row.won)}{row.full ? ' 💐' : ''}</strong></li>)}</ol> : <p className="empty-note">이번 달 첫 꽃을 피울 반을 기다리고 있어요.</p>}
    </section>

    <section className="sg-how">
      <h2>이렇게 모여요</h2>
      <ol>
        <li><span>🙋</span><b>반이 참여</b><p>선생님이 우리 반 참여를 켜고 지역을 골라요</p></li>
        <li><span>📝</span><b>숙제 확인</b><p>숙제를 확인하면 학생 성장 꽃 10점이 반 꽃밭에도 쌓여요</p></li>
        <li><span>💐</span><b>한 달 1,500점</b><p>학급마다 매달 1,500점(1,500원)까지 나눔에 더해져요</p></li>
        <li><span>💌</span><b>함께 기부</b><p>월말에 모아 학급 이름과 모두의 교실 이름으로 기부해요</p></li>
      </ol>
    </section>
  </main>;
}
