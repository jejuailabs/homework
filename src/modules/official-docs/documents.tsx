'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {CalendarCheck, Check, Download, FileText, LoaderCircle, Paperclip, Printer, Sparkles, Trash2, Upload} from 'lucide-react';
import WorkspaceNav from '@/modules/teacher-workspace/nav';
import {AttachButton, uploadAttachment} from '@/modules/attachments/client';
import {attachmentLink} from '@/modules/attachments/policy';
import VoiceButton from '@/modules/attachments/voice-button';
import {hwpxBytes} from './hwpx';
import type {OfficialDoc} from './policy';
import './styles.css';

async function call<T>(path = '', init?: {method?: string; body?: object}): Promise<T> {
  const response = await fetch(`/api/official-docs${path}`, {cache: 'no-store', method: init?.method ?? (init?.body ? 'POST' : 'GET'), ...(init?.body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(init.body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '잠시 후 다시 시도해 주세요.');
  return data as T;
}
const fileBase = (doc: OfficialDoc) => `${doc.title || '공문'} 제출 문서`.replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80);
function save(bytes: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], {type})), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
const dayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number), left = Math.round((Date.UTC(y, m - 1, d) - Date.parse(`${new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul'}).format(new Date())}T00:00:00Z`)) / 86_400_000);
  return left < 0 ? '지남' : left === 0 ? '오늘' : `${left}일 남음`;
};

/** 공문처리: upload an official document, see what it asks and by when, and get the reply document drafted. */
export default function OfficialDocuments() {
  const [docs, setDocs] = useState<OfficialDoc[] | null>(null), [available, setAvailable] = useState(true), [error, setError] = useState('');
  const [stage, setStage] = useState<'' | 'uploading' | 'reading' | 'analysing'>(''), [openId, setOpenId] = useState('');
  const [notes, setNotes] = useState(''), [draftText, setDraftText] = useState(''), [drafting, setDrafting] = useState(false), [saved, setSaved] = useState(true);
  useEffect(() => {call<{available: boolean; docs: OfficialDoc[]}>().then(data => {setDocs(data.docs); setAvailable(data.available); setOpenId(data.docs[0]?.id ?? '');}).catch(e => {setError((e as Error).message); setDocs([]);});}, []);
  const current = docs?.find(doc => doc.id === openId) ?? null;
  useEffect(() => {setDraftText(current?.draft?.text ?? ''); setNotes(current?.draft?.note ?? ''); setSaved(true);}, [current?.id, current?.draft?.createdAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const put = (doc: OfficialDoc) => setDocs(old => [doc, ...(old ?? []).filter(item => item.id !== doc.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

  async function upload(files: FileList) {
    const file = files[0];
    if (!file || stage) return;
    setError('');
    try {
      const attached = await uploadAttachment(file, setStage);
      setStage('analysing');
      const {doc} = await call<{doc: OfficialDoc}>('', {body: {attachmentId: attached.id}});
      put(doc); setOpenId(doc.id);
    } catch (e) {setError((e as Error).message);}
    finally {setStage('');}
  }
  async function makeDraft() {
    if (!current || drafting) return;
    setDrafting(true); setError('');
    try {put((await call<{doc: OfficialDoc}>(`/${current.id}/draft`, {body: {notes}})).doc);}
    catch (e) {setError((e as Error).message);}
    finally {setDrafting(false);}
  }
  async function patch(body: {done?: boolean; draftText?: string}) {
    if (!current) return;
    try {put((await call<{doc: OfficialDoc}>(`/${current.id}`, {body})).doc); setSaved(true);}
    catch (e) {setError((e as Error).message);}
  }
  async function remove() {
    if (!current || !confirm('이 공문 정리를 지울까요? 올린 원본 파일과 달력에 넣은 일정은 그대로 남아요.')) return;
    try {await call(`/${current.id}`, {method: 'DELETE'}); setDocs(old => (old ?? []).filter(doc => doc.id !== current.id)); setOpenId('');}
    catch (e) {setError((e as Error).message);}
  }
  const stageText = stage === 'uploading' ? '파일을 올리는 중이에요.' : stage === 'reading' ? '파일을 글로 읽는 중이에요.' : stage === 'analysing' ? '공문 내용을 분석하고 마감을 달력에 넣는 중이에요.' : '';

  return <main className="odoc">
    <WorkspaceNav current="documents"/>
    <header>
      <p className="page-kicker">OFFICIAL DOCUMENTS</p><h1 className="page-title">공문처리</h1>
      <p className="page-description">공문을 올리면 내용을 분석해 마감을 달력에 넣고 베리에게도 알려요. 제출할 문서는 초안을 만들어 드리니 확인하고 내려받으세요.</p>
    </header>
    <section className="odoc-upload">
      <AttachButton className="button primary" label="공문 파일 올리기" multiple={false} disabled={!!stage || !available} onFiles={upload}>{stage ? <LoaderCircle className="spin" size={16}/> : <Upload size={16}/>}공문 올리기</AttachButton>
      <p>{stageText || (available ? 'PDF, 한글(HWP·HWPX), 사진으로 받은 공문을 올려 주세요. 베리에게 공문을 붙여도 여기로 들어와요.' : '지금은 공문 분석을 쓸 수 없어요.')}</p>
    </section>
    {error && <p className="odoc-error" role="alert">{error}</p>}
    {docs === null && <p className="odoc-state" role="status"><LoaderCircle className="spin" size={18}/>불러오는 중이에요.</p>}
    {docs && !docs.length && !stage && <p className="odoc-state">아직 올린 공문이 없어요.</p>}
    {docs && docs.length > 0 && <div className="odoc-grid">
      <nav className="odoc-list" aria-label="올린 공문">{docs.map(doc => {
        const next = doc.deadlines.map(d => d.date).sort()[0];
        return <button type="button" key={doc.id} aria-pressed={doc.id === openId} className={`${doc.id === openId ? 'is-on' : ''}${doc.done ? ' is-done' : ''}`} onClick={() => setOpenId(doc.id)}>
          <strong>{doc.title}</strong><small>{doc.sender || doc.fileName}{next ? ` · 마감 ${next}` : ''}{doc.done ? ' · 처리 완료' : ''}</small>
        </button>;
      })}</nav>
      {current && <article className="odoc-detail">
        <div className="odoc-head">
          <div><h2>{current.title}</h2><p>{[current.sender, current.docNumber, current.source === 'berry' ? '베리에 붙인 파일' : ''].filter(Boolean).join(' · ')}</p></div>
          <div className="odoc-head-actions">
            <a className="button soft" href={attachmentLink(current.attachmentId)}><Paperclip size={15}/>원본 받기</a>
            <button type="button" className={`button ${current.done ? 'soft' : 'primary'}`} onClick={() => void patch({done: !current.done})}><Check size={15}/>{current.done ? '처리 완료됨' : '처리 완료로 표시'}</button>
            <button type="button" className="icon-button" aria-label="이 공문 정리 지우기" title="지우기" onClick={() => void remove()}><Trash2 size={16}/></button>
          </div>
        </div>
        {current.summary && <section><h3>요약</h3><p className="odoc-text">{current.summary}</p></section>}
        <section><h3><CalendarCheck size={16}/>마감·일정</h3>
          {!current.deadlines.length ? <p className="odoc-muted">공문에 적힌 마감 날짜를 찾지 못했어요. 필요하면 <Link href="/teacher/me/workspace#calendar">일정</Link>에 직접 넣어 주세요.</p> : <ul className="odoc-deadlines">{current.deadlines.map((d, i) => <li key={i}><time>{d.date}{d.time ? ` ${d.time}` : ''}</time><strong>{d.what}</strong><span className="odoc-left">{dayLabel(d.date)}</span><small>{d.eventId ? '달력에 넣었어요 · 베리가 마감 전에 알려요' : '달력에 넣지 못했어요'}</small></li>)}</ul>}
        </section>
        {current.actions.length > 0 && <section><h3>해야 할 일</h3><ol className="odoc-actions">{current.actions.map((a, i) => <li key={i}><strong>{a.title}</strong>{a.aiCanDraft && <span className="odoc-badge"><Sparkles size={12}/>초안 가능</span>}{a.detail && <p>{a.detail}</p>}</li>)}</ol></section>}
        {(current.submission.needed || current.submission.form) && <section><h3>제출</h3><dl className="odoc-submit">
          {current.submission.to && <><dt>보낼 곳</dt><dd>{current.submission.to}</dd></>}
          {current.submission.method && <><dt>방법</dt><dd>{current.submission.method}</dd></>}
          {current.submission.form && <><dt>양식</dt><dd className="odoc-text">{current.submission.form}</dd></>}
        </dl></section>}
        <section className="odoc-draft"><h3><FileText size={16}/>제출 문서</h3>
          <label className="odoc-notes">채워 넣을 내용 <small>(선택) 참가 인원, 담당자, 희망 날짜처럼 공문에 없는 사실을 적어 주면 그대로 넣어요.</small>
            <textarea value={notes} rows={3} maxLength={4000} placeholder="예) 5학년 2반 24명 참가, 담당 교사 김○○, 희망일 12월 10일" onChange={e => setNotes(e.target.value)}/></label>
          <div className="odoc-row"><VoiceButton value={notes} onChange={value => setNotes(value.slice(0, 4000))} disabled={drafting}/>
            <button type="button" className="button primary" disabled={drafting || !available} onClick={() => void makeDraft()}>{drafting ? <LoaderCircle className="spin" size={16}/> : <Sparkles size={16}/>}{current.draft ? '다시 만들기' : '제출 문서 초안 만들기'}</button>
            {drafting && <small role="status">공문 양식에 맞춰 쓰는 중이에요.</small>}</div>
          {current.draft && <>
            <textarea className="odoc-paper" value={draftText} rows={16} aria-label="제출 문서 초안" onChange={e => {setDraftText(e.target.value); setSaved(false);}}/>
            <p className="odoc-muted">AI가 만든 초안이에요. [확인 필요]로 표시된 곳과 숫자·날짜를 확인한 뒤 내려받아 주세요. 제출은 선생님이 직접 해요.</p>
            <div className="odoc-row">
              <button type="button" className="button soft" disabled={saved} onClick={() => void patch({draftText})}><Check size={15}/>{saved ? '저장됨' : '고친 내용 저장'}</button>
              <button type="button" className="button primary" onClick={() => save(hwpxBytes(draftText) as BlobPart, 'application/hwp+zip', `${fileBase(current)}.hwpx`)}><Download size={15}/>한글 파일(HWPX)</button>
              <button type="button" className="button soft" onClick={() => window.print()}><Printer size={15}/>PDF로 저장·인쇄</button>
              <button type="button" className="button soft" onClick={() => save(draftText, 'text/plain;charset=utf-8', `${fileBase(current)}.txt`)}><Download size={15}/>글 파일</button>
            </div>
            <div className="odoc-print" aria-hidden="true">{draftText}</div>
          </>}
        </section>
      </article>}
    </div>}
  </main>;
}
