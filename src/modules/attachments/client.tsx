'use client';
import {useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode} from 'react';
import {CircleAlert, FileText, Image as ImageIcon, LoaderCircle, Mic, Paperclip, X} from 'lucide-react';
import {compressImage} from '@/lib/image-compression';
import {ACCEPT, AttachError, attachmentInput, kindOfName, type AttachKind, type AttachmentView, type LessonDraft, type TimetableDraft} from './policy';
import './styles.css';

/** Browser side of teacher attachments: upload straight to Storage, ask the server to read, show chips. */
async function api<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/attachments${path}`, {method: body ? 'POST' : 'GET', cache: 'no-store', ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '처리하지 못했어요.');
  return data as T;
}
export const attachmentsStatus = () => api<{available: boolean}>('/status').then(data => data.available).catch(() => false);
export const removeAttachment = (id: string) => api(`/${id}/delete`, {}).catch(() => {});
export function draftFrom(purpose: 'timetable', input: {attachmentIds?: string[]; text?: string}): Promise<TimetableDraft>;
export function draftFrom(purpose: 'lesson', input: {attachmentIds?: string[]; text?: string}): Promise<LessonDraft>;
export function draftFrom(purpose: 'timetable' | 'lesson', input: {attachmentIds?: string[]; text?: string}) {
  return api<TimetableDraft | LessonDraft>('/draft', {purpose, attachment_ids: input.attachmentIds ?? [], text: input.text ?? ''});
}

/** Upload one file and wait until the server has read it. Photos are shrunk first so reading is quick. */
export async function uploadAttachment(source: File, onStage?: (stage: 'uploading' | 'reading') => void): Promise<AttachmentView> {
  const file = kindOfName(source.name) === 'image' ? (await compressImage(source).catch(() => ({file: source}))).file : source;
  try {attachmentInput({name: file.name, size: file.size});} catch (error) {throw new Error(error instanceof AttachError ? error.message : '이 파일은 올릴 수 없어요.');}
  onStage?.('uploading');
  const made = await api<{id: string; uploadUrl: string; headers: Record<string, string>}>('', {name: file.name, size: file.size});
  const sent = await fetch(made.uploadUrl, {method: 'PUT', headers: made.headers, body: file}).catch(() => null);
  if (!sent?.ok) {void removeAttachment(made.id); throw new Error('파일을 보내지 못했어요. 인터넷 연결을 확인해 주세요.');}
  onStage?.('reading');
  const read = await api<AttachmentView>(`/${made.id}/read`, {});
  if (read.status !== 'read') throw new Error(read.error ?? '파일을 읽지 못했어요.');
  return read;
}

export type Attached = {key: string; name: string; kind: AttachKind | null; state: 'uploading' | 'reading' | 'read' | 'failed'; id?: string; chars?: number; error?: string};
/** A small list of attachments in progress, shared by the Berry panel, the timetable and the lesson log. */
export function useAttachments(max: number) {
  const [items, setItems] = useState<Attached[]>([]), counter = useRef(0), held = useRef(0), [notice, setNotice] = useState('');
  useEffect(() => {held.current = items.length;}, [items]);
  const add = useCallback((list: FileList | File[]) => {
    const patch = (key: string, next: Partial<Attached>) => setItems(old => old.map(item => item.key === key ? {...item, ...next} : item));
    const files = [...list], taken = files.slice(0, Math.max(0, max - held.current));
    setNotice(files.length > taken.length ? `파일은 한 번에 ${max}개까지 붙일 수 있어요.` : '');
    const added = taken.map(file => ({file, item: {key: `a${++counter.current}`, name: file.name, kind: kindOfName(file.name), state: 'uploading'} as Attached}));
    held.current += added.length;
    setItems(old => [...old, ...added.map(entry => entry.item)]);
    for (const {file, item} of added) {
      uploadAttachment(file, stage => patch(item.key, {state: stage}))
        .then(view => patch(item.key, {state: 'read', id: view.id, chars: view.chars, name: view.name}))
        .catch(error => patch(item.key, {state: 'failed', error: (error as Error).message}));
    }
  }, [max]);
  const remove = useCallback((key: string, keepOnServer = false) => setItems(old => {
    const item = old.find(entry => entry.key === key);
    if (item?.id && !keepOnServer) void removeAttachment(item.id);
    return old.filter(entry => entry.key !== key);
  }), []);
  /** Empties the list without deleting: the files now belong to a sent message or a saved draft. */
  const clear = useCallback(() => {setItems([]); setNotice('');}, []);
  const busy = items.some(item => item.state === 'uploading' || item.state === 'reading');
  const ready = items.filter(item => item.state === 'read' && item.id) as (Attached & {id: string})[];
  return {items, add, remove, clear, busy, ready, notice, full: items.length >= max};
}

const icon = (kind: AttachKind | null) => kind === 'image' ? <ImageIcon size={13}/> : kind === 'audio' ? <Mic size={13}/> : <FileText size={13}/>;
export function AttachChips({items, onRemove}: {items: Attached[]; onRemove: (key: string) => void}) {
  if (!items.length) return null;
  return <ul className="att-chips" aria-label="붙인 파일">{items.map(item => <li key={item.key} className={`att-chip is-${item.state}`} title={item.error ?? item.name}>
    {item.state === 'failed' ? <CircleAlert size={13}/> : item.state === 'read' ? icon(item.kind) : <LoaderCircle className="spin" size={13}/>}
    <span>{item.name}</span>
    <small>{item.state === 'uploading' ? '올리는 중' : item.state === 'reading' ? '읽는 중' : item.state === 'failed' ? item.error : ''}</small>
    <button type="button" aria-label={`${item.name} 빼기`} onClick={() => onRemove(item.key)}><X size={12}/></button>
  </li>)}</ul>;
}
/** Paperclip (or any labelled) button that opens the file picker. */
export function AttachButton({onFiles, disabled, className = 'att-button', label = '파일 붙이기', multiple = true, children}: {onFiles: (files: FileList) => void; disabled?: boolean; className?: string; label?: string; multiple?: boolean; children?: ReactNode}) {
  const input = useRef<HTMLInputElement>(null);
  const change = (event: ChangeEvent<HTMLInputElement>) => {const files = event.target.files; if (files?.length) onFiles(files); event.target.value = '';};
  return <>
    <input ref={input} type="file" accept={ACCEPT || undefined} multiple={multiple} hidden onChange={change}/>
    <button type="button" className={className} aria-label={label} title={label} disabled={disabled} onClick={() => input.current?.click()}>{children ?? <Paperclip size={17}/>}</button>
  </>;
}
