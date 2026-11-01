import {handleBerry} from '@/modules/berry-panel/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type RouteContext = {params: Promise<{segments?: string[]}>};
export async function GET(request: Request, context: RouteContext) {return handleBerry(request, (await context.params).segments || []);}
export async function POST(request: Request, context: RouteContext) {return handleBerry(request, (await context.params).segments || []);}
