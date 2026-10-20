'use client';
import {useEffect, useRef, useState} from 'react';
import {useLocale} from 'next-intl';
import {sendUpload} from '@/lib/upload-transfer';
import {ImagePlus, LoaderCircle, Paperclip, RefreshCw, X} from 'lucide-react';
import {ASSIGNMENT_MATERIAL_LIMIT, assignmentMaterialMime, validAssignmentMaterial, type AssignmentMaterial} from '@/lib/assignment-materials';
import '@/styles/assignment-materials.css';

async function api(path: string, data?: unknown, method = 'POST') {
  const response = await fetch(path, {method, headers: {'Content-Type': 'application/json'}, ...(data !== undefined ? {body: JSON.stringify(data)} : {})});
  const body = await response.json(); if (!response.ok) throw new Error(body.error || '자료를 처리하지 못했어요.'); return body;
}
export function AssignmentMaterials({materials = [], onRefresh}: {materials?: AssignmentMaterial[]; onRefresh?: () => void}) {
  const en = useLocale() === 'en';
  if (!materials.length) return null;
  return <section className="assignment-materials" aria-label={en ? 'Teacher reference materials' : '선생님 참고 자료'}><h3><Paperclip size={17}/>{en ? 'Teacher reference materials' : '선생님 참고 자료'}</h3><div className="assignment-material-grid">{materials.map(material => <figure key={material.id}>
    {material.url ? material.contentType.startsWith('image/') ? <a href={material.url} target="_blank" rel="noopener noreferrer"><img src={material.url} alt={material.fileName} loading="lazy"/></a> : <video src={material.url} controls playsInline preload="metadata" aria-label={material.fileName}/> : <p>{en ? 'This file is unavailable.' : '자료를 불러오지 못했어요.'}</p>}
    <figcaption>{material.url ? <a href={material.url} target="_blank" rel="noopener noreferrer">{material.fileName}</a> : material.fileName}</figcaption>
  </figure>)}</div>{onRefresh && <button type="button" className="ws-button ws-button-light" onClick={onRefresh}><RefreshCw size={15}/>{en ? 'Reload materials' : '자료 다시 불러오기'}</button>}</section>;
}

type Item = {key: string; file?: File; preview?: string; material?: AssignmentMaterial; progress: number; uploading: boolean; error?: string};
export function AssignmentMaterialEditor({classId, initial = [], onChange, onBusy}: {classId: string; initial?: AssignmentMaterial[]; onChange: (materials: AssignmentMaterial[]) => void; onBusy: (busy: boolean) => void}) {
  const en = useLocale() === 'en', input = useRef<HTMLInputElement>(null), active = useRef(true);
  const tasks = useRef(new Map<string, AbortController>()), stagedIds = useRef(new Set<string>()), previews = useRef(new Set<string>());
  const [items, setItems] = useState<Item[]>(() => initial.map(material => ({key: material.id, material, uploading: false, progress: 100})));
  const [error, setError] = useState('');
  useEffect(() => {active.current = true; return () => {active.current = false; tasks.current.forEach(task => task.abort()); previews.current.forEach(url => URL.revokeObjectURL(url)); stagedIds.current.forEach(uploadId => {void fetch(`/api/assignment-materials/${uploadId}`, {method: 'DELETE', keepalive: true}).catch(() => {});});};}, []);
  useEffect(() => {onChange(items.flatMap(item => item.material ? [item.material] : [])); onBusy(items.some(item => item.uploading || !item.material));}, [items, onChange, onBusy]);
  const patch = (key: string, patch: Partial<Item>) => {if (active.current) setItems(old => old.map(item => item.key === key ? {...item, ...patch} : item));};
  async function upload(item: Item) {
    if (!item.file) return;
    patch(item.key, {uploading: true, error: undefined, progress: 0});
    let uploadId: string | undefined;
    try {
      const contentType = assignmentMaterialMime(item.file);
      const prepared = await api('/api/assignment-materials', {classId, fileName: item.file.name, contentType, size: item.file.size});
      uploadId = prepared.uploadId; stagedIds.current.add(uploadId!);
      if (!active.current) {await api(`/api/assignment-materials/${uploadId}`, undefined, 'DELETE'); return;}
      const task = new AbortController(); tasks.current.set(item.key,task);
      await sendUpload(prepared,item.file,fraction=>patch(item.key,{progress:Math.round(fraction*95)}),task.signal);
      const completed = await api(`/api/assignment-materials/${uploadId}`, {});
      patch(item.key, {material: completed.material, progress: 100, uploading: false});
    } catch (error) {
      patch(item.key, {uploading: false, error: error instanceof Error ? error.message : en ? 'Upload failed. Please retry.' : '전송하지 못했어요. 다시 시도해 주세요.'});
      if (uploadId) {await api(`/api/assignment-materials/${uploadId}`, undefined, 'DELETE').catch(() => {}); stagedIds.current.delete(uploadId);}
    } finally {tasks.current.delete(item.key);}
  }
  function choose(files: File[]) {
    setError('');
    if (items.length + files.length > ASSIGNMENT_MATERIAL_LIMIT) {setError(en ? 'Choose up to 10 files.' : '참고 자료는 10개까지 올릴 수 있어요.'); return;}
    if (files.some(file => !validAssignmentMaterial(assignmentMaterialMime(file), file.size))) {setError(en ? 'Images: JPG/PNG/WebP up to 25MB. Videos: MP4/WebM/MOV up to 250MB.' : 'JPG·PNG·WebP 사진은 25MB, MP4·WebM·MOV 영상은 250MB까지 올릴 수 있어요.'); return;}
    const added = files.map(file => {const preview = URL.createObjectURL(file); previews.current.add(preview); return {key: crypto.randomUUID(), file, preview, uploading: true, progress: 0};});
    setItems(old => [...old, ...added]);
    // Keep memory and simultaneous video uploads bounded.
    void (async () => {for (const item of added) {if (!active.current) break; await upload(item);}})();
  }
  function remove(item: Item) {
    if (item.uploading) return;
    setItems(old => old.filter(value => value.key !== item.key));
    if (item.preview) {URL.revokeObjectURL(item.preview); previews.current.delete(item.preview);}
    if (item.material && stagedIds.current.has(item.material.id)) {stagedIds.current.delete(item.material.id); void api(`/api/assignment-materials/${item.material.id}`, undefined, 'DELETE').catch(() => {});}
  }
  return <section className="assignment-material-editor"><h3>{en ? 'Reference images & videos' : '참고 이미지·영상'}</h3><p>{en ? 'Students can view these while doing their homework. Images 25MB / 40 megapixels · videos 250MB · 10 files · separate teacher storage 5GiB.' : '학생이 숙제를 보며 확인할 자료예요. 사진 25MB·4천만 화소 · 영상 250MB · 최대 10개 · 교사별 별도 5GiB'}</p><input ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple hidden onChange={event => {choose(Array.from(event.target.files || [])); event.target.value = '';}}/><button type="button" className="ws-button ws-button-light" disabled={items.length >= ASSIGNMENT_MATERIAL_LIMIT} onClick={() => input.current?.click()}><ImagePlus size={17}/>{en ? 'Add images or videos' : '이미지·영상 추가'}</button>
    {items.map(item => {const mime = item.material?.contentType || (item.file ? assignmentMaterialMime(item.file) : ''); return <div className="assignment-material-row" key={item.key}>
      {(item.preview || item.material?.url) && (mime.startsWith('image/') ? <img src={item.preview || item.material?.url} alt=""/> : <video src={item.preview || item.material?.url} controls playsInline preload="metadata"/>)}<div><strong>{item.file?.name || item.material?.fileName}</strong>{item.uploading ? <><progress value={item.progress} max={100}/><span role="status"><LoaderCircle size={13} className="ws-spin"/> {item.progress}%</span></> : item.error ? <><p role="alert">{item.error}</p><button type="button" onClick={() => void upload(item)}>{en ? 'Retry' : '다시 올리기'}</button></> : <small>{en ? 'Ready' : '전송 완료'}</small>}</div><button type="button" disabled={item.uploading} aria-label={`${item.file?.name || item.material?.fileName} ${en ? 'remove' : '빼기'}`} onClick={() => remove(item)}><X size={17}/></button>
    </div>;})}{error && <p role="alert">{error}</p>}</section>;
}
