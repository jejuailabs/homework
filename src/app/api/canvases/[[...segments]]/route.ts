import {handleCanvases} from '@/lib/server/canvases';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request:Request,context:{params:Promise<{segments?:string[]}>}){return handleCanvases(request,(await context.params).segments||[]);}
export {handle as GET,handle as POST,handle as PATCH};
