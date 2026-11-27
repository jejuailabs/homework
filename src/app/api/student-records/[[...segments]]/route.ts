import { NextResponse } from 'next/server';
import { ApiError, id } from '@/lib/server/policy';
import { requireTeacher } from '@/lib/server/auth';
import { classList, studentRecords } from '@/modules/student-records/server';
import { RecordInputError } from '@/modules/student-records/policy';
import { workspaceOpenFor } from '@/modules/teacher-workspace/server';

/** 학생별 모아 보기. Teachers only, read-only. */
export const runtime = 'nodejs', dynamic = 'force-dynamic', maxDuration = 60;
const headers = {'Cache-Control': 'private,no-store'};
export async function GET(request: Request, context: {params: Promise<{segments?: string[]}>}) {
  try {
    const {segments: s = []} = await context.params;
    if (s.length > 1) throw new ApiError(404, '찾을 수 없어요.');
    const ctx = await requireTeacher(request);
    // 학생별 기록 sits under 업무 공간, so it opens to the same teachers.
    if (!workspaceOpenFor(ctx)) throw new ApiError(403, '아직 준비 중인 기능이에요.', 'WORKSPACE_DISABLED');
    const value = s.length ? await studentRecords(request, id(s[0], '학급'), new URL(request.url).searchParams) : {classes: await classList(ctx)};
    return NextResponse.json(value, {headers});
  } catch (e) {
    const known = e instanceof ApiError || e instanceof RecordInputError;
    if (!known) console.error('[student-records]', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({error: known ? (e as Error).message : '기록을 불러오지 못했어요.'}, {status: e instanceof ApiError ? e.status : e instanceof RecordInputError ? 400 : 500, headers});
  }
}
