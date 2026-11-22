'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {BriefcaseBusiness} from 'lucide-react';

let known: boolean | undefined;
/** Top-menu entry to 업무 공간: calendar, to-dos, timetable and the notebook. Hidden while the workspace is switched off. */
export default function WorkspaceNavLink({active, label}: {active: boolean; label: string}) {
  const [available, setAvailable] = useState(known ?? false);
  useEffect(() => {
    if (known !== undefined) return;
    const controller = new AbortController();
    fetch('/api/workspace/status', {cache: 'no-store', signal: controller.signal}).then(r => r.ok ? r.json() : null).then(data => {known = !!data?.available; setAvailable(known);}).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!available) return null;
  return <Link href="/teacher/me/workspace" className={`nav-notebook ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><span className="nav-pictogram" aria-hidden="true"><BriefcaseBusiness size={18}/></span>{label}</Link>;
}
