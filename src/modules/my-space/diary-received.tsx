'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,BookHeart,RefreshCw} from 'lucide-react';
import {diaryRequest} from './diary-client';
import type {DiaryPage} from './catalog';
import DiaryCanvas from './diary-canvas';
import './diary.css';
import './diary-editor.css';
type Shared={id:string;studentName:string;title:string;date:string;sharedAt:string};
export default function DiaryReceived(){
  const [shares,setShares]=useState<Shared[]>([]),[cursor,setCursor]=useState(''),[selected,setSelected]=useState<{id:string;page:DiaryPage;studentName:string;sharedAt:string}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function load(after=''){setLoading(true);try{const result=await diaryRequest<{shares:Shared[];cursor?:string}>('/received-shares'+(after?'?cursor='+encodeURIComponent(after):''));setShares(old=>after?[...old,...result.shares]:result.shares);setCursor(result.cursor||'');}catch(e){setError(e instanceof Error?e.message:'공유한 일기를 불러오지 못했습니다.');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  async function open(id:string){setLoading(true);setError('');try{const result=await diaryRequest<{page:DiaryPage;studentName:string;sharedAt:string}>('/received-shares/'+id);setSelected({...result,id});}catch(e){setError(e instanceof Error?e.message:'학생이 공개를 취소했거나 열 수 없는 일기입니다.');setSelected(null);}finally{setLoading(false);}}
  return <main className="sd-diary" style={{maxWidth:1100,margin:'0 auto',padding:'28px 18px'}}><Link href="/teacher" className="button soft"><ArrowLeft size={16}/>내 교실</Link><header className="sd-welcome"><div><span className="sd-eyebrow">STORIES SHARED WITH YOU</span><h2><BookHeart size={27}/> 아이가 보여준 일기</h2><p>아이가 직접 선택해 공유한 사본만 표시됩니다. 비공개 일기와 이후 수정한 내용은 볼 수 없습니다.</p></div><button disabled={loading} onClick={()=>{setSelected(null);void load();}}><RefreshCw size={16}/>새로고침</button></header>{error&&<p role="alert" className="sd-message sd-error">{error}</p>}
    {selected?<section><button onClick={()=>setSelected(null)}><ArrowLeft size={16}/>공유 목록</button><h3>{selected.studentName} · {selected.page.title}</h3><p>{selected.page.date}의 기록 · {new Date(selected.sharedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}에 공유한 사본</p><div className="sd-editor" style={{maxWidth:820,margin:'20px auto'}}><DiaryCanvas layers={selected.page.layers} paper={selected.page.paper} assetBase={`/api/secret-diary/received-shares/${selected.id}/assets`} selected="" tool="select" ink={{color:'#355147',width:4,penOnly:false}} zoom={1} disabled onChange={()=>{}} onSelect={()=>{}} onTool={()=>{}} onText={()=>{}} onSticker={()=>{}} onBegin={()=>{}} onEnd={()=>{}} onNotice={setError}/></div></section>:<section className="sd-day-stories"><div>{shares.map(share=><button disabled={loading} key={share.id} onClick={()=>void open(share.id)}><BookHeart size={25}/><strong>{share.studentName}</strong><span>{share.date} · {share.title}</span><small>아이가 공유한 한 장</small></button>)}</div>{!shares.length&&<p>{loading?'공유한 일기를 불러오는 중입니다.':'아직 아이가 공유한 일기가 없습니다.'}</p>}{cursor&&<button disabled={loading} onClick={()=>void load(cursor)}>더 보기</button>}</section>}
  </main>;
}
