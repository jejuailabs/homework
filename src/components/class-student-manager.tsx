"use client";

import {useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent} from 'react';
import {useTranslations} from 'next-intl';
import {ArrowDownToLine, CheckCircle2, KeyRound, LoaderCircle, Plus, Upload, Users} from 'lucide-react';
import {characterFiles, type Character} from '@/lib/characters';
import {parseRoster} from '@/lib/roster';

type Student = {id: string; name: string; number: number; character?: Character; accessCode?: string};
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {...init, cache: 'no-store', headers: {'Content-Type': 'application/json', ...init?.headers}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code || 'request_failed');
  return body as T;
}

export default function ClassStudentManager({classId, onCount, onChanged, onBusyChange}: {
  classId: string; onCount: (count: number) => void; onChanged: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations('product'), d = useTranslations('dashboard'), id = useId();
  const [students, setStudents] = useState<Student[]>([]), [codes, setCodes] = useState<Student[]>([]);
  const [view, setView] = useState<'roster' | 'add' | 'codes'>('roster');
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState(''), [formError, setFormError] = useState(''), [notice, setNotice] = useState('');
  const csvInput = useRef<HTMLInputElement>(null), reading = useRef<AbortController | null>(null), writing = useRef(false);
  const callbacks = useRef({onCount, onChanged, onBusyChange});
  callbacks.current = {onCount, onChanged, onBusyChange};
  const base = `/api/classes/${encodeURIComponent(classId)}/students`;
  const parsed = useMemo(() => parseRoster(roster), [roster]);
  const load = useCallback(async () => {
    reading.current?.abort(); const controller = new AbortController(); reading.current = controller;
    setLoading(true); setFailed(false);
    try {
      const result = await request<{students: Student[]}>(`/api/classes/${encodeURIComponent(classId)}/students`, {signal: controller.signal});
      if (!controller.signal.aborted) {setStudents(result.students); callbacks.current.onCount(result.students.length);}
    } catch {if (!controller.signal.aborted) setFailed(true);}
    finally {if (!controller.signal.aborted) setLoading(false);}
  }, [classId]);
  useEffect(() => {void load(); return () => reading.current?.abort();}, [load]);
  const startWrite = () => {writing.current = true; setBusy(true); callbacks.current.onBusyChange(true); setFormError(''); setNotice('');};
  const endWrite = () => {writing.current = false; setBusy(false); callbacks.current.onBusyChange(false);};
  async function addStudents(event: FormEvent) {
    event.preventDefault(); if (writing.current || loading || failed) return;
    if (!parsed.ok) {setFormError(t(`teacher.rosterError.${parsed.issue.kind}`, {line: parsed.issue.line})); return;}
    if (parsed.students.length > 100) {setFormError(t('teacher.rosterBatchLimit')); return;}
    if (students.length + parsed.students.length > 300) {setFormError(t('teacher.rosterClassLimit')); return;}
    if (parsed.students.some(row => students.some(student => student.number === row.number))) {setFormError(t('teacher.rosterDuplicate')); return;}
    startWrite();
    try {
      const result = await request<{students: Student[]}>(base, {method: 'POST', body: JSON.stringify({students: parsed.students})});
      setStudents(previous => [...previous, ...result.students].sort((a, b) => a.number - b.number));
      callbacks.current.onCount(students.length + result.students.length);
      setCodes(result.students); setRoster(''); setView('codes'); setNotice(t('teacher.rosterAdded')); callbacks.current.onChanged();
    } catch (cause) {
      setFormError(t(cause instanceof Error && cause.message === 'DUPLICATE_NUMBER' ? 'teacher.rosterDuplicate' : 'common.error'));
      if (cause instanceof Error && cause.message === 'DUPLICATE_NUMBER') void load();
    } finally {endWrite();}
  }
  async function resetCode(student: Student) {
    if (writing.current || !window.confirm(t('teacher.resetCodeConfirm', {name: student.name}))) return;
    startWrite();
    try {
      const result = await request<{accessCode: string}>(`${base}/${encodeURIComponent(student.id)}/reset-code`, {method: 'POST', body: '{}'});
      setCodes([{...student, accessCode: result.accessCode}]); setView('codes'); setNotice(d('codeResetSuccess'));
    } catch {setFormError(t('common.error'));}
    finally {endWrite();}
  }
  function downloadCodes() {
    const cell = (value: string | number) => {const text = String(value); return `"${(/^[=+@\-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;};
    const csv = '\uFEFF' + [[t('teacher.number'), t('teacher.name'), t('teacher.code')], ...codes.map(student => [student.number, student.name, student.accessCode || ''])].map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
    const link = document.createElement('a'); link.href = url; link.download = t('teacher.codeFilename'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const tabs = [{value: 'roster', label: d('rosterTab'), Icon: Users}, {value: 'add', label: d('addStudentsTab'), Icon: Plus}, ...(codes.length ? [{value: 'codes', label: d('codesTab'), Icon: KeyRound}] : [])] as const;
  return <section className="class-student-manager" aria-busy={busy}>
    <nav className="csm-tabs" role="tablist" aria-label={d('manageStudents')}>{tabs.map(({value, label, Icon}, index) => <button type="button" role="tab" id={`${id}-${value}`} aria-selected={view === value} aria-controls={`${id}-panel`} tabIndex={view === value ? 0 : -1} key={value} disabled={busy} onClick={() => {setView(value as typeof view); setFormError('');}} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      const value = tabs[next].value as typeof view; setView(value); setFormError(''); document.getElementById(`${id}-${value}`)?.focus();
    }}><Icon size={16}/>{label}</button>)}</nav>
    {notice && <p className="csm-notice" role="status"><CheckCircle2 size={16}/>{notice}</p>}
    {formError && <p className="ws-form-error" role="alert">{formError}</p>}
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${view}`}>
      {loading ? <div className="thd-detail-state" role="status"><LoaderCircle className="ws-spin" size={24}/>{t('common.loading')}</div> : failed ? <div className="ws-alert" role="alert">{t('common.networkError')}<button type="button" onClick={() => void load()}>{t('common.retry')}</button></div> : view === 'roster' ? <>
        <div className="csm-roster-heading"><p>{d('rosterManageHint')}</p><button className="ws-button ws-button-light" type="button" onClick={() => setView('add')} disabled={busy}><Plus size={16}/>{d('addStudentsTab')}</button></div>
        {students.length ? <ul className="csm-roster">{students.map(student => <li key={student.id}><img src={`/characters/${characterFiles[student.character || 'cat'] || characterFiles.cat}.webp`} alt=""/><span><small>{d('studentNumber', {number: student.number})}</small><strong>{student.name}</strong></span><button className="ws-button ws-button-light" type="button" aria-label={`${student.name} · ${t('teacher.resetCode')}`} disabled={busy} onClick={() => void resetCode(student)}><KeyRound size={15}/>{t('teacher.resetCode')}</button></li>)}</ul> : <div className="thd-detail-state"><img src="/characters/hamster-kong.webp" alt=""/><h3>{d('studentsEmptyHint')}</h3></div>}
      </> : view === 'add' ? <form className="csm-add" onSubmit={addStudents}>
        <p className="ws-modal-description">{t('teacher.rosterDescription')}</p><p className="ws-roster-note">{t('teacher.newStudentsNote')}</p>
        <label className="ws-field"><span>{t('teacher.rosterLabel')}</span><textarea rows={7} value={roster} disabled={busy} onChange={event => {setRoster(event.target.value); setFormError('');}} placeholder={t('teacher.rosterPlaceholder')}/></label>
        <div className="ws-roster-tools"><button className="ws-button ws-button-light" type="button" onClick={() => csvInput.current?.click()} disabled={busy}><Upload size={16}/>{t('teacher.chooseCsv')}</button>{parsed.ok && <span className="ws-small">{t('teacher.rosterPreview', {count: parsed.students.length})}</span>}</div>
        <input className="ws-visually-hidden" ref={csvInput} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" tabIndex={-1} onChange={async event => {const file = event.target.files?.[0]; try {if (file) {setRoster(await file.text()); setFormError('');}} catch {setFormError(t('teacher.fileReadError'));} event.target.value = '';}}/>
        <div className="ws-form-actions"><button className="ws-button ws-button-primary" disabled={busy || !roster.trim()}>{busy ? <LoaderCircle className="ws-spin" size={17}/> : <Users size={17}/>} {t(busy ? 'common.saving' : 'teacher.addStudents')}</button></div>
      </form> : <div className="csm-codes"><p className="ws-modal-description">{t('teacher.codeDescription')}</p><div className="ws-codes-table"><table><thead><tr><th>{t('teacher.number')}</th><th>{t('teacher.name')}</th><th>{t('teacher.code')}</th></tr></thead><tbody>{codes.map(student => <tr key={student.id}><td>{student.number}</td><td>{student.name}</td><td><code>{student.accessCode}</code></td></tr>)}</tbody></table></div><div className="ws-form-actions"><button className="ws-button ws-button-light" type="button" onClick={() => setView('roster')}><Users size={16}/>{d('rosterTab')}</button><button className="ws-button ws-button-primary" type="button" onClick={downloadCodes}><ArrowDownToLine size={16}/>{t('teacher.downloadCodes')}</button></div></div>}
    </div>
  </section>;
}
