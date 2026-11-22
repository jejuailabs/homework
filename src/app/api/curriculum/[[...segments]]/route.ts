import {handleCurriculum} from '@/modules/curriculum/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = {params: Promise<{segments?: string[]}>};
const handle = async (request: Request, context: RouteContext) => handleCurriculum(request, (await context.params).segments || []);
export const GET = handle;
export const POST = handle;
export const PUT = handle;
