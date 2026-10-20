import {mkdtemp,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {encode,hashFile,MediaError} from './media.mjs';
const now=()=>new Date().toISOString();
export async function processVideoJob({db,bucket},jobId,retryVersion=0){
 if(!/^[a-f0-9]{64}$|^[a-zA-Z0-9_-]{1,128}$/.test(jobId))throw new MediaError('VIDEO_JOB_INVALID');
 const ref=db.doc(`videoJobs/${jobId}`),token=randomUUID();
 const job=await db.runTransaction(async tx=>{const d=await tx.get(ref),v=d.data();if(!v||v.retryVersion!==retryVersion)return null;if(v.status==='complete'||(v.status==='failed'&&!v.retryable&&v.originalCleanupPending))return {...v,completed:true};if(v.status==='failed'&&!v.retryable)return null;if(v.status==='processing'&&Date.parse(v.leaseExpiresAt)>Date.now())return null;const patch={status:'processing',stage:'download',leaseToken:token,leaseExpiresAt:new Date(Date.now()+300000).toISOString(),startedAt:v.startedAt||now(),updatedAt:now(),attempts:(v.attempts||0)+1,retryable:false,errorCode:null};tx.update(ref,patch);return {...v,...patch};});
 if(!job)return;
 const safeInput=`uploads/${job.userUid}/${job.id}/file`;
 if(job.input?.path!==safeInput)throw new MediaError('VIDEO_JOB_INVALID');
 async function cleanOriginal(){try{await bucket.file(job.input.path).delete({ignoreNotFound:true,ifGenerationMatch:job.input.generation});const manifest=db.doc(`uploads/${job.id}`);if((await manifest.get()).exists)await manifest.update({originalRetainedBytes:0});await ref.update({originalCleanupPending:false,sourceRetained:false,originalDeletedAt:now()});}catch{await ref.update({originalCleanupPending:true});throw new MediaError('VIDEO_CLEANUP_FAILED',true);}}
 async function cleanFailedArtifacts(){await ref.update({originalCleanupPending:true});try{await bucket.file(job.input.path).delete({ignoreNotFound:true,ifGenerationMatch:job.input.generation});await Promise.all(['video.mp4','thumbnail.jpg'].map(name=>bucket.file(`processed-videos/${job.userUid}/${job.id}/${name}`).delete({ignoreNotFound:true})));await db.doc(`uploads/${job.id}`).delete();await ref.update({originalCleanupPending:false,sourceRetained:false,stagedOutputBytes:0,originalDeletedAt:now()});}catch{throw new MediaError('VIDEO_CLEANUP_FAILED',true);}}
 if(job.completed){if(job.status==='failed')await cleanFailedArtifacts();else if(job.originalCleanupPending)await cleanOriginal();return;}
 let temp,heartbeat,stage='download',stageStarted=Date.now();const processingStarted=stageStarted,stageTimings={};
 // Pilot cost evidence: milliseconds spent per stage of this attempt (encode dominates CPU billing).
 const markStage=next=>{if(next===stage)return;const at=Date.now();stageTimings[stage]=(stageTimings[stage]||0)+at-stageStarted;stage=next;stageStarted=at;};
 async function update(next=stage){markStage(next);await db.runTransaction(async tx=>{const d=await tx.get(ref);if(d.data()?.leaseToken!==token||d.data()?.retryVersion!==retryVersion||d.data()?.status!=='processing')throw new MediaError('VIDEO_SUPERSEDED');tx.update(ref,{stage,stageTimings,updatedAt:now(),leaseExpiresAt:new Date(Date.now()+300000).toISOString()});});}
 try{
 heartbeat=setInterval(()=>{void update().catch(()=>{});},15000);
 temp=await mkdtemp(join(tmpdir(),'homework-video-'));const input=join(temp,'source'),output=join(temp,'video.mp4'),thumb=join(temp,'thumbnail.jpg'),readback=join(temp,'stored.mp4');
 const original=bucket.file(safeInput),[metadata]=await original.getMetadata().catch(error=>{if(error.code===404)throw new MediaError('VIDEO_SOURCE_MISSING');throw error;});
 if(String(metadata.generation)!==job.input.generation||Number(metadata.size)!==job.input.size||job.input.size>250*1024**2)throw new MediaError('VIDEO_INPUT_MISMATCH');
 await original.download({destination:input,validation:'crc32c'});
 const plan=await encode(input,output,thumb,update),size=(await stat(output)).size,thumbnailBytes=(await stat(thumb)).size;
 if(!size||size>50*1024**2)throw new MediaError('VIDEO_OUTPUT_SIZE',true);
 await update('save');
 const outputPath=`processed-videos/${job.userUid}/${job.id}/video.mp4`,thumbnailPath=`processed-videos/${job.userUid}/${job.id}/thumbnail.jpg`;
 await bucket.upload(output,{destination:outputPath,resumable:false,metadata:{contentType:'video/mp4',cacheControl:'private,no-store',metadata:{videoJobId:job.id}}});
 await bucket.upload(thumb,{destination:thumbnailPath,resumable:false,metadata:{contentType:'image/jpeg',cacheControl:'private,no-store'}});
 await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.leaseToken!==token||current.data()?.retryVersion!==retryVersion)throw new MediaError('VIDEO_SUPERSEDED');tx.update(ref,{stagedOutputBytes:size+thumbnailBytes});tx.update(db.doc(`uploads/${job.id}`),{stagedOutputBytes:size+thumbnailBytes});});
 await bucket.file(outputPath).download({destination:readback,validation:'crc32c'});
 if(await hashFile(output)!==await hashFile(readback))throw new MediaError('VIDEO_VERIFY_FAILED',true);
 const [saved]=await bucket.file(outputPath).getMetadata();if(Number(saved.size)!==size||saved.contentType!=='video/mp4')throw new MediaError('VIDEO_VERIFY_FAILED',true);
 await update('submit');
 const submissionRef=db.doc(`submissions/${job.assignmentId}_${job.studentId}`),uploadRef=db.doc(`uploads/${job.id}`),slot=db.doc(`videoSubmissionSlots/${job.assignmentId}_${job.studentId}`);
 await db.runTransaction(async tx=>{
  const [fresh,old,position,assignment,pupil,user]=await Promise.all([tx.get(ref),tx.get(submissionRef),tx.get(slot),tx.get(db.doc(`assignments/${job.assignmentId}`)),tx.get(db.doc(`classes/${job.classId}/students/${job.studentId}`)),tx.get(db.doc(`users/${job.userUid}`))]);
  if(fresh.data()?.status!=='processing'||fresh.data()?.leaseToken!==token||fresh.data()?.retryVersion!==retryVersion||position.data()?.jobId!==job.id)throw new MediaError('VIDEO_SUPERSEDED');
  if(!assignment.exists||assignment.data().classId!==job.classId||!assignment.data().targetStudentIds?.includes(job.studentId)||pupil.data()?.disabled||user.data()?.disabled||pupil.data()?.authUid!==job.userUid)throw new MediaError('VIDEO_ACCESS_CHANGED');
  if(old.exists&&old.data().status!=='revision'&&old.data().fingerprint!==job.fingerprint)throw new MediaError('VIDEO_SUBMISSION_CHANGED');
  const upload={id:job.id,path:outputPath,thumbnailPath,fileName:job.input.fileName.replace(/\.[^.]+$/,'')+'.mp4',contentType:'video/mp4',size,duration:plan.duration,width:plan.width,height:plan.height,fps:plan.fps};
  const submission={id:submissionRef.id,assignmentId:job.assignmentId,classId:job.classId,studentId:job.studentId,studentName:pupil.data().name,text:job.answer,uploads:[upload],attemptId:job.attemptId,attemptNumber:(old.data()?.attemptNumber||0)+1,status:'submitted',feedback:'',submittedAt:now(),reviewedAt:null,fingerprint:job.fingerprint,rewardGranted:!!old.data()?.rewardGranted};
  tx.set(submissionRef,submission);tx.set(submissionRef.collection('attempts').doc(job.attemptId),submission);
  tx.update(db.doc(`assignments/${job.assignmentId}`),{submittedCount:FieldValue.increment(old.exists?0:1),reviewedCount:FieldValue.increment(old.exists&&old.data().status!=='submitted'?-1:0)});
  tx.update(uploadRef,{...upload,storedBytes:size+thumbnailBytes,stagedOutputBytes:0,originalRetainedBytes:job.input.size,status:'submitted',submissionId:submissionRef.id,originalPath:job.input.path,videoJobId:job.id});
  tx.set(db.doc(`uploadTransferStats/homework_${job.id}`),{ownerUid:job.ownerUid,bytes:job.input.size,storedBytes:size,month:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date()),createdAt:now(),source:'homework'});
  markStage('complete');
  tx.update(ref,{status:'complete',stage:'complete',stageTimings,processingMs:Date.now()-processingStarted,updatedAt:now(),finishedAt:now(),submissionId:submissionRef.id,originalCleanupPending:true,stagedOutputBytes:0,result:{path:outputPath,thumbnailPath,size,...plan},retryable:false,errorCode:null});
 });
 clearInterval(heartbeat);heartbeat=null;
 await cleanOriginal();
 }catch(error){
  const code=error instanceof MediaError?error.code:'VIDEO_PROCESSING_FAILED',retryable=error instanceof MediaError?error.retryable:true;
  if(code==='VIDEO_SUPERSEDED')return;
  const failedStage=stage==='complete'?'submit':stage;markStage('failed');
  await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.leaseToken!==token||current.data()?.status==='complete'||current.data()?.retryVersion!==retryVersion)return;tx.update(ref,{status:'failed',stage:failedStage,stageTimings,processingMs:Date.now()-processingStarted,errorCode:code,retryable,updatedAt:now(),failedAt:now(),leaseExpiresAt:null});});
  if(retryable)throw new MediaError(code,true);
  // An overlong/invalid source can never become a valid submission on retry.
  if(!retryable)await cleanFailedArtifacts();
 }finally{if(heartbeat)clearInterval(heartbeat);if(temp)await rm(temp,{recursive:true,force:true});}
}
