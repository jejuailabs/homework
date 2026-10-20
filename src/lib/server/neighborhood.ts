import 'server-only';
import {createHash, randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db} from './admin';
import {assertOrigin, requireTeacher} from './auth';
import {ApiError, id} from './policy';
import {readBoundedJson} from './ai-policy';
import {overpassQuery, parseNeighborhoodMap, parseOverpassMap, validateMapCenter, validateNeighborhoodPack, type NeighborhoodPack} from '../neighborhood';

const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const stamp=()=>new Date().toISOString();
const failure=(error:unknown)=>json({error:error instanceof ApiError?error.message:'자료를 처리하지 못했어요. 입력과 연결 상태를 확인해 주세요.',code:error instanceof ApiError?error.code:'NEIGHBORHOOD_ERROR'},error instanceof ApiError?error.status:400);
const parse=<T>(fn:()=>T):T=>{try{return fn();}catch{throw new ApiError(400,'지역·좌표·자료 형식을 확인해 주세요.','NEIGHBORHOOD_INPUT');}};

export async function neighborhoodMapRoute(request:Request){
  let lease:string|null=null;
  let globalRef:FirebaseFirestore.DocumentReference|null=null;
  try{
    assertOrigin(request);const ctx=await requireTeacher(request);
    globalRef=db().doc('neighborhoodLimits/global');
    const raw=await readBoundedJson(request,2000),center=parse(()=>validateMapCenter(raw));
    const cacheKey=hash(`${center.lat}:${center.lon}:${center.radius}`),cacheRef=db().doc(`neighborhoodMapCache/${cacheKey}`);
    const cached=await cacheRef.get(),cachedData=cached.data(),now=Date.now();
    if(cachedData&&typeof cachedData.mapJson==='string'&&cachedData.expiresAt>now){try{return json({map:parseNeighborhoodMap(JSON.parse(cachedData.mapJson)),cached:true});}catch{/* Replace an invalid older cache entry. */}}
    const day=new Date(now+9*3600000).toISOString().slice(0,10),teacherRef=db().doc(`neighborhoodLimits/${hash(ctx.uid)}`);
    const leaseId=randomUUID();
    await db().runTransaction(async tx=>{
      const [global,teacher]=await Promise.all([tx.get(globalRef!),tx.get(teacherRef)]),g=global.data()??{},t=teacher.data()??{};
      if((g.busyUntil??0)>now||(g.lastStarted??0)>now-5000)throw new ApiError(429,'지도 요청이 진행 중이에요. 잠시 뒤 다시 눌러 주세요.','MAP_BUSY');
      const globalCount=g.day===day?(g.count??0):0,teacherCount=t.day===day?(t.count??0):0;
      if(globalCount>=100||teacherCount>=10)throw new ApiError(429,'오늘 새 지도를 불러오는 횟수를 모두 사용했어요. 저장한 자료는 계속 사용할 수 있어요.','MAP_QUOTA');
      tx.set(globalRef!,{day,count:globalCount+1,lastStarted:now,busyUntil:now+35000,leaseId});tx.set(teacherRef,{day,count:teacherCount+1});
    });lease=leaseId;
    // This independent operator explicitly permits commercial applications (terms dated
    // 2026-04-10, https://overpass.private.coffee/). Do not switch to overpass-api.de
    // or a public geocoder without reviewing that operator's current application policy.
    const endpoint=process.env.NEIGHBORHOOD_OVERPASS_URL||'https://overpass.private.coffee/api/interpreter';
    let endpointUrl:URL;try{endpointUrl=new URL(endpoint);}catch{throw new ApiError(503,'지도 서비스 연결 설정을 확인해 주세요.','MAP_NOT_CONFIGURED');}
    if(endpointUrl.protocol!=='https:'||endpointUrl.username||endpointUrl.password)throw new ApiError(503,'지도 서비스 연결 설정을 확인해 주세요.','MAP_NOT_CONFIGURED');
    let upstream:Response;
    try{upstream=await fetch(endpointUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'HomeworkFriends-ClassroomMaps/1.0 (+https://homework-indol-gamma.vercel.app)'},body:new URLSearchParams({data:overpassQuery(center)}),cache:'no-store',signal:AbortSignal.timeout(28000),redirect:'error'});}catch{throw new ApiError(503,'외부 지도 서버가 응답하지 않아요. 잠시 뒤 다시 시도하거나 저장한 자료·GeoJSON 지도를 가져와 주세요.','MAP_UNAVAILABLE');}
    if(!upstream.ok)throw new ApiError(503,'지도 서비스가 잠시 바빠요. 저장한 자료를 사용하거나 잠시 뒤 다시 시도해 주세요.','MAP_UNAVAILABLE');
    let map;try{map=parseOverpassMap(await readBoundedJson(upstream,3_000_000),center,stamp());}catch{throw new ApiError(502,'이 범위의 지도 자료를 가져오지 못했어요. 범위를 줄이거나 GeoJSON 파일을 가져와 주세요.','MAP_INCOMPLETE');}
    const mapJson=JSON.stringify(map);if(Buffer.byteLength(mapJson)>700000)throw new ApiError(413,'지도 범위를 줄여서 다시 불러와 주세요.','MAP_SIZE');
    await cacheRef.set({mapJson,expiresAt:now+86400000,createdAt:stamp()});
    return json({map,cached:false});
  }catch(error){return failure(error);}finally{
    if(lease&&globalRef){try{await db().runTransaction(async tx=>{const current=await tx.get(globalRef!);if(current.data()?.leaseId===lease)tx.update(globalRef!,{busyUntil:0});});}catch{/* Lease expires independently if cleanup is unavailable. */}}
  }
}

export async function neighborhoodPacksRoute(request:Request){
  try{
    if(request.method!=='GET')assertOrigin(request);const ctx=await requireTeacher(request);
    const collection=db().collection(`users/${ctx.uid}/neighborhoodPacks`);
    if(request.method==='GET'){
      const key=new URL(request.url).searchParams.get('id');
      if(key){const doc=await collection.doc(id(key)).get();if(!doc.exists)throw new ApiError(404,'저장한 자료를 찾을 수 없어요.','NOT_FOUND');const data=doc.data()!;const {mapJson,...stored}=data;return json({pack:{...stored,map:mapJson?JSON.parse(mapJson):null,id:doc.id}});}
      const result=await collection.orderBy('createdAt','desc').limit(50).get();
      return json({packs:result.docs.map(doc=>{const data=doc.data();return {id:doc.id,title:data.title,region:data.region,classId:data.classId,createdAt:data.createdAt};})});
    }
    const input=await readBoundedJson(request,800000) as {pack?:unknown;requestId?:unknown};
    const pack:NeighborhoodPack=parse(()=>validateNeighborhoodPack(input?.pack));
    if(pack.classId){const klass=await db().doc(`classes/${pack.classId}`).get();if(!klass.exists||klass.data()?.ownerUid!==ctx.uid)throw new ApiError(403,'내 학급에만 자료를 연결할 수 있어요.','FORBIDDEN');}
    const key=id(input?.requestId),ref=collection.doc(key),{map,...fields}=pack,mapJson=map?JSON.stringify(map):null,contentHash=hash(JSON.stringify(pack));
    if(Buffer.byteLength(JSON.stringify(pack))>740000)throw new ApiError(413,'지도나 자료의 크기를 줄여 주세요.','PACK_SIZE');
    let createdAt=stamp();
    await db().runTransaction(async tx=>{const current=await tx.get(ref);if(current.exists){if(current.data()!.contentHash!==contentHash)throw new ApiError(409,'이 저장 요청은 다른 내용으로 이미 사용됐어요. 새 버전으로 다시 저장해 주세요.','PACK_CONFLICT');createdAt=current.data()!.createdAt;return;}tx.create(ref,{...fields,mapJson,contentHash,createdAt,ownerUid:ctx.uid});});
    return json({id:key,createdAt},201);
  }catch(error){return failure(error);}
}
