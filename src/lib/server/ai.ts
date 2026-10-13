import 'server-only';
import {createHash, randomUUID} from 'node:crypto';
import {Timestamp} from 'firebase-admin/firestore';
import {db} from './admin';
import {assertOrigin, requireTeacher} from './auth';
import {ApiError} from './policy';
import {AI_PROMPT_VERSION, AiError, aiWindows, assertAiQuota, buildAiRequest, completedAiText, configuredLimit, providerFailure, readBoundedJson, validateAiInput, type AiInput, type AiLimits} from './ai-policy';

const PROVIDER_TIMEOUT_MS = 45_000;
const LEASE_MS = 90_000;
const CACHE_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 64;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type Draft = {text: string; model: string; cached: boolean};
const draftCache = new Map<string, {expiresAt: number; draft: Draft}>();

function configuration() {
  const limits: AiLimits = {
    teacherMinute: configuredLimit(process.env.AI_TEACHER_MINUTE_LIMIT, 4, 20),
    teacherDaily: configuredLimit(process.env.AI_TEACHER_DAILY_LIMIT, 40, 500),
    globalDaily: configuredLimit(process.env.AI_GLOBAL_DAILY_LIMIT, 400, 10000)
  };
  return {configured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna', limits};
}

function cacheGet(key: string, now: number): Draft | undefined {
  for (const [id, value] of draftCache) if (value.expiresAt <= now) draftCache.delete(id);
  const result = draftCache.get(key);
  return result ? {...result.draft, cached: true} : undefined;
}
function cachePut(key: string, draft: Draft) {
  cacheGet(key, Date.now());
  while (draftCache.size >= MAX_CACHE_ENTRIES) draftCache.delete(draftCache.keys().next().value!);
  draftCache.set(key, {expiresAt: Date.now() + CACHE_MS, draft});
}

// Transactions reserve all scopes together. No source, output or credentials enter these records.
async function reserve(uid: string, fingerprint: string, input: AiInput, model: string, limits: AiLimits) {
  const now = Date.now(), windows = aiWindows(now), actorHash = hash(uid), requestId = randomUUID();
  const lease = db().doc(`rateLimits/ai_lease_${fingerprint}`);
  const quotas = [
    {ref: db().doc(`rateLimits/ai_minute_${actorHash}_${windows.minute}`), limit: limits.teacherMinute, end: windows.minuteEnd},
    {ref: db().doc(`rateLimits/ai_teacher_${actorHash}_${windows.day}`), limit: limits.teacherDaily, end: windows.dayEnd},
    {ref: db().doc(`rateLimits/ai_global_${windows.day}`), limit: limits.globalDaily, end: windows.dayEnd}
  ];
  await db().runTransaction(async transaction => {
    const [existing, ...counters] = await Promise.all([transaction.get(lease), ...quotas.map(quota => transaction.get(quota.ref))]);
    if (existing.data()?.status === 'running' && Number(existing.data()?.leaseUntil) > now) {
      throw new AiError(409, '같은 자료의 초안을 만들고 있어요. 잠시 기다려 주세요.', 'AI_IN_PROGRESS', Math.ceil((Number(existing.data()?.leaseUntil) - now) / 1000));
    }
    const counts = counters.map(counter => counter.exists ? Number(counter.data()?.count) : 0);
    assertAiQuota(counts, quotas.map(quota => quota.limit), quotas.map(quota => Math.ceil((quota.end - now) / 1000)));
    quotas.forEach((quota, index) => transaction.set(quota.ref, {kind: 'ai-quota', count: counts[index] + 1, expiresAt: Timestamp.fromMillis(quota.end + 2 * 86_400_000)}, {merge: true}));
    transaction.set(lease, {kind: 'ai-lease', requestId, actorHash, tool: input.tool, model, status: 'running', leaseUntil: now + LEASE_MS, createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + CACHE_MS)});
  });
  return {lease, requestId};
}

async function finish(reservation: Awaited<ReturnType<typeof reserve>>, status: 'done' | 'failed', code?: string) {
  try {
    await db().runTransaction(async transaction => {
      const current = await transaction.get(reservation.lease);
      if (current.data()?.requestId !== reservation.requestId) return;
      transaction.update(reservation.lease, {status, code: code ?? null, leaseUntil: 0, completedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + CACHE_MS)});
    });
  } catch {console.error('AI request state update failed');}
}

async function callProvider(input: AiInput, model: string): Promise<string> {
  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: {'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(buildAiRequest(input, model)), signal, cache: 'no-store'
    });
    if (!response.ok) {await response.body?.cancel(); throw providerFailure(response.status);}
    let payload: unknown;
    try {payload = await readBoundedJson(response, 256 * 1024);}
    catch {if (signal.aborted) throw new AiError(504, 'AI 응답이 늦어지고 있어요. 다시 시도해 주세요.', 'AI_TIMEOUT'); throw new AiError(502, 'AI 초안을 확인할 수 없어요. 다시 시도해 주세요.', 'AI_INVALID_RESPONSE');}
    return completedAiText(payload);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal.aborted) throw new AiError(504, 'AI 응답이 늦어지고 있어요. 다시 시도해 주세요.', 'AI_TIMEOUT');
    throw new AiError(503, 'AI 서비스에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'AI_UNAVAILABLE');
  }
}

export async function generateAiDraft(request: Request): Promise<Draft> {
  assertOrigin(request);
  const context = await requireTeacher(request);
  const input = validateAiInput(await readBoundedJson(request));
  const config = configuration();
  if (!config.configured) throw new AiError(503, 'AI 연결을 준비하고 있어요. 관리자에게 알려 주세요.', 'AI_NOT_CONFIGURED');
  const fingerprint = hash(JSON.stringify([context.uid, AI_PROMPT_VERSION, config.model, input]));
  const cached = cacheGet(fingerprint, Date.now());
  if (cached) return cached;
  const reservation = await reserve(context.uid, fingerprint, input, config.model, config.limits);
  try {
    const draft: Draft = {text: await callProvider(input, config.model), model: config.model, cached: false};
    cachePut(fingerprint, draft);
    await finish(reservation, 'done');
    return draft;
  } catch (error) {
    await finish(reservation, 'failed', error instanceof ApiError ? error.code : 'AI_INTERNAL');
    throw error;
  }
}

export async function getAiOperations() {
  const config = configuration(), windows = aiWindows(Date.now());
  const counter = await db().doc(`rateLimits/ai_global_${windows.day}`).get();
  return {configured: config.configured, model: config.model, jobs: [], usage: {
    today: Number(counter.data()?.count ?? 0), globalDailyLimit: config.limits.globalDaily,
    teacherDailyLimit: config.limits.teacherDaily, teacherMinuteLimit: config.limits.teacherMinute,
    resetAt: new Date(windows.dayEnd).toISOString(), timeZone: 'Asia/Seoul'
  }};
}
