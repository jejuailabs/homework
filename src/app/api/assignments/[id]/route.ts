import { handle } from '@/lib/server/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handle(request, 'assignment', (await context.params).id); }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handle(request, 'assignment', (await context.params).id); }
