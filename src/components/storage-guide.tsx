'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Download,HardDrive,LoaderCircle,RefreshCw} from 'lucide-react';
import {formatStorage,storageCategories,type StorageCategory,type StoragePlanView} from '@/lib/storage-plan';

type ExportView={id:string;status:'processing'|'complete'|'failed';createdAt:string;expiresAt:string;fileCount:number;bytes:number;parts:{index:number;status:string;fileCount:number;bytes:number;url?:string}[]};
const labels:Record<StorageCategory,[string,string]>={homeworkVideo:['숙제 영상','Homework videos'],homeworkPhoto:['숙제 사진·파일','Homework photos & files'],gallery:['전시실','Exhibitions'],materials:['수업 자료','Class materials'],boards:['게시판','Boards']};
const day=(value:string,locale:string)=>new Intl.DateTimeFormat(locale,{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));

/** Teacher plan: one shared allowance, its yearly period, and the final download before the reset. */
export default function StorageGuide() {
  const locale=useLocale(),en=locale==='en',w=(ko:string,english:string)=>en?english:ko;
  const [plan,setPlan]=useState<StoragePlanView|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [exported,setExported]=useState<ExportView|null>(null),[exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
  useEffect(()=>{const controller=new AbortController();fetch('/api/storage/summary',{cache:'no-store',signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);setPlan(data.plan);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[revision]);
  const loadExport=useCallback(async()=>{const r=await fetch('/api/storage/export',{cache:'no-store'}),data=await r.json();if(r.ok)setExported(data.export);},[]);
  useEffect(()=>{void loadExport().catch(()=>{});},[loadExport]);
  useEffect(()=>{if(exported?.status!=='processing')return;const timer=setInterval(()=>void loadExport().catch(()=>{}),5000);return()=>clearInterval(timer);},[exported?.status,loadExport]);
  async function prepare(){setExporting(true);setExportError('');try{const r=await fetch('/api/storage/export',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),data=await r.json();if(!r.ok)throw Error(data.error);setExported(data.export);}catch(e){setExportError(e instanceof Error?e.message:w('준비하지 못했어요.','Could not prepare.'));}finally{setExporting(false);}}

  const total=plan?plan.usedBytes+plan.reservedBytes:0,percent=plan?Math.min(100,total/plan.quotaBytes*100):0;
  const readyParts=exported?.parts.filter(part=>part.url).length??0;
  return <section className="sp-card" aria-labelledby="storage-plan-title">
    <div className="sp-head"><h2 id="storage-plan-title"><HardDrive size={18}/>{w('저장 공간','Storage')}</h2><button type="button" className="ws-icon-btn" onClick={()=>setRevision(v=>v+1)} aria-label={w('저장 현황 새로고침','Refresh usage')}><RefreshCw size={16}/></button></div>
    {error&&<p className="ws-form-error" role="alert">{error}</p>}
    {!plan&&!error&&<p className="sp-muted" role="status"><LoaderCircle size={14} className="ws-spin"/> {w('저장 공간을 계산하고 있어요.','Measuring storage…')}</p>}
    {plan&&<>
      <p className="sp-total"><strong>{formatStorage(total)}</strong> / {formatStorage(plan.quotaBytes)} {w('사용','used')}<span className={`sp-left sp-${plan.level}`}>{w('남은 공간','Left')} {formatStorage(plan.remainingBytes)}</span></p>
      <div className={`sp-bar sp-${plan.level}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label={w(`저장 공간 ${Math.round(percent)}% 사용`,`${Math.round(percent)}% of storage used`)}>
        {storageCategories.map(key=>plan.categories[key]>0&&<span key={key} className={`sp-seg sp-seg-${key}`} style={{width:`${plan.categories[key]/plan.quotaBytes*100}%`}}/>)}
        {plan.reservedBytes>0&&<span className="sp-seg sp-seg-pending" style={{width:`${plan.reservedBytes/plan.quotaBytes*100}%`}}/>}
      </div>
      <ul className="sp-legend">{storageCategories.map(key=><li key={key}><span className={`sp-dot sp-seg-${key}`}/>{labels[key][en?1:0]} <b>{formatStorage(plan.categories[key])}</b></li>)}{plan.reservedBytes>0&&<li><span className="sp-dot sp-seg-pending"/>{w('전송 중','Uploading')} <b>{formatStorage(plan.reservedBytes)}</b></li>}</ul>
      {plan.level!=='ok'&&<p className={`sp-alert sp-${plan.level}`} role="status">{plan.level==='critical'?w('저장 공간이 거의 찼어요. 가득 차면 학생들이 숙제를 올릴 수 없어요.','Storage is almost full. Students cannot upload once it is full.'):w('저장 공간을 80% 넘게 사용했어요.','Over 80% of storage is used.')}</p>}
      <div className="sp-period"><span>{w('이용 기간','Plan period')} {day(plan.periodStart,locale)} ~ {day(plan.periodEnd,locale)}</span><strong className={plan.daysLeft<=30?'sp-critical':''}>{w(`리셋까지 ${plan.daysLeft}일`,`${plan.daysLeft} days until reset`)}</strong></div>
      <p className="sp-muted">{w(`기본 ${formatStorage(plan.baseBytes)}`,`Base ${formatStorage(plan.baseBytes)}`)}{plan.extraBytes>0&&w(` + 추가 ${formatStorage(plan.extraBytes)}`,` + extra ${formatStorage(plan.extraBytes)}`)} · {w('용량 추가가 필요하면 운영자에게 문의해 주세요.','Contact the operator to add storage.')}</p>
      {plan.daysLeft<=30&&<p className="sp-alert sp-critical" role="status">{w(`${plan.daysLeft}일 뒤 이용 기간이 끝나면 저장된 자료가 정리돼요. 그 전에 최종 다운로드로 내려받아 주세요.`,`Stored files are cleared when the period ends in ${plan.daysLeft} days. Download them before then.`)}</p>}
    </>}
    <div className="sp-export">
      <div><strong>{w('최종 다운로드','Final download')}</strong><p className="sp-muted">{w('숙제·전시실·수업 자료·게시판 파일을 학급과 과제별 폴더로 묶어 ZIP으로 받아요. 묶음은 7일 동안 받을 수 있어요.','Get every homework, exhibition, material and board file as ZIPs, organised by class and assignment. Links last 7 days.')}</p></div>
      {(!exported||exported.status==='failed')&&<button type="button" className="ws-button ws-button-light" disabled={exporting} onClick={()=>void prepare()}>{exporting?<LoaderCircle size={16} className="ws-spin"/>:<Download size={16}/>}{w(exported?.status==='failed'?'다시 준비하기':'최종 다운로드 준비','Prepare download')}</button>}
      {exported?.status==='processing'&&<p className="sp-muted" role="status"><LoaderCircle size={14} className="ws-spin"/> {w(`파일 ${exported.fileCount}개를 묶고 있어요 · ${readyParts}/${exported.parts.length}`,`Packing ${exported.fileCount} files · ${readyParts}/${exported.parts.length}`)}</p>}
      {exported&&readyParts>0&&<ul className="sp-parts">{exported.parts.filter(part=>part.url).map(part=><li key={part.index}><a className="ws-button ws-button-light" href={part.url} download><Download size={15}/>{w(`${part.index+1}번 묶음`,`Part ${part.index+1}`)} · {formatStorage(part.bytes)}</a></li>)}</ul>}
      {exported?.status==='complete'&&<p className="sp-muted">{w(`${day(exported.expiresAt,locale)}까지 받을 수 있어요.`,`Available until ${day(exported.expiresAt,locale)}.`)}</p>}
      {exportError&&<p className="ws-form-error" role="alert">{exportError}</p>}
    </div>
    <details className="sp-limits"><summary>{w('첨부 제한 안내','Attachment limits')}</summary><p>{w('숙제: 사진·PDF 최대 10개(파일당 100MB). 사진은 학생 폰에서 긴 변 2000px로 줄여서 올려요. 영상 숙제는 1개·최대 3분·원본 250MB까지이며 서버에서 720p로 압축해 보관해요.','Homework: up to 10 photos/PDFs (100MB each); photos are resized to 2000px on the pupil’s device. Video homework: one video up to 3 minutes and 250MB, kept as 720p.')}</p><p>{w('전시실 사진은 100MB·4천만 화소 이하, 수업 자료는 사진 25MB·영상 250MB까지예요. 모든 파일이 위 저장 공간 하나를 함께 사용해요.','Exhibition photos up to 100MB / 40MP; materials up to 25MB photos and 250MB videos. All files share the storage above.')}</p></details>
  </section>;
}
