import {requireTeacher} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {loadRegionQuestPreview} from './preview';

const privateHeaders = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff'};
export async function GET(request: Request) {
  try {
    await requireTeacher(request);
    const document = await loadRegionQuestPreview();
    return new Response(document, {headers: {...privateHeaders, 'Content-Type': 'text/html; charset=utf-8'}});
  } catch (error) {
    return Response.json({error: error instanceof ApiError ? error.message : '우리동네 탐험을 열지 못했어요. 다시 시도해 주세요.'}, {
      status: error instanceof ApiError ? error.status : 500,
      headers: privateHeaders,
    });
  }
}
