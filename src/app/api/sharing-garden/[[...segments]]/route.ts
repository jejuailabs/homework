import {NextResponse} from 'next/server';
import {assertOrigin, getContext, requireTeacher, type Context} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {readBoundedJson} from '@/lib/server/ai-policy';
import * as garden from '@/modules/sharing-garden/server';
export const runtime = 'nodejs', dynamic = 'force-dynamic';
const headers = {'Cache-Control': 'private,no-store'};
/** The national board is open to QR visitors; a signed-in viewer also sees their own class. */
async function optionalContext(request: Request): Promise<Context | null> {
  try { return await getContext(request); } catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
}
async function handle(request: Request, {params}: {params: Promise<{segments?: string[]}>}) {
  try {
    const s = (await params).segments || [], url = new URL(request.url);
    let result: unknown;
    if (request.method === 'GET' && !s.length) result = await garden.dashboard(await optionalContext(request), url.searchParams.get('month'));
    else if (request.method === 'PUT' && s[0] === 'classes' && s.length === 3 && s[2] === 'visibility') {
      assertOrigin(request);
      const input = await readBoundedJson(request, 2000) as Record<string, unknown> | null;
      result = await garden.setShowName(await requireTeacher(request), s[1], input?.showName);
    } else throw new ApiError(404, '나눔 꽃밭 기능을 찾을 수 없어요.');
    return NextResponse.json(result, {headers});
  } catch (error) {
    const known = error instanceof ApiError;
    if (!known) console.error('[sharing-garden]', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json({error: known ? error.message : '잠시 후 다시 시도해 주세요.', code: known ? error.code : 'SHARING_GARDEN_ERROR'}, {status: known ? error.status : 500, headers});
  }
}
export const GET = handle, PUT = handle;
