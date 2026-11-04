'use client';
import {Fragment,useEffect,useMemo,useState} from 'react';
import {ArrowDownWideNarrow,ChevronDown,ChevronRight,Download} from 'lucide-react';
import {AdminResource,useAdminResource,type AdminData as Data,adminDate} from './admin-console-shared';
import {aiFeatureName,aiUsagePeriod,type AiUsageMetrics} from '@/lib/ai-usage';
import {csvCell} from '@/lib/admin-console-policy';

type Row=AiUsageMetrics&{uid?:string;tool?:string;name?:string};
const number=(value:number)=>Math.round(value).toLocaleString('ko-KR');
// Token kinds an admin can rank teachers by. Cached input is part of input, billed at a lower rate.
const kinds=[
  {key:'totalTokens',label:'전체 토큰',cell:(r:Row)=>r.measuredCalls?number(r.totalTokens):'미집계'},
  {key:'inputTokens',label:'입력 토큰',cell:(r:Row)=>r.measuredCalls?number(r.inputTokens):'미집계'},
  {key:'cachedInputTokens',label:'캐시 입력',cell:(r:Row)=>r.measuredCalls?number(r.cachedInputTokens):'미집계'},
  {key:'outputTokens',label:'출력 토큰',cell:(r:Row)=>r.measuredCalls?number(r.outputTokens):'미집계'},
  {key:'audioSeconds',label:'음성 길이',cell:(r:Row)=>r.audioSeconds?`${(r.audioSeconds/60).toFixed(1)}분`:'—'},
  {key:'webSearchCalls',label:'웹 검색',cell:(r:Row)=>r.webSearchCalls?`${number(r.webSearchCalls)}회`:'—'},
  {key:'estimatedUsd',label:'추정 비용',cell:(r:Row)=>r.pricedCalls?'$'+r.estimatedUsd.toFixed(4):r.requests?'미집계':'$0'},
  {key:'requests',label:'호출',cell:(r:Row)=>number(r.requests)},
] as const;
type Kind=typeof kinds[number]['key'];

export default function AdminAiTokens({params,revision,refresh,set}:{params:URLSearchParams;revision:number;refresh:()=>void;set:(values:Record<string,string>)=>void}){
  const today=aiUsagePeriod(null,null),[from,setFrom]=useState(params.get('from')||today.from),[to,setTo]=useState(params.get('to')||today.to),[error,setError]=useState(''),[open,setOpen]=useState<string[]>([]);
  useEffect(()=>{setFrom(params.get('from')||today.from);setTo(params.get('to')||today.to);setError('');},[params.get('from'),params.get('to'),today.from,today.to]);
  const sort=(kinds.some(k=>k.key===params.get('sort'))?params.get('sort'):'totalTokens') as Kind;
  const query=new URLSearchParams();for(const key of ['from','to'])if(params.get(key))query.set(key,params.get(key)!);
  const state=useAdminResource('ai-tokens?'+query,revision);
  function download(data:Data){
    const lines=[['조회 시작일',data.from,'조회 종료일',data.to],['집계 기준','앱이 기록한 외부 AI API 요청; 추정 비용은 실제 청구액이 아님'],['교사 UID','교사','기능','호출','입력 토큰','캐시 입력 토큰','출력 토큰','전체 토큰','음성(초)','웹 검색','추정 비용 USD','토큰 미집계 호출'],
      ...data.teachers.flatMap((t:Data)=>[['전체',t],...t.tools.map((f:Data)=>[aiFeatureName(f.tool),f])].map(([label,r]:[string,Data])=>[t.uid,t.name,label,r.requests,r.inputTokens,r.cachedInputTokens,r.outputTokens,r.totalTokens,r.audioSeconds.toFixed(1),r.webSearchCalls,r.pricedCalls?r.estimatedUsd.toFixed(8):'',r.requests-r.measuredCalls]))];
    const blob=new Blob(['﻿'+lines.map(line=>line.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`teacher-tokens-${data.from}-${data.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <><div className="admin-filters"><form className="admin-usage-period" onSubmit={event=>{event.preventDefault();try{aiUsagePeriod(from,to);setError('');set({from,to});}catch{setError('올바른 조회 기간을 최대 31일로 선택해 주세요.');}}}><label>시작일<input type="date" aria-label="토큰 조회 시작일" value={from} onChange={event=>setFrom(event.target.value)}/></label><label>종료일<input type="date" aria-label="토큰 조회 종료일" value={to} onChange={event=>setTo(event.target.value)}/></label><button className="button">기간 적용</button></form>
    <label className="admin-token-sort"><ArrowDownWideNarrow size={15}/>정렬 기준<select value={sort} onChange={event=>set({sort:event.target.value})}>{kinds.map(k=><option key={k.key} value={k.key}>{k.label}</option>)}</select></label></div>{error&&<p role="alert" className="error-message">{error}</p>}
    <AdminResource state={state} onRetry={refresh}>{data=><TokenView data={data} sort={sort} open={open} toggle={uid=>setOpen(list=>list.includes(uid)?list.filter(x=>x!==uid):[...list,uid])} onSort={key=>set({sort:key})} download={()=>download(data)}/>}</AdminResource>
  </>;
}

function TokenView({data,sort,open,toggle,onSort,download}:{data:Data;sort:Kind;open:string[];toggle:(uid:string)=>void;onSort:(key:Kind)=>void;download:()=>void}){
  const total=data.total as Row;
  const rows=useMemo(()=>[...(data.teachers as (Row&{tools:Row[]})[])].sort((a,b)=>b[sort]-a[sort]).map(t=>({...t,tools:[...t.tools].sort((a,b)=>b[sort]-a[sort])})),[data.teachers,sort]);
  return <>
    <section className="content-card"><div className="admin-list-heading"><h2>교사 토큰 사용량</h2><button className="button soft" onClick={download}><Download size={16}/>교사·기능별 CSV</button></div>
      <p className="admin-scope">{data.from} ~ {data.to} · {data.limitsNote}</p>{data.partial&&<p role="alert" className="error-message">요청이 50,000건을 넘어 최근 50,000건만 집계했습니다. 조회 기간을 줄여 주세요.</p>}
      <div className="admin-stat-grid">{kinds.slice(0,7).map(k=><button type="button" className={'admin-stat admin-token-stat'+(sort===k.key?' is-sorted':'')} key={k.key} onClick={()=>onSort(k.key)} aria-pressed={sort===k.key}><span>{k.label}</span><strong>{k.cell(total)}</strong><small>{k.key==='cachedInputTokens'?'입력 토큰 중 할인 적용분':k.key==='estimatedUsd'?`비용 확인 ${number(total.pricedCalls)}건`:k.key==='audioSeconds'?'전사 녹음 길이':k.key==='webSearchCalls'?'수업자료 웹 검색':`토큰 확인 ${number(total.measuredCalls)} / ${number(total.requests)}건`}</small></button>)}</div>
    </section>
    <section className="content-card"><h2>교사별 · 기능별</h2><p className="admin-scope">교사 이름을 누르면 기능별로 나눠 봅니다. 표 머리글이나 위 칸을 누르면 그 항목이 큰 순서로 정렬됩니다.</p>
      <div className="admin-usage-table-wrap"><table className="admin-usage-table admin-token-table"><caption>교사별 AI 토큰 사용량</caption>
        <thead><tr><th>교사 · 기능</th>{kinds.map(k=><th key={k.key} aria-sort={sort===k.key?'descending':'none'}><button type="button" className="admin-usage-link" onClick={()=>onSort(k.key)}>{k.label}{sort===k.key?' ↓':''}</button></th>)}</tr></thead>
        <tbody>{rows.map(t=>{const expanded=open.includes(t.uid!);return <Fragment key={t.uid}>
          <tr><th><button type="button" className="admin-usage-link" aria-expanded={expanded} onClick={()=>toggle(t.uid!)}>{expanded?<ChevronDown size={13}/>:<ChevronRight size={13}/>}{t.name}</button><small>{t.tools.length}개 기능</small></th>{kinds.map(k=><td key={k.key}>{k.cell(t)}</td>)}</tr>
          {expanded&&t.tools.map(f=><tr key={f.tool} className="admin-token-sub"><th>{aiFeatureName(f.tool!)}</th>{kinds.map(k=><td key={k.key}>{k.cell(f)}</td>)}</tr>)}
        </Fragment>;})}</tbody></table>{!rows.length&&<p className="admin-scope">선택한 기간에 AI 요청이 없습니다.</p>}</div>
      <p className="admin-scope">{data.meteringSince} 이후 기록부터 집계합니다. 읽어 주기 음성처럼 제공사가 사용량을 돌려주지 않는 호출은 ‘미집계’로 표시되고 호출 수만 셉니다. 추정 비용은 실제 청구액이 아닙니다. 확인 {adminDate(data.checkedAt)}</p>
    </section>
  </>;
}
