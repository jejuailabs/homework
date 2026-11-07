'use client';
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, Mail, Send, Trash2} from 'lucide-react';
import {NOTE_TEXT_LIMIT, type CardNote, type CardNoteThread} from '@/lib/cards-notes';
import {useCardsCopy} from '@/lib/cards-copy';
import {fillCopy} from '@/lib/cards-class-copy';
import {useCardsP2Copy} from '@/lib/cards-p2-copy';
import {cardsRequest, CardsDialog, CardsLoading} from './cards-shared';
import '@/styles/cards-p2.css';

const failure = (locale: string, cause: unknown, fallback: string) => locale === 'ko' && cause instanceof Error ? cause.message : fallback;
const when = (value: string, locale: string) => new Intl.DateTimeFormat(locale, {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(new Date(value));

function NoteList({notes, mine, locale, onDelete, deleteLabel}: {notes: CardNote[]; mine: 'teacher' | 'student'; locale: string; onDelete?: (note: CardNote) => void; deleteLabel?: string}) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {end.current?.scrollIntoView({block: 'nearest'});}, [notes.length]);
  return <ol className="cards-notes-list">{notes.map(note => <li key={note.id} className={note.from === mine ? 'is-mine' : ''}><p>{note.text}</p><small>{when(note.createdAt, locale)}{onDelete && <button type="button" className="icon-button" aria-label={deleteLabel} onClick={() => onDelete(note)}><Trash2 size={14}/></button>}</small></li>)}<li ref={end} aria-hidden="true" className="cards-notes-end"/></ol>;
}
function Compose({onSend, placeholder, disabled}: {onSend: (text: string, requestId: string) => Promise<boolean>; placeholder: string; disabled?: boolean}) {
  const p = useCardsP2Copy(), [text, setText] = useState(''), [busy, setBusy] = useState(false), requestId = useRef(crypto.randomUUID());
  async function submit(event: FormEvent) {event.preventDefault(); if (busy || !text.trim()) return; setBusy(true); if (await onSend(text, requestId.current)) {setText(''); requestId.current = crypto.randomUUID();} setBusy(false);}
  return <form className="cards-notes-compose" onSubmit={submit}><label className="cards-sr-only" htmlFor="cards-note-text">{p.noteWrite}</label><textarea id="cards-note-text" rows={2} maxLength={NOTE_TEXT_LIMIT} value={text} placeholder={placeholder} disabled={disabled || busy} onChange={e => setText(e.target.value)}/><button className="button primary" disabled={disabled || busy || !text.trim()}><Send size={16}/>{p.noteSend}</button></form>;
}

/** 쪽지 (teacher): the class switch, every student's thread, and one thread at a time with delete. */
export function TeacherNotes({classId, className, onClose, onChanged}: {classId: string; className: string; onClose: () => void; onChanged: () => void}) {
  const {t, locale} = useCardsCopy(), p = useCardsP2Copy();
  const [data, setData] = useState<{enabled: boolean; threads: CardNoteThread[]} | null>(null), [open, setOpen] = useState<CardNoteThread | null>(null), [notes, setNotes] = useState<CardNote[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const base = `/api/cards/classes/${encodeURIComponent(classId)}/notes`;
  const load = useCallback(() => cardsRequest<{enabled: boolean; threads: CardNoteThread[]}>(base).then(setData).catch(cause => setError(failure(locale, cause, t('error')))), [base, locale]);
  useEffect(() => {void load();}, [load]);
  useEffect(() => {if (!open) {setNotes(null); return;} let alive = true; cardsRequest<{notes: CardNote[]}>(`${base}/${encodeURIComponent(open.studentId)}`).then(result => {if (alive) {setNotes(result.notes); onChanged();}}).catch(cause => {if (alive) setError(failure(locale, cause, t('error')));}); return () => {alive = false;};}, [open?.studentId]);
  async function toggle(enabled: boolean) {if (busy) return; setBusy(true); setError(''); setData(current => current && {...current, enabled}); try {await cardsRequest(base, {method: 'PATCH', body: JSON.stringify({enabled})}); onChanged();} catch (cause) {setData(current => current && {...current, enabled: !enabled}); setError(failure(locale, cause, t('error')));} finally {setBusy(false);}}
  async function send(text: string, requestId: string) {
    if (!open) return false; setError('');
    try {const result = await cardsRequest<{note: CardNote}>(`${base}/${encodeURIComponent(open.studentId)}`, {method: 'POST', body: JSON.stringify({text, requestId})}); setNotes(current => [...(current ?? []), result.note]); return true;} catch (cause) {setError(failure(locale, cause, t('error'))); return false;}
  }
  async function remove(note: CardNote) {
    if (!open || !window.confirm(p.noteDeleteConfirm)) return; setError('');
    try {await cardsRequest(`${base}/${encodeURIComponent(open.studentId)}/${encodeURIComponent(note.id)}`, {method: 'DELETE'}); setNotes(current => (current ?? []).filter(item => item.id !== note.id)); onChanged();} catch (cause) {setError(failure(locale, cause, t('error')));}
  }
  return <CardsDialog title={`${p.notes} · ${className}`} closeLabel={t('close')} onClose={() => {setOpen(null); void load(); onClose();}}>
    {!data ? error ? <p className="cards-error" role="alert">{error}</p> : <CardsLoading label={t('loading')}/> : <div className="cards-notes">
      <label className="cards-check cards-notes-switch"><input type="checkbox" role="switch" checked={data.enabled} disabled={busy} onChange={e => void toggle(e.target.checked)}/><span><strong>{p.notesEnabled}</strong><small>{data.enabled ? p.notesOnHint : p.notesOffHint}</small></span></label>
      <p className="cards-muted">{p.notesPrivacy}</p>
      {error && <p className="cards-error" role="alert">{error}</p>}
      {open ? <section className="cards-notes-thread" aria-label={fillCopy(p.noteThread, {name: open.name})}>
        <div className="cards-notes-head"><button type="button" className="button" onClick={() => {setOpen(null); void load();}}><ArrowLeft size={15}/>{p.noteBack}</button><strong>{open.number}. {open.name}</strong></div>
        {!notes ? <CardsLoading label={t('loading')}/> : notes.length ? <NoteList notes={notes} mine="teacher" locale={locale} onDelete={note => void remove(note)} deleteLabel={p.noteDelete}/> : <p className="cards-muted">{p.noteEmpty}</p>}
        <Compose onSend={send} placeholder={fillCopy(p.noteToStudent, {name: open.name})}/>
      </section> : data.threads.length ? <ul className="cards-notes-threads">{data.threads.map(thread => <li key={thread.studentId}><button type="button" onClick={() => setOpen(thread)}><span className="cards-notes-who">{thread.number}. {thread.name}</span><span className="cards-notes-preview">{thread.preview || p.noteNone}</span>{thread.unread > 0 && <span className="cards-badge accent">{fillCopy(p.noteUnread, {n: thread.unread})}</span>}</button></li>)}</ul> : <p className="cards-muted">{p.noteNoStudents}</p>}
    </div>}
  </CardsDialog>;
}

/** 쪽지 button for the teacher's class tools, with the unread badge from the light summary. */
export function TeacherNotesButton({classId, revision, onOpen}: {classId: string; revision: number; onOpen: () => void}) {
  const p = useCardsP2Copy(), [unread, setUnread] = useState(0);
  useEffect(() => {let alive = true; cardsRequest<{unread: number}>(`/api/cards/classes/${encodeURIComponent(classId)}/notes?summary=1`).then(result => {if (alive) setUnread(result.unread);}).catch(() => {}); return () => {alive = false;};}, [classId, revision]);
  return <button className="button" onClick={onOpen}><Mail size={16}/>{p.notes}{unread > 0 && <span className="cards-badge accent">{unread}</span>}</button>;
}

/** 쪽지 (student): the button on the set list and the student's own thread. Writing waits until the teacher turns notes on. */
export function StudentNotesButton({summary}: {summary?: {enabled: boolean; unread: number; any: boolean}}) {
  const p = useCardsP2Copy(), {t, locale} = useCardsCopy(), [open, setOpen] = useState(false), [data, setData] = useState<{enabled: boolean; notes: CardNote[]} | null>(null), [error, setError] = useState(''), [unread, setUnread] = useState(summary?.unread ?? 0);
  useEffect(() => {setUnread(summary?.unread ?? 0);}, [summary?.unread]);
  useEffect(() => {if (!open) return; let alive = true; setError(''); cardsRequest<{enabled: boolean; notes: CardNote[]}>('/api/cards/notes').then(result => {if (alive) {setData(result); setUnread(0);}}).catch(cause => {if (alive) setError(failure(locale, cause, t('error')));}); return () => {alive = false;};}, [open]);
  if (!summary || (!summary.enabled && !summary.any)) return null;
  async function send(text: string, requestId: string) {
    setError('');
    try {const result = await cardsRequest<{note: CardNote}>('/api/cards/notes', {method: 'POST', body: JSON.stringify({text, requestId})}); setData(current => current && {...current, notes: [...current.notes, result.note]}); return true;} catch (cause) {setError(failure(locale, cause, t('error'))); return false;}
  }
  return <>
    <button type="button" className="button cards-notes-student-button" onClick={() => setOpen(true)}><Mail size={17}/>{p.notesToTeacher}{unread > 0 && <span className="cards-badge accent">{unread}</span>}</button>
    {open && <CardsDialog title={p.notesToTeacher} closeLabel={t('close')} onClose={() => setOpen(false)}>
      {!data ? error ? <p className="cards-error" role="alert">{error}</p> : <CardsLoading label={t('loading')}/> : <div className="cards-notes">
        <p className="cards-muted">{p.notesStudentPrivacy}</p>
        {data.notes.length ? <NoteList notes={data.notes} mine="student" locale={locale}/> : <p className="cards-muted">{p.noteEmpty}</p>}
        {error && <p className="cards-error" role="alert">{error}</p>}
        {data.enabled ? <Compose onSend={send} placeholder={p.noteToTeacher}/> : <p className="cs-release-note">{p.notesStudentOff}</p>}
      </div>}
    </CardsDialog>}
  </>;
}
