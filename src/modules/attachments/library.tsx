'use client';
import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {Download, LoaderCircle, Search, Trash2} from 'lucide-react';
import WorkspaceNav from '@/modules/teacher-workspace/nav';
import {removeAttachment} from './client';
import {KIND_LABELS, attachmentLink, type AttachmentView} from './policy';
import './styles.css';

const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

/**
 * 자료함: every file the teacher has handed over, wherever it was attached (Berry chat, notebook, student notes,
 * official documents). The originals are kept until the teacher deletes them here.
 */
export default function FileLibrary() {
  const [files, setFiles] = useState<AttachmentView[] | null>(null), [error, setError] = useState(''), [query, setQuery] = useState(''), [open, setOpen] = useState('');
  useEffect(() => {
    fetch('/api/attachments', {cache: 'no-store'}).then(async r => {const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || '자료를 불러오지 못했어요.'); setFiles(data.files ?? []);}).catch(e => {setError((e as Error).message); setFiles([]);});
  }, []);
  const shown = useMemo(() => {const q = query.trim().toLowerCase(); return (files ?? []).filter(file => !q || file.name.toLowerCase().includes(q) || file.preview.toLowerCase().includes(q));}, [files, query]);
  async function remove(file: AttachmentView) {
    if (!confirm(`「${file.name}」 원본을 지울까요? 이 파일을 붙였던 기록에서도 더는 내려받을 수 없어요.`)) return;
    await removeAttachment(file.id);
    setFiles(old => (old ?? []).filter(item => item.id !== file.id));
  }
  return <main className="att-lib">
    <WorkspaceNav current="files"/>
    <header>
      <p className="page-kicker">FILES</p><h1 className="page-title">자료함</h1>
      <p className="page-description">베리에게 붙인 파일, 교무수첩·학생 기록·공문처리에 올린 파일의 원본이 모두 여기에 있어요. 필요할 때 찾아서 내려받으세요.</p>
    </header>
    <label className="att-lib-search"><Search size={16}/><input type="search" value={query} placeholder="파일 이름이나 내용으로 찾기" aria-label="자료 찾기" onChange={e => setQuery(e.target.value)}/></label>
    {error && <p className="att-lib-error" role="alert">{error}</p>}
    {files === null && <p className="att-lib-state" role="status"><LoaderCircle className="spin" size={18}/>불러오는 중이에요.</p>}
    {files && !shown.length && <p className="att-lib-state">{files.length ? '찾는 자료가 없어요.' : '아직 올린 파일이 없어요. 베리 대화나 교무수첩에서 파일을 붙이면 여기에 모여요.'}</p>}
    <ul className="att-lib-list">{shown.map(file => <li key={file.id}>
      <div className="att-lib-row">
        <span className="att-lib-kind">{KIND_LABELS[file.kind] ?? '파일'}</span>
        <button type="button" className="att-lib-name" aria-expanded={open === file.id} disabled={!file.preview} onClick={() => setOpen(open === file.id ? '' : file.id)}><strong>{file.name}</strong><small>{new Date(file.createdAt).toLocaleDateString('ko-KR')} · {size(file.size)}{file.status === 'failed' ? ' · 내용은 읽지 못함' : ''}</small></button>
        <a className="button soft" href={attachmentLink(file.id)}><Download size={15}/>내려받기</a>
        <button type="button" className="icon-button" aria-label={`${file.name} 지우기`} title="지우기" onClick={() => void remove(file)}><Trash2 size={15}/></button>
      </div>
      {open === file.id && file.preview && <p className="att-lib-preview">{file.preview}{file.chars > file.preview.length ? '…' : ''}</p>}
    </li>)}</ul>
    <p className="att-lib-note">긴 자료를 요약하거나 정리하려면 베리에게 “자료함의 ○○ 파일 정리해 줘”라고 말해 보세요. 공문은 <Link href="/teacher/me/documents">공문처리</Link>에서 마감과 할 일을 볼 수 있어요.</p>
  </main>;
}
