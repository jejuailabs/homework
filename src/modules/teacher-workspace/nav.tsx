'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {BookUser, CalendarDays, ClipboardList, FolderTree, LayoutDashboard, Lock, NotebookPen, Table} from 'lucide-react';
import './styles.css';

/** Sections inside the workspace page. They switch in place and are addressed by #hash from other pages. */
export const WORKSPACE_TABS = [
  {id: 'home', label: '홈', icon: LayoutDashboard},
  {id: 'calendar', label: '일정', icon: CalendarDays},
  {id: 'timetable', label: '시간표', icon: Table},
  {id: 'lessons', label: '수업 일지', icon: NotebookPen},
  {id: 'folders', label: '업무 폴더', icon: FolderTree},
] as const;
export type WorkspaceTab = typeof WORKSPACE_TABS[number]['id'];
export type WorkspaceSection = WorkspaceTab | 'notebook' | 'records';
const HOME = '/teacher/me/workspace';

let notebookKnown: boolean | undefined;
/**
 * One menu for everything under 업무 공간. The notebook and per-student records are pages of their own
 * (the notebook keeps its password lock), so they are links; the rest switch inside the workspace page.
 */
export default function WorkspaceNav({current, onPick}: {current: WorkspaceSection; onPick?: (tab: WorkspaceTab) => void}) {
  const [notebook, setNotebook] = useState(notebookKnown ?? current === 'notebook');
  useEffect(() => {
    if (notebookKnown !== undefined) return;
    fetch('/api/teacher-notebook/status', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(data => {notebookKnown = !!data?.available; setNotebook(notebookKnown);}).catch(() => {});
  }, []);
  return <nav className="wsp-tabs" aria-label="업무 공간 메뉴">
    {WORKSPACE_TABS.map(({id, label, icon: Icon}) => onPick
      ? <button key={id} type="button" aria-current={current === id ? 'page' : undefined} className={current === id ? 'is-active' : ''} onClick={() => onPick(id)}><Icon size={16}/>{label}</button>
      : <Link key={id} href={id === 'home' ? HOME : `${HOME}#${id}`}><Icon size={16}/>{label}</Link>)}
    {notebook && <Link href="/teacher/me/notebook" aria-current={current === 'notebook' ? 'page' : undefined} className={current === 'notebook' ? 'is-active' : ''}><BookUser size={16}/>교무수첩<Lock size={12} aria-label="비밀번호로 잠김"/></Link>}
    <Link href="/teacher/me/records" aria-current={current === 'records' ? 'page' : undefined} className={current === 'records' ? 'is-active' : ''}><ClipboardList size={16}/>학생별 기록</Link>
  </nav>;
}
