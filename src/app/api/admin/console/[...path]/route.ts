import {handleAdminConsole} from '@/lib/server/admin-console';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}) {return handleAdminConsole(request,(await params).path);}
export const POST=GET;
export const PATCH=GET;
