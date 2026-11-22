'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {ArrowRight, BookOpenCheck, CalendarDays, ChevronRight, ClipboardList, Clock3, Download, FileSpreadsheet, Layers, Lock, MessageCircleHeart, NotebookPen, Search, Sparkles, Star, Wand2, X} from 'lucide-react';
import {FEATURES, SECTIONS, SECTION_PAGES, STATUS_LABELS, STEPS, TABS, searchFeatures, sectionName, type Feature, type TabKey} from './features';
import {addDays, expand, hourStats, isSchoolDay, progressToDate, schoolWeekOf, shortDate, week, type Plan} from './engine';
import {buildFile, type FileKind} from './files';
import {SAMPLE_PLAN} from './sample';
import {SECTION_VIEWS, WeeklyView, toneOf, type SectionViewKey, type ViewProps} from './views';
import './styles.css';

/**
 * 교육과정 작업실(스쿨마스터 대체). 위 탭은 스쿨마스터의 큰 메뉴 순서, 탭 안은 스쿨마스터 "작성 흐름도"를 그대로 따른다.
 * 기능 229개는 모두 메뉴에 자리가 있고, 각 탭 맨 위에 핵심 기능 카드가 먼저 보인다.
 * preview: 로그인 없는 로컬 시안 페이지(/curriculum-preview). 서버를 부르지 않는다.
 */
type View = {tab: 'home' | TabKey; section: string | null; date: string | null};
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const seoulToday = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const BERRY_EXAMPLES = ['시수 정리된 엑셀 만들어줘', '이번 주 주간학습 보여줘', '모자란 시수가 있는 교과 알려줘', '스쿨마스터 연간시수 자동맞추기는 어디 있어?'];
const STATUS_TONE: Record<Feature['status'], string> = {live: 'is-live', elsewhere: 'is-elsewhere', planned: 'is-planned'};

function readView(): View {
  const params = new URLSearchParams(window.location.search), tab = params.get('tab');
  return {tab: TABS.some(entry => entry.key === tab) ? tab as TabKey : 'home', section: params.get('section'), date: params.get('date')};
}

export default function CurriculumWorkspace({preview = false}: {preview?: boolean}) {
  const [available, setAvailable] = useState<boolean | null>(preview ? true : null);
  const [plan, setPlan] = useState<Plan>(SAMPLE_PLAN);
  const [view, setView] = useState<View>({tab: 'home', section: null, date: null});
  const [searching, setSearching] = useState(false), [notice, setNotice] = useState('');
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

  // 베리가 준 파일 링크(?download=hours)로 들어오면 그 자리에서 내려받고 주소를 정리한다.
  const handled = useRef(false);
  useEffect(() => {
    if (!available || handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.search), kind = params.get('download');
    if (kind === 'hours' || kind === 'progress' || kind === 'weekly') {
      download(kind, params.get('date') ?? undefined);
      params.delete('download');
      history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
    }
  }, [available, download]);

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

  const askBerry = useCallback((prompt: string) => {
    if (preview) {setNotice(`시안 화면에는 베리 창이 없어요. 선생님 화면에서는 "${prompt}"가 베리에게 바로 전달돼요.`); return;}
    window.dispatchEvent(new CustomEvent('berry:ask', {detail: {label: '교육과정', prompt, needs: []}}));
  }, [preview]);

  if (available === null) return <div className="cur-shell"><p className="cur-muted">교육과정 작업실을 여는 중…</p></div>;
  if (!available) return <div className="cur-shell"><div className="cur-locked"><Lock size={22}/><h2>교육과정 작업실은 아직 준비 중이에요</h2><p>지금은 일부 선생님과 먼저 시험하고 있어요.</p><Link className="cur-btn" href="/teacher">선생님 홈으로</Link></div></div>;

  const props: ViewProps = {plan, sessions, today, onPlan: setPlan, onDownload: download, original: SAMPLE_PLAN};
  return <div className="cur-shell">
    <header className="cur-hero">
      <div>
        <p className="cur-eyebrow">모두의 교실 · 교육과정 {plan.sample && <span className="cur-sample">시험용 예시 학급</span>}</p>
        <h2>교육과정 작업실</h2>
        <p className="cur-sub">{plan.schoolName} {plan.year}학년도 {plan.className} · 스쿨마스터에서 하던 일을 같은 순서로</p>
      </div>
      <div className="cur-hero-actions">
        <button className="cur-search-btn" onClick={() => setSearching(true)}><Search size={16}/>기능 찾기<kbd>Ctrl K</kbd></button>
        <button className="cur-btn is-berry" onClick={() => askBerry('교육과정 메뉴에서 지금 할 수 있는 일을 알려줘')}><Sparkles size={16}/>베리에게 시키기</button>
      </div>
    </header>

    <nav className="cur-tabs" aria-label="교육과정 메뉴">
      <button className={view.tab === 'home' ? 'is-on' : ''} onClick={() => go({tab: 'home', section: null})}><Layers size={16}/>홈</button>
      {TABS.map(tab => <button key={tab.key} className={view.tab === tab.key ? 'is-on' : ''} onClick={() => go({tab: tab.key, section: null})}><span className="cur-tab-no">{tab.no}</span>{tab.name}</button>)}
    </nav>

    {view.tab === 'home'
      ? <Home plan={plan} sessions={sessions} today={today} go={go} askBerry={askBerry} download={download}/>
      : <TabView tab={view.tab} section={view.section} date={view.date} go={go} askBerry={askBerry} props={props}/>}

    {searching && <SearchDialog onClose={() => setSearching(false)} onPick={feature => {setSearching(false); if (feature.link) window.location.assign(feature.link); else go({tab: feature.tab, section: feature.section});}}/>}
    {notice && <div className="cur-toast" role="status">{notice}</div>}
  </div>;
}

function Home({plan, sessions, today, go, askBerry, download}: {plan: Plan; sessions: ReturnType<typeof expand>; today: string; go: (view: Partial<View>) => void; askBerry: (prompt: string) => void; download: (kind: FileKind, date?: string) => void}) {
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
      <div><strong>몰라도 괜찮아요. 베리에게 말로 시키세요.</strong><p>시수 계산, 파일 만들기, 스쿨마스터 기능 위치까지 베리가 대신 찾아요.</p></div>
      <div className="cur-berry-chips">{BERRY_EXAMPLES.map(text => <button key={text} onClick={() => askBerry(text)}>{text}</button>)}</div>
    </section>

    <div className="cur-cards">
      <article className="cur-card is-wide">
        <header><span className="cur-card-icon tone-sky"><Clock3 size={18}/></span><div><h3>{day === today ? '오늘 시간표' : '다음 수업일 시간표'}</h3><p>{shortDate(day)}{plan.days.find(entry => entry.date === day)?.name ? ` · ${plan.days.find(entry => entry.date === day)!.name}` : ''}</p></div><button className="cur-link" onClick={() => go({tab: 'curriculum', section: '1.2.3'})}>기초시간표<ChevronRight size={15}/></button></header>
        <ol className="cur-today">{todayCells.map(cell => <li key={cell.period} className={`tone-${toneOf(plan, cell.subject)}`}><b>{cell.period}</b><strong>{cell.name}</strong><small>{cell.unit ? `${cell.unit}${cell.lessons ? ` · ${cell.lesson}/${cell.lessons}차시` : ''}` : ''}</small></li>)}</ol>
      </article>

      <article className="cur-card">
        <header><span className="cur-card-icon tone-mint"><BookOpenCheck size={18}/></span><div><h3>이번 주 진도</h3><p>학기 차시 중 지난 비율</p></div><button className="cur-link" onClick={() => go({tab: 'curriculum', section: '1.2.9'})}>주간학습<ChevronRight size={15}/></button></header>
        <ul className="cur-bars">{progress.slice(0, 6).map(entry => <li key={entry.subject}><span>{entry.name === '창의적 체험활동' ? '창체' : entry.name}</span><i><em className={`tone-${toneOf(plan, entry.subject)}`} style={{width: `${entry.total ? Math.round(entry.done / entry.total * 100) : 0}%`}}/></i><small>{entry.done}/{entry.total}</small></li>)}</ul>
        <footer><button className="cur-btn is-ghost" onClick={() => download('weekly', schoolWeekOf(today))}><FileSpreadsheet size={15}/>이번 주 엑셀</button></footer>
      </article>

      <article className="cur-card">
        <header><span className="cur-card-icon tone-coral"><CalendarDays size={18}/></span><div><h3>시수 현황</h3><p>학교 기준과 비교</p></div><button className="cur-link" onClick={() => go({tab: 'curriculum', section: '1.2.4'})}>통계표<ChevronRight size={15}/></button></header>
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
      <div><h3>스쿨마스터 기능 {FEATURES.length}개</h3><p>모든 기능이 메뉴에 자리를 갖고 있어요. 단계별로 채워 갑니다.</p></div>
      <div className="cur-coverage-bar" aria-label="기능 진행 상황"><em className="is-live" style={{flex: counts.live}}/><em className="is-elsewhere" style={{flex: counts.elsewhere}}/><em className="is-planned" style={{flex: counts.planned}}/></div>
      <div className="cur-coverage-legend"><span className="is-live">지금 사용 {counts.live}</span><span className="is-elsewhere">모두의 교실에 있음 {counts.elsewhere}</span><span className="is-planned">준비 중 {counts.planned}</span></div>
      <div className="cur-tab-tiles">{TABS.map(tab => {const mine = FEATURES.filter(feature => feature.tab === tab.key); return <button key={tab.key} onClick={() => go({tab: tab.key, section: null})}><span className="cur-tab-no">{tab.no}</span><strong>{tab.name}</strong><small>{tab.summary}</small><em>{mine.length}개 기능 · 핵심 {mine.filter(feature => feature.core).length}<ArrowRight size={14}/></em></button>;})}</div>
    </section>
  </div>;
}

function TabView({tab, section, date, go, askBerry, props}: {tab: TabKey; section: string | null; date: string | null; go: (view: Partial<View>) => void; askBerry: (prompt: string) => void; props: ViewProps}) {
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
      {!Page && <div className="cur-planned-banner"><Sparkles size={18}/><div><strong>{current.name} 화면은 단계별로 만드는 중이에요.</strong><p>아래 기능 목록에서 스쿨마스터의 어떤 일을 어떻게 바꾸는지 미리 볼 수 있어요.</p></div></div>}
      <FeatureList features={FEATURES.filter(feature => feature.section === current.key)} askBerry={askBerry}/>
    </>}
  </div>;
}

function FeatureCard({feature, go, askBerry}: {feature: Feature; go: (view: Partial<View>) => void; askBerry: (prompt: string) => void}) {
  return <article className={`cur-feature-card ${STATUS_TONE[feature.status]}`}>
    <span className="cur-status">{STATUS_LABELS[feature.status]}{feature.status === 'planned' && ` · ${feature.phase}단계`}</span>
    <small>{sectionName(feature.section)}</small>
    <h4>{feature.want}</h4>
    <p>{feature.ours}</p>
    <footer>
      {feature.link ? <Link className="cur-link" href={feature.link}>열기<ChevronRight size={15}/></Link> : <button className="cur-link" onClick={() => go({section: feature.section})}>메뉴 열기<ChevronRight size={15}/></button>}
      {feature.berry && <button className="cur-link is-berry" onClick={() => askBerry(`${feature.want} — 베리가 해 줘`)}><Sparkles size={14}/>베리</button>}
    </footer>
  </article>;
}

function FeatureList({features, askBerry}: {features: Feature[]; askBerry: (prompt: string) => void}) {
  return <section className="cur-features">
    <h3 className="cur-section-title">세부 기능 {features.length}개</h3>
    <ul>{features.map(feature => <li key={feature.id} className={STATUS_TONE[feature.status]}>
      <div className="cur-feature-main">
        <span className="cur-feature-id">SM-{feature.id}</span>
        <strong>{feature.name}{feature.core && <Star size={13} className="cur-star" aria-label="핵심"/>}</strong>
        <p><b>원하는 것</b>{feature.want}</p>
        <p className="is-limit"><b>스쿨마스터</b>{feature.limit}</p>
        <p className="is-ours"><b>모두의 교실</b>{feature.ours}</p>
      </div>
      <div className="cur-feature-side">
        <span className="cur-status">{STATUS_LABELS[feature.status]}{feature.status === 'planned' && ` · ${feature.phase}단계`}</span>
        {feature.link && <Link className="cur-link" href={feature.link}>열기<ChevronRight size={14}/></Link>}
        {feature.berry && <button className="cur-link is-berry" onClick={() => askBerry(`${feature.want} — 베리가 해 줘`)}><Sparkles size={13}/>베리</button>}
      </div>
    </li>)}</ul>
  </section>;
}

function SearchDialog({onClose, onPick}: {onClose: () => void; onPick: (feature: Feature) => void}) {
  const [query, setQuery] = useState(''), input = useRef<HTMLInputElement>(null);
  const found = useMemo(() => searchFeatures(query, 12), [query]);
  useEffect(() => {input.current?.focus();}, []);
  return <div className="cur-dialog" role="dialog" aria-modal="true" aria-label="스쿨마스터 기능 찾기" onClick={onClose}>
    <div className="cur-dialog-card" onClick={event => event.stopPropagation()}>
      <div className="cur-dialog-input"><Search size={18}/><input ref={input} value={query} onChange={event => setQuery(event.target.value)} placeholder="스쿨마스터에서 하던 일 (예: 연간시수 자동맞추기, 나이스 올리기)" onKeyDown={event => {if (event.key === 'Enter' && found[0]) onPick(found[0]);}}/><button className="cur-icon" aria-label="닫기" onClick={onClose}><X size={18}/></button></div>
      <ul>{found.map(feature => <li key={feature.id}><button onClick={() => onPick(feature)}>
        <span className={`cur-dot ${STATUS_TONE[feature.status]}`}/>
        <span><strong>{sectionName(feature.section)} · {feature.name}</strong><small>{TABS.find(tab => tab.key === feature.tab)!.name} · {STATUS_LABELS[feature.status]}{feature.status === 'planned' ? ` · ${feature.phase}단계` : ''}</small></span>
        <ChevronRight size={16}/>
      </button></li>)}
        {query.trim() && !found.length && <li className="cur-muted">찾는 기능이 없어요. 다른 말로 찾아보거나 베리에게 물어보세요.</li>}
        {!query.trim() && <li className="cur-muted">{FEATURES.length}개 기능 전부에서 찾아요. 단어 두 개를 띄어 쓰면 둘 다 들어간 것만 보여요.</li>}
      </ul>
    </div>
  </div>;
}

