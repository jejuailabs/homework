'use client';
import {useEffect, useRef, type ReactNode} from 'react';
import {LoaderCircle, X} from 'lucide-react';

export class CardsRequestError extends Error {
  constructor(public status: number, message: string, public code: string) {super(message);}
}
export async function cardsRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {...options, cache: 'no-store', headers: {'Content-Type': 'application/json', ...options?.headers}});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new CardsRequestError(response.status, data.error || '잠시 후 다시 시도해 주세요.', data.code || 'REQUEST_FAILED');
  return data as T;
}
/** Collect lightweight metadata pages; card content remains detail-only. */
export async function cardsMetadataPages<T>(path: string, key: string): Promise<T[]> {
  const rows: T[] = [], url = new URL(path, 'http://localhost'); let cursor = url.searchParams.get('cursor');
  do {
    if (cursor) url.searchParams.set('cursor', cursor); else url.searchParams.delete('cursor');
    const page: Record<string, unknown> = await cardsRequest(`${url.pathname}${url.search}`);
    rows.push(...page[key] as T[]); cursor = typeof page.nextCursor === 'string' ? page.nextCursor : null;
  } while (cursor);
  return rows;
}
export function downloadCardsFile(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name.replace(/[<>:"/\\|?*]/g, '_'); anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CardsLoading({label}: {label: string}) {return <div className="cards-empty" role="status"><LoaderCircle className="spin" size={25}/><p>{label}</p></div>;}
export function CardsDialog({title, closeLabel, onClose, children}: {title: string; closeLabel: string; onClose: () => void; children: ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {const dialog = ref.current; dialog?.showModal(); return () => dialog?.close();}, []);
  return <dialog ref={ref} className="cards-dialog" aria-label={title} onCancel={event => {event.preventDefault(); onClose();}} onClick={event => {if (event.target === ref.current) onClose();}}><div className="cards-dialog-head"><h2>{title}</h2><button type="button" className="icon-button" aria-label={closeLabel} onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
