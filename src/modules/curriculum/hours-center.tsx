'use client';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {AlertTriangle, CheckCircle2, ChevronDown, Download, FileUp, Info, LoaderCircle, Minus, Plus, Trash2, Undo2, Wand2, X} from 'lucide-react';
import {applyOverrides, causes, hourStats, isSchoolDay, progressToDate, semesterOf, shortDate, suggestAdjust, type Override, type Plan, type Session} from './engine';
import {RULE_SOURCE, UNVERIFIED, nationalChecks, type Verdict} from './rules';
import {applyFindings, type DayFinding, type Findings, type StandardFinding, type TemplateFinding} from './readers';
import type {FileKind} from './files';
import {taskOf, type BerryTask} from './berry-tasks';

/**
 * 수업시수 센터: 기존 교육과정 메뉴는 그대로 두고, 시수만 한 화면에서 푼다.
 * ① 자료 현황(무엇을 올렸고 무엇이 빠졌나) ② 시수 판정(학교 기준·국가 규칙, 원인) ③ 조절판(날짜 단위 제안 → 적용) ④ 운영 추적.
 * 모든 숫자는 engine·rules가 계산하고, 적용은 계획(plan)을 바꿔 기존 자동 저장을 탄다.
 */
type Source = {id: string; name: string; role: string; size: number; status: 'uploading' | 'uploaded' | 'read' | 'failed'; createdAt: string; error: string | null; findings: Findings | null};
type Props = {plan: Plan; sessions: Session[]; today: string; preview: boolean; onPlan: (plan: Plan) => void; onDownload: (kind: FileKind) => void; askBerry: (task: BerryTask) => void};

const ROLES: {key: string; label: string; level: '필수' | '권장' | '선택'; hint: string}[] = [
  {key: 'standards', label: '교육과정 편제표(시간 배당표)', level: '필수', hint: '학년·학기별 교과 기준시수'},
  {key: 'calendar', label: '학사일정', level: '필수', hint: '방학·재량휴업일·행사일'},
  {key: 'timetable', label: '기초시간표', level: '필수', hint: '요일·교시별 과목'},
  {key: 'events', label: '학교 행사계획', level: '권장', hint: '행사일·단축 교시'},
  {key: 'assignments', label: '전담·특별실 배정표', level: '권장', hint: '전담 과목·시간'},
  {key: 'guideline', label: '교육청 편성·운영 지침', level: '선택', hint: '지역 의무 시수(다음 단계에서 읽음)'},
  {key: 'progress', label: '교과 진도표·지도서 차시', level: '선택', hint: '단원별 차시(다음 단계)'},
  {key: 'themes', label: '안전·범교과 운영 계획', level: '선택', hint: '주제별 목표 시수(다음 단계)'},
  {key: 'previous', label: '작년 시수표·기존 프로그램 출력물', level: '선택', hint: '작년과 비교(다음 단계)'},
];
const VERDICT_TEXT: Record<Verdict, string> = {ok: '맞음', short: '모자람', over: '넘음', info: '참고'};
const signed = (value: number) => value > 0 ? `+${value}` : String(value);

export default function HoursCenter({plan, sessions, today, preview, onPlan, onDownload, askBerry}: Props) {
  const stats = useMemo(() => hourStats(plan, sessions), [plan, sessions]);
  const checks = useMemo(() => nationalChecks(plan, stats), [plan, stats]);
  const why = useMemo(() => causes(plan), [plan]);
  const [sources, setSources] = useState<Source[]>([]), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const [reviewing, setReviewing] = useState<Source | null>(null), [opened, setOpened] = useState<string | null>(null);
  const semesterNow = semesterOf(plan, today < plan.startsOn ? plan.startsOn : today);

  const load = useCallback(async () => {
    if (preview || plan.sample) return;
    const response = await fetch('/api/curriculum/sources', {cache: 'no-store'}).catch(() => null);
    if (response?.ok) setSources((await response.json()).sources);
  }, [preview, plan.sample]);
  useEffect(() => {void load();}, [load]);

  async function upload(role: string, file: File) {
    setError(''); setBusy(role);
    try {
      const made = await fetch('/api/curriculum/sources', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: file.name, size: file.size, role})});
      const data = await made.json();
      if (!made.ok) throw new Error(data.error ?? '올리지 못했어요.');
      const sent = await fetch(data.uploadUrl, {method: 'PUT', headers: data.headers, body: file});
      if (!sent.ok) throw new Error('파일을 보내지 못했어요. 인터넷 연결을 확인해 주세요.');
      const read = await fetch(`/api/curriculum/sources/${data.id}/read`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      const result = await read.json();
      if (!read.ok) throw new Error(result.error ?? '읽지 못했어요.');
      await load();
      if (result.status === 'read') setReviewing(result); else setError(result.error ?? '읽지 못했어요.');
    } catch (cause) {setError((cause as Error).message);} finally {setBusy(null);}
  }
  async function remove(id: string) {
    await fetch(`/api/curriculum/sources/${id}/delete`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    await load();
  }

  const have = {
    standards: stats.rows.some(row => row.hasStandard), calendar: plan.days.some(day => day.kind === 'vacation'), timetable: plan.templates[1].length > 0,
  } as Record<string, boolean>;
  const required = ROLES.filter(role => role.level === '필수'), ready = required.filter(role => have[role.key]).length;

  return <div className="hc">
    <header className="hc-head">
      <div><h3>수업시수 센터</h3><p>자료를 올리거나 직접 넣으면 시수가 맞는지, 왜 어긋났는지, 어떻게 맞출지 한 화면에서 보여요.</p></div>
      <div className="cur-actions">
        <button className="cur-btn is-ghost" onClick={() => askBerry(taskOf('check-hours'))}>베리에게 점검 맡기기</button>
        <button className="cur-btn is-ghost" onClick={() => onDownload('hours')}><Download size={16}/>시수표</button>
        <button className="cur-btn" onClick={() => onDownload('check')}><Download size={16}/>점검표</button>
      </div>
    </header>

    <div className="hc-grid">
      {/* ① 자료 현황 */}
      <section className="hc-card">
        <h4><span className="hc-no">1</span>자료 현황 <small>필수 {ready}/{required.length}</small></h4>
        <div className="hc-meter"><em style={{width: `${ready / required.length * 100}%`}}/></div>
        {plan.sample && <p className="cur-muted">예시 학급이에요. 우리 반을 시작하면 자료를 올릴 수 있어요.</p>}
        {error && <p className="cur-error">{error}</p>}
        <ul className="hc-sources">{ROLES.map(role => {
          const mine = sources.filter(source => source.role === role.key), done = have[role.key];
          return <li key={role.key} className={done ? 'is-done' : role.level === '필수' ? 'is-need' : ''}>
            <div className="hc-source-main">
              {done ? <CheckCircle2 size={16}/> : role.level === '필수' ? <AlertTriangle size={16}/> : <Info size={16}/>}
              <div><strong>{role.label}</strong><small>{role.level} · {role.hint}</small>
                {mine.map(source => <span key={source.id} className={`hc-file is-${source.status}`}>
                  {source.name} · {source.status === 'read' ? '읽음' : source.status === 'failed' ? '못 읽음' : '올리는 중'}
                  {source.status === 'read' && source.findings && <button onClick={() => setReviewing(source)}>확인하기</button>}
                  {source.error && <em>{source.error}</em>}
                  <button aria-label={`${source.name} 지우기`} onClick={() => remove(source.id)}><Trash2 size={13}/></button>
                </span>)}
              </div>
            </div>
            {!preview && !plan.sample && <label className={`cur-btn is-ghost hc-upload${busy === role.key ? ' is-busy' : ''}`}>
              {busy === role.key ? <LoaderCircle size={15} className="hc-spin"/> : <FileUp size={15}/>}{busy === role.key ? '읽는 중' : '올리기'}
              <input type="file" accept=".xlsx,.hwpx,.hwp,.pdf,.png,.jpg,.jpeg" disabled={!!busy} onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(role.key, file);}}/>
            </label>}
          </li>;
        })}</ul>
        <p className="cur-muted">지금은 엑셀(XLSX)·한글(HWPX)을 읽어요. 옛 한글(HWP)은 한글에서 HWPX로 저장해 올려 주세요. 올린 파일은 선생님만 볼 수 있어요.</p>
      </section>

      {/* ② 시수 판정 */}
      <section className="hc-card">
        <h4><span className="hc-no">2</span>시수 판정</h4>
        <div className="hc-subjects">{stats.rows.map(row => {
          const list = why.get(row.subject) ?? [], open = opened === row.subject, diff = row.diff.year;
          const tone = !row.hasStandard ? 'hc-none' : diff < 0 ? 'hc-short' : diff > 0 ? 'hc-over' : 'hc-even';
          return <div key={row.subject} className={`hc-subject ${tone}`}>
            <button className="hc-subject-row" aria-expanded={open} onClick={() => setOpened(open ? null : row.subject)}>
              <strong>{row.name === '창의적 체험활동' ? '창체' : row.name}</strong>
              <span>{row.planned.year}{row.hasStandard ? ` / ${row.standard.year}` : ''}</span>
              <em>{row.hasStandard ? signed(diff) : '기준 없음'}</em>
              <ChevronDown size={15}/>
            </button>
            {open && <div className="hc-causes">
              {row.hasStandard && <p>1학기 {signed(row.diff[1])} · 2학기 {signed(row.diff[2])}</p>}
              {list.length ? <ul>{list.slice(0, 12).map(cause => <li key={`${cause.date}-${cause.period ?? ''}-${cause.kind}`}><b>{shortDate(cause.date)}</b> {cause.name}{cause.period ? ` ${cause.period}교시` : ''} <span className={cause.delta < 0 ? 'is-short' : 'is-over'}>{signed(cause.delta)}</span></li>)}{list.length > 12 && <li className="cur-muted">외 {list.length - 12}건(점검표에 전부)</li>}</ul> : <p className="cur-muted">시간표대로 빠짐없이 열려요.</p>}
            </div>}
          </div>;
        })}</div>
        <h5>국가 기준 <small>{RULE_SOURCE.title}</small></h5>
        <ul className="hc-checks">{checks.map(check => <li key={check.id} className={`is-${check.verdict}`}><span>{VERDICT_TEXT[check.verdict]}</span><div><strong>{check.title}</strong><small>{check.detail}</small></div></li>)}</ul>
        <details className="hc-unverified"><summary>아직 확인하지 못한 기준 {UNVERIFIED.length}가지(판정하지 않음)</summary><ul>{UNVERIFIED.map(item => <li key={item}>{item}</li>)}</ul></details>
      </section>

      {/* ③ 조절판 */}
      <Adjuster plan={plan} today={today} semesterNow={semesterNow} onPlan={onPlan}/>

      {/* ④ 운영 추적 */}
      <Tracker plan={plan} sessions={sessions} today={today} semesterNow={semesterNow} stats={stats}/>
    </div>

    {reviewing?.findings && <FindingsDialog plan={plan} source={reviewing} onClose={() => setReviewing(null)} onApply={next => {onPlan(next); setReviewing(null);}}/>}
  </div>;
}

function Adjuster({plan, today, semesterNow, onPlan}: {plan: Plan; today: string; semesterNow: 1 | 2; onPlan: (plan: Plan) => void}) {
  const stats = useMemo(() => hourStats(plan), [plan]);
  const [semester, setSemester] = useState<1 | 2>(semesterNow), [subject, setSubject] = useState(''), [amount, setAmount] = useState(1), [chosen, setChosen] = useState(false);
  const short = stats.rows.filter(row => row.hasStandard && row.diff[semester] !== 0).sort((a, b) => a.diff[semester] - b.diff[semester]);
  const target = subject || short[0]?.subject || '';
  const from = today > plan.startsOn ? today : plan.startsOn;
  const proposal = useMemo(() => target ? suggestAdjust(plan, target, amount, from, semester) : [], [plan, target, amount, from, semester]);
  const nameOf = (key: string | null) => key ? plan.subjects.find(entry => entry.key === key)?.name ?? key : '비움';
  const before = (change: Override) => plan.templates[semesterOf(plan, change.date)].find(slot => slot.weekday === new Date(`${change.date}T00:00:00Z`).getUTCDay() && slot.period === change.period)?.subject ?? null;
  const current = (plan.overrides ?? []).filter(change => semesterOf(plan, change.date) === semester);
  const quick = (row: typeof stats.rows[number]) => {setSubject(row.subject); setAmount(Math.min(20, Math.abs(row.diff[semester])) * (row.diff[semester] < 0 ? 1 : -1)); setChosen(true);};
  return <section className="hc-card">
    <h4><span className="hc-no">3</span>조절판</h4>
    <div className="cur-seg">{([1, 2] as const).map(value => <button key={value} className={semester === value ? 'is-on' : ''} onClick={() => setSemester(value)}>{value}학기</button>)}</div>
    {short.length ? <div className="hc-quick">{short.map(row => <button key={row.subject} className={row.diff[semester] < 0 ? 'is-short' : 'is-over'} onClick={() => quick(row)}>{row.name} {signed(row.diff[semester])} 맞추기</button>)}</div>
      : <p className="cur-muted">{stats.rows.some(row => row.hasStandard) ? '이 학기는 기준과 모두 같아요.' : '기준시수를 넣으면 맞출 교과가 여기 나와요.'}</p>}
    <div className="hc-adjust">
      <select value={target} onChange={event => {setSubject(event.target.value); setChosen(true);}} aria-label="맞출 교과">{plan.subjects.map(entry => <option key={entry.key} value={entry.key}>{entry.name}</option>)}</select>
      <button className="cur-icon" aria-label="줄이기" onClick={() => {setAmount(value => Math.max(-20, value - 1) || -1); setChosen(true);}}><Minus size={15}/></button>
      <strong>{signed(amount)}시간</strong>
      <button className="cur-icon" aria-label="늘리기" onClick={() => {setAmount(value => Math.min(20, value + 1) || 1); setChosen(true);}}><Plus size={15}/></button>
    </div>
    {target && chosen && <div className="hc-proposal">
      {proposal.length ? <>
        <p><Wand2 size={14}/>{shortDate(from)} 이후 {proposal.length}칸을 바꾸면 돼요{proposal.length < Math.abs(amount) ? ` (남는·모자란 교과가 부족해 ${Math.abs(amount)}칸 중 ${proposal.length}칸만)` : ''}.</p>
        <ul>{proposal.map(change => <li key={`${change.date}-${change.period}`}>{shortDate(change.date)} {change.period}교시 · {nameOf(before(change))} → <b>{nameOf(change.subject)}</b></li>)}</ul>
        <button className="cur-btn" onClick={() => {onPlan(applyOverrides(plan, proposal)); setChosen(false); setSubject(''); setAmount(1);}}>이대로 적용</button>
      </> : <p className="cur-muted">{amount > 0 ? '기준보다 남는 교과가 없어 가져올 시간이 없어요. 기준시수를 확인하거나 시간표를 바꿔 주세요.' : '줄인 시간을 받을 모자란 교과가 없어요.'}</p>}
    </div>}
    {current.length > 0 && <details className="hc-current"><summary>이 학기에 바꾼 칸 {current.length}개</summary><ul>{current.map(change => <li key={`${change.date}-${change.period}`}>{shortDate(change.date)} {change.period}교시 → {nameOf(change.subject)}{change.note ? ` (${change.note})` : ''}<button aria-label="되돌리기" onClick={() => onPlan({...plan, overrides: (plan.overrides ?? []).filter(item => item !== change)})}><Undo2 size={13}/></button></li>)}</ul></details>}
  </section>;
}

function Tracker({plan, sessions, today, semesterNow, stats}: {plan: Plan; sessions: Session[]; today: string; semesterNow: 1 | 2; stats: ReturnType<typeof hourStats>}) {
  const progress = progressToDate(plan, today, sessions);
  const end = semesterNow === 1 ? plan.semester2On : plan.endsOn;
  let left = 0;
  for (let date = today; date < end && left < 200; date = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) if (isSchoolDay(plan, date)) left++;
  const done = progress.reduce((sum, entry) => sum + entry.done, 0), total = progress.reduce((sum, entry) => sum + entry.total, 0);
  const atEnd = stats.rows.filter(row => row.hasStandard && row.diff[semesterNow] !== 0);
  return <section className="hc-card">
    <h4><span className="hc-no">4</span>운영 추적 <small>{semesterNow}학기</small></h4>
    <div className="hc-track"><div><strong>{done}</strong><small>지난 수업</small></div><div><strong>{total - done}</strong><small>남은 수업</small></div><div><strong>{left}</strong><small>남은 수업일</small></div></div>
    <ul className="cur-bars">{progress.map(entry => <li key={entry.subject}><span>{entry.name === '창의적 체험활동' ? '창체' : entry.name}</span><i><em style={{width: `${entry.total ? Math.round(entry.done / entry.total * 100) : 0}%`, background: 'var(--accent)'}}/></i><small>{entry.done}/{entry.total}</small></li>)}</ul>
    <p className="cur-muted">{atEnd.length ? `지금 계획대로 가면 학기 말에 ${atEnd.map(row => `${row.name} ${signed(row.diff[semesterNow])}`).join(', ')}이에요. 조절판에서 맞출 수 있어요.` : '지금 계획대로 가면 학기 말 시수가 기준과 같아요.'}</p>
    <p className="cur-muted">실제로 수업을 했는지(결강·교체) 기록하는 기능은 다음 단계예요. 지금은 계획 기준이에요.</p>
  </section>;
}

function FindingsDialog({plan, source, onClose, onApply}: {plan: Plan; source: Source; onClose: () => void; onApply: (plan: Plan) => void}) {
  const findings = source.findings!;
  const usable = (item: StandardFinding) => !!item.subject || /학교자율/.test(item.subjectName);
  const [standards, setStandards] = useState<Set<number>>(() => new Set(findings.standards.map((item, index) => usable(item) && item.confidence === 'high' ? index : -1).filter(index => index >= 0)));
  const [template, setTemplate] = useState<number>(findings.templates.findIndex(item => item.confidence === 'high'));
  const [days, setDays] = useState<Set<number>>(() => new Set(findings.days.map((item, index) => item.confidence === 'high' ? index : -1).filter(index => index >= 0)));
  const toggle = (set: Set<number>, index: number, update: (next: Set<number>) => void) => {const next = new Set(set); if (next.has(index)) next.delete(index); else next.add(index); update(next);};
  const picked = {standards: findings.standards.filter((_, index) => standards.has(index)), template: template >= 0 ? findings.templates[template] as TemplateFinding : null, days: findings.days.filter((_, index) => days.has(index)) as DayFinding[]};
  const count = picked.standards.length + (picked.template ? 1 : 0) + picked.days.length;
  return <div className="cur-dialog" role="dialog" aria-modal="true" aria-label="읽은 내용 확인" onClick={onClose}>
    <div className="cur-dialog-card hc-review" onClick={event => event.stopPropagation()}>
      <header><div><h3>이렇게 읽었어요</h3><p className="cur-muted">{source.name} · 넣을 것만 고르세요. 노란 줄은 확실하지 않은 칸이에요.</p></div><button className="cur-icon" aria-label="닫기" onClick={onClose}><X size={18}/></button></header>
      {findings.notes.map(note => <p key={note} className="cur-muted">· {note}</p>)}
      {findings.standards.length > 0 && <section><h4>기준시수 {findings.standards.length}칸</h4><table className="hc-table"><thead><tr><th/><th>교과</th><th>학기</th><th>시수</th><th>읽은 곳</th></tr></thead><tbody>
        {findings.standards.map((item, index) => <tr key={index} className={item.confidence === 'low' ? 'is-low' : ''}><td><input type="checkbox" disabled={!usable(item)} checked={standards.has(index)} onChange={() => toggle(standards, index, setStandards)} aria-label={`${item.subjectName} 넣기`}/></td><td>{item.subjectName}{!usable(item) && <small> (우리 반 교과와 안 맞음)</small>}{item.note && <small> {item.note}</small>}</td><td>{item.semester ? `${item.semester}학기` : '연간'}</td><td>{item.hours}</td><td>{item.where}</td></tr>)}
      </tbody></table></section>}
      {findings.templates.length > 0 && <section><h4>기초시간표</h4>{findings.templates.map((item, index) => <label key={index} className={`hc-option${item.confidence === 'low' ? ' is-low' : ''}`}><input type="radio" name="template" checked={template === index} onChange={() => setTemplate(index)}/>{item.semester ? `${item.semester}학기` : '1·2학기'} · {item.slots.length}칸{item.unmatched.length ? ` · 못 맞춘 이름: ${item.unmatched.join(', ')}` : ''} · {item.where}</label>)}<label className="hc-option"><input type="radio" name="template" checked={template < 0} onChange={() => setTemplate(-1)}/>시간표는 넣지 않기</label>{template >= 0 && <p className="cur-muted">넣으면 그 학기의 기초시간표를 이 표로 바꿔요.</p>}</section>}
      {findings.days.length > 0 && <section><h4>학사일정 {findings.days.length}건</h4><ul className="hc-days">{findings.days.map((item, index) => <li key={index} className={item.confidence === 'low' ? 'is-low' : ''}><label><input type="checkbox" checked={days.has(index)} onChange={() => toggle(days, index, setDays)}/>{shortDate(item.date)}{item.until ? ` ~ ${shortDate(item.until)}` : ''} · {item.name} <small>({({holiday: '공휴일', vacation: '방학', event: '행사', off: '재량휴업'})[item.kind]})</small></label></li>)}</ul></section>}
      <footer><button className="cur-btn is-ghost" onClick={onClose}>닫기</button><button className="cur-btn" disabled={!count} onClick={() => onApply(applyFindings(plan, picked))}>{count}개 넣기</button></footer>
    </div>
  </div>;
}
