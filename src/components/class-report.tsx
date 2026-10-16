'use client';

import {cloneElement, useEffect, useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode} from 'react';
import {BookOpen, CalendarDays, Check, ChevronRight, Download, FileText, FolderOpen, LoaderCircle, LockKeyhole, Plus, Printer, RefreshCw, Save, Sparkles, Users} from 'lucide-react';
import type {ClassReportSnapshot, LessonRecord, ReportSummary} from '@/lib/lesson-report-types';
import {toolCatalog} from '@/lib/tool-catalog';
import {classReportCsv, classReportHtml, classReportJson, reportScope, reportTimestamp} from '@/lib/class-report-export';
import '@/styles/class-report.css';

type Resource = LessonRecord['links'][number];
type Operation = '' | 'capture' | 'version' | 'narrative' | 'lesson';
type LessonDraft = {title: string; date: string; subject: string; unit: string; objective: string; notes: string; toolIds: string[]; resourceIds: string[]};
const day = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const newLesson = (): LessonDraft => ({title: '', date: day(), subject: '', unit: '', objective: '', notes: '', toolIds: [], resourceIds: []});
const resourceKey = (resource: Resource) => `${resource.kind}:${resource.id}`;

async function request<T>(path: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(path, {signal, cache: 'no-store', ...(body === undefined ? {} : {method: 'POST', body: JSON.stringify(body)}), headers: {'Content-Type': 'application/json'}});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'REQUEST_FAILED');
  return data as T;
}
function download(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const link = document.createElement('a');
  link.href = url; link.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_'); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Field({label, children, hint}: {label: string; children: ReactElement<{id?: string; 'aria-describedby'?: string}>; hint?: string}) {
  const id = useId();
  return <div className="report-field"><label htmlFor={id}>{label}</label>{cloneElement(children, {id, 'aria-describedby': hint ? `${id}-hint` : undefined})}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}
function DataTable({headers, rows, empty}: {headers: string[]; rows: ReactNode[][]; empty: string}) {
  return <div className="report-table-scroll"><table><thead><tr>{headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th key={column} scope="row">{cell}</th> : <td key={column}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="report-table-empty">{empty}</td></tr>}</tbody></table></div>;
}

/** Changing class remounts the workspace, cancels requests and discards its private drafts. */
export default function ClassReport({locale = 'ko', classId}: {locale?: string; classId: string}) {
  return <ReportWorkspace key={classId || 'no-class'} en={locale === 'en'} classId={classId}/>;
}

function ReportWorkspace({en, classId}: {en: boolean; classId: string}) {
  const w = (ko: string, english: string) => en ? english : ko;
  const [tab, setTab] = useState<'reports' | 'lessons'>('reports');
  const [reports, setReports] = useState<ReportSummary[]>([]), [lessons, setLessons] = useState<LessonRecord[]>([]), [resources, setResources] = useState<Resource[]>([]);
  const [report, setReport] = useState<ClassReportSnapshot | null>(null), [loading, setLoading] = useState(!!classId), [opening, setOpening] = useState(false), [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState<Operation>(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [title, setTitle] = useState(''), [from, setFrom] = useState(() => `${day().slice(0, 7)}-01`), [to, setTo] = useState(day), [notes, setNotes] = useState('');
  const [editNotes, setEditNotes] = useState(''), [narrative, setNarrative] = useState(''), [appendix, setAppendix] = useState(false);
  const [lesson, setLesson] = useState<LessonDraft>(newLesson);
  const alive = useRef(true), lock = useRef(false), requests = useRef(new Set<AbortController>());
  const keys = useRef(new Map<string, {signature: string; key: string}>());
  const dirty = !!report && (editNotes !== report.teacherNotes || narrative !== report.narrative);
  const blocked = !!busy || opening;
  const empty = w('이 기간에 만든 활동이 없어요.', 'No activities created in this period.');

  useEffect(() => {
    alive.current = true;
    const pending = requests.current;
    return () => {alive.current = false; for (const controller of pending) controller.abort(); pending.clear();};
  }, []);
  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController(); requests.current.add(controller);
    setLoading(true); setError('');
    void Promise.allSettled([
      request<{reports: ReportSummary[]}>(`/api/lesson-reports?classId=${encodeURIComponent(classId)}`, controller.signal),
      request<{lessons: LessonRecord[]; resources?: Resource[]}>(`/api/lessons?classId=${encodeURIComponent(classId)}`, controller.signal),
    ]).then(([saved, records]) => {
      if (controller.signal.aborted) return;
      const errors: string[] = [];
      if (saved.status === 'fulfilled') setReports(saved.value.reports); else errors.push(saved.reason instanceof Error ? saved.reason.message : 'REQUEST_FAILED');
      if (records.status === 'fulfilled') {setLessons(records.value.lessons.filter(item => item.classId === classId)); setResources(records.value.resources || []);} else errors.push(records.reason instanceof Error ? records.reason.message : 'REQUEST_FAILED');
      if (errors.length) setError(en ? 'Could not load saved records. Please try again.' : errors.join(' · '));
      setLoading(false);
    }).finally(() => requests.current.delete(controller));
    return () => controller.abort();
  }, [classId, revision, en]);

  function retryKey(operation: string, payload: unknown) {
    const signature = JSON.stringify(payload), current = keys.current.get(operation);
    if (current?.signature === signature) return current.key;
    const key = crypto.randomUUID(); keys.current.set(operation, {signature, key}); return key;
  }
  function chooseReport(value: ClassReportSnapshot) {
    if (value.classId !== classId) throw Error(w('다른 학급의 보고서는 열 수 없어요.', 'This report belongs to a different class.'));
    setReport(value); setEditNotes(value.teacherNotes); setNarrative(value.narrative); setAppendix(false);
  }
  async function act(operation: Exclude<Operation, ''>, work: (signal: AbortSignal) => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(operation); setError(''); setNotice('');
    const controller = new AbortController(); requests.current.add(controller);
    try {await work(controller.signal);} catch (cause) {
      if (!controller.signal.aborted && alive.current) setError(en ? 'The request could not be completed. Your input is kept; try again.' : cause instanceof Error && cause.message !== 'REQUEST_FAILED' ? cause.message : '처리하지 못했어요. 입력한 내용은 유지되니 다시 시도해 주세요.');
    } finally {
      requests.current.delete(controller); lock.current = false;
      if (alive.current) setBusy('');
    }
  }
  async function openReport(summary: ReportSummary) {
    if (lock.current) return;
    lock.current = true; setOpening(true); setError(''); setNotice('');
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const data = await request<{report: ClassReportSnapshot}>(`/api/lesson-reports/${encodeURIComponent(summary.id)}`, controller.signal);
      if (alive.current && !controller.signal.aborted) chooseReport(data.report);
    } catch (cause) {if (!controller.signal.aborted && alive.current) setError(en ? 'Could not open this report.' : cause instanceof Error ? cause.message : '보고서를 열지 못했어요.');}
    finally {requests.current.delete(controller); lock.current = false; if (alive.current) setOpening(false);}
  }
  function rememberReport(value: ClassReportSnapshot) {
    chooseReport(value); setReports(previous => [value, ...previous.filter(item => item.id !== value.id)]);
  }
  function capture(event: FormEvent) {
    event.preventDefault();
    if (from > to) {setError(w('종료일을 시작일 이후로 선택해 주세요.', 'Choose an end date on or after the start date.')); return;}
    const payload = {classId, title: title.trim(), from, to, teacherNotes: notes};
    void act('capture', async signal => {
      const data = await request<{report: ClassReportSnapshot}>('/api/lesson-reports', signal, {...payload, requestId: retryKey('capture', payload)});
      if (!alive.current || signal.aborted) return;
      rememberReport(data.report); keys.current.delete('capture');
      setNotice(w('지금의 데이터를 보고서로 저장했어요.', 'The current data has been saved as a report.'));
    });
  }
  function saveVersion() {
    if (!report || !dirty) return;
    const payload = {teacherNotes: editNotes, narrative}, sourceId = report.id;
    void act('version', async signal => {
      const data = await request<{report: ClassReportSnapshot}>(`/api/lesson-reports/${encodeURIComponent(sourceId)}/version`, signal, {...payload, requestId: retryKey('version', {id: sourceId, ...payload})});
      if (!alive.current || signal.aborted) return;
      rememberReport(data.report); keys.current.delete('version');
      setNotice(w('원본을 유지하고 새 버전을 저장했어요.', 'A new version was saved. The original is unchanged.'));
    });
  }
  function generateNarrative() {
    if (!report) return;
    const sourceId = report.id;
    void act('narrative', async signal => {
      const data = await request<{text: string}>(`/api/lesson-reports/${encodeURIComponent(sourceId)}/narrative`, signal, {locale: en ? 'en' : 'ko'});
      if (!alive.current || signal.aborted) return;
      setNarrative(data.text); setNotice(w('AI 초안을 확인·수정한 뒤 새 버전으로 저장해 주세요.', 'Review and edit the AI draft, then save a new version.'));
    });
  }
  function saveLesson(event: FormEvent) {
    event.preventDefault();
    const {resourceIds, ...fields} = lesson;
    const payload = {classId, ...fields, title: fields.title.trim(), links: resources.filter(item => resourceIds.includes(resourceKey(item))).map(({kind, id}) => ({kind, id}))};
    void act('lesson', async signal => {
      const data = await request<{lesson: LessonRecord}>('/api/lessons', signal, {...payload, requestId: retryKey('lesson', payload)});
      if (!alive.current || signal.aborted) return;
      if (data.lesson.classId !== classId) throw Error('Class mismatch');
      setLessons(previous => [data.lesson, ...previous.filter(item => item.id !== data.lesson.id)].sort((a, b) => b.date.localeCompare(a.date)));
      keys.current.delete('lesson'); setLesson(newLesson()); setNotice(w('수업 기록을 저장했어요. 다음 보고서에 함께 담을 수 있어요.', 'Lesson saved. Include it in your next report.'));
    });
  }
  function printReport() {
    if (!report) return;
    const popup = window.open('', '_blank', 'width=960,height=760');
    if (!popup) {setError(w('인쇄 창을 열 수 없어요. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.', 'Allow pop-ups for this site, then print again.')); return;}
    popup.opener = null;
    popup.document.write(classReportHtml(report, en, appendix)); popup.document.close();
    const button = popup.document.createElement('button'); button.className = 'print-action'; button.textContent = w('인쇄 / PDF로 저장', 'Print / Save as PDF');
    button.addEventListener('click', () => popup.print()); popup.document.body.prepend(button);
    popup.setTimeout(() => {if (!popup.closed) {popup.focus(); popup.print();}}, 200);
  }
  const lessonValue = (key: keyof LessonDraft, value: string) => setLesson(previous => ({...previous, [key]: value}));
  function toggleLessonList(key: 'toolIds' | 'resourceIds', value: string) {
    setLesson(previous => ({...previous, [key]: previous[key].includes(value) ? previous[key].filter(item => item !== value) : [...previous[key], value]}));
  }
  const kindName = (kind: Resource['kind']) => ({assignment: w('과제', 'Assignment'), cards: w('카드', 'Cards'), board: w('게시판', 'Board'), exhibition: w('전시', 'Exhibition')}[kind]);

  if (!classId) return <div className="class-report report-empty"><Users size={34}/><h2>{w('우리 반을 먼저 선택해 주세요', 'Choose a class first')}</h2><p>{w('위에서 학급을 선택하면 수업을 기록하고 보고서를 만들 수 있어요.', 'Select a class above to record lessons and create reports.')}</p></div>;

  return <div className="class-report">
    <div className="report-intro"><div><span className="report-eyebrow">CLASSROOM JOURNAL</span><h2>{w('오늘의 수업을, 오래 남는 기록으로', 'Keep a little record of every lesson')}</h2><p>{w('수업의 조각을 모으고, 우리 반의 배움을 한눈에 담아요.', 'Bring your lessons and class activity together in a saved report.')}</p></div><BookOpen size={37} strokeWidth={1.4}/></div>
    <div className="report-navigation"><div className="report-tabs" aria-label={w('보고서 메뉴', 'Report menu')}><button type="button" aria-pressed={tab === 'reports'} onClick={() => setTab('reports')}><FileText size={17}/>{w('리포트', 'Reports')}</button><button type="button" aria-pressed={tab === 'lessons'} onClick={() => setTab('lessons')}><BookOpen size={17}/>{w('수업 기록', 'Lessons')}</button></div><button className="report-refresh" type="button" disabled={loading || blocked} onClick={() => setRevision(value => value + 1)} aria-label={w('목록 새로고침', 'Refresh records')}><RefreshCw size={17} className={loading ? 'spin' : ''}/></button></div>
    {error && <p className="report-error" role="alert">{error}</p>}
    {notice && <p className="report-notice" role="status"><Check size={16}/>{notice}</p>}
    {tab === 'reports' ? <>
      <div className="report-compose-grid">
        <form className="report-panel" onSubmit={capture}><div className="report-section-heading"><h3><Plus size={18}/>{w('새 리포트', 'New report')}</h3><span>{w('지금 상태 저장', 'Capture current status')}</span></div>{dirty && <p className="report-muted">{w('아래 보고서의 편집을 저장하거나 되돌린 뒤 새 리포트를 만들 수 있어요.', 'Save or discard the report edits below before creating a new report.')}</p>}<fieldset disabled={blocked || dirty}>
          <Field label={w('보고서 이름', 'Report title')}><input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder={w('예: 10월 우리 반 수업 이야기', 'e.g. Our October learning journal')}/></Field>
          <div className="report-field-pair"><Field label={w('시작일', 'From')}><input required type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)}/></Field><Field label={w('종료일', 'To')}><input required type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)}/></Field></div>
          <div className="report-presets"><button type="button" onClick={() => {setFrom(day()); setTo(day());}}>{w('오늘', 'Today')}</button><button type="button" onClick={() => {setFrom(`${day().slice(0, 7)}-01`); setTo(day());}}>{w('이번 달', 'This month')}</button></div>
          <Field label={w('교사 기록', 'Teacher notes')} hint={w('선택 사항 · 관찰한 점, 수업 중 바뀐 계획, 다음 수업 아이디어', 'Optional · observations, changes, and ideas for the next lesson')}><textarea rows={3} maxLength={8000} value={notes} onChange={event => setNotes(event.target.value)}/></Field>
          <p className="report-scope-hint">{reportScope(en)}</p><button className="button primary report-wide" type="submit" disabled={!title.trim()}>{busy === 'capture' ? <LoaderCircle size={17} className="spin"/> : <Save size={17}/>} {w('현재 데이터로 저장', 'Capture and save')}</button>
        </fieldset></form>
        <aside className="report-panel report-archive"><div className="report-section-heading"><h3><FolderOpen size={18}/>{w('저장한 리포트', 'Saved reports')}</h3><span>{reports.length}</span></div>{loading ? <div className="report-empty compact" role="status"><LoaderCircle size={22} className="spin"/>{w('기록을 불러오는 중…', 'Loading records…')}</div> : !reports.length ? <div className="report-empty compact"><FileText size={32}/><p>{w('첫 번째 리포트를 만들어 보세요.', 'Create your first report.')}</p><small>{w('저장한 보고서는 이후 활동이 바뀌어도 유지돼요.', 'Saved reports stay unchanged by later activity.')}</small></div> : <div className="report-saved-list">{reports.map(item => <button type="button" key={item.id} className={report?.id === item.id ? 'selected' : ''} disabled={blocked || dirty} onClick={() => void openReport(item)}><span className="report-file-icon"><FileText size={19}/></span><span><strong>{item.title}</strong><small>{item.from} — {item.to}</small><small>v{item.version} · {reportTimestamp(item.createdAt, en)}</small></span><ChevronRight size={16}/></button>)}</div>}{dirty && <p className="report-muted">{w('편집 내용을 저장하거나 되돌리면 다른 보고서를 열 수 있어요.', 'Save or discard your edits to open another report.')}</p>}</aside>
      </div>
      {opening && <p className="report-loading" role="status"><LoaderCircle size={19} className="spin"/>{w('보고서를 여는 중…', 'Opening report…')}</p>}
      {report && <section className="report-document" aria-label={w('저장된 보고서', 'Saved report')}>
        <header className="report-document-heading"><div><span className="report-eyebrow">{w('저장된 리포트', 'SAVED REPORT')} · v{report.version}</span><h2>{report.title}</h2><p>{report.className} <span>·</span> {report.from} — {report.to}</p></div><span className="report-frozen"><LockKeyhole size={14}/>{w('집계 고정', 'Snapshot saved')}</span></header>
        <div className="report-capture-info"><CalendarDays size={17}/><div><strong>{w('집계 시점', 'Captured')}: {reportTimestamp(report.capturedAt, en)} · KST</strong><p>{reportScope(en)}</p><small>{w('이 버전 저장', 'Version saved')}: {reportTimestamp(report.createdAt, en)} · KST</small></div></div>
        <div className="report-metrics">{[
          [w('활동 학생', 'Active students'), report.metrics.students], [w('과제', 'Assignments'), report.metrics.assignments], [w('카드 세트', 'Card sets'), report.metrics.cardSets], [w('게시글', 'Posts'), report.metrics.boardPosts], [w('작품', 'Artworks'), report.metrics.artworks], [w('수업 기록', 'Lessons'), report.metrics.lessons],
        ].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        <section className="report-data-section"><h3>{w('과제 현황', 'Assignment status')}</h3><div className="report-status-summary">{[[w('미제출', 'Pending'), report.metrics.pending, 'pending'], [w('제출', 'Submitted'), report.metrics.submitted, 'submitted'], [w('확인 완료', 'Reviewed'), report.metrics.done, 'done'], [w('수정 요청', 'Revision'), report.metrics.revision, 'revision']].map(([label, value, color]) => <span key={label} className={`report-status ${color}`}><i/>{label}<strong>{value}</strong></span>)}</div><DataTable headers={[w('과제', 'Assignment'), w('대상', 'Targets'), w('미제출', 'Pending'), w('제출', 'Submitted'), w('확인 완료', 'Reviewed'), w('수정 요청', 'Revision')]} rows={report.assignments.map(item => [item.title, item.targetCount, item.pending, item.submitted, item.done, item.revision])} empty={empty}/></section>
        <section className="report-data-section"><h3>{w('카드 학습', 'Card learning')}<span>{report.metrics.cardAttempts} {w('회 테스트 제출', 'submitted tests')}</span></h3><DataTable headers={[w('세트', 'Set'), w('대상', 'Targets'), w('제출한 테스트', 'Submitted tests')]} rows={report.cards.map(item => [item.title, item.targetCount, item.attempts])} empty={empty}/></section>
        <div className="report-data-pair"><section className="report-data-section"><h3>{w('참여 게시판', 'Participation boards')}<span>{report.metrics.boards}</span></h3><DataTable headers={[w('게시판', 'Board'), w('게시글', 'Posts')]} rows={report.boards.map(item => [item.title, item.postCount])} empty={empty}/></section><section className="report-data-section"><h3>{w('전시 활동', 'Exhibitions')}<span>{report.metrics.exhibitions}</span></h3><DataTable headers={[w('전시', 'Exhibition'), w('작품', 'Artworks')]} rows={report.exhibitions.map(item => [item.title, item.artworkCount])} empty={empty}/></section></div>
        <section className="report-data-section"><h3>{w('수업 기록', 'Lesson records')}<span>{report.lessons.length}</span></h3>{report.lessons.length ? <LessonList lessons={report.lessons} en={en}/> : <p className="report-muted">{w('이 기간의 수업 기록이 없어요. 수업 기록 탭에서 오늘의 수업을 남겨 보세요.', 'No lesson records for this period. Add one in the Lessons tab.')}</p>}</section>
        <section className="report-editor"><fieldset disabled={blocked}><Field label={w('교사 기록', 'Teacher notes')}><textarea rows={4} maxLength={8000} value={editNotes} onChange={event => setEditNotes(event.target.value)}/></Field><div className="report-narrative-heading"><h3><Sparkles size={17}/>{w('보고서 설명', 'Report narrative')}</h3><button className="button" type="button" disabled={editNotes !== report.teacherNotes} onClick={generateNarrative}>{busy === 'narrative' ? <LoaderCircle size={16} className="spin"/> : <Sparkles size={16}/>} {narrative ? w('AI 초안 다시 작성', 'Regenerate AI draft') : w('AI 초안 만들기', 'Create AI draft')}</button></div><p className="report-muted">{editNotes !== report.teacherNotes ? w('바꾼 교사 기록을 새 버전으로 저장하면 AI가 그 내용을 읽고 설명을 만들어요.', 'Save your edited notes as a new version before generating an AI narrative from them.') : w('AI는 이 보고서의 집계와 저장된 교사 기록을 바탕으로 초안을 만들어요. 내용을 확인하고 수정해 주세요.', 'AI uses this saved report’s totals and teacher notes. Review and edit its draft.')}</p><textarea className="report-narrative" aria-label={w('보고서 설명 편집', 'Edit report narrative')} rows={7} maxLength={20000} value={narrative} onChange={event => setNarrative(event.target.value)} placeholder={w('직접 쓰거나 AI 초안으로 시작하세요.', 'Write your own summary or start with an AI draft.')}/><div className="report-editor-actions"><span>{dirty ? w('저장하지 않은 변경 내용', 'Unsaved edits') : w('원본 데이터와 집계 시점은 유지됩니다.', 'Source data and capture time stay unchanged.')}</span><div>{dirty && <button className="button" type="button" onClick={() => {setEditNotes(report.teacherNotes); setNarrative(report.narrative); setNotice('');}}>{w('편집 되돌리기', 'Discard edits')}</button>}<button className="button primary" type="button" disabled={!dirty} onClick={saveVersion}>{busy === 'version' ? <LoaderCircle size={16} className="spin"/> : <Save size={16}/>} {w('새 버전으로 저장', 'Save new version')}</button></div></div></fieldset></section>
        <section className="report-data-section report-appendix"><label className="report-check"><input type="checkbox" checked={appendix} onChange={event => setAppendix(event.target.checked)}/><span><strong>{w('학생별 부록 포함', 'Include student appendix')}</strong><small>{w('선택하면 학생 이름과 개별 결과가 화면·인쇄·내보내기에 포함돼요.', 'Includes student names and individual results on screen, in print and in exports.')}</small></span></label>{appendix && <><p className="report-muted">{w('학생 상태와 포인트도 집계 시점 기준입니다. 최근 점수는 세트별 최근 테스트 점수입니다.', 'Student status and points are captured at snapshot time. Latest scores are the latest test score for each set.')}</p><DataTable headers={[w('학생', 'Student'), w('상태', 'Status'), w('과제 대상', 'Assigned'), w('제출', 'Submitted'), w('확인 완료', 'Reviewed'), w('수정', 'Revision'), w('카드 진행 세트', 'Card sets with progress'), w('테스트 제출', 'Submitted tests'), w('최근 점수', 'Latest scores'), w('포인트', 'Points')]} rows={report.students.map(item => [`${item.number}. ${item.name}`, item.active ? w('활동', 'Active') : w('비활성', 'Inactive'), item.assignments, item.submitted, item.done, item.revision, item.cardSessions, item.cardAttempts, item.latestScores.join(' / ') || '—', item.points])} empty={w('학생이 없어요.', 'No students.')}/></>}</section>
        <div className="report-export"><div><strong>{w('기록을 꺼내 쓰세요', 'Take your report with you')}</strong><p>{dirty ? w('편집 내용을 새 버전으로 저장하면 인쇄·내보내기를 할 수 있어요.', 'Save your edits as a new version before printing or exporting.') : w('저장된 내용을 출력해요. 인쇄 창에서 PDF로 저장할 수 있어요.', 'Exports use the saved report. Choose Save as PDF in the print dialog.')}</p></div><div><button className="button primary" type="button" disabled={blocked || dirty} onClick={printReport}><Printer size={16}/>{w('인쇄 / PDF', 'Print / PDF')}</button><button className="button" type="button" disabled={blocked || dirty} onClick={() => download(`${report.title}-v${report.version}.csv`, classReportCsv(report, en, appendix), 'text/csv;charset=utf-8')}><Download size={16}/>CSV</button><button className="button" type="button" disabled={blocked || dirty} onClick={() => download(`${report.title}-v${report.version}.json`, classReportJson(report, appendix), 'application/json;charset=utf-8')}><Download size={16}/>JSON</button></div></div>
      </section>}
    </> : <div className="report-lessons-grid"><form className="report-panel" onSubmit={saveLesson}><div className="report-section-heading"><h3><Plus size={18}/>{w('오늘 수업 한 줄', 'Today’s lesson')}</h3></div><p className="report-muted">{w('제목과 날짜만으로 시작해요. 자료를 연결해 두면 보고서에서 함께 볼 수 있어요.', 'Start with a title and date. Link class resources to keep them with your report.')}</p><fieldset disabled={blocked}><Field label={w('수업 이름', 'Lesson title')}><input required maxLength={120} value={lesson.title} onChange={event => lessonValue('title', event.target.value)} placeholder={w('예: 우리 동네 공공기관 알아보기', 'e.g. Discovering our neighborhood')}/></Field><Field label={w('수업 날짜', 'Lesson date')}><input required type="date" value={lesson.date} onChange={event => lessonValue('date', event.target.value)}/></Field><div className="report-field-pair"><Field label={w('교과', 'Subject')}><input maxLength={60} value={lesson.subject} onChange={event => lessonValue('subject', event.target.value)} placeholder={w('선택 사항', 'Optional')}/></Field><Field label={w('단원', 'Unit')}><input maxLength={120} value={lesson.unit} onChange={event => lessonValue('unit', event.target.value)} placeholder={w('선택 사항', 'Optional')}/></Field></div><Field label={w('수업 목표', 'Learning objective')}><textarea rows={2} maxLength={1000} value={lesson.objective} onChange={event => lessonValue('objective', event.target.value)}/></Field><Field label={w('수업 기록', 'Lesson notes')}><textarea rows={4} maxLength={6000} value={lesson.notes} onChange={event => lessonValue('notes', event.target.value)} placeholder={w('함께 한 활동, 학생들의 반응, 다음 시간에 이어갈 내용', 'Activities, observations, and what to continue next time')}/></Field><details className="report-options"><summary>{w('사용한 도구', 'Tools used')}<span>{lesson.toolIds.length}</span></summary><div className="report-tool-options">{toolCatalog.filter(tool => tool.id !== 'report').map(tool => <label key={tool.id}><input type="checkbox" checked={lesson.toolIds.includes(tool.id)} onChange={() => toggleLessonList('toolIds', tool.id)}/>{en ? tool.en : tool.ko}</label>)}</div></details><details className="report-options"><summary>{w('우리 반 자료 연결', 'Link class resources')}<span>{lesson.resourceIds.length}/20</span></summary>{resources.length ? <div className="report-resource-options">{resources.map(resource => <label key={resourceKey(resource)}><input type="checkbox" checked={lesson.resourceIds.includes(resourceKey(resource))} disabled={!lesson.resourceIds.includes(resourceKey(resource)) && lesson.resourceIds.length >= 20} onChange={() => toggleLessonList('resourceIds', resourceKey(resource))}/><span><small>{kindName(resource.kind)}</small>{resource.title}</span></label>)}</div> : <p className="report-muted">{loading ? w('자료를 불러오는 중…', 'Loading resources…') : w('이 학급에 연결할 자료가 없어요. 과제·카드·게시판·전시를 만든 뒤 연결할 수 있어요.', 'No class resources yet. Create an assignment, card set, board or exhibition first.')}</p>}</details><button className="button primary report-wide" type="submit" disabled={!lesson.title.trim()}>{busy === 'lesson' ? <LoaderCircle size={17} className="spin"/> : <Save size={17}/>} {w('수업 기록 저장', 'Save lesson')}</button></fieldset></form><section className="report-panel"><div className="report-section-heading"><h3><BookOpen size={18}/>{w('우리 반 수업 기록', 'Class lesson journal')}</h3><span>{lessons.length}</span></div>{loading ? <div className="report-empty compact" role="status"><LoaderCircle size={22} className="spin"/>{w('기록을 불러오는 중…', 'Loading records…')}</div> : lessons.length ? <LessonList lessons={lessons} en={en}/> : <div className="report-empty compact"><BookOpen size={35}/><p>{w('첫 수업의 한 줄을 남겨 보세요.', 'Write a line about your first lesson.')}</p><small>{w('새로 만드는 리포트에 수업 기록이 함께 담겨요.', 'Lesson records appear in newly captured reports.')}</small></div>}</section></div>}
  </div>;
}

function LessonList({lessons, en}: {lessons: LessonRecord[]; en: boolean}) {
  const w = (ko: string, english: string) => en ? english : ko;
  return <div className="report-lesson-list">{lessons.map(lesson => <article key={lesson.id}><time dateTime={lesson.date}>{lesson.date}</time><h4>{lesson.title}</h4>{(lesson.subject || lesson.unit) && <p className="report-muted">{[lesson.subject, lesson.unit].filter(Boolean).join(' · ')}</p>}{lesson.objective && <p className="report-objective"><strong>{w('목표', 'Objective')}</strong>{lesson.objective}</p>}{lesson.notes && <p className="report-prose">{lesson.notes}</p>}{!!lesson.links.length && <div className="report-lesson-tags">{lesson.links.map(link => <span key={`${link.kind}:${link.id}`}><FileText size={12}/>{link.title}</span>)}</div>}{!!lesson.toolIds.length && <p className="report-tool-names">{w('사용한 도구', 'Tools used')}: {lesson.toolIds.map(id => {const tool = toolCatalog.find(item => item.id === id); return tool ? en ? tool.en : tool.ko : id;}).join(' · ')}</p>}</article>)}</div>;
}
