import {NextResponse} from 'next/server';
import {getContext} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {readBoundedJson} from '@/lib/server/ai-policy';
import {SpaceError} from '@/modules/my-space/policy';
import {diaryCookieName, DIARY_SESSION_MS} from '@/modules/my-space/diary-vault';
import * as diary from '@/modules/my-space/diary-server';

export const runtime = 'nodejs', dynamic = 'force-dynamic', maxDuration = 120;
const headers = {'Cache-Control': 'private,no-store', 'X-Content-Type-Options': 'nosniff'};
type RouteContext = {params: Promise<{segments?: string[]}>};
async function input(request: Request, max = 4000) {
  const value = await readBoundedJson(request, max);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, '입력 내용을 확인해 주세요.');
  return value as Record<string, any>;
}
async function handle(request: Request, {params}: RouteContext) {
  try {
    const segments = (await params).segments || [], url = new URL(request.url), method = request.method;
    if (method !== 'GET') {
      if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, '일기장 화면에서 다시 시도해 주세요.', 'ORIGIN');
      if (method !== 'DELETE' && !request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, '요청 형식을 확인해 주세요.');
    }
    const ctx = await getContext(request);
    let result: unknown, token: string | undefined, clear = false;
    const name = segments[0];
    if (name === 'status' && segments.length === 1 && method === 'GET') result = await diary.diaryStatus(request, ctx);
    else if (['setup', 'unlock', 'recover'].includes(name) && segments.length === 1 && method === 'POST') {
      const value = await input(request), opened = name === 'setup' ? await diary.setupDiary(ctx, value, request) : name === 'unlock' ? await diary.unlockDiary(ctx, value, request) : await diary.recoverDiary(ctx, value, request);
      result = opened.body; token = opened.token;
    } else if (name === 'lock' && segments.length === 1 && method === 'POST') {result = await diary.lockDiary(request, ctx); clear = true;}
    else if (name === 'pages' && segments.length === 1 && method === 'GET') result = await diary.listDiaryPages(request, ctx, url.searchParams.get('month') || '', url.searchParams.get('cursor') || '');
    else if (name === 'pages' && segments.length === 2 && method === 'PUT') result = await diary.saveDiaryPage(request, ctx, segments[1], await input(request, 600_000));
    else if (name === 'pages' && segments.length === 2 && method === 'DELETE') result = await diary.deleteDiaryPage(request, ctx, segments[1], Number(url.searchParams.get('version')));
    else if (name === 'pages' && segments.length === 3 && segments[2] === 'share' && method === 'POST') result = await diary.shareDiaryPage(request, ctx, segments[1], await input(request));
    else if (name === 'shares' && segments.length === 1 && method === 'GET') result = await diary.listDiaryShares(request, ctx, url.searchParams.get('cursor') || '');
    else if (name === 'shares' && segments.length === 2 && method === 'DELETE') result = await diary.revokeDiaryShare(request, ctx, segments[1]);
    else if (name === 'received-shares' && segments.length === 1 && method === 'GET') result = await diary.listReceivedDiaryShares(ctx, url.searchParams.get('cursor') || '');
    else if (name === 'received-shares' && segments.length === 2 && method === 'GET') result = await diary.readReceivedDiaryShare(ctx, segments[1]);
    else if (name === 'received-shares' && segments.length === 5 && segments[2] === 'assets' && method === 'GET') {
      const asset = await diary.readReceivedDiaryAsset(ctx, segments[1], segments[3], segments[4]);
      return new Response(new Uint8Array(asset.bytes), {headers: {...headers, 'Content-Type': asset.contentType}});
    }
    else if (name === 'recovery-request' && segments.length === 1 && method === 'POST') result = await diary.requestDiaryRecovery(ctx);
    else if (name === 'recovery' && segments.length === 1 && method === 'GET') result = await diary.listDiaryRecovery(ctx);
    else if (name === 'recovery' && segments.length === 2 && method === 'POST') result = await diary.issueDiaryRecovery(ctx, segments[1], await input(request));
    else if (name === 'transfer' && segments.length === 1 && method === 'POST') result = await diary.issueDiaryTransfer(request, ctx);
    else if (name === 'transfer' && segments[1] === 'claim' && segments.length === 2 && method === 'POST') {
      const opened = await diary.claimDiaryTransfer(ctx, await input(request), request); result = opened.body; token = opened.token;
    } else if (name === 'assets' && segments.length === 3 && method === 'GET') {
      const asset = await diary.readDiaryAsset(request, ctx, segments[1], segments[2]);
      return new Response(new Uint8Array(asset.bytes), {headers: {...headers, 'Content-Type': asset.contentType}});
    } else throw new ApiError(404, '일기장 기능을 찾을 수 없어요.');
    const response = NextResponse.json(result, {headers});
    if (token || clear) response.cookies.set(diaryCookieName, token || '', {httpOnly: true, secure: url.protocol === 'https:', sameSite: 'strict', path: '/api', maxAge: clear ? 0 : DIARY_SESSION_MS / 1000});
    return response;
  } catch (error) {
    const known = error instanceof ApiError || error instanceof SpaceError;
    // Never log page contents, PINs, recovery tickets or decrypted payloads.
    return NextResponse.json({error: known ? error.message : '일기장을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.', code: error instanceof ApiError ? error.code : 'DIARY_ERROR'}, {status: known ? error.status : 500, headers});
  }
}
export const GET = handle, POST = handle, PUT = handle, DELETE = handle;
