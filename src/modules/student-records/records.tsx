'use client';
import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {Check, Download, LoaderCircle, NotebookPen} from 'lucide-react';
import WorkspaceNav from '@/modules/teacher-workspace/nav';
import {recordsCsv} from './policy';
import {RECORD_KIND_LABELS, type RecordKind, type StudentRecords} from './types';
import './styles.css';

type ClassRow = {id: string; name: string; year: number};
const KINDS = Object.keys(RECORD_KIND_LABELS) as RecordKind[];
const API = '/api/student-records';
async function load<T>(url: string): Promise<T> {
  const response = await fetch(url, {cache: 'no-store'}), data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '잠시 후 다시 시도해 주세요.');
  return data;
}
// Which students were already copied into NEIS. Kept in this browser only: it is a personal checklist, not class data.
const movedKey = (classId: string) => `records:moved:${classId}`;
function readMoved(classId: string): string[] {
  try {const value = JSON.parse(localStorage.getItem(movedKey(classId)) || '[]'); return Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];}
  catch {return [];}
}

export default function StudentRecordsView() {
  const [classes, setClasses] = useState<ClassRow[]>([]), [classId, setClassId] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [data, setData] = useState<StudentRecords | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [kinds, setKinds] = useState<RecordKind[]>(KINDS), [open, setOpen] = useState<string[]>([]), [moved, setMoved] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    load<{classes: ClassRow[]}>(API).then(r => {if (alive) {setClasses(r.classes); setClassId(r.classes[0]?.id || ''); if (!r.classes.length) setLoading(false);}}).catch(e => {if (alive) {setError(e.message); setLoading(false);}});
    return () => {alive = false;};
  }, []);
  useEffect(() => {
    if (!classId) return;
    let alive = true;
    setLoading(true); setError(''); setMoved(readMoved(classId));
    const query = new URLSearchParams({...(from ? {from} : {}), ...(to ? {to} : {})});
    load<StudentRecords>(`${API}/${classId}?${query}`).then(r => {if (alive) setData(r);}).catch(e => {if (alive) {setError(e.message); setData(null);}}).finally(() => {if (alive) setLoading(false);});
    return () => {alive = false;};
  }, [classId, from, to]);
  const rows = useMemo(() => (data?.students ?? []).map(s => ({...s, shown: s.records.filter(r => kinds.includes(r.kind))})), [data, kinds]);
  const total = rows.reduce((n, s) => n + s.shown.length, 0);
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  const mark = (studentId: string) => setMoved(old => {
    const next = toggle(old, studentId);
    try {localStorage.setItem(movedKey(classId), JSON.stringify(next));} catch {}
    return next;
  });
  function download() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([recordsCsv(data.students, kinds, RECORD_KIND_LABELS)], {type: 'text/csv;charset=utf-8'})), link = document.createElement('a');
    link.href = url; link.download = `${data.className}-학생별기록-${data.from}~${data.to}.csv`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return <main className="srec">
    <WorkspaceNav current="records"/>
    <header>
      <p className="page-kicker">STUDENT RECORDS</p><h1 className="page-title">학생별 모아 보기</h1>
      <p className="page-description">숙제 검사 때 남긴 말씀, 작품 한마디, 보말을 주며 적은 까닭을 학생별로 모았어요. 학기말에 생활기록부를 쓸 때 꺼내 보세요.</p></header>
    <section className="srec-bar">
      {classes.length > 1 && <label>학급<select value={classId} onChange={e => setClassId(e.target.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.year ? `${c.year} ` : ''}{c.name}</option>)}</select></label>}
      <label>시작일<input type="date" value={from || data?.from || ''} onChange={e => setFrom(e.target.value)}/></label>
      <label>종료일<input type="date" value={to || data?.to || ''} onChange={e => setTo(e.target.value)}/></label>
      <div className="srec-kinds" role="group" aria-label="보여 줄 기록">{KINDS.map(k => <label key={k}><input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds(old => toggle(old, k))}/>{RECORD_KIND_LABELS[k]}</label>)}</div>
      <button type="button" className="button primary" disabled={!total} onClick={download}><Download size={16}/>엑셀용 파일 받기</button>
    </section>
    {error && <p className="srec-error" role="alert">{error}</p>}
    {loading && <p className="srec-state" role="status"><LoaderCircle className="spin" size={18}/>기록을 모으는 중이에요.</p>}
    {!loading && !classes.length && <p className="srec-state">먼저 학급을 만들어 주세요.</p>}
    {data && !loading && <>
      <p className="srec-summary">{data.className} · {data.from} ~ {data.to} · 기록 {total}건{data.truncated && ' · 제출물이 아주 많아 일부만 모았어요'}</p>
      {!total && <p className="srec-state">이 기간에 남긴 기록이 아직 없어요. 숙제를 검사하며 말씀을 남기거나 보말을 줄 때 까닭을 적으면 여기에 쌓여요.</p>}
      <ul className="srec-list">{rows.map(s => {
        const shown = open.includes(s.id), done = moved.includes(s.id);
        return <li key={s.id} className={done ? 'done' : ''}>
          <div className="srec-row"><button type="button" aria-expanded={shown} disabled={!s.shown.length} onClick={() => setOpen(old => toggle(old, s.id))}><b>{s.number || '-'}</b><strong>{s.name}</strong><small>{s.shown.length ? `기록 ${s.shown.length}건` : '기록 없음'}</small></button>
            <label title="생활기록부에 옮긴 학생을 표시해 두는 용도예요. 이 브라우저에만 저장돼요."><input type="checkbox" checked={done} onChange={() => mark(s.id)}/>{done ? <><Check size={13}/>옮겼어요</> : '나이스에 옮겼어요'}</label></div>
          {shown && <ol>{s.shown.map((r, i) => <li key={i}><time>{r.date}</time><span className={`srec-kind ${r.kind}`}>{RECORD_KIND_LABELS[r.kind]}</span><div><small>{r.title}</small><p>{r.text}</p></div></li>)}</ol>}
        </li>;
      })}</ul>
      <p className="srec-note"><NotebookPen size={14}/>직접 적은 관찰 기록은 <Link href="/teacher/me/notebook">교무수첩</Link>의 종합 리포트에서 따로 받을 수 있어요. 민감한 기록은 여기에 섞지 않아요.</p>
    </>}
  </main>;
}
