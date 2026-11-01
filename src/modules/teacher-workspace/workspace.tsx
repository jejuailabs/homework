'use client';
import {useCallback, useEffect, useState} from 'react';
import Link from 'next/link';
import {BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, ClipboardPaste, Download, FolderTree, LoaderCircle, NotebookPen, Pencil, Table, Trash2, X} from 'lucide-react';
import {zipParts} from '@/lib/zip-store';
import {BerryPending, call, message, seoulToday, shortDate} from './api';
import {CalendarTab} from './calendar';
import {FoldersTab} from './folders';
import {addDays, weekDates, weekKeyOf} from './shared';
import type {LessonDay, Timetable, TimetableSlot} from './types';
import './styles.css';

const TABS = [{id: 'calendar', label: '일정', icon: CalendarDays}, {id: 'timetable', label: '시간표', icon: Table}, {id: 'lessons', label: '수업 일지', icon: NotebookPen}, {id: 'folders', label: '업무 폴더', icon: FolderTree}] as const;
type Tab = typeof TABS[number]['id'];
const DAYS = ['월', '화', '수', '목', '금'], PERIODS = [1, 2, 3, 4, 5, 6, 7];

function TimetableTab() {
  const [week, setWeek] = useState(weekKeyOf(seoulToday())), [table, setTable] = useState<Timetable | null>(null), [error, setError] = useState('');
  const [editing, setEditing] = useState<Record<string, string> | null>(null), [paste, setPaste] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {setError(''); try {setTable(await call<Timetable>(`timetable/${week}`));} catch (e) {setError(message(e));}}, [week]);
  useEffect(() => {void load();}, [load]);
  const dates = weekDates(week), cell = (slots: TimetableSlot[], day: number, period: number) => slots.find(slot => slot.day === day && slot.period === period);
  const startEdit = () => setEditing(Object.fromEntries((table?.slots ?? []).map(slot => [`${slot.day}:${slot.period}`, slot.room ? `${slot.subject}(${slot.room})` : slot.subject])));
  async function save(body: object) {
    setBusy(true); setError('');
    try {setTable(await call<Timetable>(`timetable/${week}`, {body})); setEditing(null); setPaste(null);} catch (e) {setError(message(e));} finally {setBusy(false);}
  }
  // The grid edits as text, so the server's paste parser reads both ways of entering a week.
  const gridText = (values: Record<string, string>) => PERIODS.map(period => [String(period), ...[1, 2, 3, 4, 5].map(day => (values[`${day}:${period}`] ?? '').replace(/\t/g, ' '))].join('\t')).join('\n');
  return <section className="wsp-panel">
    <div className="wsp-toolbar">
      <div className="wsp-nav"><button type="button" className="icon-button" onClick={() => setWeek(weekKeyOf(addDays(dates[0], -7)))} aria-label="지난주"><ChevronLeft size={18}/></button><strong>{shortDate(dates[0])} ~ {shortDate(dates[4])}</strong><button type="button" className="icon-button" onClick={() => setWeek(weekKeyOf(addDays(dates[0], 7)))} aria-label="다음 주"><ChevronRight size={18}/></button></div>
      {!editing && paste === null && <div className="wsp-actions"><button type="button" className="button soft" onClick={() => setPaste('')}><ClipboardPaste size={15}/>붙여넣기</button><button type="button" className="button primary" onClick={startEdit} disabled={!table}><Pencil size={15}/>편집</button></div>}
    </div>
    {error && <p className="wsp-error" role="alert">{error}</p>}
    {table?.inheritedFrom && !editing && <p className="wsp-muted">이 주는 저장된 시간표가 없어 {table.inheritedFrom} 시간표를 보여 줘요. 편집해 저장하면 이 주에만 적용돼요.</p>}
    {paste !== null && <div className="wsp-card">
      <p className="wsp-muted">엑셀·한글 표에서 월~금, 1~7교시 칸을 복사해 붙여 넣어요. 첫 줄 요일과 첫 칸 “1교시”는 있어도 돼요. “과학(과학실)”처럼 장소를 적을 수 있어요.</p>
      <textarea value={paste} rows={8} onChange={e => setPaste(e.target.value)} aria-label="시간표 붙여넣기" autoFocus/>
      <div className="wsp-actions"><button type="button" className="button soft" onClick={() => setPaste(null)}>취소</button><button type="button" className="button primary" disabled={busy || !paste.trim()} onClick={() => void save({text: paste})}>{busy && <LoaderCircle className="spin" size={16}/>}이 주에 저장</button></div>
    </div>}
    {!table ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p> : <div className="wsp-timetable" role="table" aria-label="주간 시간표">
      <span role="columnheader"/>
      {DAYS.map((day, i) => <span key={day} role="columnheader" className={dates[i] === seoulToday() ? 'is-today' : ''}>{day}<small>{Number(dates[i].slice(8))}</small></span>)}
      {PERIODS.map(period => <div key={period} role="row" className="wsp-tt-row"><span role="rowheader">{period}</span>
        {[1, 2, 3, 4, 5].map(day => {const slot = cell(table.slots, day, period), key = `${day}:${period}`; return editing
          ? <input key={key} role="cell" value={editing[key] ?? ''} maxLength={60} aria-label={`${DAYS[day - 1]} ${period}교시`} onChange={e => setEditing({...editing, [key]: e.target.value})}/>
          : <span key={key} role="cell" className={slot ? 'has-slot' : ''}>{slot?.subject}{slot?.room && <small>{slot.room}</small>}</span>;})}
      </div>)}
    </div>}
    {editing && <div className="wsp-actions"><button type="button" className="button soft" onClick={() => setEditing(null)}>취소</button><button type="button" className="button primary" disabled={busy} onClick={() => void save(Object.values(editing).some(value => value.trim()) ? {text: gridText(editing)} : {slots: []})}>{busy && <LoaderCircle className="spin" size={16}/>}저장</button></div>}
  </section>;
}

function LessonsTab() {
  const today = seoulToday();
  const [date, setDate] = useState(today), [line, setLine] = useState(''), [days, setDays] = useState<LessonDay[] | null>(null), [from, setFrom] = useState(addDays(today, -29)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useCallback(async () => {setError(''); try {setDays((await call<{days: LessonDay[]}>(`lessons?from=${from}&to=${addDays(today, 7)}`)).days);} catch (e) {setError(message(e));}}, [from, today]);
  useEffect(() => {void load();}, [load]);
  async function add() {
    setBusy(true); setError('');
    try {await call(`lessons/${date}`, {body: {line}}); setLine(''); await load();} catch (e) {setError(message(e));} finally {setBusy(false);}
  }
  async function removeEntry(day: LessonDay, id: string) {
    try {await call(`lessons/${day.date}`, {body: {entries: day.entries.filter(entry => entry.id !== id)}}); await load();} catch (e) {setError(message(e));}
  }
  return <section className="wsp-panel">
    <div className="wsp-card wsp-lesson-input">
      <input type="date" value={date} max={addDays(today, 7)} onChange={e => setDate(e.target.value)} aria-label="날짜"/>
      <input value={line} maxLength={640} placeholder="3교시 국어 [2단원] 비유 표현 찾기" aria-label="수업 일지 한 줄" onChange={e => setLine(e.target.value)} onKeyDown={e => {if (e.key === 'Enter' && !e.nativeEvent.isComposing && line.trim()) void add();}}/>
      <button type="button" className="button primary" disabled={busy || !line.trim()} onClick={() => void add()}>{busy ? <LoaderCircle className="spin" size={16}/> : '기록'}</button>
    </div>
    <p className="wsp-muted">“교시 과목 [단원] 메모” 순서로 적어요. 교시와 단원은 빼도 돼요.</p>
    {error && <p className="wsp-error" role="alert">{error}</p>}
    {!days ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p> : !days.length ? <p className="wsp-muted">최근 30일 일지가 없어요.</p> : <ul className="wsp-days">{days.map(day => <li key={day.date} className="wsp-card">
      <div className="wsp-row"><h3>{shortDate(day.date)}</h3>{day.entries.some(entry => entry.pending) && <BerryPending onConfirm={() => call(`lessons/${day.date}/confirm`, {body: {}}).then(load)}/>}</div>
      <ul className="wsp-list">{day.entries.map(entry => <li key={entry.id} className={entry.pending ? 'is-pending' : ''}>
        <div><strong>{entry.period ? `${entry.period}교시 ` : ''}{entry.subject}</strong>{entry.unit && <span className="wsp-unit">{entry.unit}</span>}{entry.note && <small>{entry.note}</small>}</div>
        <button type="button" className="icon-button" onClick={() => void removeEntry(day, entry.id)} aria-label="이 줄 지우기"><Trash2 size={15}/></button>
      </li>)}</ul>
    </li>)}</ul>}
    {days && <button type="button" className="button soft" onClick={() => setFrom(addDays(from, -30))}>이전 30일 더 보기</button>}
  </section>;
}

function ExportMenu({onClose}: {onClose: () => void}) {
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [sensitive, setSensitive] = useState(false);
  const suffix = sensitive ? '&includeSensitive=1' : '';
  async function zip() {
    setBusy('zip'); setError('');
    try {
      const manifest = await call<{zipName: string; tables: Record<string, string>; attachments: {name: string; url: string; size: number}[]}>(`export?format=zip${suffix}`);
      const encoder = new TextEncoder(), entries = Object.entries(manifest.tables).map(([name, text]) => ({name, data: encoder.encode(text)}));
      for (const file of manifest.attachments) {
        const response = await fetch(file.url);
        if (!response.ok) throw new Error('파일을 받지 못했어요. 다시 시도해 주세요.');
        entries.push({name: file.name, data: new Uint8Array(await response.arrayBuffer())});
      }
      const href = URL.createObjectURL(new Blob(zipParts(entries) as BlobPart[], {type: 'application/zip'})), link = document.createElement('a');
      link.href = href; link.download = manifest.zipName; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (e) {setError(message(e));} finally {setBusy('');}
  }
  return <div className="wsp-dialog" role="dialog" aria-modal="true" aria-label="내보내기"><div className="wsp-dialog-card">
    <div className="wsp-row"><h3>내보내기</h3><button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={18}/></button></div>
    <p className="wsp-muted">내보낸 기록은 감사 기록에 남아요.</p>
    <label className="wsp-check"><input type="checkbox" checked={sensitive} onChange={e => setSensitive(e.target.checked)}/>민감 항목 포함</label>
    <div className="wsp-export">
      <a className="button soft" href={`/api/workspace/export?format=csv&type=calendar${suffix}`}><Download size={15}/>일정 CSV</a>
      <a className="button soft" href={`/api/workspace/export?format=csv&type=lessons${suffix}`}><Download size={15}/>수업 일지 CSV</a>
      <a className="button soft" href={`/api/workspace/export?format=csv&type=items${suffix}`}><Download size={15}/>업무 항목 CSV</a>
      <button type="button" className="button primary" disabled={!!busy} onClick={() => void zip()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Download size={15}/>}전체 ZIP (파일 포함)</button>
    </div>
    {error && <p className="wsp-error" role="alert">{error}</p>}
  </div></div>;
}

export default function TeacherWorkspace() {
  const [tab, setTab] = useState<Tab>('calendar'), [available, setAvailable] = useState<boolean | null>(null), [exporting, setExporting] = useState(false);
  useEffect(() => {call<{available: boolean}>('status').then(data => setAvailable(data.available)).catch(() => setAvailable(false));}, []);
  useEffect(() => {
    const read = () => {const hash = window.location.hash.slice(1); if (TABS.some(t => t.id === hash)) setTab(hash as Tab);};
    read(); window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const choose = (id: Tab) => {setTab(id); history.replaceState(null, '', `#${id}`);};
  return <section className="mp-shell wsp-shell">
    <p className="wsp-eyebrow"><Link href="/teacher/me">마이페이지</Link> › 업무 공간</p>
    <div className="wsp-heading"><div><h2><BriefcaseBusiness size={24}/> 업무 공간</h2><p>일정·시간표·수업 일지·업무 폴더를 한곳에 모아요. 베리가 넣은 항목은 선생님이 확정해야 반영돼요.</p></div>
      {available && <button type="button" className="button soft" onClick={() => setExporting(true)}><Download size={15}/>내보내기</button>}</div>
    {available === null ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 확인 중…</p> : !available ? <div className="wsp-card"><h3>지금은 쓸 수 없어요</h3><p className="wsp-muted">업무 공간이 잠시 멈춰 있어요. 저장한 기록은 그대로 있어요.</p></div> : <>
      <div className="wsp-tabs" role="tablist">{TABS.map(({id, label, icon: Icon}) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => choose(id)}><Icon size={16}/>{label}</button>)}</div>
      {tab === 'calendar' && <CalendarTab/>}
      {tab === 'timetable' && <TimetableTab/>}
      {tab === 'lessons' && <LessonsTab/>}
      {tab === 'folders' && <FoldersTab/>}
    </>}
    {exporting && <ExportMenu onClose={() => setExporting(false)}/>}
  </section>;
}
