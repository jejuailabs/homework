import { handle } from '@/lib/server/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handle(request, 'students', (await context.params).id); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handle(request, 'students', (await context.params).id); }
