'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Headphones, LoaderCircle, Mic, RefreshCw, Save, Square, Trash2, Upload } from 'lucide-react';
import { jsonRequest, moduleRequest, moduleUrl } from '../artwork-extensions/client';
import type { VoiceRecording } from '../artwork-extensions/types';
import ArtworkQrLabel from '../artwork-extensions/qr-label';
import { normalizeRecording } from './recording';
import VoicePlayer from './player';
type Recording = VoiceRecording & {
    uploadStatus: string;
};
type Listing = {
    active: Recording | null;
    draft: Recording | null;
    history: Recording[];
    viewer: {
        manage: boolean;
        record: boolean;
    };
};
export default function VoiceCaption({ endpoint, en = false, title, artist, getPublicLink }: {
    endpoint: string;
    en?: boolean;
    title: string;
    artist: string;
    getPublicLink?: () => Promise<string>;
}) {
    const [data, setData] = useState<Listing | null>(null), [caption, setCaption] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [seconds, setSeconds] = useState(0), [recording, setRecording] = useState(false), [local, setLocal] = useState<{
        bytes: Uint8Array;
        url: string;
        id: string;
    } | null>(null);
    const alive = useRef(true), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), timer = useRef<ReturnType<typeof setInterval> | null>(null), limit = useRef<ReturnType<typeof setTimeout> | null>(null), localUrl = useRef(''), input = useRef<HTMLInputElement>(null);
    const url = useCallback((suffix = '') => moduleUrl(endpoint, 'voice', suffix), [endpoint]);
    const accept = useCallback((d: Listing) => { setData(d); setCaption(d.draft?.caption || ''); }, []);
    const load = useCallback(async () => { const d = await moduleRequest<Listing>(url()); if (alive.current)
        accept(d); }, [url, accept]);
    useEffect(() => { alive.current = true; setData(null); void load().catch(e => { if (alive.current)
        setError(e.message); }); return () => { alive.current = false; if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.onstop = null;
        recorder.current.stop();
    } stream.current?.getTracks().forEach(t => t.stop()); if (timer.current)
        clearInterval(timer.current); if (limit.current)
        clearTimeout(limit.current); if (localUrl.current)
        URL.revokeObjectURL(localUrl.current); }; }, [load]);
    useEffect(() => { if (data?.draft?.transcription !== 'running')
        return; const poll = setInterval(() => { if (!document.hidden)
        void load().catch(e => setError(e.message)); }, 3500); return () => clearInterval(poll); }, [data?.draft?.transcription, load]);
    async function action(work: () => Promise<unknown>, message = '') { if (busy)
        return; setBusy(true); setError(''); setNotice(''); try {
        await work();
        if (alive.current) {
            setNotice(message);
            await load();
        }
    }
    catch (e) {
        if (alive.current) {
            setError((e as Error).message);
            await load().catch(() => { });
        }
    }
    finally {
        if (alive.current)
            setBusy(false);
    } }
    function stop() { if (recorder.current?.state === 'recording')
        recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); if (timer.current)
        clearInterval(timer.current); if (limit.current)
        clearTimeout(limit.current); setRecording(false); }
    async function prepare(blob: Blob) { if (!alive.current)
        return; setBusy(true); try {
        const bytes = await normalizeRecording(blob);
        if (!alive.current)
            return;
        if (localUrl.current)
            URL.revokeObjectURL(localUrl.current);
        localUrl.current = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'audio/wav' }));
        setLocal({ bytes, url: localUrl.current, id: crypto.randomUUID() });
        setNotice(en ? 'Listen before saving.' : '저장 전에 녹음한 이야기를 들어 보세요.');
    }
    catch (e) {
        if (alive.current)
            setError((e as Error).message);
    }
    finally {
        if (alive.current)
            setBusy(false);
    } }
    async function start() { if (busy)
        return; setBusy(true); setError(''); try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
            throw Error();
        const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        if (!alive.current) {
            media.getTracks().forEach(t => t.stop());
            return;
        }
        stream.current = media;
        const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type)), rec = new MediaRecorder(media, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined), chunks: BlobPart[] = [];
        recorder.current = rec;
        rec.ondataavailable = e => { if (e.data.size)
            chunks.push(e.data); };
        rec.onerror = () => { stop(); setError(en ? 'Recording failed. Please try again.' : '녹음을 완료하지 못했어요. 다시 시도해 주세요.'); };
        rec.onstop = () => { media.getTracks().forEach(t => t.stop()); if (timer.current)
            clearInterval(timer.current); if (limit.current)
            clearTimeout(limit.current); if (alive.current) {
            setRecording(false);
            void prepare(new Blob(chunks, { type: rec.mimeType }));
        } };
        rec.start(500);
        setSeconds(0);
        setRecording(true);
        timer.current = setInterval(() => setSeconds(s => s + 1), 1000);
        limit.current = setTimeout(stop, 60000);
    }
    catch {
        stream.current?.getTracks().forEach(t => t.stop());
        setError(en ? 'Allow microphone access, or choose an audio file.' : '마이크 권한을 허용해 주세요. 녹음 파일을 선택해 올릴 수도 있어요.');
    }
    finally {
        if (alive.current)
            setBusy(false);
    } }
    function discard() { if (localUrl.current)
        URL.revokeObjectURL(localUrl.current); localUrl.current = ''; setLocal(null); }
    async function saveRecording() { if (!local)
        return; const selected = local; await action(async () => { await moduleRequest(url('/' + selected.id), { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: Uint8Array.from(selected.bytes).buffer }); discard(); await moduleRequest(url('/' + selected.id + '/transcribe'), jsonRequest('POST', {})); }, en ? 'Review the caption before sharing.' : '변환된 캡션을 확인하고 수정해 주세요.'); }
    const draft = data?.draft;
    function remove(item: Recording) { if (!confirm(en ? 'Delete this recording and caption?' : '이 녹음과 캡션을 삭제할까요?'))
        return; void action(() => moduleRequest(url('/' + item.id), { method: 'DELETE' }), en ? 'Recording deleted.' : '녹음을 삭제했어요.'); }
    return <section className="am-panel am-voice" aria-label={en ? 'Voice docent' : '아이 목소리 도슨트'}><header><span className="am-symbol"><Headphones size={20}/></span><div><h3>{en ? 'The artist’s own voice' : '아이 목소리 도슨트'}</h3><p>{en ? 'A little story, in the artist’s own words.' : '작은 작가가 들려주는 작품 이야기'}</p></div><button type="button" aria-label={en ? 'Refresh voice' : '음성 새로고침'} disabled={busy || recording} onClick={() => void load().catch(e => setError(e.message))}><RefreshCw size={16}/></button></header>
 {!data && !error && <LoaderCircle className="spin"/>}{data && <>{data.active && <div className="am-published-voice"><span className="am-badge">{en ? 'Shared story' : '공개된 이야기'}</span><VoicePlayer src={data.active.audioUrl} label={en ? 'Play artist voice' : '작가 음성 듣기'} en={en}/><p>{data.active.caption}</p>{data.viewer.manage && <button type="button" disabled={busy || recording} onClick={() => void action(() => moduleRequest(url('/' + data.active!.id), jsonRequest('PATCH', { status: 'hidden', version: data.active!.version })))}>{en ? 'Stop sharing this voice' : '이 음성 공개 중지'}</button>}</div>}
 {!data.active && !data.viewer.record && <p className="am-note">{en ? 'The artist’s story is being prepared.' : '작가의 이야기를 준비하고 있어요.'}</p>}
 {data.viewer.record && !draft && <div className="am-recorder">{!local ? <><p>{en ? 'Record up to60seconds. Please keep private details out of your story.' : '60초 안에 작품을 소개해 주세요. 연락처 등 개인 정보는 말하지 않아요.'}</p><div className="am-actions">{recording ? <button className="am-recording" type="button" onClick={stop}><Square size={17}/>{en ? 'Stop' : '녹음 마치기'} · {seconds}{en ? 's' : '초'}</button> : <button className="am-primary" type="button" disabled={busy} onClick={() => void start()}><Mic size={17}/>{en ? 'Record my story' : '내 이야기 녹음하기'}</button>}<button type="button" disabled={busy || recording} onClick={() => input.current?.click()}><Upload size={16}/>{en ? 'Choose audio' : '녹음 파일 선택'}</button><input ref={input} type="file" hidden accept="audio/*" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file)
            void prepare(file); }}/></div></> : <><audio controls src={local.url} aria-label={en ? 'Listen to recording' : '녹음 미리 듣기'}/><div className="am-actions"><button className="am-primary" type="button" disabled={busy} onClick={() => void saveRecording()}><Save size={16}/>{en ? 'Save & create caption' : '저장하고 캡션 만들기'}</button><button type="button" disabled={busy} onClick={discard}>{en ? 'Record again' : '다시 녹음'}</button></div></>}</div>}
 {draft && <div className="am-voice-draft"><span className="am-badge">{en ? 'Draft · teacher approval required' : '음성 초안 · 선생님 승인 전'}</span>{draft.uploadStatus === 'ready' ? <><VoicePlayer src={draft.audioUrl} label={en ? 'Draft recording' : '초안 녹음 듣기'} en={en}/>{draft.transcription === 'running' ? <p role="status"><LoaderCircle size={15} className="spin"/>{en ? 'Creating the caption…' : '음성을 글로 옮기고 있어요…'}</p> : <button type="button" disabled={busy || recording} onClick={() => void action(() => moduleRequest(url('/' + draft.id + '/transcribe'), jsonRequest('POST', { retry: draft.transcription === 'failed' })))}>{en ? 'Create caption from voice' : '음성으로 캡션 만들기'}{draft.transcription === 'failed' && (en ? ' · retry' : ' · 다시 시도')}</button>}<label>{en ? 'Voice caption' : '음성 캡션'}<textarea value={caption} rows={4} maxLength={3000} disabled={busy || draft.transcription === 'running'} onChange={e => setCaption(e.target.value)}/></label><small>{en ? 'You can correct the words or type the caption yourself.' : '잘못 들은 말은 고치거나 직접 입력할 수 있어요.'}</small><div className="am-actions"><button type="button" disabled={busy || !caption.trim() || draft.transcription === 'running'} onClick={() => void action(() => moduleRequest(url('/' + draft.id), jsonRequest('PATCH', { caption, version: draft.version })), en ? 'Caption saved.' : '캡션을 저장했어요.')}><Save size={15}/>{en ? 'Save caption' : '캡션 저장'}</button>{data.viewer.manage && <button type="button" className="am-primary" disabled={busy || !draft.caption.trim() || caption !== draft.caption || draft.transcription === 'running'} onClick={() => void action(() => moduleRequest(url('/' + draft.id), jsonRequest('PATCH', { status: 'approved', version: draft.version })), en ? 'Story shared.' : '작가의 이야기를 공개했어요.')}><Check size={15}/>{en ? 'Approve & share' : '승인하고 공개'}</button>}</div></> : <p className="am-note">{en ? 'The upload did not finish. Delete this draft and try again shortly.' : '전송이 끝나지 않은 초안이에요. 잠시 후 삭제하고 다시 녹음해 주세요.'}</p>}<button type="button" className="am-delete" disabled={busy || recording || draft.transcription === 'running'} onClick={() => remove(draft)}><Trash2 size={14}/>{en ? 'Delete draft' : '녹음 초안 삭제'}</button></div>}
 {data.history.length > 0 && <details className="am-voice-history"><summary>{en ? 'Earlier recordings' : '이전 녹음 관리'} · {data.history.length}</summary>{data.history.map(item => <div key={item.id}><span>{item.caption.slice(0, 60) || (en ? 'Earlier recording' : '이전 녹음')} · {Math.round(item.duration)}{en ? 's' : '초'}</span><button type="button" disabled={busy || recording} onClick={() => remove(item)}><Trash2 size={14}/>{en ? 'Delete' : '삭제'}</button></div>)}</details>}
 {data.viewer.manage && getPublicLink && <ArtworkQrLabel getLink={getPublicLink} title={title} artist={artist} en={en}/>}</>}
 {busy && <p role="status"><LoaderCircle size={15} className="spin"/>{en ? 'Saving…' : '처리하고 있어요…'}</p>}{notice && <p className="am-note" role="status">{notice}</p>}{error && <p className="am-error" role="alert">{error}</p>}</section>;
}
