'use client';
import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import {CheckCircle2,Clock3,LoaderCircle,RefreshCw,TriangleAlert} from 'lucide-react';
import {videoJobDelayed,type VideoJobView} from '@/lib/video-submission';
export default function VideoSubmissionStatus({job,onRetry,compact=false}:{job:VideoJobView;onRetry:()=>Promise<void>;compact?:boolean}) {
 const t=useTranslations('product.student'),[time,setTime]=useState(Date.now()),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!['queued','processing'].includes(job.status))return;const timer=setInterval(()=>setTime(Date.now()),1000);return()=>clearInterval(timer);},[job.status]);
 const elapsed=Math.max(0,Math.floor((time-Date.parse(job.startedAt||job.createdAt))/1000)),delayed=videoJobDelayed(job,time)||(job.status==='queued'&&job.retryable),failed=job.status==='failed',complete=job.status==='complete';
 const reason=['VIDEO_DURATION','VIDEO_INVALID','VIDEO_RESOLUTION','VIDEO_INPUT_MISMATCH','VIDEO_ACCESS_CHANGED','VIDEO_SUBMISSION_CHANGED','VIDEO_SOURCE_MISSING'].includes(job.errorCode||'')?job.errorCode!:'VIDEO_ENCODE_FAILED';
 return <section className="sd-video-processing" aria-live="polite" style={{padding:compact?12:20,borderRadius:18,background:failed?'var(--danger-soft,#fff0eb)':'var(--surface-soft,#eef6f1)',margin:'12px 0'}}>
  <strong style={{display:'flex',alignItems:'center',gap:8}}>{complete?<CheckCircle2 size={20}/>:failed?<TriangleAlert size={20}/>:delayed?<Clock3 size={20}/>:<LoaderCircle size={20} className="ws-spin"/>}{t(complete?'videoComplete':failed?'videoProcessingFailed':delayed?'videoDelayed':'videoPreparing')}</strong>
  {!complete&&<p>{failed?t(`videoErrors.${reason}`):t(`videoStages.${job.stage in {queued:1,download:1,inspect:1,encode:1,verify:1,save:1,submit:1}?job.stage:'queued'}`)} {!failed&&t('videoElapsed',{minutes:Math.floor(elapsed/60),seconds:elapsed%60})}</p>}
  {!complete&&!failed&&<p className="ws-small">{t('videoCanLeave')}</p>}
  {(job.retryable||delayed)&&<button type="button" className="ws-button ws-button-light" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onRetry();}catch{setError(t('videoStatusError'));}finally{setBusy(false);}}}><RefreshCw size={16}/>{t(busy?'videoRetrying':'videoRetryProcessing')}</button>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
