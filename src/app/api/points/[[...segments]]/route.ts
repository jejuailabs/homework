import {handlePoints} from '@/lib/server/points';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = {params: Promise<{segments?: string[]}>};
export async function GET(request: Request, context: RouteContext) {return handlePoints(request, (await context.params).segments || []);}
export async function POST(request: Request, context: RouteContext) {return handlePoints(request, (await context.params).segments || []);}
