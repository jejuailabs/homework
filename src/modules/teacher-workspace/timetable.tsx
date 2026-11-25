'use client';
import {useCallback, useEffect, useState, type CSSProperties} from 'react';
import {ChevronLeft, ChevronRight, ClipboardPaste, Clock3, FileUp, LoaderCircle, NotebookPen, Pencil, Printer, X} from 'lucide-react';
import {AttachButton, attachmentsStatus, draftFrom, uploadAttachment} from '@/modules/attachments/client';
import {ACCEPT_HINT, MAX_PER_MESSAGE} from '@/modules/attachments/policy';
import {call, message, seoulToday, shortDate} from './api';
import {addDays, weekDates, weekKeyOf} from './shared';
import {DEFAULT_BELLS, changedCells, daySlots, nowPeriod, schoolDay, subjectHue, type Bell} from './timetable-view';
import type {Timetable, TimetableSlot} from './types';

const DAYS = ['월', '화', '수', '목', '금'], PERIODS = [1, 2, 3, 4, 5, 6, 7];
export const LESSON_PREFILL = 'wsp-lesson-prefill';
const seoulClock = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(11, 16);
const tint = (subject: string) => ({'--tt': subjectHue(subject)}) as CSSProperties;
const cellText = (slot: {subject: string; room?: string}) => slot.room ? `${slot.subject}(${slot.room})` : slot.subject;

/** Today's lessons, top of the timetable: what is on now, what is next, and a shortcut into the lesson log. */
function TodayCard({slots, bells, clock, onLog}: {slots: TimetableSlot[]; bells: Bell[]; clock: string; onLog: (slot: TimetableSlot) => void}) {
  const now = nowPeriod(bells, clock, slots.map(slot => slot.period));
  const headline = now.current ? `지금 ${now.current}교시 · ${now.left}분 남음` : now.next ? `다음은 ${now.next}교시 · ${now.wait >= 60 ? `${Math.floor(now.wait / 60)}시간 ${now.wait % 60}분` : `${now.wait}분`} 뒤` : slots.length ? '오늘 수업이 끝났어요' : '';
  return <div className="wsp-card wsp-tt-today">
    <div className="wsp-row"><h3>오늘 시간표 <small>{shortDate(seoulToday())}</small></h3>{headline && <strong className="wsp-tt-headline"><Clock3 size={14}/>{headline}</strong>}</div>
    {!slots.length ? <p className="wsp-muted">오늘 시간표가 비어 있어요. 아래에서 편집하거나 파일로 넣어 보세요.</p> : <ol className="wsp-tt-day">{slots.map(slot => {
      const state = now.current === slot.period ? 'is-now' : now.next === slot.period ? 'is-next' : bells[slot.period - 1] && clock >= bells[slot.period - 1].end ? 'is-done' : '';
      return <li key={slot.period} className={state} style={tint(slot.subject)}>
        <b>{slot.period}</b>
        <span className="wsp-tt-time">{bells[slot.period - 1] ? `${bells[slot.period - 1].start}~${bells[slot.period - 1].end}` : ''}</span>
        <strong>{slot.subject}{slot.room && <small>{slot.room}</small>}</strong>
        {state === 'is-now' && <em>지금</em>}{state === 'is-next' && <em>다음</em>}
        <button type="button" className="icon-button" onClick={() => onLog(slot)} aria-label={`${slot.period}교시 ${slot.subject} 수업 일지 쓰기`} title="수업 일지 쓰기"><NotebookPen size={15}/></button>
      </li>;
    })}</ol>}
  </div>;
}

function BellsDialog({bells, onClose, onSaved}: {bells: Bell[]; onClose: () => void; onSaved: (bells: Bell[]) => void}) {
  const [draft, setDraft] = useState(bells), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = (index: number, patch: Partial<Bell>) => setDraft(draft.map((bell, at) => at === index ? {...bell, ...patch} : bell));
  async function save() {
    setBusy(true); setError('');
    try {onSaved((await call<{bells: Bell[]}>('bells', {body: {bells: draft}})).bells); onClose();} catch (e) {setError(message(e));} finally {setBusy(false);}
  }
  return <div className="wsp-dialog" role="dialog" aria-modal="true" aria-label="교시 시간"><div className="wsp-dialog-card">
    <div className="wsp-row"><h3>교시 시간</h3><button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={18}/></button></div>
    <p className="wsp-muted">우리 학교 시정표대로 맞춰 두면 “지금 몇 교시”가 정확해져요.</p>
    <div className="wsp-bells">{draft.map((bell, index) => <label key={index}><b>{index + 1}교시</b>
      <input type="time" value={bell.start} onChange={e => set(index, {start: e.target.value})} aria-label={`${index + 1}교시 시작`}/><span>~</span>
      <input type="time" value={bell.end} onChange={e => set(index, {end: e.target.value})} aria-label={`${index + 1}교시 끝`}/>
    </label>)}</div>
    {error && <p className="wsp-error" role="alert">{error}</p>}
    <div className="wsp-actions"><button type="button" className="button soft" onClick={() => setDraft(DEFAULT_BELLS)}>기본값</button><button type="button" className="button primary" disabled={busy} onClick={() => void save()}>{busy && <LoaderCircle className="spin" size={16}/>}저장</button></div>
  </div></div>;
}

export function TimetableTab({onLessons}: {onLessons: () => void}) {
  const today = seoulToday(), thisWeek = weekKeyOf(today);
  const [week, setWeek] = useState(thisWeek), [table, setTable] = useState<Timetable | null>(null), [base, setBase] = useState<TimetableSlot[] | null>(null), [error, setError] = useState('');
  const [editing, setEditing] = useState<Record<string, string> | null>(null), [unsure, setUnsure] = useState<Set<string>>(new Set()), [fromFile, setFromFile] = useState('');
  const [paste, setPaste] = useState<string | null>(null), [busy, setBusy] = useState(false), [reading, setReading] = useState('');
  const [bells, setBells] = useState<Bell[]>(DEFAULT_BELLS), [bellsOpen, setBellsOpen] = useState(false), [clock, setClock] = useState(seoulClock), [canAttach, setCanAttach] = useState(false);
  const dates = weekDates(week);
  const load = useCallback(async () => {
    setError(''); setBase(null);
    try {
      const next = await call<Timetable>(`timetable/${week}`);
      setTable(next);
      // A week with its own saved table is compared with the week before, to mark what changed this week only.
      if (!next.inheritedFrom && next.updatedAt) call<Timetable>(`timetable/${weekKeyOf(addDays(weekDates(week)[0], -7))}`).then(before => setBase(before.slots)).catch(() => {});
    } catch (e) {setError(message(e));}
  }, [week]);
  useEffect(() => {void load();}, [load]);
  useEffect(() => {
    call<{bells: Bell[]}>('bells').then(data => setBells(data.bells)).catch(() => {});
    attachmentsStatus().then(setCanAttach);
    const timer = setInterval(() => setClock(seoulClock()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const cell = (slots: TimetableSlot[], day: number, period: number) => slots.find(slot => slot.day === day && slot.period === period);
  const stopEdit = () => {setEditing(null); setUnsure(new Set()); setFromFile('');};
  const startEdit = () => {setUnsure(new Set()); setFromFile(''); setEditing(Object.fromEntries((table?.slots ?? []).map(slot => [`${slot.day}:${slot.period}`, cellText(slot)])));};
  async function save(body: object) {
    setBusy(true); setError('');
    try {setTable(await call<Timetable>(`timetable/${week}`, {body})); stopEdit(); setPaste(null); void load();} catch (e) {setError(message(e));} finally {setBusy(false);}
  }
  /** Photo, Hangul, PDF or Excel → the editing grid. Nothing is saved until the teacher presses 저장. */
  async function readFiles(list: FileList) {
    setError(''); setPaste(null);
    const ids: string[] = [];
    try {
      for (const file of [...list].slice(0, MAX_PER_MESSAGE)) ids.push((await uploadAttachment(file, stage => setReading(`${file.name} ${stage === 'uploading' ? '올리는 중…' : '읽는 중…'}`))).id);
      setReading('시간표로 정리하는 중…');
      const draft = await draftFrom('timetable', {attachmentIds: ids});
      if (!draft.slots.length) throw new Error('파일에서 시간표를 찾지 못했어요. 시간표가 잘 보이는 사진이나 파일로 다시 올려 주세요.');
      setEditing(Object.fromEntries(draft.slots.map(slot => [`${slot.day}:${slot.period}`, cellText(slot)])));
      setUnsure(new Set(draft.unsure.map(slot => `${slot.day}:${slot.period}`)));
      setFromFile(draft.note || ' ');
    } catch (e) {setError(message(e));} finally {setReading('');}
  }
  function print() {
    const root = document.documentElement, done = () => {root.classList.remove('wsp-printing'); window.removeEventListener('afterprint', done);};
    root.classList.add('wsp-printing'); window.addEventListener('afterprint', done); window.print();
  }
  function logLesson(slot: TimetableSlot) {
    try {sessionStorage.setItem(LESSON_PREFILL, `${slot.period}교시 ${slot.subject} `);} catch {}
    onLessons();
  }
  // The grid edits as text, so the server's paste parser reads both ways of entering a week.
  const gridText = (values: Record<string, string>) => PERIODS.map(period => [String(period), ...[1, 2, 3, 4, 5].map(day => (values[`${day}:${period}`] ?? '').replace(/\t/g, ' '))].join('\t')).join('\n');
  const weekday = week === thisWeek ? schoolDay(today) : 0, changed = table && base ? changedCells(table.slots, base) : new Set<string>();
  const now = table && weekday ? nowPeriod(bells, clock, daySlots(table.slots, weekday).map(slot => slot.period)) : null;
  const idle = !editing && paste === null && !reading;
  return <section className="wsp-panel">
    {weekday > 0 && table && !editing && <TodayCard slots={daySlots(table.slots, weekday)} bells={bells} clock={clock} onLog={logLesson}/>}
    <div className="wsp-toolbar">
      <div className="wsp-nav"><button type="button" className="icon-button" onClick={() => setWeek(weekKeyOf(addDays(dates[0], -7)))} aria-label="지난주"><ChevronLeft size={18}/></button><strong>{shortDate(dates[0])} ~ {shortDate(dates[4])}</strong><button type="button" className="icon-button" onClick={() => setWeek(weekKeyOf(addDays(dates[0], 7)))} aria-label="다음 주"><ChevronRight size={18}/></button>{week !== thisWeek && <button type="button" className="nb-link" onClick={() => setWeek(thisWeek)}>이번 주</button>}</div>
      {idle && <div className="wsp-actions">
        {canAttach && <AttachButton className="button soft" label={`시간표 파일 올리기 (${ACCEPT_HINT})`} onFiles={list => void readFiles(list)}><FileUp size={15}/>파일로 넣기</AttachButton>}
        <button type="button" className="button soft" onClick={() => setPaste('')}><ClipboardPaste size={15}/>붙여넣기</button>
        <button type="button" className="button soft" onClick={() => setBellsOpen(true)}><Clock3 size={15}/>교시 시간</button>
        <button type="button" className="button soft" onClick={print} disabled={!table?.slots.length}><Printer size={15}/>인쇄</button>
        <button type="button" className="button primary" onClick={startEdit} disabled={!table}><Pencil size={15}/>편집</button>
      </div>}
    </div>
    {reading && <p className="wsp-muted" role="status"><LoaderCircle className="spin" size={16}/> {reading}</p>}
    {error && <p className="wsp-error" role="alert">{error}</p>}
    {table?.inheritedFrom && !editing && <p className="wsp-muted">이 주는 저장된 시간표가 없어 {table.inheritedFrom} 시간표를 보여 줘요. 편집해 저장하면 이 주부터 적용돼요.</p>}
    {editing && fromFile && <p className="wsp-tt-note">파일에서 읽은 시간표예요. 아직 저장되지 않았어요. {unsure.size > 0 && <>노란 칸 {unsure.size}곳은 잘 안 보여서 비워 뒀어요. </>}{fromFile.trim()} 확인하고 <b>저장</b>을 누르면 이 주부터 적용돼요.</p>}
    {paste !== null && <div className="wsp-card">
      <p className="wsp-muted">엑셀·한글 표에서 월~금, 1~7교시 칸을 복사해 붙여 넣어요. 첫 줄 요일과 첫 칸 “1교시”는 있어도 돼요. “과학(과학실)”처럼 장소를 적을 수 있어요.</p>
      <textarea value={paste} rows={8} onChange={e => setPaste(e.target.value)} aria-label="시간표 붙여넣기" autoFocus/>
      <div className="wsp-actions"><button type="button" className="button soft" onClick={() => setPaste(null)}>취소</button><button type="button" className="button primary" disabled={busy || !paste.trim()} onClick={() => void save({text: paste})}>{busy && <LoaderCircle className="spin" size={16}/>}이 주에 저장</button></div>
    </div>}
    {!table ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p> : <div className="wsp-tt-print"><div className="wsp-timetable" role="table" aria-label="주간 시간표">
      <span role="columnheader"/>
      {DAYS.map((day, i) => <span key={day} role="columnheader" className={dates[i] === today ? 'is-today' : ''}>{day}<small>{Number(dates[i].slice(8))}</small></span>)}
      {PERIODS.map(period => <div key={period} role="row" className="wsp-tt-row"><span role="rowheader">{period}<small>{bells[period - 1]?.start}</small></span>
        {[1, 2, 3, 4, 5].map(day => {const slot = cell(table.slots, day, period), key = `${day}:${period}`; return editing
          ? <input key={key} role="cell" className={unsure.has(key) ? 'is-unsure' : ''} value={editing[key] ?? ''} maxLength={60} aria-label={`${DAYS[day - 1]} ${period}교시${unsure.has(key) ? ' (확인 필요)' : ''}`} onChange={e => setEditing({...editing, [key]: e.target.value})}/>
          : <span key={key} role="cell" style={slot ? tint(slot.subject) : undefined} className={[slot ? 'has-slot' : '', day === weekday ? 'is-today' : '', day === weekday && now?.current === period ? 'is-now' : '', changed.has(key) ? 'is-changed' : ''].filter(Boolean).join(' ')} title={changed.has(key) ? '지난주와 달라요' : undefined}>{slot?.subject}{slot?.room && <small>{slot.room}</small>}</span>;})}
      </div>)}
    </div>
    {changed.size > 0 && !editing && <p className="wsp-muted wsp-tt-legend"><i/> 지난주와 달라진 칸 {changed.size}곳</p>}
    </div>}
    {editing && <div className="wsp-actions"><button type="button" className="button soft" onClick={stopEdit}>취소</button><button type="button" className="button primary" disabled={busy} onClick={() => void save(Object.values(editing).some(value => value.trim()) ? {text: gridText(editing)} : {slots: []})}>{busy && <LoaderCircle className="spin" size={16}/>}저장</button></div>}
    {bellsOpen && <BellsDialog bells={bells} onClose={() => setBellsOpen(false)} onSaved={setBells}/>}
  </section>;
}
