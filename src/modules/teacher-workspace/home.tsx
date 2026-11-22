'use client';
import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {BookUser, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, ListTodo, LoaderCircle, Lock, Plus, Table} from 'lucide-react';
import Todos from '@/modules/teacher-notebook/todos';
import type {NotebookDaySummary, NotebookStatus, NotebookTodo} from '@/modules/teacher-notebook/types';
import {call, message, seoulTime, seoulToday, shortDate} from './api';
import {covers, monthCells, shiftMonth} from './calendar';
import type {WorkspaceTab} from './nav';
import {addDays, weekKeyOf} from './shared';
import {CALENDAR_KIND_LABELS, type CalendarEvent, type Timetable, type WorkItemSummary} from './types';

const notebookApi = <T,>(path: string) => fetch(`/api/teacher-notebook/${path}`, {cache: 'no-store'}).then(r => r.ok ? r.json() as Promise<T> : null).catch(() => null);

/**
 * The workspace home: one month calendar that carries schedule, to-do due days and (while the notebook is open) record counts,
 * with today's timetable, to-dos and near deadlines beside it. It stores nothing itself; editing happens in each section.
 */
export function HomeTab({onPick}: {onPick: (tab: WorkspaceTab) => void}) {
  const today = seoulToday();
  const [month, setMonth] = useState(today.slice(0, 7)), [selected, setSelected] = useState(today), [error, setError] = useState('');
  const [events, setEvents] = useState<CalendarEvent[] | null>(null), [todayEvents, setTodayEvents] = useState<CalendarEvent[] | null>(null);
  const [slots, setSlots] = useState<Timetable['slots'] | null>(null), [due, setDue] = useState<WorkItemSummary[] | null>(null);
  const [todos, setTodos] = useState<NotebookTodo[]>([]), [notebook, setNotebook] = useState<NotebookStatus | null>(null), [records, setRecords] = useState<Record<string, NotebookDaySummary>>({});
  const days = useMemo(() => monthCells(month), [month]);
  useEffect(() => {
    let alive = true;
    call<{events: CalendarEvent[]}>(`calendar?from=${days[0]}&to=${days[days.length - 1]}`).then(data => {if (alive) setEvents(data.events);}).catch(e => {if (alive) {setEvents([]); setError(message(e));}});
    return () => {alive = false;};
  }, [days]);
  useEffect(() => {
    let alive = true;
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    call<{events: CalendarEvent[]}>(`calendar?from=${today}&to=${today}`).then(data => {if (alive) setTodayEvents(data.events);}).catch(() => {if (alive) setTodayEvents([]);});
    call<Timetable>(`timetable/${weekKeyOf(today)}`).then(table => {if (alive) setSlots(table.slots.filter(slot => slot.day === weekday).sort((a, b) => a.period - b.period));}).catch(() => {if (alive) setSlots([]);});
    call<{items: WorkItemSummary[]}>(`items?dueBefore=${addDays(today, 7)}`).then(data => {if (alive) setDue(data.items.filter(item => item.dueAt).sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '')).slice(0, 6));}).catch(() => {if (alive) setDue([]);});
    notebookApi<NotebookStatus>('status').then(status => {if (alive && status) setNotebook(status);});
    return () => {alive = false;};
  }, [today]);
  // Record counts are notebook data: they show only while the notebook is unlocked on this device.
  const notebookOpen = !!notebook?.unlocked;
  useEffect(() => {
    if (!notebookOpen) return;
    let alive = true;
    notebookApi<{days: Record<string, NotebookDaySummary>}>(`month?month=${month}`).then(data => {if (alive) setRecords(data?.days ?? {});});
    return () => {alive = false;};
  }, [notebookOpen, month]);

  const openTodos = todos.filter(todo => !todo.done), lateTodos = openTodos.filter(todo => todo.due && todo.due < today).length;
  const todoDays = useMemo(() => {const map = new Map<string, number>(); for (const todo of todos) if (!todo.done && todo.due) map.set(todo.due, (map.get(todo.due) ?? 0) + 1); return map;}, [todos]);
  const dayEvents = (date: string) => (events ?? []).filter(event => covers(event, date));
  const selectedEvents = dayEvents(selected), selectedTodos = todoDays.get(selected) ?? 0, selectedRecords = records[selected]?.entries ?? 0;
  const when = (event: CalendarEvent) => event.allDay ? (event.startDate === event.endDate ? '하루 종일' : `${shortDate(event.startDate)} ~ ${shortDate(event.endDate)}`) : event.readOnly ? `${seoulTime(event.start)} 마감 · 숙제` : `${seoulTime(event.start)} ~ ${seoulTime(event.end)}`;
  const count = (value: unknown[] | null) => value === null ? '–' : String(value.length);

  return <section className="wsp-panel wsh">
    <div className="wsh-stats">
      <button type="button" className="wsh-stat" onClick={() => onPick('timetable')}><span><Table size={14}/>오늘 수업</span><strong>{count(slots)}<small>교시</small></strong></button>
      <button type="button" className="wsh-stat" onClick={() => {setMonth(today.slice(0, 7)); setSelected(today);}}><span><CalendarDays size={14}/>오늘 일정</span><strong>{count(todayEvents)}<small>건</small></strong></button>
      {notebook?.available && <a className={`wsh-stat${lateTodos ? ' is-alert' : ''}`} href="#wsh-todos"><span><ListTodo size={14}/>남은 할 일</span><strong>{openTodos.length}<small>{lateTodos ? `개 · 기한 지남 ${lateTodos}` : '개'}</small></strong></a>}
      <button type="button" className="wsh-stat" onClick={() => onPick('folders')}><span><ClipboardList size={14}/>곧 마감</span><strong>{count(due)}<small>건 · 7일 안</small></strong></button>
    </div>
    {error && <p className="wsp-error" role="alert">{error}</p>}
    <div className="wsh-grid">
      <div className="wsh-col">
        <div className="wsp-card">
          <div className="wsp-toolbar">
            <div className="wsp-nav"><button type="button" className="icon-button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달"><ChevronLeft size={18}/></button><strong>{Number(month.slice(0, 4))}년 {Number(month.slice(5, 7))}월</strong><button type="button" className="icon-button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달"><ChevronRight size={18}/></button></div>
            <div className="wsp-actions"><button type="button" className="button soft" onClick={() => {setMonth(today.slice(0, 7)); setSelected(today);}}>오늘</button><button type="button" className="button primary" onClick={() => onPick('calendar')}><Plus size={15}/>일정</button></div>
          </div>
          {!events ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p> : <div className="wsp-month wsh-month">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => <span key={d} className="wsp-weekday">{d}</span>)}
            {days.map(date => {const list = dayEvents(date), todo = todoDays.get(date) ?? 0, rec = records[date]?.entries ?? 0; return <button type="button" key={date} className={`wsp-day${date.slice(0, 7) !== month ? ' is-other' : ''}${date === today ? ' is-today' : ''}${date === selected ? ' is-selected' : ''}`} onClick={() => setSelected(date)} aria-pressed={date === selected} aria-label={`${shortDate(date)} 일정 ${list.length}건${todo ? `, 할 일 ${todo}개` : ''}${rec ? `, 기록 ${rec}건` : ''}`}>
              <span>{Number(date.slice(8))}</span>
              {list.slice(0, 2).map(event => <i key={event.id} className={`wsp-chip kind-${event.kind}${event.pending ? ' is-pending' : ''}`}>{event.title}</i>)}
              {list.length > 2 && <small>+{list.length - 2}</small>}
              {(todo > 0 || rec > 0) && <em className="wsh-marks">{todo > 0 && <b className="wsh-todo">할 일 {todo}</b>}{rec > 0 && <b className="wsh-rec">기록 {rec}</b>}</em>}
            </button>;})}
          </div>}
          <p className="wsh-legend"><span><i className="wsp-chip kind-school">일정</i></span><span><b className="wsh-todo">할 일</b> 기한인 날</span>{notebook?.available && <span><b className="wsh-rec">기록</b> {notebookOpen ? '교무수첩 기록 수' : '교무수첩을 열면 보여요'}</span>}</p>
        </div>
        <div className="wsp-card">
          <div className="wsp-row"><h3>{shortDate(selected)}{selected === today && <small>오늘</small>}</h3><button type="button" className="nb-link" onClick={() => onPick('calendar')}>일정 고치기</button></div>
          {!selectedEvents.length ? <p className="wsp-muted">일정이 없어요.</p> : <ul className="wsp-list">{selectedEvents.map(event => <li key={event.id} className={event.pending ? 'is-pending' : ''}>
            <div><span className={`wsp-kind kind-${event.kind}`}>{CALENDAR_KIND_LABELS[event.kind]}</span> <strong>{event.title}</strong><small>{when(event)}{event.pending ? ' · 베리 제안(일정에서 확정)' : ''}</small></div>
          </li>)}</ul>}
          {(selectedTodos > 0 || selectedRecords > 0) && <p className="wsh-day-extra">{selectedTodos > 0 && <a href="#wsh-todos"><ListTodo size={14}/>이 날까지 할 일 {selectedTodos}개</a>}{selectedRecords > 0 && <Link href="/teacher/me/notebook"><BookUser size={14}/>교무수첩 기록 {selectedRecords}건</Link>}</p>}
        </div>
      </div>
      <div className="wsh-col">
        {notebook?.available && <div id="wsh-todos"><Todos date={selected} onChanged={setTodos}/></div>}
        <div className="wsp-card">
          <div className="wsp-row"><h3><Table size={16}/>오늘 시간표</h3><button type="button" className="nb-link" onClick={() => onPick('timetable')}>주간 보기</button></div>
          {!slots ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p> : !slots.length ? <p className="wsp-muted">오늘 시간표가 비어 있어요.</p> : <ol className="wsh-slots">{slots.map(slot => <li key={slot.period}><b>{slot.period}</b>{slot.subject}{slot.room && <small>{slot.room}</small>}</li>)}</ol>}
        </div>
        <div className="wsp-card">
          <div className="wsp-row"><h3><ClipboardList size={16}/>곧 마감<small>업무 폴더</small></h3><button type="button" className="nb-link" onClick={() => onPick('folders')}>폴더 열기</button></div>
          {!due ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p> : !due.length ? <p className="wsp-muted">일주일 안에 마감인 일이 없어요.</p> : <ol className="wsh-slots">{due.map(item => <li key={item.id}><b className={item.dueAt!.slice(0, 10) < today ? 'is-late' : ''}>{shortDate(item.dueAt!.slice(0, 10))}</b>{item.title}</li>)}</ol>}
        </div>
        {notebook?.available && <Link href="/teacher/me/notebook" className="wsp-card wsh-notebook">
          <BookUser size={22}/><span><strong>교무수첩</strong><small>학생 관찰·상담 기록 · {notebookOpen ? '지금 열려 있어요' : '비밀번호로 열어요'}</small></span>{!notebookOpen && <Lock size={16}/>}
        </Link>}
      </div>
    </div>
  </section>;
}
