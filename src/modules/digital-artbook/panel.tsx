'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Download, LoaderCircle, Trash2, X } from 'lucide-react';
import { jsonRequest, moduleRequest } from '../artwork-extensions/client';
import { ARTBOOK_LIMIT, type BookJob, type BookOptions, type BookWork } from './types';
import './styles.css';

type Student = {id: string; name: string; number: number};
type Catalog = {works: BookWork[]; cursor: string};
export default function DigitalArtbook({endpoint, className, onClose, en = false}: {endpoint: string; className: string; onClose: () => void; en?: boolean}) {
  const dialog = useRef<HTMLDialogElement>(null), alive = useRef(true), generation = useRef(0), running = useRef(false), request = useRef({key: '', id: ''});
  const [students, setStudents] = useState<Student[]>([]), [studentCursor, setStudentCursor] = useState(''), [studentId, setStudentId] = useState('');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [cursor, setCursor] = useState('');
  const [works, setWorks] = useState<BookWork[]>([]), [keys, setKeys] = useState<string[]>([]), [loaded, setLoaded] = useState(false);
  const [options, setOptions] = useState<BookOptions>({title: '나의 작은 미술관', displayName: '', dedication: '', format: 'a4', cover: 'sage', voiceQr: false});
  const [jobs, setJobs] = useState<BookJob[]>([]), [storage, setStorage] = useState({usedBytes: 0, reservedBytes: 0, limitBytes: 256 * 1024 * 1024});
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState(false);
  const l = (ko: string, english: string) => en ? english : ko;
  const selected = keys.map(k => works.find(w => w.key === k)).filter((w): w is BookWork => !!w);
  async function loadStudents(cursor = '') {const data = await moduleRequest<{students: Student[]; cursor: string}>(endpoint + '?students=1&cursor=' + encodeURIComponent(cursor)); if (!alive.current) return; setStudents(old => cursor ? [...old, ...data.students] : data.students); setStudentCursor(data.cursor);}
  async function loadJobs() {const data = await moduleRequest<{jobs: BookJob[]; storage: typeof storage}>(endpoint + '/jobs'); if (alive.current) {setJobs(data.jobs); setStorage(data.storage);}}
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    alive.current = true; node?.showModal();
    void Promise.all([loadStudents(), loadJobs()]).catch(e => {if (alive.current) setError(e.message);});
    return () => {alive.current = false; generation.current++; node?.close(); if (previous?.isConnected) previous.focus({preventScroll: true});};
  }, [endpoint]);
  useEffect(() => {
    if (busy || !jobs.some(j => j.busy)) return;
    const timer = setTimeout(() => {void loadJobs().catch(e => {if (alive.current) setError(e.message);});}, 10_000);
    return () => clearTimeout(timer);
  }, [jobs, busy, endpoint]);
  function reset() {generation.current++; setWorks([]); setKeys([]); setCursor(''); setLoaded(false); setError('');}
  async function loadWorks(more = false) {
    const token = ++generation.current; setLoading(true); setError('');
    try {
      const params = new URLSearchParams({studentId, from, to, ...(more ? {cursor} : {})});
      const data = await moduleRequest<Catalog>(endpoint + '?' + params);
      if (!alive.current || generation.current !== token) return;
      const combined = [...(more ? works : []), ...data.works].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
      setWorks(combined); setCursor(data.cursor); setLoaded(true);
      setKeys(old => [...(more ? old : []), ...data.works.map(w => w.key).filter(k => !more || !old.includes(k))].slice(0, ARTBOOK_LIMIT));
    } catch (e) {if (alive.current && generation.current === token) setError((e as Error).message);}
    finally {if (alive.current && generation.current === token) setLoading(false);}
  }
  function updateJob(job: BookJob) {setJobs(old => [job, ...old.filter(j => j.id !== job.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));}
  async function process(job: BookJob) {
    let current = job;
    while (alive.current && current.status !== 'ready' && current.status !== 'deleting') {
      const data = await moduleRequest<{job: BookJob}>(endpoint + '/jobs/' + job.id + '/step', jsonRequest('POST', {}));
      current = data.job; if (alive.current) updateJob(current);
    }
  }
  async function action(work: () => Promise<void>) {
    if (running.current) return; running.current = true; setBusy(true); setError('');
    try {await work();}
    catch (e) {if (alive.current) setError((e as Error).message);}
    finally {running.current = false; if (alive.current) {setBusy(false); void loadJobs().catch(e => setError(e.message));}}
  }
  async function create() {
    await action(async () => {
      const payload = {studentId, from, to, keys, options}, fingerprint = JSON.stringify(payload);
      if (request.current.key !== fingerprint) request.current = {key: fingerprint, id: crypto.randomUUID()};
      const data = await moduleRequest<{job: BookJob}>(endpoint + '/jobs', jsonRequest('POST', {...payload, requestId: request.current.id}));
      if (!alive.current) return;
      updateJob(data.job); request.current = {key: '', id: ''}; await process(data.job);
    });
  }
  function move(index: number, delta: number) {setKeys(old => {const next = [...old]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next;});}
  async function download(job: BookJob) {
    await action(async () => {
      const response = await fetch(endpoint + '/jobs/' + job.id + '/pdf', {cache: 'no-store'});
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()), anchor = document.createElement('a');
      anchor.href = url; anchor.download = job.displayName + '-디지털아트북.pdf'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }
  const status = (j: BookJob) => j.status === 'ready' ? l('PDF 완성', 'PDF ready') : j.status === 'render' ? l('PDF 조판 대기', 'Ready to render') : j.status === 'deleting' ? l('삭제 재시도 필요', 'Retry deletion') : j.status === 'failed' ? l('다시 시도해 주세요', 'Retry needed') : l('이미지 준비', 'Preparing images');
  return <dialog ref={dialog} className="ab-dialog" aria-label={l('학생별 디지털 아트북', 'Student digital artbook')} onCancel={e => {e.preventDefault(); onClose();}}>
    <header><div><small>{className}</small><h2><BookOpen size={23}/>{l('학생별 디지털 아트북', 'Student digital artbook')}</h2></div><button type="button" onClick={onClose} aria-label={l('아트북 닫기', 'Close artbook')}><X size={22}/></button></header>
    <div className="ab-body"><p>{l('전시실에서 승인한 작품을 한 권의 추억으로. 학생 한 명씩 작품을 골라 순서를 정해 주세요.', 'Collect a student’s approved artwork into a keepsake. Choose and arrange the works below.')}</p>
    <fieldset disabled={busy || loading} className="ab-fields"><legend>{l('1. 학생과 기간', '1. Student and dates')}</legend>
      <label>{l('학생', 'Student')}<select aria-label={l('학생', 'Student')} value={studentId} onChange={e => {reset(); setStudentId(e.target.value); setOptions(o => ({...o, displayName: students.find(s => s.id === e.target.value)?.name || ''}));}}><option value="">{l('학생 선택', 'Select a student')}</option>{students.map(s => <option key={s.id} value={s.id}>{s.number ? `${s.number}. ` : ''}{s.name}</option>)}</select></label>
      <label>{l('시작일', 'From')}<input aria-label={l('시작일', 'From')} type="date" value={from} onChange={e => {reset(); setFrom(e.target.value);}}/></label><label>{l('종료일', 'To')}<input aria-label={l('종료일', 'To')} type="date" value={to} onChange={e => {reset(); setTo(e.target.value);}}/></label>
      <button type="button" disabled={!studentId} onClick={() => void loadWorks()}>{l('작품 불러오기', 'Load artworks')}</button>{studentCursor && <button type="button" onClick={() => void action(() => loadStudents(studentCursor))}>{l('학생 더 보기', 'More students')}</button>}
    </fieldset>
    <p className="ab-hint">{l('같은 학급에서 아트북을 켠 전시실의 승인 작품만 모아요. 학생 미연결 작품은 작품 정보 수정에서 학생을 먼저 지정해 주세요. 이름만으로 연결하지 않아요.', 'Only approved works in enabled exhibitions of this class are included. Link unassigned works to a student in artwork settings first.')}</p>
    {loaded && <section className="ab-picker"><h3>{l('2. 작품과 순서', '2. Choose and arrange')} <small>{keys.length} / {ARTBOOK_LIMIT}</small></h3><button type="button" disabled={busy || !keys.length} onClick={() => setKeys(old => [...old].sort((a,b) => {const x=works.find(w=>w.key===a)!, y=works.find(w=>w.key===b)!; return x.date.localeCompare(y.date)||a.localeCompare(b);} ))}>{l('날짜순으로 정렬', 'Sort by date')}</button>
      {!works.length && <p>{l('이 기간에 연결된 승인 작품이 없어요.', 'No approved artwork in this period.')}</p>}
      {works.length > ARTBOOK_LIMIT && <p>{l('한 권에 최대 60점을 담을 수 있어요. 포함할 작품을 선택해 주세요.', 'Choose up to 60 works per book.')}</p>}
      <div className="ab-works">{works.map(work => <label key={work.key} className="ab-work"><input type="checkbox" checked={keys.includes(work.key)} disabled={busy || !keys.includes(work.key) && keys.length >= ARTBOOK_LIMIT} onChange={e => setKeys(old => e.target.checked ? [...old, work.key] : old.filter(k => k !== work.key))}/><img loading="lazy" src={work.thumbnailUrl} alt=""/><span><strong>{work.title}</strong><small>{work.date} · {work.roomTitle}</small></span></label>)}</div>
      {cursor && <button type="button" disabled={loading || busy} onClick={() => void loadWorks(true)}>{l('전시 더 불러오기', 'Load more exhibitions')}</button>}
      {!!keys.length && <ol className="ab-order">{selected.map((w, i) => <li key={w.key}><span>{w.title}</span><button type="button" disabled={busy || !i} onClick={() => move(i, -1)} aria-label={`${w.title} ${l('앞으로', 'move earlier')}`}><ArrowUp size={15}/></button><button type="button" disabled={busy || i === keys.length - 1} onClick={() => move(i, 1)} aria-label={`${w.title} ${l('뒤로', 'move later')}`}><ArrowDown size={15}/></button></li>)}</ol>}
    </section>}
    <fieldset disabled={busy} className="ab-fields"><legend>{l('3. 나만의 화집', '3. Personalize')}</legend>
      <label>{l('표지 제목', 'Cover title')}<input maxLength={80} value={options.title} onChange={e => setOptions(o => ({...o, title: e.target.value}))}/></label>
      <label>{l('표시 이름', 'Display name')}<input maxLength={50} value={options.displayName} onChange={e => setOptions(o => ({...o, displayName: e.target.value}))}/></label>
      <label>{l('PDF 크기', 'Page size')}<select aria-label={l('PDF 크기', 'Page size')} value={options.format} onChange={e => setOptions(o => ({...o, format: e.target.value as BookOptions['format']}))}><option value="a4">A4 {l('인쇄용', 'print')}</option><option value="mobile">{l('휴대폰용', 'Mobile')}</option></select></label>
      <label>{l('표지 색', 'Cover color')}<select aria-label={l('표지 색', 'Cover color')} value={options.cover} onChange={e => setOptions(o => ({...o, cover: e.target.value as BookOptions['cover']}))}><option value="sage">{l('숲의 초록', 'Sage')}</option><option value="peach">{l('따뜻한 복숭아', 'Peach')}</option><option value="sky">{l('맑은 하늘', 'Sky')}</option></select></label>
      <label className="ab-full">{l('마지막 장에 남길 말', 'Closing note')}<textarea maxLength={500} rows={3} value={options.dedication} onChange={e => setOptions(o => ({...o, dedication: e.target.value}))}/></label>
      <label className="ab-check ab-full"><input type="checkbox" checked={options.voiceQr} onChange={e => setOptions(o => ({...o, voiceQr: e.target.checked}))}/>{l('공개 허용된 음성 QR 넣기', 'Include publicly enabled voice QR codes')}</label>
    </fieldset>
    <p className="ab-hint">{l('승인된 음성 캡션은 함께 담겨요. 음성 QR은 기존 전시 QR과 음성 공개가 모두 켜져 있고 공유 QR을 발급한 작품에만 들어가요. 공개를 끄면 QR 재생도 종료돼요.', 'Approved voice captions are included. Audio QR requires an existing exhibition sharing link and public audio permission. Turning sharing off stops QR playback.')}</p>
    <div className="ab-actions"><button type="button" disabled={!keys.length} onClick={() => setPreview(v => !v)}>{l('구성 미리보기', 'Preview layout')}</button><button className="ab-primary" type="button" disabled={busy || loading || !keys.length || !options.title.trim() || !options.displayName.trim()} onClick={() => void create()}>{busy ? <LoaderCircle className="spin" size={17}/> : <BookOpen size={17}/>} {l('PDF 아트북 만들기', 'Create PDF')}</button></div>
    {preview && <section className={`ab-preview ab-cover-${options.cover}`} aria-label={l('아트북 구성 미리보기', 'Artbook layout preview')}><div className="ab-cover"><small>MY LITTLE GALLERY</small><h3>{options.title}</h3><p>{options.displayName}</p><small>{className} · {keys.length}{l('점', ' works')}</small></div>{selected.map((w, i) => <article key={w.key}><small>{i + 1} / {w.date}</small><h4>{w.title}</h4><img src={w.thumbnailUrl} alt={w.title}/><p>{w.description}</p></article>)}<p>{options.dedication || l('그림마다 담긴 생각과 마음을 오래 간직해 주세요.', 'Treasure the thoughts and feelings in every artwork.')}</p><small>{l('구성 확인용 미리보기예요. 최종 한글 조판과 음성 캡션은 완성된 PDF에서 확인해 주세요.', 'Layout preview. Check the final typography and voice captions in the completed PDF.')}</small></section>}
    {loading && <p role="status">{l('작품을 모으는 중이에요.', 'Loading artworks…')}</p>}{error && <p className="ab-error" role="alert">{error}</p>}
    <section className="ab-jobs"><h3>{l('저장한 아트북', 'Saved artbooks')}</h3><p className="ab-hint">{l('화면을 닫으면 현재 단계까지만 처리해요. 다시 열어 이어서 만들 수 있어요. 다운로드한 PDF는 해당 학생의 보호자에게 직접 전달해 주세요.', 'Closing pauses after the current step. Reopen to resume. Deliver the downloaded PDF to the appropriate guardian.')}</p><small>{Math.ceil((storage.usedBytes + storage.reservedBytes) / 1024 / 1024)} / 256 MB · {l('교사별 최대 20권', 'Up to 20 books per teacher')}</small>
      {!jobs.length && <p>{l('아직 만든 아트북이 없어요.', 'No artbooks yet.')}</p>}
      {jobs.map(job => <article key={job.id}><div><strong>{job.displayName} · {job.title}</strong><small>{status(job)} · {job.completed}/{job.total} · {new Date(job.createdAt).toLocaleDateString(en ? 'en-US' : 'ko-KR')}{job.size > 0 && ` · ${(job.size / 1024 / 1024).toFixed(1)} MB`}</small><progress max={job.total + 1} value={job.completed + (job.status === 'ready' ? 1 : 0)} aria-label={l('아트북 생성 진행률', 'Artbook progress')}/>{job.error && <p role="status">{job.error}</p>}</div><div className="ab-actions">{job.status === 'ready' ? <button type="button" disabled={busy} onClick={() => void download(job)}><Download size={16}/>PDF</button> : job.status !== 'deleting' && <button type="button" disabled={busy || job.busy} onClick={() => void action(() => process(job))}>{l('이어서 만들기', 'Resume')}</button>}<button type="button" disabled={busy || job.busy} aria-label={`${job.displayName} ${l('아트북 삭제', 'delete artbook')}`} onClick={() => {if (confirm(l('저장된 아트북 PDF와 생성 자료를 삭제할까요? 원래 전시 작품은 유지돼요.', 'Delete the saved PDF and its export files? Exhibition artworks stay available.'))) void action(async () => {await moduleRequest(endpoint + '/jobs/' + job.id, {method: 'DELETE'}); await loadJobs();});}}><Trash2 size={16}/></button></div></article>)}
    </section></div>
  </dialog>;
}
