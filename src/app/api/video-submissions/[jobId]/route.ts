import {handleVideoJob} from '@/lib/server/video-submissions';
export const runtime='nodejs',dynamic='force-dynamic';
type Params={params:Promise<{jobId:string}>};
export async function GET(request:Request,context:Params){return handleVideoJob(request,(await context.params).jobId);}
export async function POST(request:Request,context:Params){return handleVideoJob(request,(await context.params).jobId);}
