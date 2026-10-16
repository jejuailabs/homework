'use client';
import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, RefreshCw, X } from 'lucide-react';
import { moduleRequest } from './client';
import './styles.css';
export default function ArtworkModuleReview({ endpoint, en = false, onSelect, onClose }: {
    endpoint: string;
    en?: boolean;
    onSelect: (id: string) => void;
    onClose: () => void;
}) {
    const [entries, setEntries] = useState<{
        kind: string;
        targetId: string;
        title: string;
        pending: number;
    }[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), dialog = useRef<HTMLDialogElement>(null);
    async function load() { setBusy(true); setError(''); try {
        setEntries((await moduleRequest<{
            entries: typeof entries;
        }>(endpoint)).entries);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => { dialog.current?.showModal(); void load(); }, [endpoint]);
    return <dialog ref={dialog} className="am-review-dialog" aria-label={en ? 'Artwork stories awaiting review' : '작품 이야기 검토'} onCancel={e => { e.preventDefault(); onClose(); }}><header><h2>{en ? 'Stories awaiting your review' : '선생님을 기다리는 이야기'}</h2><button type="button" aria-label={en ? 'Close review' : '검토 닫기'} onClick={onClose}><X size={20}/></button></header><p>{en ? 'Open an artwork to review its voice draft or pending reflections.' : '작품을 선택해 녹음 초안과 승인 대기 감상을 확인해 주세요.'}</p><button type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={15}/>{en ? 'Refresh' : '새로고침'}</button>{error && <p role="alert">{error}</p>}{!busy && !entries.length && <p>{en ? 'All caught up!' : '지금은 검토할 이야기가 없어요.'}</p>}<div>{entries.map(e => <button key={e.kind + e.targetId} type="button" onClick={() => { onClose(); onSelect(e.targetId); }}><strong>{e.title}</strong><span>{e.kind === 'voice' ? (en ? 'Voice draft' : '음성 초안') : (en ? 'Guestbook reflections' : '방명록 감상')} · {e.pending}</span></button>)}</div></dialog>;
}
