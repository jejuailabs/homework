'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {collection, doc, onSnapshot, type Unsubscribe} from 'firebase/firestore';
import {auth} from '@/lib/firebase-client';
import {canvasFirestore} from '@/lib/firebase-canvas';
import {roomDue} from './room-machine';
import type {PlayRoom, PublicRoomRound, RoomBootstrap, RoomPlayer, RoomState} from './room-types';

export async function roomRequest<T>(path: string, data?: object, signal?: AbortSignal): Promise<T> {
  const response=await fetch(`/api/playground/${path}`,{method:data?'POST':'GET',cache:'no-store',signal,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const value=await response.json().catch(()=>({}));if(!response.ok)throw new Error(value.error||'연결을 확인하고 다시 시도해 주세요.');return value;
}
const pollDelay=(room: PlayRoom|null)=>!room?2500:room.status==='question'||room.status==='countdown'?1000:room.status==='reveal'?1500:2500;
/**
 * Realtime listeners are the cheap path. When they are refused (rules not deployed, expired grant) or drop,
 * the screen switches to polling the server, which also advances rooms whose timer has run out.
 */
export function usePlayRoom(codeOrId: string, teacher = false) {
  const [room,setRoom]=useState<PlayRoom|null>(null),[question,setQuestion]=useState<PublicRoomRound|null>(null),[player,setPlayer]=useState<RoomPlayer|null>(null),[players,setPlayers]=useState<RoomPlayer[]>([]),[viewer,setViewer]=useState<RoomBootstrap['viewer']|null>(null);
  const [error,setError]=useState(''),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now()),[revision,setRevision]=useState(0);
  const roomId=useRef(''),current=useRef<PlayRoom|null>(null),offset=useRef(0),inflight=useRef(false),polling=useRef(false),applyRef=useRef<(data: Partial<RoomBootstrap>)=>void>(()=>{});
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{
    let disposed=false,roundOff:Unsubscribe|undefined,parentOff:Unsubscribe|undefined,playerOff:Unsubscribe|undefined,watching=-2,refreshing=false,needsReconnect=false,pollTimer:ReturnType<typeof setTimeout>|undefined,pollFailures=0,known='';
    const abort=new AbortController();roomId.current='';current.current=null;polling.current=false;setRoom(null);setQuestion(null);setPlayer(null);setPlayers([]);setViewer(null);setConnected(false);setError('');
    const stop=()=>{roundOff?.();parentOff?.();playerOff?.();roundOff=parentOff=playerOff=undefined;};
    // A late response must never roll the screen back to an older phase.
    const applyRoom=(value: PlayRoom)=>{if(current.current&&current.current.id===value.id&&value.updatedAt<current.current.updatedAt)return false;current.current=value;setRoom(value);return true;};
    applyRef.current=data=>{if(data.room&&applyRoom(data.room)){if(data.question!==undefined){setQuestion(data.question);known=data.question?`${data.room.status}:${data.room.round}`:'';}if(data.players)setPlayers(data.players);}};
    const failed=(cause:unknown)=>{if(!disposed){needsReconnect=true;setConnected(false);setError((cause as Error).message||'연결이 끊겼어요. 다시 연결해 주세요.');}};
    async function poll(){
      pollTimer=undefined;if(disposed)return;
      if(!document.hidden&&roomId.current){
        try{
          const before=Date.now(),data=await roomRequest<RoomState>(`rooms/${roomId.current}/state?known=${encodeURIComponent(known)}`,undefined,abort.signal),after=Date.now();
          if(disposed)return;offset.current=data.serverTime-(before+after)/2;
          if(applyRoom(data.room)){if(data.question!==undefined){setQuestion(data.question);known=data.question?data.key:'';}if(data.players)setPlayers(data.players);}
          pollFailures=0;setConnected(true);setError('');
        }catch(cause){if(disposed||abort.signal.aborted)return;if(++pollFailures>=3){setConnected(false);setError((cause as Error).message);}}
      }
      const value=current.current;
      if(value&&(value.status==='closed'||value.status==='finished'&&value.settled))return;
      pollTimer=setTimeout(()=>void poll(),pollDelay(value));
    }
    const startPolling=()=>{if(disposed||polling.current)return;polling.current=true;stop();setConnected(true);void poll();};
    async function connect(){
      if(refreshing||disposed)return;refreshing=true;
      try{
        const joined=teacher?{roomId:codeOrId}:await roomRequest<{roomId:string}>('rooms/join',{code:codeOrId},abort.signal);
        const before=Date.now(),data=await roomRequest<RoomBootstrap>(`rooms/${joined.roomId}`,undefined,abort.signal),after=Date.now();
        await auth.authStateReady();if(disposed)return;
        if(auth.currentUser?.uid!==data.viewer.uid)throw new Error('학생 코드나 선생님 계정으로 다시 로그인해 주세요.');
        stop();watching=-2;needsReconnect=false;roomId.current=joined.roomId;offset.current=data.serverTime-(before+after)/2;
        current.current=data.room;setRoom(data.room);setQuestion(data.question);known=data.question?`${data.room.status}:${data.room.round}`:'';setPlayer(data.player);if(data.players)setPlayers(data.players);setViewer(data.viewer);setConnected(true);setError('');
        if(polling.current){if(!pollTimer)void poll();return;}
        parentOff=onSnapshot(doc(canvasFirestore,'playRooms',joined.roomId),snapshot=>{
          if(disposed)return;if(!snapshot.exists()){failed(new Error('이 방은 종료되었어요.'));return;}
          const value=snapshot.data() as PlayRoom;current.current=value;setRoom(value);
          if(watching!==value.round){watching=value.round;roundOff?.();setQuestion(null);if(value.round>=0)roundOff=onSnapshot(doc(canvasFirestore,'playRooms',joined.roomId,'rounds',String(value.round)),roundSnapshot=>{if(!disposed)setQuestion(roundSnapshot.exists()?roundSnapshot.data() as PublicRoomRound:null);},startPolling);}
        },startPolling);
        if(data.viewer.teacher)playerOff=onSnapshot(collection(canvasFirestore,'playRooms',joined.roomId,'players'),snapshot=>{if(!disposed)setPlayers(snapshot.docs.map(row=>row.data() as RoomPlayer));},startPolling);
        else playerOff=onSnapshot(doc(canvasFirestore,'playRooms',joined.roomId,'players',data.viewer.key),snapshot=>{if(!disposed&&snapshot.exists())setPlayer(snapshot.data() as RoomPlayer);},startPolling);
      }catch(cause){if(!disposed&&!abort.signal.aborted)failed(cause);}finally{refreshing=false;}
    }
    void connect();
    const heartbeat=setInterval(()=>{if(!disposed&&!document.hidden){if(needsReconnect||!roomId.current){void connect();return;}void roomRequest<{serverTime:number;player:RoomPlayer|null}>(`rooms/${roomId.current}/heartbeat`,{},abort.signal).then(data=>{if(!disposed&&!needsReconnect){if(!polling.current)offset.current=data.serverTime-Date.now();if(data.player)setPlayer(data.player);setConnected(true);}}).catch(failed);}},10000);
    const visibility=()=>{if(document.hidden)return;if(polling.current&&roomId.current){if(pollTimer)clearTimeout(pollTimer);void poll();}else void connect();};
    window.addEventListener('online',visibility);document.addEventListener('visibilitychange',visibility);
    return()=>{disposed=true;abort.abort();stop();if(pollTimer)clearTimeout(pollTimer);clearInterval(heartbeat);window.removeEventListener('online',visibility);document.removeEventListener('visibilitychange',visibility);};
  },[codeOrId,teacher,revision]);
  // Listener mode only: polling requests already let the server apply due transitions.
  useEffect(()=>{let lastTick=0;const timer=setInterval(()=>{
    const at=Date.now()+offset.current;setNow(at);const value=current.current;
    if(!value||polling.current||document.hidden||inflight.current||!roomId.current||value.mode==='team'&&!teacher||!roomDue(value,at-200)||Date.now()-lastTick<1500)return;
    lastTick=Date.now();inflight.current=true;void roomRequest<RoomBootstrap>(`rooms/${roomId.current}/tick`,{}).then(data=>applyRef.current(data)).catch(cause=>setError((cause as Error).message)).finally(()=>{inflight.current=false;});
  },250);return()=>clearInterval(timer);},[teacher]);
  const action=useCallback(async(name:string,data:object={})=>{
    if(!roomId.current)return;setBusy(true);setError('');
    try{
      const result=await roomRequest<Partial<RoomBootstrap>>(`rooms/${roomId.current}/${name}`,{...(['start','next','pause','end'].includes(name)&&current.current?{status:current.current.status,round:current.current.round}:{}),...data});
      if(name==='answer'){const round=(data as {round?:number}).round;setPlayer(previous=>previous&&typeof round==='number'?{...previous,answeredRound:round,answered:previous.answered+1}:previous);}
      else applyRef.current(result);
      return result;
    }catch(cause){setError((cause as Error).message);throw cause;}finally{setBusy(false);}
  },[]);
  return {room,question,player,players,viewer,error,connected,busy,now,action,refresh};
}
