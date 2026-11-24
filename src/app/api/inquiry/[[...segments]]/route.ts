import {handleInquiry} from '@/modules/inquiry/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = {params: Promise<{segments?: string[]}>};
export async function GET(request: Request, context: RouteContext) {return handleInquiry(request, (await context.params).segments || []);}
export async function POST(request: Request, context: RouteContext) {return handleInquiry(request, (await context.params).segments || []);}
export async function PATCH(request: Request, context: RouteContext) {return handleInquiry(request, (await context.params).segments || []);}
