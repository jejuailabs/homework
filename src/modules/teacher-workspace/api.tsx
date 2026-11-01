'use client';
import {Check, LoaderCircle} from 'lucide-react';
import {useState} from 'react';

/** Browser helper for /api/workspace. Errors carry the server's Korean message. */
export async function call<T>(path: string, init?: {method?: string; body?: object}): Promise<T> {
  const response = await fetch(`/api/workspace/${path}`, {cache: 'no-store', method: init?.method ?? (init?.body ? 'POST' : 'GET'), ...(init?.body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(init.body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '처리하지 못했어요.');
  return data as T;
}
export const message = (error: unknown) => error instanceof Error ? error.message : '처리하지 못했어요.';
const SEOUL = 9 * 3_600_000;
/** Today and wall-clock times in Asia/Seoul, whatever the device's zone. */
export const seoulToday = () => new Date(Date.now() + SEOUL).toISOString().slice(0, 10);
export const seoulTime = (iso: string) => new Date(Date.parse(iso) + SEOUL).toISOString().slice(11, 16);
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
export const shortDate = (date: string) => {const d = new Date(`${date}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;};

/** Shown on records Berry wrote through chat until the teacher accepts them. */
export function BerryPending({onConfirm}: {onConfirm: () => Promise<unknown>}) {
  const [busy, setBusy] = useState(false);
  return <span className="wsp-berry">🍇 베리 제안
    <button type="button" onClick={async () => {setBusy(true); try {await onConfirm();} finally {setBusy(false);}}} disabled={busy}>{busy ? <LoaderCircle className="spin" size={12}/> : <Check size={12}/>}확정</button>
  </span>;
}
