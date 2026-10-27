import {handlePlayground} from '@/modules/playground/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = {params: Promise<{segments?: string[]}>};
async function handle(request: Request, context: RouteContext) {return handlePlayground(request, (await context.params).segments || []);}
export {handle as GET, handle as POST, handle as PUT, handle as PATCH};
