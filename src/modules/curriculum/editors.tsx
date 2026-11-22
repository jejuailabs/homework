'use client';
import {useState} from 'react';
import {CalendarPlus, Save, X} from 'lucide-react';
import {addDays, shortDate, weekdayOf, type DayKind, type DayNote, type Plan} from './engine';

/** 교육과정 작업실의 입력 화면들: 우리 반 시작, 반 정보, 학사일정 하루 고치기. 모두 계획 전체를 새로 만들어 onPlan으로 넘긴다. */

export type StartInput = {schoolName: string; className: string; grade: number; useSampleTimetable: boolean};

export function StartDialog({busy, error, onStart, onClose}: {busy: boolean; error: string; onStart: (input: StartInput) => void; onClose: () => void}) {
  const [input, setInput] = useState<StartInput>({schoolName: '', className: '', grade: 3, useSampleTimetable: false});
  const set = (patch: Partial<StartInput>) => setInput(old => ({...old, ...patch}));
  return <div className="cur-dialog" role="dialog" aria-modal="true" aria-label="우리 반 시작하기" onClick={onClose}>
    <form className="cur-dialog-card cur-form" onClick={event => event.stopPropagation()} onSubmit={event => {event.preventDefault(); onStart(input);}}>
      <header><h3>우리 반 시작하기</h3><button type="button" className="cur-icon" aria-label="닫기" onClick={onClose}><X size={18}/></button></header>
      <p className="cur-muted">2026학년도로 시작해요. 공휴일·대체공휴일은 자동으로 들어가고, 방학·재량휴업·행사와 학교 기준시수는 시작한 뒤 넣어요.</p>
      <label>학교 이름<input required maxLength={40} value={input.schoolName} onChange={event => set({schoolName: event.target.value})} placeholder="예: 제주○○초등학교"/></label>
      <div className="cur-form-pair">
        <label>학년<select value={input.grade} onChange={event => set({grade: Number(event.target.value)})}>{[1, 2, 3, 4, 5, 6].map(grade => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
        <label>학급 이름<input required maxLength={20} value={input.className} onChange={event => set({className: event.target.value})} placeholder={`예: ${input.grade}학년 4반`}/></label>
      </div>
      {input.grade >= 3 && input.grade <= 4 && <label className="cur-check"><input type="checkbox" checked={input.useSampleTimetable} onChange={event => set({useSampleTimetable: event.target.checked})}/>예시 시간표로 채워 두고 고치기</label>}
      {error && <p className="cur-error">{error}</p>}
      <footer><button type="button" className="cur-btn is-ghost" onClick={onClose}>나중에</button><button className="cur-btn" disabled={busy}>{busy ? '만드는 중…' : '시작하기'}</button></footer>
    </form>
  </div>;
}

/** 1.1.3 학급현황설정 자리: 우리 반 정보와 학년도 기간. 학년은 교과 편제가 달라 여기서 바꾸지 않는다. */
export function InfoView({plan, onPlan}: {plan: Plan; onPlan: (plan: Plan) => void}) {
  const [draft, setDraft] = useState({schoolName: plan.schoolName, className: plan.className, semester2On: plan.semester2On, endsOn: plan.endsOn, periodsPerDay: plan.periodsPerDay, daysRequired: plan.daysRequired});
  const changed = Object.entries(draft).some(([key, value]) => plan[key as keyof typeof draft] !== value);
  const valid = draft.schoolName.trim() && draft.className.trim() && draft.semester2On > plan.startsOn && draft.endsOn >= draft.semester2On;
  return <section className="cur-view">
    <div className="cur-view-head"><div><h3>우리 반 정보</h3><p>{plan.year}학년도 {plan.grade}학년 · 학년도 시작 {shortDate(plan.startsOn)}</p></div></div>
    {plan.sample ? <p className="cur-muted">예시 학급은 고칠 수 없어요. 우리 반을 시작하면 여기서 고쳐요.</p> : <form className="cur-form is-inline" onSubmit={event => {event.preventDefault(); if (valid) onPlan({...plan, ...draft, schoolName: draft.schoolName.trim(), className: draft.className.trim()});}}>
      <label>학교 이름<input maxLength={40} value={draft.schoolName} onChange={event => setDraft({...draft, schoolName: event.target.value})}/></label>
      <label>학급 이름<input maxLength={20} value={draft.className} onChange={event => setDraft({...draft, className: event.target.value})}/></label>
      <label>2학기 시작<input type="date" value={draft.semester2On} onChange={event => setDraft({...draft, semester2On: event.target.value})}/></label>
      <label>학년도 끝<input type="date" value={draft.endsOn} onChange={event => setDraft({...draft, endsOn: event.target.value})}/></label>
      <label>하루 최대 교시<input type="number" min={4} max={10} value={draft.periodsPerDay} onChange={event => setDraft({...draft, periodsPerDay: Number(event.target.value)})}/></label>
      <label>법정 수업일수<input type="number" min={0} max={250} value={draft.daysRequired} onChange={event => setDraft({...draft, daysRequired: Number(event.target.value)})}/></label>
      <footer><button className="cur-btn" disabled={!changed || !valid}><Save size={16}/>저장</button></footer>
    </form>}
  </section>;
}

const KIND_LABELS: Record<DayKind | 'class', string> = {class: '수업일(일정 없음)', event: '행사(수업은 함)', holiday: '공휴일', vacation: '방학', off: '재량휴업일'};

/** 학사일정 하루(또는 방학처럼 여러 날)를 고친다. 수업일로 바꾸면 그날 일정을 지운다. */
export function DayDialog({plan, date, onPlan, onClose}: {plan: Plan; date: string; onPlan: (plan: Plan) => void; onClose: () => void}) {
  const current = plan.days.find(day => day.date === date);
  const [kind, setKind] = useState<DayKind | 'class'>(current?.kind ?? 'class'), [name, setName] = useState(current?.name ?? ''), [periods, setPeriods] = useState<number | ''>(current?.periods ?? '');
  const [until, setUntil] = useState(date);
  const apply = () => {
    const dates: string[] = [];
    for (let day = date; day <= (until < date ? date : until) && dates.length < 120; day = addDays(day, 1)) if (day >= plan.startsOn && day <= plan.endsOn) dates.push(day);
    const rest = plan.days.filter(day => !dates.includes(day.date));
    const label = name.trim() || KIND_LABELS[kind].replace(/\(.*\)/, '');
    const added: DayNote[] = kind === 'class' ? [] : dates.filter(day => kind === 'vacation' || weekdayOf(day) <= 5 || day === date).map(day => ({date: day, kind, name: label, ...(kind === 'event' && periods ? {periods: Number(periods)} : {})}));
    onPlan({...plan, days: [...rest, ...added].sort((a, b) => a.date.localeCompare(b.date))});
    onClose();
  };
  return <div className="cur-dialog" role="dialog" aria-modal="true" aria-label={`${shortDate(date)} 학사일정`} onClick={onClose}>
    <form className="cur-dialog-card cur-form" onClick={event => event.stopPropagation()} onSubmit={event => {event.preventDefault(); apply();}}>
      <header><h3><CalendarPlus size={18}/>{shortDate(date)}</h3><button type="button" className="cur-icon" aria-label="닫기" onClick={onClose}><X size={18}/></button></header>
      <label>종류<select value={kind} onChange={event => setKind(event.target.value as DayKind | 'class')}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {kind !== 'class' && <label>이름<input maxLength={30} value={name} onChange={event => setName(event.target.value)} placeholder={kind === 'event' ? '예: 운동회' : kind === 'vacation' ? '예: 여름방학' : '예: 개교기념일'}/></label>}
      {kind === 'event' && <label>이날 몇 교시까지 (비우면 평소대로)<input type="number" min={1} max={plan.periodsPerDay} value={periods} onChange={event => setPeriods(event.target.value ? Number(event.target.value) : '')}/></label>}
      <label>{kind === 'class' ? '여기까지 일정 지우기' : '여기까지 같은 일정'}<input type="date" min={date} max={plan.endsOn} value={until} onChange={event => setUntil(event.target.value)}/></label>
      <footer><button type="button" className="cur-btn is-ghost" onClick={onClose}>취소</button><button className="cur-btn"><Save size={16}/>적용</button></footer>
    </form>
  </div>;
}
