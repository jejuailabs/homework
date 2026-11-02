import {after} from 'next/server';
import {requireStudent} from '@/lib/server/auth';
import {studentVideoJobs} from '@/lib/server/video-submissions';
import {syncSubmission} from '@/lib/server/homework-sync';
import {ApiError} from '@/lib/server/policy';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(request:Request){try{const ctx=await requireStudent(request),videoJobs=await studentVideoJobs(ctx);
  // A finished video reaches linked exhibitions and boards the moment the student's screen sees it complete; syncSubmission skips anything already done.
  const done=videoJobs.filter(job=>job.status==='complete');if(done.length)after(async()=>{for(const job of done)await syncSubmission(job.assignmentId,ctx.studentId!);});
  return Response.json({videoJobs},{headers:{'Cache-Control':'private,no-store'}});}catch(error){return Response.json({error:'영상 상태를 불러오지 못했어요.'},{status:error instanceof ApiError?error.status:503});}}
