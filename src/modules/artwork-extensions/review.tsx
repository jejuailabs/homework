'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw, X } from 'lucide-react';
import { moduleRequest } from './client';
import './styles.css';
export type ArtworkReviewKind = 'voice' | 'guestbook' | 'legacy-comment';
export default function ArtworkModuleReview({ endpoint, en = false, onSelect, onClose }: {
    endpoint: string;
    en?: boolean;
    onSelect: (id: string, kind: ArtworkReviewKind) => void;
    onClose: () => void;
}) {
    const [entries, setEntries] = useState<{
        kind: ArtworkReviewKind;
        targetId: string;
        title: string;
        pending: number;
    }[]>([]), [busy, setBusy] = useState(true), [error, setError] = useState(''), dialog = useRef<HTMLDialogElement>(null), serial = useRef(0);
    const load = useCallback(async () => { const version = ++serial.current; setBusy(true); setError(''); try {
        const result = await moduleRequest<{
            entries: typeof entries;
        }>(endpoint);
        if (version === serial.current) setEntries(result.entries);
    }
    catch (e) {
        if (version === serial.current) setError((e as Error).message);
    }
    finally {
        if (version === serial.current) setBusy(false);
    } }, [endpoint]);
    useEffect(() => { const node = dialog.current; node?.showModal(); void load(); return () => {serial.current++; node?.close();}; }, [load]);
    return <dialog ref={dialog} className="am-review-dialog" aria-label={en ? 'Artwork stories awaiting review' : '작품 이야기 검토'} onCancel={e => { e.preventDefault(); onClose(); }}><header><h2>{en ? 'Stories awaiting your review' : '선생님을 기다리는 이야기'}</h2><button type="button" aria-label={en ? 'Close review' : '검토 닫기'} onClick={onClose}><X size={20}/></button></header><p>{en ? 'Open an artwork to review its voice draft, guestbook, or earlier class reflections.' : '작품을 선택해 음성 초안·방명록·기존 학급 감상 편지를 검토해 주세요.'}</p><button type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15}/>{en ? 'Refresh' : '새로고침'}</button>{busy && <p role="status"><LoaderCircle className="spin" size={15}/>{en ? 'Loading pending stories…' : '승인 대기 이야기를 확인하고 있어요…'}</p>}{error && <p role="alert">{error}</p>}{!busy && !error && !entries.length && <p>{en ? 'All caught up!' : '지금은 검토할 이야기가 없어요.'}</p>}<div>{entries.map(e => <button disabled={busy || !!error} key={e.kind + e.targetId} type="button" onClick={() => { onClose(); onSelect(e.targetId, e.kind); }}><strong>{e.title}</strong><span>{e.kind === 'voice' ? (en ? 'Voice draft' : '음성 초안') : e.kind === 'legacy-comment' ? (en ? 'Earlier class reflections' : '기존 학급 감상 편지') : (en ? 'Guestbook reflections' : '방명록 감상')} · {e.pending}</span></button>)}</div></dialog>;
}
