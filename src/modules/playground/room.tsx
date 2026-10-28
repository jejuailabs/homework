'use client';
import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Clock3, Flag, Pause, Play, RefreshCw, Trophy, Users, Wifi, WifiOff} from 'lucide-react';
import QRCode from 'qrcode';
import CharacterAvatar from '@/components/character-avatar';
import SocialPanel from './social';
import {usePlayRoom} from './use-play-room';
import {roomModeLabels, roomTeamColors, roomTeamNames} from './room-types';
import type {PlayChoice} from './types';
import './room-styles.css';

function shuffled(choices: PlayChoice[], seed: string) {
  const hash=(value:string)=>{let n=2166136261;for(const char of value)n=Math.imul(n^char.charCodeAt(0),16777619);return n>>>0;};
  return [...choices].sort((a,b)=>hash(`${seed}:${a.id}`)-hash(`${seed}:${b.id}`));
}
export default function PlayRoomScreen({codeOrId,teacher=false}:{codeOrId:string;teacher?:boolean}) {
  const {room,question,player,players,viewer,error,connected,busy,now,action,refresh}=usePlayRoom(codeOrId,teacher);
  const [selected,setSelected]=useState(''),[teams,setTeams]=useState<Record<string,number>>({}),[qr,setQr]=useState(''),[endArmed,setEndArmed]=useState(false),[reward,setReward]=useState(1),[rewarded,setRewarded]=useState(false),[notice,setNotice]=useState('');
  const router=useRouter();
  useEffect(()=>{setSelected('');},[room?.round]);
  // Team rooms: the teacher screen ends the question once every connected student answered; the server re-checks.
  const activeStudents=useMemo(()=>room?players.filter(member=>room.playerKeys.includes(member.key)&&!member.forfeited&&member.eligibleFrom<=room.round&&Date.now()-member.lastSeen<=30000):[],[room,players]);
  const allAnswered=teacher&&room?.status==='question'&&activeStudents.length>0&&activeStudents.every(member=>member.answeredRound===room.round);
  useEffect(()=>{if(allAnswered)void action('tick').catch(()=>{});},[allAnswered,room?.round,action]);
  useEffect(()=>{let cancelled=false;if(room?.code&&teacher)void QRCode.toDataURL(`${window.location.origin}/student/playground/room/${room.code}`,{width:180,margin:2}).then(value=>{if(!cancelled)setQr(value);});return()=>{cancelled=true;};},[room?.code,teacher]);
  const choices=useMemo(()=>question?shuffled(question.choices,`${viewer?.key}:${question.round}`):[],[question,viewer?.key]);
  async function invoke(name:string,data:object={}) {try{await action(name,data);return true;}catch{return false;}}
  async function answer(choiceId:string){if(!room||selected)return;setSelected(choiceId);if(!await invoke('answer',{round:room.round,choiceId}))setSelected('');}
  if(!room)return <section className="play-room"><Link href={teacher?'/teacher/playground':'/student/playground'}>← 말놀이터</Link><h1>친구들을 만나러 가요</h1>{error?<><p role="alert" className="play-room-error">{error}</p><button className="button" onClick={refresh}>다시 연결</button></>:<p role="status">방을 준비하고 있어요…</p>}</section>;
  const roster=teacher&&players.length?players:room.players,remaining=room.status==='countdown'?Math.max(0,Math.ceil((room.statusEndsAt-now)/1000)):Math.max(0,Math.ceil((room.roundEndsAt-now)/1000));
  const answered=!!player&&(player.answeredRound===room.round||!!selected),isQuestion=room.status==='question',isReveal=room.status==='reveal',finished=room.status==='finished',ownResult=question?.results?.find(result=>result.key===viewer?.key);
  const ranked=[...room.players].sort((a,b)=>Number(a.forfeited)-Number(b.forfeited)||b.score-a.score||a.key.localeCompare(b.key));
  const teamValues=[...room.teams].filter(team=>team.count).sort((a,b)=>b.score-a.score);
  const studentsAnswered=players.filter(member=>member.answeredRound===room.round).length;
  const me=room.players.find(member=>member.key===viewer?.key),myScore=me?.score??player?.score??0,myTeam=me&&room.mode==='team'?room.teams.find(team=>team.id===me.team):undefined;
  const standings=room.mode==='team'?[]:[...room.players].sort((a,b)=>Number(a.forfeited)-Number(b.forfeited)||b.score-a.score||a.key.localeCompare(b.key));
  const myRank=me&&!me.forfeited?standings.findIndex(member=>member.score===me.score)+1:0;
  return <section className={`play-room ${teacher?'play-room-projector':''}`}>
    <header className="play-room-heading"><div><Link href={teacher?'/teacher/playground':'/student/playground'}>← 말놀이터</Link><h1>{roomModeLabels[room.mode]}</h1></div><span className={`play-room-connection ${connected?'':'is-offline'}`}>{connected?<Wifi size={17}/>:<WifiOff size={17}/>}<span>{connected?'연결됨':'다시 연결 중'}</span></span></header>
    {error&&<div className="play-room-error" role="alert"><p>{error}</p><button onClick={refresh}><RefreshCw size={16}/>다시 연결</button></div>}
    {notice&&<p role="status" className="play-room-notice">{notice}</p>}
    {room.status==='lobby'&&<>
      <div className="play-room-welcome"><div><p>우리 반 친구만 들어올 수 있어요</p><strong className="play-room-code" aria-label={`방 코드 ${room.code.split('').join(' ')}`}>{room.code}</strong><p><Users size={18}/>{room.playerKeys.length}명 모였어요 · {room.roundsTotal}문제 · 문제당 {room.questionMs/1000}초</p></div>{teacher&&qr&&<img src={qr} width={180} height={180} alt="학생용 방 입장 QR 코드"/>}</div>
      <div className="play-room-roster">{roster.map(member=><article key={member.key}><CharacterAvatar character={member.character} imageSrc={member.imageSrc} outfit={member.outfit} spaceOutfit={member.spaceOutfit}/><strong>{member.name}</strong><span>{member.key===room.hostKey?'방장':room.mode==='team'&&!teacher?'함께 기다려요':now-member.lastSeen>30000?'연결을 기다려요':'준비됐어요'}</span>{teacher&&<label>팀<select value={teams[member.key]??member.team} onChange={event=>setTeams(previous=>({...previous,[member.key]:Number(event.target.value)}))}>{roomTeamNames.slice(0,room.teamCount).map((name,index)=><option key={name} value={index}>{name} 팀</option>)}</select></label>}</article>)}</div>
      {!teacher&&viewer?.canHost&&<SocialPanel enabled/>}
      {!room.playerKeys.length&&<p className="play-room-empty">친구들이 모이면 시작할 수 있어요. 코드를 알려 주세요.</p>}
      {viewer?.canHost?<div className="play-room-host-actions"><button className="button" disabled={busy||room.playerKeys.length<2} onClick={()=>void invoke('start',teacher&&Object.keys(teams).length?{teams}:{})}><Play size={18}/>다 같이 시작</button>{teacher&&<p>팀을 직접 고르지 않으면 최근 4주 점수를 기준으로 골고루 나눠요.</p>}</div>:<p role="status" className="play-room-notice">방장이 시작할 때까지 잠깐 기다려요.</p>}
    </>}
    {room.status==='countdown'&&<div className="play-room-countdown" role="status"><p>준비됐나요?</p><strong>{remaining||'시작!'}</strong><span>답은 한 번만 고를 수 있어요</span></div>}
    {room.status==='paused'&&<div className="play-room-empty" role="status"><Pause size={42}/><h2>잠깐 쉬어 가요</h2><p>선생님이 다시 시작하면 이어서 풀어요.</p></div>}
    {(isQuestion||isReveal)&&<>
      <div className="play-room-progress"><strong>{room.round+1} / {room.roundsTotal} 문제</strong><span><Clock3 size={19}/>{isReveal?'정답 공개':`${remaining}초`}</span>{teacher&&<span>{studentsAnswered} / {room.playerKeys.length}명 답했어요</span>}{!teacher&&me&&<span className="play-room-my-score" aria-live="polite"><Trophy size={18}/>내 점수 <b>{myScore.toLocaleString('ko-KR')}점</b>{myRank>0&&room.mode!=='team'&&<small>{myRank}등</small>}{myTeam&&<small style={{color:myTeam.color}}>{myTeam.name} 팀</small>}</span>}</div>
      <div className="play-room-time-track" aria-hidden="true"><i style={{width:`${isReveal?0:Math.max(0,Math.min(100,(room.roundEndsAt-now)/room.questionMs*100))}%`}}/></div>
      {!question||question.round!==room.round?<p role="status">문제를 펼치고 있어요…</p>:<>
        <h2 className="play-room-question">{question.prompt}</h2>
        <div className="play-room-choices">{choices.map((choice,index)=><button key={choice.id} type="button" className={`${selected===choice.id?'is-selected ':''}${isReveal&&choice.id===question.correctChoiceId?'is-correct':''}${isReveal&&selected===choice.id&&choice.id!==question.correctChoiceId?'is-wrong':''}`} disabled={teacher||busy||answered||!isQuestion||remaining===0||!connected||!!player&&(player.forfeited||player.eligibleFrom>room.round)} onClick={()=>void answer(choice.id)}><span className="play-room-choice-symbol" aria-hidden="true">{['□','△','○','◇'][index]}</span><span>{choice.label}</span>{isReveal&&choice.id===question.correctChoiceId&&<strong>정답</strong>}{isReveal&&selected===choice.id&&choice.id!==question.correctChoiceId&&<strong>내 답</strong>}{teacher&&isReveal&&<small>{question.distribution?.[choice.id]||0}명 선택</small>}</button>)}</div>
        {isQuestion&&!teacher&&<p role="status" className="play-room-answer-state">{player&&player.eligibleFrom>room.round?'다음 문제부터 함께해요.':answered?'답을 골랐어요. 친구들을 기다려요.':remaining?'생각한 답을 하나 골라요.':'답안이 도착하기를 기다려요.'}</p>}
        {isReveal&&<div className="play-room-reveal" role="status"><h3>{question.skipped?'이번 문제는 쉬어 갔어요':teacher?'함께 알아봐요':ownResult?.correct?'맞혔어요!':answered?'아쉬워요, 정답을 확인해요':'시간 안에 답하지 못했어요'}</h3><p>{question.reveal}</p>{!teacher&&ownResult&&!question.skipped&&<strong className={ownResult.correct?'is-gain':''}>{ownResult.correct?`+${ownResult.points}점 · `:''}지금까지 {myScore.toLocaleString('ko-KR')}점</strong>}{question.results&&room.mode==='speed'&&<p>{question.results.filter(result=>result.correct).sort((a,b)=>a.rank-b.rank).map(result=>`${result.rank}등 ${room.players.find(member=>member.key===result.key)?.name||'친구'}`).join(' · ')||'다음 문제에서 다시 도전해요.'}</p>}</div>}
      </>}
      {!teacher&&standings.length>1&&<ol className="play-room-standings" aria-label="지금 점수">{standings.map((member,index)=><li key={member.key} className={member.key===viewer?.key?'is-me':''}><b>{member.forfeited?'기권':`${standings.findIndex(other=>other.score===member.score)+1}등`}</b><span>{member.name}{member.key===viewer?.key?' (나)':''}</span><strong>{member.score.toLocaleString('ko-KR')}점</strong>{index===0&&!member.forfeited&&member.score>0&&<Trophy size={15} aria-hidden="true"/>}</li>)}</ol>}
    </>}
    {finished&&<div className="play-room-results"><Trophy size={42}/><h2>함께해서 즐거웠어요!</h2><p>{room.completion==='cancelled'?'일찍 마친 판은 순위와 자동 보말에 반영하지 않아요.':room.completion==='forfeit'?'친구가 나가서 대결을 마쳤어요. 참여 보말은 끝까지 푼 판에 받아요.':room.settled?'이번 놀이 기록을 저장했어요.':'놀이 기록을 저장하고 있어요…'}</p>{room.mode==='team'&&!teacher&&me&&<p className="play-room-my-final">내 점수 <b>{myScore.toLocaleString('ko-KR')}점</b>{myTeam&&<> · <span style={{color:myTeam.color}}>{myTeam.name} 팀</span> {teamValues.findIndex(team=>team.id===myTeam.id)+1}등</>}</p>}{room.mode!=='team'&&<ol>{ranked.map((member,index)=>{const position=ranked.findIndex(other=>other.score===member.score&&!other.forfeited)+1;return <li key={member.key} className={index<3&&!member.forfeited?'is-podium':''}><b>{member.forfeited?'기권':`${position}등`}</b><CharacterAvatar character={member.character} imageSrc={member.imageSrc} outfit={member.outfit} spaceOutfit={member.spaceOutfit}/><strong>{member.name}</strong><span>{member.score}점{member.forfeited?' · 중간에 나옴':''}</span></li>;})}</ol>}{teacher&&<div className="play-room-reward"><label>참여 보말<input type="number" min={0} max={1000} value={reward} disabled={busy||rewarded} onChange={event=>setReward(Number(event.target.value))}/></label><button className="button" disabled={busy||rewarded} onClick={async()=>{if(await invoke('reward',{amount:reward})){setRewarded(true);setNotice('참여한 학생에게 보말을 지급했어요.');}}}>{rewarded?'지급 완료':'참여 학생에게 한 번 지급'}</button><small>보말 연결 설정을 켠 경우에 지급할 수 있어요.</small></div>}<Link className="button" href={teacher?'/teacher/playground':'/student/playground'}>말놀이터로 돌아가기</Link></div>}
    {room.status==='closed'&&<div className="play-room-empty"><h2>방이 닫혔어요</h2><Link href={teacher?'/teacher/playground':'/student/playground'}>말놀이터에서 다시 만나요</Link></div>}
    {room.mode==='team'&&teamValues.length>0&&<div className="play-room-teams" aria-label="팀 평균 점수">{teamValues.map(team=><div key={team.id}><strong style={{color:team.color}}>{team.name} 팀</strong><div><i style={{background:team.color,width:`${Math.max(2,team.score/Math.max(1,...teamValues.map(value=>value.score))*100)}%`}}/></div><b>{team.score.toLocaleString('ko-KR',{maximumFractionDigits:1})}점</b><small>{team.count}명 평균</small></div>)}</div>}
    {teacher&&!['lobby','finished','closed'].includes(room.status)&&<div className="play-room-controls"><button className="button" disabled={busy} onClick={()=>void invoke('pause')}>{room.status==='paused'?<Play size={18}/>:<Pause size={18}/>} {room.status==='paused'?'다시 시작':'잠깐 멈춤'}</button><button className="button" disabled={busy||!['question','reveal'].includes(room.status)} onClick={()=>void invoke('next')}>{room.status==='question'?'이 문제 건너뛰기':'다음으로'}</button></div>}
    {!finished&&room.status!=='closed'&&<footer className="play-room-footer">{viewer?.canHost?<button className="button" disabled={busy} onClick={()=>{if(endArmed)void invoke('end');else setEndArmed(true);}}><Flag size={16}/>{endArmed?'지금 놀이 마치기':'놀이 종료'}</button>:<button className="button" disabled={busy} onClick={async()=>{if(await invoke('leave'))router.push('/student/playground');}}>방 나가기</button>}{endArmed&&<button onClick={()=>setEndArmed(false)}>계속 놀기</button>}</footer>}
  </section>;
}
