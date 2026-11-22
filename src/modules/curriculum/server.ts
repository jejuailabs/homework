import 'server-only';
import {NextResponse} from 'next/server';
import {bucket, db} from '@/lib/server/admin';
import {assertOrigin, getContext, type Context} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {PlanError, curriculumAccess, curriculumAllowed, planInput, type CurriculumAccess} from './policy';
import {starterPlan} from './starter';
import {changeSummary} from './changes';
import {TableError, gridsOf} from './tables';
import {interpret} from './readers';
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
const safeSourceId = (value: string) => {if (!/^[A-Za-z0-9]{10,40}$/.test(value)) throw new ApiError(400, '자료 번호를 확인해 주세요.'); return value;};

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

/** 올린 자료: 파일은 Storage에 브라우저가 바로 올리고(Vercel을 거치지 않음), 서버는 다시 내려받아 표를 읽는다. */
export const SOURCE_ROLES = ['standards', 'calendar', 'timetable', 'events', 'assignments', 'guideline', 'progress', 'themes', 'previous'] as const;
export type SourceRole = typeof SOURCE_ROLES[number];
const SOURCE_BYTES = 20 * 1024 * 1024, SOURCE_LIMIT = 40, UPLOAD_WINDOW = 15 * 60_000;
const sourcesOf = (uid: string) => planRef(uid).collection('sources');
const sourcePath = (uid: string, id: string) => `curriculum-sources/${uid}/${id}`;
type SourceDoc = {name: string; role: SourceRole; size: number; path: string; status: 'uploading' | 'uploaded' | 'read' | 'failed'; createdAt: string; readAt?: string; error?: string; findings?: unknown};
const sourceView = (id: string, value: SourceDoc) => ({id, name: value.name, role: value.role, size: value.size, status: value.status, createdAt: value.createdAt, readAt: value.readAt ?? null, error: value.error ?? null, findings: value.findings ?? null});

async function createSource(ctx: Context, input: Record<string, unknown>) {
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '', size = typeof input.size === 'number' ? input.size : 0;
  const role = (SOURCE_ROLES as readonly unknown[]).includes(input.role) ? input.role as SourceRole : 'standards';
  if (!name) throw new ApiError(400, '파일 이름을 확인해 주세요.');
  if (!Number.isInteger(size) || size < 1 || size > SOURCE_BYTES) throw new ApiError(400, '파일은 20MB까지 올릴 수 있어요.');
  if (!/\.(xlsx|hwpx|hwp|pdf|png|jpe?g)$/i.test(name)) throw new ApiError(400, '엑셀(XLSX)·한글(HWPX/HWP)·PDF·사진 파일만 올릴 수 있어요.');
  if (!(await planRef(ctx.uid).get()).exists) throw new ApiError(404, '우리 반을 먼저 시작해 주세요.');
  if ((await sourcesOf(ctx.uid).count().get()).data().count >= SOURCE_LIMIT) throw new ApiError(400, `자료는 ${SOURCE_LIMIT}개까지 올릴 수 있어요.`);
  const ref = sourcesOf(ctx.uid).doc(), path = sourcePath(ctx.uid, ref.id);
  await ref.set({name, role, size, path, status: 'uploading', createdAt: new Date().toISOString()} satisfies SourceDoc);
  const [uploadUrl] = await bucket().file(path).getSignedUrl({version: 'v4', action: 'write', expires: Date.now() + UPLOAD_WINDOW, contentType: 'application/octet-stream', extensionHeaders: {'content-length': String(size)}});
  return {id: ref.id, uploadUrl, headers: {'Content-Type': 'application/octet-stream'}};
}

/** 올린 파일을 읽어 기준시수·시간표·학사일정 후보를 남긴다. 저장(계획 반영)은 화면의 확인 카드에서 한다. */
async function readSource(ctx: Context, id: string) {
  const ref = sourcesOf(ctx.uid).doc(id), snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, '자료를 찾을 수 없어요.');
  const value = snap.data() as SourceDoc, plan = (await stored(ctx.uid))?.plan;
  if (!plan) throw new ApiError(404, '우리 반을 먼저 시작해 주세요.');
  let bytes: Uint8Array;
  try {const [data] = await bucket().file(value.path).download(); bytes = new Uint8Array(data);}
  catch {throw new ApiError(409, '파일이 아직 다 올라가지 않았어요. 잠시 뒤 다시 눌러 주세요.');}
  if (bytes.length > SOURCE_BYTES) throw new ApiError(400, '파일은 20MB까지 읽을 수 있어요.');
  const readAt = new Date().toISOString();
  try {
    // Firestore는 undefined 값을 받지 않는다: JSON으로 한 번 걸러 빈 칸을 없앤다.
    const findings = JSON.parse(JSON.stringify(interpret(gridsOf(value.name, bytes), plan)));
    await ref.update({status: 'read', readAt, findings, error: null});
    return sourceView(id, {...value, status: 'read', readAt, findings});
  } catch (error) {
    const message = error instanceof TableError ? error.message : '파일을 읽지 못했어요. 다른 형식(엑셀·HWPX)으로 저장해 다시 올려 주세요.';
    if (!(error instanceof TableError)) console.error('Curriculum source read failed', (error as Error).name);
    await ref.update({status: 'failed', readAt, error: message});
    return sourceView(id, {...value, status: 'failed', readAt, error: message});
  }
}

async function deleteSource(ctx: Context, id: string) {
  const ref = sourcesOf(ctx.uid).doc(id), snap = await ref.get();
  if (!snap.exists) return {deleted: false};
  await bucket().file((snap.data() as SourceDoc).path).delete().catch(() => {});
  await ref.delete();
  return {deleted: true};
}

export async function listSources(uid: string) {
  const snap = await sourcesOf(uid).orderBy('createdAt', 'desc').limit(SOURCE_LIMIT).get();
  return snap.docs.map(doc => sourceView(doc.id, doc.data() as SourceDoc));
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
    if (path === 'sources' && method === 'GET') return json({sources: await listSources(ctx.uid)});
    if (path === 'sources' && method === 'POST') return json(await createSource(ctx, await body(request)), 201);
    if (segments[0] === 'sources' && segments.length === 3 && method === 'POST' && segments[2] === 'read') return json(await readSource(ctx, safeSourceId(segments[1])));
    if (segments[0] === 'sources' && segments.length === 3 && method === 'POST' && segments[2] === 'delete') return json(await deleteSource(ctx, safeSourceId(segments[1])));
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
