import 'server-only';
import {NextResponse} from 'next/server';
import {db} from '@/lib/server/admin';
import {assertOrigin, getContext, type Context} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {PlanError, curriculumAccess, curriculumAllowed, planInput, type CurriculumAccess} from './policy';
import {starterPlan} from './starter';
import {changeSummary} from './changes';
import {SAMPLE_PLAN} from './sample';
import type {Plan} from './engine';

/**
 * 교육과정(스쿨마스터 대체) 서버. 원본은 Firestore `curriculumPlans/{uid}`(서버만 읽고 쓴다; 클라이언트 규칙에 자리가 없다).
 * 계획 하나 = 선생님 반 하나. 화면은 계획 전체를 저장하고(version으로 두 창 덮어쓰기를 막는다), 서버는 검사 후 저장하며
 * 무엇이 바뀌었는지 changes에 한 줄씩 남긴다(재구성 내역의 연료). 시수·진도·주간학습은 저장하지 않고 계산한다.
 */
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const accessRef = () => db().doc('featureAccess/curriculum');
const planRef = (uid: string) => db().doc(`curriculumPlans/${uid}`);
const MAX_BODY = 200_000;

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

type Stored = {plan: Plan; version: number; createdAt: string; updatedAt: string};
async function stored(uid: string): Promise<Stored | null> {
  const snap = await planRef(uid).get();
  return snap.exists ? snap.data() as Stored : null;
}

/** 선생님 반 계획. 아직 만들지 않았으면 시험용 예시 학급(sample: true)을 돌려준다. */
export async function planFor(uid: string): Promise<Plan> {
  return (await stored(uid))?.plan ?? SAMPLE_PLAN;
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY) throw new ApiError(413, '내용이 너무 커요.');
  try {const data = JSON.parse(raw); if (data && typeof data === 'object' && !Array.isArray(data)) return data;} catch {}
  throw new ApiError(400, '요청 내용을 확인해 주세요.');
}

async function startPlan(ctx: Context, input: Record<string, unknown>) {
  const plan = planInput(starterPlan({
    schoolName: typeof input.schoolName === 'string' ? input.schoolName : '', className: typeof input.className === 'string' ? input.className : '',
    grade: typeof input.grade === 'number' ? input.grade : 0, useSampleTimetable: input.useSampleTimetable === true,
  }));
  const now = new Date().toISOString(), ref = planRef(ctx.uid);
  await db().runTransaction(async tx => {
    if ((await tx.get(ref)).exists) throw new ApiError(409, '이미 우리 반 계획이 있어요.');
    tx.set(ref, {plan, version: 1, createdAt: now, updatedAt: now} satisfies Stored);
    tx.set(ref.collection('changes').doc(), {at: now, summary: '우리 반 시작', version: 1});
  });
  return {plan, version: 1};
}

async function savePlan(ctx: Context, input: Record<string, unknown>) {
  const plan = planInput(input.plan), version = typeof input.version === 'number' ? input.version : -1, ref = planRef(ctx.uid);
  return db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, '우리 반 계획을 먼저 만들어 주세요.');
    const current = snap.data() as Stored;
    if (current.version !== version) throw new ApiError(409, '다른 창에서 먼저 저장했어요. 새로고침해 주세요.', 'STALE_VERSION');
    const summary = changeSummary(current.plan, plan), now = new Date().toISOString(), next = current.version + 1;
    if (!summary) return {version: current.version, summary: ''};
    tx.update(ref, {plan, version: next, updatedAt: now});
    tx.set(ref.collection('changes').doc(), {at: now, summary, version: next});
    return {version: next, summary};
  });
}

export async function handleCurriculum(request: Request, segments: string[]) {
  try {
    const path = segments.join('/'), method = request.method;
    if (method !== 'GET') assertOrigin(request);
    const ctx = await getContext(request), available = await curriculumAvailableFor(ctx.uid, ctx.role);
    if (path === 'status' && method === 'GET') return json({available});
    if (!available) throw new ApiError(403, '교육과정 메뉴는 아직 열리지 않았어요.', 'CURRICULUM_NOT_ENABLED');
    if (path === 'plan' && method === 'GET') {
      const value = await stored(ctx.uid);
      return json(value ? {plan: value.plan, version: value.version, updatedAt: value.updatedAt} : {plan: null});
    }
    if (path === 'plan' && method === 'POST') return json(await startPlan(ctx, await body(request)), 201);
    if (path === 'plan' && method === 'PUT') return json(await savePlan(ctx, await body(request)));
    if (path === 'changes' && method === 'GET') {
      const snap = await planRef(ctx.uid).collection('changes').orderBy('at', 'desc').limit(30).get();
      return json({changes: snap.docs.map(doc => doc.data())});
    }
    throw new ApiError(404, '찾을 수 없어요.');
  } catch (error) {
    if (error instanceof PlanError) return json({error: error.message, code: 'INVALID_PLAN'}, 400);
    if (error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    console.error('Curriculum failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
