'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Headphones, LoaderCircle, Mic, Minus, Pencil, Plus, RefreshCw, RotateCcw, Save, Square, Trash2, X } from 'lucide-react';
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
        transcribe: boolean;
    };
};
/** idle → studio(원고 쓰기) → countdown → recording(프롬프터) → review(미리 듣기) → 저장 */
type Mode = 'idle' | 'studio' | 'countdown' | 'recording' | 'review';
const MAX_SECONDS = 60, SCRIPT_MAX = 1000, CHARS_PER_SECOND = 5, FONT_SIZES = [20, 26, 32], SCROLL_SPEEDS = [0, 14, 26];
const readStored = (key: string) => { try {
    return localStorage.getItem(key) || '';
}
catch {
    return '';
} };
const writeStored = (key: string, value: string) => { try {
    if (value)
        localStorage.setItem(key, value);
    else
        localStorage.removeItem(key);
}
catch { } };
export default function VoiceCaption({ endpoint, en = false, title, artist, getPublicLink }: {
    endpoint: string;
    en?: boolean;
    title: string;
    artist: string;
    getPublicLink?: () => Promise<string>;
}) {
    const say = (ko: string, english: string) => en ? english : ko;
    const [data, setData] = useState<Listing | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [mode, setMode] = useState<Mode>('idle'), [script, setScript] = useState(''), [count, setCount] = useState(3), [seconds, setSeconds] = useState(0), [fontStep, setFontStep] = useState(1), [speedStep, setSpeedStep] = useState(1), [editing, setEditing] = useState(false), [caption, setCaption] = useState(''), [local, setLocal] = useState<{
        bytes: Uint8Array;
        url: string;
        id: string;
        duration: number;
    } | null>(null);
    const alive = useRef(true), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), timer = useRef<ReturnType<typeof setInterval> | null>(null), limit = useRef<ReturnType<typeof setTimeout> | null>(null), countdown = useRef<ReturnType<typeof setTimeout> | null>(null), localUrl = useRef(''), prompter = useRef<HTMLDivElement>(null);
    const storageKey = 'voice-script:' + endpoint;
    const url = useCallback((suffix = '') => moduleUrl(endpoint, 'voice', suffix), [endpoint]);
    const load = useCallback(async () => { const d = await moduleRequest<Listing>(url()); if (alive.current)
        setData(d); }, [url]);
    const clearTimers = () => { [timer, limit].forEach(r => { if (r.current)
        clearInterval(r.current); r.current = null; }); if (countdown.current)
        clearTimeout(countdown.current); countdown.current = null; };
    const releaseMic = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
    useEffect(() => { alive.current = true; setData(null); setMode('idle'); void load().catch(e => { if (alive.current)
        setError(e.message); }); return () => { alive.current = false; if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.onstop = null;
        recorder.current.stop();
    } releaseMic(); clearTimers(); if (localUrl.current)
        URL.revokeObjectURL(localUrl.current); }; }, [load]);
    const subtitling = data?.draft?.transcription === 'running' || data?.active?.transcription === 'running';
    useEffect(() => { if (!subtitling)
        return; const poll = setInterval(() => { if (!document.hidden)
        void load().catch(e => setError(e.message)); }, 3500); return () => clearInterval(poll); }, [subtitling, load]);
    // Teleprompter: scroll the script slowly while recording; children can still scroll by hand.
    useEffect(() => { const speed = SCROLL_SPEEDS[speedStep]; if (mode !== 'recording' || !speed)
        return; let frame = 0, last = 0, carry = 0; const startAt = performance.now() + 1500; const step = (now: number) => { const box = prompter.current; if (box && now > startAt) {
        carry += speed * (last ? now - last : 0) / 1000;
        const whole = Math.floor(carry);
        if (whole) {
            box.scrollTop += whole;
            carry -= whole;
        }
        last = now;
    } frame = requestAnimationFrame(step); }; frame = requestAnimationFrame(step); return () => cancelAnimationFrame(frame); }, [mode, speedStep]);
    async function action(work: () => Promise<unknown>, message = '') { if (busy)
        return false; setBusy(true); setError(''); setNotice(''); try {
        await work();
        if (alive.current) {
            setNotice(message);
            await load();
        }
        return true;
    }
    catch (e) {
        if (alive.current) {
            setError((e as Error).message);
            await load().catch(() => { });
        }
        return false;
    }
    finally {
        if (alive.current)
            setBusy(false);
    } }
    function changeScript(value: string) { setScript(value); writeStored(storageKey, value); }
    function openStudio() { setError(''); setNotice(''); setEditing(false); setScript(readStored(storageKey) || data?.draft?.caption || ''); setMode('studio'); }
    function discardLocal() { if (localUrl.current)
        URL.revokeObjectURL(localUrl.current); localUrl.current = ''; setLocal(null); }
    function closeStudio() { stop(true); discardLocal(); setMode('idle'); }
    function stop(cancel = false) { clearTimers(); if (recorder.current?.state === 'recording') {
        if (cancel)
            recorder.current.onstop = null;
        recorder.current.stop();
    } releaseMic(); if (cancel && alive.current)
        setMode(m => m === 'countdown' || m === 'recording' ? 'studio' : m); }
    async function prepare(blob: Blob) { if (!alive.current)
        return; setBusy(true); try {
        const bytes = await normalizeRecording(blob);
        if (!alive.current)
            return;
        discardLocal();
        localUrl.current = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'audio/wav' }));
        setLocal({ bytes, url: localUrl.current, id: crypto.randomUUID(), duration: (bytes.length - 44) / 32000 });
        setCaption(script);
        setMode('review');
    }
    catch (e) {
        if (alive.current) {
            setError((e as Error).message);
            setMode('studio');
        }
    }
    finally {
        if (alive.current)
            setBusy(false);
    } }
    function record(media: MediaStream) { const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type)), rec = new MediaRecorder(media, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined), chunks: BlobPart[] = [];
        recorder.current = rec;
        rec.ondataavailable = e => { if (e.data.size)
            chunks.push(e.data); };
        rec.onerror = () => { stop(true); setError(say('녹음을 완료하지 못했어요. 다시 시도해 주세요.', 'Recording failed. Please try again.')); };
        rec.onstop = () => { releaseMic(); clearTimers(); if (alive.current)
            void prepare(new Blob(chunks, { type: rec.mimeType })); };
        rec.start(500);
        setSeconds(0);
        setMode('recording');
        if (prompter.current)
            prompter.current.scrollTop = 0;
        timer.current = setInterval(() => setSeconds(s => s + 1), 1000);
        limit.current = setTimeout(() => stop(), MAX_SECONDS * 1000); }
    async function begin() { if (busy)
        return; setError(''); setNotice(''); try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
            throw Error();
        const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        if (!alive.current) {
            media.getTracks().forEach(t => t.stop());
            return;
        }
        stream.current = media;
        // A short 3-2-1 lets children take a breath and find the first line.
        setCount(3);
        setMode('countdown');
        const tick = (n: number) => { countdown.current = setTimeout(() => { if (!alive.current || stream.current !== media)
            return; if (n > 1) {
            setCount(n - 1);
            tick(n - 1);
        }
        else
            record(media); }, 1000); };
        tick(3);
    }
    catch {
        releaseMic();
        setError(say('마이크를 쓸 수 없어요. 브라우저 주소창 옆의 마이크 권한을 허용한 뒤 다시 눌러 주세요.', 'Microphone unavailable. Allow microphone access in your browser, then try again.'));
    } }
    async function save() { if (!local)
        return; const selected = local, text = caption.trim(), replace = data?.draft;
        const ok = await action(async () => {
            if (replace)
                await moduleRequest(url('/' + replace.id), { method: 'DELETE' });
            const saved = await moduleRequest<{
                recording: Recording;
            }>(url('/' + selected.id), { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: Uint8Array.from(selected.bytes).buffer });
            discardLocal();
            if (text)
                await moduleRequest(url('/' + selected.id), jsonRequest('PATCH', { caption: text, version: saved.recording.version }));
            // One paid subtitle request per upload, in the background: a failure only shows a retry button and never blocks playback.
            if (data?.viewer.transcribe)
                void moduleRequest(url('/' + selected.id + '/transcribe'), jsonRequest('POST', {})).catch(() => undefined).finally(() => { if (alive.current)
                    void load().catch(() => undefined); });
        }, data?.viewer.manage ? say('작품에 녹음을 올렸어요. 확인 후 공개해 주세요.', 'Recording added. Approve it to share.') : say('작품에 녹음을 올렸어요! 선생님이 확인하면 친구들과 관람객에게도 공개돼요.', 'Your recording is on your artwork! It will be shared after your teacher checks it.'));
        if (ok && alive.current) {
            writeStored(storageKey, '');
            setScript('');
            setMode('idle');
        } }
    function remove(item: Recording, published = false) { if (!confirm(published ? say('공개된 녹음과 글을 지울까요? 지우면 작품에서 바로 사라져요.', 'Delete the shared recording? It will disappear from the artwork.') : say('이 녹음과 글을 지울까요?', 'Delete this recording and its text?')))
        return; void action(() => moduleRequest(url('/' + item.id), { method: 'DELETE' }), say('녹음을 지웠어요.', 'Recording deleted.')); }
    async function saveCaption(item: Recording) { if (await action(() => moduleRequest(url('/' + item.id), jsonRequest('PATCH', { caption, version: item.version })), say('글을 고쳤어요.', 'Text updated.')) && alive.current)
        setEditing(false); }
    const draft = data?.draft, active = data?.active, inStudio = mode !== 'idle', estimate = Math.ceil(script.trim().length / CHARS_PER_SECOND), left = Math.max(0, MAX_SECONDS - seconds);
    const studio = <div className="am-studio">
        {mode === 'studio' && <>
            <label>{say('내 원고 (써도 되고, 안 써도 돼요)', 'My script (optional)')}<textarea value={script} rows={5} maxLength={SCRIPT_MAX} placeholder={say('예) 안녕하세요, 제 작품은 바다에 사는 고래예요. 고래가 친구를 찾으러 가는 모습을 그렸어요.', 'e.g. Hi! My artwork is a whale looking for a friend in the sea.')} onChange={e => changeScript(e.target.value)}/></label>
            <p className="am-script-meta"><span>{script.length}/{SCRIPT_MAX}{say('자', ' chars')}</span>{script.trim() && <span className={estimate > MAX_SECONDS ? 'am-warn' : ''}>{say(`읽는 데 약 ${estimate}초`, `About ${estimate}s to read`)}{estimate > MAX_SECONDS && say(' · 60초가 넘을 수 있어요. 조금 줄여 볼까요?', ' · may go over 60s')}</span>}</p>
            <p className="am-note">{say('원고를 쓰면 녹음할 때 프롬프터처럼 큰 글씨로 보여 줘요. 원고 없이 바로 녹음해도 괜찮아요. 연락처·주소 같은 개인 정보는 말하지 않아요.', 'Your script will scroll in large type like a teleprompter while you record. You can also record without one. Please keep private details out of your story.')}</p>
            <div className="am-actions"><button className="am-primary am-big" type="button" disabled={busy} onClick={() => void begin()}><Mic size={18}/>{script.trim() ? say('원고 보면서 녹음 시작', 'Start recording') : say('바로 녹음 시작', 'Start recording')}</button><button type="button" disabled={busy} onClick={closeStudio}><X size={15}/>{say('닫기', 'Close')}</button></div>
        </>}
        {(mode === 'countdown' || mode === 'recording') && <>
            <div className="am-prompter-wrap">
                <div ref={prompter} className={'am-prompter' + (script.trim() ? '' : ' am-prompter-empty')} style={{ fontSize: FONT_SIZES[fontStep] }} tabIndex={0} aria-label={say('원고 프롬프터', 'Script prompter')}>{script.trim() || say('원고 없이 녹음하고 있어요. 내 작품 이야기를 자유롭게 들려주세요!', 'Recording without a script. Tell us about your artwork!')}</div>
                {mode === 'countdown' && <div className="am-countdown" role="status" aria-live="assertive"><span key={count}>{count}</span><small>{say('곧 녹음이 시작돼요', 'Recording starts soon')}</small></div>}
            </div>
            <div className="am-meter" role="status" aria-live="off"><span className="am-rec-dot" data-on={mode === 'recording'}/>{mode === 'recording' ? say(`녹음 중 ${seconds}초 · 남은 시간 ${left}초`, `Recording ${seconds}s · ${left}s left`) : say('준비하세요', 'Get ready')}<i style={{ width: `${Math.min(100, seconds / MAX_SECONDS * 100)}%` }}/></div>
            <div className="am-actions">
                {mode === 'recording' ? <button className="am-recording am-big" type="button" onClick={() => stop()}><Square size={17}/>{say('녹음 마치기', 'Finish')}</button> : <button className="am-big" type="button" onClick={() => stop(true)}><X size={17}/>{say('취소', 'Cancel')}</button>}
                {script.trim() && <span className="am-tools"><button type="button" aria-label={say('글자 작게', 'Smaller text')} disabled={fontStep === 0} onClick={() => setFontStep(s => s - 1)}><Minus size={14}/>{say('가', 'A')}</button><button type="button" aria-label={say('글자 크게', 'Larger text')} disabled={fontStep === FONT_SIZES.length - 1} onClick={() => setFontStep(s => s + 1)}><Plus size={14}/>{say('가', 'A')}</button><button type="button" onClick={() => setSpeedStep(s => (s + 1) % SCROLL_SPEEDS.length)}>{[say('자동 넘김 끔', 'Auto-scroll off'), say('천천히 넘김', 'Slow scroll'), say('조금 빠르게', 'Faster scroll')][speedStep]}</button></span>}
            </div>
        </>}
        {mode === 'review' && local && <>
            <p className="am-step">{say('잘 녹음됐는지 들어 보세요', 'Listen to your recording')} · {Math.round(local.duration)}{say('초', 's')}</p>
            <audio controls src={local.url} aria-label={say('녹음 미리 듣기', 'Listen to recording')}/>
            <label>{say('작품에 함께 보여 줄 글', 'Text shown with your artwork')}<textarea value={caption} rows={4} maxLength={3000} placeholder={say('비워 두면 목소리만 올라가요.', 'Leave empty to share only your voice.')} onChange={e => setCaption(e.target.value)}/></label>
            <div className="am-actions"><button className="am-primary am-big" type="button" disabled={busy} onClick={() => void save()}><Save size={17}/>{draft ? say('이 녹음으로 바꾸기', 'Replace with this recording') : say('작품에 올리기', 'Add to my artwork')}</button><button type="button" disabled={busy} onClick={() => { discardLocal(); setMode('studio'); }}><RotateCcw size={15}/>{say('다시 녹음', 'Record again')}</button><button type="button" disabled={busy} onClick={closeStudio}><X size={15}/>{say('그만하기', 'Cancel')}</button></div>
        </>}
    </div>;
    const captionEditor = (item: Recording) => <><label>{say('작품 설명 글', 'Artwork text')}<textarea value={caption} rows={4} maxLength={3000} disabled={busy} onChange={e => setCaption(e.target.value)}/></label><div className="am-actions"><button className="am-primary" type="button" disabled={busy || caption.trim() === item.caption} onClick={() => void saveCaption(item)}><Save size={15}/>{say('글 저장', 'Save text')}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>{say('취소', 'Cancel')}</button></div></>;
    const locked = busy || inStudio;
    const subtitles = (item: Recording) => item.transcription === 'running' ? <p className="am-note" role="status"><LoaderCircle size={15} className="spin"/>{say('녹음을 자막으로 옮기고 있어요… 녹음은 지금도 들을 수 있어요.', 'Making subtitles… you can already listen.')}</p> : !item.transcript && data?.viewer.transcribe && (item.transcription === 'failed' || data.viewer.manage) && !editing ? <div className="am-actions">{item.transcription === 'failed' && <span className="am-note">{say('자막을 만들지 못했어요. 녹음은 그대로 들을 수 있어요.', 'Subtitles failed. The recording still plays.')}</span>}<button type="button" disabled={locked} onClick={() => void action(() => moduleRequest(url('/' + item.id + '/transcribe'), jsonRequest('POST', { retry: item.transcription === 'failed' })), say('자막을 만들었어요.', 'Subtitles ready.'))}>{item.transcription === 'failed' ? say('자막 다시 만들기', 'Retry subtitles') : say('자막 만들기 · AI 비용', 'Make subtitles · AI cost')}</button></div> : null;
    return <section className="am-panel am-voice" aria-label={say('아이 목소리 도슨트', 'Voice docent')}><header><span className="am-symbol"><Headphones size={20}/></span><div><h3>{say('아이 목소리 도슨트', 'The artist’s own voice')}</h3><p>{say('작은 작가가 들려주는 작품 이야기', 'A little story, in the artist’s own words.')}</p></div><button type="button" aria-label={say('음성 새로고침', 'Refresh voice')} disabled={locked} onClick={() => void load().catch(e => setError(e.message))}><RefreshCw size={16}/></button></header>
 {!data && !error && <LoaderCircle className="spin"/>}{data && <>
 {active && <div className="am-published-voice"><span className="am-badge">{say('공개된 이야기', 'Shared story')}</span><VoicePlayer src={active.audioUrl} label={say('작가 음성 듣기', 'Play artist voice')} en={en} transcript={active.transcript}/>{(data.viewer.manage || data.viewer.record) && subtitles(active)}{active.caption && <p>{active.caption}</p>}{(data.viewer.manage || data.viewer.record) && !inStudio && <div className="am-actions">{data.viewer.record && !draft && <button type="button" disabled={busy} onClick={openStudio}><Mic size={15}/>{say('새로 녹음하기', 'Record a new one')}</button>}{data.viewer.manage && <button type="button" disabled={busy} onClick={() => void action(() => moduleRequest(url('/' + active.id), jsonRequest('PATCH', { status: 'hidden', version: active.version })), say('공개를 멈췄어요.', 'Stopped sharing.'))}>{say('이 음성 공개 중지', 'Stop sharing this voice')}</button>}{data.viewer.record && <button type="button" className="am-delete" disabled={busy} onClick={() => remove(active, true)}><Trash2 size={14}/>{say('삭제', 'Delete')}</button>}</div>}{active && draft && <p className="am-note">{say('새 녹음은 선생님이 확인하면 지금 녹음과 바뀌어요.', 'The new recording replaces this one after teacher approval.')}</p>}</div>}
 {!active && !draft && !data.viewer.record && <p className="am-note">{say('작가의 이야기를 준비하고 있어요.', 'The artist’s story is being prepared.')}</p>}
 {draft && <div className="am-voice-draft"><span className="am-badge">{say('내 녹음 · 선생님 확인 중', 'My recording · waiting for teacher')}</span>{draft.uploadStatus === 'ready' ? <><VoicePlayer src={draft.audioUrl} label={say('내 녹음 듣기', 'Play my recording')} en={en} transcript={draft.transcript}/>{subtitles(draft)}
  {editing ? captionEditor(draft) : draft.caption ? <p className="am-draft-text">{draft.caption}</p> : <p className="am-note">{say('함께 보여 줄 글이 없어요. 목소리만 올라가요.', 'No text yet — only your voice will be shared.')}</p>}
  {!editing && !inStudio && <div className="am-actions">{data.viewer.manage && <button type="button" className="am-primary" disabled={busy} onClick={() => void action(() => moduleRequest(url('/' + draft.id), jsonRequest('PATCH', { status: 'approved', version: draft.version })), say('작가의 이야기를 공개했어요.', 'Story shared.'))}><Check size={15}/>{say('승인하고 공개', 'Approve & share')}</button>}<button type="button" disabled={busy} onClick={() => { setCaption(draft.caption); setEditing(true); }}><Pencil size={14}/>{draft.caption ? say('글 고치기', 'Edit text') : say('글 쓰기', 'Add text')}</button>{data.viewer.record && <button type="button" disabled={busy} onClick={openStudio}><Mic size={14}/>{say('다시 녹음하기', 'Record again')}</button>}<button type="button" className="am-delete" disabled={busy} onClick={() => remove(draft)}><Trash2 size={14}/>{say('삭제', 'Delete')}</button></div>}</> : <><p className="am-note">{say('전송이 끝나지 않은 녹음이에요. 잠시 후 삭제하고 다시 녹음해 주세요.', 'The upload did not finish. Delete it and record again shortly.')}</p><button type="button" className="am-delete" disabled={locked} onClick={() => remove(draft)}><Trash2 size={14}/>{say('삭제', 'Delete')}</button></>}</div>}
 {data.viewer.record && !active && !draft && !inStudio && <div className="am-recorder"><p>{say('내 작품을 목소리로 소개해 볼까요? 60초까지 녹음할 수 있어요.', 'Introduce your artwork in your own voice — up to 60 seconds.')}</p><div className="am-actions"><button className="am-primary am-big" type="button" disabled={busy} onClick={openStudio}><Mic size={18}/>{say('내 이야기 녹음하기', 'Record my story')}</button></div></div>}
 {data.viewer.record && inStudio && studio}
 {data.history.length > 0 && <details className="am-voice-history"><summary>{say('이전 녹음 관리', 'Earlier recordings')} · {data.history.length}</summary>{data.history.map(item => <div key={item.id}><span>{item.caption.slice(0, 60) || say('이전 녹음', 'Earlier recording')} · {Math.round(item.duration)}{say('초', 's')}</span><button type="button" disabled={locked} onClick={() => remove(item)}><Trash2 size={14}/>{say('삭제', 'Delete')}</button></div>)}</details>}
 {data.viewer.manage && getPublicLink && <ArtworkQrLabel getLink={getPublicLink} title={title} artist={artist} en={en}/>}</>}
 {busy && <p role="status"><LoaderCircle size={15} className="spin"/>{say('처리하고 있어요…', 'Saving…')}</p>}{notice && <p className="am-note" role="status">{notice}</p>}{error && <p className="am-error" role="alert">{error}</p>}</section>;
}
