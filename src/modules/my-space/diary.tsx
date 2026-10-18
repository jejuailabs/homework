'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, Plus, Trash2, Type } from 'lucide-react';
import { spaceCatalog, type DiaryPage, type DiaryLayer } from './catalog';
import { spaceRequest } from './client';
import Scene, { ItemArt } from './scene';
import { useDraft } from './use-draft';
import { preparePhoto } from './photo';
import { SaveStatus, LayerTools } from './editor-tools';
type Photo = {
    id: string;
    url: string;
    status?: string;
};
type Work = {
    id: string;
    title: string;
    url: string;
};
function DiaryEditor({ page, owned, enabled, onSaved, onBack }: {
    page: DiaryPage;
    owned: string[];
    enabled: boolean;
    onSaved: (page: DiaryPage) => void;
    onBack: () => void;
}) {
    const editor = useDraft(page, async (value) => { const r = await spaceRequest<{
        page: DiaryPage;
    }>('/diary/' + page.id, 'PUT', value); onSaved(r.page); return r.page; }, enabled), [selected, setSelected] = useState(''), [photos, setPhotos] = useState<Photo[]>([]), [works, setWorks] = useState<Work[]>([]), [artCursor, setArtCursor] = useState(''), [error, setError] = useState(''), [uploading, setUploading] = useState(false), input = useRef<HTMLInputElement>(null), d = editor.draft;
    async function loadPhotos() { setPhotos((await spaceRequest<{
        photos: Photo[];
    }>('/images')).photos); }
    async function loadArt(cursor = '') { const value = await spaceRequest<{
        works: Work[];
        cursor: string;
    }>('/art?cursor=' + encodeURIComponent(cursor)); setWorks(old => cursor ? [...old, ...value.works] : value.works); setArtCursor(value.cursor); }
    useEffect(() => { void Promise.all([loadPhotos(), loadArt()]).catch(e => setError(e.message)); }, []);
    function add(kind: DiaryLayer['kind'], itemId = '', assetId = '') { if (!enabled || d.layers.length >= 50)
        return; const id = crypto.randomUUID(), n = d.layers.filter(l => l.kind === kind).length % 3, anchor = kind === 'text' ? [50, 18] : kind === 'sticker' ? [80, 30] : kind === 'photo' ? [32, 48] : [68, 73]; editor.edit({ ...d, layers: [...d.layers, { id, kind, itemId, x: anchor[0] - n * 4, y: anchor[1] + n * 4, size: kind === 'text' ? 60 : kind === 'sticker' ? 18 : 40, rotation: 0, flip: false, ...(kind === 'text' ? { text: '오늘 나의 작은 발견', color: '#355147' } : {}), ...(['photo', 'art'].includes(kind) ? { assetId } : {}) }] }); setSelected(id); }
    async function upload(file: File) { if (uploading)
        return; setUploading(true); setError(''); try {
        const prepared = await preparePhoto(file);
        const r = await fetch('/api/my-space/images/' + crypto.randomUUID(), { method: 'POST', headers: { 'Content-Type': prepared.type }, body: prepared });
        const data = await r.json();
        if (!r.ok)
            throw new Error(data.error);
        await loadPhotos();
        add('photo', '', data.id);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setUploading(false);
        void loadPhotos().catch(() => { });
    } }
    const active = d.layers.find(l => l.id === selected);
    return <><div className="ms-actions"><button disabled={editor.saving || uploading} onClick={() => void (async () => { if (await editor.flush())
        onBack(); })()}><ArrowLeft size={15}/>노트 목록</button><span className="ms-private">나만 보는 비밀 노트</span></div><SaveStatus editor={editor} onReload={() => { if (confirm('저장하지 않은 내용을 내려놓고 다시 불러올까요?')) {
        editor.discard();
        location.reload();
    } }}/><fieldset className="ms-diary-meta" disabled={!enabled}><label>제목<input maxLength={60} value={d.title} onChange={e => editor.edit({ ...d, title: e.target.value })}/></label><label>날짜<input type="date" value={d.date} onChange={e => editor.edit({ ...d, date: e.target.value })}/></label><label>노트 종이<select aria-label="노트 종이" value={d.paper} onChange={e => editor.edit({ ...d, paper: e.target.value })}>{spaceCatalog.filter(i => i.kind === 'paper' && owned.includes(i.id)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label></fieldset><div className="ms-room-layout"><div><Scene onGestureStart={editor.begin} onGestureEnd={editor.end} diary paper={d.paper} layers={d.layers} selected={selected} onSelect={setSelected} onChange={layers => editor.edit({ ...d, layers })} disabled={!enabled}/><LayerTools layers={d.layers} selected={selected} onChange={layers => editor.edit({ ...d, layers })} disabled={!enabled}/>{active?.kind === 'text' && <label>선택한 글 조각<textarea aria-label="선택한 글 조각" value={active.text} maxLength={300} rows={3} disabled={!enabled} onChange={e => editor.edit({ ...d, layers: d.layers.map(l => l.id === active.id ? { ...l, text: e.target.value } : l) })}/><input type="color" value={active.color || '#355147'} disabled={!enabled} onChange={e => editor.edit({ ...d, layers: d.layers.map(l => l.id === active.id ? { ...l, color: e.target.value } : l) })} aria-label="글자 색"/></label>}</div><aside className="ms-inventory"><h2>오늘의 조각 붙이기</h2><div className="ms-actions"><button disabled={!enabled} onClick={() => add('text')}><Type size={16}/>글 쓰기</button><button disabled={!enabled || uploading} onClick={() => input.current?.click()}><ImagePlus size={16}/>{uploading ? '사진 보관 중…' : '사진 올리기'}</button><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f)
        void upload(f); e.target.value = ''; }}/></div><p className="ms-hint">사진은 JPG·PNG·WebP, 8MB까지. 내 사진 40장까지 보관해요.</p><div className="ms-tiles ms-sticker-tray">{spaceCatalog.filter(i => i.kind === 'sticker' && owned.includes(i.id)).map(i => <button key={i.id} disabled={!enabled} aria-label={i.name + ' 붙이기'} onClick={() => add('sticker', i.id)}><ItemArt id={i.id}/><span>{i.name}</span></button>)}</div><h3>내 사진 상자</h3><div className="ms-photo-tray">{photos.map(p => <div key={p.id}><button disabled={!enabled || p.status !== 'ready'} onClick={() => add('photo', '', p.id)} aria-label="내 사진 붙이기">{p.url ? <img src={p.url} alt="내 사진"/> : <span>미완료 사진</span>}</button><button disabled={!enabled} aria-label="사진 보관함에서 삭제" onClick={() => void (async () => { try {
        await spaceRequest('/images/' + p.id, 'DELETE');
        await loadPhotos();
    }
    catch (e) {
        setError((e as Error).message);
    } })()}><Trash2 size={13}/></button></div>)}</div><h3>내 전시 작품</h3><div className="ms-tiles">{works.map(w => <button key={w.id} disabled={!enabled} onClick={() => add('art', '', w.id)}><img src={w.url} alt=""/><span>{w.title}</span></button>)}</div>{artCursor && <button onClick={() => void loadArt(artCursor).catch(e => setError(e.message))}>작품 더 보기</button>}<p className="ms-hint">스티커는 여러 번 붙여도 보말이 들지 않아요. 노트당 50조각까지 꾸밀 수 있어요.</p></aside></div>{error && <p className="ms-error" role="alert">{error}</p>}</>;
}
export default function Diary({ owned, enabled }: {
    owned: string[];
    enabled: boolean;
}) {
    const [pages, setPages] = useState<DiaryPage[]>([]), [cursor, setCursor] = useState(''), [selected, setSelected] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function load(cursor = '') { const r = await spaceRequest<{
        pages: DiaryPage[];
        cursor: string;
    }>('/diary?cursor=' + encodeURIComponent(cursor)); setPages(old => cursor ? [...old, ...r.pages] : r.pages); setCursor(r.cursor); }
    useEffect(() => { void load().catch(e => setError(e.message)); }, []);
    async function create() { if (busy)
        return; setBusy(true); setError(''); try {
        const id = crypto.randomUUID(), r = await spaceRequest<{
            page: DiaryPage;
        }>('/diary/' + id, 'PUT', { version: 0, title: '오늘의 작은 이야기', date: new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10), paper: 'paper-cream', layers: [] });
        setPages(old => [r.page, ...old]);
        setSelected(id);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    const page = pages.find(p => p.id === selected);
    if (page)
        return <DiaryEditor key={page.id} page={page} owned={owned} enabled={enabled} onSaved={value => setPages(old => old.map(p => p.id === value.id ? value : p))} onBack={() => setSelected('')}/>;
    return <section><div className="ms-section-intro"><h2>토리의 다꾸 노트</h2><p>한 줄의 발견도, 그림 한 조각도. 오늘의 나를 예쁘게 남겨요.</p><button className="ms-primary" disabled={!enabled || busy} onClick={() => void create()}><Plus size={17}/>새 노트 펼치기</button></div>{error && <p role="alert" className="ms-error">{error}</p>}<div className="ms-diary-grid">{pages.map(p => <article key={p.id}><button className={'ms-note-cover ' + p.paper} onClick={() => setSelected(p.id)}><span>MY LITTLE STORY</span><strong>{p.title}</strong><small>{p.date}</small><span aria-hidden="true">✿</span></button><button className="ms-note-delete" disabled={!enabled} aria-label={p.title + ' 삭제'} onClick={() => { if (confirm('이 노트를 삭제할까요? 사진 보관함의 원본은 남아요.'))
        void spaceRequest('/diary/' + p.id + '?version=' + p.version, 'DELETE').then(() => load()).catch(e => setError(e.message)); }}><Trash2 size={15}/></button></article>)}</div>{!pages.length && <div className="ms-empty"><img src="/characters/rabbit-tori.webp" alt=""/><p>아직 빈 노트예요. 토리와 첫 이야기를 적어 볼까요?</p></div>}{cursor && <button onClick={() => void load(cursor).catch(e => setError(e.message))}>노트 더 보기</button>}</section>;
}
