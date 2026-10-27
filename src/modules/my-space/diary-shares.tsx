'use client';
import {useEffect,useState} from 'react';
import {diaryRequest} from './diary-client';
type Share={id:string;pageId:string;title:string;date:string;sharedAt:string};
export default function DiaryShares({onError,onNotice}:{onError:(e:unknown)=>void;onNotice:(value:string)=>void}) {
  const [shares,setShares]=useState<Share[]>([]),[cursor,setCursor]=useState(''),[busy,setBusy]=useState(false);
  async function load(after=''){const result=await diaryRequest<{shares:Share[];cursor?:string}>('/shares'+(after?'?cursor='+encodeURIComponent(after):''));setShares(old=>after?[...old,...result.shares]:result.shares);setCursor(result.cursor||'');}
  useEffect(()=>{void load().catch(onError);},[]);
  return <div className="sd-shares"><h4>선생님께 보여드린 일기</h4><p>이 목록의 사본만 선생님이 볼 수 있어요. 공개를 취소해도 선생님이 이미 저장한 사본까지 지워지지는 않아요.</p>{!shares.length&&<p>아직 보여드린 일기가 없어요.</p>}{shares.map(share=><div className="sd-shared-row" key={share.id}><span>{share.date} · {share.title}</span><button disabled={busy} onClick={()=>{setBusy(true);void diaryRequest('/shares/'+share.id,'DELETE').then(()=>load()).then(()=>onNotice('선생님 화면에서 이 사본을 더 이상 열 수 없어요.')).catch(onError).finally(()=>setBusy(false));}}>공개 취소</button></div>)}{cursor&&<button onClick={()=>void load(cursor).catch(onError)}>더 보기</button>}</div>;
}
