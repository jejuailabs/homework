import {handleLearningLinks} from '@/lib/server/learning-links';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request:Request,context:{params:Promise<{segments:string[]}>}){return handleLearningLinks(request,(await context.params).segments);}
export {handle as GET,handle as POST,handle as PATCH};
