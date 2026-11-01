import {handleWorkspace} from '@/modules/teacher-workspace/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = {params: Promise<{segments?: string[]}>};
export async function GET(request: Request, context: RouteContext) {return handleWorkspace(request, (await context.params).segments || []);}
export async function POST(request: Request, context: RouteContext) {return handleWorkspace(request, (await context.params).segments || []);}
export async function DELETE(request: Request, context: RouteContext) {return handleWorkspace(request, (await context.params).segments || []);}
