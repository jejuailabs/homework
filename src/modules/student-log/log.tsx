'use client';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {Check, Copy, Download, LoaderCircle, Paperclip, Pencil, Sparkles, Trash2} from 'lucide-react';
import {AttachButton, AttachChips, attachmentsStatus, useAttachments} from '@/modules/attachments/client';
import {ACCEPT_HINT, attachmentLink} from '@/modules/attachments/policy';
import VoiceButton from '@/modules/attachments/voice-button';
import {MAX_BODY, MAX_FILES, seoulToday} from './policy';
import {LOG_KINDS, LOG_KIND_LABELS, type LogFile, type LogKind, type StudentLogEntry, type StudentLogs, type StudentSummary} from './types';
import './styles.css';

type ClassRow = {id: string; name: string; year: number};
async function call<T>(path: string, init?: {method?: string; body?: object}): Promise<T> {
  const response = await fetch(`/api/student-log/${path}`, {cache: 'no-store', method: init?.method ?? (init?.body ? 'POST' : 'GET'), ...(init?.body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(init.body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '잠시 후 다시 시도해 주세요.');
  return data as T;
}

/** 행동발달 누가기록: pick a student, keep adding what happened, and turn it into 평어 when wanted. */
export default function StudentLog({classes, classId}: {classes: ClassRow[]; classId: string}) {
  const [data, setData] = useState<StudentLogs | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [studentId, setStudentId] = useState(''), [canAttach, setCanAttach] = useState(false);
  const [body, setBody] = useState(''), [date, setDate] = useState(seoulToday()), [kind, setKind] = useState<LogKind>('note');
  const [editing, setEditing] = useState<StudentLogEntry | null>(null), [kept, setKept] = useState<LogFile[]>([]);
  const [saving, setSaving] = useState(false), [summarizing, setSummarizing] = useState(false), [draft, setDraft] = useState(''), [copied, setCopied] = useState(false);
  const files = useAttachments(MAX_FILES);
  useEffect(() => {void attachmentsStatus().then(setCanAttach);}, []);
  const reload = useCallback(async () => {
    if (!classId) return;
    setLoading(true); setError('');
    try {const next = await call<StudentLogs>(classId); setData(next); setStudentId(old => next.students.some(s => s.id === old) ? old : '');}
    catch (e) {setError((e as Error).message); setData(null);}
    finally {setLoading(false);}
  }, [classId]);
  useEffect(() => {void reload();}, [reload]);
  const counts = useMemo(() => {const map = new Map<string, number>(); for (const entry of data?.entries ?? []) map.set(entry.studentId, (map.get(entry.studentId) ?? 0) + 1); return map;}, [data]);
  const student = data?.students.find(s => s.id === studentId), entries = (data?.entries ?? []).filter(entry => entry.studentId === studentId);
  const summary = data?.summaries.find(s => s.studentId === studentId);
  useEffect(() => {setDraft(summary?.text ?? ''); setCopied(false);}, [summary?.text, studentId]);
  const reset = () => {setBody(''); setDate(seoulToday()); setKind('note'); setEditing(null); setKept([]); files.clear();};
  useEffect(() => {reset();}, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const startEdit = (entry: StudentLogEntry) => {files.clear(); setEditing(entry); setBody(entry.body); setDate(entry.date); setKind(entry.kind); setKept(entry.files); window.scrollTo({top: 0, behavior: 'smooth'});};

  async function save() {
    if (!data || !student || saving || files.busy) return;
    setSaving(true); setError('');
    try {
      const attachmentIds = [...kept.map(file => file.id), ...files.ready.map(file => file.id)];
      const {entry} = await call<{entry: StudentLogEntry}>(editing ? `${data.classId}/${editing.id}` : data.classId, {body: {studentId: student.id, date, kind, body, attachmentIds}});
      setData(old => old && {...old, entries: [entry, ...old.entries.filter(item => item.id !== entry.id)].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))});
      reset();
    } catch (e) {setError((e as Error).message);}
    finally {setSaving(false);}
  }
  async function remove(entry: StudentLogEntry) {
    if (!data || !confirm('이 기록을 지울까요? 붙인 파일 원본은 그대로 남아요.')) return;
    try {await call(`${data.classId}/${entry.id}`, {method: 'DELETE'}); setData(old => old && {...old, entries: old.entries.filter(item => item.id !== entry.id)}); if (editing?.id === entry.id) reset();}
    catch (e) {setError((e as Error).message);}
  }
  async function summarize() {
    if (!data || !student || summarizing) return;
    setSummarizing(true); setError('');
    try {
      const {summary: made} = await call<{summary: StudentSummary}>(`${data.classId}/summary`, {body: {studentId: student.id}});
      setData(old => old && {...old, summaries: [made, ...old.summaries.filter(item => item.studentId !== made.studentId)]});
    } catch (e) {setError((e as Error).message);}
    finally {setSummarizing(false);}
  }
  const copy = async () => {try {await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 2000);} catch {setError('복사하지 못했어요. 글을 직접 선택해 복사해 주세요.');}};
  function download() {
    if (!student) return;
    const url = URL.createObjectURL(new Blob([draft], {type: 'text/plain;charset=utf-8'})), link = document.createElement('a');
    link.href = url; link.download = `${student.number ? `${student.number}번 ` : ''}${student.name} 평어.txt`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  if (!classes.length) return <p className="srec-state">먼저 학급을 만들어 주세요.</p>;
  return <div className="slog">
    {error && <p className="srec-error" role="alert">{error}</p>}
    {loading && <p className="srec-state" role="status"><LoaderCircle className="spin" size={18}/>기록을 불러오는 중이에요.</p>}
    {data && !loading && <div className="slog-grid">
      <nav className="slog-students" aria-label="학생 고르기">
        {!data.students.length && <p className="srec-state">이 학급에 학생이 아직 없어요.</p>}
        {data.students.map(s => <button type="button" key={s.id} aria-pressed={s.id === studentId} className={s.id === studentId ? 'is-on' : ''} onClick={() => setStudentId(s.id)}><b>{s.number || '-'}</b><strong>{s.name}</strong>{counts.get(s.id) ? <small>{counts.get(s.id)}</small> : null}</button>)}
      </nav>
      {!student ? <p className="srec-state slog-empty">왼쪽에서 학생을 고르면 기록을 남길 수 있어요. 칭찬할 일, 지도한 일, 눈에 띈 모습을 그때그때 쌓아 두세요.</p> : <section className="slog-panel" aria-label={`${student.name} 기록`}>
        <h2>{student.number ? `${student.number}번 ` : ''}{student.name}</h2>
        <div className="slog-compose">
          <div className="slog-compose-top">
            <label>날짜<input type="date" value={date} max={seoulToday()} onChange={e => setDate(e.target.value)}/></label>
            <div className="slog-kinds" role="group" aria-label="기록 종류">{LOG_KINDS.map(k => <button type="button" key={k} aria-pressed={kind === k} className={`slog-kind ${k}${kind === k ? ' is-on' : ''}`} onClick={() => setKind(k)}>{LOG_KIND_LABELS[k]}</button>)}</div>
          </div>
          <textarea value={body} rows={4} maxLength={MAX_BODY} aria-label="기록 내용" placeholder="있었던 일을 적거나, 마이크를 눌러 말로 남겨 주세요." onChange={e => setBody(e.target.value)}/>
          {kept.length > 0 && <ul className="att-files">{kept.map(file => <li key={file.id}><a href={attachmentLink(file.id)}><Paperclip size={12}/>{file.name}</a><button type="button" className="slog-unpin" aria-label={`${file.name} 빼기`} onClick={() => setKept(old => old.filter(item => item.id !== file.id))}>×</button></li>)}</ul>}
          <AttachChips items={files.items} onRemove={files.remove}/>
          {files.notice && <p className="slog-hint">{files.notice}</p>}
          <div className="slog-compose-actions">
            <VoiceButton value={body} onChange={setBody} disabled={saving}/>
            {canAttach && <AttachButton label={`파일 붙이기 (${ACCEPT_HINT})`} disabled={saving || kept.length + files.items.length >= MAX_FILES} onFiles={files.add}/>}
            <span className="slog-count">{body.length} / {MAX_BODY}</span>
            {editing && <button type="button" className="button soft" onClick={reset}>고치기 취소</button>}
            <button type="button" className="button primary" disabled={saving || files.busy || (!body.trim() && !kept.length && !files.ready.length)} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>}{editing ? '고친 내용 저장' : '기록 남기기'}</button>
          </div>
        </div>

        <div className="slog-summary">
          <div className="slog-summary-head">
            <div><h3>평어</h3><p>이 학생의 누가기록과 숙제·작품에 남긴 말씀을 모아 긍정적인 문장으로 정리해요. 정리한 글은 고쳐 쓸 수 있어요.</p></div>
            <button type="button" className="button primary" disabled={summarizing} onClick={() => void summarize()}>{summarizing ? <LoaderCircle className="spin" size={16}/> : <Sparkles size={16}/>}{summary ? '다시 정리하기' : '평어로 정리하기'}</button>
          </div>
          {summarizing && <p className="slog-hint" role="status">기록을 읽고 정리하는 중이에요. 잠시만 기다려 주세요.</p>}
          {summary && <>
            <textarea value={draft} rows={7} aria-label="평어" onChange={e => setDraft(e.target.value)}/>
            <div className="slog-summary-foot">
              <small>{draft.length}자 · {new Date(summary.createdAt).toLocaleString('ko-KR')} 정리 · 누가기록 {summary.entries}건, 말씀 {summary.comments}건 반영</small>
              <button type="button" className="button soft" onClick={() => void copy()}>{copied ? <Check size={15}/> : <Copy size={15}/>}{copied ? '복사했어요' : '복사'}</button>
              <button type="button" className="button soft" onClick={download}><Download size={15}/>글 파일로 받기</button>
            </div>
            <p className="slog-hint">AI가 정리한 초안이에요. 생활기록부에 옮기기 전에 사실과 맞는지 꼭 읽어 봐 주세요.</p>
          </>}
        </div>

        <h3 className="slog-list-title">쌓인 기록 {entries.length}건</h3>
        {!entries.length && <p className="srec-state">아직 남긴 기록이 없어요.</p>}
        <ol className="slog-list">{entries.map(entry => <li key={entry.id}>
          <div className="slog-entry-head"><time>{entry.date}</time><span className={`slog-kind ${entry.kind} is-on`}>{LOG_KIND_LABELS[entry.kind]}</span>
            <button type="button" aria-label="고치기" title="고치기" onClick={() => startEdit(entry)}><Pencil size={14}/></button>
            <button type="button" aria-label="지우기" title="지우기" onClick={() => void remove(entry)}><Trash2 size={14}/></button></div>
          {entry.body && <p>{entry.body}</p>}
          {entry.files.length > 0 && <ul className="att-files">{entry.files.map(file => <li key={file.id}><a href={attachmentLink(file.id)}><Paperclip size={12}/>{file.name}</a></li>)}</ul>}
        </li>)}</ol>
      </section>}
    </div>}
  </div>;
}
