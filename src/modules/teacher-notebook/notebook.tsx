'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {GoogleAuthProvider, reauthenticateWithPopup} from 'firebase/auth';
import {ChevronLeft, ChevronRight, Download, FileText, History, LoaderCircle, Lock, Pencil, Printer, ShieldCheck, Trash2, UserPlus, X} from 'lucide-react';
import {auth} from '@/lib/firebase-client';
import {findMentions, mentionQuery, studentKey} from './mentions';
import {NOTEBOOK_TAG_LABELS, NOTEBOOK_TAGS, SENSITIVE_TAGS, type NotebookAuditEvent, type NotebookDaySummary, type NotebookEntry, type NotebookRosterClass, type NotebookStatus, type NotebookStudentRef, type NotebookTag} from './types';
import './styles.css';

const IDLE_MS = 15 * 60_000, WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const seoulDate = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul'}).format(new Date());
class LockedError extends Error {}
async function call<T>(path: string, init?: {method?: string; body?: object}): Promise<T> {
  const response = await fetch(`/api/teacher-notebook/${path}`, {cache: 'no-store', method: init?.method ?? (init?.body ? 'POST' : 'GET'), ...(init?.body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(init.body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (data.code === 'NOTEBOOK_LOCKED') throw new LockedError(data.error);
  if (!response.ok) throw new Error(data.error || '처리하지 못했어요.');
  return data as T;
}
function monthOf(date: string) {return date.slice(0, 7);}
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthCells(month: string) {
  const [y, m] = month.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [...Array.from({length: first}, () => null), ...Array.from({length: days}, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
}
const longDate = (date: string) => {const d = new Date(`${date}T00:00:00Z`); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;};

type Draft = {id: string | null; body: string; students: NotebookStudentRef[]; tags: NotebookTag[]; sensitive: boolean};
const emptyDraft = (): Draft => ({id: null, body: '', students: [], tags: [], sensitive: false});

function Unlock({onUnlocked}: {onUnlocked: (expiresAt: number) => void}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function open() {
    setBusy(true); setError('');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('로그인 정보가 없어요. 로그아웃한 뒤 다시 로그인해 주세요.');
      const result = await reauthenticateWithPopup(user, new GoogleAuthProvider());
      const data = await call<{expiresAt: number}>('unlock', {body: {idToken: await result.user.getIdToken(true)}});
      onUnlocked(data.expiresAt);
    } catch (e) {
      const code = (e as {code?: string}).code;
      setError(code === 'auth/user-mismatch' ? '지금 로그인한 Google 계정으로 확인해 주세요.' : code?.startsWith('auth/') ? 'Google 계정 확인을 마치지 못했어요. 다시 시도해 주세요.' : (e as Error).message);
    } finally {setBusy(false);}
  }
  return <section className="nb-lock">
    <div className="nb-lock-icon"><Lock size={30}/></div>
    <h2>교무수첩은 잠겨 있어요</h2>
    <p>학생 생활·상담 기록이 담긴 공간이라, 열 때마다 Google 계정을 한 번 더 확인해요.<br/>열린 뒤 30분이 지나거나 15분 동안 사용하지 않으면 다시 잠겨요.</p>
    <button className="button primary" onClick={open} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <ShieldCheck size={18}/>}Google 계정으로 열기</button>
    {error && <p className="nb-error" role="alert">{error}</p>}
  </section>;
}

function Composer({date, roster, names, draft, setDraft, onSaved, onLocked}: {date: string; roster: NotebookRosterClass[]; names: Map<string, string>; draft: Draft; setDraft: (d: Draft) => void; onSaved: () => void; onLocked: () => void}) {
  const area = useRef<HTMLTextAreaElement>(null), [caret, setCaret] = useState(0), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const query = mentionQuery(draft.body, caret);
  const flat = useMemo(() => roster.flatMap(cls => cls.students.map(s => ({...s, classId: cls.id, className: cls.name}))), [roster]);
  const suggestions = query ? flat.filter(s => s.name.startsWith(query.query)).slice(0, 8) : [];
  const selected = new Set(draft.students.map(studentKey));
  const detected = useMemo(() => findMentions(draft.body, roster), [draft.body, roster]);
  const missing = detected.found.filter(ref => !selected.has(studentKey(ref)));
  const toggle = (ref: NotebookStudentRef) => setDraft({...draft, students: selected.has(studentKey(ref)) ? draft.students.filter(s => studentKey(s) !== studentKey(ref)) : [...draft.students, ref]});
  function pick(s: typeof flat[number]) {
    if (!query) return;
    const body = `${draft.body.slice(0, query.start)}@${s.name} ${draft.body.slice(caret)}`, next = query.start + s.name.length + 2;
    setDraft({...draft, body, students: selected.has(studentKey({classId: s.classId, studentId: s.id})) ? draft.students : [...draft.students, {classId: s.classId, studentId: s.id}]});
    requestAnimationFrame(() => {area.current?.focus(); area.current?.setSelectionRange(next, next); setCaret(next);});
  }
  function toggleTag(tag: NotebookTag) {
    const tags = draft.tags.includes(tag) ? draft.tags.filter(t => t !== tag) : [...draft.tags, tag];
    setDraft({...draft, tags, sensitive: draft.sensitive || SENSITIVE_TAGS.includes(tag) && !draft.tags.includes(tag)});
  }
  const forcedSensitive = draft.tags.some(tag => SENSITIVE_TAGS.includes(tag));
  async function save() {
    setSaving(true); setError('');
    try {
      const body = {date, body: draft.body, students: draft.students, tags: draft.tags, sensitive: draft.sensitive || forcedSensitive};
      await call(draft.id ? `entries/${draft.id}` : 'entries', {body});
      setDraft(emptyDraft()); onSaved();
    } catch (e) {if (e instanceof LockedError) onLocked(); else setError((e as Error).message);} finally {setSaving(false);}
  }
  return <div className="nb-composer">
    <label htmlFor="nb-body" className="nb-label">{draft.id ? '기록 고치기' : `${longDate(date)} 기록`}</label>
    <textarea id="nb-body" ref={area} value={draft.body} maxLength={4000} rows={5} placeholder="오늘 학급 전체 이야기나, @이름 으로 학생 한 명에 대한 기록을 남겨요."
      onChange={e => {setDraft({...draft, body: e.target.value}); setCaret(e.target.selectionStart);}} onSelect={e => setCaret(e.currentTarget.selectionStart)}
      onKeyDown={e => {if (suggestions.length && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault(); pick(suggestions[0]);}}}/>
    {suggestions.length > 0 && <ul className="nb-suggest" aria-label="학생 추천">{suggestions.map(s => <li key={`${s.classId}_${s.id}`}><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(s)}>{s.name}<small>{s.className} · {s.number}번</small></button></li>)}</ul>}
    {(missing.length > 0 || detected.ambiguous.length > 0) && <div className="nb-detected">
      {missing.map(ref => <button type="button" key={studentKey(ref)} onClick={() => toggle(ref)}><UserPlus size={14}/>{names.get(studentKey(ref))} 연결</button>)}
      {detected.ambiguous.map(name => <span key={name}>같은 이름 ‘{name}’ 학생이 여럿이에요. 명단에서 골라 주세요.</span>)}
    </div>}
    <div className="nb-chips" aria-label="연결된 학생">
      {draft.students.length === 0 ? <span className="nb-muted">연결된 학생 없음 · 학급 전체 기록</span> : draft.students.map(ref => <button type="button" key={studentKey(ref)} className="nb-chip" onClick={() => toggle(ref)} aria-label={`${names.get(studentKey(ref))} 연결 해제`}>{names.get(studentKey(ref)) ?? '명단에 없음'}<X size={13}/></button>)}
    </div>
    <details className="nb-picker"><summary>명단에서 고르기</summary>{roster.map(cls => <fieldset key={cls.id}><legend>{cls.name}</legend><div>{cls.students.map(s => {const ref = {classId: cls.id, studentId: s.id}; return <label key={s.id}><input type="checkbox" checked={selected.has(studentKey(ref))} onChange={() => toggle(ref)}/>{s.number}. {s.name}</label>;})}</div></fieldset>)}{roster.length === 0 && <p className="nb-muted">아직 우리 반 명단이 없어요.</p>}</details>
    <div className="nb-tags" role="group" aria-label="분류">{NOTEBOOK_TAGS.map(tag => <button type="button" key={tag} aria-pressed={draft.tags.includes(tag)} className={SENSITIVE_TAGS.includes(tag) ? 'is-sensitive' : ''} onClick={() => toggleTag(tag)}>{NOTEBOOK_TAG_LABELS[tag]}</button>)}</div>
    <label className="nb-check"><input type="checkbox" checked={draft.sensitive || forcedSensitive} disabled={forcedSensitive} onChange={e => setDraft({...draft, sensitive: e.target.checked})}/>민감 기록 <small>{forcedSensitive ? '상담·건강·가정 기록은 항상 민감 기록이에요.' : '리포트·인계에서 기본으로 빠져요.'}</small></label>
    {error && <p className="nb-error" role="alert">{error}</p>}
    <div className="nb-actions">
      {draft.id && <button type="button" className="button soft" onClick={() => setDraft(emptyDraft())}>취소</button>}
      <button type="button" className="button primary" disabled={saving || !draft.body.trim()} onClick={save}>{saving && <LoaderCircle className="spin" size={16}/>}{draft.id ? '고친 내용 저장' : '기록 저장'}</button>
    </div>
  </div>;
}

type Report = {from: string; to: string; includeSensitive: boolean; entries: NotebookEntry[]; roster: NotebookRosterClass[]};
function ReportDialog({roster, onClose, onLocked}: {roster: NotebookRosterClass[]; onClose: () => void; onLocked: () => void}) {
  const today = seoulDate();
  const [from, setFrom] = useState(`${monthOf(today)}-01`), [to, setTo] = useState(today), [classId, setClassId] = useState(''), [student, setStudent] = useState(''), [tags, setTags] = useState<NotebookTag[]>([]), [sensitive, setSensitive] = useState(false);
  const [report, setReport] = useState<Report | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {dialog.current?.showModal(); return () => document.body.classList.remove('nb-printing');}, []);
  const students = roster.find(cls => cls.id === classId)?.students ?? [];
  const names = useMemo(() => new Map<string, string>((report?.roster ?? roster).flatMap(cls => cls.students.map(s => [`${cls.id}_${s.id}`, s.name] as const))), [report, roster]);
  async function build() {
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({from, to, ...(classId ? {classId} : {}), ...(student ? {student} : {}), ...(tags.length ? {tags: tags.join(',')} : {}), ...(sensitive ? {includeSensitive: '1'} : {})});
      setReport(await call<Report>(`report?${params}`));
    } catch (e) {if (e instanceof LockedError) onLocked(); else setError((e as Error).message);} finally {setBusy(false);}
  }
  const groups = useMemo(() => {
    if (!report) return [];
    const map = new Map<string, NotebookEntry[]>();
    for (const entry of report.entries) {
      const keys = entry.students.length ? entry.students.map(studentKey).filter(key => !student || key === student) : ['__class'];
      for (const key of keys) map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return [...map.entries()].map(([key, list]) => ({key, name: key === '__class' ? '학급 전체 기록' : names.get(key) ?? '명단에 없는 학생', list})).sort((a, b) => a.key === '__class' ? -1 : b.key === '__class' ? 1 : a.name.localeCompare(b.name));
  }, [report, names, student]);
  async function csv() {
    if (!report) return;
    const {reportCsv} = await import('./csv');
    const url = URL.createObjectURL(new Blob([reportCsv(report.entries, names, NOTEBOOK_TAG_LABELS)], {type: 'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = `교무수첩_${report.from}_${report.to}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function print() {document.body.classList.add('nb-printing'); window.print(); document.body.classList.remove('nb-printing');}
  return <dialog ref={dialog} className="nb-report-dialog" onClose={onClose} aria-labelledby="nb-report-title">
    <div className="nb-report-head"><h2 id="nb-report-title"><FileText size={20}/>종합 리포트</h2><button className="icon-button" aria-label="닫기" onClick={() => dialog.current?.close()}><X size={20}/></button></div>
    <div className="nb-report-form">
      <label>시작일<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}/></label>
      <label>종료일<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}/></label>
      <label>학급<select value={classId} onChange={e => {setClassId(e.target.value); setStudent('');}}><option value="">전체</option>{roster.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}</select></label>
      <label>학생<select value={student} disabled={!classId} onChange={e => setStudent(e.target.value)}><option value="">전체</option>{students.map(s => <option key={s.id} value={`${classId}_${s.id}`}>{s.number}. {s.name}</option>)}</select></label>
      <div className="nb-tags" role="group" aria-label="분류 거르기">{NOTEBOOK_TAGS.map(tag => <button type="button" key={tag} aria-pressed={tags.includes(tag)} onClick={() => setTags(tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag])}>{NOTEBOOK_TAG_LABELS[tag]}</button>)}</div>
      <label className="nb-check"><input type="checkbox" checked={sensitive} onChange={e => setSensitive(e.target.checked)}/>민감 기록 포함 <small>상담·건강·가정 기록이 리포트에 들어가요. 공유할 때 주의해 주세요.</small></label>
      <button className="button primary" onClick={build} disabled={busy}>{busy && <LoaderCircle className="spin" size={16}/>}리포트 만들기</button>
    </div>
    {error && <p className="nb-error" role="alert">{error}</p>}
    {report && <>
      <div className="nb-actions"><button className="button soft" onClick={csv}><Download size={16}/>CSV 받기</button><button className="button soft" onClick={print}><Printer size={16}/>인쇄 · PDF 저장</button></div>
      <article className="nb-report-print">
        <header><h3>교무수첩 리포트</h3><p>{report.from} ~ {report.to} · 기록 {report.entries.length}건{report.includeSensitive ? ' · 민감 기록 포함' : ' · 민감 기록 제외'}</p><p className="nb-watermark">생성 {new Date().toLocaleString('ko-KR')} · 외부 공유 시 개인정보에 유의해 주세요.</p></header>
        {groups.length === 0 && <p className="nb-muted">이 조건에 맞는 기록이 없어요.</p>}
        {groups.map(group => <section key={group.key}><h4>{group.name} <small>{group.list.length}건</small></h4><ul>{group.list.map(entry => <li key={`${group.key}_${entry.id}`}><time>{entry.date}</time><span className="nb-entry-tags">{entry.tags.map(tag => NOTEBOOK_TAG_LABELS[tag]).join(' · ')}{entry.sensitive ? ' · 민감' : ''}</span><p>{entry.body}</p></li>)}</ul></section>)}
      </article>
    </>}
  </dialog>;
}

function AuditPanel({onLocked}: {onLocked: () => void}) {
  const [events, setEvents] = useState<NotebookAuditEvent[] | null>(null), [error, setError] = useState('');
  useEffect(() => {call<{events: NotebookAuditEvent[]}>('audit').then(data => setEvents(data.events)).catch(e => {if (e instanceof LockedError) onLocked(); else setError((e as Error).message);});}, [onLocked]);
  const label: Record<string, string> = {'notebook.unlock': '수첩 열기', 'notebook.lock': '수첩 잠금', 'entry.create': '기록 저장', 'entry.update': '기록 고침', 'entry.delete': '기록 삭제', 'report.build': '리포트 생성'};
  return <section className="nb-card"><h3><History size={18}/>최근 접근 기록</h3>{error && <p className="nb-error">{error}</p>}{!events && !error && <p className="nb-muted">불러오는 중…</p>}
    <ul className="nb-audit">{events?.map(event => <li key={event.id}><span>{label[event.action] ?? event.action}</span><time>{new Date(event.at).toLocaleString('ko-KR')}</time></li>)}</ul></section>;
}

export default function TeacherNotebook() {
  const [status, setStatus] = useState<NotebookStatus | null>(null), [error, setError] = useState('');
  const [roster, setRoster] = useState<NotebookRosterClass[]>([]), [month, setMonth] = useState(monthOf(seoulDate())), [days, setDays] = useState<Record<string, NotebookDaySummary>>({});
  const [date, setDate] = useState(seoulDate()), [entries, setEntries] = useState<NotebookEntry[] | null>(null), [draft, setDraft] = useState<Draft>(emptyDraft);
  const [reportOpen, setReportOpen] = useState(false), [auditOpen, setAuditOpen] = useState(false);
  const lastActive = useRef(Date.now());
  const unlocked = !!status?.unlocked;
  const names = useMemo(() => new Map<string, string>(roster.flatMap(cls => cls.students.map(s => [`${cls.id}_${s.id}`, s.name] as const))), [roster]);
  const clear = useCallback(() => {setRoster([]); setDays({}); setEntries(null); setDraft(emptyDraft()); setReportOpen(false); setAuditOpen(false);}, []);
  const locked = useCallback(() => {clear(); setStatus(s => s && {...s, unlocked: false, expiresAt: null});}, [clear]);
  const lock = useCallback(async () => {locked(); await call('lock', {body: {}}).catch(() => {});}, [locked]);
  useEffect(() => {call<NotebookStatus>('status').then(setStatus).catch(e => setError((e as Error).message));}, []);
  const fail = useCallback((e: unknown) => {if (e instanceof LockedError) locked(); else setError((e as Error).message);}, [locked]);
  useEffect(() => {if (unlocked) call<{classes: NotebookRosterClass[]}>('roster').then(d => setRoster(d.classes)).catch(fail);}, [unlocked, fail]);
  const loadMonth = useCallback(() => call<{days: Record<string, NotebookDaySummary>}>(`month?month=${month}`).then(d => setDays(d.days)).catch(fail), [month, fail]);
  const loadDay = useCallback(() => {setEntries(null); return call<{entries: NotebookEntry[]}>(`day?date=${date}`).then(d => setEntries(d.entries)).catch(fail);}, [date, fail]);
  useEffect(() => {if (unlocked) loadMonth();}, [unlocked, loadMonth]);
  useEffect(() => {if (unlocked) loadDay();}, [unlocked, loadDay]);
  useEffect(() => {
    if (!unlocked) return;
    const active = () => {lastActive.current = Date.now();};
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach(name => window.addEventListener(name, active, {passive: true}));
    const timer = window.setInterval(() => {if (Date.now() - lastActive.current > IDLE_MS || (status?.expiresAt && Date.now() >= status.expiresAt)) lock();}, 20_000);
    return () => {events.forEach(name => window.removeEventListener(name, active)); window.clearInterval(timer);};
  }, [unlocked, status?.expiresAt, lock]);
  async function remove(entry: NotebookEntry) {
    if (!confirm('이 기록을 삭제할까요? 삭제하면 되돌릴 수 없어요.')) return;
    try {await call(`entries/${entry.id}`, {method: 'DELETE'}); loadDay(); loadMonth();} catch (e) {fail(e);}
  }
  if (!status) return <div className="center-state">{error ? <p>{error}</p> : <LoaderCircle className="spin" size={28}/>}</div>;
  if (!status.available) return <section className="nb-shell"><div className="nb-lock"><Lock size={30}/><h2>교무수첩은 아직 준비 중이에요</h2><p>시범 운영 중인 기능이에요. 열리면 마이페이지에서 바로 쓸 수 있어요.</p><Link className="button soft" href="/teacher/me">마이페이지로</Link></div></section>;
  return <section className="nb-shell">
    <div className="nb-heading">
      <div><p className="nb-eyebrow"><Link href="/teacher/me">마이페이지</Link> · 교무수첩</p><h2>교무수첩</h2><p>하루 기록과 학생별 관찰을 날짜별로 모아 둬요. 기록은 암호화되어 저장되고, 선생님 본인만 열 수 있어요.</p></div>
      {unlocked && <div className="nb-heading-actions"><button className="button soft" onClick={() => setReportOpen(true)}><FileText size={16}/>종합 리포트</button><button className="button soft" onClick={() => setAuditOpen(!auditOpen)} aria-pressed={auditOpen}><History size={16}/>접근 기록</button><button className="button soft" onClick={lock}><Lock size={16}/>잠그기</button></div>}
    </div>
    {error && <p className="nb-error" role="alert">{error}<button className="icon-button" aria-label="닫기" onClick={() => setError('')}><X size={16}/></button></p>}
    {!unlocked ? <Unlock onUnlocked={expiresAt => {lastActive.current = Date.now(); setError(''); setStatus({available: true, unlocked: true, expiresAt});}}/> : <>
      {auditOpen && <AuditPanel onLocked={locked}/>}
      <div className="nb-columns">
        <section className="nb-card nb-calendar" aria-label="달력">
          <div className="nb-month"><button className="icon-button" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={18}/></button><strong>{month.replace('-', '년 ')}월</strong><button className="icon-button" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18}/></button></div>
          <div className="nb-grid">{WEEKDAYS.map(d => <span key={d} className="nb-weekday">{d}</span>)}{monthCells(month).map((cell, i) => cell ? <button key={cell} className={`nb-day${cell === date ? ' is-selected' : ''}${cell === seoulDate() ? ' is-today' : ''}`} aria-pressed={cell === date} aria-label={`${longDate(cell)}${days[cell] ? `, 기록 ${days[cell].entries}건` : ''}`} onClick={() => {setDate(cell); setDraft(emptyDraft());}}><span>{Number(cell.slice(8))}</span>{days[cell] && <small>{days[cell].entries}</small>}</button> : <span key={`blank${i}`}/>)}</div>
          <button className="nb-today" onClick={() => {const t = seoulDate(); setMonth(monthOf(t)); setDate(t); setDraft(emptyDraft());}}>오늘로</button>
        </section>
        <section className="nb-card">
          <Composer date={date} roster={roster} names={names} draft={draft} setDraft={setDraft} onSaved={() => {loadDay(); loadMonth();}} onLocked={locked}/>
          <h3 className="nb-day-title">{longDate(date)}의 기록</h3>
          {!entries ? <p className="nb-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p> : entries.length === 0 ? <p className="nb-muted">아직 이 날의 기록이 없어요.</p> :
            <ul className="nb-entries">{entries.map(entry => <li key={entry.id} className={entry.sensitive ? 'is-sensitive' : ''}>
              <div className="nb-entry-meta"><span>{entry.students.length ? entry.students.map(ref => names.get(studentKey(ref)) ?? '명단에 없음').join(', ') : '학급 전체'}</span><span className="nb-entry-tags">{entry.tags.map(tag => NOTEBOOK_TAG_LABELS[tag]).join(' · ')}{entry.sensitive && <b> 민감</b>}</span></div>
              <p>{entry.body}</p>
              <div className="nb-entry-actions"><button className="icon-button" aria-label="고치기" onClick={() => setDraft({id: entry.id, body: entry.body, students: entry.students, tags: entry.tags, sensitive: entry.sensitive})}><Pencil size={15}/></button><button className="icon-button" aria-label="삭제" onClick={() => remove(entry)}><Trash2 size={15}/></button></div>
            </li>)}</ul>}
        </section>
      </div>
      {reportOpen && <ReportDialog roster={roster} onClose={() => setReportOpen(false)} onLocked={locked}/>}
    </>}
  </section>;
}
