'use client';
import {useEffect,useRef,useState} from 'react';
import {AdminResource,useAdminResource,adminDate,type AdminData as Data} from './admin-console-shared';
import {activityDuration as duration,activityRoleName,activityScreenName,type ActivityRole,type ActivityScreen} from '@/lib/activity';

type Tally={users:number;ms:number;views:number};
const roles:ActivityRole[]=['teacher','student','parent','admin'];
const number=(value:number)=>Math.round(value).toLocaleString('ko-KR');
const perPerson=(t?:Tally)=>t?.users?duration(t.ms/t.users):'—';
const shortDay=(day:string)=>`${Number(day.slice(5,7))}/${Number(day.slice(8))}`;
function add(target:Tally|undefined,value?:Partial<Tally>):Tally{return{users:(target?.users||0)+(value?.users||0),ms:(target?.ms||0)+(value?.ms||0),views:(target?.views||0)+(value?.views||0)};}

/** Sums finished days into one period: totals per role, per screen, per hour, per class and teacher. */
function period(days:Data[]){
  const total:Partial<Record<ActivityRole,Tally>>={},screens:Record<string,Partial<Record<ActivityRole,Tally>>>={},hours:Partial<Record<ActivityRole,number[]>>={},classes:Record<string,{name:string;users:number;ms:number;days:number}>={},teachers:Record<string,{name:string;ms:number;views:number;days:number}>={};
  for(const day of days){if(day.missing)continue;
    for(const role of roles)if(day.roles?.[role])total[role]=add(total[role],day.roles[role]);
    for(const[key,cell]of Object.entries(day.screens||{}))for(const role of roles)if((cell as Data)[role])(screens[key]??={})[role]=add(screens[key][role],(cell as Data)[role]);
    for(const role of roles)(day.hours?.[role]||[]).forEach((ms:number,hour:number)=>{(hours[role]??=Array(24).fill(0))[hour]+=ms;});
    for(const[id,v]of Object.entries(day.classes||{}) as [string,Data][]){const c=classes[id]??={name:day.classNames?.[id]||'학급',users:0,ms:0,days:0};c.users+=v.users;c.ms+=v.ms;c.days++;}
    for(const[id,v]of Object.entries(day.teachers||{}) as [string,Data][]){const t=teachers[id]??={name:day.teacherNames?.[id]||'교사',ms:0,views:0,days:0};t.ms+=v.ms;t.views+=v.views;t.days++;}
  }
  return{total,screens,hours,classes,teachers};
}

function useWidth(){const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(640);useEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(280,Math.round(entry.contentRect.width))));observer.observe(el);return()=>observer.disconnect();},[]);return[ref,width] as const;}

/** Daily active people per role: one line per role, crosshair tooltip on the hovered day. */
function TrendChart({days,shown}:{days:Data[];shown:ActivityRole[]}){
  const[ref,width]=useWidth(),[hover,setHover]=useState<number|null>(null),height=230,pad={l:40,r:16,t:14,b:28},w=width-pad.l-pad.r,h=height-pad.t-pad.b;
  const value=(day:Data,role:ActivityRole)=>day.missing?null:day.roles?.[role]?.users||0;
  const max=Math.max(1,...days.flatMap(day=>shown.map(role=>value(day,role)||0)));
  const step=max<=5?1:Math.ceil(max/4/5)*5,top=Math.ceil(max/step)*step,ticks=Array.from({length:top/step+1},(_,i)=>i*step);
  const x=(i:number)=>pad.l+(days.length<2?w/2:i*w/(days.length-1)),y=(v:number)=>pad.t+h-v/top*h;
  const every=Math.ceil(days.length/Math.max(2,Math.floor(w/56)));
  return <div ref={ref} className="admin-activity-chart" onMouseLeave={()=>setHover(null)}>
    <svg width={width} height={height} role="img" aria-label="역할별 하루 활성 사용자 추이">
      {ticks.map(t=><g key={t}><line x1={pad.l} x2={width-pad.r} y1={y(t)} y2={y(t)} className="grid"/><text x={pad.l-8} y={y(t)+4} textAnchor="end" className="axis">{t}</text></g>)}
      {days.map((day,i)=>i%every===0||i===days.length-1?<text key={day.date} x={x(i)} y={height-8} textAnchor="middle" className="axis">{shortDay(day.date)}</text>:null)}
      {hover!==null&&<line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t+h} className="cross"/>}
      {shown.map(role=>{const points=days.map((day,i)=>[i,value(day,role)] as const).filter(([,v])=>v!==null) as [number,number][];return <g key={role} className={'series is-'+role}>
        <polyline fill="none" points={points.map(([i,v])=>`${x(i)},${y(v)}`).join(' ')}/>
        {(hover!==null?points.filter(([i])=>i===hover):points.length<=31?points:[]).map(([i,v])=><circle key={i} cx={x(i)} cy={y(v)} r={hover===i?5:3.5}/>)}
      </g>;})}
      {days.map((day,i)=><rect key={day.date} x={x(i)-Math.max(6,w/days.length/2)} y={pad.t} width={Math.max(12,w/days.length)} height={h} fill="transparent" onMouseEnter={()=>setHover(i)} onClick={()=>setHover(i)}/>)}
    </svg>
    {hover!==null&&<div className="admin-activity-tip" style={{left:Math.min(Math.max(x(hover),90),width-90)}}><strong>{days[hover].date}</strong>{days[hover].missing?<span>기록 없음</span>:shown.map(role=><span key={role}><i className={'is-'+role}/>{activityRoleName[role]} {number(days[hover].roles?.[role]?.users||0)}명 · {duration(days[hover].roles?.[role]?.ms||0)}</span>)}</div>}
  </div>;
}

/** Active time by hour of day for one role (or all), as 24 bars. */
function HourChart({hours}:{hours:number[]}){
  const[ref,width]=useWidth(),[hover,setHover]=useState<number|null>(null),height=170,pad={l:8,r:8,t:10,b:24},w=width-pad.l-pad.r,h=height-pad.t-pad.b,max=Math.max(1,...hours),slot=w/24;
  return <div ref={ref} className="admin-activity-chart" onMouseLeave={()=>setHover(null)}>
    <svg width={width} height={height} role="img" aria-label="시간대별 이용 시간">
      <line x1={pad.l} x2={width-pad.r} y1={pad.t+h} y2={pad.t+h} className="grid"/>
      {hours.map((ms,hour)=>{const bh=ms?Math.max(2,ms/max*h):0;return <g key={hour} onMouseEnter={()=>setHover(hour)} onClick={()=>setHover(hour)}>
        <rect x={pad.l+hour*slot} y={pad.t} width={slot} height={h} fill="transparent"/>
        {bh>0&&<path className={'bar'+(hover===hour?' is-hover':'')} d={`M${pad.l+hour*slot+1},${pad.t+h}v${-(bh-Math.min(4,bh))}q0,-${Math.min(4,bh)} ${Math.min(4,bh)},-${Math.min(4,bh)}h${slot-2-2*Math.min(4,bh)}q${Math.min(4,bh)},0 ${Math.min(4,bh)},${Math.min(4,bh)}v${bh-Math.min(4,bh)}z`}/>}
        {hour%3===0&&<text x={pad.l+hour*slot+slot/2} y={height-7} textAnchor="middle" className="axis">{hour}시</text>}
      </g>;})}
    </svg>
    {hover!==null&&<div className="admin-activity-tip" style={{left:Math.min(Math.max(pad.l+hover*slot+slot/2,70),width-70)}}><strong>{hover}시 ~ {hover+1}시</strong><span>{duration(hours[hover])}</span></div>}
  </div>;
}

function Legend({shown}:{shown:ActivityRole[]}){return <div className="admin-activity-legend">{shown.map(role=><span key={role}><i className={'is-'+role}/>{activityRoleName[role]}</span>)}</div>;}

export default function AdminActivity({params,revision,refresh,set}:{params:URLSearchParams;revision:number;refresh:()=>void;set:(values:Record<string,string>)=>void}){
  const span=['30','90'].includes(params.get('days')||'')?params.get('days')!:'7',role=(roles as string[]).includes(params.get('role')||'')?params.get('role') as ActivityRole:'';
  const state=useAdminResource('activity?days='+span,revision);
  return <AdminResource state={state} onRetry={refresh}>{data=>{
    const today=data.today as Data,p=period(data.days),shown=roles.filter(r=>r!=='admin'||p.total.admin||today.roles?.admin),focus=role?[role]:shown;
    const userDays=(r:ActivityRole)=>p.total[r]?.users||0,finished=data.days.filter((d:Data)=>!d.missing).length||1;
    const screenRows=Object.entries(p.screens).map(([key,cell])=>{const t=focus.reduce<Tally|undefined>((sum,r)=>cell[r]?add(sum,cell[r]):sum,undefined);return t&&{key,t};}).filter(Boolean).sort((a,b)=>b!.t.ms-a!.t.ms) as {key:string;t:Tally}[];
    const maxScreen=Math.max(1,...screenRows.map(r=>r.t.ms));
    const hours=Array(24).fill(0).map((_,hour)=>focus.reduce((sum,r)=>sum+(p.hours[r]?.[hour]||0),0));
    const classes=Object.entries(p.classes).sort((a,b)=>b[1].ms-a[1].ms).slice(0,30),teachers=Object.entries(p.teachers).sort((a,b)=>b[1].ms-a[1].ms).slice(0,30);
    return <div className="admin-activity">
      <section className="content-card"><div className="admin-list-heading"><h2>오늘 지금까지</h2><span className="admin-scope">{today.date} · 1분마다 갱신</span></div>
        <div className="admin-stat-grid">{shown.map(r=><div className="admin-stat" key={r}><span><i className={'admin-activity-dot is-'+r}/>{activityRoleName[r]}</span><strong>{number(today.roles?.[r]?.users||0)}명</strong><small>총 {duration(today.roles?.[r]?.ms||0)} · 1인 평균 {perPerson(today.roles?.[r])}</small></div>)}</div>
      </section>
      <div className="admin-filters admin-activity-filters"><div className="segmented" role="group" aria-label="조회 기간">{['7','30','90'].map(d=><button key={d} type="button" className={span===d?'selected':''} aria-pressed={span===d} onClick={()=>set({days:d==='7'?'':d})}>최근 {d}일</button>)}</div>
        <div className="segmented" role="group" aria-label="사용자 구분"><button type="button" className={!role?'selected':''} aria-pressed={!role} onClick={()=>set({role:''})}>전체</button>{shown.map(r=><button key={r} type="button" className={role===r?'selected':''} aria-pressed={role===r} onClick={()=>set({role:r})}>{activityRoleName[r]}</button>)}</div></div>
      {data.pending>0&&<p className="admin-scope">기록을 모으기 전 {data.pending}일은 비어 있어요.</p>}
      <section className="content-card"><h2>기간 요약</h2><p className="admin-scope">어제까지 {finished}일 · 하루 활성 사용자는 그날 한 번이라도 들어온 사람 수예요.</p>
        <div className="admin-stat-grid">{focus.map(r=><div className="admin-stat" key={r}><span><i className={'admin-activity-dot is-'+r}/>{activityRoleName[r]} · 하루 평균</span><strong>{number(userDays(r)/finished)}명</strong><small>1인 하루 평균 {perPerson(p.total[r])} · 총 {duration(p.total[r]?.ms||0)}</small></div>)}</div>
        <div className="admin-activity-head"><h3>하루 활성 사용자 추이</h3><Legend shown={focus}/></div>
        <TrendChart days={data.days} shown={focus}/>
      </section>
      <section className="content-card"><h2>화면별 체류 시간</h2><p className="admin-scope">화면이 보이고 최근 2분 안에 조작했거나 영상·소리가 재생 중일 때만 시간을 셉니다.</p>
        {screenRows.length?<div className="admin-usage-table-wrap"><table className="admin-usage-table admin-activity-table"><caption>{role?activityRoleName[role]:'전체 사용자'} · 최근 {span}일</caption><thead><tr><th>화면</th><th>총 체류</th><th>이용자 (하루 합계)</th><th>1인 평균</th><th>열람 수</th></tr></thead><tbody>{screenRows.map(({key,t})=><tr key={key}><th>{activityScreenName[key as ActivityScreen]||key}<small>{key.startsWith('teacher-')?'교사 화면':key.startsWith('student-')?'학생 화면':key.startsWith('public-')?'로그인 없는 공개 화면':'운영 화면'}</small></th><td><span className="admin-activity-bar"><i style={{width:`${Math.max(2,t.ms/maxScreen*100)}%`}}/></span>{duration(t.ms)}</td><td>{number(t.users)}명</td><td>{perPerson(t)}</td><td>{number(t.views)}회</td></tr>)}</tbody></table></div>:<p className="admin-scope">아직 기록이 없어요. 오늘 쌓인 기록은 내일 새벽 요약에 들어갑니다.</p>}
      </section>
      <section className="content-card"><h2>시간대별 이용</h2><p className="admin-scope">{role?activityRoleName[role]:'전체 사용자'} · 최근 {span}일 동안 각 시간대에 쓴 시간의 합계</p><HourChart hours={hours}/></section>
      {(!role||role==='student')&&<section className="content-card"><h2>학급별 학생 이용</h2>{classes.length?<div className="admin-usage-table-wrap"><table className="admin-usage-table"><thead><tr><th>학급</th><th>총 체류</th><th>하루 평균 활동 학생</th><th>학생 1인 평균</th></tr></thead><tbody>{classes.map(([id,c])=><tr key={id}><th>{c.name}</th><td>{duration(c.ms)}</td><td>{number(c.users/finished)}명</td><td>{c.users?duration(c.ms/c.users):'—'}</td></tr>)}</tbody></table></div>:<p className="admin-scope">기간 안에 학생 기록이 없어요.</p>}</section>}
      {(!role||role==='teacher')&&<section className="content-card"><h2>교사별 이용</h2>{teachers.length?<div className="admin-usage-table-wrap"><table className="admin-usage-table"><thead><tr><th>교사</th><th>총 체류</th><th>접속한 날</th><th>하루 평균</th><th>열람 수</th></tr></thead><tbody>{teachers.map(([id,t])=><tr key={id}><th>{t.name}</th><td>{duration(t.ms)}</td><td>{t.days}일</td><td>{duration(t.ms/t.days)}</td><td>{number(t.views)}회</td></tr>)}</tbody></table></div>:<p className="admin-scope">기간 안에 교사 기록이 없어요.</p>}</section>}
      <p className="admin-scope">학부모·방문자는 로그인 없이 공개 전시·보드를 본 기기이며, 날마다 바뀌는 무작위 번호로만 셉니다. 사람별 원본은 {data.retentionDays}일 뒤 자동 삭제되고, 하루 요약만 남습니다. 확인 {adminDate(data.checkedAt)}</p>
    </div>;}}</AdminResource>;
}
