'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Download, Images, LoaderCircle, RefreshCw, Trash2, Users } from 'lucide-react';
import { CLASS_BOOK_LIMIT, type BookJob, type ClassBookOptions, type Overview, type PreviewItem } from './types';
import './styles.css';

type ClassRow = {id: string; name: string; grade: string; year: number};
const HALLS: Record<string, string> = {cozy: '아늑한 전시관', forest: '숲 전시관', sky: '하늘 전시관', ocean: '바다 전시관', earth: '우주 · 지구 전시관', moon: '우주 · 달 전시관', saturn: '우주 · 토성 전시관', coral: '바다 · 산호 전시관', kelp: '바다 · 켈프 전시관', abyss: '바다 · 심해 전시관', lagoon: '바다 · 라군 전시관'};
const API = '/api/class-artbooks';
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {cache: 'no-store', ...init}), data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || '잠시 후 다시 시도해 주세요.'), {status: response.status});
  return data;
}
const post = (value: unknown): RequestInit => ({method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
const megabytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
function progress(job: BookJob) {
  if (job.status === 'ready') return 100;
  const images = job.total ? job.completed / job.total : 0, books = job.outputs ? job.rendered / job.outputs : 0, packed = job.outputs ? Math.min(1, job.packed / job.outputs) : 0;
  return Math.round(images * 65 + books * 28 + packed * 6);
}
function stage(job: BookJob) {
  if (job.status === 'ready') return '완성';
  if (job.status === 'failed') return '멈춤';
  if (job.status === 'deleting') return '지우는 중';
  if (job.status === 'assets') return `작품 사진 준비 ${job.completed}/${job.total}`;
  if (job.status === 'render') return `책 엮는 중 ${job.rendered}/${job.outputs}`;
  return '한 파일로 묶는 중';
}

export default function ClassArtbookWizard() {
  const alive = useRef(true), running = useRef(false), request = useRef({key: '', id: ''});
  const [state, setState] = useState<'loading' | 'ready' | 'closed'>('loading');
  const [classes, setClasses] = useState<ClassRow[]>([]), [classId, setClassId] = useState('');
  const [data, setData] = useState<Overview | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [rooms, setRooms] = useState<string[]>([]), [everyone, setEveryone] = useState(true), [students, setStudents] = useState<string[]>([]);
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [options, setOptions] = useState<ClassBookOptions>({mode: 'class', title: '우리 반 작품집', cover: 'sage', order: 'student', perPage: 2, names: 'name', story: true, feedback: false, unlinked: true, format: 'a4', dedication: ''});
  const [homework, setHomework] = useState(false), [board, setBoard] = useState(false);
  const [works, setWorks] = useState<PreviewItem[] | null>(null), [worksTotal, setWorksTotal] = useState(0), [exclude, setExclude] = useState<string[]>([]);
  const [jobs, setJobs] = useState<BookJob[]>([]), [keep, setKeep] = useState({limit: 6, keepDays: 30}), [busy, setBusy] = useState(false);
  const set = <K extends keyof ClassBookOptions>(key: K, value: ClassBookOptions[K]) => setOptions(o => ({...o, [key]: value}));

  useEffect(() => {
    alive.current = true;
    call<{classes: ClassRow[]}>(API).then(r => {if (!alive.current) return; setClasses(r.classes); setClassId(r.classes[0]?.id || ''); setState('ready');})
      .catch(e => {if (alive.current) {setState(e.status === 404 ? 'closed' : 'ready'); if (e.status !== 404) setError(e.message);}});
    return () => {alive.current = false;};
  }, []);
  const loadJobs = useCallback(async (id: string) => {
    const r = await call<{jobs: BookJob[]; limit: number; keepDays: number}>(`${API}/${id}/jobs`);
    if (alive.current) {setJobs(r.jobs); setKeep({limit: r.limit, keepDays: r.keepDays});}
  }, []);
  useEffect(() => {
    if (!classId) return;
    let current = true;
    setLoading(true); setError(''); setData(null); setWorks(null); setExclude([]); setJobs([]);
    Promise.all([call<Overview>(`${API}/${classId}`), loadJobs(classId)]).then(([overview]) => {
      if (!current || !alive.current) return;
      setData(overview); setRooms(overview.rooms.filter(r => r.approved).map(r => r.id)); setEveryone(true); setStudents([]); setHomework(false); setBoard(false);
    }).catch(e => {if (current && alive.current) setError(e.message);}).finally(() => {if (current && alive.current) setLoading(false);});
    return () => {current = false;};
  }, [classId, loadJobs]);

  const halls = useMemo(() => {
    const map = new Map<string, Overview['rooms']>();
    for (const room of data?.rooms ?? []) map.set(room.theme, [...(map.get(room.theme) ?? []), room]);
    return [...map];
  }, [data]);
  const picked = useMemo(() => (data?.rooms ?? []).filter(r => rooms.includes(r.id)), [data, rooms]);
  const totals = useMemo(() => ({approved: picked.reduce((n, r) => n + r.approved, 0), unlinked: picked.reduce((n, r) => n + r.unlinked, 0)}), [picked]);
  const selection = useMemo(() => ({roomIds: rooms, studentIds: everyone ? [] : students, from, to, exclude, homework, board}), [rooms, everyone, students, from, to, exclude, homework, board]);
  const sourced = rooms.length > 0 || homework || board;
  // Any change to what is gathered makes the checked list stale.
  useEffect(() => {setWorks(null); setExclude([]);}, [rooms, everyone, students, from, to, homework, board, options.mode, options.unlinked]);
  const canMake = !!classId && sourced && (everyone || students.length > 0) && !!options.title.trim() && !busy;

  async function act(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try {await work();} catch (e) {if (alive.current) setError((e as Error).message);}
    finally {running.current = false; if (alive.current) {setBusy(false); if (classId) void loadJobs(classId).catch(() => {});}}
  }
  const merge = (job: BookJob) => setJobs(old => [job, ...old.filter(j => j.id !== job.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  async function run(job: BookJob) {
    let current = job;
    while (alive.current && current.status !== 'ready' && current.status !== 'deleting') {
      current = (await call<{job: BookJob}>(`${API}/${classId}/jobs/${job.id}/step`, post({}))).job;
      if (alive.current) merge(current);
    }
  }
  const loadWorks = () => act(async () => {
    const r = await call<{items: PreviewItem[]; total: number}>(`${API}/${classId}/preview`, post({selection: {...selection, exclude: []}, options}));
    if (alive.current) {setWorks(r.items); setWorksTotal(r.total);}
  });
  const create = () => act(async () => {
    const payload = {selection, options}, key = JSON.stringify(payload);
    if (request.current.key !== key) request.current = {key, id: crypto.randomUUID()};
    const {job} = await call<{job: BookJob}>(`${API}/${classId}/jobs`, post({...payload, requestId: request.current.id}));
    if (!alive.current) return;
    merge(job); request.current = {key: '', id: ''};
    document.getElementById('cab-saved')?.scrollIntoView({behavior: 'smooth', block: 'start'});
    await run(job);
  });
  const download = (job: BookJob) => act(async () => {
    const {url} = await call<{url: string}>(`${API}/${classId}/jobs/${job.id}/download`), link = document.createElement('a');
    link.href = url; link.rel = 'noopener'; document.body.append(link); link.click(); link.remove();
  });
  const remove = (job: BookJob) => {
    if (confirm('이 작품집 파일을 지울까요? 전시 작품은 그대로 남아요.')) void act(async () => {await call(`${API}/${classId}/jobs/${job.id}`, {method: 'DELETE'});});
  };
  const toggle = (list: string[], value: string, on: boolean) => on ? [...new Set([...list, value])] : list.filter(v => v !== value);
  const expected = works ? worksTotal - exclude.length : totals.approved - (options.mode === 'class' && options.unlinked ? 0 : totals.unlinked);

  if (state === 'loading') return <main className="cab"><p className="cab-status" role="status"><LoaderCircle className="spin" size={18}/> 불러오는 중이에요.</p></main>;
  if (state === 'closed') return <main className="cab"><header className="cab-head"><p className="page-kicker">CLASS ARTBOOK</p><h1 className="page-title">우리 반 작품집</h1></header><p className="cab-empty">아직 준비 중인 기능이에요. 열리면 작품전시 메뉴에서 안내해 드릴게요.</p></main>;
  return <main className="cab">
    <header className="cab-head">
      <div><p className="page-kicker">CLASS ARTBOOK</p><h1 className="page-title">우리 반 작품집</h1>
        <p className="page-description">1년 동안 전시실에 걸린 작품을 반 전체 한 권 또는 학생별 한 권씩 PDF로 엮어요. 승인한 작품만 담고, 선생님만 만들고 받을 수 있어요.</p></div>
      {classes.length > 1 && <label className="cab-class">학급<select value={classId} disabled={busy} onChange={e => setClassId(e.target.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.year ? `${c.year} ` : ''}{c.name}</option>)}</select></label>}
    </header>
    {error && <p className="cab-error" role="alert">{error}</p>}
    {!classes.length && <p className="cab-empty">먼저 학급을 만들어 주세요.</p>}
    {loading && <p className="cab-status" role="status"><LoaderCircle className="spin" size={18}/> 전시실을 살펴보는 중이에요.</p>}
    {data && !data.rooms.length && !data.homeworkCount && !data.boardCount && <p className="cab-empty">열었거나 종료한 전시실이 아직 없어요. 작품전시에서 전시실을 열고 작품을 승인하면 여기에 모여요.</p>}

    {data && (!!data.rooms.length || !!data.homeworkCount || !!data.boardCount) && <>
      <section className="cab-step"><h2><span>1</span>누구의 작품집인가요?</h2>
        <div className="cab-modes">
          <button type="button" className={options.mode === 'class' ? 'on' : ''} aria-pressed={options.mode === 'class'} disabled={busy} onClick={() => set('mode', 'class')}><Users size={22}/><strong>반 전체 한 권</strong><small>우리 반 작품을 한 권에 모아요. 학급 문집이나 교실 보관용으로 좋아요.</small></button>
          <button type="button" className={options.mode === 'students' ? 'on' : ''} aria-pressed={options.mode === 'students'} disabled={busy} onClick={() => set('mode', 'students')}><BookOpen size={22}/><strong>학생별 한 권씩</strong><small>학생마다 자기 작품만 담은 책을 만들어 한 번에 받아요. 가정에 보내기 좋아요.</small></button>
        </div>
      </section>

      <section className="cab-step"><h2><span>2</span>어떤 전시를 담을까요?</h2>
        <div className="cab-row"><button type="button" className="button soft" disabled={busy} onClick={() => setRooms(data.rooms.filter(r => r.approved).map(r => r.id))}>모두 고르기</button><button type="button" className="button soft" disabled={busy} onClick={() => setRooms([])}>모두 빼기</button>
          <label>시작일<input type="date" value={from} disabled={busy} onChange={e => setFrom(e.target.value)}/></label><label>종료일<input type="date" value={to} disabled={busy} onChange={e => setTo(e.target.value)}/></label></div>
        {halls.map(([theme, list]) => <fieldset key={theme} className="cab-hall" disabled={busy}><legend>{HALLS[theme] ?? '전시관'} <small>전시실 {list.length}개</small></legend>
          {list.map(room => <label key={room.id} className={`cab-room${room.approved ? '' : ' empty'}`}><input type="checkbox" checked={rooms.includes(room.id)} disabled={!room.approved} onChange={e => setRooms(old => toggle(old, room.id, e.target.checked))}/>
            <span><strong>{room.title}</strong><small>{room.approved ? `승인 작품 ${room.approved}점${room.firstDate ? ` · ${room.firstDate === room.lastDate ? room.firstDate : `${room.firstDate} ~ ${room.lastDate}`}` : ''}` : '승인한 작품이 아직 없어요'}{room.unlinked > 0 && <em> · 학생 미지정 {room.unlinked}점</em>}</small></span></label>)}
        </fieldset>)}
        {data.truncated && <p className="cab-hint">전시실이 아주 많아 최근 것부터 일부만 보여요.</p>}
        {(!!data.homeworkCount || !!data.boardCount) && <fieldset className="cab-hall" disabled={busy}><legend>다른 곳의 사진도 <small>전시실에 이미 걸린 작품은 한 번만 실려요</small></legend>
          {!!data.homeworkCount && <label className="cab-room"><input type="checkbox" checked={homework} onChange={e => setHomework(e.target.checked)}/><span><strong>검사 완료한 숙제 사진</strong><small>숙제 {data.homeworkCount}개 · 검사 완료한 제출물의 사진과 글</small></span></label>}
          {!!data.boardCount && <label className="cab-room"><input type="checkbox" checked={board} onChange={e => setBoard(e.target.checked)}/><span><strong>참여보드에 올린 사진</strong><small>보드 {data.boardCount}개 · 공개된 학생 글의 사진과 글 · 익명 보드는 이름 없이 실려요</small></span></label>}
        </fieldset>}
        <div className="cab-row"><label className="cab-check"><input type="checkbox" checked={everyone} disabled={busy} onChange={e => setEveryone(e.target.checked)}/>우리 반 모두</label></div>
        {!everyone && <div className="cab-students">{data.students.map(s => <label key={s.id} className="cab-chip"><input type="checkbox" checked={students.includes(s.id)} disabled={busy} onChange={e => setStudents(old => toggle(old, s.id, e.target.checked))}/>{s.number ? `${s.number}. ` : ''}{s.name}<small>{s.works}점</small></label>)}</div>}
        {totals.unlinked > 0 && <p className="cab-hint">학생이 지정되지 않은 작품이 {totals.unlinked}점 있어요. {options.mode === 'students' ? '학생별 책에는 담기지 않아요. 작품전시의 작품 정보에서 학생을 지정하면 담겨요.' : '반 전체 책에는 아래 선택에 따라 함께 담을 수 있어요.'}</p>}
      </section>

      <section className="cab-step"><h2><span>3</span>어떻게 엮을까요?</h2>
        <div className="cab-fields">
          <label className="wide">표지 제목<input maxLength={80} value={options.title} disabled={busy} onChange={e => set('title', e.target.value)}/></label>
          <label>표지 색<select value={options.cover} disabled={busy} onChange={e => set('cover', e.target.value as ClassBookOptions['cover'])}><option value="sage">숲의 초록</option><option value="peach">따뜻한 복숭아</option><option value="sky">맑은 하늘</option></select></label>
          {options.mode === 'class' && <>
            <label>차례<select value={options.order} disabled={busy} onChange={e => set('order', e.target.value as ClassBookOptions['order'])}><option value="student">학생 번호순</option><option value="room">전시별</option><option value="date">날짜순</option></select></label>
            <label>한 쪽에<select value={options.perPage} disabled={busy} onChange={e => set('perPage', Number(e.target.value) as ClassBookOptions['perPage'])}><option value={1}>작품 1점 (크게)</option><option value={2}>작품 2점</option><option value={4}>작품 4점 (얇게)</option></select></label>
            <label>이름 표시<select value={options.names} disabled={busy} onChange={e => set('names', e.target.value as ClassBookOptions['names'])}><option value="name">번호와 이름</option><option value="number">번호만</option><option value="hidden">가리기</option></select></label>
            <label className="cab-check"><input type="checkbox" checked={options.story} disabled={busy} onChange={e => set('story', e.target.checked)}/>작품 이야기(아이가 쓴 글) 넣기</label>
            <label className="cab-check"><input type="checkbox" checked={options.feedback} disabled={busy} onChange={e => set('feedback', e.target.checked)}/>선생님 한마디 넣기</label>
            <label className="cab-check"><input type="checkbox" checked={options.unlinked} disabled={busy} onChange={e => set('unlinked', e.target.checked)}/>학생 미지정 작품도 넣기</label>
          </>}
          {options.mode === 'students' && <label>PDF 크기<select value={options.format} disabled={busy} onChange={e => set('format', e.target.value as ClassBookOptions['format'])}><option value="a4">A4 인쇄용</option><option value="mobile">휴대폰용</option></select></label>}
          <label className="wide">마지막 장에 남길 말<textarea maxLength={500} rows={3} value={options.dedication} disabled={busy} placeholder="그림마다 담긴 생각과 마음을 오래 간직해 주세요." onChange={e => set('dedication', e.target.value)}/></label>
        </div>
        {options.mode === 'class' && options.names !== 'hidden' && <p className="cab-hint">반 전체 책에는 다른 학생의 이름과 작품이 함께 들어 있어요. 가정에 보낼 때는 &quot;학생별 한 권씩&quot;이나 이름 가리기를 써 주세요.</p>}
        <div className="cab-row"><button type="button" className="button soft" disabled={!sourced || busy} onClick={() => void loadWorks()}><Images size={16}/>담길 작품 확인하고 빼기</button>{works && <span className="cab-hint">{worksTotal}점 가운데 {worksTotal - exclude.length}점을 담아요.</span>}</div>
        {works && (works.length ? <div className="cab-works">{works.map(w => <label key={w.key} className={`cab-work${exclude.includes(w.key) ? ' off' : ''}`}><input type="checkbox" checked={!exclude.includes(w.key)} disabled={busy} onChange={e => setExclude(old => toggle(old, w.key, !e.target.checked))}/>
          {w.thumbnailUrl ? <img loading="lazy" src={w.thumbnailUrl} alt=""/> : <i/>}<span><strong>{w.title}</strong><small>{[w.who, w.date, w.roomTitle].filter(Boolean).join(' · ')}</small></span></label>)}</div> : <p className="cab-empty">고른 전시와 기간에 맞는 승인 작품이 없어요.</p>)}
      </section>

      <section className="cab-step"><h2><span>4</span>만들기</h2>
        <p className="cab-summary">전시실 {rooms.length}개{homework ? ' + 숙제' : ''}{board ? ' + 보드' : ''} · {works || !(homework || board) ? `작품 약 ${Math.max(0, expected)}점` : '작품 수는 "담길 작품 확인"에서 볼 수 있어요'} · {options.mode === 'class' ? '반 전체 한 권' : '학생별 한 권씩'}</p>
        {expected > CLASS_BOOK_LIMIT && <p className="cab-error">한 번에 {CLASS_BOOK_LIMIT}점까지 만들 수 있어요. 전시나 기간을 나누어 주세요.</p>}
        <button type="button" className="button primary cab-make" disabled={!canMake || (works || !(homework || board) ? expected <= 0 : false) || expected > CLASS_BOOK_LIMIT} onClick={() => void create()}>{busy ? <LoaderCircle className="spin" size={18}/> : <BookOpen size={18}/>}작품집 만들기</button>
        <p className="cab-hint">작품이 많으면 몇 분 걸려요. 이 화면을 닫으면 그 단계에서 멈추고, 다시 열어 &quot;이어서 만들기&quot;를 누르면 이어져요.</p>
      </section>

      <section className="cab-step" id="cab-saved"><h2><span><Check size={15}/></span>만든 작품집</h2>
        <p className="cab-hint">{keep.limit}개까지 보관하고, 만든 날부터 {keep.keepDays}일 뒤에는 자동으로 지워져요. 받은 파일은 지워지지 않아요.</p>
        {!jobs.length && <p className="cab-empty">아직 만든 작품집이 없어요.</p>}
        {jobs.map(job => <article key={job.id} className="cab-job">
          <div><strong>{job.title}</strong><small>{job.mode === 'class' ? '반 전체' : '학생별'} · {stage(job)} · {new Date(job.createdAt).toLocaleDateString('ko-KR')}{job.size > 0 && ` · ${megabytes(job.size)}`}</small>
            <progress max={100} value={progress(job)} aria-label="작품집 만들기 진행률"/>
            {job.error && <p className="cab-error" role="status">{job.error}</p>}
            {!!job.skipped.length && <details><summary>담지 못한 작품 {job.skipped.length}점</summary><ul>{job.skipped.map((s, i) => <li key={i}>{s.title} — {s.reason}</li>)}</ul></details>}</div>
          <div className="cab-row">
            {job.status === 'ready' ? <button type="button" className="button primary" disabled={busy} onClick={() => void download(job)}><Download size={16}/>{job.fileName.endsWith('.zip') ? 'ZIP 받기' : 'PDF 받기'}</button>
              : job.status !== 'deleting' && <button type="button" className="button soft" disabled={busy || job.busy} onClick={() => void act(() => run(job))}><RefreshCw size={16}/>이어서 만들기</button>}
            <button type="button" className="icon-button" disabled={busy || job.busy} aria-label={`${job.title} 작품집 지우기`} onClick={() => remove(job)}><Trash2 size={17}/></button>
          </div>
        </article>)}
      </section>
    </>}
  </main>;
}
