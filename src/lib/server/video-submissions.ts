import 'server-only';
import {randomUUID,createHash} from 'node:crypto';
import {Timestamp} from 'firebase-admin/firestore';
import {cloudAccessToken,bucket,db} from './admin';
import {assertOrigin,requireStudent,type Context} from './auth';
import {ApiError,id,text,canUseUpload} from './policy';
import {videoSelectionError,type VideoJobView} from '../video-submission';
import {assertAssignmentVisible, assignmentVisibility} from './assignment-visibility-policy';

type Data=FirebaseFirestore.DocumentData;
const now=()=>new Date().toISOString();
export function publicVideoJob(value:Data):VideoJobView {
  return {id:value.id,assignmentId:value.assignmentId,status:value.status,stage:value.stage,createdAt:value.createdAt,updatedAt:value.updatedAt,retryable:value.retryable===true||(value.status==='queued'&&value.dispatchError===true),retryVersion:value.retryVersion||0,...(value.startedAt?{startedAt:value.startedAt}:{}),...(value.finishedAt?{finishedAt:value.finishedAt}:{}),...(value.errorCode?{errorCode:value.errorCode}:{})};
}
export async function videoConfig() {
  const value=(await db().doc('runtimeConfig/videoProcessing').get()).data();
  if(!value?.enabled)return null;
  if(process.env.FIRESTORE_EMULATOR_HOST&&value.demoDispatchUrl?.startsWith('http://127.0.0.1:'))return value;
  if(!/^[a-z][a-z0-9-]+$/.test(value.projectId)||!/^https:\/\/[a-z0-9.-]+\.run\.app$/.test(value.workerUrl)||!value.invokerServiceAccount?.endsWith(`@${value.projectId}.iam.gserviceaccount.com`)||!/^[-a-z0-9]+$/.test(value.location)||!/^[-a-z0-9]+$/.test(value.queue))throw new ApiError(503,'영상 처리 연결을 확인하고 있어요.','VIDEO_NOT_CONFIGURED');
  return value;
}
async function dispatch(job:Data) {
  const config=await videoConfig();if(!config)throw new ApiError(503,'영상 처리 서버를 준비하고 있어요.','VIDEO_NOT_CONFIGURED');
  const payload={jobId:job.id,retryVersion:job.retryVersion||0};
  if(config.demoDispatchUrl&&process.env.FIRESTORE_EMULATOR_HOST){const r=await fetch(config.demoDispatchUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('DEMO_DISPATCH');return;}
  const parent=`projects/${config.projectId}/locations/${config.location}/queues/${config.queue}`;
  const response=await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`,{method:'POST',headers:{Authorization:`Bearer ${await cloudAccessToken()}`,'Content-Type':'application/json'},body:JSON.stringify({task:{name:`${parent}/tasks/video-${job.id}-${payload.retryVersion}`,dispatchDeadline:'1800s',httpRequest:{httpMethod:'POST',url:config.workerUrl+'/process',headers:{'Content-Type':'application/json'},body:Buffer.from(JSON.stringify(payload)).toString('base64'),oidcToken:{serviceAccountEmail:config.invokerServiceAccount,audience:config.workerUrl}}}}),signal:AbortSignal.timeout(15000)});
  if(!response.ok&&response.status!==409)throw new ApiError(503,'영상 전송은 끝났지만 처리 대기열 연결이 지연되고 있어요.','VIDEO_DISPATCH');
}
export async function dispatchVideoJob(job:Data) {
  try {await dispatch(job);await db().doc(`videoJobs/${job.id}`).update({dispatchError:false,lastDispatchedAt:now()});}
  catch {await db().doc(`videoJobs/${job.id}`).update({dispatchError:true});}
}
/** A daily safety net for queue outages, expired leases and retained retry sources. */
export async function cleanupVideoJobs() {
  const [pending,cleanup]=await Promise.all([db().collection('videoJobs').where('sourceRetained','==',true).get(),db().collection('videoJobs').where('originalCleanupPending','==',true).get()]);
  const candidates=[...new Map([...pending.docs,...cleanup.docs].map(doc=>[doc.id,doc])).values()].sort((a,b)=>Date.parse(a.data().createdAt)-Date.parse(b.data().createdAt)).slice(0,100);
  let expired=0,requeued=0;
  for(const record of candidates){
    const before=record.data();
    if(before.status!=='complete'&&Date.now()-Date.parse(before.createdAt)>7*86400000){
      const uploadRef=db().doc(`uploads/${record.id}`);
      const claimed=await db().runTransaction(async tx=>{const [job,upload]=await Promise.all([tx.get(record.ref),tx.get(uploadRef)]),v=job.data();if(!v||v.status==='complete'||upload.data()?.status==='submitted'||(v.status==='processing'&&Date.parse(v.leaseExpiresAt)>Date.now()))return null;tx.update(record.ref,{status:'failed',errorCode:'VIDEO_SOURCE_MISSING',retryable:false,retryVersion:(v.retryVersion||0)+1,originalCleanupPending:true,updatedAt:now()});if(upload.exists)tx.update(uploadRef,{status:'cleanup'});return v;});
      if(!claimed)continue;
      const path=`uploads/${claimed.userUid}/${record.id}/file`;if(claimed.input?.path!==path)continue;
      try{await bucket().file(path).delete({ignoreNotFound:true,ifGenerationMatch:claimed.input.generation});await Promise.all(['video.mp4','thumbnail.jpg'].map(name=>bucket().file(`processed-videos/${claimed.userUid}/${record.id}/${name}`).delete({ignoreNotFound:true})));await uploadRef.delete();await record.ref.update({originalCleanupPending:false,sourceRetained:false,stagedOutputBytes:0,originalDeletedAt:now()});expired++;}catch{console.error('Retained video cleanup deferred');}
      continue;
    }
    if(!await videoConfig())continue;
    if(Date.now()-Date.parse(before.updatedAt)<30*60000)continue;
    const job=await db().runTransaction(async tx=>{const doc=await tx.get(record.ref),v=doc.data();if(!v||(v.status==='processing'&&Date.parse(v.leaseExpiresAt)>Date.now())||(v.status==='failed'&&!v.retryable&&!v.originalCleanupPending)||(v.status==='complete'&&!v.originalCleanupPending))return null;const cleanupOnly=v.status==='complete'||(v.status==='failed'&&!v.retryable&&v.originalCleanupPending);const patch={status:cleanupOnly?v.status:'queued',stage:cleanupOnly?v.stage:'queued',retryVersion:(v.retryVersion||0)+1,updatedAt:now()};tx.update(record.ref,patch);return {...v,...patch};});
    if(job){await dispatchVideoJob(job);requeued++;}
  }
  return {expired,requeued,hasMore:candidates.length===100};
}
export async function createVideoSubmission(ctx:Context,assignment:Data,answer:string,uploadIds:string[]) {
  assertAssignmentVisible(assignment);
  if(!await videoConfig())throw new ApiError(503,'영상 처리 서버를 준비하고 있어요. 잠시 뒤 제출해 주세요.','VIDEO_NOT_CONFIGURED');
  if(uploadIds.length!==1)throw new ApiError(400,'영상은 한 개만 제출해 주세요.','VIDEO_COUNT');
  const uploadId=id(uploadIds[0]),jobRef=db().doc(`videoJobs/${uploadId}`),uploadRef=db().doc(`uploads/${uploadId}`),slot=db().doc(`videoSubmissionSlots/${assignment.id}_${ctx.studentId}`);
  const existing=await jobRef.get();
  if(existing.exists){if(existing.data()?.userUid!==ctx.uid||existing.data()?.assignmentId!==assignment.id)throw new ApiError(403,'본인의 영상만 확인할 수 있어요.');await dispatchVideoJob(existing.data()!);return publicVideoJob(existing.data()!);}
  const manifest=await uploadRef.get(),value=manifest.data();
  if(!value||!canUseUpload(ctx.uid,assignment.id,value)||value.expiresAt.toMillis()<Date.now())throw new ApiError(400,'영상을 다시 선택해 주세요.','UPLOAD_INVALID');
  const policyError=videoSelectionError([{type:value.contentType,size:value.size}]);if(policyError)throw new ApiError(400,'영상 한 개(250MB 이하)를 선택해 주세요.',policyError);
  const [metadata]=await bucket().file(value.path).getMetadata().catch(()=>{throw new ApiError(409,'영상 전송이 아직 끝나지 않았어요.','UPLOAD_INCOMPLETE');});
  if(Number(metadata.size)!==value.size||metadata.contentType!==value.contentType)throw new ApiError(400,'영상 파일 정보가 달라요.','UPLOAD_MISMATCH');
  const job=await db().runTransaction(async tx=>{
    const [fresh,upload,position,student,task,previous]=await Promise.all([tx.get(jobRef),tx.get(uploadRef),tx.get(slot),tx.get(db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`)),tx.get(db().doc(`assignments/${assignment.id}`)),tx.get(db().doc(`submissions/${assignment.id}_${ctx.studentId}`))]);
    if(fresh.exists)return fresh.data()!;
    const currentJob=position.data()?.jobId?await tx.get(db().doc(`videoJobs/${position.data()!.jobId}`)):null;
    if(currentJob?.exists&&['queued','processing'].includes(currentJob.data()!.status))throw new ApiError(409,'이미 보낸 영상을 준비하고 있어요.','VIDEO_ALREADY_PROCESSING');
    if(previous.exists&&previous.data()?.status!=='revision')throw new ApiError(409,'이미 제출한 숙제예요.','ALREADY_SUBMITTED');
    if(upload.data()?.status!=='pending'||student.data()?.disabled||student.data()?.authUid!==ctx.uid||task.data()?.classId!==ctx.classId||!task.data()?.targetStudentIds?.includes(ctx.studentId))throw new ApiError(409,'숙제와 학생 정보를 다시 확인해 주세요.','UPLOAD_INVALID');
    assertAssignmentVisible(task.data());
    const data={id:uploadId,assignmentId:assignment.id,classId:ctx.classId,studentId:ctx.studentId,userUid:ctx.uid,ownerUid:task.data()!.ownerUid,studentName:student.data()!.name,answer,attemptId:randomUUID(),fingerprint:createHash('sha256').update(JSON.stringify({answer,uploadIds})).digest('hex'),input:{path:value.path,size:value.size,contentType:value.contentType,fileName:value.fileName,generation:String(metadata.generation)},status:'queued',stage:'queued',createdAt:now(),updatedAt:now(),retryVersion:0,attempts:0,retryable:false,originalCleanupPending:false,sourceRetained:true};
    tx.create(jobRef,data);tx.set(slot,{jobId:uploadId,userUid:ctx.uid,assignmentId:assignment.id,classId:ctx.classId,studentId:ctx.studentId});tx.update(uploadRef,{status:'video-processing',videoJobId:uploadId,expiresAt:Timestamp.fromMillis(Date.now()+7*86400000)});return data;
  });
  await dispatchVideoJob(job);return publicVideoJob(job);
}
export async function studentVideoJobs(ctx:Context, visibleAssignmentIds?: Set<string>) {
  const slots=await db().collection('videoSubmissionSlots').where('userUid','==',ctx.uid).get();
  const eligibleSlots=slots.docs.filter(doc=>doc.data().classId===ctx.classId&&(!visibleAssignmentIds||visibleAssignmentIds.has(doc.data().assignmentId)));
  if(!visibleAssignmentIds){
    visibleAssignmentIds=new Set<string>();
    const ids=[...new Set(eligibleSlots.map(doc=>doc.data().assignmentId as string))];
    for(let offset=0;offset<ids.length;offset+=100){
      const tasks=await db().getAll(...ids.slice(offset,offset+100).map(taskId=>db().doc(`assignments/${id(taskId)}`)));
      tasks.forEach(task=>{if(task.exists&&task.data()?.classId===ctx.classId&&task.data()?.targetStudentIds?.includes(ctx.studentId)&&assignmentVisibility(task.data()).visibility==='visible')visibleAssignmentIds!.add(task.id);});
    }
  }
  const refs=eligibleSlots.filter(doc=>visibleAssignmentIds!.has(doc.data().assignmentId)).map(doc=>db().doc(`videoJobs/${doc.data().jobId}`));
  const records:FirebaseFirestore.DocumentSnapshot[]=[];
  for(let offset=0;offset<refs.length;offset+=100)records.push(...await db().getAll(...refs.slice(offset,offset+100)));
  return records.filter(doc=>doc.exists&&doc.data()?.userUid===ctx.uid&&doc.data()?.classId===ctx.classId).map(doc=>publicVideoJob(doc.data()!));
}
export async function handleVideoJob(request:Request,jobId:string) {
  try {
    const ctx=await requireStudent(request),ref=db().doc(`videoJobs/${id(jobId)}`),snapshot=await ref.get(),value=snapshot.data();
    if(!value||value.userUid!==ctx.uid||value.classId!==ctx.classId)throw new ApiError(404,'영상 처리 내역을 찾을 수 없어요.');
    const task=await db().doc(`assignments/${id(value.assignmentId)}`).get();
    if(!task.exists||task.data()?.classId!==ctx.classId||!task.data()?.targetStudentIds?.includes(ctx.studentId))throw new ApiError(404,'배부된 과제를 찾을 수 없어요.','NOT_FOUND');
    assertAssignmentVisible(task.data());
    if(request.method==='POST'){
      assertOrigin(request);
      const job=await db().runTransaction(async tx=>{
        const [current,freshTask]=await Promise.all([tx.get(ref),tx.get(task.ref)]),v=current.data();
        if(!v||v.userUid!==ctx.uid||v.classId!==ctx.classId||v.assignmentId!==task.id)throw new ApiError(404,'영상 처리 내역을 찾을 수 없어요.');
        if(!freshTask.exists||freshTask.data()?.classId!==ctx.classId||!freshTask.data()?.targetStudentIds?.includes(ctx.studentId))throw new ApiError(404,'배부된 과제를 찾을 수 없어요.','NOT_FOUND');
        assertAssignmentVisible(freshTask.data());
        if((v.status==='complete'&&!v.originalCleanupPending)||(v.status==='processing'&&Date.parse(v.leaseExpiresAt||'')>Date.now()))return v;
        if(v.status==='failed'&&!v.retryable)throw new ApiError(409,'다른 영상을 선택해 주세요.',v.errorCode);
        const version=(v.retryVersion||0)+1,patch={status:v.status==='complete'?'complete':'queued',stage:v.status==='complete'?'complete':'queued',retryVersion:version,retryable:false,errorCode:null,updatedAt:now(),dispatchError:false};tx.update(ref,patch);return {...v,...patch};
      });
      await dispatchVideoJob(job);
    }
    return Response.json({videoJob:publicVideoJob((await ref.get()).data()!)},{headers:{'Cache-Control':'private,no-store'}});
  }catch(error){return Response.json({error:error instanceof ApiError?error.message:'영상 상태를 확인하지 못했어요.',code:error instanceof ApiError?error.code:'VIDEO_STATUS'},{status:error instanceof ApiError?error.status:503});}
}
