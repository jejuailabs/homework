'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {collection,doc,onSnapshot,type Unsubscribe} from 'firebase/firestore';
import * as Y from 'yjs';
import {auth} from '@/lib/firebase-client';
import {canvasFirestore} from '@/lib/firebase-canvas';
import {CanvasModel,decodeCanvasUpdate,encodeCanvasUpdate} from '@/lib/canvas-document';
import type {CanvasViewer,SharedCanvasInfo} from '@/lib/canvas-types';
import type {CanvasPeer} from './canvas-editor';

export class CanvasRequestError extends Error {constructor(message:string,readonly code:string,readonly status:number){super(message);}}
export async function canvasRequest(path:string,data?:unknown,method=data?'POST':'GET'){
  const response=await fetch(path,{method,cache:'no-store',headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const value=await response.json();if(!response.ok)throw new CanvasRequestError(value.error||'연결을 확인해 주세요.',value.code||'CANVAS_FAILED',response.status);return value;
}
export function useSharedCanvas(canvasId:string){
  const [model,setModel]=useState<CanvasModel|null>(null),[info,setInfo]=useState<SharedCanvasInfo|null>(null),[viewer,setViewer]=useState<CanvasViewer|null>(null),[assets,setAssets]=useState<Record<string,string>>({}),[peers,setPeers]=useState<CanvasPeer[]>([]),[connected,setConnected]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[authorized,setAuthorized]=useState(false);
  const live=useRef<{flush:()=>Promise<void>;reload:()=>void}|null>(null),cursor=useRef<{x:number;y:number;selected?:string}|null>(null);
  const presence=useCallback((x:number,y:number,selected?:string)=>{cursor.current={x,y,selected};},[]);
  useEffect(()=>{
    if(!canvasId)return;let disposed=false,joining=false,serial=0,ready=false,stopped=false,lastPresence=0,lastCursor='',lastAssets=0,nextRetry=0;
    let currentModel:CanvasModel|null=null,currentInfo:SharedCanvasInfo|null=null,currentViewer:CanvasViewer|null=null,channelOff:Unsubscribe|undefined,parentOff:Unsubscribe|undefined,presenceOff:Unsubscribe|undefined;
    let pending:Uint8Array[]=[],actions=new Set<string>(),flight:Promise<void>|null=null,presenceFlight=false,retryDelay=1000,persistTimer:ReturnType<typeof setTimeout>|undefined;
    let batch:{id:string;update:Uint8Array;actions:string[];generation:number}|null=null,storageKey='',savedRead=false;
    let modelObserverOff:(()=>void)|undefined;
    const api=(suffix='',data?:unknown,method?:string)=>canvasRequest(`/api/canvases/${canvasId}${suffix}`,data,method);
    function safeSet(callback:()=>void){if(!disposed)callback();}
    function persist(){if(!currentModel||!currentInfo||!storageKey)return;try{localStorage.setItem(storageKey,JSON.stringify({generation:currentInfo.generation,state:currentModel.serialize(),pending:pending.length>0||!!batch}));}catch{safeSet(()=>setNotice('기기의 임시 저장 공간이 부족해요. 연결 상태를 확인하고 편집 원본을 저장해 주세요.'));}}
    function changed(_update:Uint8Array,origin:unknown){if(origin==='remote'||origin==='initial')return;pending.push(_update);if(currentModel&&origin===currentModel.undo)actions.add('undo');if(!actions.size)actions.add('edit');clearTimeout(persistTimer);persistTimer=setTimeout(persist,200);safeSet(()=>setSaving(true));}
    function attachModel(next:CanvasModel){if(currentModel){modelObserverOff?.();currentModel.doc.off('update',changed);currentModel.destroy();}currentModel=next;next.doc.on('update',changed);
      const observe=(events:Y.YEvent<any>[],transaction:Y.Transaction)=>{if(transaction.origin==='remote'||transaction.origin==='initial')return;for(const event of events){if(event.path[1]==='text')actions.add('text');else if(event.path[1]==='points')actions.add('draw');else if(event instanceof Y.YMapEvent){for(const [key,change]of event.changes.keys){if(event.path.length===0){if(change.action==='delete')actions.add('delete');else{const object=next.objects.get(String(key));const type=object?.get('type');actions.add(type==='stroke'?'draw':type==='image'?'image':type==='text'?'text':'edit');}}else if(['x','y','w','h'].includes(key))actions.add('move');}}}};
      next.objects.observeDeep(observe);modelObserverOff=()=>next.objects.unobserveDeep(observe);safeSet(()=>setModel(next));
    }
    function failed(cause:unknown){if(disposed)return;const error=cause as CanvasRequestError;if(error.code==='CANVAS_RESTORED'){pending=[];batch=null;savedRead=true;persist();setNotice('선생님이 과거 버전으로 복원했어요. 복원된 화면으로 이동합니다.');void join();return;}
      if([401,403,404].includes(error.status)&&error.code!=='CANVAS_LOCKED'){stopped=true;ready=false;setAuthorized(false);channelOff?.();presenceOff?.();parentOff?.();setPeers([]);setConnected(false);setError(error.message);return;}
      if(error.code==='CANVAS_LOCKED'){if(currentInfo){currentInfo={...currentInfo,canEdit:false,status:'frozen'};setInfo(currentInfo);}setError(error.message);nextRetry=Date.now()+5000;return;}
      if(error.code==='permission-denied'){ready=false;channelOff?.();presenceOff?.();parentOff?.();setConnected(false);nextRetry=Date.now()+250;return;}
      if(error.code==='unavailable'){ready=false;channelOff?.();presenceOff?.();parentOff?.();}
      setConnected(false);setError(error.message||'연결이 끊겼어요. 이 기기의 변경을 보관하고 다시 연결합니다.');nextRetry=Date.now()+(error.status===429?5000:retryDelay);retryDelay=Math.min(15000,retryDelay*2);
    }
    async function send(){if(disposed||!ready||stopped||flight||!pending.length||!currentInfo?.canEdit||Date.now()<nextRetry||!navigator.onLine)return;
      batch={id:crypto.randomUUID(),update:Y.mergeUpdates(pending.splice(0)),actions:[...actions],generation:currentInfo.generation};actions.clear();const sent=batch;
      flight=(async()=>{try{const result=await api('/sync',{updateId:sent.id,data:encodeCanvasUpdate(sent.update),actions:sent.actions,generation:sent.generation});if(disposed)return;if(currentInfo?.generation===sent.generation){if(batch===sent)batch=null;setError('');setConnected(true);retryDelay=1000;nextRetry=0;if(result.epoch!==currentInfo.epoch)void join();}else if(batch===sent)batch=null;
        }catch(cause){if(batch===sent){if((cause as CanvasRequestError).code!=='CANVAS_RESTORED'){pending.unshift(sent.update);for(const action of sent.actions)actions.add(action);}batch=null;}failed(cause);}finally{flight=null;persist();safeSet(()=>setSaving(pending.length>0));}})();await flight;
    }
    async function flush(){for(let attempt=0;attempt<25&&(pending.length||flight);attempt++){if(stopped||!navigator.onLine||!currentInfo?.canEdit)throw Error('아직 전송하지 못한 변경이 있어요. 연결·잠금 상태를 확인해 주세요.');if(flight)await flight;else await send();if(pending.length)await new Promise(resolve=>setTimeout(resolve,200));}if(pending.length||flight)throw Error('변경 내용을 전송 중이에요. 잠시 뒤 다시 시도해 주세요.');}
    async function sendPresence(force=false){if(!currentInfo||!currentViewer||disposed||stopped||presenceFlight||!navigator.onLine||document.hidden)return;const value=JSON.stringify(cursor.current);if(!force&&Date.now()-lastPresence<15000&&value===lastCursor)return;if(!force&&Date.now()-lastPresence<1000)return;presenceFlight=true;try{await api('/presence',{cursor:cursor.current});lastPresence=Date.now();lastCursor=value;if(ready)safeSet(()=>{setConnected(true);setError('');});}catch(cause){failed(cause);}finally{presenceFlight=false;}}
    async function refreshAssets(){try{const result=await api('/assets');if(!disposed){setAssets(result.assets);lastAssets=Date.now();}}catch(cause){failed(cause);}}
    async function join(){if(disposed||joining||stopped)return;joining=true;ready=false;const ownSerial=++serial;safeSet(()=>setConnected(false));try{
      const data=await api();if(disposed||ownSerial!==serial)return;await auth.authStateReady();if(auth.currentUser?.uid!==data.viewer.uid)throw new CanvasRequestError('학생 코드 또는 Google 계정으로 다시 입장해 주세요.','CANVAS_SIGNIN_NEEDED',401);
      const nextInfo=data.canvas as SharedCanvasInfo,newGeneration=!!currentInfo&&nextInfo.generation!==currentInfo.generation;
      if(newGeneration){persist();pending=[];batch=null;actions.clear();savedRead=true;safeSet(()=>setNotice('선생님이 이전 버전으로 복원했어요. 복원 뒤의 새 화면에서 이어서 작업해 주세요.'));}
      currentViewer=data.viewer;storageKey=`homework:shared-canvas:v1:${currentViewer!.uid}:${canvasId}`;
      if(!currentModel||newGeneration)attachModel(new CanvasModel(decodeCanvasUpdate(data.state)));else currentModel.applyRemote(decodeCanvasUpdate(data.state));currentInfo=nextInfo;safeSet(()=>{setInfo(nextInfo);setViewer(data.viewer);setAssets(data.assets);});lastAssets=Date.now();
      channelOff?.();presenceOff?.();parentOff?.();
      let initial=true;channelOff=onSnapshot(collection(canvasFirestore,'classCanvases',canvasId,'canvasRevisions',nextInfo.epoch,'canvasChannels'),snapshot=>{if(disposed||ownSerial!==serial||!currentModel)return;try{for(const change of snapshot.docChanges())if(change.type!=='removed')currentModel.applyRemote(decodeCanvasUpdate(change.doc.data().data));
        if(initial){initial=false;if(!savedRead){savedRead=true;try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.pending&&saved.generation===currentInfo?.generation){const update=decodeCanvasUpdate(saved.state),difference=Y.diffUpdate(update,Y.encodeStateVector(currentModel.doc));currentModel.applyRemote(update);if(difference.length>2){pending.push(difference);actions.add('edit');}}}catch{safeSet(()=>setNotice('기기에 보관한 임시본을 읽지 못했어요. 서버에 저장된 화면을 열었습니다.'));}}ready=true;safeSet(()=>{setConnected(true);setAuthorized(true);setError('');setSaving(pending.length>0);});void sendPresence(true);void send();persist();}
      }catch(cause){failed(cause);}},cause=>{if(!disposed&&ownSerial===serial){ready=false;failed(cause);}});
      presenceOff=onSnapshot(collection(canvasFirestore,'classCanvases',canvasId,'canvasPresence'),snapshot=>{if(disposed||ownSerial!==serial)return;setPeers(snapshot.docs.filter(doc=>doc.id!==currentViewer?.key&&Date.now()-Date.parse(doc.data().lastSeen)<45000).map(doc=>({id:doc.id,...doc.data()} as CanvasPeer)));},cause=>{if(!disposed&&ownSerial===serial)failed(cause);});
      parentOff=onSnapshot(doc(canvasFirestore,'classCanvases',canvasId),snapshot=>{if(disposed||ownSerial!==serial||!snapshot.exists())return;const value=snapshot.data();if(value.epoch!==currentInfo?.epoch||value.generation!==currentInfo?.generation){void join();return;}const next={...currentInfo!,status:value.status,canEdit:value.status!=='archived'&&(currentViewer?.role!=='student'||value.status==='open'),assetCount:value.assetCount||0};const assetsChanged=next.assetCount!==currentInfo?.assetCount||value.assetRevision!==lastAssetRevision;lastAssetRevision=value.assetRevision;currentInfo=next;setInfo(next);if(assetsChanged)void refreshAssets();if(next.canEdit)void send();},cause=>{if(!disposed&&ownSerial===serial)failed(cause);});
    }catch(cause){failed(cause);}finally{joining=false;}}
    let lastAssetRevision:unknown;
    const timer=setInterval(()=>{if(disposed||stopped)return;if(ready){void send();void sendPresence();if(!document.hidden&&Date.now()-lastAssets>12*60_000)void refreshAssets();}else if(Date.now()>=nextRetry&&navigator.onLine&&!document.hidden&&!joining)void join();},750);
    const checkpoint=setInterval(()=>{if(ready&&currentInfo?.canManage&&!document.hidden)void flush().then(()=>api('/checkpoint',{})).catch(cause=>failed(cause));},60000);
    const resume=()=>{nextRetry=0;stopped=false;void join();};const offline=()=>{safeSet(()=>{setConnected(false);setNotice('인터넷 연결이 끊겼어요. 이 기기에 변경 내용을 보관하고 있어요.');});persist();};
    const visibility=()=>{if(document.hidden)persist();else{void sendPresence(true);if(!ready)resume();}};
    const pagehide=()=>{persist();void fetch(`/api/canvases/${canvasId}/presence`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leave:true}),keepalive:true}).catch(()=>{});};
    window.addEventListener('online',resume);window.addEventListener('offline',offline);window.addEventListener('pagehide',pagehide);document.addEventListener('visibilitychange',visibility);live.current={flush,reload:resume};void join();
    return()=>{currentModel?.finishEditing();persist();disposed=true;serial++;clearInterval(timer);clearInterval(checkpoint);clearTimeout(persistTimer);channelOff?.();presenceOff?.();parentOff?.();modelObserverOff?.();if(currentModel){modelObserverOff?.();currentModel.doc.off('update',changed);currentModel.destroy();}live.current=null;window.removeEventListener('online',resume);window.removeEventListener('offline',offline);window.removeEventListener('pagehide',pagehide);document.removeEventListener('visibilitychange',visibility);void fetch(`/api/canvases/${canvasId}/presence`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leave:true}),keepalive:true}).catch(()=>{});};
  },[canvasId]);
  const reload=useCallback(()=>live.current?.reload(),[]),flush=useCallback(async()=>{await live.current?.flush();},[]);
  const image=useCallback(async(value:{src:string;width:number;height:number})=>{const result=await canvasRequest(`/api/canvases/${canvasId}/images`,value);setAssets(old=>({...old,[result.assetId]:result.url}));return result;},[canvasId]);
  return{model,info,viewer,assets,peers,connected,authorized,saving,error,notice,presence,reload,flush,image};
}
