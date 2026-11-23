import {handleAttachments} from '@/modules/attachments/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Reading a photo, a PDF or a recording waits on the model; the file itself never passes through this route.
export const maxDuration = 120;
type RouteContext = {params: Promise<{segments?: string[]}>};
export async function GET(request: Request, context: RouteContext) {return handleAttachments(request, (await context.params).segments || []);}
export async function POST(request: Request, context: RouteContext) {return handleAttachments(request, (await context.params).segments || []);}
