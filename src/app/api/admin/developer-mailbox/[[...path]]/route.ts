import {handleDeveloperMailbox} from '@/lib/server/developer-mailbox';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = {params: Promise<{path?: string[]}>};
export async function GET(request: Request, context: RouteContext) {return handleDeveloperMailbox(request, true, (await context.params).path || []);}
export async function PATCH(request: Request, context: RouteContext) {return handleDeveloperMailbox(request, true, (await context.params).path || []);}
