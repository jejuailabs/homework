'use client';
import { useCallback, useEffect, useState } from 'react';
import { Heart, LoaderCircle, MessageCircle, RefreshCw } from 'lucide-react';
import { praiseStickers, type GuestEntry, type ModuleViewer, type ArtworkModuleOptions } from '../artwork-extensions/types';
import { moduleRequest, moduleUrl, jsonRequest } from '../artwork-extensions/client';
type Listing = {
    entries: GuestEntry[];
    mine: GuestEntry[];
    nextCursor: string | null;
    viewer: ModuleViewer;
    options: ArtworkModuleOptions['guestbook'];
};
export default function WarmGuestbook({ endpoint, en = false }: {
    endpoint: string;
    en?: boolean;
}) {
    const [data, setData] = useState<Listing | null>(null), [queue, setQueue] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [name, setName] = useState(''), [text, setText] = useState('');
    const url = useCallback((suffix = '') => moduleUrl(endpoint, 'guestbook', suffix), [endpoint]);
    const listing = useCallback((cursor = '') => { const u = new URL(url(), location.origin); if (queue)
        u.searchParams.set('queue', '1'); if (cursor)
        u.searchParams.set('cursor', cursor); return u.pathname + u.search; }, [url, queue]);
    const load = useCallback(async () => { try {
        setData(await moduleRequest<Listing>(listing()));
        setError('');
    }
    catch (e) {
        setError((e as Error).message);
    } }, [listing]);
    useEffect(() => { let live = true; setData(null); moduleRequest<Listing>(listing()).then(d => { if (live) {
        setData(d);
        setError('');
    } }).catch(e => { if (live)
        setError(e.message); }); return () => { live = false; }; }, [listing]);
    async function action(work: () => Promise<unknown>, message = '', refresh = true) { if (busy)
        return; setBusy(true); setError(''); setNotice(''); try {
        await work();
        setNotice(message);
        if (refresh)
            await load();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    const mineComment = data?.mine.find(e => e.type === 'comment'), mineSticker = data?.mine.find(e => e.type === 'sticker');
    const stickers = data && data.viewer.contribute && (data.viewer.visitor ? data.options.visitorStickers : data.viewer.manage || data.options.students), comments = data && data.viewer.contribute && (data.viewer.visitor ? data.options.visitorComments : data.viewer.manage || data.options.students);
    return <section className="am-panel am-guestbook" aria-label={en ? 'Warm guestbook' : '따뜻한 방명록'}><header><span className="am-symbol"><Heart size={20}/></span><div><h3>{en ? 'Warm guestbook' : '따뜻한 방명록'}</h3><p>{en ? 'A little encouragement goes a long way.' : '작품을 향한 따뜻한 마음을 남겨 주세요.'}</p></div><button type="button" aria-label={en ? 'Refresh guestbook' : '방명록 새로고침'} disabled={busy} onClick={() => void load()}><RefreshCw size={16}/></button></header>
 {!data && !error && <LoaderCircle className="spin"/>}{data && <>{data.viewer.manage && <label className="am-queue-toggle"><input type="checkbox" checked={queue} onChange={e => setQueue(e.target.checked)}/>{en ? 'Review all, including pending' : '승인 대기·숨긴 감상도 검토'}</label>}
 {stickers && <div className="am-stickers">{praiseStickers.map(s => <button key={s.id} type="button" aria-pressed={mineSticker?.sticker === s.id} disabled={busy} onClick={() => void action(() => moduleRequest(url(), jsonRequest('POST', { type: 'sticker', sticker: s.id })), en ? 'Encouragement sent.' : '따뜻한 응원을 전했어요.')}><span>{s.emoji}</span>{en ? s.en : s.ko}</button>)}</div>}
 {comments && !mineComment && <form onSubmit={e => { e.preventDefault(); void action(async () => { await moduleRequest(url(), jsonRequest('POST', { type: 'comment', text, authorName: name })); setText(''); }, data.viewer.manage ? (en ? 'Reflection shared.' : '감상을 남겼어요.') : (en ? 'Sent to the teacher for review.' : '선생님 승인 후 감상이 보여요.')); }}>{data.viewer.visitor && <label>{en ? 'Nickname (optional)' : '별명 (선택)'}<input value={name} maxLength={20} disabled={busy} onChange={e => setName(e.target.value)}/></label>}<label>{en ? 'A short reflection' : '감상 한 줄'}<textarea value={text} maxLength={120} rows={2} disabled={busy} onChange={e => setText(e.target.value)} placeholder={en ? 'What did you like?' : '어떤 부분이 마음에 들었나요?'}/></label><small>{en ? 'Please leave out links and contact details.' : '연락처·링크 없이 120자까지 남겨 주세요.'}</small><button className="am-primary" disabled={busy || !text.trim()}><MessageCircle size={15}/>{en ? 'Send reflection' : '감상 보내기'}</button></form>}
 {mineComment?.status === 'pending' && <p className="am-note">{en ? 'Your reflection is waiting for teacher approval.' : '내 감상이 선생님의 승인을 기다리고 있어요.'}</p>}
 <div className="am-entries">{data.entries.map(entry => { const sticker = praiseStickers.find(s => s.id === entry.sticker); return <article key={entry.id}><div><strong>{entry.authorName}</strong><small>{entry.authorRole === 'visitor' ? (en ? 'Visitor' : 'QR 방문자') : entry.authorRole === 'teacher' ? (en ? 'Teacher' : '선생님') : (en ? 'Classmate' : '우리 반 친구')}</small><time>{new Date(entry.createdAt).toLocaleDateString(en ? 'en-US' : 'ko-KR')}</time></div>{entry.type === 'sticker' ? <p className="am-sticker-message">{sticker?.emoji} {en ? sticker?.en : sticker?.ko}</p> : <p>{entry.text}</p>}{entry.status !== 'approved' && <small>{entry.status === 'pending' ? (en ? 'Awaiting approval' : '승인 대기') : (en ? 'Hidden' : '숨김')}</small>}{data.viewer.manage && <footer>{entry.status !== 'approved' && <button type="button" disabled={busy} onClick={() => void action(() => moduleRequest(url('/' + entry.id), jsonRequest('PATCH', { status: 'approved', version: entry.version })))}>{en ? 'Approve' : '공개 승인'}</button>}{entry.status !== 'hidden' && <button type="button" disabled={busy} onClick={() => void action(() => moduleRequest(url('/' + entry.id), jsonRequest('PATCH', { status: 'hidden', version: entry.version })))}>{en ? 'Hide' : '숨기기'}</button>}</footer>}</article>; })}</div>
 {!data.entries.length && <p className="am-note">{en ? 'Be the first to leave a kind word.' : '첫 번째 따뜻한 마음을 기다리고 있어요.'}</p>}{data.nextCursor && <button type="button" disabled={busy} onClick={() => void action(async () => { const next = await moduleRequest<Listing>(listing(data.nextCursor!)); setData(previous => previous ? { ...next, entries: [...previous.entries, ...next.entries] } : next); }, '', false)}>{en ? 'Show more' : '더 보기'}</button>}</>}
 {notice && <p className="am-note" role="status">{notice}</p>}{error && <p className="am-error" role="alert">{error}<button type="button" onClick={() => void load()}>{en ? 'Retry' : '다시 확인'}</button></p>}</section>;
}
