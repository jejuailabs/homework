import {handleOAuth} from '@/modules/berry-connector/oauth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = {params: Promise<{segments?: string[]}>};
const handle = async (request: Request, context: RouteContext) => handleOAuth(request, (await context.params).segments || []);
export {handle as GET, handle as POST, handle as DELETE, handle as OPTIONS};
