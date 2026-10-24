'use client';
import {useEffect,useRef,useState} from 'react';
import {Sparkles,Copy,LoaderCircle} from 'lucide-react';
import {safeSourceUrl} from '@/lib/ai-citations';
export function CitedText({text}:{text:string}) {
  const parts=text.split(/(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
  return <div className="tools-prose">{parts.map((part,i)=>{const match=part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);const href=match&&safeSourceUrl(match[2]);return href?<a key={i} href={href} target="_blank" rel="noopener noreferrer">{match![1]}</a>:<span key={i}>{part}</span>;})}</div>;
}
export default function ToolAssistant({name,locale='ko',classId=''}:{name:string;locale?:string;classId?:string}) {
  const en=locale==='en',[source,setSource]=useState(''),[result,setResult]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function generate(){if(busy)return;setBusy(true);setError('');const abort=new AbortController();controller.current=abort;const timeout=setTimeout(()=>abort.abort(),60000);try{const response=await fetch('/api/ai/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({tool:'tool-plan',...(classId?{classId}:{}),source:JSON.stringify({classroomTool:name,request:source}),locale:en?'en':'ko'})});const body=await response.json();if(!response.ok)throw Error(body.error);setResult(body.text);}catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'AI error');else setError(en?'The request timed out. Try again.':'응답 시간이 길어졌어요. 다시 시도해 주세요.');}finally{clearTimeout(timeout);setBusy(false);}}
  return <details className="tool-assistant"><summary><Sparkles size={17}/>{en?'Plan with AI':'AI로 수업 준비하기'}<span>✦ AI</span></summary><p>{en?'Describe the lesson or constraints. Review the draft, then apply it to the tool.':'수업 주제나 조건을 적어 주세요. 제안을 확인한 뒤 도구 설정에 적용해 주세요.'}</p><label>{en?'Lesson and conditions':'수업 주제·조건'}<textarea maxLength={4000} value={source} onChange={e=>setSource(e.target.value)} placeholder={en?'A 40-minute lesson with 3 group activities':'예: 40분 사회 수업, 모둠 활동 3개, 정리 5분'}/></label><button className="button soft" onClick={()=>void generate()} disabled={busy||source.trim().length<5}>{busy?<LoaderCircle size={16} className="spin"/>:<Sparkles size={16}/>} {en?'Make a plan':'준비 초안 만들기'}</button>{error&&<p role="alert" className="error-message">{error}</p>}{result&&<><label>{en?'Editable teacher draft':'수정할 수 있는 교사용 초안'}<textarea rows={10} value={result} onChange={e=>setResult(e.target.value)}/></label><button className="button" onClick={()=>void navigator.clipboard.writeText(result).catch(()=>setError(en?'Select and copy the text.':'내용을 선택해서 복사해 주세요.'))}><Copy size={15}/>{en?'Copy':'복사'}</button></>}</details>;
}
