'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {UserRound} from 'lucide-react';

let known: boolean | undefined;
/** Header shortcut to the teacher's my page. Hidden until the notebook pilot is open for this teacher. */
export default function MyPageLink({active}: {active: boolean}) {
  const [available, setAvailable] = useState(known ?? false);
  useEffect(() => {
    if (known !== undefined) return;
    const controller = new AbortController();
    fetch('/api/teacher-notebook/status', {cache: 'no-store', signal: controller.signal}).then(r => r.ok ? r.json() : null).then(data => {known = !!data?.available; setAvailable(known);}).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!available) return null;
  return <Link href="/teacher/me" className="icon-button" aria-label="마이페이지" title="마이페이지" aria-current={active ? 'page' : undefined}><UserRound size={19}/></Link>;
}
