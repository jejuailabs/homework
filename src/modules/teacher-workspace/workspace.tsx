'use client';
import {useEffect, useState} from 'react';
import {BriefcaseBusiness, Download, LoaderCircle, X} from 'lucide-react';
import ToBerry from '@/modules/berry-panel/to-berry';
import {zipParts} from '@/lib/zip-store';
import {call, message} from './api';
import {CalendarTab} from './calendar';
import {FoldersTab} from './folders';
import {HomeTab} from './home';
import WorkspaceNav, {WORKSPACE_TABS, type WorkspaceTab} from './nav';
import {LessonsTab} from './lessons';
import {TimetableTab} from './timetable';
import './styles.css';

type Tab = WorkspaceTab;
function ExportMenu({onClose}: {onClose: () => void}) {
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [sensitive, setSensitive] = useState(false);
  const suffix = sensitive ? '&includeSensitive=1' : '';
  async function zip() {
    setBusy('zip'); setError('');
    try {
      const manifest = await call<{zipName: string; tables: Record<string, string>; attachments: {name: string; url: string; size: number}[]}>(`export?format=zip${suffix}`);
      const encoder = new TextEncoder(), entries = Object.entries(manifest.tables).map(([name, text]) => ({name, data: encoder.encode(text)}));
      for (const file of manifest.attachments) {
        const response = await fetch(file.url);
        if (!response.ok) throw new Error('파일을 받지 못했어요. 다시 시도해 주세요.');
        entries.push({name: file.name, data: new Uint8Array(await response.arrayBuffer())});
      }
      const href = URL.createObjectURL(new Blob(zipParts(entries) as BlobPart[], {type: 'application/zip'})), link = document.createElement('a');
      link.href = href; link.download = manifest.zipName; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (e) {setError(message(e));} finally {setBusy('');}
  }
  return <div className="wsp-dialog" role="dialog" aria-modal="true" aria-label="내보내기"><div className="wsp-dialog-card">
    <div className="wsp-row"><h3>내보내기</h3><button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={18}/></button></div>
    <p className="wsp-muted">내보낸 기록은 감사 기록에 남아요.</p>
    <label className="wsp-check"><input type="checkbox" checked={sensitive} onChange={e => setSensitive(e.target.checked)}/>민감 항목 포함</label>
    <div className="wsp-export">
      <a className="button soft" href={`/api/workspace/export?format=csv&type=calendar${suffix}`}><Download size={15}/>일정 CSV</a>
      <a className="button soft" href={`/api/workspace/export?format=csv&type=lessons${suffix}`}><Download size={15}/>수업 일지 CSV</a>
      <a className="button soft" href={`/api/workspace/export?format=csv&type=items${suffix}`}><Download size={15}/>업무 항목 CSV</a>
      <button type="button" className="button primary" disabled={!!busy} onClick={() => void zip()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Download size={15}/>}전체 ZIP (파일 포함)</button>
    </div>
    {error && <p className="wsp-error" role="alert">{error}</p>}
  </div></div>;
}

export default function TeacherWorkspace() {
  const [tab, setTab] = useState<Tab>('home'), [available, setAvailable] = useState<boolean | null>(null), [exporting, setExporting] = useState(false);
  useEffect(() => {call<{available: boolean}>('status').then(data => setAvailable(data.available)).catch(() => setAvailable(false));}, []);
  useEffect(() => {
    const read = () => {const hash = window.location.hash.slice(1); setTab(WORKSPACE_TABS.some(t => t.id === hash) ? hash as Tab : 'home');};
    read(); window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const choose = (id: Tab) => {setTab(id); history.replaceState(null, '', id === 'home' ? window.location.pathname : `#${id}`); window.scrollTo({top: 0});};
  return <section className="mp-shell wsp-shell">
    <div className="wsp-heading"><div><h2><BriefcaseBusiness size={24}/> 업무 공간</h2><p>일정·할 일·시간표·수업 일지·업무 폴더와 교무수첩을 한곳에서 봐요. 베리가 넣은 항목은 선생님이 확정해야 반영돼요.</p></div>
      <div className="wsp-actions"><ToBerry topic="업무에 어떤 걸 도와드릴까요? 일정·할 일·수업 일지·학생 기록을 말로 시켜 주세요."/>{available && <button type="button" className="button soft" onClick={() => setExporting(true)}><Download size={15}/>내보내기</button>}</div></div>
    {available === null ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 확인 중…</p> : !available ? <div className="wsp-card"><h3>지금은 쓸 수 없어요</h3><p className="wsp-muted">업무 공간이 잠시 멈춰 있어요. 저장한 기록은 그대로 있어요.</p></div> : <>
      <WorkspaceNav current={tab} onPick={choose}/>
      {tab === 'home' && <HomeTab onPick={choose}/>}
      {tab === 'calendar' && <CalendarTab/>}
      {tab === 'timetable' && <TimetableTab onLessons={() => choose('lessons')}/>}
      {tab === 'lessons' && <LessonsTab/>}
      {tab === 'folders' && <FoldersTab/>}
    </>}
    {exporting && <ExportMenu onClose={() => setExporting(false)}/>}
  </section>;
}
