'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {NotebookPen} from 'lucide-react';

let known: boolean | undefined;
/** Top-menu entry to 교무수첩 (the my page hub). Shown only to teachers the notebook is open for. */
export default function NotebookNavLink({active}: {active: boolean}) {
  const [available, setAvailable] = useState(known ?? false);
  useEffect(() => {
    if (known !== undefined) return;
    const controller = new AbortController();
    fetch('/api/teacher-notebook/status', {cache: 'no-store', signal: controller.signal}).then(r => r.ok ? r.json() : null).then(data => {known = !!data?.available; setAvailable(known);}).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!available) return null;
  return <Link href="/teacher/me" className={`nav-notebook ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><span className="nav-pictogram" aria-hidden="true"><NotebookPen size={18}/></span>교무수첩</Link>;
}
