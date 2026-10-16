'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {CheckCircle2,LoaderCircle} from 'lucide-react';
export type AdminData=Record<string,any>;
export const states:Record<string,string>={active:'활성',suspended:'정지',archived:'보관',open:'열림',closed:'닫힘',published:'배부됨',pending:'대기',running:'진행 중',done:'완료',failed:'실패',paused:'일시 정지',success:'성공',partial:'일부 적용',read:'조회',change:'변경',managed:'관리 중',expired:'만료 전송',quarantined:'격리 보관',restored:'복원됨',unverified:'참조 확인 필요','recovery-copy':'복구 사본'};
export const adminStatus=(value:string)=>states[value]||value||'—';
export const adminDate=(value:string)=>value?new Date(value).toLocaleString('ko-KR'):'—';
export const adminBytes=(value:number)=>value>=1024**3?(value/1024**3).toFixed(2)+' GB':value>=1024**2?(value/1024**2).toFixed(1)+' MB':(value/1024).toFixed(1)+' KB';
export async function adminApi(path:string,input?:AdminData){const r=await fetch('/api/admin/console/'+path,{cache:'no-store',...(input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{})}),body=await r.json().catch(()=>({error:'서버가 응답하지 않았어요. 작업 상태를 다시 확인해 주세요.'}));if(!r.ok)throw Error(body.error||'처리하지 못했어요. 다시 시도해 주세요.');return body;}
export function useAdminResource(path:string|null,revision=0){
 const[record,setRecord]=useState<{path:string;value:AdminData}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{
  setRecord(null);setError('');if(!path){setLoading(false);return;}
  const c=new AbortController();let cancelled=false;setLoading(true);const timer=setTimeout(()=>{c.abort();if(!cancelled){setError('응답이 늦어지고 있어요. 이 부분을 다시 불러와 주세요.');setLoading(false);}},30000);
  fetch('/api/admin/console/'+path,{cache:'no-store',signal:c.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'불러오지 못했어요.');return data;})
   .then(value=>{if(!c.signal.aborted)setRecord({path,value});})
   .catch(cause=>{if(!c.signal.aborted)setError(cause.message);})
   .finally(()=>{clearTimeout(timer);if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;clearTimeout(timer);c.abort();};
 },[path,revision]);
 return{data:record?.path===path?record?.value??null:null,error,loading};
}
export function AdminResource({state,onRetry,children}:{state:ReturnType<typeof useAdminResource>;onRetry:()=>void;children:(data:AdminData)=>ReactNode}){if(state.loading)return <div className="admin-loading" role="status"><LoaderCircle size={22} className="spin"/>불러오는 중</div>;if(state.error)return <div role="alert" className="admin-error">{state.error}<button className="button" onClick={onRetry}>이 부분 다시 불러오기</button></div>;return state.data?children(state.data):null;}
export function AdminBadge({value}:{value:string}){return <span className={'status-pill '+(['failed','suspended','expired','partial'].includes(value)?'warning':'')}>{adminStatus(value)}</span>;}
export function AdminChangeForm({label,children,onSave}:{label:string;children?:ReactNode;onSave:(reason:string)=>Promise<void>}){const[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');return <form className="admin-change-form" onSubmit={async e=>{e.preventDefault();if(busy||!reason.trim()||!confirm(label+' 작업을 적용할까요?'))return;setBusy(true);setError('');try{await onSave(reason);setNotice('변경을 완료했습니다.');window.dispatchEvent(new CustomEvent('admin-operation-complete',{detail:label}));setReason('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{children}<label>변경 사유<input required aria-label={label+' 사유'} value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} placeholder="처리 이유를 기록해 주세요"/></label><button className="button primary" disabled={busy||!reason.trim()}>{busy?<LoaderCircle size={16} className="spin"/>:<CheckCircle2 size={16}/>} {label}</button>{error&&<p role="alert" className="error-message">{error}</p>}{notice&&<p role="status">{notice}</p>}</form>;}
