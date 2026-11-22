'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {ArrowRight, BookOpenCheck, CalendarDays, Check, ChevronRight, ClipboardList, Clock3, CloudOff, Download, FileSpreadsheet, Layers, LoaderCircle, Lock, MessageCircleHeart, NotebookPen, School, Search, Sparkles, Star, Wand2, X} from 'lucide-react';
import {FEATURES, SECTIONS, SECTION_PAGES, STATUS_LABELS, STEPS, TABS, sectionName, type Feature, type TabKey} from './features';
import {addDays, expand, hourStats, isSchoolDay, progressToDate, schoolWeekOf, shortDate, week, type Plan} from './engine';
import {buildFile, type FileKind} from './files';
import {SAMPLE_PLAN} from './sample';
import {SECTION_VIEWS, WeeklyView, toneOf, type SectionViewKey, type ViewProps} from './views';
import {StartDialog, type StartInput} from './editors';
import HoursCenter from './hours-center';
import BerryPlan from './berry-plan';
import FeatureMap from './feature-map';
import {featureTask, taskOf, type BerryTask} from './berry-tasks';
import {starterPlan} from './starter';
import './styles.css';

/**
 * 교육과정 작업실. 위 탭은 선생님들이 익숙한 교육과정 업무 순서, 탭 안은 "작성 흐름도"(담당자 → 담임·전담 → 출력)를 따른다.
 * 화면·베리 응답에는 다른 회사 프로그램 이름을 쓰지 않는다(내부 설계 문서에만 남긴다).
 * 기능 229개는 모두 메뉴에 자리가 있고, 각 탭 맨 위에 핵심 기능 카드가 먼저 보인다.
 * preview: 로그인 없는 로컬 시안 페이지(/curriculum-preview). 서버를 부르지 않는다.
 */
type View = {tab: 'home' | 'hours' | TabKey; section: string | null; date: string | null};
type SaveState = {state: 'idle' | 'saving' | 'saved' | 'error' | 'stale'; message?: string; at?: string};
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const seoulToday = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const BERRY_CHIPS = ['check-hours', 'hours-file', 'week', 'find'];
const STATUS_TONE: Record<Feature['status'], string> = {live: 'is-live', elsewhere: 'is-elsewhere', planned: 'is-planned'};

function readView(): View {
  const params = new URLSearchParams(window.location.search), tab = params.get('tab');
  return {tab: tab === 'hours' ? 'hours' : TABS.some(entry => entry.key === tab) ? tab as TabKey : 'home', section: params.get('section'), date: params.get('date')};
}

export default function CurriculumWorkspace({preview = false}: {preview?: boolean}) {
  const [available, setAvailable] = useState<boolean | null>(preview ? true : null);
  const [plan, setPlan] = useState<Plan>(SAMPLE_PLAN), [original, setOriginal] = useState<Plan>(SAMPLE_PLAN);
  // loaded: 선생님 반 계획을 서버에서 받았는지(없으면 예시 학급을 보여 준다). version은 두 창 덮어쓰기 방지용.
  const [loaded, setLoaded] = useState(preview), version = useRef<number | null>(null), saved = useRef<Plan>(SAMPLE_PLAN);
  const [save, setSave] = useState<SaveState>({state: 'idle'});
  const [starting, setStarting] = useState<{open: boolean; busy: boolean; error: string}>({open: false, busy: false, error: ''});
  const [view, setView] = useState<View>({tab: 'home', section: null, date: null});
  const [searching, setSearching] = useState(false), [notice, setNotice] = useState('');
  // 베리 계획 확인 창: undefined = 닫힘, null = 맡길 일 고르기, task = 그 계획.
  const [berryPlan, setBerryPlan] = useState<BerryTask | null | undefined>(undefined);
  const today = useMemo(seoulToday, []);
  const sessions = useMemo(() => expand(plan), [plan]);

  const download = useCallback((kind: FileKind, date?: string) => {
    const file = buildFile(plan, kind, date), url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], {type: XLSX}));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = file.name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
    setNotice(`${file.name} 파일을 내려받았어요.`);
  }, [plan]);

  useEffect(() => {
    setView(readView());
    setRouted(true);
    if (preview) return;
    let alive = true;
    fetch('/api/curriculum/status', {cache: 'no-store'}).then(response => response.ok ? response.json() : {available: false}).then(data => {if (alive) setAvailable(data.available === true);}).catch(() => {if (alive) setAvailable(false);});
    return () => {alive = false;};
  }, [preview]);

  useEffect(() => {
    if (preview || !available) return;
    let alive = true;
    fetch('/api/curriculum/plan', {cache: 'no-store'}).then(response => response.ok ? response.json() : Promise.reject(new Error())).then((data: {plan: Plan | null; version?: number}) => {
      if (!alive) return;
      if (data.plan) {setPlan(data.plan); setOriginal(data.plan); saved.current = data.plan; version.current = data.version ?? null;}
      setLoaded(true);
    }).catch(() => {if (alive) {setLoaded(true); setNotice('우리 반 계획을 불러오지 못했어요. 예시 학급을 보여 드려요.');}});
    return () => {alive = false;};
  }, [preview, available]);

  // 우리 반 계획은 바뀌면 잠시 뒤 자동 저장한다(예시 학급·시안 화면은 저장하지 않는다).
  useEffect(() => {
    if (preview || plan.sample || version.current === null || plan === saved.current) return;
    const timer = setTimeout(async () => {
      setSave({state: 'saving'});
      try {
        const response = await fetch('/api/curriculum/plan', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({plan, version: version.current})});
        const data = await response.json().catch(() => ({}));
        if (response.status === 409 && data.code === 'STALE_VERSION') {setSave({state: 'stale', message: data.error}); return;}
        if (!response.ok) {setSave({state: 'error', message: data.error ?? '저장하지 못했어요.'}); return;}
        version.current = data.version; saved.current = plan;
        setSave({state: 'saved', at: new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit'}).format(new Date())});
      } catch {setSave({state: 'error', message: '인터넷 연결을 확인해 주세요. 다시 고치면 다시 저장해요.'});}
    }, 700);
    return () => clearTimeout(timer);
  }, [plan, preview]);

  const start = useCallback(async (input: StartInput) => {
    setStarting(old => ({...old, busy: true, error: ''}));
    if (preview) {
      // 시안 화면: 서버 없이 같은 시작 계획을 만들어 흐름만 보여 준다(저장하지 않는다).
      const value = starterPlan({...input, schoolName: input.schoolName.trim(), className: input.className.trim()});
      setPlan(value); setOriginal(value); setStarting({open: false, busy: false, error: ''});
      setNotice('시안 화면이라 저장은 하지 않아요. 기초시간표부터 채워 보세요.');
      setView(old => ({...old, tab: 'curriculum', section: '1.2.3'}));
      return;
    }
    try {
      const response = await fetch('/api/curriculum/plan', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? '만들지 못했어요.');
      setPlan(data.plan); setOriginal(data.plan); saved.current = data.plan; version.current = data.version;
      setStarting({open: false, busy: false, error: ''});
      setNotice('우리 반을 만들었어요. 기초시간표부터 채워 보세요.');
      setView(old => ({...old, tab: 'curriculum', section: '1.2.3'}));
    } catch (error) {setStarting(old => ({...old, busy: false, error: (error as Error).message}));}
  }, [preview]);

  // 베리가 준 파일 링크(?download=hours)로 들어오면 그 자리에서 내려받고 주소를 정리한다.
  const handled = useRef(false);
  useEffect(() => {
    if (!available || !loaded || handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.search), kind = params.get('download');
    if (kind === 'hours' || kind === 'check' || kind === 'progress' || kind === 'weekly') {
      download(kind, params.get('date') ?? undefined);
      params.delete('download');
      history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
    }
  }, [available, loaded, download]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {event.preventDefault(); setSearching(true);} if (event.key === 'Escape') setSearching(false);};
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {if (!notice) return; const timer = setTimeout(() => setNotice(''), 3_500); return () => clearTimeout(timer);}, [notice]);

  // 메뉴 위치를 주소에 남긴다(새로고침·베리 링크로 같은 자리). 첫 주소를 읽기 전에는 건드리지 않는다.
  const [routed, setRouted] = useState(false);
  useEffect(() => {
    if (!routed) return;
    const params = new URLSearchParams();
    if (view.tab !== 'home') params.set('tab', view.tab);
    if (view.section) params.set('section', view.section);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  }, [view, routed]);
  const go = useCallback((next: Partial<View>) => {
    setView(old => ({...old, ...next}));
    // 탭만 바꾸면 맨 위로. 메뉴를 고르면 TabView가 그 화면으로 내려 준다.
    if (!next.section) window.scrollTo({top: 0, behavior: 'smooth'});
  }, []);

  // 베리 버튼은 바로 보내지 않고 계획부터 보여 준다. 확인하면 그때 베리 창으로 보낸다.
  const askBerry = useCallback((task: BerryTask | null) => setBerryPlan(task), []);
  const sendBerry = useCallback((task: BerryTask) => {
    setBerryPlan(undefined);
    if (preview) {setNotice(`시안 화면에는 베리 창이 없어요. 선생님 화면에서는 "${task.title}"를 베리가 이 계획대로 시작해요.`); return;}
    window.dispatchEvent(new CustomEvent('berry:ask', {detail: {label: task.title, prompt: task.prompt, needs: []}}));
  }, [preview]);

  if (available === null || (available && !loaded)) return <div className="cur-shell"><p className="cur-muted">교육과정 작업실을 여는 중…</p></div>;
  if (!available) return <div className="cur-shell"><div className="cur-locked"><Lock size={22}/><h2>교육과정 작업실은 아직 준비 중이에요</h2><p>지금은 일부 선생님과 먼저 시험하고 있어요.</p><Link className="cur-btn" href="/teacher">선생님 홈으로</Link></div></div>;

  const props: ViewProps = {plan, sessions, today, onPlan: setPlan, onDownload: download, original};
  return <div className="cur-shell">
    <header className="cur-hero">
      <div>
        <p className="cur-eyebrow">모두의 교실 · 교육과정 {plan.sample && <span className="cur-sample">시험용 예시 학급</span>}</p>
        <h2>교육과정 작업실</h2>
        <p className="cur-sub">{plan.schoolName} {plan.year}학년도 {plan.className} · 익숙한 교육과정 업무 순서 그대로</p>
      </div>
      <div className="cur-hero-actions">
        {!plan.sample && (preview ? <span className="cur-save">시안: 저장 안 함</span> : <SaveBadge save={save}/>)}
        <button className="cur-search-btn" onClick={() => setSearching(true)}><Search size={16}/>기능 지도<kbd>Ctrl K</kbd></button>
        <button className="cur-btn is-berry" onClick={() => askBerry(null)}><Sparkles size={16}/>베리에게 시키기</button>
      </div>
    </header>

    {plan.sample && <div className="cur-start-banner">
      <School size={20}/><div><strong>지금 보는 것은 예시 학급이에요.</strong><p>우리 반을 시작하면 시간표·기준시수·학사일정을 넣고 자동으로 저장돼요. 베리도 우리 반 자료로 답해요.</p></div>
      <button className="cur-btn" onClick={() => setStarting({open: true, busy: false, error: ''})}>우리 반 시작하기</button>
    </div>}

    <nav className="cur-tabs" aria-label="교육과정 메뉴">
      <button className={view.tab === 'home' ? 'is-on' : ''} onClick={() => go({tab: 'home', section: null})}><Layers size={16}/>홈</button>
      <button className={`cur-tab-hours${view.tab === 'hours' ? ' is-on' : ''}`} onClick={() => go({tab: 'hours', section: null})}><Clock3 size={16}/>수업시수 센터</button>
      {TABS.map(tab => <button key={tab.key} className={view.tab === tab.key ? 'is-on' : ''} onClick={() => go({tab: tab.key, section: null})}><span className="cur-tab-no">{tab.no}</span>{tab.name}</button>)}
    </nav>

    {view.tab === 'hours' ? <HoursCenter plan={plan} sessions={sessions} today={today} preview={preview} onPlan={setPlan} onDownload={download} askBerry={askBerry}/>
      : view.tab === 'home'
      ? <Home plan={plan} sessions={sessions} today={today} go={go} askBerry={askBerry} download={download}/>
      : <TabView tab={view.tab} section={view.section} date={view.date} go={go} askBerry={askBerry} props={props}/>}

    {berryPlan !== undefined && <BerryPlan key={berryPlan?.key ?? 'pick'} task={berryPlan} onConfirm={sendBerry} onClose={() => setBerryPlan(undefined)}/>}
    {searching && <FeatureMap onClose={() => setSearching(false)} onPick={feature => {setSearching(false); if (feature.link) window.location.assign(feature.link); else go({tab: feature.tab, section: feature.section});}}/>}
    {starting.open && <StartDialog busy={starting.busy} error={starting.error} onStart={start} onClose={() => setStarting({open: false, busy: false, error: ''})}/>}
    {notice && <div className="cur-toast" role="status">{notice}</div>}
  </div>;
}

function SaveBadge({save}: {save: SaveState}) {
  if (save.state === 'saving') return <span className="cur-save is-saving"><LoaderCircle size={14}/>저장 중</span>;
  if (save.state === 'saved') return <span className="cur-save is-saved"><Check size={14}/>{save.at} 저장됨</span>;
  if (save.state === 'stale') return <span className="cur-save is-error" title={save.message}><CloudOff size={14}/>다른 창에서 먼저 저장 · <button onClick={() => location.reload()}>새로고침</button></span>;
  if (save.state === 'error') return <span className="cur-save is-error" title={save.message}><CloudOff size={14}/>{save.message}</span>;
  return <span className="cur-save"><Check size={14}/>자동 저장</span>;
}

function Home({plan, sessions, today, go, askBerry, download}: {plan: Plan; sessions: ReturnType<typeof expand>; today: string; go: (view: Partial<View>) => void; askBerry: (task: BerryTask | null) => void; download: (kind: FileKind, date?: string) => void}) {
  const stats = useMemo(() => hourStats(plan, sessions), [plan, sessions]);
  let day = today;
  for (let step = 0; step < 14 && !isSchoolDay(plan, day); step++) day = addDays(day, 1);
  const todayCells = week(plan, day, sessions).find(entry => entry.date === day)?.cells ?? [];
  const progress = progressToDate(plan, today, sessions);
  const counts = {live: FEATURES.filter(feature => feature.status === 'live').length, elsewhere: FEATURES.filter(feature => feature.status === 'elsewhere').length, planned: FEATURES.filter(feature => feature.status === 'planned').length};
  const short = stats.rows.filter(row => row.diff.year < 0), over = stats.rows.filter(row => row.diff.year > 0);
  return <div className="cur-home">
    <section className="cur-berry-strip">
      <div className="cur-berry-face"><MessageCircleHeart size={22}/></div>
      <div><strong>몰라도 괜찮아요. 베리에게 말로 시키세요.</strong><p>누르면 베리가 어떻게 진행할지 먼저 보여 드려요. 확인하면 그때 시작해요.</p></div>
      <div className="cur-berry-chips">{BERRY_CHIPS.map(key => <button key={key} onClick={() => askBerry(taskOf(key))}>{taskOf(key).title}</button>)}<button onClick={() => askBerry(null)}>다른 일…</button></div>
    </section>

    <div className="cur-cards">
      <article className="cur-card is-wide">
        <header><span className="cur-card-icon tone-sky"><Clock3 size={18}/></span><div><h3>{day === today ? '오늘 시간표' : '다음 수업일 시간표'}</h3><p>{shortDate(day)}{plan.days.find(entry => entry.date === day)?.name ? ` · ${plan.days.find(entry => entry.date === day)!.name}` : ''}</p></div><button className="cur-link" onClick={() => go({tab: 'curriculum', section: '1.2.3'})}>기초시간표<ChevronRight size={15}/></button></header>
        {!todayCells.length && <div className="cur-empty"><p>{plan.templates[1].length ? '이날은 수업이 없어요.' : '기초시간표가 비어 있어요. 요일·교시별 과목을 넣으면 오늘 시간표·시수·주간학습이 한꺼번에 채워져요.'}</p>{!plan.templates[1].length && <button className="cur-btn" onClick={() => go({tab: 'curriculum', section: '1.2.3'})}>기초시간표 채우기</button>}</div>}
        <ol className="cur-today">{todayCells.map(cell => <li key={cell.period} className={`tone-${toneOf(plan, cell.subject)}`}><b>{cell.period}</b><strong>{cell.name}</strong><small>{cell.unit ? `${cell.unit}${cell.lessons ? ` · ${cell.lesson}/${cell.lessons}차시` : ''}` : ''}</small></li>)}</ol>
      </article>

      <article className="cur-card">
        <header><span className="cur-card-icon tone-mint"><BookOpenCheck size={18}/></span><div><h3>이번 주 진도</h3><p>학기 차시 중 지난 비율</p></div><button className="cur-link" onClick={() => go({tab: 'curriculum', section: '1.2.9'})}>주간학습<ChevronRight size={15}/></button></header>
        <ul className="cur-bars">{progress.slice(0, 6).map(entry => <li key={entry.subject}><span>{entry.name === '창의적 체험활동' ? '창체' : entry.name}</span><i><em className={`tone-${toneOf(plan, entry.subject)}`} style={{width: `${entry.total ? Math.round(entry.done / entry.total * 100) : 0}%`}}/></i><small>{entry.done}/{entry.total}</small></li>)}</ul>
        <footer><button className="cur-btn is-ghost" onClick={() => download('weekly', schoolWeekOf(today))}><FileSpreadsheet size={15}/>이번 주 엑셀</button></footer>
      </article>

      <article className="cur-card">
        <header><span className="cur-card-icon tone-coral"><CalendarDays size={18}/></span><div><h3>시수 현황</h3><p>학교 기준과 비교</p></div><button className="cur-link" onClick={() => go({tab: 'hours', section: null})}>수업시수 센터<ChevronRight size={15}/></button></header>
        <div className="cur-gauge"><strong>{stats.schoolDays.year}</strong><span>/ {stats.daysRequired}일 수업</span><i><em style={{width: `${Math.min(100, Math.round(stats.schoolDays.year / stats.daysRequired * 100))}%`}}/></i></div>
        <div className="cur-diff-list">{short.map(row => <span key={row.subject} className="is-short">{row.name} {row.diff.year}</span>)}{over.map(row => <span key={row.subject} className="is-over">{row.name} +{row.diff.year}</span>)}{!short.length && !over.length && <span className="is-even">모두 기준과 같아요</span>}</div>
        <footer><button className="cur-btn is-ghost" onClick={() => download('hours')}><Download size={15}/>시수 엑셀</button></footer>
      </article>

      <article className="cur-card is-soon">
        <header><span className="cur-card-icon tone-lavender"><ClipboardList size={18}/></span><div><h3>평가 현황</h3><p>수행·단원·지필 입력률</p></div><span className="cur-phase">2단계</span></header>
        <p className="cur-soon-text">학급명부와 평가 계획이 들어오면 과목별 입력률과 미입력 학생이 여기 보여요.</p>
        <footer><button className="cur-link" onClick={() => go({tab: 'assessment', section: null})}>평가 메뉴 미리 보기<ChevronRight size={15}/></button></footer>
      </article>

      <article className="cur-card is-soon">
        <header><span className="cur-card-icon tone-rose"><NotebookPen size={18}/></span><div><h3>평어·나이스</h3><p>근거로 쓰는 초안, 붙여넣기 보조</p></div><span className="cur-phase">2단계</span></header>
        <p className="cur-soon-text">수업·평가·작품 기록을 근거로 베리가 초안을 만들고, 나이스에는 선생님이 직접 붙여넣어요.</p>
        <footer><button className="cur-link" onClick={() => go({tab: 'assessment', section: '2.5'})}>교과-종합의견<ChevronRight size={15}/></button></footer>
      </article>

      <article className="cur-card">
        <header><span className="cur-card-icon tone-apricot"><Wand2 size={18}/></span><div><h3>수업도우미</h3><p>모두의 교실 도구로 바로</p></div></header>
        <div className="cur-quick">
          <Link href="/teacher/tools/draw">발표자 뽑기</Link><Link href="/teacher/tools/seats">자리·모둠</Link><Link href="/teacher/tools/timer">타이머</Link>
        </div>
      </article>
    </div>

    <section className="cur-coverage">
      <div><h3>교육과정 기능 {FEATURES.length}개</h3><p>모든 기능이 메뉴에 자리를 갖고 있어요. 단계별로 채워 갑니다.</p></div>
      <div className="cur-coverage-bar" aria-label="기능 진행 상황"><em className="is-live" style={{flex: counts.live}}/><em className="is-elsewhere" style={{flex: counts.elsewhere}}/><em className="is-planned" style={{flex: counts.planned}}/></div>
      <div className="cur-coverage-legend"><span className="is-live">지금 사용 {counts.live}</span><span className="is-elsewhere">모두의 교실에 있음 {counts.elsewhere}</span><span className="is-planned">준비 중 {counts.planned}</span></div>
      <div className="cur-tab-tiles">{TABS.map(tab => {const mine = FEATURES.filter(feature => feature.tab === tab.key); return <button key={tab.key} onClick={() => go({tab: tab.key, section: null})}><span className="cur-tab-no">{tab.no}</span><strong>{tab.name}</strong><small>{tab.summary}</small><em>{mine.length}개 기능 · 핵심 {mine.filter(feature => feature.core).length}<ArrowRight size={14}/></em></button>;})}</div>
    </section>
  </div>;
}

function TabView({tab, section, date, go, askBerry, props}: {tab: TabKey; section: string | null; date: string | null; go: (view: Partial<View>) => void; askBerry: (task: BerryTask | null) => void; props: ViewProps}) {
  const steps = STEPS.filter(step => step.tab === tab), core = FEATURES.filter(feature => feature.tab === tab && feature.core);
  const current = section ? SECTIONS.find(entry => entry.key === section && entry.tab === tab) ?? null : null;
  const page = current?.page as SectionViewKey | undefined, Page = page ? SECTION_VIEWS[page] : null;
  const info = TABS.find(entry => entry.key === tab)!, crumb = useRef<HTMLDivElement>(null);
  useEffect(() => {if (section) crumb.current?.scrollIntoView({behavior: 'smooth', block: 'start'});}, [section]);
  return <div className="cur-tabview">
    <section className={`cur-flow${current ? ' is-compact' : ''}`} aria-label={`${info.name} 작성 순서`}>
      {steps.map((step, index) => <div className="cur-flow-step" key={step.key}>
        <div className="cur-flow-head"><span className="cur-flow-no">{step.no}</span><div><strong>{step.name}</strong><small>{step.who}</small></div></div>
        <div className="cur-flow-sections">{step.sections.map(key => {
          const mine = FEATURES.filter(feature => feature.section === key), live = mine.filter(feature => feature.status !== 'planned').length;
          return <button key={key} className={`${section === key ? 'is-on' : ''}${SECTION_PAGES[key] ? ' has-page' : ''}`} onClick={() => go({section: key})}>
            <span>{sectionName(key)}</span><small>{live ? `${live}/${mine.length}` : mine.length}</small>
          </button>;
        })}</div>
        {index < steps.length - 1 && <span className="cur-flow-arrow" aria-hidden><ArrowRight size={18}/></span>}
      </div>)}
    </section>

    {!current && <>
      <h3 className="cur-section-title"><Star size={16}/>{info.name}의 핵심 기능</h3>
      <div className="cur-core">{core.map(feature => <FeatureCard key={feature.id} feature={feature} go={go} askBerry={askBerry}/>)}</div>
      <p className="cur-muted cur-hint">위 흐름에서 메뉴를 누르면 그 메뉴의 화면과 세부 기능이 열려요. 숫자는 지금 되는 기능 / 전체 기능이에요.</p>
    </>}

    {current && <>
      <div className="cur-crumb" ref={crumb}><button onClick={() => go({section: null})}>{info.name}</button><ChevronRight size={14}/><strong>{current.name}</strong></div>
      {Page && (page === 'weekly' ? <WeeklyView {...props} focusDate={date ?? undefined}/> : <Page {...props}/>)}
      {!Page && <div className="cur-planned-banner"><Sparkles size={18}/><div><strong>{current.name} 화면은 단계별로 만드는 중이에요.</strong><p>아래 기능 목록에서 지금 하던 일이 어떻게 바뀌는지 미리 볼 수 있어요.</p></div></div>}
      <FeatureList features={FEATURES.filter(feature => feature.section === current.key)} askBerry={askBerry}/>
    </>}
  </div>;
}

function FeatureCard({feature, go, askBerry}: {feature: Feature; go: (view: Partial<View>) => void; askBerry: (task: BerryTask | null) => void}) {
  return <article className={`cur-feature-card ${STATUS_TONE[feature.status]}`}>
    <span className="cur-status">{STATUS_LABELS[feature.status]}{feature.status === 'planned' && ` · ${feature.phase}단계`}</span>
    <small>{sectionName(feature.section)}</small>
    <h4>{feature.want}</h4>
    <p>{feature.ours}</p>
    <footer>
      {feature.link ? <Link className="cur-link" href={feature.link}>열기<ChevronRight size={15}/></Link> : <button className="cur-link" onClick={() => go({section: feature.section})}>메뉴 열기<ChevronRight size={15}/></button>}
      {feature.berry && <button className="cur-link is-berry" onClick={() => askBerry(featureTask(feature))}><Sparkles size={14}/>베리</button>}
    </footer>
  </article>;
}

function FeatureList({features, askBerry}: {features: Feature[]; askBerry: (task: BerryTask | null) => void}) {
  return <section className="cur-features">
    <h3 className="cur-section-title">세부 기능 {features.length}개</h3>
    <ul>{features.map(feature => <li key={feature.id} className={STATUS_TONE[feature.status]}>
      <div className="cur-feature-main">
        <span className="cur-feature-id">{feature.id}</span>
        <strong>{feature.name}{feature.core && <Star size={13} className="cur-star" aria-label="핵심"/>}</strong>
        <p><b>원하는 것</b>{feature.want}</p>
        <p className="is-limit"><b>기존 방식</b>{feature.limit}</p>
        <p className="is-ours"><b>모두의 교실</b>{feature.ours}</p>
      </div>
      <div className="cur-feature-side">
        <span className="cur-status">{STATUS_LABELS[feature.status]}{feature.status === 'planned' && ` · ${feature.phase}단계`}</span>
        {feature.link && <Link className="cur-link" href={feature.link}>열기<ChevronRight size={14}/></Link>}
        {feature.berry && <button className="cur-link is-berry" onClick={() => askBerry(featureTask(feature))}><Sparkles size={13}/>베리</button>}
      </div>
    </li>)}</ul>
  </section>;
}
