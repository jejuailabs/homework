import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {Timestamp} from 'firebase-admin/firestore';
import {NextResponse} from 'next/server';
import * as Y from 'yjs';
import sharp from 'sharp';
import {bucket,db} from './admin';
import {assertOrigin,getContext,type Context} from './auth';
import {ApiError,canManageClass,id,text} from './policy';
import {decodeCanvasUpdate,encodeCanvasUpdate} from '../canvas-document';
import {CANVAS_WORLD_LIMIT} from '../canvas-camera';
import {assertNoOverlap,canvasMission,CanvasGroupError,validateCanvasGroups} from '../canvas-groups';
type Data=Record<string,any>;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const now=()=>new Date().toISOString();
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private,no-store'}});
const canvasRef=(canvasId:string)=>db().doc(`classCanvases/${id(canvasId)}`);
const revisionRef=(canvasId:string,epoch:string)=>canvasRef(canvasId).collection('canvasRevisions').doc(id(epoch));
const actorKey=(ctx:Context)=>hash(ctx.uid).slice(0,32);
function canRead(ctx:Context,value?:Data){return !!value&&(ctx.role!=='student'?value.ownerUid===ctx.uid:value.classId===ctx.classId&&value.status!=='archived'&&(!value.studentIds?.length||value.studentIds.includes(ctx.studentId)));}
// "Share results": pupils of the same activity may look at sibling group canvases, read-only, through a server snapshot.
function canViewResult(ctx:Context,value?:Data){return !!value&&ctx.role==='student'&&value.classId===ctx.classId&&value.status!=='archived'&&value.shareResults===true&&Array.isArray(value.activityStudentIds)&&value.activityStudentIds.includes(ctx.studentId);}
function groupError(error:unknown):never{if(error instanceof CanvasGroupError)throw new ApiError(error.status,error.message,'CANVAS_GROUP_INVALID');throw error;}
async function activeRoster(classId:string){const roster=await db().collection(`classes/${classId}/students`).get();return new Set(roster.docs.filter(doc=>!doc.data().disabled).map(doc=>doc.id));}
function access(ctx:Context,value?:Data,write=false):asserts value is Data{if(!canRead(ctx,value))throw new ApiError(404,'참여할 수 있는 함께캔버스를 찾을 수 없어요.','CANVAS_UNAVAILABLE');if(write&&(value!.status==='archived'||ctx.role==='student'&&value!.status!=='open'))throw new ApiError(403,'선생님이 캔버스를 잠갔어요.','CANVAS_LOCKED');}
async function load(ctx:Context,canvasId:string){const doc=await canvasRef(canvasId).get();access(ctx,doc.data());return doc;}
async function readBody(request:Request):Promise<Data>{const raw=await request.text();if(raw.length>950_000)throw new ApiError(413,'자료가 너무 커요. 나누어 올려 주세요.');let value;try{value=JSON.parse(raw);}catch{throw new ApiError(400,'입력 내용을 확인해 주세요.');}if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError(400,'입력 내용을 확인해 주세요.');return value;}
function publicCanvas(doc:FirebaseFirestore.DocumentSnapshot,ctx:Context,viewOnly=false){const value=doc.data()!;return{id:doc.id,title:value.title,classId:value.classId,status:value.status,epoch:value.epoch,generation:value.generation,assetCount:value.assetCount||0,createdAt:value.createdAt,updatedAt:value.updatedAt,canManage:ctx.role!=='student'&&value.ownerUid===ctx.uid,canEdit:!viewOnly&&value.status!=='archived'&&(ctx.role!=='student'||value.status==='open'),studentIds:ctx.role==='student'?undefined:value.studentIds||[],mission:value.mission||'',activityId:value.activityId||'',groupName:value.groupName||'',shareResults:value.shareResults===true,viewOnly};}
async function name(ctx:Context){if(ctx.role!=='student')return ctx.displayName||'선생님';const student=await db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`).get();return student.data()?.name||'우리 반 친구';}
async function grant(ctx:Context,canvasId:string){await canvasRef(canvasId).collection('readerGrants').doc(ctx.uid).set({role:ctx.role==='student'?'student':'teacher',classId:ctx.classId||'',studentId:ctx.studentId||'',authVersion:ctx.authVersion??-1,expiresAt:Timestamp.fromMillis(Date.now()+60_000)});}
async function assets(ctx:Context,canvasId:string){await load(ctx,canvasId);return signedAssets(canvasId);}
async function signedAssets(canvasId:string){const docs=await canvasRef(canvasId).collection('canvasAssets').where('status','==','ready').limit(100).get();return Object.fromEntries(await Promise.all(docs.docs.map(async doc=>{const[url]=await bucket().file(doc.data().path).getSignedUrl({action:'read',expires:Date.now()+15*60_000});return[doc.id,url];})));}
async function list(ctx:Context,request:Request){const classId=ctx.role==='student'?ctx.classId!:id(new URL(request.url).searchParams.get('classId'));if(ctx.role!=='student'){const cls=await db().doc(`classes/${classId}`).get();if(!cls.exists||!canManageClass(ctx.role,ctx.uid,cls.data()?.ownerUid))throw new ApiError(403,'우리 반 학급을 선택해 주세요.');}const docs=await db().collection('classCanvases').where('classId','==',classId).limit(100).get();return json({canvases:docs.docs.filter(doc=>canRead(ctx,doc.data())||canViewResult(ctx,doc.data())).map(doc=>publicCanvas(doc,ctx,!canRead(ctx,doc.data()))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.groupName.localeCompare(b.groupName,'ko',{numeric:true}))});}
async function create(ctx:Context,request:Request){if(ctx.role==='student')throw new ApiError(403,'선생님이 캔버스를 열 수 있어요.');const value=await readBody(request),classId=id(value.classId),cls=await db().doc(`classes/${classId}`).get();if(!cls.exists||!canManageClass(ctx.role,ctx.uid,cls.data()?.ownerUid))throw new ApiError(403,'우리 반 학급을 선택해 주세요.');
  let mission='';try{mission=canvasMission(value.mission);}catch(error){groupError(error);}
  if(value.groups!==undefined)return await createGroups(ctx,value,classId,mission);
  const studentIds=value.studentIds??[];if(!Array.isArray(studentIds)||studentIds.length>200||new Set(studentIds).size!==studentIds.length)throw new ApiError(400,'참여 학생을 다시 선택해 주세요.');const roster=await activeRoster(classId);for(const studentId of studentIds)if(!roster.has(studentId))throw new ApiError(400,'우리 반 학생을 선택해 주세요.');
  const ref=db().collection('classCanvases').doc(hash(`${ctx.uid}:${id(value.requestId)}`)),epoch=randomUUID(),stamp=now(),title=text(value.title,'캔버스 이름',120),doc=new Y.Doc(),state=encodeCanvasUpdate(Y.encodeStateAsUpdate(doc));doc.destroy();
  await db().runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists){if(old.data()?.ownerUid!==ctx.uid||old.data()?.classId!==classId||old.data()?.title!==title||JSON.stringify([...(old.data()?.studentIds||[])].sort())!==JSON.stringify([...studentIds].sort()))throw new ApiError(409,'새 요청으로 다시 만들어 주세요.');return;}tx.create(ref,{title,classId,ownerUid:ctx.uid,status:'open',studentIds,mission,epoch,generation:0,assetCount:0,assetBytes:0,lastHistoryAt:stamp,createdAt:stamp,updatedAt:stamp});tx.create(ref.collection('canvasRevisions').doc(epoch),{state,label:'처음 시작',actorName:ctx.displayName||'선생님',actorKey:actorKey(ctx),visibleHistory:true,generation:0,createdAt:stamp});});return json({canvas:publicCanvas(await ref.get(),ctx)},201);
}
/** One request creates every group canvas of an activity together; a retried request returns the same canvases. */
async function createGroups(ctx:Context,value:Data,classId:string,mission:string){
  const title=text(value.title,'활동 이름',120),requestId=id(value.requestId);let groups;try{groups=validateCanvasGroups(value.groups,await activeRoster(classId));}catch(error){groupError(error);}
  const activityId=hash(`${ctx.uid}:activity:${requestId}`).slice(0,40),activityStudentIds=groups.flatMap(group=>group.studentIds),stamp=now(),blank=new Y.Doc(),state=encodeCanvasUpdate(Y.encodeStateAsUpdate(blank));blank.destroy();
  const refs=groups.map((_,index)=>db().collection('classCanvases').doc(hash(`${ctx.uid}:${requestId}:${index}`)));
  await db().runTransaction(async tx=>{const existing=await Promise.all(refs.map(ref=>tx.get(ref)));if(existing.some(doc=>doc.exists)){if(existing.some(doc=>!doc.exists||doc.data()?.ownerUid!==ctx.uid||doc.data()?.activityId!==activityId))throw new ApiError(409,'새 요청으로 다시 만들어 주세요.');return;}
    groups.forEach((group,index)=>{const epoch=randomUUID();tx.create(refs[index],{title,classId,ownerUid:ctx.uid,status:'open',studentIds:group.studentIds,groupName:group.name,activityId,activityStudentIds,shareResults:false,mission,epoch,generation:0,assetCount:0,assetBytes:0,lastHistoryAt:stamp,createdAt:stamp,updatedAt:stamp});tx.create(refs[index].collection('canvasRevisions').doc(epoch),{state,label:'처음 시작',actorName:ctx.displayName||'선생님',actorKey:actorKey(ctx),visibleHistory:true,generation:0,createdAt:stamp});});});
  const docs=await Promise.all(refs.map(ref=>ref.get()));return json({canvases:docs.map(doc=>publicCanvas(doc,ctx)),canvas:publicCanvas(docs[0],ctx)},201);
}
/** Status and title stay per canvas; mission and result sharing apply to the whole activity; members keep groups disjoint. */
async function update(ctx:Context,request:Request,canvasId:string){
  const doc=await load(ctx,canvasId);if(ctx.role==='student')throw new ApiError(403,'선생님만 설정할 수 있어요.');const value=await readBody(request),current=doc.data()!,stamp=now();
  const own:Data={updatedAt:stamp},shared:Data={};
  if('status' in value){if(!['open','frozen','archived'].includes(value.status))throw new ApiError(400,'캔버스 상태를 확인해 주세요.');own.status=value.status;}
  if('title' in value)shared.title=text(value.title,'캔버스 이름',120);
  if('mission' in value){try{shared.mission=canvasMission(value.mission);}catch(error){groupError(error);}}
  if('shareResults' in value){if(typeof value.shareResults!=='boolean'||!current.activityId)throw new ApiError(400,'모둠 활동에서만 결과를 함께 볼 수 있어요.');shared.shareResults=value.shareResults;}
  let studentIds:string[]|undefined;
  if('studentIds' in value){const ids=value.studentIds,roster=await activeRoster(current.classId);if(!Array.isArray(ids)||ids.length>200||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!roster.has(id)))throw new ApiError(400,'참여 학생을 다시 선택해 주세요.');if(current.activityId&&!ids.length)throw new ApiError(400,'모둠에는 학생을 한 명 이상 넣어 주세요.');studentIds=ids;own.studentIds=ids;}
  if(!current.activityId){Object.assign(own,shared);await doc.ref.update(own);return json({canvas:publicCanvas(await doc.ref.get(),ctx)});}
  await db().runTransaction(async tx=>{const siblings=(await tx.get(db().collection('classCanvases').where('activityId','==',current.activityId))).docs.filter(other=>other.data().ownerUid===ctx.uid);
    if(studentIds){try{assertNoOverlap(canvasId,studentIds,siblings.map(other=>({id:other.id,studentIds:other.data().studentIds})));}catch(error){groupError(error);}shared.activityStudentIds=siblings.flatMap(other=>other.id===canvasId?studentIds!:other.data().studentIds||[]);}
    for(const other of siblings)tx.update(other.ref,other.id===canvasId?{...shared,...own}:{...shared,updatedAt:stamp});});
  return json({canvas:publicCanvas(await doc.ref.get(),ctx)});
}
/** Read-only current picture for result sharing: checkpoint plus live channel updates, no reader grant. */
async function snapshot(ctx:Context,canvasId:string){const doc=await canvasRef(canvasId).get(),value=doc.data();if(!canRead(ctx,value)&&!canViewResult(ctx,value))throw new ApiError(404,'볼 수 있는 함께캔버스를 찾을 수 없어요.','CANVAS_UNAVAILABLE');
  const revision=await revisionRef(canvasId,value!.epoch).get();if(!revision.exists)throw Error('Missing canvas revision');const channels=await revision.ref.collection('canvasChannels').get();
  const state=encodeCanvasUpdate(Y.mergeUpdates([decodeCanvasUpdate(revision.data()!.state),...channels.docs.map(channel=>decodeCanvasUpdate(channel.data().data))]));
  return json({canvas:publicCanvas(doc,ctx,!canRead(ctx,value)),state,assets:await signedAssets(canvasId)});}
async function bootstrap(ctx:Context,canvasId:string){for(let retry=0;retry<3;retry++){const doc=await load(ctx,canvasId),value=doc.data()!,revision=await revisionRef(canvasId,value.epoch).get();const fresh=await doc.ref.get();access(ctx,fresh.data());if(fresh.data()?.epoch!==value.epoch)continue;if(!revision.exists)throw Error('Missing canvas revision');await grant(ctx,canvasId);return json({canvas:publicCanvas(fresh,ctx),state:revision.data()!.state,viewer:{uid:ctx.uid,key:actorKey(ctx),name:await name(ctx),role:ctx.role},assets:await assets(ctx,canvasId)});}throw new ApiError(409,'화면을 준비 중이에요. 다시 시도해 주세요.');}
function decoded(value:unknown){if(typeof value!=='string'||value.length>650_000)throw new ApiError(413,'한 번에 전송할 변경 내용이 너무 커요.');try{const update=decodeCanvasUpdate(value);Y.decodeUpdate(update);return update;}catch{throw new ApiError(400,'변경 내용을 읽을 수 없어요.','CANVAS_UPDATE_INVALID');}}
class CompactNeeded extends Error{}
async function compact(ctx:Context,canvasId:string,{incoming,generation,label,restoreId,manual=false,updateId,actions}:{incoming?:Uint8Array;generation?:number;label?:string;restoreId?:string;manual?:boolean;updateId?:string;actions?:string[]}={}){
  const ref=canvasRef(canvasId),newEpoch=randomUUID(),backupEpoch=randomUUID(),actorName=await name(ctx);
  const result=await db().runTransaction(async tx=>{
    const parent=await tx.get(ref),value=parent.data();access(ctx,value,!!incoming);if((restoreId||manual)&&ctx.role==='student')throw new ApiError(403,'선생님만 버전을 관리할 수 있어요.');if(generation!==undefined&&value.generation!==generation)throw new ApiError(409,'선생님이 이전 버전으로 복원했어요.','CANVAS_RESTORED');
    if(manual&&!label&&!restoreId&&Date.now()-Date.parse(value.lastHistoryAt)<45_000)return{noop:true,epoch:value.epoch,generation:value.generation,channels:[],oldEpoch:'',keepOld:true};
    const oldRef=revisionRef(canvasId,value.epoch),writerRef=ref.collection('canvasWriters').doc(actorKey(ctx)),eventRef=ref.collection('canvasEvents').doc(hash(`${actorKey(ctx)}:${updateId||'checkpoint'}`));const [base,channels,target,writer,event]=await Promise.all([tx.get(oldRef),tx.get(oldRef.collection('canvasChannels')),restoreId?tx.get(revisionRef(canvasId,restoreId)):Promise.resolve(null),incoming?tx.get(writerRef):Promise.resolve(null),incoming?tx.get(eventRef):Promise.resolve(null)]);
    if(incoming&&event?.exists)return{noop:true,epoch:value.epoch,generation:value.generation,channels:[],oldEpoch:'',keepOld:true};
    const minute=Math.floor(Date.now()/60000),count=writer?.data()?.minute===minute?writer.data()?.count||0:0,hour=Math.floor(Date.now()/3600_000),bytes=writer?.data()?.hour===hour?writer.data()?.bytes||0:0;
    if(incoming&&(count>=120||bytes+Math.ceil(incoming.length/3)*4>16_000_000))throw new ApiError(429,'변경을 많이 전송했어요. 잠시 뒤 다시 연결할게요.','CANVAS_RATE_LIMIT');
    if(!base.exists||restoreId&&!target?.exists)throw new ApiError(404,'이전 버전을 찾을 수 없어요.');
    const doc=new Y.Doc();let current:string;try{Y.applyUpdate(doc,decodeCanvasUpdate(base.data()!.state));for(const channel of channels.docs)Y.applyUpdate(doc,decodeCanvasUpdate(channel.data().data));if(incoming)Y.applyUpdate(doc,incoming);current=encodeCanvasUpdate(Y.encodeStateAsUpdate(doc));}finally{doc.destroy();}
    if(current.length>900_000)throw new ApiError(409,'이 화면에 자료가 많이 쌓였어요. 편집 원본을 저장하고 새 캔버스를 열어 주세요.','CANVAS_FULL');
    const stamp=now(),visibleHistory=!!restoreId||manual||Date.now()-Date.parse(value.lastHistoryAt)>=45_000,nextGeneration=value.generation+(restoreId?1:0),restoredState=restoreId?target!.data()!.state:current;
    if(restoreId)tx.create(revisionRef(canvasId,backupEpoch),{state:current,label:'복원 전 자동 보관',visibleHistory:true,actorName,actorKey:actorKey(ctx),generation:value.generation,createdAt:stamp});
    tx.create(revisionRef(canvasId,newEpoch),{state:restoredState,label:restoreId?`복원 · ${target!.data()?.label||'이전 버전'}`:label||'자동 저장',visibleHistory,actorName:incoming?'자동 저장':actorName,actorKey:actorKey(ctx),generation:nextGeneration,createdAt:stamp});
    if(incoming){tx.set(writerRef,{minute,count:count+1,hour,bytes:bytes+Math.ceil(incoming.length/3)*4});tx.create(eventRef,{type:'edit',actorName,actorKey:actorKey(ctx),summary:actions?.join(',')||'edit',generation:value.generation,epoch:newEpoch,createdAt:stamp});}
    tx.update(ref,{epoch:newEpoch,generation:nextGeneration,updatedAt:stamp,...(visibleHistory?{lastHistoryAt:stamp}:{})});
    tx.create(ref.collection('canvasEvents').doc(),{type:restoreId?'restore':'checkpoint',actorName,actorKey:actorKey(ctx),summary:restoreId?'이전 버전 복원':label||'자동 저장',generation:nextGeneration,epoch:newEpoch,createdAt:stamp});
    return{noop:false,epoch:newEpoch,generation:nextGeneration,channels:channels.docs.map(doc=>doc.ref),oldEpoch:value.epoch,keepOld:base.data()?.visibleHistory===true};
  });
  // All durable changes are now in the new base state. Old live channels are disposable.
  if(!result.noop){const batch=db().batch();result.channels.forEach(ref=>batch.delete(ref));if(!result.keepOld)batch.delete(revisionRef(canvasId,result.oldEpoch));await batch.commit();}
  return{epoch:result.epoch,generation:result.generation};
}
async function sync(ctx:Context,request:Request,canvasId:string){const value=await readBody(request),update=decoded(value.data),updateId=id(value.updateId);if(!Number.isSafeInteger(value.generation)||value.generation<0)throw new ApiError(400,'화면 버전을 확인해 주세요.');const ref=canvasRef(canvasId),key=actorKey(ctx),actorName=await name(ctx);
  const actions=Array.isArray(value.actions)?value.actions.filter((action:unknown)=>typeof action==='string'&&['text','draw','image','move','delete','undo','edit'].includes(action as string)).slice(0,8):['edit'];
  try{const result=await db().runTransaction(async tx=>{
    const parent=await tx.get(ref),canvas=parent.data();access(ctx,canvas,true);if(canvas.generation!==value.generation)throw new ApiError(409,'선생님이 이전 버전으로 복원했어요.','CANVAS_RESTORED');const channelRef=revisionRef(canvasId,canvas.epoch).collection('canvasChannels').doc(key),rateRef=ref.collection('canvasWriters').doc(key),eventRef=ref.collection('canvasEvents').doc(hash(`${key}:${updateId}`)),[channel,rate,event]=await Promise.all([tx.get(channelRef),tx.get(rateRef),tx.get(eventRef)]);
    if(event.exists)return{epoch:canvas.epoch,generation:canvas.generation};
    const minute=Math.floor(Date.now()/60000),count=rate.data()?.minute===minute?rate.data()?.count||0:0,hour=Math.floor(Date.now()/3600_000),bytes=rate.data()?.hour===hour?rate.data()?.bytes||0:0;
    if(count>=120||bytes+value.data.length>16_000_000)throw new ApiError(429,'변경을 많이 전송했어요. 잠시 뒤 다시 연결할게요.','CANVAS_RATE_LIMIT');
    const merged=encodeCanvasUpdate(Y.mergeUpdates(channel.exists?[decodeCanvasUpdate(channel.data()!.data),update]:[update]));if(merged.length>96000)throw new CompactNeeded();
    const stamp=now();tx.set(channelRef,{data:merged,actorKey:key,actorName,updatedAt:stamp});tx.set(rateRef,{minute,count:count+1,hour,bytes:bytes+value.data.length,recent:[...(rate.data()?.recent||[]).slice(-39),updateId]});
    tx.create(ref.collection('canvasEvents').doc(hash(`${key}:${updateId}`)),{type:'edit',actorKey:key,actorName,summary:actions.join(',')||'edit',generation:canvas.generation,epoch:canvas.epoch,createdAt:stamp});return{epoch:canvas.epoch,generation:canvas.generation};
  });return json({acked:true,...result});}catch(error){if(!(error instanceof CompactNeeded))throw error;const result=await compact(ctx,canvasId,{incoming:update,generation:value.generation,updateId,actions});return json({acked:true,...result});}
}
async function presence(ctx:Context,request:Request,canvasId:string){const value=await readBody(request),doc=await load(ctx,canvasId),key=actorKey(ctx),ref=doc.ref.collection('canvasPresence').doc(key);if(value.leave===true){await ref.delete();return json({ok:true});}
  const cursor=value.cursor;let point:Data={};if(cursor){if(typeof cursor.x!=='number'||typeof cursor.y!=='number'||!Number.isFinite(cursor.x)||!Number.isFinite(cursor.y))throw new ApiError(400,'커서 위치를 확인해 주세요.');point={x:Math.max(-CANVAS_WORLD_LIMIT,Math.min(CANVAS_WORLD_LIMIT,cursor.x)),y:Math.max(-CANVAS_WORLD_LIMIT,Math.min(CANVAS_WORLD_LIMIT,cursor.y)),selected:typeof cursor.selected==='string'&&/^[A-Za-z0-9_-]{0,100}$/.test(cursor.selected)?cursor.selected:''};}
  await ref.set({name:await name(ctx),role:ctx.role,color:['#4b8e74','#a36c98','#a27b3f','#5685b3','#a65f59'][parseInt(key.slice(0,4),16)%5],...point,lastSeen:now()});await grant(ctx,canvasId);return json({ok:true});
}
async function image(ctx:Context,request:Request,canvasId:string){const value=await readBody(request),parent=await load(ctx,canvasId);access(ctx,parent.data(),true);if(typeof value.src!=='string'||value.src.length>500000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value.src))throw new ApiError(400,'사진을 다시 골라 주세요.');
  const bytes=Buffer.from(value.src.split(',')[1],'base64');let output:Buffer;try{output=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();}catch{throw new ApiError(400,'사진을 읽을 수 없어요.');}
  if(output.length>500000)throw new ApiError(413,'사진 크기를 조금 줄여 주세요.');const assetId=hash(`${ctx.uid}:`+hash(output.toString('base64'))),ref=parent.ref.collection('canvasAssets').doc(assetId),path=`class-canvas-assets/${canvasId}/${assetId}.webp`,lease=randomUUID();
  const existing=await db().runTransaction(async tx=>{const [fresh,asset]=await Promise.all([tx.get(parent.ref),tx.get(ref)]),canvas=fresh.data();access(ctx,canvas,true);if(asset.data()?.status==='ready')return true;if(asset.exists&&asset.data()?.status==='processing'&&Date.now()-Date.parse(asset.data()!.processingAt)<120000)throw new ApiError(409,'이미지를 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.');if(!asset.exists&&((canvas.assetCount||0)>=100||(canvas.assetBytes||0)+output.length>20*1024*1024))throw new ApiError(409,'이 캔버스의 사진 공간이 가득 찼어요. 새 캔버스를 열어 주세요.');tx.set(ref,{status:'processing',path,size:output.length,lease,processingAt:now(),actorKey:actorKey(ctx)});if(!asset.exists)tx.update(parent.ref,{assetCount:(canvas.assetCount||0)+1,assetBytes:(canvas.assetBytes||0)+output.length});return false;});
  if(!existing){try{await bucket().file(path).save(output,{resumable:false,metadata:{contentType:'image/webp',cacheControl:'private,max-age=300'}});await db().runTransaction(async tx=>{const [fresh,asset]=await Promise.all([tx.get(parent.ref),tx.get(ref)]);access(ctx,fresh.data(),true);if(asset.data()?.lease!==lease)throw Error('Canvas image lease changed');tx.update(ref,{status:'ready',createdAt:now()});tx.update(parent.ref,{assetRevision:randomUUID()});});}catch(error){await db().runTransaction(async tx=>{const asset=await tx.get(ref);if(asset.data()?.lease===lease)tx.update(ref,{status:'retryable',lastErrorAt:now()});});throw error;}}
  const[url]=await bucket().file(path).getSignedUrl({action:'read',expires:Date.now()+15*60_000});return json({assetId,url},201);
}
async function history(ctx:Context,canvasId:string,request:Request){const parent=await load(ctx,canvasId);if(ctx.role==='student')throw new ApiError(403,'선생님만 전체 이력을 볼 수 있어요.');const params=new URL(request.url).searchParams;
  async function page(collection:string,size:number,cursor:string|null,visible=false){let query:FirebaseFirestore.Query=parent.ref.collection(collection);if(visible)query=query.where('visibleHistory','==',true);query=query.orderBy('createdAt','desc');if(cursor==='end')return{items:[],next:null};if(cursor){const snapshot=await parent.ref.collection(collection).doc(id(cursor)).get();if(!snapshot.exists||(visible&&!snapshot.data()?.visibleHistory))throw new ApiError(400,'이력 목록을 새로 열어 주세요.');query=query.startAfter(snapshot);}if(visible)query=query.select('label','actorName','generation','createdAt');const docs=(await query.limit(size+1).get()).docs;return{items:docs.slice(0,size).map(doc=>({id:doc.id,...doc.data()})),next:docs.length>size?docs[size-1].id:null};}
  const [versions,events]=await Promise.all([page('canvasRevisions',60,params.get('versionCursor'),true),page('canvasEvents',150,params.get('eventCursor'))]);return json({versions:versions.items,events:events.items,versionCursor:versions.next,eventCursor:events.next});}
export async function handleCanvases(request:Request,segments:string[]=[]){try{if(!['GET','HEAD'].includes(request.method))assertOrigin(request);const ctx=await getContext(request),[canvasId,action]=segments;
  if(!canvasId&&request.method==='GET')return await list(ctx,request);if(!canvasId&&request.method==='POST')return await create(ctx,request);
  if(canvasId&&!action&&request.method==='GET')return await bootstrap(ctx,canvasId);
  if(canvasId&&!action&&request.method==='PATCH')return await update(ctx,request,canvasId);
  if(canvasId&&action==='snapshot'&&request.method==='GET')return await snapshot(ctx,canvasId);
  if(canvasId&&action==='sync'&&request.method==='POST')return await sync(ctx,request,canvasId);
  if(canvasId&&action==='presence'&&request.method==='POST')return await presence(ctx,request,canvasId);
  if(canvasId&&action==='assets'&&request.method==='GET')return json({assets:await assets(ctx,canvasId)});
  if(canvasId&&action==='images'&&request.method==='POST')return await image(ctx,request,canvasId);
  if(canvasId&&action==='history'&&request.method==='GET')return await history(ctx,canvasId,request);
  if(canvasId&&action==='version'&&request.method==='GET'){await load(ctx,canvasId);if(ctx.role==='student')throw new ApiError(403,'선생님만 과거 버전을 볼 수 있어요.');const version=await revisionRef(canvasId,id(segments[2])).get();if(!version.exists||!version.data()?.visibleHistory)throw new ApiError(404,'이전 버전을 찾을 수 없어요.');return json({state:version.data()!.state});}
  if(canvasId&&action==='checkpoint'&&request.method==='POST'){const value=await readBody(request);return json(await compact(ctx,canvasId,{manual:true,label:value.label?text(value.label,'버전 이름',80):undefined}));}
  if(canvasId&&action==='restore'&&request.method==='POST'){const value=await readBody(request);return json(await compact(ctx,canvasId,{restoreId:id(value.versionId),generation:value.generation}));}
  throw new ApiError(404,'요청한 기능을 찾을 수 없어요.');
}catch(error){if(error instanceof ApiError)return json({error:error.message,code:error.code},error.status);console.error('Canvas operation failed',(error as{code?:string}).code||'INTERNAL');return json({error:'함께캔버스를 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.',code:'CANVAS_FAILED'},500);}}

