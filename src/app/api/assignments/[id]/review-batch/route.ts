import { handle } from '@/lib/server/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handle(request, 'review-batch', (await context.params).id); }
