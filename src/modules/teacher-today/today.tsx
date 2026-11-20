'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {CalendarDays, ClipboardList, NotebookPen, Send, Sparkles} from 'lucide-react';
import {call, seoulTime, seoulToday, shortDate} from '@/modules/teacher-workspace/api';
import {addDays, weekKeyOf} from '@/modules/teacher-workspace/shared';
import {CALENDAR_KIND_LABELS, type CalendarEvent, type Timetable, type WorkItemSummary} from '@/modules/teacher-workspace/types';
import './styles.css';

/**
 * "오늘" on the teacher home: today's timetable, events and near deadlines from the workspace,
 * plus a one-line box that hands the sentence to Berry. This module stores nothing itself:
 * it reads the workspace APIs and writes only through Berry's own confirm cards.
 */
type Today = {slots: Timetable['slots']; events: CalendarEvent[]; items: WorkItemSummary[]};
const EXAMPLES = ['내일 3시 학년 협의회', '금요일까지 체험학습 동의서 걷기', '민서 오늘 발표를 또박또박 잘함'];
const quickPrompt = (text: string) => `방금 적은 한 줄이야: "${text}"\n일정이면 일정으로, 해야 할 일이면 할 일로, 학생에 대한 관찰이면 교무수첩 기록으로 넣어 줘. 여러 가지가 섞여 있으면 나눠서 넣고, 저장 전에 확인 카드로 보여 줘.`;

export default function TeacherToday() {
  const [available, setAvailable] = useState(false), [data, setData] = useState<Today | null>(null), [text, setText] = useState(''), [hint, setHint] = useState(0);
  const today = seoulToday();
  useEffect(() => {
    let alive = true;
    (async () => {
      const status = await call<{available: boolean}>('status').catch(() => ({available: false}));
      if (!alive || !status.available) return;
      setAvailable(true);
      const day = new Date(`${today}T00:00:00Z`).getUTCDay();
      const [calendar, table, due] = await Promise.all([
        call<{events: CalendarEvent[]}>(`calendar?from=${today}&to=${today}`).catch(() => ({events: []})),
        call<Timetable>(`timetable/${weekKeyOf(today)}`).catch(() => null),
        call<{items: WorkItemSummary[]}>(`items?dueBefore=${addDays(today, 7)}`).catch(() => ({items: []})),
      ]);
      if (!alive) return;
      setData({
        slots: (table?.slots ?? []).filter(slot => slot.day === day).sort((a, b) => a.period - b.period),
        events: calendar.events.slice().sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start)),
        items: due.items.filter(item => item.dueAt).sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '')).slice(0, 5),
      });
    })();
    return () => {alive = false;};
  }, [today]);
  useEffect(() => {const timer = window.setInterval(() => setHint(n => (n + 1) % EXAMPLES.length), 4000); return () => window.clearInterval(timer);}, []);
  if (!available) return null;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = text.trim().slice(0, 300);
    if (!value) return;
    // The Berry panel listens for this and shows what it will save before anything is stored.
    window.dispatchEvent(new CustomEvent('berry:ask', {detail: {label: '한 줄 기록', prompt: quickPrompt(value), write: true, needs: []}}));
    setText('');
  };
  return <section className="tdy" aria-labelledby="tdy-title">
    <header><h2 id="tdy-title"><Sparkles size={18}/>오늘 <small>{shortDate(today)}</small></h2>
      <nav aria-label="교무수첩 바로가기"><Link href="/teacher/me/workspace"><CalendarDays size={15}/>일정·시간표</Link><Link href="/teacher/me/notebook"><NotebookPen size={15}/>교무수첩</Link><Link href="/teacher/me/records"><ClipboardList size={15}/>학생별 기록</Link></nav></header>
    <form className="tdy-quick" onSubmit={submit}>
      <input value={text} maxLength={300} aria-label="한 줄로 적기" placeholder={`한 줄로 적어 보세요 · 예: ${EXAMPLES[hint]}`} onChange={e => setText(e.target.value)}/>
      <button className="button primary" disabled={!text.trim()}><Send size={16}/>베리에게 맡기기</button>
    </form>
    <p className="tdy-note">일정·할 일·학생 기록 중 알맞은 곳을 베리가 골라 확인 카드로 보여 줘요. 선생님이 눌러야 저장돼요.</p>
    {data && <div className="tdy-grid">
      <article><h3>시간표</h3>{data.slots.length ? <ol>{data.slots.map(slot => <li key={slot.period}><b>{slot.period}</b>{slot.subject}{slot.room && <small>{slot.room}</small>}</li>)}</ol> : <p>오늘 시간표가 비어 있어요. <Link href="/teacher/me/workspace">시간표 넣기</Link></p>}</article>
      <article><h3>일정</h3>{data.events.length ? <ul>{data.events.slice(0, 5).map(event => <li key={event.id}><b>{event.allDay ? '종일' : seoulTime(event.start)}</b>{event.title}<small>{CALENDAR_KIND_LABELS[event.kind]}</small></li>)}</ul> : <p>오늘 일정이 없어요.</p>}</article>
      <article><h3><ClipboardList size={15}/>곧 마감</h3>{data.items.length ? <ul>{data.items.map(item => <li key={item.id}><b className={item.dueAt! < today ? 'late' : ''}>{shortDate(item.dueAt!.slice(0, 10))}</b>{item.title}</li>)}</ul> : <p>일주일 안에 마감인 일이 없어요.</p>}</article>
    </div>}
  </section>;
}
