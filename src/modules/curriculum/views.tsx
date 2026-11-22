'use client';
import {useMemo, useState} from 'react';
import {ChevronLeft, ChevronRight, Download, Printer, RotateCcw} from 'lucide-react';
import {WEEKDAYS, addDays, dayNote, hourStats, isSchoolDay, progressBook, schoolWeekOf, setSlot, shortDate, week, weekStartOf, weekdayOf, weeklyCounts, type Plan, type Session, type SubjectKey} from './engine';
import type {FileKind} from './files';

/** 교육과정 메뉴의 절 화면들. 모두 같은 계획(plan)에서 계산하므로 한 화면에서 바꾼 것이 다른 화면에 바로 보인다. */
export type ViewProps = {plan: Plan; sessions: Session[]; today: string; onPlan: (plan: Plan) => void; onDownload: (kind: FileKind, date?: string) => void; original: Plan};

export const toneOf = (plan: Plan, key: SubjectKey) => plan.subjects.find(subject => subject.key === key)?.tone ?? 'sand';
const signed = (value: number) => value > 0 ? `+${value}` : String(value);
const diffClass = (value: number) => value < 0 ? 'is-short' : value > 0 ? 'is-over' : 'is-even';

/** 1.2.4 연간시간표 — 스쿨마스터 "연간시수 통계표"와 같은 모양(교과가 열, 학기가 행). */
export function HoursView({plan, sessions, onDownload}: ViewProps) {
  const stats = useMemo(() => hourStats(plan, sessions), [plan, sessions]);
  const columns = [...stats.rows, stats.total];
  const line = (label: string, pick: (row: typeof stats.total) => number, kind: 'plain' | 'std' | 'diff') => (
    <tr className={`is-${kind}`}><th scope="row">{label}</th>{columns.map(row => {const value = pick(row); return <td key={row.subject} className={kind === 'diff' ? diffClass(value) : row.subject === 'total' ? 'is-total' : ''}>{kind === 'diff' ? signed(value) : value}</td>;})}</tr>
  );
  return <section className="cur-view">
    <div className="cur-view-head">
      <div><h3>연간 시수 통계표</h3><p>교과별 편성 시수를 학교 기준과 비교해요. <span className="cur-legend is-short">빨강 = 모자람</span> <span className="cur-legend is-over">파랑 = 많음</span></p></div>
      <button className="cur-btn" onClick={() => onDownload('hours')}><Download size={16}/>엑셀로 받기</button>
    </div>
    <div className="cur-table-wrap"><table className="cur-hours">
      <thead><tr><th/>{columns.map(row => <th key={row.subject} scope="col">{row.subject === 'total' ? '합계' : plan.subjects.find(subject => subject.key === row.subject)?.short === '창' ? '창체' : row.name}</th>)}</tr></thead>
      <tbody>
        {line('1학기 편성', row => row.planned[1], 'plain')}{line('기준', row => row.standard[1], 'std')}{line('증감', row => row.diff[1], 'diff')}
        {line('2학기 편성', row => row.planned[2], 'plain')}{line('기준', row => row.standard[2], 'std')}{line('증감', row => row.diff[2], 'diff')}
        {line('연간 편성', row => row.planned.year, 'plain')}{line('기준', row => row.standard.year, 'std')}{line('증감', row => row.diff.year, 'diff')}
      </tbody>
    </table></div>
    <div className="cur-notes">
      <div className="cur-days"><strong>{stats.schoolDays.year}일</strong><span>수업일수 (기준 {stats.daysRequired}일)</span><small>1학기 {stats.schoolDays[1]}일 · 2학기 {stats.schoolDays[2]}일</small></div>
      <ul className="cur-warn">{stats.warnings.length ? stats.warnings.map(text => <li key={text}>{text}</li>) : <li className="is-ok">기준과 어긋난 교과가 없어요.</li>}</ul>
    </div>
  </section>;
}

/** 1.2.3 기초시간표 — 칸을 누르면 과목을 바꾸고, 시수표·주간학습이 바로 따라 바뀐다. */
export function TemplateView({plan, original, onPlan}: ViewProps) {
  const [semester, setSemester] = useState<1 | 2>(1), [open, setOpen] = useState<string | null>(null);
  const counts = weeklyCounts(plan, semester), periods = Array.from({length: plan.periodsPerDay}, (_, index) => index + 1);
  const before = useMemo(() => hourStats(original), [original]), after = useMemo(() => hourStats(plan), [plan]);
  const changes = after.rows.map((row, index) => ({name: row.name, delta: row.planned.year - before.rows[index].planned.year})).filter(entry => entry.delta);
  const cell = (weekday: number, period: number) => plan.templates[semester].find(slot => slot.weekday === weekday && slot.period === period);
  return <section className="cur-view">
    <div className="cur-view-head">
      <div><h3>기초시간표</h3><p>칸을 눌러 과목을 바꿔 보세요. 연간 시수·주간학습이 바로 다시 계산돼요.</p></div>
      <div className="cur-seg" role="tablist">{([1, 2] as const).map(value => <button key={value} role="tab" aria-selected={semester === value} className={semester === value ? 'is-on' : ''} onClick={() => setSemester(value)}>{value}학기</button>)}</div>
    </div>
    <div className="cur-template">
      <span/>{[1, 2, 3, 4, 5].map(day => <span key={day} className="cur-template-day">{WEEKDAYS[day]}</span>)}
      {periods.map(period => <div className="cur-template-row" key={period}>
        <span className="cur-template-period">{period}</span>
        {[1, 2, 3, 4, 5].map(weekday => {
          const slot = cell(weekday, period), key = `${weekday}-${period}`, subject = plan.subjects.find(entry => entry.key === slot?.subject);
          const changed = original.templates[semester].find(entry => entry.weekday === weekday && entry.period === period)?.subject !== slot?.subject;
          return <div key={key} className="cur-template-cell-wrap">
            <button className={`cur-template-cell tone-${subject?.tone ?? 'empty'}${changed ? ' is-changed' : ''}`} aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>{subject?.name ?? '비움'}</button>
            {open === key && <div className="cur-pick" role="menu">
              {plan.subjects.map(entry => <button key={entry.key} role="menuitem" className={`tone-${entry.tone}`} onClick={() => {onPlan(setSlot(plan, semester, weekday, period, entry.key)); setOpen(null);}}>{entry.short}</button>)}
              <button role="menuitem" className="tone-empty" onClick={() => {onPlan(setSlot(plan, semester, weekday, period, null)); setOpen(null);}}>비움</button>
            </div>}
          </div>;
        })}
      </div>)}
    </div>
    <div className="cur-counts">{plan.subjects.map(subject => <span key={subject.key} className={`cur-chip tone-${subject.tone}`}>{subject.short === '창' ? '창체' : subject.name} 주 {counts.get(subject.key) ?? 0}</span>)}</div>
    <div className="cur-change">
      {changes.length ? <><strong>바꾼 결과 (연간 시수)</strong>{changes.map(entry => <span key={entry.name} className={diffClass(entry.delta)}>{entry.name} {signed(entry.delta)}</span>)}<button className="cur-btn is-ghost" onClick={() => onPlan(original)}><RotateCcw size={15}/>처음으로</button></> : <span className="cur-muted">아직 바꾼 칸이 없어요. 시험 화면이라 바꾼 내용은 저장되지 않아요.</span>}
    </div>
  </section>;
}

/** 1.1.5 학사일정-휴업일 — 한 해를 달력 열두 장으로, 수업일수는 계산해서. */
export function CalendarView({plan}: ViewProps) {
  const months = useMemo(() => {
    const out: string[] = [];
    for (let month = plan.startsOn.slice(0, 7); month <= plan.endsOn.slice(0, 7); month = addDays(`${month}-28`, 7).slice(0, 7)) out.push(month);
    return out;
  }, [plan]);
  const stats = useMemo(() => hourStats(plan), [plan]);
  return <section className="cur-view">
    <div className="cur-view-head">
      <div><h3>학사일정·휴업일</h3><p>공휴일·방학·행사를 빼고 수업일수를 셉니다.</p></div>
      <div className="cur-days is-inline"><strong>{stats.schoolDays.year}일</strong><span>/ 기준 {plan.daysRequired}일</span></div>
    </div>
    <div className="cur-legend-row"><span className="day-class">수업</span><span className="day-event">행사</span><span className="day-holiday">공휴일</span><span className="day-vacation">방학</span><span className="day-off">재량휴업</span></div>
    <div className="cur-months">{months.map(month => {
      const first = `${month}-01`, lead = weekdayOf(first) - 1, length = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
      const days = Array.from({length}, (_, index) => addDays(first, index));
      const count = days.filter(date => isSchoolDay(plan, date)).length;
      return <div className="cur-month" key={month}>
        <h4>{+month.slice(5, 7)}월 <small>수업 {count}일</small></h4>
        <div className="cur-month-grid">{['월', '화', '수', '목', '금', '토', '일'].map(day => <b key={day}>{day}</b>)}{Array.from({length: lead}, (_, index) => <i key={`lead-${index}`}/>)}
          {days.map(date => {
            const note = dayNote(plan, date), inYear = date >= plan.startsOn && date <= plan.endsOn, weekend = weekdayOf(date) > 5;
            const kind = !inYear ? 'out' : note ? note.kind : weekend ? 'weekend' : 'class';
            return <span key={date} className={`day-${kind}`} title={note ? `${shortDate(date)} ${note.name}` : undefined}>{+date.slice(8, 10)}</span>;
          })}
        </div>
        <ul>{plan.days.filter(day => day.date.startsWith(month) && day.kind !== 'vacation').map(day => <li key={day.date}><b>{+day.date.slice(8, 10)}일</b> {day.name}{day.periods ? ` (${day.periods}교시)` : ''}</li>)}</ul>
      </div>;
    })}</div>
  </section>;
}

/** 1.2.5 교과진도표 — 교과 하나의 학기 차시를 날짜 순으로. 오늘 이후 첫 차시를 표시한다. */
export function ProgressView({plan, sessions, today, onDownload}: ViewProps) {
  const [subject, setSubject] = useState(plan.subjects[0].key), [semester, setSemester] = useState<1 | 2>(today >= plan.semester2On ? 2 : 1);
  const rows = useMemo(() => progressBook(plan, subject, semester, sessions), [plan, subject, semester, sessions]);
  const nextIndex = rows.findIndex(row => row.date >= today), done = nextIndex === -1 ? rows.length : nextIndex;
  return <section className="cur-view">
    <div className="cur-view-head">
      <div><h3>교과진도표</h3><p>{rows.length}차시 중 {done}차시 지났어요 ({rows.length ? Math.round(done / rows.length * 100) : 0}%).</p></div>
      <div className="cur-actions">
        <div className="cur-seg">{([1, 2] as const).map(value => <button key={value} className={semester === value ? 'is-on' : ''} onClick={() => setSemester(value)}>{value}학기</button>)}</div>
        <button className="cur-btn" onClick={() => onDownload('progress')}><Download size={16}/>엑셀로 받기</button>
      </div>
    </div>
    <div className="cur-subjects">{plan.subjects.map(entry => <button key={entry.key} className={`cur-chip tone-${entry.tone}${subject === entry.key ? ' is-on' : ''}`} onClick={() => setSubject(entry.key)}>{entry.short === '창' ? '창체' : entry.name}</button>)}</div>
    <div className="cur-table-wrap is-tall"><table className="cur-progress">
      <thead><tr><th>순</th><th>날짜</th><th>교시</th><th>단원</th><th>차시</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.date}-${row.period}`} className={index < done ? 'is-done' : index === done ? 'is-next' : ''}><td>{row.seq}</td><td>{shortDate(row.date)}</td><td>{row.period}</td><td>{row.unit ?? '—'}</td><td>{row.lessons ? `${row.lesson}/${row.lessons}` : ''}</td></tr>)}</tbody>
    </table></div>
  </section>;
}

/** 1.2.9 주간학습안내 — A4 한 장 미리보기. 인쇄는 이 영역만 나간다. */
export function WeeklyView({plan, sessions, today, onDownload, focusDate}: ViewProps & {focusDate?: string}) {
  const thisWeek = schoolWeekOf(today), [date, setDate] = useState(focusDate ?? thisWeek);
  const days = useMemo(() => week(plan, date, sessions), [plan, date, sessions]);
  const start = weekStartOf(date), periods = Array.from({length: plan.periodsPerDay}, (_, index) => index + 1);
  return <section className="cur-view">
    <div className="cur-view-head">
      <div className="cur-week-nav">
        <button className="cur-icon" aria-label="지난주" onClick={() => setDate(addDays(start, -7))}><ChevronLeft size={18}/></button>
        <h3>{shortDate(start)} ~ {shortDate(addDays(start, 4))}</h3>
        <button className="cur-icon" aria-label="다음 주" onClick={() => setDate(addDays(start, 7))}><ChevronRight size={18}/></button>
        <button className="cur-btn is-ghost" onClick={() => setDate(thisWeek)}>이번 주</button>
      </div>
      <div className="cur-actions">
        <button className="cur-btn is-ghost" onClick={() => window.print()}><Printer size={16}/>인쇄</button>
        <button className="cur-btn" onClick={() => onDownload('weekly', date)}><Download size={16}/>엑셀로 받기</button>
      </div>
    </div>
    <div className="cur-sheet-scroll"><article className="cur-sheet" id="cur-print">
      <header><span>{plan.year}학년도 {plan.className}</span><h4>주간학습 안내</h4><span>{shortDate(start)} ~ {shortDate(addDays(start, 4))}</span></header>
      <div className="cur-sheet-grid" style={{gridTemplateColumns: `56px repeat(5, minmax(0, 1fr))`}}>
        <b/>{days.map(day => <b key={day.date} className={day.date === today ? 'is-today' : ''}>{WEEKDAYS[day.weekday]} {+day.date.slice(5, 7)}/{+day.date.slice(8, 10)}</b>)}
        <i>행사</i>{days.map(day => <i key={day.date}>{day.note?.name ?? ''}</i>)}
        {periods.map(period => <div className="cur-sheet-row" key={period}><em>{period}교시</em>{days.map(day => {
          if (!day.school) return period === 1 ? <span key={day.date} className="is-off" style={{gridRow: `span ${plan.periodsPerDay}`}}>{day.note?.name ?? '수업 없음'}</span> : null;
          const cell = day.cells.find(entry => entry.period === period);
          return <span key={day.date} className={cell ? `tone-${toneOf(plan, cell.subject)}` : 'is-empty'}>{cell && <><strong>{cell.name}</strong>{cell.unit && <small>{cell.unit}{cell.lessons ? ` ${cell.lesson}/${cell.lessons}` : ''}</small>}</>}</span>;
        })}</div>)}
      </div>
      <footer>{plan.sample ? '시험용 예시 학급 자료입니다.' : '모두의 교실에서 만든 안내장입니다.'}</footer>
    </article></div>
  </section>;
}

export const SECTION_VIEWS = {hours: HoursView, template: TemplateView, calendar: CalendarView, progress: ProgressView, weekly: WeeklyView} as const;
export type SectionViewKey = keyof typeof SECTION_VIEWS;
