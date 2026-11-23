'use client';
import {useCallback, useEffect, useState} from 'react';
import {FileUp, LoaderCircle, Mic, Sparkles, Square, Trash2, X} from 'lucide-react';
import {useHomeworkRecorder} from '@/components/homework-recorder';
import {AttachButton, AttachChips, attachmentsStatus, draftFrom, removeAttachment, useAttachments} from '@/modules/attachments/client';
import {ACCEPT_HINT, MAX_PER_MESSAGE, type LessonDraft} from '@/modules/attachments/policy';
import {BerryPending, call, message, seoulToday, shortDate} from './api';
import {addDays} from './shared';
import {LESSON_PREFILL} from './timetable';
import type {LessonDay} from './types';

type Row = LessonDraft['entries'][number];
const clockOf = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Longer ways into the lesson log: free writing, a file (board photo, worksheet, plan) or a short spoken memo.
 * The material is turned into lines the teacher checks and edits; only "일지에 넣기" saves.
 */
function LessonComposer({date, onSaved, onClose}: {date: string; onSaved: () => Promise<void>; onClose: () => void}) {
  const [text, setText] = useState(''), [rows, setRows] = useState<Row[] | null>(null), [note, setNote] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const files = useAttachments(MAX_PER_MESSAGE), {add} = files;
  const recorder = useHomeworkRecorder(useCallback((file: File) => add([file]), [add]), '수업메모');
  const set = (index: number, patch: Partial<Row>) => setRows(old => old!.map((row, at) => at === index ? {...row, ...patch} : row));
  async function organize() {
    setBusy('draft'); setError('');
    try {
      const draft = await draftFrom('lesson', {attachmentIds: files.ready.map(file => file.id), text});
      if (!draft.entries.length) throw new Error('수업 내용을 찾지 못했어요. 과목과 한 일을 조금 더 적어 주세요.');
      setRows(draft.entries); setNote(draft.note);
    } catch (e) {setError(message(e));} finally {setBusy('');}
  }
  async function save() {
    setBusy('save'); setError('');
    try {
      const day = (await call<{days: LessonDay[]}>(`lessons?from=${date}&to=${date}`)).days[0];
      await call(`lessons/${date}`, {body: {entries: [...(day?.entries ?? []), ...rows!.filter(row => row.subject.trim()).map(row => ({...row, subject: row.subject.trim()}))]}});
      files.ready.forEach(file => void removeAttachment(file.id)); files.clear();
      await onSaved(); onClose();
    } catch (e) {setError(message(e));} finally {setBusy('');}
  }
  const hasMaterial = !!text.trim() || files.ready.length > 0;
  return <div className="wsp-card wsp-lesson-compose">
    <div className="wsp-row"><h3><Sparkles size={16}/>{shortDate(date)} 일지 정리해서 쓰기</h3><button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={18}/></button></div>
    {!rows ? <>
      <p className="wsp-muted">하루 수업을 편하게 적거나, 판서 사진·학습지·지도안 파일을 붙이거나, 짧게 말로 남겨 주세요. 교시·과목·단원·메모 줄로 정리해 드려요.</p>
      <textarea value={text} rows={5} maxLength={8000} placeholder={'예) 1교시 국어는 비유 표현 찾기 했고 모둠 발표까지 마침. 3교시 수학 분수의 나눗셈 2차시, 익힘책은 숙제로…'} aria-label="수업 내용" onChange={e => setText(e.target.value)}/>
      <AttachChips items={files.items} onRemove={files.remove}/>
      {files.notice && <p className="wsp-muted">{files.notice}</p>}
      {recorder.failed && <p className="wsp-error" role="alert">마이크를 쓸 수 없어요. 브라우저의 마이크 권한을 확인해 주세요.</p>}
      {error && <p className="wsp-error" role="alert">{error}</p>}
      <div className="wsp-actions">
        <AttachButton className="button soft" label={`파일 붙이기 (${ACCEPT_HINT})`} disabled={files.full || !!busy} onFiles={files.add}><FileUp size={15}/>파일</AttachButton>
        {recorder.recording
          ? <button type="button" className="button soft is-recording" onClick={recorder.stop}><Square size={14}/>녹음 끝 {clockOf(recorder.seconds)}</button>
          : <button type="button" className="button soft" disabled={files.full || !!busy} onClick={() => void recorder.start()}><Mic size={15}/>녹음</button>}
        <button type="button" className="button primary" disabled={!hasMaterial || files.busy || recorder.recording || !!busy} onClick={() => void organize()}>{busy === 'draft' ? <LoaderCircle className="spin" size={16}/> : <Sparkles size={15}/>}줄로 정리</button>
      </div>
      <small className="wsp-muted">파일과 녹음은 글로 바꾼 뒤 바로 지워요. 녹음은 한 번에 5분까지예요.</small>
    </> : <>
      <p className="wsp-tt-note">정리한 결과예요. 아직 저장되지 않았어요. {note} 고칠 곳을 고치고 <b>일지에 넣기</b>를 눌러 주세요.</p>
      <ul className="wsp-lesson-rows">{rows.map((row, index) => <li key={index}>
        <input type="number" min={1} max={10} value={row.period ?? ''} placeholder="교시" aria-label="교시" onChange={e => set(index, {period: e.target.value ? Number(e.target.value) : undefined})}/>
        <input value={row.subject} maxLength={40} placeholder="과목" aria-label="과목" onChange={e => set(index, {subject: e.target.value})}/>
        <input value={row.unit ?? ''} maxLength={80} placeholder="단원" aria-label="단원" onChange={e => set(index, {unit: e.target.value || undefined})}/>
        <textarea value={row.note} rows={2} maxLength={500} placeholder="메모" aria-label="메모" onChange={e => set(index, {note: e.target.value})}/>
        <button type="button" className="icon-button" onClick={() => setRows(rows.filter((_, at) => at !== index))} aria-label="이 줄 빼기"><Trash2 size={15}/></button>
      </li>)}</ul>
      {error && <p className="wsp-error" role="alert">{error}</p>}
      <div className="wsp-actions"><button type="button" className="button soft" disabled={!!busy} onClick={() => setRows(null)}>다시 쓰기</button><button type="button" className="button primary" disabled={!!busy || !rows.some(row => row.subject.trim())} onClick={() => void save()}>{busy === 'save' && <LoaderCircle className="spin" size={16}/>}일지에 넣기</button></div>
    </>}
  </div>;
}

export function LessonsTab() {
  const today = seoulToday();
  const [date, setDate] = useState(today), [line, setLine] = useState(''), [days, setDays] = useState<LessonDay[] | null>(null), [from, setFrom] = useState(addDays(today, -29)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [composing, setComposing] = useState(false), [canAttach, setCanAttach] = useState(false);
  const load = useCallback(async () => {setError(''); try {setDays((await call<{days: LessonDay[]}>(`lessons?from=${from}&to=${addDays(today, 7)}`)).days);} catch (e) {setError(message(e));}}, [from, today]);
  useEffect(() => {void load();}, [load]);
  useEffect(() => {
    attachmentsStatus().then(setCanAttach);
    // Coming from today's timetable: the period and subject are already typed.
    try {const prefill = sessionStorage.getItem(LESSON_PREFILL); if (prefill) {setLine(prefill); sessionStorage.removeItem(LESSON_PREFILL);}} catch {}
  }, []);
  async function add() {
    setBusy(true); setError('');
    try {await call(`lessons/${date}`, {body: {line}}); setLine(''); await load();} catch (e) {setError(message(e));} finally {setBusy(false);}
  }
  async function removeEntry(day: LessonDay, id: string) {
    try {await call(`lessons/${day.date}`, {body: {entries: day.entries.filter(entry => entry.id !== id)}}); await load();} catch (e) {setError(message(e));}
  }
  return <section className="wsp-panel">
    <div className="wsp-card wsp-lesson-input">
      <input type="date" value={date} max={addDays(today, 7)} onChange={e => setDate(e.target.value)} aria-label="날짜"/>
      <input value={line} maxLength={640} placeholder="3교시 국어 [2단원] 비유 표현 찾기" aria-label="수업 일지 한 줄" autoFocus={!!line} onChange={e => setLine(e.target.value)} onKeyDown={e => {if (e.key === 'Enter' && !e.nativeEvent.isComposing && line.trim()) void add();}}/>
      <button type="button" className="button primary" disabled={busy || !line.trim()} onClick={() => void add()}>{busy ? <LoaderCircle className="spin" size={16}/> : '기록'}</button>
    </div>
    <div className="wsp-row"><p className="wsp-muted">“교시 과목 [단원] 메모” 순서로 적어요. 교시와 단원은 빼도 돼요.</p>{canAttach && !composing && <button type="button" className="button soft" onClick={() => setComposing(true)}><Sparkles size={15}/>길게 쓰기·파일·녹음</button>}</div>
    {composing && <LessonComposer date={date} onSaved={load} onClose={() => setComposing(false)}/>}
    {error && <p className="wsp-error" role="alert">{error}</p>}
    {!days ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p> : !days.length ? <p className="wsp-muted">최근 30일 일지가 없어요.</p> : <ul className="wsp-days">{days.map(day => <li key={day.date} className="wsp-card">
      <div className="wsp-row"><h3>{shortDate(day.date)}</h3>{day.entries.some(entry => entry.pending) && <BerryPending onConfirm={() => call(`lessons/${day.date}/confirm`, {body: {}}).then(load)}/>}</div>
      <ul className="wsp-list">{day.entries.map(entry => <li key={entry.id} className={entry.pending ? 'is-pending' : ''}>
        <div><strong>{entry.period ? `${entry.period}교시 ` : ''}{entry.subject}</strong>{entry.unit && <span className="wsp-unit">{entry.unit}</span>}{entry.note && <small>{entry.note}</small>}</div>
        <button type="button" className="icon-button" onClick={() => void removeEntry(day, entry.id)} aria-label="이 줄 지우기"><Trash2 size={15}/></button>
      </li>)}</ul>
    </li>)}</ul>}
    {days && <button type="button" className="button soft" onClick={() => setFrom(addDays(from, -30))}>이전 30일 더 보기</button>}
  </section>;
}
