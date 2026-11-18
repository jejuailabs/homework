'use client';
import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {ExternalLink, LoaderCircle, Plus, Send, Sparkles, Trash2, Undo2} from 'lucide-react';
import type {CategoryRef} from '@/lib/blog-writer';
import type {PostRow, TopicRow} from './publisher';
import './blog-admin.css';

type State = {topics: TopicRow[]; posts: PostRow[]; publishedToday: number; categories: CategoryRef[]; week: string};
const sectionName = {manual: '사용설명서', tips: '업무 Tip'} as Record<string, string>;
const statusName: Record<string, string> = {proposed: '대기', publishing: '작성 중', published: '발행됨', failed: '보류'};

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/blog/${path}`, {cache: 'no-store', ...(body !== undefined ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || '처리하지 못했어요.'), {problems: data.problems as string[] | undefined});
  return data as T;
}

export default function BlogAdminPanel({revision = 0}: {revision?: number}) {
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string>(''), [adding, setAdding] = useState(false);
  const load = useCallback(async () => {try {setState(await call<State>('state')); setError('');} catch (e) {setError((e as Error).message);}}, []);
  useEffect(() => {void load();}, [load, revision]);

  async function run(key: string, path: string, body: unknown, done: (r: Record<string, unknown>) => string) {
    setBusy(key); setNotice(''); setError('');
    try {const r = await call<Record<string, unknown>>(path, body); setNotice(done(r));}
    catch (e) {const problems = (e as {problems?: string[]}).problems; setError((e as Error).message + (problems?.length ? ` — ${problems.join(' / ')}` : ''));}
    finally {setBusy(''); await load();}
  }

  async function addTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), [section, category] = String(form.get('category')).split(':');
    await run('add', 'topics', {title: form.get('title'), keyword: form.get('keyword'), section, category}, () => '제목을 추가했어요.');
    setAdding(false);
  }

  if (!state) return <div className="content-card">{error ? <p role="alert" className="error-message">{error}</p> : <p className="admin-loading"><LoaderCircle className="spin" size={18}/> 불러오는 중…</p>}</div>;
  const waiting = state.topics.filter(t => t.status !== 'published');
  const live = state.posts.filter(p => p.status === 'published').length;
  const categoryName = (t: {section: string; category: string}) => state.categories.find(c => c.section === t.section && c.id === t.category)?.name ?? t.category;

  return (
    <div className="blog-admin">
      <div className="admin-stat-grid">
        <div className="admin-stat"><small>발행 대기 제목</small><b>{waiting.filter(t => t.status === 'proposed').length}</b></div>
        <div className="admin-stat"><small>오늘 발행</small><b>{state.publishedToday}</b></div>
        <div className="admin-stat"><small>공개 중인 AI 글</small><b>{live}</b></div>
        <div className="admin-stat"><small>이번 주</small><b>{state.week}</b></div>
      </div>
      <p className="blog-admin-hint">[발행]을 누르면 글과 대표 이미지를 만들고, 검색 기준(제목·설명·소제목·검색어 횟수·FAQ·관련 글)을 통과하면 바로 공개합니다. 1~2분 걸립니다. 검색엔진이 자연스럽게 받아들이도록 하루 2~3편씩 나눠 발행하세요.</p>
      {notice && <p role="status" className="inline-note">{notice}</p>}
      {error && <p role="alert" className="error-message">{error}</p>}

      <section className="content-card">
        <div className="blog-admin-head">
          <h2>발행할 제목 <small>{waiting.length}개</small></h2>
          <div>
            <button className="button" disabled={!!busy} onClick={() => setAdding(!adding)}><Plus size={15}/>직접 추가</button>
            <button className="button primary" disabled={!!busy} onClick={() => run('generate', 'topics/generate', {}, r => `새 제목 ${r.created}개를 만들었어요.`)}>
              {busy === 'generate' ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>}제목 20개 뽑기
            </button>
          </div>
        </div>
        {adding && (
          <form className="blog-admin-add" onSubmit={addTopic}>
            <input name="title" required minLength={8} maxLength={60} placeholder="제목 (예: 숙제 검사 어려우시죠? AI 비서 베리에게 맡기세요)"/>
            <input name="keyword" required minLength={2} maxLength={30} placeholder="핵심 검색어 (예: 숙제 검사)"/>
            <select name="category" required defaultValue="">
              <option value="" disabled>분류 고르기</option>
              {state.categories.map(c => <option key={c.section + c.id} value={`${c.section}:${c.id}`}>{sectionName[c.section]} · {c.name}</option>)}
            </select>
            <button className="button primary" disabled={!!busy}>추가</button>
          </form>
        )}
        {waiting.length === 0 ? <p className="admin-empty">대기 중인 제목이 없어요. [제목 20개 뽑기]를 눌러 보세요.</p> : (
          <ul className="blog-admin-list">
            {waiting.map(t => (
              <li key={t.id} className={`is-${t.status}`}>
                <div>
                  <small><span className="blog-chip">{sectionName[t.section]}</span>{categoryName(t)} · 검색어 “{t.keyword}” · {t.batch}{t.status !== 'proposed' && <b className="blog-status"> · {statusName[t.status]}</b>}</small>
                  <b>{t.title}</b>
                  {t.status === 'failed' && <p className="blog-problems">{t.error}{t.problems?.length ? ` — ${t.problems.join(' / ')}` : ''}</p>}
                </div>
                <div className="blog-admin-actions">
                  <button className="button primary" disabled={!!busy || t.status === 'publishing'} onClick={() => run(t.id, `topics/${t.id}/publish`, {}, r => `발행했어요: ${r.path}${r.image ? '' : ' (대표 이미지는 기능 화면으로 대신했어요)'}`)}>
                    {busy === t.id || t.status === 'publishing' ? <><LoaderCircle className="spin" size={15}/>작성 중</> : <><Send size={15}/>{t.status === 'failed' ? '다시 발행' : '발행'}</>}
                  </button>
                  <button className="button" aria-label="버리기" disabled={!!busy || t.status === 'publishing'} onClick={() => run('discard' + t.id, `topics/${t.id}/discard`, {}, () => '제목을 버렸어요.')}><Trash2 size={15}/></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="content-card">
        <div className="blog-admin-head"><h2>발행한 글 <small>{state.posts.length}편</small></h2></div>
        {state.posts.length === 0 ? <p className="admin-empty">아직 발행한 글이 없어요.</p> : (
          <ul className="blog-admin-list">
            {state.posts.map(p => (
              <li key={p.slug} className={p.status === 'published' ? '' : 'is-off'}>
                {p.image ? <img src={p.image} alt="" loading="lazy"/> : <span className="blog-thumb"/>}
                <div>
                  <small><span className="blog-chip">{sectionName[p.section]}</span>{categoryName(p)} · {p.published}{p.status !== 'published' && <b className="blog-status"> · 내림</b>}</small>
                  <b>{p.title}</b>
                </div>
                <div className="blog-admin-actions">
                  <a className="button" href={p.path} target="_blank" rel="noreferrer"><ExternalLink size={15}/>보기</a>
                  {p.status === 'published'
                    ? <button className="button" disabled={!!busy} onClick={() => run('off' + p.slug, `posts/${p.slug}/unpublish`, {}, () => '글을 내렸어요. 검색 결과에서도 차례로 빠집니다.')}><Undo2 size={15}/>내리기</button>
                    : <button className="button" disabled={!!busy} onClick={() => run('on' + p.slug, `posts/${p.slug}/republish`, {}, () => '다시 공개했어요.')}><Send size={15}/>다시 공개</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
