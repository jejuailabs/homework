'use client';
import {useEffect, useState} from 'react';

let known: boolean | undefined;
/**
 * "To 베리": opens the floating Berry chat with a question for this screen instead of a second input box.
 * It sends nothing by itself; the panel shows `topic` as Berry's first line and waits for the teacher.
 */
export default function ToBerry({topic}: {topic: string}) {
  const [available, setAvailable] = useState(known ?? false);
  useEffect(() => {
    if (known !== undefined) return;
    fetch('/api/berry/status', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(data => {known = !!data?.available; setAvailable(known);}).catch(() => {});
  }, []);
  if (!available) return null;
  return <button type="button" className="bp-to" onClick={() => window.dispatchEvent(new CustomEvent('berry:open', {detail: {topic}}))}>
    <img src="/berry/raspberry-64.webp" alt="" width="22" height="22"/>To 베리
  </button>;
}
