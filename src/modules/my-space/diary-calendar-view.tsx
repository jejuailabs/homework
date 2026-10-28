'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, BookHeart, Download, LockKeyhole, Plus, Sparkles} from 'lucide-react';
import type {DiaryPage} from './catalog';
import {diaryRequest, type DiaryStatus} from './diary-client';
import {diaryCalendarDays, diaryMonthLabel, diaryToday, moveDiaryMonth} from './diary-calendar';
import {moodStickers} from './diary-stickers';
import DiaryLibrary from './diary-library';
export type DiaryPageList = {pages: DiaryPage[]; cursor?: string};
export default function DiaryCalendar({owned, month, onMonth, onOpen, onNew, onLock, onError, onNotice, onStatus}: {owned: string[];month:string;onMonth:(month:string)=>void; onOpen:(page:DiaryPage)=>void; onNew:(date:string)=>void; onLock:()=>void; onError:(e:unknown)=>void; onNotice:(value:string)=>void; onStatus:(status:DiaryStatus)=>void}) {
  const setMonth=onMonth;
  const [pages,setPages]=useState<DiaryPage[]>([]),[cursor,setCursor]=useState(''),[selectedDay,setSelectedDay]=useState(''),[loading,setLoading]=useState(false),[shelf,setShelf]=useState(false),[loaded,setLoaded]=useState(false);
  const sequence=useRef(0),errorRef=useRef(onError);errorRef.current=onError;
  const load=useCallback(async(next='')=>{
    const request=++sequence.current;setLoading(true);setLoaded(false);
    try{const accumulated:DiaryPage[]=[];let after=next;do{const result=await diaryRequest<DiaryPageList>(`/pages?month=${month}${after?'&cursor='+encodeURIComponent(after):''}`);if(request!==sequence.current)return;accumulated.push(...result.pages);after=result.cursor||'';if(accumulated.length>10000)throw Error('이번 달의 기록이 많아요. 운영 담당자에게 알려 주세요.');}while(after);setPages(old=>next?[...old,...accumulated.filter(p=>!old.some(o=>o.id===p.id))]:accumulated);setCursor('');setLoaded(true);}
    catch(e){if(request===sequence.current)errorRef.current(e);}finally{if(request===sequence.current)setLoading(false);}
  },[month]);
  useEffect(()=>{setPages([]);setCursor('');void load();return()=>{sequence.current++;};},[load]);
  const daily=pages.filter(page=>page.date===selectedDay);
  return <>
    <header className="sd-welcome"><div><span className="sd-eyebrow">MY LITTLE SECRET GARDEN</span><h2>나의 마음이 자라는 곳 <img src="/diary/v1/diary-flower.svg" alt=""/></h2><p>한 줄이어도, 그림 하나여도 괜찮아. 오늘의 나를 남겨 보자.</p></div><div className="sd-top-actions"><button onClick={()=>setShelf(!shelf)} aria-expanded={shelf}><Download size={16}/>나의 기록 보관함</button><button onClick={onLock}><LockKeyhole size={16}/>잠그기</button></div></header>
    {shelf&&<DiaryLibrary month={month} owned={owned} onClose={()=>setShelf(false)} onReload={()=>load()} onError={onError} onNotice={onNotice} onStatus={onStatus}/>}
    <div className="sd-calendar-layout"><div className="sd-calendar-paper"><div className="sd-calendar-binding" aria-hidden="true"/><div className="sd-month"><button aria-label="이전 달" disabled={month<='1900-01'} onClick={()=>{setMonth(moveDiaryMonth(month,-1));setSelectedDay('');}}><ArrowLeft size={20}/></button><div><span>작은 순간들을 모아요</span><h3>{diaryMonthLabel(month)}</h3></div><button aria-label="다음 달" disabled={month>='2199-12'} onClick={()=>{setMonth(moveDiaryMonth(month,1));setSelectedDay('');}}><ArrowRight size={20}/></button></div>
      <div className="sd-calendar-tools"><label>달 고르기<input type="month" value={month} min="1900-01" max="2199-12" onChange={e=>{if(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)){setMonth(e.target.value);setSelectedDay('');}}}/></label><button onClick={()=>{setMonth(diaryToday().slice(0,7));setSelectedDay(diaryToday());}}>오늘로</button></div>
      <div className="sd-calendar" aria-label={diaryMonthLabel(month)}>{['일','월','화','수','목','금','토'].map((label,i)=><div key={label} className={`sd-weekday ${i===0?'sd-sunday':''}`}>{label}</div>)}{diaryCalendarDays(month).map((date,index)=>{
        if(!date)return <div key={'blank'+index} className="sd-empty-day"/>;
        const entries=pages.filter(page=>page.date===date),mood=moodStickers.find(item=>item.mood===entries[0]?.mood);
        return <button key={date} className={`sd-day ${date===diaryToday()?'sd-today':''} ${date===selectedDay?'sd-chosen':''} ${entries.length?'sd-recorded':''}`} disabled={loading||!loaded} aria-label={`${date}, ${entries.length?'일기 '+entries.length+'장':'새 일기 쓰기'}`} aria-pressed={date===selectedDay} onClick={()=>{setSelectedDay(date);if(!entries.length)onNew(date);else if(entries.length===1)onOpen(entries[0]);}}><span className="sd-day-number">{Number(date.slice(-2))}</span>{mood?<img src={mood.art} alt={mood.name}/>:entries.length?<img src="/diary/v1/diary-heart.svg" alt="기록한 날"/>:<span className="sd-day-plus" aria-hidden="true">+</span>}{entries.length>1&&<small>{entries.length}장</small>}</button>;
      })}</div><p className="sd-calendar-caption">{loading?'이번 달 일기를 꺼내고 있어요…':'날짜를 톡 누르면, 그날의 이야기가 펼쳐져요.'}</p>{!loaded&&!loading&&<button onClick={()=>void load()}>달력 다시 불러오기</button>}{cursor&&<button disabled={loading} onClick={()=>void load(cursor)}>이번 달 기록 더 불러오기</button>}
    </div><aside className="sd-calendar-aside"><div className="sd-today-card"><img src="/diary/v1/diary-rabbit.svg" alt=""/><span>DEAR, MYSELF</span><h3>오늘의 나는<br/>어떤 색일까?</h3><p>잘 쓸 필요 없어.<br/>네 마음 그대로면 충분해.</p><button disabled={loading||!loaded} className="sd-primary" onClick={()=>{const today=diaryToday();if(month!==today.slice(0,7)){setMonth(today.slice(0,7));setSelectedDay(today);return;}const found=pages.find(p=>p.date===today);found?onOpen(found):onNew(today);}}><Plus size={17}/>오늘의 이야기</button></div><div className="sd-small-note"><Sparkles size={20}/><p>글 대신 스티커 하나만<br/>붙여도 멋진 일기야.</p></div><div className="sd-private-note"><LockKeyhole size={16}/><span>5분 동안 쉬거나 화면을 떠나면<br/>일기장이 잠겨요.</span></div></aside></div>
    {selectedDay&&daily.length>0&&<section className="sd-day-stories"><h3>{selectedDay}의 이야기</h3><div>{daily.map(page=><button key={page.id} onClick={()=>onOpen(page)}><BookHeart size={22}/><strong>{page.title}</strong><span>이야기 펼치기 →</span></button>)}<button onClick={()=>onNew(selectedDay)}><Plus size={22}/>한 장 더 쓰기</button></div></section>}
    {!!pages.length&&<details className="sd-record-list"><summary>이번 달의 이야기 {pages.length}장</summary>{[...pages].sort((a,b)=>b.date.localeCompare(a.date)).map(page=><div key={page.id}><button onClick={()=>{setSelectedDay(page.date);onOpen(page);}}>{page.date} · {page.title}</button><button onClick={()=>onNew(page.date)} aria-label={page.date+' 한 장 더 쓰기'}><Plus size={14}/></button><button aria-label={page.title+' 삭제'} onClick={()=>{if(window.confirm('이 일기를 삭제할까요? 삭제한 일기는 되돌릴 수 없어요. 선생님께 공개한 사본은 기록 보관함에서 따로 공개 취소해야 해요.'))void diaryRequest(`/pages/${page.id}?version=${page.version}`,'DELETE').then(()=>load()).catch(onError);}}>삭제</button></div>)}</details>}
  </>;
}
