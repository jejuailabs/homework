'use client';

import {useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import Link from 'next/link';
import {useLocale, useTranslations} from 'next-intl';
import {Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, Copy, Download, Eye, EyeOff, FolderOpen, GripVertical, Heart, History, LayoutGrid, Lightbulb, List, LockKeyhole, MapPin, MessageCircle, MoreHorizontal, Pencil, Pin, Plus, RefreshCw, Search, Settings2, Share2, Sparkles, Star, ThumbsUp, Trash2, Users, X} from 'lucide-react';
import type {BoardDetailResponse, BoardListResponse, BoardPoll, BoardPost, BoardReaction, BoardSettingsInput, BoardStatus, ParticipationBoard} from '@/lib/participation-types';
import type {Character} from '@/lib/characters';
import {AttachmentView, BoardDialog, BoardRequestError, Friend, Loading, boardRequest, layoutIcons, requestId} from './participation-shared';
import ParticipationComposer from './participation-composer';
import {useVerifiedViewer} from './viewer-context';
import {BoardSettingsDialog, BoardShareDialog, CommentsDialog, CreateBoardDialog, HistoryDialog} from './participation-panels';
import '@/styles/participation.css';

type Role = 'teacher' | 'student';
type ComposerTarget = {post?: BoardPost; sectionId?: string};
type Participant = {id: string; name: string; number: number; character: Character; postCount: number; commentCount: number};
const reactionIcons = {heart: Heart, star: Star, clap: ThumbsUp, idea: Lightbulb};

export default function ParticipationWorkspace({role}: {role: Role}) {
  const t = useTranslations('participation'), locale = useLocale(), router = useRouter(), path = usePathname(), teacher = role === 'teacher';
  const {setVerifiedViewer, clearViewer} = useVerifiedViewer();
  const [home, setHome] = useState<BoardListResponse | null>(null), [boardId, setBoardId] = useState(''), [classId, setClassId] = useState('');
  const [detail, setDetail] = useState<BoardDetailResponse | null>(null), [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false), [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [forbidden, setForbidden] = useState(false), [listSearch, setListSearch] = useState(''), [search, setSearch] = useState('');
  const [folder, setFolder] = useState<'all' | BoardStatus>('all'), [filter, setFilter] = useState<'all' | 'mine' | 'pending' | 'hidden'>('all'), [sort, setSort] = useState<ParticipationBoard['sort']>('manual');
  const [modal, setModal] = useState<'create' | 'settings' | 'share' | 'section' | 'participants' | null>(null), [composer, setComposer] = useState<ComposerTarget | null>(null), [commentsPostId, setCommentsPostId] = useState(''), [historyPostId, setHistoryPostId] = useState('');
  const [sectionTitle, setSectionTitle] = useState(''), [editingSection, setEditingSection] = useState(''), [busy, setBusy] = useState(false), [participants, setParticipants] = useState<Participant[] | null>(null);
  const activeBoard = useRef(''), activeClass = useRef(''), listSequence = useRef(0), detailSequence = useRef(0), detailFetching = useRef(false), initialized = useRef(false), drag = useRef<{id: string; offsetX: number; offsetY: number} | null>(null);
  const viewerActive = useRef(false);
  useEffect(() => {
    viewerActive.current = true;
    const invalidate = () => {viewerActive.current = false; listSequence.current++; detailSequence.current++; clearViewer();};
    window.addEventListener('homework-session-ended', invalidate);
    return () => {window.removeEventListener('homework-session-ended', invalidate); invalidate();};
  }, [path, clearViewer]);
  const publishViewer = useCallback((data: BoardListResponse | BoardDetailResponse) => {
    if (viewerActive.current && window.location.pathname === path && data.viewerRole === role && typeof data.viewerId === 'string' && data.viewerId) {
      setVerifiedViewer({uid: data.viewerId, role: data.viewerRole}, path);
    }
  }, [path, role, setVerifiedViewer]);
  const copy = useRef(t); copy.current = t;
  const detailRef = useRef<BoardDetailResponse | null>(null), loadedPages = useRef(1), lastFullRead = useRef(0); detailRef.current = detail;
  const board = detail?.board, viewerId = detail?.viewerId || home?.viewerId || role;
  const handleError = useCallback((cause: unknown) => {
    clearViewer();
    if (cause instanceof BoardRequestError && [401, 403, 404].includes(cause.status)) {
      listSequence.current++; detailSequence.current++; detailFetching.current = false; activeBoard.current = '';
      setDetail(null); setHome(null); setComposer(null); setCommentsPostId(''); setHistoryPostId(''); setModal(null); setBoardId(''); setLoading(false); setDetailLoading(false); setMoreLoading(false); setForbidden(true);
      if (cause.status === 401) router.replace(`/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      setError(copy.current(cause.status === 404 ? 'boardUnavailable' : cause.status === 401 ? 'session' : 'forbidden')); return;
    }
    setError(copy.current(cause instanceof BoardRequestError && cause.status === 404 ? 'boardUnavailable' : 'error'));
  }, [router, clearViewer]);
  const loadHome = useCallback(async (targetClass = activeClass.current, append = false, cursor?: string | null) => {
    const sequence = ++listSequence.current; if (!append) setLoading(true); else setMoreLoading(true);
    const query = new URLSearchParams(); if (targetClass) query.set('classId', targetClass); if (append && cursor) query.set('cursor', cursor);
    try {
      const result = await boardRequest<BoardListResponse>(`/api/boards${query.size ? `?${query}` : ''}`);
      if (!viewerActive.current || window.location.pathname !== path || sequence !== listSequence.current || activeClass.current !== targetClass) return;
      if (result.viewerRole !== role) {clearViewer();router.replace(`/${result.viewerRole}/boards${activeBoard.current ? `?board=${encodeURIComponent(activeBoard.current)}` : ''}`); return;}
      publishViewer(result);
      setHome(previous => append && previous ? {...result, boards: [...new Map([...previous.boards, ...result.boards].map(item => [item.id, item])).values()]} : result); setError(''); setForbidden(false);
    } catch (cause) {if (sequence === listSequence.current) handleError(cause);} finally {if (sequence === listSequence.current) {setLoading(false); setMoreLoading(false);}}
  }, [handleError, role, router, path, publishViewer, clearViewer]);
  const loadDetail = useCallback(async (id: string, showLoading = false, append = false, cursor?: string | null, conditional = false) => {
    if (!id) return; const sequence = ++detailSequence.current; detailFetching.current = true;
    if (showLoading) setDetailLoading(true); if (append) setMoreLoading(true);
    try {
      const before = detailRef.current?.board.id === id ? detailRef.current : null;
      const query = new URLSearchParams();
      if (append && cursor) query.set('cursor', cursor);
      else if (conditional && before && Date.now() - lastFullRead.current < 10 * 60 * 1000) query.set('since', before.board.updatedAt);
      let result = await boardRequest<BoardDetailResponse>(`/api/boards/${encodeURIComponent(id)}${query.size ? `?${query}` : ''}`);
      if (!viewerActive.current || window.location.pathname !== path || sequence !== detailSequence.current || activeBoard.current !== id) return;
      if (!result.unchanged && !append) {
        const targetPages = showLoading ? 1 : loadedPages.current;
        let fetchedPages = 1;
        while (result.nextCursor && fetchedPages < targetPages && sequence === detailSequence.current && activeBoard.current === id) {
          const next = await boardRequest<BoardDetailResponse>(`/api/boards/${encodeURIComponent(id)}?cursor=${encodeURIComponent(result.nextCursor)}`);
          result = {...result, posts: [...result.posts, ...next.posts], nextCursor: next.nextCursor}; fetchedPages++;
        }
        if (sequence !== detailSequence.current || activeBoard.current !== id) return;
        loadedPages.current = fetchedPages; lastFullRead.current = Date.now();
      } else if (append) loadedPages.current++;

      if (!viewerActive.current || window.location.pathname !== path || sequence !== detailSequence.current || activeBoard.current !== id) return;
      if (result.viewerRole !== role) {clearViewer();router.replace(`/${result.viewerRole}/boards?board=${encodeURIComponent(id)}`); return;}
      publishViewer(result);
      setDetail(previous => result.unchanged && previous?.board.id === id ? {...previous, board: result.board} : append && previous?.board.id === id ? {...result, posts: [...new Map([...previous.posts, ...result.posts].map(item => [item.id, item])).values()]} : result); setError(''); setForbidden(false);
      if (showLoading) setSort(result.board.sort);
      setHome(previous => previous ? {...previous, boards: previous.boards.map(item => item.id === id ? result.board : item)} : previous);
    } catch (cause) {if (sequence === detailSequence.current && activeBoard.current === id) handleError(cause);} finally {if (sequence === detailSequence.current) {setDetailLoading(false); setMoreLoading(false); detailFetching.current = false;}}
  }, [handleError, role, router, path, publishViewer, clearViewer]);
  useEffect(() => {
    const sync = () => {
      const query = new URLSearchParams(window.location.search), requestedBoard = query.get('board') || '', requestedClass = query.get('classId') || '';
      const id = /^[a-zA-Z0-9_-]{1,200}$/.test(requestedBoard) ? requestedBoard : '';
      const room = /^[a-zA-Z0-9_-]{1,200}$/.test(requestedClass) ? requestedClass : '';
      activeBoard.current = id; activeClass.current = room; setBoardId(id); setClassId(room); setDetail(null); setCommentsPostId(''); setHistoryPostId(''); setComposer(null); setModal(null); setSearch(''); setFilter('all');
      if (!initialized.current || !id) {initialized.current = true; void loadHome(room);}
    };
    sync(); window.addEventListener('popstate', sync); return () => {window.removeEventListener('popstate', sync); listSequence.current++; detailSequence.current++;};
  }, [loadHome]);
  useEffect(() => {if (boardId) void loadDetail(boardId, true);}, [boardId, loadDetail]);
  useEffect(() => {
    if (!boardId) return;
    const refresh = () => {if (document.visibilityState === 'visible' && !detailFetching.current && !composer && !busy) void loadDetail(boardId, false, false, null, true);};
    const interval = setInterval(refresh, 20000); document.addEventListener('visibilitychange', refresh);
    return () => {clearInterval(interval); document.removeEventListener('visibilitychange', refresh);};
  }, [boardId, loadDetail, composer, busy]);
  useEffect(() => {if (!notice) return; const timeout = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timeout);}, [notice]);
  function navigate(id: string) {
    detailSequence.current++; detailFetching.current = false; loadedPages.current = 1; activeBoard.current = id; setBoardId(id); setDetail(null); setError(''); setForbidden(false); setModal(null); setComposer(null); setCommentsPostId(''); setHistoryPostId(''); setSearch(''); setFilter('all');
    const query = new URLSearchParams(); if (id) query.set('board', id); if (activeClass.current) query.set('classId', activeClass.current);
    window.history.pushState({}, '', `${window.location.pathname}${query.size ? `?${query}` : ''}`);
    if (!id) {setDetailLoading(false); void loadHome();} else setDetailLoading(true);
  }
  function changeClass(value: string) {
    activeClass.current = value; setClassId(value); setHome(previous => previous ? {...previous, boards: []} : previous);
    window.history.replaceState({}, '', `${window.location.pathname}${value ? `?classId=${encodeURIComponent(value)}` : ''}`); void loadHome(value);
  }
  function applyBoard(next: ParticipationBoard) {
    setDetail(previous => previous?.board.id === next.id ? {...previous, board: next} : previous);
    setHome(previous => previous ? {...previous, boards: previous.boards.some(item => item.id === next.id) ? previous.boards.map(item => item.id === next.id ? next : item) : [next, ...previous.boards]} : previous);
  }
  function applyPost(next: BoardPost) {
    if (activeBoard.current !== next.boardId) return;
    setDetail(previous => previous?.board.id === next.boardId ? {...previous, posts: previous.posts.some(post => post.id === next.id) ? previous.posts.map(post => post.id === next.id ? next : post) : [...previous.posts, next]} : previous);
  }
  async function patchBoard(patch: BoardSettingsInput) {
    if (!board || busy) return; setBusy(true); setError('');
    try {const result = await boardRequest<{board: ParticipationBoard}>(`/api/boards/${board.id}`, {method: 'PATCH', body: JSON.stringify(patch)}); applyBoard(result.board); setNotice(t('saved')); return result.board;} catch {setError(t('saveError'));} finally {setBusy(false);}
  }
  async function patchPost(post: BoardPost, patch: Partial<BoardPost>) {
    const result = await boardRequest<{post: BoardPost}>(`/api/boards/${post.boardId}/posts/${post.id}`, {method: 'PATCH', body: JSON.stringify({...patch, version: post.version})}); applyPost(result.post);
  }
  const posts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return (detail?.posts || []).filter(post => (!query || `${post.title} ${post.body} ${post.author.name} ${post.attachments.map(file => file.name).join(' ')}`.toLocaleLowerCase(locale).includes(query)) && (filter === 'all' || filter === 'mine' ? filter !== 'mine' || post.author.isMe : post.status === filter)).sort((left, right) => Number(right.pinned) - Number(left.pinned) || (sort === 'manual' ? left.order - right.order || left.createdAt.localeCompare(right.createdAt) : sort === 'oldest' ? left.createdAt.localeCompare(right.createdAt) : right.createdAt.localeCompare(left.createdAt)));
  }, [detail?.posts, filter, search, sort, locale]);
  const filteredBoards = (home?.boards || []).filter(item => (folder === 'all' ? item.status !== 'archived' : item.status === folder) && (!listSearch.trim() || `${item.title} ${item.description} ${item.className}`.toLocaleLowerCase(locale).includes(listSearch.trim().toLocaleLowerCase(locale))));
  const canReorder = !!board?.canManage && !detail?.nextCursor && sort === 'manual' && !search && filter === 'all';
  async function reorder(postId: string, targetId?: string, section?: string, coordinates?: {x: number; y: number}) {
    if (!board || !canReorder || busy) return;
    const original = detail?.posts || [], item = original.find(post => post.id === postId); if (!item) return;
    const ordered = [...original].sort((left, right) => left.order - right.order).filter(post => post.id !== postId), target = targetId ? ordered.findIndex(post => post.id === targetId) : ordered.length;
    ordered.splice(target < 0 ? ordered.length : target, 0, {...item, ...(section !== undefined ? {sectionId: section} : {}), ...coordinates});
    const moved = ordered.map((post, order) => ({...post, order}));
    setDetail(previous => previous?.board.id === board.id ? {...previous, posts: moved} : previous); setBusy(true);
    try {await boardRequest(`/api/boards/${board.id}/reorder`, {method: 'POST', body: JSON.stringify({posts: moved.map(post => ({id: post.id, order: post.order, sectionId: board.sections.some(item => item.id === post.sectionId) ? post.sectionId : '', x: post.x, y: post.y}))})});}
    catch {if (activeBoard.current === board.id) {setDetail(previous => previous ? {...previous, posts: original} : previous); setError(t('saveError'));}} finally {setBusy(false);}
  }
  async function moveRelative(post: BoardPost, direction: -1 | 1) {
    const ordered = (detail?.posts || []).slice().sort((left, right) => left.order - right.order); const index = ordered.findIndex(item => item.id === post.id);
    if (index + direction < 0 || index + direction >= ordered.length) return;
    if (direction === -1) await reorder(post.id, ordered[index - 1].id, post.sectionId);
    else await reorder(post.id, ordered[index + 2]?.id, post.sectionId);
  }
  function drop(event: DragEvent, targetId?: string, section?: string) {
    event.preventDefault(); event.stopPropagation(); const data = drag.current; if (!data || !board) return;
    let coordinates: {x: number; y: number} | undefined;
    if (board.layout === 'freeform' && !targetId) {const bounds = event.currentTarget.getBoundingClientRect(); coordinates = {x: Math.max(0, Math.round(event.clientX - bounds.left - data.offsetX)), y: Math.max(0, Math.round(event.clientY - bounds.top - data.offsetY))};}
    void reorder(data.id, targetId, section, coordinates); drag.current = null;
  }
  async function removePost(post: BoardPost) {
    if (!window.confirm(t('deleteConfirm'))) return;
    await boardRequest(`/api/boards/${post.boardId}/posts/${post.id}`, {method: 'DELETE'});
    setDetail(previous => previous?.board.id === post.boardId ? {...previous, posts: previous.posts.filter(item => item.id !== post.id)} : previous);
  }
  function exportCsv() {
    if (!detail) return;
    const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
    const rows = [[t('postTitle'), t('content'), t('author'), t('section'), t('status'), t('created')], ...detail.posts.map(post => [post.title, post.body, post.author.name, board?.sections.find(section => section.id === post.sectionId)?.title || '', t(post.status), post.createdAt])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${detail.board.title.replace(/[<>:"/\\|?*]/g, '_')}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function duplicateBoard() {
    if (!board) return; const result = await boardRequest<{board: ParticipationBoard}>(`/api/boards/${board.id}/duplicate`, {method: 'POST', body: JSON.stringify({requestId: requestId(), title: t('duplicateTitle', {title: board.title})})}); applyBoard(result.board); navigate(result.board.id);
  }
  async function openParticipants() {
    if (!board) return; setParticipants(null); setModal('participants'); const id = board.id;
    try {const result = await boardRequest<{students: Participant[]}>(`/api/boards/${id}/participants`); if (activeBoard.current === id) setParticipants(result.students);} catch {setError(t('error'));}
  }
  function openSection(id = '') {setEditingSection(id); setSectionTitle(board?.sections.find(section => section.id === id)?.title || ''); setModal('section');}
  const commentPost = detail?.posts.find(post => post.id === commentsPostId), historyPost = detail?.posts.find(post => post.id === historyPostId);
  const renderPost = (post: BoardPost, index: number) => <PostCard key={post.id} post={post} board={board!} canReorder={canReorder} style={board?.layout === 'freeform' ? {left: post.x ?? (index % 4) * 296 + 18, top: post.y ?? Math.floor(index / 4) * 400 + 18} : undefined} onEdit={() => setComposer({post})} onComments={() => setCommentsPostId(post.id)} onHistory={() => setHistoryPostId(post.id)} onPatch={patch => patchPost(post, patch)} onDelete={() => removePost(post)} onReaction={async kind => {const result = await boardRequest<{reactionCounts: BoardPost['reactionCounts']; ownReaction?: BoardReaction}>(`/api/boards/${post.boardId}/posts/${post.id}/reaction`, {method: 'POST', body: JSON.stringify({kind})}); setDetail(previous => previous?.board.id === post.boardId ? {...previous, posts: previous.posts.map(item => item.id === post.id ? {...item, ...result} : item)} : previous);}} onVote={async optionId => {const result = await boardRequest<{poll: BoardPoll}>(`/api/boards/${post.boardId}/posts/${post.id}/vote`, {method: 'POST', body: JSON.stringify({optionId})}); setDetail(previous => previous?.board.id === post.boardId ? {...previous, posts: previous.posts.map(item => item.id === post.id ? {...item, poll: result.poll} : item)} : previous);}} onMove={direction => moveRelative(post, direction)} onMoveSection={sectionId => reorder(post.id, undefined, sectionId)} onDragStart={event => {const bounds = event.currentTarget.closest('article')?.getBoundingClientRect(); drag.current = {id: post.id, offsetX: bounds ? event.clientX - bounds.left : 0, offsetY: bounds ? event.clientY - bounds.top : 0}; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', post.id);}} onDrop={event => drop(event, post.id, post.sectionId)} onError={() => setError(t('saveError'))}/>;

  if (forbidden) return <div className="pb-workspace"><div className="pb-empty"><LockKeyhole size={38}/><h2>{error || t('forbidden')}</h2><button className="pb-button" onClick={() => navigate('')}>{t('back')}</button></div></div>;
  return <div className={`pb-workspace ${board ? `pb-open pb-tone-${board.theme}` : ''}`} data-testid="pb-workspace">
    {notice && <div className="pb-toast" role="status"><Check size={17}/>{notice}</div>}
    {error && <div className="pb-alert pb-page-alert" role="alert">{error}<button onClick={() => boardId ? void loadDetail(boardId, true) : void loadHome()}>{t('retry')}</button><button className="pb-icon" aria-label={t('close')} onClick={() => setError('')}><X size={16}/></button></div>}
    {!boardId ? <div className="pb-library" data-testid="pb-board-list">
      <aside className="pb-library-sidebar"><div className="pb-library-brand"><span className="pb-brand-icon"><MessageCircle size={23}/><Sparkles size={11}/></span><div><h1>{t('title')}</h1><small>{t('subtitle')}</small></div></div>{teacher && <button className="pb-button primary pb-new-board" data-testid="pb-create-board" disabled={!home?.classes.length} onClick={() => setModal('create')}><Plus size={19}/>{t('newBoard')}</button>}<nav aria-label={t('myBoards')}>{(['all', 'open', 'frozen', 'archived'] as const).map(item => <button key={item} className={folder === item ? 'selected' : ''} onClick={() => setFolder(item)}>{item === 'all' ? <LayoutGrid size={18}/> : item === 'open' ? <FolderOpen size={18}/> : item === 'frozen' ? <LockKeyhole size={18}/> : <Archive size={18}/>}<span>{t(item)}</span><small>{(home?.boards || []).filter(value => item === 'all' ? value.status !== 'archived' : value.status === item).length}</small></button>)}</nav><div className="pb-sidebar-friends"><Friend character="cat"/><Friend character="hamster"/><span>{t('subtitle')}</span></div></aside>
      <main className="pb-library-main"><header className="pb-library-toolbar"><h2>{t('myBoards')}</h2><div className="pb-library-controls"><div className="pb-search"><Search size={18}/><input aria-label={t('searchBoards')} placeholder={t('searchBoards')} value={listSearch} onChange={event => setListSearch(event.target.value)}/></div>{teacher && <select aria-label={t('class')} value={classId} onChange={event => changeClass(event.target.value)}><option value="">{t('allClasses')}</option>{home?.classes.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select>}</div></header><p className="pb-list-summary">{t('boardCount', {count: filteredBoards.length})}<span><span className="pb-mini-dot"/>{t(folder)}</span></p>
      {loading ? <div className="pb-board-skeletons" aria-label={t('loading')} role="status">{[0, 1, 2, 3].map(value => <div key={value}/>)}</div> : !filteredBoards.length ? <div className="pb-empty"><div className="pb-empty-art"><Friend character="cat"/><span><Plus size={24}/></span></div><h2>{t(listSearch ? 'noResults' : teacher ? 'noBoards' : 'noBoardsStudent')}</h2><p>{t(teacher && !home?.classes.length ? 'noClass' : 'noBoardsHint')}</p>{teacher && (home?.classes.length ? <button className="pb-button primary" onClick={() => setModal('create')}><Plus size={18}/>{t('newBoard')}</button> : <a href="/teacher" className="pb-button">{t('dashboard')}<ArrowRight size={16}/></a>)}</div> : <div className="pb-board-grid">{filteredBoards.map(item => <button className="pb-board-tile" key={item.id} data-testid={`pb-board-card-${item.id}`} onClick={() => navigate(item.id)}><div className={`pb-board-cover pb-tone-${item.theme}`}><div className={`pb-cover-layout pb-cover-${item.layout}`} aria-hidden="true">{Array.from({length: 6}, (_, index) => <i key={index}><span/><span/></i>)}</div><Friend character={item.character}/><span className="pb-cover-badge">{(() => {const Icon = layoutIcons[item.layout]; return <Icon size={15}/>;})()}{t(`layout_${item.layout}`)}</span></div><div className="pb-board-tile-info"><div><small>{item.className}</small><span className={`pb-board-status is-${item.status}`}>{t(item.status)}</span></div><h3>{item.title}</h3><p>{item.description || '\u00a0'}</p><footer><span><MessageCircle size={14}/>{t('posts', {count: item.postCount})}</span><span><Users size={14}/>{t('participants', {count: item.participantCount})}</span></footer></div></button>)}</div>}{home?.nextCursor && <button className="pb-button pb-load-more" disabled={moreLoading} onClick={() => void loadHome(classId, true, home.nextCursor)}>{t(moreLoading ? 'loading' : 'loadMore')}</button>}</main>
    </div> : detailLoading || !detail ? <div className="pb-detail-loading"><button className="pb-text-button" onClick={() => navigate('')}><ArrowLeft size={17}/>{t('back')}</button><Loading/></div> : board && <div data-testid="pb-board-view" className="pb-board-view">
      <header className="pb-board-header"><div className="pb-board-topline"><button className="pb-back" onClick={() => navigate('')}><ArrowLeft size={18}/><span>{t('back')}</span></button><div className="pb-board-top-actions"><button className="pb-icon" aria-label={t('refresh')} onClick={() => void loadDetail(board.id)} disabled={detailLoading}><RefreshCw size={18}/></button><button className="pb-button pb-share-button" data-testid="pb-share" onClick={() => setModal('share')}><Share2 size={17}/>{t('share')}</button>{board.canManage && <button className="pb-icon" data-testid="pb-settings" aria-label={t('settings')} onClick={() => setModal('settings')}><Settings2 size={21}/></button>}</div></div><div className="pb-board-title-row"><Friend character={board.character}/><div><div className="pb-board-eyebrow"><span>{board.className}</span><span className={`pb-board-status is-${board.status}`}>{t(board.status)}</span>{board.anonymous && <span><EyeOff size={12}/>{t('anonymous')}</span>}</div><h1>{board.title}</h1>{board.description && <p>{board.description}</p>}</div></div><div className="pb-board-toolbar"><div className="pb-search"><Search size={17}/><input aria-label={t('searchPosts')} placeholder={t('searchPosts')} value={search} onChange={event => setSearch(event.target.value)}/></div><select aria-label={t('filter')} value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">{t('allPosts')}</option><option value="mine">{t('myPosts')}</option>{board.canManage && <><option value="pending">{t('pending')}</option><option value="hidden">{t('hidden')}</option></>}</select><select aria-label={t('sort')} value={sort} onChange={event => setSort(event.target.value as typeof sort)}>{(['manual', 'newest', 'oldest'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select><div className="pb-toolbar-spacer"/>{board.canManage ? <button className="pb-text-button" onClick={() => void openParticipants()}><Users size={16}/>{t('participants', {count: board.participantCount})}</button> : <span className="pb-post-total">{t('posts', {count: board.postCount})}</span>}{board.canManage && board.revealMode && <button disabled={busy} className="pb-button pb-reveal" onClick={() => void patchBoard({revealed: !board.revealed})}>{board.revealed ? <EyeOff size={16}/> : <Eye size={16}/>} {t(board.revealed ? 'hideAgain' : 'reveal')}</button>}</div></header>
      {board.status !== 'open' && <div className="pb-board-notice"><LockKeyhole size={16}/>{t(board.status === 'archived' ? 'archivedHint' : 'frozenHint')}</div>}{board.revealMode && !board.revealed && <div className="pb-board-notice"><EyeOff size={16}/><span><strong>{t('waitingReveal')}</strong> {t('waitingRevealHint')}</span></div>}
      <div className={`pb-canvas pb-layout-${board.layout}`} data-testid={`pb-canvas-${board.layout}`} onDoubleClick={event => {if (board.canPost && event.target === event.currentTarget) setComposer({});}} onDragOver={event => {if (canReorder) event.preventDefault();}} onDrop={event => drop(event)}>
        {['columns', 'rows'].includes(board.layout) ? <>{[{id: '', title: t('untitledSection')}, ...board.sections].map(section => <section className="pb-section" key={section.id} onDragOver={event => {if (canReorder) event.preventDefault();}} onDrop={event => drop(event, undefined, section.id)}><header><h2>{section.title}<span>{posts.filter(post => post.sectionId === section.id || !section.id && !board.sections.some(item => item.id === post.sectionId)).length}</span></h2>{board.canManage && section.id && <details className="pb-card-menu"><summary aria-label={t('more')}><MoreHorizontal size={19}/></summary><div><button onClick={() => openSection(section.id)}><Pencil size={15}/>{t('edit')}</button><button onClick={async () => {if (!window.confirm(t('removeSectionHint'))) return; const result = await patchBoard({sections: board.sections.filter(item => item.id !== section.id)}); if (result) void loadDetail(result.id);}}><Trash2 size={15}/>{t('removeSection')}</button></div></details>}</header>{board.canPost && <button className="pb-section-add" aria-label={`${t('addPost')}: ${section.title}`} onClick={() => setComposer({sectionId: section.id})}><Plus size={19}/></button>}<div className="pb-section-cards">{posts.filter(post => post.sectionId === section.id || !section.id && !board.sections.some(item => item.id === post.sectionId)).map(renderPost)}</div></section>)}{board.canManage && <button className="pb-add-section" onClick={() => openSection()}><Plus size={18}/>{t('addSection')}</button>}</> : board.layout === 'table' ? <div className="pb-table-scroll"><table className="pb-table"><thead><tr><th>{t('postTitle')}</th><th>{t('content')}</th><th>{t('author')}</th><th>{t('status')}</th><th>{t('created')}</th><th>{t('comments')}</th></tr></thead><tbody>{posts.map(post => <tr key={post.id} data-testid={`pb-post-${post.id}`}><td><button onClick={() => setCommentsPostId(post.id)}>{post.pinned && <Pin size={13}/>} {post.title || t('noContent')}</button></td><td><p>{post.body}</p>{post.attachments.length > 0 && <span>{post.attachments.length} <PaperclipIcon/></span>}</td><td><div className="pb-author"><Friend character={post.author.character}/>{post.author.name}</div></td><td>{t(post.status)}</td><td>{new Date(post.createdAt).toLocaleDateString(locale)}</td><td><button className="pb-icon" onClick={() => setCommentsPostId(post.id)} aria-label={t('comments')}><MessageCircle size={17}/>{post.commentCount}</button>{post.canEdit && <button className="pb-icon" onClick={() => setComposer({post})} aria-label={t('edit')}><Pencil size={16}/></button>}</td></tr>)}</tbody></table></div> : board.layout === 'map' ? <BoardMap posts={posts} renderPost={renderPost}/> : board.layout === 'wall' ? <MasonryPosts posts={posts} renderPost={renderPost}/> : <div className="pb-posts" style={board.layout === 'freeform' ? {minWidth: Math.max(1100, ...posts.map(post => post.x + 300)), minHeight: Math.max(680, ...posts.map((post, index) => (post.y ?? Math.floor(index / 4) * 400 + 18) + 550))} : undefined}>{posts.map(renderPost)}</div>}
        {!posts.length && !['columns', 'rows'].includes(board.layout) && <div className="pb-empty pb-empty-in-board"><Friend character={board.character}/><h2>{t(search || filter !== 'all' ? 'noResults' : 'emptyBoard')}</h2><p>{t('emptyBoardHint')}</p>{board.canPost && <button className="pb-button" onClick={() => setComposer({})}><Plus size={18}/>{t('addPost')}</button>}</div>}
      </div>{detail.nextCursor && <button className="pb-button pb-load-more" disabled={moreLoading} onClick={() => void loadDetail(board.id, false, true, detail.nextCursor)}>{t(moreLoading ? 'loading' : 'loadMore')}</button>}{board.canPost && <button className="pb-floating-add" data-testid="pb-add-post" aria-label={t('addPost')} title={t('addPost')} onClick={() => setComposer({})}><Plus size={32}/></button>}
    </div>}
    {modal === 'create' && home && <CreateBoardDialog classes={home.classes} initialClassId={classId} onClose={() => setModal(null)} onCreated={next => {applyBoard(next); navigate(next.id);}}/>}
    {modal === 'settings' && board && <BoardSettingsDialog key={board.id} board={board} onClose={() => setModal(null)} onSaved={next => {applyBoard(next); setSort(next.sort); setModal(null); setNotice(t('saved')); void loadDetail(next.id);}} onDuplicate={duplicateBoard} onExport={exportCsv}/>}
    {modal === 'share' && board && <BoardShareDialog board={board} onClose={() => setModal(null)} onSaved={applyBoard}/>}
    {composer && board && <ParticipationComposer key={`${board.id}:${composer.post?.id || 'new'}`} board={board} viewerId={viewerId} post={composer.post} sectionId={composer.sectionId} onClose={() => setComposer(null)} onSaved={post => {applyPost(post); setComposer(null); setNotice(t(post.status === 'pending' ? 'pending' : 'saved')); void loadDetail(post.boardId);}}/>}
    {commentPost && board && <CommentsDialog key={`${board.id}:${commentPost.id}`} board={board} post={commentPost} viewerId={viewerId} onClose={() => setCommentsPostId('')} onChange={() => void loadDetail(board.id)}/>}
    {historyPost && board && <HistoryDialog boardId={board.id} post={historyPost} onClose={() => setHistoryPostId('')} onRestored={post => {applyPost(post); setHistoryPostId(''); setNotice(t('saved'));}}/>}
    {modal === 'section' && board && <BoardDialog title={t(editingSection ? 'edit' : 'addSection')} onClose={() => setModal(null)} busy={busy}><form onSubmit={async event => {event.preventDefault(); if (!sectionTitle.trim()) return; const sections = editingSection ? board.sections.map(section => section.id === editingSection ? {...section, title: sectionTitle.trim()} : section) : [...board.sections, {id: requestId(), title: sectionTitle.trim()}]; const result = await patchBoard({sections}); if (result) setModal(null);}}><div className="pb-form-body"><label>{t('sectionName')}<input value={sectionTitle} onChange={event => setSectionTitle(event.target.value)} placeholder={t('sectionPlaceholder')} required maxLength={80} autoFocus/></label></div><footer className="pb-dialog-footer"><button className="pb-button primary" disabled={busy}>{t('save')}</button></footer></form></BoardDialog>}
    {modal === 'participants' && board && <BoardDialog title={t('participation')} onClose={() => setModal(null)} drawer><div className="pb-form-body"><p className="pb-muted">{t('participationHint')}</p>{participants === null ? <Loading/> : !participants.length ? <p>{t('noParticipation')}</p> : <div className="pb-participant-list">{participants.map(student => <div key={student.id}><Friend character={student.character}/><span><strong>{student.number}. {student.name}</strong><small>{t('posts', {count: student.postCount})} · {t('commentCount', {count: student.commentCount})}</small></span><span className={`pb-participant-mark ${student.postCount ? 'is-done' : ''}`}>{student.postCount ? <Check size={17}/> : '—'}</span></div>)}</div>}</div></BoardDialog>}
  </div>;
}

function PaperclipIcon() {return <span aria-hidden="true">↗</span>;}

function PostCard({post, board, style, canReorder, onEdit, onComments, onHistory, onPatch, onDelete, onReaction, onVote, onMove, onMoveSection, onDragStart, onDrop, onError}: {post: BoardPost; board: ParticipationBoard; style?: React.CSSProperties; canReorder: boolean; onEdit: () => void; onComments: () => void; onHistory: () => void; onPatch: (patch: Partial<BoardPost>) => Promise<void>; onDelete: () => Promise<void>; onReaction: (kind: BoardReaction | null) => Promise<void>; onVote: (optionId: string) => Promise<void>; onMove: (direction: -1 | 1) => Promise<void>; onMoveSection: (sectionId: string) => Promise<void>; onDragStart: (event: DragEvent) => void; onDrop: (event: DragEvent) => void; onError: () => void}) {
  const t = useTranslations('participation'), locale = useLocale(), [busy, setBusy] = useState(false), menu = useRef<HTMLDetailsElement>(null);
  const writable = post.status === 'published' && (board.canManage || board.status === 'open');
  const act = async (action: () => Promise<void>) => {if (busy) return; if (menu.current) menu.current.open = false; setBusy(true); try {await action();} catch {onError();} finally {setBusy(false);}};
  return <article className={`pb-post pb-tone-${post.color} ${post.pinned ? 'is-pinned' : ''} ${post.status !== 'published' ? 'is-pending' : ''}`} style={style} data-testid={`pb-post-${post.id}`} onDragOver={event => {if (canReorder) event.preventDefault();}} onDrop={onDrop}>
    <header className="pb-post-head"><div className="pb-author"><Friend character={post.author.character}/><span>{post.author.name}{post.author.isTeacher && <small>{t('teacher')}</small>}{post.author.isMe && !post.author.isTeacher && <small>{t('me')}</small>}</span></div><div className="pb-post-head-actions">{post.pinned && <Pin className="pb-pin-mark" size={14} aria-label={t('pinned')}/>} {canReorder && <button className="pb-drag-handle" draggable aria-label={t('drag')} onDragStart={onDragStart} type="button"><GripVertical size={16}/></button>}{(post.canEdit || board.canManage) && <details className="pb-card-menu" ref={menu}><summary aria-label={t('more')}><MoreHorizontal size={20}/></summary><div>{post.canEdit && <><button onClick={() => {if (menu.current) menu.current.open = false; onEdit();}}><Pencil size={15}/>{t('edit')}</button><button onClick={() => {if (menu.current) menu.current.open = false; onHistory();}}><History size={15}/>{t('history')}</button></>}{board.canManage && <><button disabled={busy} onClick={() => void act(() => onPatch({pinned: !post.pinned}))}><Pin size={15}/>{t(post.pinned ? 'unpin' : 'pin')}</button>{post.status !== 'published' && <button disabled={busy} onClick={() => void act(() => onPatch({status: 'published'}))}><Check size={15}/>{t('approve')}</button>}{post.status === 'published' && <button disabled={busy} onClick={() => void act(() => onPatch({status: 'hidden'}))}><EyeOff size={15}/>{t('hide')}</button>}</>}{canReorder && <><button disabled={busy} onClick={() => void act(() => onMove(-1))}><ArrowUp size={15}/>{t('moveUp')}</button><button disabled={busy} onClick={() => void act(() => onMove(1))}><ArrowDown size={15}/>{t('moveDown')}</button>{board.sections.length > 0 && <label className="pb-menu-section">{t('moveSection')}<select value={post.sectionId} onChange={event => void act(() => onMoveSection(event.target.value))}><option value="">{t('untitledSection')}</option>{board.sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>}</>}{post.canEdit && <button className="pb-danger-text" disabled={busy} onClick={() => void act(onDelete)}><Trash2 size={15}/>{t('delete')}</button>}</div></details>}</div></header>
    {post.source&&<p className="pb-muted">{post.source.assignmentId?<Link href={`/teacher/homework?classId=${board.classId}&assignmentId=${post.source.assignmentId}`}>{locale==="en"?"From homework":"숙제에서 온 작품"} · {post.source.title}</Link>:<span>{locale==="en"?"From homework":"숙제에서 온 작품"} · {post.source.title}</span>}</p>}{post.title && <h2 className="pb-post-title">{post.title}</h2>}{post.body && <p className="pb-post-body">{post.body}</p>}{post.attachments.length > 0 && <div className={`pb-post-media ${post.attachments.filter(item => item.kind === 'image').length > 1 ? 'has-album' : ''}`}>{post.attachments.map(attachment => <AttachmentView key={attachment.id} attachment={attachment}/>)}</div>}{post.link && <a className="pb-post-link" href={post.link} target="_blank" rel="noopener noreferrer"><ArrowRight size={15}/><span>{post.link.replace(/^https?:\/\//, '')}</span></a>}{post.location && <a className="pb-location-tag" href={`https://www.openstreetmap.org/?mlat=${post.location.lat}&mlon=${post.location.lng}#map=15/${post.location.lat}/${post.location.lng}`} target="_blank" rel="noopener noreferrer"><MapPin size={14}/>{post.location.label || `${post.location.lat.toFixed(3)}, ${post.location.lng.toFixed(3)}`}</a>}
    {post.poll && <div className="pb-poll"><strong>{post.poll.question}</strong>{post.poll.options.map(option => <button key={option.id} disabled={busy || !writable} className={post.poll?.ownVote === option.id ? 'selected' : ''} onClick={() => void act(() => onVote(option.id))}><i style={{width: `${post.poll?.totalVotes ? Math.round(option.count / post.poll.totalVotes * 100) : 0}%`}}/><span>{option.text}</span>{post.poll?.ownVote === option.id && <Check size={14}/>}<small>{option.count}</small></button>)}<small>{t('votes', {count: post.poll.totalVotes})}</small></div>}
    {post.status !== 'published' && <div className="pb-post-moderation"><span><EyeOff size={13}/>{t(post.status)}</span>{board.canManage && <button disabled={busy} onClick={() => void act(() => onPatch({status: 'published'}))}><Check size={14}/>{t('approve')}</button>}</div>}
    <footer className="pb-post-footer">{board.reactionsEnabled && <div className="pb-reactions" role="group" aria-label={t('reaction')}>{(['heart', 'star', 'clap', 'idea'] as const).map(kind => {const Icon = reactionIcons[kind]; return <button key={kind} disabled={busy || !writable} className={post.ownReaction === kind ? 'selected' : ''} data-testid={`pb-reaction-${post.id}-${kind}`} aria-label={`${t(kind)} ${post.reactionCounts[kind] || 0}`} aria-pressed={post.ownReaction === kind} onClick={() => void act(() => onReaction(post.ownReaction === kind ? null : kind))}><Icon size={15}/>{!!post.reactionCounts[kind] && <span>{post.reactionCounts[kind]}</span>}</button>;})}</div>}<button className="pb-comment-count" data-testid={`pb-comments-${post.id}`} aria-label={t('commentCount', {count: post.commentCount})} onClick={onComments}><MessageCircle size={16}/>{post.commentCount || ''}</button></footer><time className="pb-post-time" dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString(locale, {month: 'short', day: 'numeric'})}</time>
  </article>;
}

function BoardMap({posts, renderPost}: {posts: BoardPost[]; renderPost: (post: BoardPost, index: number) => ReactNode}) {
  const t = useTranslations('participation'); const located = posts.filter(post => post.location), [selected, setSelected] = useState(''), [mapOpened, setMapOpened] = useState(false);
  const active = located.find(post => post.id === selected) || located[0], point = active?.location;
  return <div className="pb-map-layout"><div className="pb-map-preview">{point && mapOpened ? <iframe title={`${t('location')}: ${point.label || active?.title}`} loading="lazy" referrerPolicy="no-referrer" src={`https://www.openstreetmap.org/export/embed.html?bbox=${point.lng - .025},${point.lat - .015},${point.lng + .025},${point.lat + .015}&layer=mapnik&marker=${point.lat},${point.lng}`}/> : <div className="pb-map-placeholder"><MapPin size={46}/><p>{point ? point.label || active?.title : t('mapEmpty')}</p>{point && <button className="pb-button" onClick={() => setMapOpened(true)}><MapPin size={17}/>{t('openMap')}</button>}</div>}<div className="pb-map-places">{located.map(post => <button className={post.id === active?.id ? 'selected' : ''} key={post.id} onClick={() => {setSelected(post.id); setMapOpened(true);}}><MapPin size={15}/>{post.location?.label || post.title}</button>)}</div></div><div className="pb-map-cards">{posts.map(renderPost)}</div></div>;
}

function MasonryPosts({posts, renderPost}: {posts: BoardPost[]; renderPost: (post: BoardPost, index: number) => ReactNode}) {
  const container = useRef<HTMLDivElement>(null), [columns, setColumns] = useState(3);
  useEffect(() => {
    const node = container.current; if (!node) return;
    const resize = () => setColumns(Math.min(4, Math.max(1, Math.floor((node.clientWidth + 19) / 274))));
    resize(); const observer = new ResizeObserver(resize); observer.observe(node); return () => observer.disconnect();
  }, []);
  return <div ref={container} className="pb-posts pb-masonry" style={{gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`}}>{Array.from({length: columns}, (_, column) => <div className="pb-masonry-column" key={column}>{posts.map((post, index) => index % columns === column ? renderPost(post, index) : null)}</div>)}</div>;
}
