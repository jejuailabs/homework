'use client';
import {useEffect,useState} from 'react';
import {KeyRound,RefreshCw,ShieldCheck} from 'lucide-react';
import {diaryRequest} from '@/modules/my-space/diary-client';
type RecoveryRequest={id:string;studentName:string;classId:string;studentId:string;requestedAt:string};
export default function AdminDiaryRecovery({revision=0}:{revision?:number}) {
  const [requests,setRequests]=useState<RecoveryRequest[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[reason,setReason]=useState(''),[verified,setVerified]=useState(false),[ticket,setTicket]=useState<{ticket:string;expiresAt:number}|null>(null);
  async function load(){try{setRequests((await diaryRequest<{requests:RecoveryRequest[]}>('/recovery')).requests);}catch(e){setError(e instanceof Error?e.message:'복구 요청을 확인하지 못했습니다.');}}
  useEffect(()=>{void load();},[revision]);
  async function issue(){if(busy||!selected||!verified)return;setBusy(true);setError('');try{const result=await diaryRequest<{ticket:string;expiresAt:number}>('/recovery/'+selected,'POST',{verified,reason});setTicket(result);setSelected('');setReason('');setVerified(false);await load();}catch(e){setError(e instanceof Error?e.message:'복구 코드를 발급하지 못했습니다.');}finally{setBusy(false);}}
  return <section className="content-card"><div className="section-heading"><div><h2><KeyRound size={21}/> 비밀일기 잠금 복구</h2><p>학생 본인 확인 후 일회용 재설정 코드를 발급합니다. 일기 내용은 이 화면에 표시되지 않습니다.</p></div><button className="button" onClick={()=>void load()}><RefreshCw size={16}/>새로고침</button></div>
    <p className="inline-note"><ShieldCheck size={17}/>일반 교사는 이 기능을 사용할 수 없습니다. 학생 로그인 코드를 알고 있다는 사실만으로 본인 확인을 대신하지 마세요. 발급 사유와 처리자는 기록됩니다.</p>
    {error&&<p role="alert" className="inline-note">{error}</p>}
    {ticket&&<div className="content-card" role="status"><h3>학생에게 직접 전달할 일회용 코드</h3><output style={{display:'block',overflowWrap:'anywhere',padding:16,background:'#f1f4ec',userSelect:'all',fontFamily:'monospace'}}>{ticket.ticket}</output><p>{new Date(ticket.expiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}까지 한 번 사용할 수 있습니다. 학생이 일기장 복구 화면에서 코드와 새 잠금번호를 입력합니다.</p><button className="button" onClick={()=>setTicket(null)}>코드 가리기</button></div>}
    {!requests.length&&<p>대기 중인 복구 요청이 없습니다.</p>}
    {requests.map(request=><article className="content-card" key={request.id}><h3>{request.studentName||'학생'}의 복구 요청</h3><p>학급 ID: {request.classId} · 학생 ID: {request.studentId}</p><small>{new Date(request.requestedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small>{selected===request.id?<form onSubmit={e=>{e.preventDefault();void issue();}}><label style={{display:'block',marginTop:16}}>본인 확인 방법·처리 사유<textarea rows={3} value={reason} minLength={10} maxLength={500} required onChange={e=>setReason(e.target.value)} placeholder="실제로 확인한 방법을 기록하세요. 일기 내용이나 인증 비밀은 적지 마세요." style={{display:'block',width:'100%',marginTop:8}}/></label><label style={{display:'flex',alignItems:'center',gap:8,margin:'12px 0'}}><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>요청한 학생의 본인 여부를 별도로 확인했습니다.</label><button className="button primary" disabled={busy||!verified||reason.trim().length<10}>{busy?'발급 중…':'복구 코드 발급'}</button><button type="button" className="button" onClick={()=>setSelected('')}>취소</button></form>:<p><button className="button" onClick={()=>{setSelected(request.id);setReason('');setVerified(false);setTicket(null);}}>본인 확인 후 복구하기</button></p>}</article>)}
  </section>;
}
