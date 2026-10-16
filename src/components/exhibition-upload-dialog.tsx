'use client';
import {useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {uploadBytesResumable, ref as storageRef} from 'firebase/storage';
import {storage} from '@/lib/firebase-client';
import {Camera, ImagePlus, LoaderCircle, Trash2, Upload} from 'lucide-react';
import {artworkToday} from '@/lib/exhibition-metadata';
import type {ExhibitionStudent, ExhibitionStorageUsage} from '@/lib/exhibition-types';
import '@/styles/exhibition-sharing.css';
type Photo = {id: string; file: File; preview: string; title: string; artistName: string; artworkDate: string; description: string; studentId: string; touched: boolean; reading: boolean};
type DialogProps = {title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean};
async function request<T>(url: string, init?: RequestInit): Promise<T> {const response = await fetch(url, {...init, headers: {'Content-Type': 'application/json', ...init?.headers}});const body = await response.json();if(!response.ok)throw new Error(body.code || 'ERROR');return body;}
async function previewForReading(photo: Photo): Promise<string> {
  const image = new Image();image.src = photo.preview;await image.decode();
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight)), canvas = document.createElement('canvas');canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');if(!context)throw new Error();context.fillStyle = '#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const imageUrl = canvas.toDataURL('image/jpeg', .6);if(imageUrl.length > 160000)throw new Error();return imageUrl;
}
export default function ExhibitionUploadDialog({teacher, exhibitionId, students, storageUsage, studentName = '', onClose, onSaved, DialogComponent: Dialog, StorageUsageComponent}: {teacher: boolean; exhibitionId: string; students: ExhibitionStudent[]; studentName?: string; storageUsage?: ExhibitionStorageUsage; StorageUsageComponent?: ComponentType<{usage:ExhibitionStorageUsage}>; onClose: () => void; onSaved: () => Promise<void>; DialogComponent: ComponentType<DialogProps>}) {
  const t = useTranslations('exhibition'), [photos, setPhotos] = useState<Photo[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [warning, setWarning] = useState(''), [progress, setProgress] = useState(0), [autoRead, setAutoRead] = useState(true);
  const input = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null), urls = useRef(new Set<string>()), uploads = useRef(new Map<string,string>()), controllers = useRef(new Set<AbortController>()), alive = useRef(true);
  useEffect(()=>{alive.current=true;const previews=urls.current, pending=controllers.current;return()=>{alive.current=false;previews.forEach(url=>URL.revokeObjectURL(url));pending.forEach(controller=>controller.abort());};},[]);
  const update = (id: string, changes: Partial<Photo>) => setPhotos(previous=>previous.map(photo=>photo.id===id?{...photo,...changes}:photo));
  async function readNames(added: Photo[]) {
    const controller = new AbortController();controllers.current.add(controller);
    try {
      const images = await Promise.all(added.map(previewForReading));
      const result = await request<{names: string[]}>(`/api/exhibitions/${exhibitionId}/read-authors`, {method:'POST', body:JSON.stringify({images}),signal:controller.signal});
      if(!alive.current)return;
      setPhotos(previous=>previous.map(photo=>{const index=added.findIndex(row=>row.id===photo.id);if(index<0)return photo;const name=result.names[index]||'',matches=students.filter(student=>student.name.replace(/\s/g,'')===name.replace(/\s/g,''));return photo.touched?{...photo,reading:false}:{...photo,reading:false,artistName:name,studentId:name&&matches.length===1?matches[0].id:''};}));
    } catch {if(alive.current){setWarning(t('authorReadFallback'));setPhotos(previous=>previous.map(photo=>added.some(row=>row.id===photo.id)?{...photo,reading:false}:photo));}}
    finally {controllers.current.delete(controller);}
  }
  function add(files: FileList | null) {
    if(!files||busy)return;if(photos.length+files.length>20){setError(t('uploadLimit'));return;}
    setError('');const added:Photo[]=[];
    for(const file of Array.from(files)){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError(t('fileType'));continue;}if(!file.size||file.size>100*1024*1024){setError(t('fileSize'));continue;}
      const preview=URL.createObjectURL(file);urls.current.add(preview);added.push({id:crypto.randomUUID(),file,preview,title:file.name.replace(/\.[^.]+$/,'').slice(0,120)||file.name.slice(0,120),artistName:teacher?'':studentName,artworkDate:artworkToday(),description:'',studentId:'',touched:false,reading:teacher&&autoRead});
    }
    setPhotos(previous=>[...previous,...added]);if(teacher&&autoRead&&added.length)void readNames(added);
  }
  function remove(photo:Photo){URL.revokeObjectURL(photo.preview);urls.current.delete(photo.preview);setPhotos(previous=>previous.filter(row=>row.id!==photo.id));}
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy||!photos.length||photos.some(photo=>photo.reading))return;setBusy(true);setError('');setProgress(0);
    try {
      for(let index=0;index<photos.length;index++){
        const photo=photos[index];let uploadId=uploads.current.get(photo.id);
        if(!uploadId){const upload=await request<{uploadId:string;path:string}>(`/api/exhibitions/${exhibitionId}/uploads`,{method:'POST',body:JSON.stringify({fileName:photo.file.name,contentType:photo.file.type,size:photo.file.size})});await new Promise<void>((resolve,reject)=>{const task=uploadBytesResumable(storageRef(storage,upload.path),photo.file,{contentType:photo.file.type});task.on('state_changed',snapshot=>setProgress(Math.round((index+snapshot.bytesTransferred/Math.max(1,snapshot.totalBytes))/photos.length*100)),reject,()=>resolve());});uploadId=upload.uploadId;uploads.current.set(photo.id,uploadId);}
        await request(`/api/exhibitions/${exhibitionId}/artworks`,{method:'POST',body:JSON.stringify({uploadId,title:photo.title.trim(),description:photo.description.trim(),artworkDate:photo.artworkDate,...(teacher?{studentId:photo.studentId,artistName:photo.artistName.trim()}:{})})});uploads.current.delete(photo.id);remove(photo);
      }
      await onSaved();
    } catch(cause){if(cause instanceof Error&&['UPLOAD_USED','UPLOAD_INVALID','IMAGE_INVALID','UPLOAD_EXPIRED'].includes(cause.message))uploads.current.clear();setError(t('uploadError'));}
    finally {setBusy(false);}
  }
  return <Dialog title={t('uploadTitle')} onClose={onClose} busy={busy} wide><form className="ex-form" onSubmit={submit}><p className="ex-form-hint">{t(teacher?'photoMetadataHint':'studentSubmitHint')}</p>{storageUsage&&StorageUsageComponent&&<StorageUsageComponent usage={storageUsage}/>}{teacher&&<label className="ex-checkbox"><input type="checkbox" checked={autoRead} onChange={event=>setAutoRead(event.target.checked)} disabled={busy}/><span>{t('readAuthor')}<small>{t('readAuthorHint')}</small></span></label>}<div className="ex-upload-zone"><ImagePlus size={30}/><div><button className="ex-button" type="button" disabled={busy} onClick={()=>input.current?.click()}><Upload size={17}/>{t('choosePhotos')}</button><button className="ex-button" type="button" disabled={busy} onClick={()=>camera.current?.click()}><Camera size={17}/>{t('takePhoto')}</button></div><small>{t('uploadLimits')}</small><input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={event=>{add(event.target.files);event.target.value='';}}/><input ref={camera} type="file" capture="environment" accept="image/jpeg,image/png,image/webp" hidden onChange={event=>{add(event.target.files);event.target.value='';}}/></div>
    {warning&&<p className="ex-form-hint" role="status">{warning}</p>}<div className="ex-upload-queue">{photos.map(photo=><div className="ex-upload-item" key={photo.id}><div className="ex-upload-preview"><img src={photo.preview} alt={photo.file.name}/><button type="button" className="ex-icon-btn" disabled={busy} aria-label={t('removePhoto',{name:photo.file.name})} onClick={()=>remove(photo)}><Trash2 size={16}/></button></div><div className="ex-photo-metadata"><label>{t('artworkDate')}<input type="date" required value={photo.artworkDate} disabled={busy} onChange={event=>update(photo.id,{artworkDate:event.target.value})}/></label><label>{t('artistName')}<input maxLength={50} value={photo.artistName} disabled={busy||!teacher} placeholder={t('artistNamePlaceholder')} onChange={event=>update(photo.id,{artistName:event.target.value,studentId:'',touched:true})}/></label>{photo.reading&&<span className="ex-author-status"><LoaderCircle className="spin" size={12}/>{t('readingAuthor')}</span>}{teacher&&<label>{t('linkStudent')}<select value={photo.studentId} disabled={busy} onChange={event=>{const student=students.find(row=>row.id===event.target.value);update(photo.id,{studentId:event.target.value,artistName:student?.name??photo.artistName,touched:true});}}><option value="">{t('chooseArtist')}</option>{students.map(student=><option key={student.id} value={student.id}>{student.name}</option>)}</select></label>}<label>{t('artworkTitle')}<input required maxLength={120} value={photo.title} disabled={busy} onChange={event=>update(photo.id,{title:event.target.value})}/></label><label>{t('artworkDescription')}<textarea rows={3} maxLength={2000} value={photo.description} disabled={busy} onChange={event=>update(photo.id,{description:event.target.value})}/></label></div></div>)}</div>{busy&&<progress max={100} value={progress}/>} {error&&<p className="ex-form-error" role="alert">{error}</p>}<div className="ex-form-actions"><button type="button" className="ex-button" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="ex-button ex-primary" disabled={busy||!photos.length||photos.some(photo=>photo.reading)}>{busy&&<LoaderCircle size={17} className="spin"/>}{t(busy?'saving':'upload')}</button></div></form></Dialog>;
}
