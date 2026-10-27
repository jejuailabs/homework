'use client';
import {useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {DoorOpen, Users, Zap, Swords} from 'lucide-react';
import {playKinds,playLabels,type PlayKind} from './types';
import {roomRequest} from './use-play-room';
import type {PlayRoomMode} from './room-types';
import './room-styles.css';

export default function RoomLauncher({classId,teacher=false,enabled=true}:{classId?:string;teacher?:boolean;enabled?:boolean}) {
  const router=useRouter(),[code,setCode]=useState(''),[mode,setMode]=useState<PlayRoomMode>(teacher?'team':'duel'),[kind,setKind]=useState<PlayKind|'mixed'>('mixed'),[rounds,setRounds]=useState(10),[seconds,setSeconds]=useState(15),[teamCount,setTeamCount]=useState(2),[range,setRange]=useState('all'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef<{configuration:string;id:string}|null>(null);
  async function create(){setBusy(true);setError('');const configuration=JSON.stringify([mode,kind,classId,rounds,seconds,teamCount,range]);if(pending.current?.configuration!==configuration)pending.current={configuration,id:crypto.randomUUID()};try{const room=await roomRequest<{roomId:string;code:string}>('rooms',{mode,kinds:range!=='all'?['spelling']:kind==='mixed'?[...playKinds]:[kind],requestId:pending.current.id,...(teacher?{classId,rounds,seconds,teamCount,range}:{})});router.push(teacher?`/teacher/playground/live/${room.roomId}`:`/student/playground/room/${room.code}`);}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  return <section className="play-room-launcher" aria-label={teacher?'팀전 열기':'친구와 함께 놀기'}>
    <h2><Users size={22}/>{teacher?'우리 반 팀전':'친구와 함께 놀기'}</h2>
    {!enabled&&<p>{teacher?'말놀이터를 켜면 팀전을 열 수 있어요.':'선생님이 친구 대결을 열면 방을 만들 수 있어요. 교실 팀전은 아래 코드로 참가해요.'}</p>}
    <fieldset disabled={!enabled||busy}><legend className="sr-only">새 방 설정</legend>
      {!teacher&&<div className="play-room-modes"><button type="button" aria-pressed={mode==='duel'} onClick={()=>setMode('duel')}><Swords size={18}/>1:1 대결</button><button type="button" aria-pressed={mode==='speed'} onClick={()=>setMode('speed')}><Zap size={18}/>2~4인 순발력</button></div>}
      <label>문제 종류<select value={kind} onChange={event=>setKind(event.target.value as PlayKind|'mixed')}><option value="mixed">골고루 섞기</option>{playKinds.map(value=><option key={value} value={value}>{playLabels[value]}</option>)}</select></label>
      {teacher&&<label>출제 범위<select value={range} onChange={event=>setRange(event.target.value)}><option value="all">선택한 종류의 전체 문제</option><option value="week">이번 주 맞춤법 목록</option><option value="mistakes">많이 틀린 맞춤법 20개</option></select></label>}
      {teacher&&<div className="play-room-options"><label>문제 수<input type="number" min={3} max={30} value={rounds} onChange={event=>setRounds(Number(event.target.value))}/></label><label>문제당 초<input type="number" min={10} max={30} value={seconds} onChange={event=>setSeconds(Number(event.target.value))}/></label><label>팀 수<select value={teamCount} onChange={event=>setTeamCount(Number(event.target.value))}>{[2,3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></label></div>}
      <button type="button" className="button" onClick={()=>void create()} disabled={teacher&&!classId||busy}>{busy?'방을 준비해요…':teacher?'팀전 열기':'새 방 만들기'}</button>
    </fieldset>
    {!teacher&&<form className="play-room-join" onSubmit={event=>{event.preventDefault();if(/^\d{4}$/.test(code))router.push(`/student/playground/room/${code}`);}}><label htmlFor="play-room-code">친구·선생님 방 코드<input id="play-room-code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} placeholder="숫자 4자리" required/></label><button className="button" disabled={!/^\d{4}$/.test(code)||busy}><DoorOpen size={18}/>참가하기</button></form>}
    {error&&<p role="alert" className="play-room-error">{error}</p>}
  </section>;
}
