'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {collection, doc, onSnapshot, type Unsubscribe} from 'firebase/firestore';
import {auth} from '@/lib/firebase-client';
import {canvasFirestore} from '@/lib/firebase-canvas';
import type {PlayRoom, PublicRoomRound, RoomBootstrap, RoomPlayer} from './room-types';

export async function roomRequest<T>(path: string, data?: object, signal?: AbortSignal): Promise<T> {
  const response=await fetch(`/api/playground/${path}`,{method:data?'POST':'GET',cache:'no-store',signal,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'연결을 확인하고 다시 시도해 주세요.');return value;
}
export function usePlayRoom(codeOrId: string, teacher = false) {
  const [room,setRoom]=useState<PlayRoom|null>(null),[question,setQuestion]=useState<PublicRoomRound|null>(null),[player,setPlayer]=useState<RoomPlayer|null>(null),[players,setPlayers]=useState<RoomPlayer[]>([]),[viewer,setViewer]=useState<RoomBootstrap['viewer']|null>(null);
  const [error,setError]=useState(''),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now()),[revision,setRevision]=useState(0);
  const roomId=useRef(''),current=useRef<PlayRoom|null>(null),offset=useRef(0),inflight=useRef(false);
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{
    let disposed=false,roundOff:Unsubscribe|undefined,parentOff:Unsubscribe|undefined,playerOff:Unsubscribe|undefined,watching=-2,refreshing=false,needsReconnect=false;
    const abort=new AbortController();roomId.current='';current.current=null;setRoom(null);setQuestion(null);setPlayer(null);setPlayers([]);setViewer(null);setConnected(false);setError('');
    const stop=()=>{roundOff?.();parentOff?.();playerOff?.();};
    const failed=(cause:unknown)=>{if(!disposed){needsReconnect=true;setConnected(false);setError((cause as Error).message||'연결이 끊겼어요. 다시 연결해 주세요.');}};
    async function connect(){
      if(refreshing||disposed)return;refreshing=true;
      try{
        const joined=teacher?{roomId:codeOrId}:await roomRequest<{roomId:string}>('rooms/join',{code:codeOrId},abort.signal);
        const before=Date.now(),data=await roomRequest<RoomBootstrap>(`rooms/${joined.roomId}`,undefined,abort.signal),after=Date.now();
        await auth.authStateReady();if(disposed)return;
        if(auth.currentUser?.uid!==data.viewer.uid)throw new Error('학생 코드나 선생님 계정으로 다시 로그인해 주세요.');
        stop();watching=-2;needsReconnect=false;roomId.current=joined.roomId;offset.current=data.serverTime-(before+after)/2;setRoom(data.room);current.current=data.room;setQuestion(data.question);setPlayer(data.player);setViewer(data.viewer);setConnected(true);setError('');
        parentOff=onSnapshot(doc(canvasFirestore,'playRooms',joined.roomId),snapshot=>{
          if(disposed)return;if(!snapshot.exists()){failed(new Error('이 방은 종료되었어요.'));return;}
          const value=snapshot.data() as PlayRoom;setRoom(value);current.current=value;
          if(watching!==value.round){watching=value.round;roundOff?.();setQuestion(null);if(value.round>=0)roundOff=onSnapshot(doc(canvasFirestore,'playRooms',joined.roomId,'rounds',String(value.round)),roundSnapshot=>{if(!disposed)setQuestion(roundSnapshot.exists()?roundSnapshot.data() as PublicRoomRound:null);},failed);}
        },failed);
        if(data.viewer.teacher)playerOff=onSnapshot(collection(canvasFirestore,'playRooms',joined.roomId,'players'),snapshot=>{if(!disposed)setPlayers(snapshot.docs.map(row=>row.data() as RoomPlayer));},failed);
        else playerOff=onSnapshot(doc(canvasFirestore,'playRooms',joined.roomId,'players',data.viewer.key),snapshot=>{if(!disposed&&snapshot.exists())setPlayer(snapshot.data() as RoomPlayer);},failed);
      }catch(cause){if(!disposed&&!abort.signal.aborted)failed(cause);}finally{refreshing=false;}
    }
    void connect();
    const heartbeat=setInterval(()=>{if(!disposed&&!document.hidden&&roomId.current){if(needsReconnect){void connect();return;}void roomRequest<{serverTime:number}>(`rooms/${roomId.current}/heartbeat`,{},abort.signal).then(data=>{if(!disposed&&!needsReconnect){offset.current=data.serverTime-Date.now();setConnected(true);}}).catch(failed);}},10000);
    const visibility=()=>{if(!document.hidden)void connect();};window.addEventListener('online',visibility);document.addEventListener('visibilitychange',visibility);
    return()=>{disposed=true;abort.abort();stop();clearInterval(heartbeat);window.removeEventListener('online',visibility);document.removeEventListener('visibilitychange',visibility);};
  },[codeOrId,teacher,revision]);
  useEffect(()=>{let lastTick=0;const timer=setInterval(()=>{
    const at=Date.now()+offset.current;setNow(at);const value=current.current;
    if(!value||document.hidden||inflight.current||!roomId.current||value.mode==='team'&&!teacher||!['lobby','countdown','question','reveal'].includes(value.status)||value.mode==='team'&&value.status==='reveal'||at<=value.statusEndsAt+200||Date.now()-lastTick<1500)return;
    lastTick=Date.now();inflight.current=true;void roomRequest(`rooms/${roomId.current}/tick`,{}).catch(cause=>setError((cause as Error).message)).finally(()=>{inflight.current=false;});
  },250);return()=>clearInterval(timer);},[teacher]);
  const action=useCallback(async(name:string,data:object={})=>{if(!roomId.current)return;setBusy(true);setError('');try{const result=await roomRequest(`rooms/${roomId.current}/${name}`,{...(['start','next','pause','end'].includes(name)&&current.current?{status:current.current.status,round:current.current.round}:{}),...data});if(name==='answer'&&current.current?.mode!=='team')void roomRequest(`rooms/${roomId.current}/tick`,{}).catch(()=>{});return result;}catch(cause){setError((cause as Error).message);throw cause;}finally{setBusy(false);}},[]);
  return {room,question,player,players,viewer,error,connected,busy,now,action,refresh};
}
