import { handleExhibitions } from '@/lib/server/exhibitions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type RouteParams = { params: Promise<{ segments?: string[] }> };
async function handle(request: Request, context: RouteParams) {
  return handleExhibitions(request, (await context.params).segments ?? []);
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
