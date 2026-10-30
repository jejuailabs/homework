import {getContext} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {loadRegionQuestPreview} from './preview';
import {canPreviewRegionQuest} from './access';

const privateHeaders = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff'};
export async function GET(request: Request) {
  try {
    const ctx = await getContext(request);
    if (!canPreviewRegionQuest(ctx.role)) throw new ApiError(403, '관리자만 우리동네 탐험을 열 수 있어요.', 'FORBIDDEN');
    const document = await loadRegionQuestPreview();
    return new Response(document, {headers: {...privateHeaders, 'Content-Type': 'text/html; charset=utf-8'}});
  } catch (error) {
    return Response.json({error: error instanceof ApiError ? error.message : '우리동네 탐험을 열지 못했어요. 다시 시도해 주세요.'}, {
      status: error instanceof ApiError ? error.status : 500,
      headers: privateHeaders,
    });
  }
}
