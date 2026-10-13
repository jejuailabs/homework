'use client';

import {useEffect, useId, useRef, type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {Columns3, Grip, LayoutGrid, List, MapPin, Rows3, Table2, Workflow, X, LoaderCircle, StretchHorizontal, FileText, Download} from 'lucide-react';
import {characterFiles, type Character} from '@/lib/characters';
import {boardLayouts, type BoardAttachment, type BoardLayout} from '@/lib/participation-types';

export class BoardRequestError extends Error {constructor(readonly code: string, readonly status: number) {super(code);}}
export async function boardRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {...init, cache: 'no-store', headers: {'Content-Type': 'application/json', ...init?.headers}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new BoardRequestError(body.code || 'REQUEST_FAILED', response.status);
  return body as T;
}

export const layoutIcons = {wall: Grip, columns: Columns3, grid: LayoutGrid, table: Table2, freeform: Workflow, rows: Rows3, timeline: StretchHorizontal, stream: List, map: MapPin};
export function Friend({character = 'cat', className = ''}: {character?: Character; className?: string}) {
  return <img className={`pb-friend ${className}`} src={`/characters/${characterFiles[character] || characterFiles.cat}.webp`} alt="" draggable={false}/>;
}
export function Loading({small = false}: {small?: boolean}) {
  const t = useTranslations('participation');
  return <div className={`pb-loading ${small ? 'is-small' : ''}`} role="status"><LoaderCircle className="spin" size={small ? 18 : 26}/><span>{t('loading')}</span></div>;
}
export function BoardDialog({title, children, onClose, busy = false, drawer = false, wide = false, className = ''}: {title: string; children: ReactNode; onClose: () => void; busy?: boolean; drawer?: boolean; wide?: boolean; className?: string}) {
  const t = useTranslations('participation'), id = useId(), ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = ref.current; node?.showModal();
    return () => {node?.close(); if (previous?.isConnected) previous.focus({preventScroll: true});};
  }, []);
  return <dialog ref={ref} className={`pb-dialog ${drawer ? 'pb-drawer' : ''} ${wide ? 'pb-dialog-wide' : ''} ${className}`} aria-labelledby={id} onCancel={event => {event.preventDefault(); if (!busy) onClose();}}>
    <header className="pb-dialog-head"><h2 id={id}>{title}</h2><button type="button" className="pb-icon" aria-label={t('close')} onClick={onClose} disabled={busy}><X size={21}/></button></header>{children}
  </dialog>;
}
export function LayoutPicker({value, onChange}: {value: BoardLayout; onChange: (layout: BoardLayout) => void}) {
  const t = useTranslations('participation');
  return <div className="pb-layout-picker">{boardLayouts.map(layout => {const Icon = layoutIcons[layout]; return <button key={layout} type="button" className={value === layout ? 'selected' : ''} aria-pressed={value === layout} onClick={() => onChange(layout)} data-testid={`pb-layout-${layout}`}><Icon size={23}/><strong>{t(`layout_${layout}`)}</strong><small>{t(`layoutHint_${layout}`)}</small></button>;})}</div>;
}
export function AttachmentView({attachment, compact = false}: {attachment: BoardAttachment; compact?: boolean}) {
  const t = useTranslations('participation');
  if (attachment.kind === 'image') return <a className="pb-image-link" href={attachment.url} target="_blank" rel="noopener noreferrer" aria-label={`${t('openOriginal')}: ${attachment.name}`}><img src={attachment.thumbnailUrl || attachment.url} alt={attachment.name} loading="lazy" decoding="async"/></a>;
  if (attachment.kind === 'video') return <video className="pb-video" src={attachment.url} controls preload="none" aria-label={attachment.name}/>;
  if (attachment.kind === 'audio') return <div className="pb-audio"><span>{attachment.name}</span><audio src={attachment.url} controls preload="none" aria-label={attachment.name}/></div>;
  return <a className={`pb-file ${compact ? 'is-compact' : ''}`} href={attachment.url} target="_blank" rel="noopener noreferrer"><FileText size={23}/><span>{attachment.name}<small>{(attachment.size / 1024 / 1024).toFixed(attachment.size < 1048576 ? 2 : 1)} MB</small></span><Download size={17}/></a>;
}

export function readDraft<T>(key: string): T | null {try {const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null;} catch {return null;}}
export function saveDraft(key: string, value: unknown) {try {localStorage.setItem(key, JSON.stringify(value));} catch {}}
export function removeDraft(key: string) {try {localStorage.removeItem(key);} catch {}}
export function requestId() {return crypto.randomUUID();}
export function safeLink(value: string) {try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null;} catch {return null;}}
