import {requireTeacher} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {loadLearningKingPreview} from '@/modules/learning-king/server/preview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff'};

export async function GET(request: Request) {
  try {
    // Includes teacher, admin, and superadmin; never expose source before this check.
    await requireTeacher(request);
    const document = await loadLearningKingPreview();
    return new Response(document, {headers: {...privateHeaders, 'Content-Type': 'text/html; charset=utf-8'}});
  } catch (error) {
    return Response.json({error: error instanceof ApiError ? error.message : '학습왕 베타를 열지 못했어요. 다시 시도해 주세요.'}, {
      status: error instanceof ApiError ? error.status : 500,
      headers: privateHeaders,
    });
  }
}
