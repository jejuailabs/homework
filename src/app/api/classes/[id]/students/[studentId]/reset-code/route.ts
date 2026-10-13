import { handle } from '@/lib/server/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string; studentId: string }> }) {
  const params = await context.params;
  return handle(request, 'reset-code', params.id, params.studentId);
}
