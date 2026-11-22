import 'server-only';
import {NextResponse} from 'next/server';
import {db} from '@/lib/server/admin';
import {getContext} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {curriculumAccess, curriculumAllowed, type CurriculumAccess} from './policy';
import {SAMPLE_PLAN} from './sample';
import type {Plan} from './engine';

/**
 * 교육과정(스쿨마스터 대체) 서버. 지금은 공개 범위 확인과 베리 도구의 자료 공급만 한다(시험용 예시 학급 하나).
 * 엑셀은 화면과 베리가 같은 files.ts로 만든다: 베리의 파일 링크는 화면을 열어 그 자리에서 내려받게 한다.
 * 실제 학급 자료(Firestore)가 들어오면 planFor와 화면의 계획 불러오기만 바꾸면 화면·베리·파일이 함께 따라온다.
 */
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const accessRef = () => db().doc('featureAccess/curriculum');

let cached: {at: number; value: CurriculumAccess} | undefined;
async function access(): Promise<CurriculumAccess> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const value = curriculumAccess((await accessRef().get()).data());
  cached = {at: Date.now(), value};
  return value;
}

/** 베리 연결에서도 같은 관문을 쓴다: 열리지 않은 선생님에게는 도구 자체가 보이지 않는다. */
export async function curriculumAvailableFor(uid: string, role: string) {
  return curriculumAllowed(await access(), uid, role, process.env.CURRICULUM_DISABLED);
}

export async function planFor(uid: string): Promise<Plan> {
  void uid;
  return SAMPLE_PLAN;
}

export async function handleCurriculum(request: Request, segments: string[]) {
  try {
    if (request.method !== 'GET') throw new ApiError(405, '지원하지 않는 요청이에요.');
    const ctx = await getContext(request), available = await curriculumAvailableFor(ctx.uid, ctx.role), path = segments.join('/');
    if (path === 'status') return json({available, sample: available});
    throw new ApiError(404, '찾을 수 없어요.');
  } catch (error) {
    if (error instanceof ApiError) return json({error: error.message}, error.status);
    console.error('Curriculum failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
