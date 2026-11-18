import {NextResponse} from 'next/server';
import {assertOrigin, getContext} from '@/lib/server/auth';
import {ApiError, isAdmin} from '@/lib/server/policy';
import {addTopic, blogAdminState, discardTopic, generateTopics, publishTopic, setPostStatus} from '@/modules/blog/publisher';

// Admin "검색 글 발행": a publish writes the article and its hero image in one request.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const ID = /^[A-Za-z0-9_-]{1,80}$/;

async function handle(request: Request, path: string[]) {
  try {
    const ctx = await getContext(request);
    if (!isAdmin(ctx.role)) throw new ApiError(403, '관리자만 사용할 수 있어요.', 'FORBIDDEN');
    if (request.method === 'GET') {
      if (path.length === 0 || path[0] === 'state') return json(await blogAdminState());
      throw new ApiError(404, '요청한 기능을 찾을 수 없어요.', 'NOT_FOUND');
    }
    assertOrigin(request);
    const [kind, id, action] = path;
    if (kind === 'topics' && id === 'generate' && !action) return json(await generateTopics(ctx.uid));
    if (kind === 'topics' && !id) return json(await addTopic(ctx.uid, await request.json().catch(() => ({}))));
    if (kind === 'topics' && id && ID.test(id) && action === 'publish') return json(await publishTopic(ctx.uid, id));
    if (kind === 'topics' && id && ID.test(id) && action === 'discard') return json(await discardTopic(id));
    if (kind === 'posts' && id && ID.test(id) && (action === 'unpublish' || action === 'republish')) return json(await setPostStatus(id, action === 'unpublish' ? 'unpublished' : 'published'));
    throw new ApiError(404, '요청한 기능을 찾을 수 없어요.', 'NOT_FOUND');
  } catch (error) {
    if (error instanceof ApiError) return json({error: error.message, code: error.code, ...((error as {problems?: string[]}).problems ? {problems: (error as {problems?: string[]}).problems} : {})}, error.status);
    console.error('[blog admin] failed', error instanceof Error ? error.message : error);
    return json({error: '처리하지 못했어요. 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}

type Ctx = {params: Promise<{path?: string[]}>};
export async function GET(request: Request, {params}: Ctx) {return handle(request, (await params).path ?? []);}
export async function POST(request: Request, {params}: Ctx) {return handle(request, (await params).path ?? []);}
