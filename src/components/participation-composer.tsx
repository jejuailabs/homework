'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {useTranslations} from 'next-intl';
import {Check, FileText, ImagePlus, Link2, LoaderCircle, MapPin, Mic, Paperclip, Pencil, Plus, Send, Square, Trash2, Video, Vote, X} from 'lucide-react';
import {boardThemes, type BoardAttachment, type BoardPost, type BoardPostInput, type BoardTheme, type BoardUploadResponse, type ParticipationBoard} from '@/lib/participation-types';
import BoardDrawingPad from './board-drawing-pad';
import {BoardDialog, BoardRequestError, Friend, boardRequest, readDraft, removeDraft, requestId, safeLink, saveDraft} from './participation-shared';

type QueuedFile = {id: string; file: File; preview?: string};
type Draft = {title: string; body: string; link: string; color: BoardTheme; sectionId: string; pollQuestion: string; options: {id: string; text: string}[]; locationName: string; lat: string; lng: string};

export default function ParticipationComposer({board, viewerId, post, sectionId = '', onClose, onSaved}: {board: ParticipationBoard; viewerId: string; post?: BoardPost; sectionId?: string; onClose: () => void; onSaved: (post: BoardPost) => void}) {
  const t = useTranslations('participation');
  const draftKey = `participation:${viewerId}:${board.id}:post:${post?.id || 'new'}`;
  const [title, setTitle] = useState(post?.title || ''), [body, setBody] = useState(post?.body || ''), [link, setLink] = useState(post?.link || '');
  const [color, setColor] = useState<BoardTheme>(post?.color || 'peach'), [section, setSection] = useState(post?.sectionId || sectionId);
  const [retained, setRetained] = useState<BoardAttachment[]>(post?.attachments || []), [files, setFiles] = useState<QueuedFile[]>([]);
  const [pollQuestion, setPollQuestion] = useState(post?.poll?.question || ''), [options, setOptions] = useState(post?.poll?.options.map(option => ({id: option.id, text: option.text})) || [{id: 'option-1', text: ''}, {id: 'option-2', text: ''}]);
  const [locationName, setLocationName] = useState(post?.location?.label || ''), [lat, setLat] = useState(post?.location ? String(post.location.lat) : ''), [lng, setLng] = useState(post?.location ? String(post.location.lng) : '');
  const [showDrawing, setShowDrawing] = useState(false);
  const [showLink, setShowLink] = useState(!!post?.link), [showPoll, setShowPoll] = useState(!!post?.poll), [showLocation, setShowLocation] = useState(!!post?.location || board.layout === 'map');
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState(''), [draftReady, setDraftReady] = useState(false), [restored, setRestored] = useState(false);
  const [recording, setRecording] = useState(false), [recordSeconds, setRecordSeconds] = useState(0);
  const input = useRef<HTMLInputElement>(null), fileRef = useRef<QueuedFile[]>([]), uploaded = useRef(new Map<string, string>()), submitId = useRef(requestId());
  const recorder = useRef<MediaRecorder | null>(null), recordingStream = useRef<MediaStream | null>(null), mounted = useRef(true), recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const draft = readDraft<Draft>(draftKey);
    if (draft) {setTitle(draft.title || ''); setBody(draft.body || ''); setLink(draft.link || ''); setColor(boardThemes.includes(draft.color) ? draft.color : 'peach'); setSection(draft.sectionId || sectionId); setPollQuestion(draft.pollQuestion || ''); setOptions(draft.options?.length >= 2 ? draft.options.map((option, index) => typeof option === 'string' ? {id: `option-${index + 1}`, text: option} : option) : [{id: 'option-1', text: ''}, {id: 'option-2', text: ''}]); setLocationName(draft.locationName || ''); setLat(draft.lat || ''); setLng(draft.lng || ''); setShowLink(!!draft.link); setShowPoll(!!draft.pollQuestion); setShowLocation(!!draft.locationName || board.layout === 'map'); setRestored(true);}
    setDraftReady(true);
  }, [draftKey, sectionId, board.layout]);
  useEffect(() => {if (draftReady) saveDraft(draftKey, {title, body, link, color, sectionId: section, pollQuestion, options, locationName, lat, lng});}, [draftReady, draftKey, title, body, link, color, section, pollQuestion, options, locationName, lat, lng]);
  useEffect(() => {fileRef.current = files;}, [files]);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false; fileRef.current.forEach(file => {if (file.preview) URL.revokeObjectURL(file.preview);}); if (recordingTimer.current) clearInterval(recordingTimer.current); recorder.current?.state === 'recording' && recorder.current.stop(); recordingStream.current?.getTracks().forEach(track => track.stop());};}, []);

  function addFiles(incoming: File[]) {
    if (fileRef.current.length + retained.length + incoming.length > 10) {setError(t('attachmentLimit')); return;}
    const added = incoming.map(file => ({id: requestId(), file, ...(file.type.startsWith('image/') ? {preview: URL.createObjectURL(file)} : {})}));
    setFiles(previous => [...previous, ...added]); setError('');
  }
  function chooseFiles(accept: string) {if (input.current) {input.current.accept = accept; input.current.click();}}
  async function startRecording() {
    if (recording || busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      if (!mounted.current) {stream.getTracks().forEach(track => track.stop()); return;}
      const instance = new MediaRecorder(stream), chunks: BlobPart[] = [];
      recorder.current = instance; recordingStream.current = stream;
      instance.ondataavailable = event => {if (event.data.size) chunks.push(event.data);};
      instance.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); if (recordingTimer.current) clearInterval(recordingTimer.current);
        if (!mounted.current) return;
        const contentType = instance.mimeType.split(';')[0] || 'audio/webm';
        const extension = contentType.includes('mp4') ? 'm4a' : contentType.includes('ogg') ? 'ogg' : 'webm';
        addFiles([new File(chunks, `${t('recordedFile')}.${extension}`, {type: contentType})]); setRecording(false);
      };
      instance.start(); setRecording(true); setRecordSeconds(0); setError('');
      recordingTimer.current = setInterval(() => setRecordSeconds(seconds => {if (seconds >= 119 && instance.state === 'recording') instance.stop(); return seconds + 1;}), 1000);
    } catch {recordingStream.current?.getTracks().forEach(track => track.stop()); setError(t('recordError'));}
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || recording) return;
    if (!title.trim() && !body.trim() && !link.trim() && !files.length && !retained.length && !showPoll) {setError(t('requiredPost')); return;}
    if (link.trim() && !safeLink(link.trim())) {setError(t('linkInvalid')); return;}
    const cleanOptions = options.map(option => ({...option, text: option.text.trim()})).filter(option => option.text);
    if (showPoll && (!pollQuestion.trim() || cleanOptions.length < 2 || new Set(cleanOptions.map(option => option.text)).size !== cleanOptions.length)) {setError(t('pollRequired')); return;}
    if (showLocation && (locationName.trim() || lat || lng) && (!lat.trim() || !lng.trim() || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180)) {setError(t('locationInvalid')); return;}
    setBusy(true); setError(''); setProgress(0);
    try {
      const uploadIds = retained.map(file => file.id);
      for (let index = 0; index < files.length; index++) {
        const entry = files[index]; let id = uploaded.current.get(entry.id);
        if (!id) {
          const upload = await boardRequest<BoardUploadResponse>(`/api/boards/${board.id}/uploads`, {method: 'POST', body: JSON.stringify({requestId: entry.id, name: entry.file.name, contentType: entry.file.type || 'application/octet-stream', size: entry.file.size})});
          const result = await fetch(upload.uploadUrl, {method: upload.method, headers: upload.headers, body: entry.file});
          if (!result.ok) throw new Error('UPLOAD_FAILED');
          const final = await boardRequest<{attachment: BoardAttachment}>(`/api/boards/${board.id}/uploads/${upload.uploadId}/finalize`, {method: 'POST', body: '{}'});
          id = final.attachment.id; uploaded.current.set(entry.id, id);
        }
        uploadIds.push(id); setProgress(Math.round(((index + 1) / files.length) * 100));
      }
      const payload: BoardPostInput = {requestId: submitId.current, title: title.trim(), body: body.trim(), sectionId: board.sections.some(item => item.id === section) ? section : '', color, uploadIds, link: link.trim(), poll: showPoll ? {question: pollQuestion.trim(), options: cleanOptions} : null, location: showLocation && lat.trim() && lng.trim() ? {lat: Number(lat), lng: Number(lng), label: locationName.trim()} : null, ...(post ? {version: post.version} : {})};
      const result = await boardRequest<{post: BoardPost}>(`/api/boards/${board.id}/posts${post ? `/${post.id}` : ''}`, {method: post ? 'PATCH' : 'POST', body: JSON.stringify(payload)});
      removeDraft(draftKey); onSaved(result.post);
    } catch (cause) {setError(t(cause instanceof BoardRequestError && cause.code === 'STORAGE_LIMIT' ? 'storageLimit' : cause instanceof BoardRequestError && cause.status === 409 ? 'conflict' : cause instanceof BoardRequestError && ['FILE_SIZE', 'FILE_TYPE', 'UPLOAD_LIMIT'].includes(cause.code) ? 'fileLimit' : 'saveError'));}
    finally {setBusy(false);}
  }
  return <BoardDialog title={t(post ? 'edit' : 'addPost')} onClose={onClose} busy={busy || recording} className="pb-composer">
    <form onSubmit={submit} onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault(); if (!busy) addFiles(Array.from(event.dataTransfer.files));}}>
      <fieldset disabled={busy} className="pb-form-body">
        <div className="pb-composer-author"><Friend character={board.character}/><span>{board.className}<small>{t(restored ? 'draftRestored' : 'draftSaved')}</small></span></div>
        <input aria-label={t('postTitle')} data-testid="pb-post-title" className="pb-title-input" placeholder={t('postTitlePlaceholder')} value={title} onChange={event => setTitle(event.target.value)} maxLength={200}/>
        <textarea aria-label={t('postBody')} data-testid="pb-post-body" className="pb-body-input" placeholder={t('postBodyPlaceholder')} value={body} onChange={event => setBody(event.target.value)} maxLength={10000}/>
        {!!(retained.length || files.length) && <div className="pb-file-queue">{retained.map(file => <div key={file.id}>{file.kind === 'image' ? <img src={file.url} alt=""/> : <FileText size={24}/>}<span>{file.name}</span><button type="button" className="pb-icon" aria-label={`${t('remove')}: ${file.name}`} onClick={() => setRetained(previous => previous.filter(value => value.id !== file.id))}><X size={16}/></button></div>)}{files.map(entry => <div key={entry.id}>{entry.preview ? <img src={entry.preview} alt=""/> : <FileText size={24}/>}<span>{entry.file.name}</span><button type="button" className="pb-icon" aria-label={`${t('remove')}: ${entry.file.name}`} onClick={() => {if (entry.preview) URL.revokeObjectURL(entry.preview); setFiles(previous => previous.filter(value => value.id !== entry.id));}}><X size={16}/></button></div>)}</div>}
        {files.length > 0 && <small className="pb-muted">{t('draftLimit')}</small>}
        {showLink && <label>{t('link')}<input type="url" placeholder="https://" value={link} onChange={event => setLink(event.target.value)} maxLength={2000}/></label>}
        {showPoll && <div className="pb-poll-editor"><label>{t('pollQuestion')}<input value={pollQuestion} onChange={event => setPollQuestion(event.target.value)} maxLength={200}/></label>{options.map((option, index) => <div className="pb-option-input" key={option.id}><input aria-label={t('pollOption', {number: index + 1})} placeholder={t('pollOption', {number: index + 1})} value={option.text} onChange={event => setOptions(previous => previous.map((value, item) => item === index ? {...value, text: event.target.value} : value))} maxLength={150}/>{options.length > 2 && <button className="pb-icon" type="button" aria-label={t('remove')} onClick={() => setOptions(previous => previous.filter((_, item) => item !== index))}><X size={16}/></button>}</div>)}<div className="pb-flex"><button className="pb-text-button" type="button" disabled={options.length >= 10} onClick={() => setOptions(previous => [...previous, {id: requestId(), text: ''}])}><Plus size={15}/>{t('addOption')}</button><button className="pb-text-button" type="button" onClick={() => {setShowPoll(false); setPollQuestion(''); setOptions([{id: 'option-1', text: ''}, {id: 'option-2', text: ''}]);}}><Trash2 size={15}/>{t('remove')}</button></div></div>}
        {showLocation && <div className="pb-location-editor"><label>{t('locationName')}<input value={locationName} maxLength={120} onChange={event => setLocationName(event.target.value)}/></label><div className="pb-two-col"><label>{t('latitude')}<input type="number" step="any" min={-90} max={90} value={lat} onChange={event => setLat(event.target.value)}/></label><label>{t('longitude')}<input type="number" step="any" min={-180} max={180} value={lng} onChange={event => setLng(event.target.value)}/></label></div></div>}
        <input ref={input} type="file" multiple hidden onChange={event => {addFiles(Array.from(event.target.files || [])); event.target.value = '';}}/>
        <div className="pb-attachment-tools"><button type="button" title={t('photo')} onClick={() => chooseFiles('image/*')}><ImagePlus size={20}/><span>{t('photo')}</span></button><button type="button" title={t('video')} onClick={() => chooseFiles('video/*')}><Video size={20}/><span>{t('video')}</span></button><button type="button" title={t('record')} disabled={recording} onClick={() => void startRecording()}><Mic size={20}/><span>{t('audio')}</span></button><button type="button" onClick={() => chooseFiles('*/*')}><Paperclip size={20}/><span>{t('file')}</span></button><button type="button" onClick={() => setShowLink(value => !value)} aria-pressed={showLink}><Link2 size={20}/><span>{t('link')}</span></button><button type="button" onClick={() => setShowPoll(value => !value)} aria-pressed={showPoll}><Vote size={20}/><span>{t('poll')}</span></button><button type="button" onClick={() => setShowDrawing(value => !value)} aria-pressed={showDrawing}><Pencil size={20}/><span>{t('drawing')}</span></button><button type="button" onClick={() => setShowLocation(value => !value)} aria-pressed={showLocation}><MapPin size={20}/><span>{t('location')}</span></button></div>
        {showDrawing && <BoardDrawingPad onAttach={file => addFiles([file])} onClose={() => setShowDrawing(false)}/>}
        {recording && <div className="pb-recording" role="status"><span className="pb-live-dot"/>{t('recording')} {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}<button type="button" onClick={() => recorder.current?.stop()}><Square size={15}/>{t('stopRecording')}</button></div>}
        <div className="pb-composer-options"><div className="pb-color-options" role="group" aria-label={t('color')}>{boardThemes.map(value => <button key={value} type="button" className={`pb-color-swatch pb-tone-${value} ${color === value ? 'selected' : ''}`} aria-label={t(`theme_${value}`)} aria-pressed={color === value} onClick={() => setColor(value)}>{color === value && <Check size={14}/>}</button>)}</div>{board.sections.length > 0 && <select aria-label={t('section')} value={section} onChange={event => setSection(event.target.value)}><option value="">{t('untitledSection')}</option>{board.sections.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>}</div>
        {board.anonymous && <small className="pb-muted">{t('anonymousHint')}</small>}
        {error && <div className="pb-alert" role="alert">{error}</div>}
        {busy && files.length > 0 && <div className="pb-upload-progress" role="status"><progress max={100} value={progress}/>{t('uploading', {progress})}</div>}
      </fieldset>
      <footer className="pb-dialog-footer"><button className="pb-button" type="button" onClick={onClose} disabled={busy || recording}>{t('cancel')}</button><button className="pb-button primary" data-testid="pb-publish-post" type="submit" disabled={busy || recording}>{busy ? <LoaderCircle className="spin" size={17}/> : <Send size={17}/>} {t(busy ? 'posting' : post ? 'save' : 'publish')}</button></footer>
    </form>
  </BoardDialog>;
}
