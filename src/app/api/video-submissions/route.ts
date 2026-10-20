import {requireStudent} from '@/lib/server/auth';
import {studentVideoJobs} from '@/lib/server/video-submissions';
import {ApiError} from '@/lib/server/policy';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json({videoJobs:await studentVideoJobs(await requireStudent(request))},{headers:{'Cache-Control':'private,no-store'}});}catch(error){return Response.json({error:'영상 상태를 불러오지 못했어요.'},{status:error instanceof ApiError?error.status:503});}}
