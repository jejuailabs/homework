import { handlePublicBoard } from '@/lib/server/participation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ token: string; segments?: string[] }> };
async function handle(request: Request, context: RouteParams) {
  const { token, segments } = await context.params;
  return handlePublicBoard(request, token, segments ?? []);
}
export const GET = handle;
export const POST = handle;
