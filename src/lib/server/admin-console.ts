import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {AggregateField,FieldPath,Timestamp} from 'firebase-admin/firestore';
import {NextResponse} from 'next/server';
import {auth,bucket,db} from './admin';
import {getContext,assertOrigin,type Context} from './auth';
import {ApiError,id,isAdmin,text,canDisableUser} from './policy';
import {getAiOperations} from './ai';
import {adminAiUsage} from './admin-ai-usage';
import {adminContent,contentKind,csvCell,adminDate,storageKind} from '../admin-console-policy';
import {directoryQuery} from '../admin-directory-fields';

type Data=Record<string,any>;
const stamp=()=>new Date().toISOString();
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private,no-store'}});
const millis=(v:any)=>v?.toMillis?.()??(typeof v==='string'?Date.parse(v):0);
const iso=(v:any)=>v?.toDate?.().toISOString()??(typeof v==='string'?v:'');
const countCache=new Map<string,{value:number;expires:number;at:string}>();
async function body(request:Request){const raw=await request.text();if(raw.length>20000)throw new ApiError(413,'요청이 너무 커요.');try{const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v as Data;}catch{throw new ApiError(400,'입력 내용을 확인해 주세요.');}}
async function context(request:Request){const ctx=await getContext(request);if(!isAdmin(ctx.role))throw new ApiError(403,'운영자만 사용할 수 있어요.','FORBIDDEN');return ctx;}
async function audit(ctx:Context,action:string,target:string,details:Data={},outcome='success') {
  await db().collection('adminAudit').add({actorUid:ctx.uid,action,target,details:JSON.parse(JSON.stringify(details)),outcome,kind:'change',createdAt:stamp()});
}
async function names(ids:string[],collection='users') {
  const keys=[...new Set(ids.filter(v=>typeof v==='string'&&/^[A-Za-z0-9_-]+$/.test(v)))];
  const docs=keys.length?await db().getAll(...keys.map(v=>db().doc(collection+'/'+v))):[];
  return new Map(docs.map(d=>[d.id,d.data()?.displayName||d.data()?.name||d.data()?.email||'이름 없는 계정']));
}
function token(scope:string,after:unknown[]){return Buffer.from(JSON.stringify({scope,after})).toString('base64url');}
function cursor(raw:string,scope:string){try{if(raw.length>3000)throw Error();const v=JSON.parse(Buffer.from(raw,'base64url').toString());if(v.scope!==scope||!Array.isArray(v.after)||v.after.length!==2||typeof v.after[0]!=='string'||typeof v.after[1]!=='string')throw Error();return v.after;}catch{throw new ApiError(400,'조건이 달라졌어요. 첫 페이지부터 다시 열어 주세요.','INVALID_CURSOR');}}

async function definition(section:string,p:URLSearchParams) {
  let collection='',sort='',query:FirebaseFirestore.Query;
  const teacher=p.get('teacher')||'',classId=p.get('classId')||'',q=p.get('q')||'',status=p.get('status')||'';
  if(q.length>80)throw new ApiError(400,'검색어는80자까지 입력해 주세요.');
  if(p.get('year')&&(!/^\d{4}$/.test(p.get('year')!)||Number(p.get('year'))<2000||Number(p.get('year'))>2200))throw new ApiError(400,'학년도를 확인해 주세요.');
  if(p.get('from')&&p.get('to')&&adminDate(p.get('from')!)>=adminDate(p.get('to')!,true))throw new ApiError(400,'시작일과 종료일을 확인해 주세요.');
  if(teacher)id(teacher);if(classId)id(classId);
  if(classId){const cls=await db().doc('classes/'+classId).get();if(!cls.exists||teacher&&cls.data()?.ownerUid!==teacher)throw new ApiError(400,'담당 교사와 학급을 확인해 주세요.');}
  if(section==='accounts'){collection='users';sort='__name__';}
  else if(section==='classes'){collection='classes';sort='name';}
  else if(section==='content'){collection=adminContent[contentKind(p.get('kind')||'homework')].collection;sort='title';}
  else if(section==='audit'){collection='adminAudit';sort='createdAt';}
  else if(section==='jobs'){collection=p.get('kind')==='ai'?'aiJobs':'adminJobs';sort='createdAt';}
  else if(section==='storage'){collection='adminAssets';sort='name';}
  else throw new ApiError(404,'관리 화면을 찾을 수 없어요.');
  query=db().collection(collection);
  if(section==='accounts'){
    const students=p.get('kind')==='students';query=query.where('directoryRole','==',students?'student':'teacher');
    if(students){if(!teacher)throw new ApiError(400,'담당 교사를 먼저 선택해 주세요.');query=query.where('directoryTeacherUid','==',teacher);if(classId)query=query.where('classId','==',classId);if(p.get('year'))query=query.where('directoryYear','==',Number(p.get('year')));}
    if(status)query=query.where('disabled','==',status==='suspended');
    if(q)query=query.where('directorySearch','array-contains',directoryQuery(q));
  }
  let generation='';
  if(section==='storage'){generation=p.get('scanId')||(await db().doc('adminSnapshots/storage').get()).data()?.scanId||'none';if(generation!=='none')id(generation);query=query.where('scanId','==',generation);}
  if(section==='classes'||section==='content'||section==='storage'){
    if(classId&&section!=='classes')query=query.where('classId','==',classId);
    else if(teacher)query=query.where('ownerUid','==',teacher);
    if(section==='classes'&&p.get('year')){const year=Number(p.get('year'));if(!Number.isInteger(year)||year<2000||year>2200)throw new ApiError(400,'학년도를 확인해 주세요.');query=query.where('year','==',year);}
    if(status){const field=section==='classes'?'adminStatus':section==='content'&&p.get('kind')==='cards'?'archived':section==='content'&&p.get('kind')==='distributions'?'active':'status';query=query.where(field,'==',field==='archived'?status==='archived':field==='active'?status==='open':status);}
    if(section==='storage'&&p.get('type'))query=query.where('type','==',p.get('type'));
  }
  if(section==='audit')for(const key of ['actorUid','target','action','outcome','kind'])if(p.get(key))query=query.where(key,'==',text(p.get(key),key,200));
  if(section==='jobs'){
    if(teacher)query=query.where('actorUid','==',teacher);
    if(status)query=query.where('status','==',status);
    if(p.get('tool')&&collection==='aiJobs')query=query.where('tool','==',p.get('tool'));
  }
  if(sort==='createdAt'){
    if(p.get('from'))query=query.where(sort,'>=',adminDate(p.get('from')!));
    if(p.get('to'))query=query.where(sort,'<',adminDate(p.get('to')!,true));
  }else if(q&&section!=='accounts'){query=query.where(sort,'>=',q).where(sort,'<=',q+'\uf8ff');}
  const direction=sort==='createdAt'?'desc':'asc';
  return{collection,sort,generation,query:sort==='__name__'?query.orderBy(FieldPath.documentId()):query.orderBy(sort,direction).orderBy(FieldPath.documentId(),direction)};
}
async function rows(section:string,p:URLSearchParams,ctx:Context,size=50,withTotal=true,readTime?:Timestamp) {
  if(size===50&&p.get('limit')){const limit=Number(p.get('limit'));if(![20,50].includes(limit))throw new ApiError(400,'페이지 크기를 확인해 주세요.');size=limit;}
  if(section==='accounts'&&p.get('kind')!=='students'&&size===50)size=20;
  const def=await definition(section,p),scope=hash(JSON.stringify([ctx.uid,section,def.generation,[...p].filter(([k])=>!['cursor','export'].includes(k)).sort()]));
  let query=def.query;const raw=p.get('cursor');if(raw){const after=cursor(raw,scope);query=def.sort==='__name__'?query.startAfter(after[1]):query.startAfter(...after);}
  let cached=countCache.get(scope);if(cached&&cached.expires<Date.now())cached=undefined;
  const [snap,total]=await Promise.all([readTime?db().runTransaction(tx=>tx.get(query.limit(size+1)),{readOnly:true,readTime}):query.limit(size+1).get(),withTotal&&!cached?def.query.count().get():Promise.resolve(null)]);
  if(total){cached={value:total.data().count,expires:Date.now()+30_000,at:stamp()};if(countCache.size>=128)countCache.delete(countCache.keys().next().value!);countCache.set(scope,cached);}
  const docs=snap.docs.slice(0,size),owners=await names(docs.flatMap(d=>[d.data().ownerUid,d.data().actorUid].filter(Boolean))),classes=await names(docs.map(d=>d.data().classId).filter(Boolean),'classes');
  const roles=section==='accounts'&&docs.length?new Map((await db().getAll(...docs.map(d=>db().doc('platformRoles/'+d.id)))).map(d=>[d.id,d.data()?.role])):new Map();
  const items=docs.map(doc=>{
    const v=doc.data(),base={id:doc.id,version:doc.updateTime.valueOf()};
    if(section==='accounts'){const role=roles.get(doc.id)||v.role||'teacher';return{...base,uid:doc.id,name:v.displayName||v.email||'이름 없는 계정',email:role==='student'?'':v.email||'',role,status:v.disabled?'suspended':'active',classId:v.classId||'',className:classes.get(v.classId)||'',number:v.directoryNumber||0,canDisable:canDisableUser(ctx.role,ctx.uid,doc.id,role),disabled:!!v.disabled};}
    if(section==='classes')return{...base,name:v.name,ownerUid:v.ownerUid,ownerName:owners.get(v.ownerUid)||'소속 교사 확인 필요',year:v.year,grade:v.grade,studentCount:v.studentCount||0,status:v.adminStatus||'active'};
    if(section==='content')return{...base,name:v.title,ownerUid:v.ownerUid,ownerName:owners.get(v.ownerUid)||'담당 교사 확인 필요',classId:v.classId||'',className:classes.get(v.classId)||'',status:def.collection==='cardSets'?(v.archived?'archived':'active'):def.collection==='cardClassSets'?(v.active?'open':'closed'):v.status||'published',createdAt:iso(v.createdAt),count:v.artworkCount??v.postCount??v.cardCount??v.targetCount??v.assetCount??0};
    if(section==='audit')return{...base,action:v.action,actorUid:v.actorUid,actorName:owners.get(v.actorUid)||'삭제된 계정',target:v.target||'',kind:v.kind||(/\.(view|list)$/.test(v.action)?'read':'change'),outcome:v.outcome||'success',createdAt:iso(v.createdAt),details:safeAuditDetails(v.details)};
    if(section==='jobs')return{...base,name:v.name||v.tool||v.kind,actorUid:v.actorUid,actorName:owners.get(v.actorUid)||'계정 확인 필요',status:v.status,createdAt:iso(v.createdAt),updatedAt:iso(v.updatedAt||v.completedAt),processed:v.processed||0,total:v.total??null,error:v.error||v.code||'',tool:v.tool||'',model:v.model||'',durationMs:v.durationMs??null,result:v.result||null,retryAllowed:def.collection==='adminJobs'&&['failed','paused','running'].includes(v.status)};
    return{...base,name:v.name,type:v.type,ownerUid:v.ownerUid||'',ownerName:owners.get(v.ownerUid)||'소속 미확인',classId:v.classId||'',className:classes.get(v.classId)||'',size:v.size||0,status:v.status||'unknown',checkedAt:v.checkedAt||'',sourceStatus:v.sourceStatus||'',canQuarantine:v.canQuarantine===true,canRestore:!!v.quarantinePath&&!!v.quarantineJob};
  });
  const last=docs.at(-1);
  return{items,total:cached?.value??null,countedAt:cached?.at??null,pageSize:size,nextCursor:snap.size>size&&last?token(scope,[def.sort==='__name__'?last.id:last.data()[def.sort],last.id]):null,checkedAt:stamp(),scope:section==='storage'?'마지막 버킷 조사에서 확인된 실제 파일; 현재 사용량과 차이가 있을 수 있습니다.':undefined};
}
function safeAuditDetails(details:Data={}) {const result:Data={};for(const key of ['before','after','reason','requestId','jobId','count','classId','kind','code','changed','failed','type','filters'])if(details[key]!==undefined)result[key]=details[key];return result;}
async function overview() {
  const counts:Record<string,()=>Promise<unknown>>={
    teachers:async()=> (await db().collection('users').where('directoryRole','==','teacher').count().get()).data().count,
    students:async()=> (await db().collection('users').where('role','==','student').count().get()).data().count,
    classes:async()=> (await db().collection('classes').count().get()).data().count,
    homework:async()=> (await db().collection('assignments').count().get()).data().count,
    failedAi:async()=> (await db().collection('aiJobs').where('status','==','failed').count().get()).data().count,
    pendingUploads:async()=> (await db().collection('uploads').where('status','==','pending').where('expiresAt','<=',Timestamp.now()).count().get()).data().count,
    storage:async()=> (await db().doc('adminSnapshots/storage').get()).data()||null,
  };
  const entries=Object.entries(counts),results=await Promise.allSettled(entries.map(([,fn])=>fn()));
  return{checkedAt:stamp(),metrics:Object.fromEntries(entries.map(([key],i)=>[key,results[i].status==='fulfilled'?{value:(results[i] as PromiseFulfilledResult<unknown>).value}:{value:null,error:'집계 실패; 새로고침으로 다시 시도해 주세요.'}]))};
}
async function accountDetail(uid:string,ctx:Context) {
  const [doc,roleDoc]=await Promise.all([db().doc('users/'+id(uid)).get(),db().doc('platformRoles/'+uid).get()]);if(!doc.exists)throw new ApiError(404,'계정을 찾을 수 없어요.');
  const v=doc.data()!,role=roleDoc.data()?.role||v.role||'teacher',isStudent=role==='student';
  let authenticationDisabled:boolean|null=null;try{authenticationDisabled=(await auth().getUser(uid)).disabled;}catch(e){if((e as {code?:string}).code!=='auth/user-not-found')throw e;}
  const cls=isStudent&&v.classId?await db().doc('classes/'+id(v.classId)).get():null;
  const counts=isStudent?{}:Object.fromEntries(await Promise.all([['classes','classes'],['students','users'],...Object.entries(adminContent).map(([k,v])=>[k,v.collection])].map(async([key,col])=>[key,(await db().collection(col).where(key==='students'?'directoryTeacherUid':'ownerUid','==',uid).count().get()).data().count])));
  return{account:{uid,displayName:v.displayName||'',email:isStudent?'':v.email||'',role,disabled:!!v.disabled,authenticationDisabled,stateMismatch:authenticationDisabled!==null&&authenticationDisabled!==!!v.disabled,classId:v.classId||'',className:cls?.data()?.name||'',ownerUid:cls?.data()?.ownerUid||'',studentId:v.studentId||'',number:v.directoryNumber||0,version:doc.updateTime!.valueOf(),roleVersion:roleDoc.updateTime?.valueOf()||'none',canDisable:canDisableUser(ctx.role,ctx.uid,uid,role),canChangeRole:ctx.role==='superadmin'&&ctx.uid!==uid&&role!=='superadmin'&&!isStudent},counts,checkedAt:stamp()};
}
async function classDetail(classId:string) {
  const doc=await db().doc('classes/'+id(classId)).get();if(!doc.exists)throw new ApiError(404,'학급을 찾을 수 없어요.');const v=doc.data()!,owner=await names([v.ownerUid]);
  const counts=Object.fromEntries(await Promise.all(Object.entries(adminContent).filter(([k])=>k!=='cards').map(async([k,c])=>[k,(await db().collection(c.collection).where('classId','==',classId).count().get()).data().count])));
  return{class:{id:doc.id,name:v.name,year:v.year,grade:v.grade,studentCount:v.studentCount||0,ownerUid:v.ownerUid,ownerName:owner.get(v.ownerUid)||'담당 교사 확인 필요',status:v.adminStatus||'active',note:v.adminNote||'',version:doc.updateTime!.valueOf()},counts,checkedAt:stamp()};
}
async function contentDetail(kind:string,entityId:string) {
  const spec=adminContent[contentKind(kind)],doc=await db().doc(spec.collection+'/'+id(entityId)).get();if(!doc.exists)throw new ApiError(404,'자료를 찾을 수 없어요.');const v=doc.data()!,owner=await names([v.ownerUid]),cls=v.classId?await names([v.classId],'classes'):new Map();
  return{content:{id:doc.id,kind,name:v.title,description:v.description||'',ownerUid:v.ownerUid,ownerName:owner.get(v.ownerUid)||'담당 교사 확인 필요',classId:v.classId||'',className:cls.get(v.classId)||'',status:kind==='cards'?(v.archived?'archived':'active'):kind==='distributions'?(v.active?'open':'closed'):v.status||'published',publicSharingEnabled:!!v.publicSharingEnabled,createdAt:iso(v.createdAt),updatedAt:iso(v.updatedAt),version:doc.updateTime!.valueOf(),counts:{students:v.targetCount??null,submitted:v.submittedCount??null,reviewed:v.reviewedCount??null,artworks:v.artworkCount??null,posts:v.postCount??null,cards:v.cardCount??null,assets:v.assetCount??null}}};
}
async function settings(ctx:Context,p:URLSearchParams) {
  let query:FirebaseFirestore.Query=db().collection('platformRoles').orderBy(FieldPath.documentId());if(p.get('cursor'))query=query.startAfter(id(p.get('cursor')));
  const[docs,total]=await Promise.all([query.limit(21).get(),db().collection('platformRoles').count().get()]),items=docs.docs.slice(0,20),people=await names(items.map(d=>d.id));
  return{viewer:{uid:ctx.uid,role:ctx.role},operators:items.map(doc=>({uid:doc.id,name:people.get(doc.id)||'계정 확인 필요',role:doc.data().role,version:doc.updateTime.valueOf(),protected:doc.id===ctx.uid||doc.data().role==='superadmin'})),total:total.data().count,nextCursor:docs.size>20?items.at(-1)!.id:null,service:{project:process.env.FIREBASE_PROJECT_ID||process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,region:'asia-northeast3',access:'Google 교사 로그인 / 학생 코드 로그인',checkedAt:stamp()}};
}

async function change(ctx:Context,path:string[],input:Data) {
  countCache.clear();
  const requestId=id(input.requestId),reason=text(input.reason,'변경 사유',500),receipt=db().doc('adminActions/'+hash(ctx.uid+':'+requestId)),now=stamp();
  const fingerprint=hash(JSON.stringify([path,input]));
  const previous=await receipt.get();if(previous.exists){if(previous.data()?.scope!==JSON.stringify(path)||previous.data()?.fingerprint!==fingerprint)throw new ApiError(409,'이미 사용한 요청 번호예요.');if(previous.data()?.result)return previous.data()?.result;}
  if(path[0]==='accounts'&&path[2]==='state')return changeAccount(ctx,id(path[1]),input,receipt,reason);
  let target:FirebaseFirestore.DocumentReference,action='',patch:Data={};
  if(path[0]==='roles'){
    if(ctx.role!=='superadmin')throw new ApiError(403,'최상위 운영자만 권한을 변경할 수 있어요.');
    const uid=id(path[1]);if(uid===ctx.uid||!['admin','teacher'].includes(input.role))throw new ApiError(403,'본인 또는 최상위 운영자 권한은 변경할 수 없어요.');
    const record=await auth().getUser(uid);if(!record.emailVerified||!record.providerData.some(p=>p.providerId==='google.com'))throw new ApiError(400,'인증한 Google 교사 계정만 운영자로 지정할 수 있어요.');
    const user=await db().doc('users/'+uid).get();if(!user.exists||user.data()?.role==='student'||user.data()?.adminStateLease?.until>Date.now())throw new ApiError(409,'처리 가능한 교사 계정을 다시 확인해 주세요.');
    target=db().doc('platformRoles/'+uid);patch={role:input.role,updatedAt:now,updatedBy:ctx.uid};action='role.change';
  }else if(path[0]==='classes'){
    target=db().doc('classes/'+id(path[1]));if(!['active','archived'].includes(input.status))throw new ApiError(400,'관리 구분을 선택해 주세요.');patch={adminStatus:input.status,adminNote:text(input.note,'관리 메모',1000,true)};action='class.classify';
  }else if(path[0]==='content'){
    const kind=contentKind(path[1]);target=db().doc(adminContent[kind].collection+'/'+id(path[2]));
    if(kind==='exhibitions'){if(!['open','closed'].includes(input.status))throw new ApiError(400,'공개 상태를 확인해 주세요.');patch={status:input.status,publicSharingEnabled:false};}
    else if(kind==='boards'){if(!['open','closed','archived'].includes(input.status))throw new ApiError(400,'공개 상태를 확인해 주세요.');patch={status:input.status};}
    else if(kind==='canvases'){if(!['open','closed','archived'].includes(input.status))throw new ApiError(400,'공개 상태를 확인해 주세요.');patch={status:input.status};}
    else if(kind==='cards'){if(!['active','archived'].includes(input.status))throw new ApiError(400,'보관 상태를 확인해 주세요.');patch={archived:input.status==='archived'};}
    else if(kind==='distributions'){if(!['open','closed'].includes(input.status))throw new ApiError(400,'학습 상태를 확인해 주세요.');patch={active:input.status==='open'};}
    else throw new ApiError(400,'숙제 내용 수정은 담당 교사가 진행합니다.');action='content.moderate';patch.updatedAt=now;
  }else throw new ApiError(404,'관리 작업을 찾을 수 없어요.');
  return db().runTransaction(async tx=>{
    const [doc,done,user]=await Promise.all([tx.get(target),tx.get(receipt),path[0]==='roles'?tx.get(db().doc('users/'+target.id)):Promise.resolve(null)]);if(done.exists){if(done.data()?.fingerprint!==fingerprint)throw new ApiError(409,'이미 사용한 요청 번호예요.');return done.data()?.result;}
    if(path[0]==='roles'&&(!user?.exists||user.data()?.role==='student'||user.data()?.adminStateLease?.until>Date.now()))throw new ApiError(409,'계정 상태 처리 후 다시 시도해 주세요.');
    if(path[0]!=='roles'&&!doc.exists)throw new ApiError(404,'대상을 찾을 수 없어요.');
    if((doc.updateTime?.valueOf()||'none')!==input.version)throw new ApiError(409,'다른 화면에서 변경됐어요. 새로고침 후 다시 확인해 주세요.','STALE_VERSION');
    if(path[0]==='roles'&&doc.data()?.role==='superadmin')throw new ApiError(403,'최상위 운영자 계정은 보호됩니다.');
    const before=Object.fromEntries(Object.keys(patch).filter(k=>!k.startsWith('updated')).map(k=>[k,doc.data()?.[k]??null])),after=Object.fromEntries(Object.entries(patch).filter(([k])=>!k.startsWith('updated'))),result={ok:true};
    if(path[0]==='roles'&&input.role==='teacher')tx.delete(target);else tx.set(target,patch,{merge:true});
    tx.create(receipt,{scope:JSON.stringify(path),fingerprint,result,createdAt:now});tx.create(db().collection('adminAudit').doc(),{actorUid:ctx.uid,action,target:target.id,kind:'change',outcome:'success',details:{before,after,reason,requestId,type:path[0]==='content'?path[1]:path[0]},createdAt:now});return result;
  });
}
async function changeAccount(ctx:Context,uid:string,input:Data,receipt:FirebaseFirestore.DocumentReference,reason:string) {
  countCache.clear();
  if(typeof input.disabled!=='boolean')throw new ApiError(400,'계정 상태를 확인해 주세요.');
  const ref=db().doc('users/'+uid),lease=randomUUID(),scope=JSON.stringify(['accounts',uid,'state']),fingerprint=hash(JSON.stringify([['accounts',uid,'state'],input]));
  const claim=await db().runTransaction(async tx=>{const[doc,role,done]=await Promise.all([tx.get(ref),tx.get(db().doc('platformRoles/'+uid)),tx.get(receipt)]);if(done.exists&&done.data()?.fingerprint!==fingerprint)throw new ApiError(409,'다른 작업에 사용한 요청 번호예요.');if(done.data()?.result)return{result:done.data()!.result};if(done.exists&&Number(done.data()?.leaseUntil)>Date.now())throw new ApiError(409,'같은 작업이 진행 중이에요.');
    if(!doc.exists)throw new ApiError(404,'계정을 찾을 수 없어요.');if(!canDisableUser(ctx.role,ctx.uid,uid,role.data()?.role))throw new ApiError(403,'본인 또는 보호된 계정은 변경할 수 없어요.');
    const resuming=done.exists&&done.data()?.fingerprint===fingerprint&&doc.data()?.adminStateLease?.id===done.data()?.lease;
    if(doc.updateTime!.valueOf()!==input.version&&!resuming)throw new ApiError(409,'계정 상태가 변경됐어요. 새로 확인해 주세요.','STALE_VERSION');
    const lock=doc.data()?.adminStateLease;if(lock?.until>Date.now())throw new ApiError(409,'계정 상태를 처리 중이에요.');tx.set(receipt,{scope,fingerprint,lease,leaseUntil:Date.now()+60_000,createdAt:stamp()});tx.update(ref,{adminStateLease:{id:lease,until:Date.now()+60_000}});return{before:!!doc.data()?.disabled,student:doc.data()?.role==='student'};});
  if(claim.result)return claim.result;
  let authApplied=false;
  try{try{await auth().updateUser(uid,{disabled:input.disabled});authApplied=true;if(input.disabled)await auth().revokeRefreshTokens(uid);}catch(e){if((e as {code?:string}).code!=='auth/user-not-found'||!claim.student)throw e;}
    return await db().runTransaction(async tx=>{const[doc,role,done]=await Promise.all([tx.get(ref),tx.get(db().doc('platformRoles/'+uid)),tx.get(receipt)]);if(done.data()?.lease!==lease||doc.data()?.adminStateLease?.id!==lease)throw new ApiError(409,'진행 중인 작업을 다시 확인해 주세요.');if(!canDisableUser(ctx.role,ctx.uid,uid,role.data()?.role))throw new ApiError(409,'처리 중 권한이 변경됐어요. 상태를 다시 확인해 주세요.');
      tx.update(ref,{disabled:input.disabled,updatedAt:stamp(),adminStateLease:null});const result={ok:true,disabled:input.disabled};tx.update(receipt,{result,leaseUntil:0});tx.create(db().collection('adminAudit').doc(),{actorUid:ctx.uid,action:input.disabled?'user.disable':'user.enable',target:uid,kind:'change',outcome:'success',details:{before:{disabled:claim.before},after:{disabled:input.disabled},reason,requestId:input.requestId},createdAt:stamp()});return result;});
  }catch(e){const completed=await receipt.get();if(completed.data()?.result&&completed.data()?.fingerprint===fingerprint)return completed.data()!.result;
    await db().runTransaction(async tx=>{const[current,action]=await Promise.all([tx.get(ref),tx.get(receipt)]);if(current.data()?.adminStateLease?.id===lease)tx.update(ref,{adminStateLease:null});if(action.data()?.lease===lease)tx.update(receipt,{leaseUntil:0,error:authApplied?'AUTH_APPLIED_DATABASE_PENDING':'FAILED'});}).catch(()=>{});
    await audit(ctx,'user.state-failed',uid,{reason,code:authApplied?'AUTH_APPLIED_DATABASE_PENDING':'FAILED'},authApplied?'partial':'failed');throw new ApiError(503,authApplied?'인증 계정 상태는 변경됐지만 관리 기록을 마치지 못했어요. 새로고침 후 상태를 확인해 주세요.':'계정 상태를 변경하지 못했어요. 다시 시도해 주세요.','ACCOUNT_CHANGE_FAILED');}
}

function csvHeaders(section:string){return section==='audit'?['id','createdAt','action','actorUid','target','kind','outcome','details']:section==='accounts'?['id','name','email','role','className','number','status']:section==='storage'?['id','name','type','ownerName','className','size','status','checkedAt']:section==='jobs'?['id','name','actorName','status','createdAt','processed','total','error']:['id','name','ownerName','className','year','status','createdAt'];}
async function combineCsv(paths:string[],target:string){
  try{await bucket().combine(paths,target);}
  catch(e){if((e as {code?:number}).code!==501)throw e;
    // The Storage emulator has no compose API. Stream the same bytes with bounded memory.
    const chunks=async function*(){for(const path of paths)for await(const chunk of bucket().file(path).createReadStream())yield chunk;};
    await pipeline(Readable.from(chunks()),bucket().file(target).createWriteStream({resumable:false,metadata:{contentType:'text/csv;charset=utf-8',cacheControl:'private,no-store'}}));
  }
}

export async function handleAdminConsole(request:Request,path:string[]) {
  let actor:Context|undefined;
  try{
    if(!['GET','HEAD'].includes(request.method))assertOrigin(request);const ctx=actor=await context(request),p=new URL(request.url).searchParams;
    if(request.method!=='GET'){
      const input=await body(request);
      if(path[0]==='jobs'){if(!path[1])countCache.clear();return json(await adminJob(ctx,path,input));}
      return json(await change(ctx,path,input));
    }
    if(path[0]==='summary')return json(await overview());
    if(path[0]==='ai-usage')return json(await adminAiUsage(p));
    if(path[0]==='accounts'&&path[1])return json(await accountDetail(path[1],ctx));
    if(path[0]==='classes'&&path[1])return json(await classDetail(path[1]));
    if(path[0]==='content'&&path[1]&&path[2])return json(await contentDetail(path[1],path[2]));
    if(path[0]==='settings')return json(await settings(ctx,p));
    if(path[0]==='ai-summary')return json({...await getAiOperations(),retention:'앞으로 수집한 요청 메타데이터만 표시합니다. 본문·답안·생성 결과·청구액은 저장하지 않습니다.'});
    if(path[0]==='storage-summary')return json((await db().doc('adminSnapshots/storage').get()).data()||{checkedAt:null});
    if(path[0]==='jobs'&&path[1]){const doc=await db().doc('adminJobs/'+id(path[1])).get();if(!doc.exists)throw new ApiError(404,'작업을 찾을 수 없어요.');if(path[2]==='download'){
      const v=doc.data()!;if(v.kind!=='export'||v.status!=='done'||!v.result?.path?.startsWith('admin-exports/'+doc.id+'/'))throw new ApiError(409,'내보내기를 먼저 완료해 주세요.');
      const[url]=await bucket().file(v.result.path).getSignedUrl({action:'read',expires:Date.now()+5*60_000});await audit(ctx,'export.download',doc.id);const response=NextResponse.redirect(url);response.headers.set('Cache-Control','private,no-store');return response;
    }return json({job:{id:doc.id,...doc.data()}});}
    if(p.get('export')==='csv')throw new ApiError(400,'목록의 조건 전체 CSV 버튼으로 이어서 처리 가능한 내보내기를 시작해 주세요.');
    return json(await rows(path[0],p,ctx));
  }catch(e){
    if(actor&&!['GET','HEAD'].includes(request.method)&&path[0]!=='jobs'&&(!(e instanceof ApiError)||e.code!=='ACCOUNT_CHANGE_FAILED'))await audit(actor,'admin.attempt-failed',(path[0]==='content'?path[2]:path[1])||path[0],{type:path[0],code:e instanceof ApiError?e.code:'INTERNAL'},'failed').catch(()=>console.error('Admin failure audit unavailable'));
    if(e instanceof ApiError)return json({error:e.message,code:e.code},e.status);if(e instanceof Error&&/^INVALID_/.test(e.message))return json({error:'조회 조건을 확인해 주세요.'},400);console.error('Admin console error',(e as {code?:unknown}).code||'INTERNAL');if(process.env.FIRESTORE_EMULATOR_HOST)console.error((e as Error).stack);return json({error:'관리 작업에 실패했어요. 이 화면에서 다시 시도해 주세요.'},500);
  }
}

// Each step is bounded and persisted. Closing the browser leaves a resumable job.
async function adminJob(ctx:Context,path:string[],input:Data):Promise<Data> {return runAdminJob(ctx,path,input);}

async function runAdminJob(ctx:Context,path:string[],input:Data):Promise<Data> {
  // Implemented below with the same authorization boundary as list and mutation APIs.
  return inventoryJob(ctx,path,input);
}

async function inventoryJob(ctx:Context,path:string[],input:Data):Promise<Data> {
  if(!path[1]){
    const kind=input.kind;if(!['inventory','bulk-state','quarantine','restore','export'].includes(kind))throw new ApiError(400,'작업 종류를 확인해 주세요.');
    const key=hash(ctx.uid+':'+id(input.requestId)),ref=db().doc('adminJobs/'+key),reason=text(input.reason,'작업 사유',500);
    if(kind==='bulk-state'&&(!Array.isArray(input.accounts)||!input.accounts.length||input.accounts.length>100||typeof input.disabled!=='boolean'))throw new ApiError(400,'최대100개 계정을 선택해 주세요.');
    const payload:Data=kind==='bulk-state'?{accounts:input.accounts.map((v:Data)=>({uid:id(v.uid),version:text(v.version,'상태 버전',30)})),disabled:input.disabled}:['quarantine','restore'].includes(kind)?{assetId:id(input.assetId)}:{};
    if(kind==='bulk-state'&&new Set(payload.accounts.map((a:Data)=>a.uid)).size!==payload.accounts.length)throw new ApiError(400,'같은 계정을 중복 선택할 수 없어요.');
    if(kind==='export'){
      if(!['accounts','classes','content','storage','jobs','audit'].includes(input.section)||!input.params||typeof input.params!=='object'||Array.isArray(input.params))throw new ApiError(400,'내보낼 목록 조건을 확인해 주세요.');
      const params=new URLSearchParams();for(const[k,v]of Object.entries(input.params))if(typeof v==='string'&&v.length<2000&&!['cursor','export'].includes(k))params.set(k,v);
      const defined=await definition(input.section,params);if(input.section==='storage')params.set('scanId',defined.generation);payload.section=input.section;payload.params=Object.fromEntries(params);payload.readTime=Date.now();
    }
    const stablePayload={...payload};delete stablePayload.readTime;
    const fingerprint=hash(JSON.stringify([kind,stablePayload,reason]));
    await db().runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists){if(old.data()?.fingerprint!==fingerprint)throw new ApiError(409,'다른 작업에 사용한 요청 번호예요.');return;}tx.create(ref,{kind,name:kind==='inventory'?'저장공간 전체 조사':kind==='bulk-state'?'선택 계정 상태 변경':kind==='quarantine'?'만료 전송 파일 격리':kind==='export'?'선택 조건 전체 CSV 내보내기':'격리 파일 복원',actorUid:ctx.uid,status:'paused',createdAt:stamp(),updatedAt:stamp(),processed:0,total:kind==='bulk-state'?payload.accounts!.length:null,cursor:'',bytes:0,reason,payload,fingerprint,results:[]});});
    await audit(ctx,'job.create',key,{type:kind,reason,requestId:input.requestId});return{jobId:key};
  }
  const ref=db().doc('adminJobs/'+id(path[1]));
  if(!['pause','step','resume'].includes(input.action))throw new ApiError(400,'작업 실행 방법을 확인해 주세요.');
  if(input.action==='pause'){await db().runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists)throw new ApiError(404,'작업을 찾을 수 없어요.');if(doc.data()?.status==='done')return;tx.update(ref,{pauseRequested:true,...(doc.data()?.leaseUntil>Date.now()?{}:{status:'paused'}),updatedAt:stamp()});});return{ok:true};}
  const lease=randomUUID();
  const job:Data|null=await db().runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists)throw new ApiError(404,'작업을 찾을 수 없어요.');const v=doc.data()!;if(v.status==='done')return null;if(v.leaseUntil>Date.now())throw new ApiError(409,'이 작업은 다른 화면에서 진행 중이에요.');if(v.pauseRequested&&input.action!=='resume')return{...v,skip:true};tx.update(ref,{status:'running',lease,leaseUntil:Date.now()+120_000,pauseRequested:false,error:'',updatedAt:stamp()});return{...v,snapshotTime:doc.createTime!};});
  if(!job)return{done:true};
  if(job.skip)return{done:false,paused:true};
  try{
    let patch:Data={};
    if(job.kind==='export'){
      if(Date.now()-job.snapshotTime.toMillis()>55*60_000)throw new ApiError(409,'내보내기 기준 시각의 보존 시간이 지났어요. 원본 변경에 따른 누락을 막기 위해 새 작업으로 다시 내보내 주세요.','EXPORT_EXPIRED');
      const params=new URLSearchParams(job.payload.params);if(job.cursor)params.set('cursor',job.cursor);
      const page=await rows(job.payload.section,params,{...ctx,uid:job.actorUid},2000,false,job.snapshotTime),headers=csvHeaders(job.payload.section),part=`admin-exports/${ref.id}/part-${String(job.processed).padStart(10,'0')}.csv`;
      const content=(job.processed===0?'\ufeff'+headers.map(csvCell).join(',')+'\r\n':'')+page.items.map(row=>headers.map(k=>csvCell(typeof(row as Data)[k]==='object'?JSON.stringify((row as Data)[k]):(row as Data)[k])).join(',')).join('\r\n')+'\r\n';
      await bucket().file(part).save(content,{resumable:false,metadata:{contentType:'text/csv;charset=utf-8',cacheControl:'private,no-store'}});
      const processed=job.processed+page.items.length,parts=[...(job.parts||[]),part];patch={processed,parts,cursor:page.nextCursor||'',status:page.nextCursor?'running':'done'};
      if(!page.nextCursor){let groups:string[]=parts,level=0;while(groups.length>32){const next:string[]=[];for(let i=0;i<groups.length;i+=32){const target=`admin-exports/${ref.id}/merge-${level}-${i}.csv`;await combineCsv(groups.slice(i,i+32),target);next.push(target);}groups=next;level++;}const target=`admin-exports/${ref.id}/export.csv`;await combineCsv(groups,target);await bucket().file(target).setMetadata({contentType:'text/csv;charset=utf-8',cacheControl:'private,no-store',contentDisposition:`attachment; filename="admin-${job.payload.section}.csv"`});patch.total=processed;patch.result={path:target,rows:processed,readTime:new Date(job.payload.readTime).toISOString(),message:'작업 생성 시점의 원본 기준으로 전체 조건을 내보냈습니다.'};}
    }else if(job.kind==='inventory'){
      const[files,next]=await bucket().getFiles({autoPaginate:false,maxResults:50,...(job.cursor?{pageToken:job.cursor}:{})});
      const records:Data[]=[];
      for(let i=0;i<files.length;i+=10)records.push(...await Promise.all(files.slice(i,i+10).map(async file=>{
        const name=file.name,parts=name.split('/'),type=storageKind(name);let source:FirebaseFirestore.DocumentSnapshot|undefined,parent:Data|undefined;
        if(!parts.slice(1,3).every(p=>/^[A-Za-z0-9_-]+$/.test(p.replace(/\.webp$/,''))))return{name,type,scanId:ref.id,ownerUid:'',classId:'',size:Number(file.metadata.size||0),generation:String(file.metadata.generation||''),status:'unverified',sourcePath:'',sourceStatus:'',canQuarantine:false,checkedAt:stamp()};
        if(type==='quarantine'){
          const saved=(await db().doc('adminQuarantines/'+hash(name)).get()).data();
          if(saved)return{...saved,name,type,scanId:ref.id,size:Number(file.metadata.size||0),generation:String(file.metadata.generation||''),status:saved.status==='restored'?'recovery-copy':'quarantined',canQuarantine:false,checkedAt:stamp()};
        }
        if(type==='materials'&&parts.length===4)source=await db().doc('assignmentMaterials/'+id(parts[2])).get();
        else if(type==='homework'&&parts.length===4)source=await db().doc('uploads/'+id(parts[2])).get();
        else if(type==='exhibitions'&&parts[2])source=await db().doc('exhibitionUploads/'+id(parts[2])).get();
        else if(type==='boards'&&parts[1]&&parts[2]){const docs=await db().getAll(db().doc(`participationBoards/${id(parts[1])}`),db().doc(`participationBoards/${id(parts[1])}/uploads/${id(parts[2])}`));parent=docs[0].data();source=docs[1];}
        else if(type==='canvases'&&parts[1]&&parts[2]){const docs=await db().getAll(db().doc(`classCanvases/${id(parts[1])}`),db().doc(`classCanvases/${id(parts[1])}/canvasAssets/${id(parts[2].replace(/\.webp$/,''))}`));parent=docs[0].data();source=docs[1];}
        const v=source?.data()||{},classId=v.classId||parent?.classId||'';let ownerUid=v.ownerUid||parent?.ownerUid||'';
        if(!ownerUid&&classId)ownerUid=(await db().doc('classes/'+id(classId)).get()).data()?.ownerUid||'';
        const expired=v.status==='pending'&&millis(v.expiresAt)>0&&millis(v.expiresAt)<Date.now(),canQuarantine=type==='materials'&&expired&&!v.assignmentId&&!v.boardReferences&&millis(v.expiresAt)<Date.now()-3600_000;
        return{name,label:v.fileName||v.name||name,type,scanId:ref.id,ownerUid,classId,size:Number(file.metadata.size||0),generation:String(file.metadata.generation||''),status:expired?'expired':source?.exists?'managed':type==='quarantine'?'quarantined':'unverified',sourcePath:source?.exists?source.ref.path:'',sourceStatus:v.status||'',canQuarantine,checkedAt:stamp()};
      })));
      const batch=db().batch();for(const record of records)batch.set(db().doc('adminAssets/'+hash(ref.id+':'+record.name)),record);await batch.commit();
      const complete=!next?.pageToken,processed=job.processed+files.length,bytes=job.bytes+records.reduce((s,r)=>s+r.size,0);
      patch={processed,bytes,cursor:next?.pageToken||'',status:complete?'done':'running',total:complete?processed:null};
      if(complete)await db().doc('adminSnapshots/storage').set({scanId:ref.id,fileCount:processed,totalBytes:bytes,checkedAt:stamp(),scope:'버킷 실제 파일. 원본·가공본·참고자료·보드·캔버스 포함. 물리 경로별1회 집계. 조사 중 변경된 파일은 다음 조사에서 반영됩니다.'});
    }else if(job.kind==='bulk-state'){
      const results=[...job.results];let processed=job.processed;
      for(const person of job.payload.accounts.slice(processed,processed+10)){
        try{await changeAccount(ctx,person.uid,{disabled:job.payload.disabled,version:person.version,requestId:ref.id+'_'+person.uid},db().doc('adminActions/'+hash(ref.id+':'+person.uid)),job.reason);results.push({uid:person.uid,outcome:'success'});}catch(e){results.push({uid:person.uid,outcome:'failed',code:e instanceof ApiError?e.code:'INTERNAL',message:e instanceof ApiError?e.message:'처리 실패'});}processed++;
      }
      patch={processed,results,status:processed>=job.total?'done':'running',result:{success:results.filter(v=>v.outcome==='success').length,failed:results.filter(v=>v.outcome==='failed').length}};
    }else{
      patch={...await quarantine(ctx,job,ref.id),processed:1,total:1,status:'done'};
    }
    await db().runTransaction(async tx=>{const fresh=await tx.get(ref);if(fresh.data()?.lease!==lease)throw new ApiError(409,'작업 진행 화면을 새로 열어 주세요.');tx.update(ref,{...patch,status:patch.status==='done'?'done':fresh.data()?.pauseRequested?'paused':patch.status,leaseUntil:0,updatedAt:stamp()});if(patch.status==='done')tx.create(db().collection('adminAudit').doc(),{actorUid:ctx.uid,action:'job.complete',target:ref.id,kind:'change',outcome:'success',details:JSON.parse(JSON.stringify({type:job.kind,count:patch.processed,changed:patch.result?.success,failed:patch.result?.failed})),createdAt:stamp()});});
    if(patch.status==='done'){
      if(job.kind==='export'){
        try{const[objects]=await bucket().getFiles({prefix:`admin-exports/${ref.id}/`,autoPaginate:false,maxResults:1000});
        const temp=objects.filter(f=>f.name!==patch.result.path);for(let i=0;i<temp.length;i+=10)await Promise.allSettled(temp.slice(i,i+10).map(f=>f.delete({ignoreNotFound:true})));}catch{console.error('CSV temporary file cleanup deferred');}
      }
    }
    return{done:patch.status==='done',processed:patch.processed};
  }catch(e){await db().runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.lease===lease&&current.data()?.status!=='done')tx.update(ref,{status:'failed',leaseUntil:0,error:e instanceof ApiError?e.message:'작업을 완료하지 못했어요. 재시도하면 마지막 완료 지점부터 이어갑니다.',updatedAt:stamp()});});await audit(ctx,'job.failed',ref.id,{type:job.kind,code:e instanceof ApiError?e.code:'INTERNAL'},'failed');throw e;}
}

async function quarantine(ctx:Context,job:Data,jobId:string):Promise<Data> {
  const asset=db().doc('adminAssets/'+id(job.payload.assetId)),snapshot=await asset.get(),row=snapshot.data();
  if(!row||!row.sourcePath?.startsWith('assignmentMaterials/'))throw new ApiError(400,'만료된 미사용 숙제 참고자료만 격리·복원할 수 있어요.');
  const source=db().doc(row.sourcePath);
  if(job.kind==='restore'){
    if(!row.quarantinePath)throw new ApiError(400,'복원 가능한 격리 파일이 아니에요.');
    const record=db().doc('adminQuarantines/'+hash(row.quarantinePath)),event=db().doc('adminAudit/'+hash('storage.restore:'+jobId));
    const already=await db().runTransaction(async tx=>{
      const[current,saved]=await Promise.all([tx.get(source),tx.get(record)]);
      if(saved.data()?.restoredByJob===jobId)return true;
      if(!current.exists||current.data()?.adminQuarantineJob!==row.quarantineJob||!row.quarantineJob)throw new ApiError(409,'다른 작업에서 이미 복원했거나 원본 상태가 변경됐어요.');
      if(current.data()?.adminRestoreJobId&&current.data()?.adminRestoreJobId!==jobId)throw new ApiError(409,'먼저 시작한 복원 작업을 이어서 처리해 주세요.');
      tx.update(source,{adminRestoreJobId:jobId});return false;
    });
    if(!already){
      const original=bucket().file(row.originalPath),backup=bucket().file(row.quarantinePath);
      if(!(await original.exists())[0])await backup.copy(original,{preconditionOpts:{ifGenerationMatch:0}});
      const[[a],[b]]=await Promise.all([original.getMetadata(),backup.getMetadata()]);
      if(String(a.size)!==String(b.size)||a.crc32c!==b.crc32c)throw new ApiError(409,'원래 경로에 다른 파일이 있어요. 덮어쓰지 않고 복원을 중단했습니다.');
      await original.setMetadata({cacheControl:'private,no-store',metadata:{firebaseStorageDownloadTokens:null}});
      await db().runTransaction(async tx=>{
        const[current,saved,log]=await Promise.all([tx.get(source),tx.get(record),tx.get(event)]);
        if(saved.data()?.restoredByJob===jobId)return;
        if(current.data()?.adminRestoreJobId!==jobId||current.data()?.adminQuarantineJob!==row.quarantineJob)throw new ApiError(409,'자료 상태가 바뀌었어요. 복원 작업을 다시 확인해 주세요.');
        tx.update(source,{status:'pending',expiresAt:Timestamp.fromMillis(Date.now()+3600_000),adminQuarantineJob:null,adminRestoreJobId:null,adminQuarantinePreviousExpiresAt:null});
        tx.set(record,{status:'restored',quarantineJob:null,restoredByJob:jobId},{merge:true});
        tx.update(asset,{status:'restored',canQuarantine:false,quarantineJob:null,checkedAt:stamp()});
        if(!log.exists)tx.create(event,{actorUid:ctx.uid,action:'storage.restore',target:asset.id,kind:'change',outcome:'success',details:{reason:job.reason,jobId},createdAt:stamp()});
      });
    }
    return{result:{message:'원래 경로로 복원했습니다. 복구용 사본은 보존되며 실제 사용량에 포함됩니다.'}};
  }
  const destination=`admin-quarantine/${jobId}/file`,originalPath=row.originalPath||row.name,record=db().doc('adminQuarantines/'+hash(destination)),event=db().doc('adminAudit/'+hash('storage.quarantine:'+jobId));
  await db().runTransaction(async tx=>{
    const doc=await tx.get(source),v=doc.data();if(v?.adminQuarantineJob===jobId)return;
    if(!v||v.path!==originalPath||v.status!=='pending'||v.assignmentId||v.boardReferences||millis(v.expiresAt)>=Date.now()-3600_000)throw new ApiError(409,'사용 중이거나 아직 만료되지 않은 파일은 정리할 수 없어요.');
    tx.update(source,{status:'admin-quarantined',adminQuarantineJob:jobId,adminQuarantinePreviousExpiresAt:v.expiresAt,expiresAt:Timestamp.fromMillis(253402300799000)});
  });
  await record.set({sourcePath:row.sourcePath,originalPath,quarantinePath:destination,quarantineJob:jobId,ownerUid:row.ownerUid||'',classId:row.classId||'',createdAt:stamp()},{merge:true});
  const original=bucket().file(originalPath),backup=bucket().file(destination);
  try{
    if(!(await backup.exists())[0]){
      const[metadata]=await original.getMetadata();if(String(metadata.generation)!==row.generation)throw new ApiError(409,'파일이 변경됐어요. 다시 조사해 주세요.','FILE_CHANGED');
      await bucket().file(originalPath,{generation:metadata.generation}).copy(backup,{preconditionOpts:{ifGenerationMatch:0}});
    }
    await backup.setMetadata({cacheControl:'private,no-store',metadata:{firebaseStorageDownloadTokens:null}});
    if((await original.exists())[0])await original.delete({ifGenerationMatch:row.generation});
  }catch(error){
    if(error instanceof ApiError&&error.code==='FILE_CHANGED'||(error as {code?:number}).code===412){
      // Return the original staging record to its prior state; never delete a new generation.
      await db().runTransaction(async tx=>{const current=await tx.get(source);if(current.data()?.adminQuarantineJob!==jobId)return;tx.update(source,{status:'pending',expiresAt:current.data()?.adminQuarantinePreviousExpiresAt||Timestamp.fromMillis(Date.now()-1),adminQuarantineJob:null,adminQuarantinePreviousExpiresAt:null});tx.set(record,{status:'cancelled',quarantineJob:null},{merge:true});tx.update(asset,{status:'unverified',canQuarantine:false,checkedAt:stamp()});});
      throw new ApiError(409,'조사 이후 파일이 바뀌어 격리를 취소했습니다. 원본을 보존했으니 다시 조사해 주세요.','FILE_CHANGED');
    }
    throw error;
  }
  await db().runTransaction(async tx=>{const[current,log]=await Promise.all([tx.get(source),tx.get(event)]);if(current.data()?.adminQuarantineJob!==jobId)throw new ApiError(409,'자료 상태가 변경됐어요.');tx.update(asset,{name:destination,type:'quarantine',status:'quarantined',canQuarantine:false,originalPath,quarantinePath:destination,quarantineJob:jobId,checkedAt:stamp()});if(!log.exists)tx.create(event,{actorUid:ctx.uid,action:'storage.quarantine',target:asset.id,kind:'change',outcome:'success',details:{reason:job.reason,jobId},createdAt:stamp()});});
  return{result:{message:'만료 전송 파일을 격리했습니다. 사본과 할당량을 보존하므로 즉시 용량이 줄지는 않습니다.'}};
}
