'use client';
import {useEffect,useRef,useState} from 'react';
import {BookHeart,Download,FileDown,KeyRound,Upload,X} from 'lucide-react';
import type {DiaryPage} from './catalog';
import {diaryRequest,type DiaryStatus} from './diary-client';
import {diaryToday} from './diary-calendar';
import DiaryShares from './diary-shares';
import type {DiaryPageList} from './diary-calendar-view';
export default function DiaryLibrary({month,owned,onClose,onReload,onError,onNotice,onStatus}:{month:string;owned:string[];onClose:()=>void;onReload:()=>Promise<void>;onError:(e:unknown)=>void;onNotice:(value:string)=>void;onStatus:(value:DiaryStatus)=>void}) {
  const [busy,setBusy]=useState(false),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[transfer,setTransfer]=useState('');
  const input=useRef<HTMLInputElement>(null);
  const lifecycle=useRef(new AbortController());
  useEffect(()=>{lifecycle.current=new AbortController();return()=>lifecycle.current.abort();},[]);
  function active(){lifecycle.current.signal.throwIfAborted();}
  async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);try{await work();}catch(e){if(!lifecycle.current.signal.aborted)onError(e);}finally{if(!lifecycle.current.signal.aborted)setBusy(false);}}
  async function allPages(scope=''){const pages:DiaryPage[]=[];let cursor='';do{active();const query=new URLSearchParams();if(scope)query.set('month',scope);if(cursor)query.set('cursor',cursor);const value=await diaryRequest<DiaryPageList>('/pages'+(query.size?'?'+query:''));active();pages.push(...value.pages);cursor=value.cursor||'';if(pages.length>10000)throw Error('일기가 많아요. 기간을 나누어 보관해 주세요.');}while(cursor);return pages.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));}
  async function pdf(){const pages=await allPages(month);active();if(!pages.length)throw Error('이번 달 일기를 먼저 한 장 써 주세요.');if(!window.confirm('내려받은 PDF에는 일기장 잠금이 적용되지 않아요. 나만 사용하는 기기에 보관해 주세요. 내려받을까요?'))return;const{exportDiaryPdf}=await import('./diary-export');active();await exportDiaryPdf(pages,`${month} 나의 비밀일기.pdf`,lifecycle.current.signal);}
  async function backup(){if(password.length<10||password!==confirmation)throw Error('백업 비밀번호를 10자 이상, 두 칸에 같게 입력해 주세요.');const{createDiaryBackup}=await import('./diary-backup');const content=await createDiaryBackup(await allPages(),password,lifecycle.current.signal);active();const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`비밀일기-${diaryToday()}.diary.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setPassword('');setConfirmation('');onNotice('암호화한 백업을 내려받았어요. 비밀번호도 따로 안전하게 보관해 주세요.');}
  async function restore(file:File){
    if(file.size>45*1024*1024)throw Error('45MB 이하의 백업 파일을 골라 주세요.');
    const{readDiaryBackup,freshImportedPages}=await import('./diary-backup');const imported=freshImportedPages(await readDiaryBackup(await file.text(),password,lifecycle.current.signal));
    active();
    if(!imported.length)throw Error('백업에 일기가 없어요.');
    const{validateDiary}=await import('./policy');for(const page of imported)validateDiary(page,owned);
    if(!window.confirm(`${imported.length}장을 새 사본으로 가져올까요? 기존 일기는 그대로 남아요.`))return;
    let count=0;
    try{for(const page of imported){active();await diaryRequest('/pages/'+page.id,'PUT',page);count++;}}
    catch(e){throw Error(`${count}장까지 가져왔어요. ${e instanceof Error?e.message:'다시 시도해 주세요.'} 다시 전체 파일을 가져오면 사본이 추가될 수 있어요.`);}
    finally{if(!lifecycle.current.signal.aborted)await onReload();}
    setPassword('');setConfirmation('');onNotice(`${count}장의 일기를 가져왔어요.`);
  }
  return <section className="sd-shelf"><div className="sd-shelf-heading"><h3><BookHeart size={19}/>오래오래 간직하기</h3><button disabled={busy} onClick={onClose} aria-label="기록 보관함 닫기"><X size={18}/></button></div><div className="sd-shelf-grid">
    <div><h4>나의 일기책 PDF</h4><p>선택한 {month}의 일기를 종이와 손글씨, 스티커 모양 그대로 내려받아요. 한 번에 120장까지 만들 수 있어요. 내려받은 파일은 잠겨 있지 않아요.</p><button disabled={busy} onClick={()=>void action(pdf)}><FileDown size={16}/>이번 달 일기 PDF</button></div>
    <div><h4>다시 편집하는 암호화 백업</h4><p>백업 파일은 별도 비밀번호로 잠가요. 이 비밀번호를 잊으면 담당자도 파일을 열 수 없어요. 앱의 원본 일기는 계속 복구할 수 있어요. 한 파일에 최대 1,000장까지 담아요. 사진·전시작품이 있는 일기는 PDF로 보관하거나 계정 연결로 이어 써 주세요.</p><label>백업 비밀번호<input type="password" minLength={10} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off" placeholder="내보낼 때 10자 이상"/></label><label>내보내기 비밀번호 확인<input type="password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label><div className="sd-inline"><button disabled={busy} onClick={()=>void action(backup)}><Download size={15}/>백업 내보내기</button><button disabled={busy||!password} onClick={()=>input.current?.click()}><Upload size={15}/>가져오기</button><input ref={input} type="file" accept=".json,application/json" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void action(()=>restore(file));}}/></div></div>
    <div><h4>다음 학년에도 이어 쓰기</h4><p>같은 계정은 그대로 이어 써요. 새 계정을 받았다면 이전 계정에서 연결 코드를 만들고 새 계정에 입력해요. 코드는 본인에게만 보관해 주세요.</p><button disabled={busy} onClick={()=>void action(async()=>{const result=await diaryRequest<{token:string}>('/transfer','POST',{});setTransfer(result.token);})}><KeyRound size={15}/>새 계정 연결 코드 만들기</button>{transfer&&<output className="sd-transfer-token">{transfer}</output>}<p>새 계정의 일기장 첫 화면에서 ‘이전 계정의 일기장 이어 쓰기’를 눌러 연결 코드와 기존 잠금번호를 입력해요. 새 일기장을 만들기 전에 연결해 주세요.</p></div>
  </div><DiaryShares onError={onError} onNotice={onNotice}/>{busy&&<p role="status">기록을 차근차근 보관하고 있어요. 이 화면을 열어 두세요.</p>}</section>;
}
