'use client';
import {useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {sendUpload, discardUpload, type UploadTransfer} from '@/lib/upload-transfer';
import {Camera, ImagePlus, LoaderCircle, Trash2, Upload} from 'lucide-react';
import {artworkToday} from '@/lib/exhibition-metadata';
import {hasDuplicateArtworkStudents, matchArtworkStudent} from '@/lib/artwork-student-matching';
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
export default function ExhibitionUploadDialog({teacher, exhibitionId, students, voiceEnabled = false, storageUsage, studentName = '', onClose, onSaved, DialogComponent: Dialog, StorageUsageComponent}: {teacher: boolean; voiceEnabled?: boolean; exhibitionId: string; students: ExhibitionStudent[]; studentName?: string; storageUsage?: ExhibitionStorageUsage; StorageUsageComponent?: ComponentType<{usage:ExhibitionStorageUsage}>; onClose: () => void; onSaved: () => Promise<void>; DialogComponent: ComponentType<DialogProps>}) {
  const en = useLocale() === 'en';
  const t = useTranslations('exhibition'), [photos, setPhotos] = useState<Photo[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [warning, setWarning] = useState(''), [progress, setProgress] = useState(0), [autoRead, setAutoRead] = useState(true);
  const input = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null), urls = useRef(new Set<string>()), uploads = useRef(new Map<string,string>()), controllers = useRef(new Set<AbortController>()), alive = useRef(true), sending = useRef(false), transfers = useRef(new Map<string, string>());
  useEffect(()=>{alive.current=true;const previews=urls.current, pending=controllers.current;return()=>{alive.current=false;previews.forEach(url=>URL.revokeObjectURL(url));pending.forEach(controller=>controller.abort());transfers.current.forEach(url=>{void discardUpload(url).catch(()=>{});});};},[]);
  const update = (id: string, changes: Partial<Photo>) => setPhotos(previous=>previous.map(photo=>photo.id===id?{...photo,...changes}:photo));
  async function readNames(added: Photo[]) {
    const controller = new AbortController();controllers.current.add(controller);
    try {
      const images = await Promise.all(added.map(previewForReading));
      const result = {names: [] as string[]};
      for(let start=0;start<images.length;start+=20){const batch=await request<{names:string[]}>(`/api/exhibitions/${exhibitionId}/read-authors`,{method:'POST',body:JSON.stringify({images:images.slice(start,start+20)}),signal:controller.signal});result.names.push(...batch.names);}
      if(!alive.current)return;
      setPhotos(previous=>previous.map(photo=>{const index=added.findIndex(row=>row.id===photo.id);if(index<0)return photo;return photo.touched?{...photo,reading:false}:{...photo,reading:false,...matchArtworkStudent(result.names[index]||'',students)};}));
    } catch {if(alive.current){setWarning(t('authorReadFallback'));setPhotos(previous=>previous.map(photo=>added.some(row=>row.id===photo.id)?{...photo,reading:false}:photo));}}
    finally {controllers.current.delete(controller);}
  }
  function add(files: FileList | null) {
    if(!files||busy)return;if(!teacher&&photos.length+files.length>1){setError(t('oneWorkOnly'));return;}if(photos.length+files.length>25){setError(t('uploadLimit'));return;}
    setError('');const added:Photo[]=[];
    for(const file of Array.from(files)){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError(t('fileType'));continue;}if(!file.size||file.size>100*1024*1024){setError(t('fileSize'));continue;}
      const preview=URL.createObjectURL(file);urls.current.add(preview);added.push({id:crypto.randomUUID(),file,preview,title:file.name.replace(/\.[^.]+$/,'').slice(0,120)||file.name.slice(0,120),artistName:teacher?'':studentName,artworkDate:artworkToday(),description:'',studentId:'',touched:false,reading:teacher&&autoRead});
    }
    setPhotos(previous=>[...previous,...added]);if(teacher&&autoRead&&added.length)void readNames(added);
  }
  function remove(photo:Photo){URL.revokeObjectURL(photo.preview);urls.current.delete(photo.preview);setPhotos(previous=>previous.filter(row=>row.id!==photo.id));}
  async function submit(event:FormEvent) {
    event.preventDefault();if(sending.current||!photos.length||photos.some(photo=>photo.reading))return;
    if(teacher&&hasDuplicateArtworkStudents(photos)){setError(t('duplicateArtistSelection'));return;}
    sending.current=true;setBusy(true);setError('');setProgress(0);
    try {
      for(let index=0;index<photos.length;index++){
        const photo=photos[index];let uploadId=uploads.current.get(photo.id);
        if(!uploadId){
          const upload=await request<UploadTransfer>(`/api/exhibitions/${exhibitionId}/uploads`,{method:'POST',body:JSON.stringify({requestId:photo.id,fileName:photo.file.name,contentType:photo.file.type,size:photo.file.size})});
          const cleanupUrl=`/api/exhibitions/${exhibitionId}/uploads/${upload.uploadId}`; transfers.current.set(upload.uploadId,cleanupUrl);
          const controller=new AbortController();controllers.current.add(controller);
          try {await sendUpload(upload,photo.file,fraction=>setProgress(Math.round((index+fraction)/photos.length*100)),controller.signal);} finally {controllers.current.delete(controller);}
          uploadId=upload.uploadId;uploads.current.set(photo.id,uploadId);
        }
        await request(`/api/exhibitions/${exhibitionId}/artworks`,{method:'POST',body:JSON.stringify({uploadId,title:photo.title.trim(),description:photo.description.trim(),artworkDate:photo.artworkDate,...(teacher?{studentId:photo.studentId,artistName:photo.artistName.trim()}:{})})});transfers.current.delete(uploadId);uploads.current.delete(photo.id);remove(photo);
      }
      await onSaved();
    } catch(cause){
      await Promise.allSettled([...transfers.current.values()].map(discardUpload));transfers.current.clear();uploads.current.clear();
      const code=cause instanceof Error?cause.message:'';
      const messages:Record<string,string>={STORAGE_QUOTA:'storageFull',PLAN_STORAGE_FULL:'storageFull',FILE_SIZE:'fileSize',FILE_TYPE:'fileType',IMAGE_INVALID:'invalidImage',ARTWORK_LIMIT:'artworkFull',UNAUTHENTICATED:'uploadSignIn',CODE_RESET:'uploadSignIn',UPLOAD_NETWORK:'uploadNetwork',UPLOAD_TIMEOUT:'uploadNetwork',UPLOAD_CLEANUP:'cleanupError'};
      setError(t(messages[code]||'uploadError'));
    }
    finally {sending.current=false;setBusy(false);}
  }

  return <Dialog title={t('uploadTitle')} onClose={onClose} busy={busy} wide><form className="ex-form" onSubmit={submit}><p className="ex-form-hint">{t(teacher?'photoMetadataHint':'studentSubmitHint')}</p><p className="ex-form-hint">{t(teacher?'teacherStorageGuide':'studentStorageGuide')}</p>{voiceEnabled&&<p className="ex-form-hint">{en?'After uploading, open the artwork to record or attach a voice explanation of up to 60 seconds. Children can add it later while the exhibition is open; the teacher approves it before sharing.':'사진을 올린 뒤 작품을 누르면 60초 이내의 설명을 녹음하거나 음성 파일을 첨부할 수 있어요. 전시 중에도 나중에 추가할 수 있고, 선생님 승인 후 공개돼요.'}{teacher&&<><br/>{en?'Select the student artist so the child can add their own voice.':'아이가 직접 목소리를 추가할 수 있도록 작가를 학생 명단에서 선택해 주세요.'}</>}</p>}{storageUsage&&StorageUsageComponent&&<StorageUsageComponent usage={storageUsage}/>}{teacher&&<label className="ex-checkbox"><input type="checkbox" checked={autoRead} onChange={event=>setAutoRead(event.target.checked)} disabled={busy}/><span>{t('readAuthor')}<small>{t('readAuthorHint')}</small></span></label>}<div className="ex-upload-zone"><ImagePlus size={30}/><div><button className="ex-button" type="button" disabled={busy} onClick={()=>input.current?.click()}><Upload size={17}/>{t('choosePhotos')}</button><button className="ex-button" type="button" disabled={busy} onClick={()=>camera.current?.click()}><Camera size={17}/>{t('takePhoto')}</button></div><small>{t(teacher?'uploadLimits':'studentUploadLimits')}</small><input ref={input} type="file" multiple={teacher} accept="image/jpeg,image/png,image/webp" hidden onChange={event=>{add(event.target.files);event.target.value='';}}/><input ref={camera} type="file" capture="environment" accept="image/jpeg,image/png,image/webp" hidden onChange={event=>{add(event.target.files);event.target.value='';}}/></div>
    {warning&&<p className="ex-form-hint" role="status">{warning}</p>}<div className="ex-upload-queue">{photos.map(photo=><div className="ex-upload-item" key={photo.id}><div className="ex-upload-preview"><img src={photo.preview} alt={photo.file.name}/><button type="button" className="ex-icon-btn" disabled={busy} aria-label={t('removePhoto',{name:photo.file.name})} onClick={()=>remove(photo)}><Trash2 size={16}/></button></div><div className="ex-photo-metadata"><label>{t('artworkDate')}<input type="date" required value={photo.artworkDate} disabled={busy} onChange={event=>update(photo.id,{artworkDate:event.target.value})}/></label><label>{t('artistName')}{teacher?<><select aria-label={t('artistName')} aria-describedby={'student-gallery-hint-'+photo.id} value={photo.studentId} disabled={busy} onChange={event=>{const student=students.find(row=>row.id===event.target.value);update(photo.id,{studentId:student?.id||'',artistName:student?.name||'',touched:true});setError('');}}><option value="">{t('chooseArtist')}</option>{[...students].sort((a,b)=>a.number-b.number).map(student=><option key={student.id} value={student.id}>{t('studentNumber',{number:student.number,name:student.name})}</option>)}</select><small id={'student-gallery-hint-'+photo.id} className="ex-author-status">{t('studentGalleryLinkHint')}</small></>:<input value={studentName} disabled/>}</label>{photo.reading&&<span className="ex-author-status"><LoaderCircle className="spin" size={12}/>{t('readingAuthor')}</span>}{teacher&&!photo.studentId&&photo.artistName&&<span className="ex-author-status">{t('detectedAuthorName',{name:photo.artistName})}</span>}<label>{t('artworkTitle')}<input required maxLength={120} value={photo.title} disabled={busy} onChange={event=>update(photo.id,{title:event.target.value})}/></label><label>{t('artworkDescription')}<textarea rows={3} maxLength={2000} value={photo.description} disabled={busy} onChange={event=>update(photo.id,{description:event.target.value})}/></label></div></div>)}</div>{busy&&<progress max={100} value={progress}/>} {error&&<p className="ex-form-error" role="alert">{error}</p>}<div className="ex-form-actions"><button type="button" className="ex-button" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="ex-button ex-primary" disabled={busy||!photos.length||photos.some(photo=>photo.reading)}>{busy&&<LoaderCircle size={17} className="spin"/>}{t(busy?'saving':'upload')}</button></div></form></Dialog>;
}
