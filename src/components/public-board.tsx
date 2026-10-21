'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {ArrowRight, Eye, MapPin, MessageCircle, Send} from 'lucide-react';
import type {BoardComment, BoardPost, PublicBoardResponse} from '@/lib/participation-types';
import {AttachmentView, BoardDialog, Friend, Loading, boardRequest, requestId} from './participation-shared';
import '@/styles/participation.css';
import '@/styles/public-board.css';

export default function PublicBoard({token}: {token: string}) {
  const t = useTranslations('participation');
  const [data, setData] = useState<PublicBoardResponse | null>(null), [error, setError] = useState(false), [busy, setBusy] = useState(false), [open, setOpen] = useState<BoardPost | null>(null);
  const base = `/api/board-view/${encodeURIComponent(token)}`;
  useEffect(() => {
    let active = true;
    boardRequest<PublicBoardResponse>(base).then(result => {if (active) setData(result);}).catch(() => {if (active) setError(true);});
    return () => {active = false;};
  }, [base]);
  async function more() {
    if (!data?.nextCursor || busy) return; setBusy(true);
    try {const result = await boardRequest<PublicBoardResponse>(`${base}?cursor=${encodeURIComponent(data.nextCursor)}`); setData(previous => previous && {...result, posts: [...previous.posts, ...result.posts]});} catch {setError(true);} finally {setBusy(false);}
  }
  if (error && !data) return <main className="pbp-page"><div className="pbp-empty"><Friend/><p>{t('publicBoardError')}</p></div></main>;
  if (!data) return <main className="pbp-page"><Loading/></main>;
  const {board} = data, sections = board.sections.length ? board.sections : [{id: '', title: ''}];
  const grouped = sections.map(section => ({section, posts: data.posts.filter(post => board.sections.length ? post.sectionId === section.id : true)})).filter(group => group.posts.length);
  return <main className={`pbp-page pb-tone-${board.theme}`}>
    <header className="pbp-head"><Friend character={board.character}/><div><span className="pbp-badge"><Eye size={13}/>{t('publicBoardBadge')}</span><h1>{board.title}</h1>{board.description && <p>{board.description}</p>}<small>{board.className}</small></div></header>
    {!data.posts.length ? <div className="pbp-empty"><p>{t('publicNoPosts')}</p></div> : grouped.map(group => <section key={group.section.id || 'all'} className="pbp-section">{group.section.title && <h2>{group.section.title}</h2>}<div className="pbp-grid">{group.posts.map(post => <PublicPost key={post.id} post={post} onComments={() => setOpen(post)}/>)}</div></section>)}
    {data.nextCursor && <div className="pbp-more"><button className="pb-button" disabled={busy} onClick={() => void more()}>{t('loadMore')}</button></div>}
    <p className="pbp-foot">{t('publicBoardHint')}</p>
    {open && <PublicComments base={base} post={open} allowComments={board.visitorComments} onClose={() => setOpen(null)}/>}
  </main>;
}

function PublicPost({post, onComments}: {post: BoardPost; onComments: () => void}) {
  const t = useTranslations('participation'), locale = useLocale();
  return <article className={`pb-post pb-tone-${post.color}`}>
    <header className="pb-post-head"><div className="pb-author"><Friend character={post.author.character}/><span>{post.author.name}{post.author.isTeacher && <small>{t('teacher')}</small>}</span></div></header>
    {post.title && <h2 className="pb-post-title">{post.title}</h2>}{post.body && <p className="pb-post-body">{post.body}</p>}
    {post.attachments.length > 0 && <div className={`pb-post-media ${post.attachments.filter(item => item.kind === 'image').length > 1 ? 'has-album' : ''}`}>{post.attachments.map(attachment => <AttachmentView key={attachment.id} attachment={attachment}/>)}</div>}
    {post.link && <a className="pb-post-link" href={post.link} target="_blank" rel="noopener noreferrer"><ArrowRight size={15}/><span>{post.link.replace(/^https?:\/\//, '')}</span></a>}
    {post.location && <span className="pb-location-tag"><MapPin size={14}/>{post.location.label || `${post.location.lat.toFixed(3)}, ${post.location.lng.toFixed(3)}`}</span>}
    {post.poll && <div className="pb-poll"><strong>{post.poll.question}</strong>{post.poll.options.map(option => <button key={option.id} disabled><i style={{width: `${post.poll?.totalVotes ? Math.round(option.count / post.poll.totalVotes * 100) : 0}%`}}/><span>{option.text}</span><small>{option.count}</small></button>)}<small>{t('votes', {count: post.poll.totalVotes})}</small></div>}
    <footer className="pb-post-footer"><button className="pb-comment-count" aria-label={t('commentCount', {count: post.commentCount})} onClick={onComments}><MessageCircle size={16}/>{t('comments')}</button></footer>
    <time className="pb-post-time" dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString(locale, {month: 'short', day: 'numeric'})}</time>
  </article>;
}

function PublicComments({base, post, allowComments, onClose}: {base: string; post: BoardPost; allowComments: boolean; onClose: () => void}) {
  const t = useTranslations('participation'), locale = useLocale();
  const [comments, setComments] = useState<BoardComment[] | null>(null), [name, setName] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const id = useRef(requestId()), url = `${base}/posts/${post.id}/comments`;
  useEffect(() => {
    let active = true;
    boardRequest<{comments: BoardComment[]}>(url).then(result => {if (active) setComments(result.comments);}).catch(() => {if (active) {setComments([]); setError(t('error'));}});
    return () => {active = false;};
  }, [url, t]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !text.trim()) return; setBusy(true); setError(''); setNotice('');
    try {await boardRequest(url, {method: 'POST', body: JSON.stringify({requestId: id.current, authorName: name.trim(), text: text.trim()})}); setText(''); id.current = requestId(); setNotice(t('visitorCommentSent'));}
    catch {setError(t('visitorCommentError'));} finally {setBusy(false);}
  }
  return <BoardDialog title={post.title || t('comments')} onClose={onClose} drawer busy={busy}><div className="pb-comments-content">
    <h3><MessageCircle size={18}/> {t('commentCount', {count: comments?.length ?? 0})}</h3>
    {comments === null ? <Loading small/> : !comments.length ? <p className="pb-muted">{t('noComments')}</p> : <div className="pb-comment-list">{comments.map(comment => <article className="pb-comment" key={comment.id}><Friend character={comment.author.character}/><div><div className="pb-comment-by"><strong>{comment.author.name}</strong>{comment.author.isTeacher && <span>{t('teacher')}</span>}{comment.author.isVisitor && <span>{t('visitor')}</span>}<time>{new Date(comment.createdAt).toLocaleDateString(locale, {month: 'short', day: 'numeric'})}</time></div><p>{comment.text}</p></div></article>)}</div>}
  </div>
    {notice && <div className="pb-alert pbp-notice" role="status">{notice}</div>}{error && <div className="pb-alert" role="alert">{error}</div>}
    {allowComments ? <form className="pb-comment-form" onSubmit={submit}><label>{t('visitorName')}<input value={name} maxLength={20} placeholder={t('visitorNamePlaceholder')} onChange={event => setName(event.target.value)}/></label><textarea aria-label={t('comments')} placeholder={t('visitorCommentPlaceholder')} value={text} onChange={event => setText(event.target.value)} maxLength={120} rows={3}/><div className="pb-flex"><small>{text.length}/120</small><button type="submit" className="pb-button primary" disabled={busy || !text.trim()}><Send size={16}/>{t('send')}</button></div></form> : <p className="pb-muted pb-form-body">{t('commentsOff')}</p>}
  </BoardDialog>;
}
