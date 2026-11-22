'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {ArrowRight, CalendarDays, ClipboardList, Sparkles, Table} from 'lucide-react';
import {call, seoulToday, shortDate} from '@/modules/teacher-workspace/api';
import {addDays, weekKeyOf} from '@/modules/teacher-workspace/shared';
import type {CalendarEvent, Timetable, WorkItemSummary} from '@/modules/teacher-workspace/types';
import './styles.css';

/**
 * "오늘" on the teacher home: one line of counts (today's lessons, events, near deadlines) that opens the workspace,
 * where the calendar, to-dos and the rest live. This module stores nothing itself.
 */
type Today = {slots: number; events: CalendarEvent[]; due: number};

export default function TeacherToday() {
  const [available, setAvailable] = useState(false), [data, setData] = useState<Today | null>(null);
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
        slots: (table?.slots ?? []).filter(slot => slot.day === day).length,
        events: calendar.events.slice().sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start)),
        due: due.items.filter(item => item.dueAt).length,
      });
    })();
    return () => {alive = false;};
  }, [today]);
  if (!available) return null;
  return <Link href="/teacher/me/workspace" className="tdy" aria-label="오늘 요약 · 업무 공간 열기">
    <strong><Sparkles size={17}/>오늘 <small>{shortDate(today)}</small></strong>
    {data && <span className="tdy-facts">
      <span><Table size={14}/>수업 <b>{data.slots}</b>교시</span>
      <span><CalendarDays size={14}/>일정 <b>{data.events.length}</b>건{data.events[0] && <i>{data.events[0].title}{data.events.length > 1 ? ' 외' : ''}</i>}</span>
      <span><ClipboardList size={14}/>곧 마감 <b>{data.due}</b>건</span>
    </span>}
    <em>업무 공간<ArrowRight size={15}/></em>
  </Link>;
}
