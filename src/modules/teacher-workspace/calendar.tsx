'use client';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {ChevronLeft, ChevronRight, LoaderCircle, Pencil, Plus, Trash2, Upload, X} from 'lucide-react';
import {BerryPending, call, message, seoulTime, seoulToday, shortDate} from './api';
import {addDays, weekDates, weekKeyOf} from './shared';
import {CALENDAR_KINDS, CALENDAR_KIND_LABELS, type CalendarEvent, type CalendarKind} from './types';

type Draft = {id: string | null; title: string; kind: CalendarKind; allDay: boolean; startDate: string; startTime: string; endDate: string; endTime: string};
const draftFor = (date: string): Draft => ({id: null, title: '', kind: 'school', allDay: true, startDate: date, startTime: '09:00', endDate: date, endTime: '10:00'});
function monthCells(month: string) {
  const first = `${month}-01`, offset = new Date(`${first}T00:00:00Z`).getUTCDay();
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return Array.from({length: Math.ceil((offset + days) / 7) * 7}, (_, i) => addDays(first, i - offset));
}
const shiftMonth = (month: string, delta: number) => {const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1)); return d.toISOString().slice(0, 7);};
const covers = (event: CalendarEvent, date: string) => event.startDate <= date && date <= event.endDate;

function ImportDialog({onClose, onDone}: {onClose: () => void; onDone: () => void}) {
  const [text, setText] = useState(''), [format, setFormat] = useState<'ics' | 'csv'>('ics'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [preview, setPreview] = useState<{hash: string; count: number; events: CalendarEvent[]; errors: {line: number; message: string}[]; warnings: string[]} | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {setError('1MB 이하 파일만 가져올 수 있어요.'); return;}
    setFormat(file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'ics'); setText(await file.text()); setPreview(null); setError('');
  }
  async function run(confirm?: string) {
    setBusy(true); setError('');
    try {
      const data = await call<typeof preview & {imported?: number}>('calendar/import', {body: {format, text, ...(confirm ? {confirm} : {})}});
      if (confirm) {onDone(); onClose();} else setPreview(data);
    } catch (e) {setError(message(e));} finally {setBusy(false);}
  }
  return <div className="wsp-dialog" role="dialog" aria-modal="true" aria-label="일정 가져오기">
    <div className="wsp-dialog-card">
      <div className="wsp-row"><h3>일정 가져오기</h3><button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={18}/></button></div>
      <p className="wsp-muted">학교 캘린더의 ICS 파일이나 CSV(제목,시작,끝,종류)를 골라요. 한 번에 500건까지, 확인한 뒤에 저장돼요.</p>
      <input type="file" accept=".ics,.csv,text/calendar,text/csv" onChange={e => void pick(e.target.files?.[0])}/>
      {error && <p className="wsp-error" role="alert">{error}</p>}
      {preview && <div className="wsp-preview">
        <strong>{preview.count}건을 가져와요</strong>
        {preview.warnings.map(w => <p key={w} className="wsp-muted">{w}</p>)}
        {preview.errors.length > 0 && <p className="wsp-error">읽지 못한 줄 {preview.errors.length}개: {preview.errors.slice(0, 3).map(e => `${e.line}행 ${e.message}`).join(' · ')}</p>}
        <ul>{preview.events.slice(0, 50).map(event => <li key={event.id}><b>{shortDate(event.startDate)}{event.endDate !== event.startDate ? `~${shortDate(event.endDate)}` : ''}</b> {event.allDay ? '' : seoulTime(event.start)} {event.title}</li>)}</ul>
        {preview.count > 50 && <p className="wsp-muted">외 {preview.count - 50}건</p>}
      </div>}
      <div className="wsp-actions">
        {!preview ? <button type="button" className="button primary" disabled={!text || busy} onClick={() => void run()}>{busy && <LoaderCircle className="spin" size={16}/>}미리보기</button>
          : <button type="button" className="button primary" disabled={!preview.count || busy} onClick={() => void run(preview.hash)}>{busy && <LoaderCircle className="spin" size={16}/>}{preview.count}건 저장</button>}
      </div>
    </div>
  </div>;
}

export function CalendarTab() {
  const today = seoulToday();
  const [view, setView] = useState<'month' | 'week'>('month'), [month, setMonth] = useState(today.slice(0, 7)), [week, setWeek] = useState(weekKeyOf(today)), [selected, setSelected] = useState(today);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null), [error, setError] = useState(''), [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState(false), [importing, setImporting] = useState(false);
  const days = useMemo(() => view === 'month' ? monthCells(month) : weekDates(week), [view, month, week]);
  const load = useCallback(async () => {
    setError('');
    try {setEvents((await call<{events: CalendarEvent[]}>(`calendar?from=${days[0]}&to=${days[days.length - 1]}`)).events);} catch (e) {setError(message(e));}
  }, [days]);
  useEffect(() => {void load();}, [load]);
  const move = (delta: number) => view === 'month' ? setMonth(shiftMonth(month, delta)) : setWeek(weekKeyOf(addDays(weekDates(week)[0], delta * 7)));
  const dayEvents = (date: string) => (events ?? []).filter(event => covers(event, date));
  async function save() {
    if (!draft) return;
    setBusy(true); setError('');
    const body = {title: draft.title, kind: draft.kind, allDay: draft.allDay, start: draft.allDay ? draft.startDate : `${draft.startDate} ${draft.startTime}`, end: draft.allDay ? draft.endDate : `${draft.endDate} ${draft.endTime}`};
    try {await call(draft.id ? `calendar/${draft.id}` : 'calendar', {body}); setDraft(null); await load();} catch (e) {setError(message(e));} finally {setBusy(false);}
  }
  async function remove(event: CalendarEvent) {
    if (!confirm(`"${event.title}" 일정을 지울까요?`)) return;
    try {await call(`calendar/${event.id}`, {method: 'DELETE'}); await load();} catch (e) {setError(message(e));}
  }
  const edit = (event: CalendarEvent) => setDraft({id: event.id, title: event.title, kind: event.kind, allDay: event.allDay, startDate: event.startDate, startTime: event.allDay ? '09:00' : seoulTime(event.start), endDate: event.endDate, endTime: event.allDay ? '10:00' : seoulTime(event.end)});
  const title = view === 'month' ? `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월` : `${shortDate(days[0])} ~ ${shortDate(days[6])}`;
  return <section className="wsp-panel">
    <div className="wsp-toolbar">
      <div className="wsp-nav"><button type="button" className="icon-button" onClick={() => move(-1)} aria-label="이전"><ChevronLeft size={18}/></button><strong>{title}</strong><button type="button" className="icon-button" onClick={() => move(1)} aria-label="다음"><ChevronRight size={18}/></button></div>
      <div className="segmented wsp-seg"><button type="button" className={view === 'month' ? 'selected' : ''} onClick={() => setView('month')}>월</button><button type="button" className={view === 'week' ? 'selected' : ''} onClick={() => setView('week')}>주</button></div>
      <div className="wsp-actions"><button type="button" className="button soft" onClick={() => setImporting(true)}><Upload size={15}/>가져오기</button><button type="button" className="button primary" onClick={() => setDraft(draftFor(selected))}><Plus size={15}/>일정</button></div>
    </div>
    {error && <p className="wsp-error" role="alert">{error}</p>}
    {!events ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p> : view === 'month' ? <div className="wsp-month">
      {['일', '월', '화', '수', '목', '금', '토'].map(d => <span key={d} className="wsp-weekday">{d}</span>)}
      {days.map(date => {const list = dayEvents(date); return <button type="button" key={date} className={`wsp-day${date.slice(0, 7) !== month ? ' is-other' : ''}${date === today ? ' is-today' : ''}${date === selected ? ' is-selected' : ''}`} onClick={() => setSelected(date)} aria-label={`${shortDate(date)} 일정 ${list.length}건`}>
        <span>{Number(date.slice(8))}</span>
        {list.slice(0, 3).map(event => <i key={event.id} className={`wsp-chip kind-${event.kind}${event.pending ? ' is-pending' : ''}`}>{event.title}</i>)}
        {list.length > 3 && <small>+{list.length - 3}</small>}
      </button>;})}
    </div> : <div className="wsp-week">{days.map(date => <button type="button" key={date} className={`wsp-week-day${date === today ? ' is-today' : ''}${date === selected ? ' is-selected' : ''}`} onClick={() => setSelected(date)}><b>{shortDate(date)}</b>{dayEvents(date).map(event => <i key={event.id} className={`wsp-chip kind-${event.kind}`}>{event.allDay ? '' : `${seoulTime(event.start)} `}{event.title}</i>)}</button>)}</div>}
    {events && <div className="wsp-card">
      <h3>{shortDate(selected)} 일정</h3>
      {!dayEvents(selected).length ? <p className="wsp-muted">일정이 없어요.</p> : <ul className="wsp-list">{dayEvents(selected).map(event => <li key={event.id} className={event.pending ? 'is-pending' : ''}>
        <div><span className={`wsp-kind kind-${event.kind}`}>{CALENDAR_KIND_LABELS[event.kind]}</span> <strong>{event.title}</strong>
          <small>{event.allDay ? (event.startDate === event.endDate ? '하루 종일' : `${shortDate(event.startDate)} ~ ${shortDate(event.endDate)}`) : event.readOnly ? `${seoulTime(event.start)} 마감 · 숙제` : `${seoulTime(event.start)} ~ ${seoulTime(event.end)}`}</small>
          {event.pending && <BerryPending onConfirm={() => call(`calendar/${event.id}/confirm`, {body: {}}).then(load)}/>}</div>
        {!event.readOnly && <div className="wsp-row-actions"><button type="button" className="icon-button" onClick={() => edit(event)} aria-label="고치기"><Pencil size={15}/></button><button type="button" className="icon-button" onClick={() => void remove(event)} aria-label="지우기"><Trash2 size={15}/></button></div>}
      </li>)}</ul>}
    </div>}
    {draft && <div className="wsp-dialog" role="dialog" aria-modal="true" aria-label="일정"><div className="wsp-dialog-card">
      <div className="wsp-row"><h3>{draft.id ? '일정 고치기' : '새 일정'}</h3><button type="button" className="icon-button" onClick={() => setDraft(null)} aria-label="닫기"><X size={18}/></button></div>
      <div className="wsp-form">
        <label>제목<input value={draft.title} maxLength={120} onChange={e => setDraft({...draft, title: e.target.value})} autoFocus/></label>
        <label>종류<select value={draft.kind} onChange={e => setDraft({...draft, kind: e.target.value as CalendarKind})}>{CALENDAR_KINDS.map(kind => <option key={kind} value={kind}>{CALENDAR_KIND_LABELS[kind]}</option>)}</select></label>
        <label className="wsp-check"><input type="checkbox" checked={draft.allDay} onChange={e => setDraft({...draft, allDay: e.target.checked})}/>하루 종일</label>
        <div className="wsp-pair"><label>시작<input type="date" value={draft.startDate} onChange={e => setDraft({...draft, startDate: e.target.value, endDate: e.target.value > draft.endDate ? e.target.value : draft.endDate})}/></label>{!draft.allDay && <label>시각<input type="time" value={draft.startTime} onChange={e => setDraft({...draft, startTime: e.target.value})}/></label>}</div>
        <div className="wsp-pair"><label>끝<input type="date" value={draft.endDate} min={draft.startDate} onChange={e => setDraft({...draft, endDate: e.target.value})}/></label>{!draft.allDay && <label>시각<input type="time" value={draft.endTime} onChange={e => setDraft({...draft, endTime: e.target.value})}/></label>}</div>
      </div>
      <div className="wsp-actions"><button type="button" className="button primary" disabled={busy || !draft.title.trim()} onClick={() => void save()}>{busy && <LoaderCircle className="spin" size={16}/>}저장</button></div>
    </div></div>}
    {importing && <ImportDialog onClose={() => setImporting(false)} onDone={() => void load()}/>}
  </section>;
}
