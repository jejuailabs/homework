import 'server-only';
import {createHash} from 'node:crypto';
import {FieldValue, Timestamp} from 'firebase-admin/firestore';
import {after, NextResponse} from 'next/server';
import {bucket, cloudAccessToken, db} from './admin';
import {assertOrigin, getContext, type Context} from './auth';
import {runMeteredAi} from './ai';
import {aiWindows, readBoundedJson} from './ai-policy';
import {ApiError, id} from './policy';
import {stableReadUrl} from './signed-urls';
import {FILE_CACHE_CONTROL} from '../storage-cache';
import {aiUsageHour} from '../ai-usage';
import {ttsSource, ttsToolName, type TtsSource} from '../tts';
import {ttsAllowance, ttsAudio, ttsAudioContent, ttsConfig, ttsSynthesizeBody, TtsError, type TtsDeps, type TtsResult, type TtsSynthesis} from './tts-core';

const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const known = new Set<string>(), inflight = new Map<string, Promise<TtsResult>>();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export const googleTtsEnabled = () => ttsConfig(process.env).enabled;

/**
 * Local QA may point the call at a stub on this machine (no credentials are sent there). Anything else uses
 * Google's endpoint, so a stray setting can never hand the access token to another host.
 */
function endpoint() {
  const raw = process.env.GOOGLE_TTS_API_URL?.trim();
  if (!raw || process.env.NODE_ENV === 'production') return {url: GOOGLE_TTS_URL, local: false};
  try {const url = new URL(raw); if (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)) return {url: url.href, local: true};} catch {}
  return {url: GOOGLE_TTS_URL, local: false};
}

async function synthesize(request: TtsSynthesis) {
  const target = endpoint(), signal = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await fetch(target.url, {method: 'POST', cache: 'no-store', signal, headers: {'Content-Type': 'application/json', ...(target.local ? {} : {Authorization: `Bearer ${await cloudAccessToken()}`})}, body: JSON.stringify(ttsSynthesizeBody(request))});
  } catch {throw new TtsError(signal.aborted ? 504 : 503, signal.aborted ? 'TTS_TIMEOUT' : 'TTS_UNAVAILABLE', '읽어 줄 목소리를 만들지 못했어요. 기기 목소리로 읽어요.');}
  if (!response.ok) {
    await response.body?.cancel();
    // 403: the Text-to-Speech API is not enabled on the project or the service account lacks access.
    if (response.status === 403 || response.status === 401) throw new TtsError(503, 'TTS_NOT_ALLOWED', '고음질 읽어주기 설정을 확인하고 있어요. 기기 목소리로 읽어요.');
    if (response.status === 429) throw new TtsError(503, 'TTS_BUSY', '지금은 목소리를 만들 수 없어요. 기기 목소리로 읽어요.');
    throw new TtsError(502, 'TTS_PROVIDER', '읽어 줄 목소리를 만들지 못했어요. 기기 목소리로 읽어요.');
  }
  return ttsAudioContent(await readBoundedJson(response, 9 * 1024 * 1024));
}

/** Daily characters per person and for the whole site. Only paid (uncached) audio spends them. */
async function spend(ctx: Context, characters: number) {
  const now = Date.now(), {day, dayEnd} = aiWindows(now), student = ctx.role === 'student';
  const personal = ttsAllowance(student ? process.env.TTS_STUDENT_DAILY_CHARS : process.env.TTS_TEACHER_DAILY_CHARS, student ? 3_000 : 100_000);
  const global = ttsAllowance(process.env.TTS_GLOBAL_DAILY_CHARS, 500_000);
  const mine = db().doc(`rateLimits/tts_chars_${hash(ctx.uid)}_${day}`), all = db().doc(`rateLimits/tts_chars_global_${day}`);
  await db().runTransaction(async transaction => {
    const [a, b] = await Promise.all([transaction.get(mine), transaction.get(all)]);
    const used = [Number(a.data()?.count ?? 0), Number(b.data()?.count ?? 0)];
    if (used[0] + characters > personal || used[1] + characters > global) throw new TtsError(429, 'TTS_DAILY_LIMIT', '오늘 만들 수 있는 새 목소리를 다 썼어요. 기기 목소리로 읽어요.');
    const expiresAt = Timestamp.fromMillis(dayEnd + 2 * 86_400_000);
    transaction.set(mine, {kind: 'tts-chars', count: used[0] + characters, expiresAt}, {merge: true});
    transaction.set(all, {kind: 'tts-chars', count: used[1] + characters, expiresAt}, {merge: true});
  });
}

/** A short lease per audio hash; the second caller waits for the first one's file. */
async function claim(key: string) {
  const ref = db().doc(`rateLimits/tts_lease_${key}`), now = Date.now();
  return db().runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (current.exists && Number(current.data()?.leaseUntil) > now) return false;
    transaction.set(ref, {kind: 'tts-lease', leaseUntil: now + 20_000, expiresAt: Timestamp.fromMillis(now + 86_400_000)});
    return true;
  });
}

async function save(path: string, audio: Uint8Array) {
  try {
    await bucket().file(path).save(Buffer.from(audio), {resumable: false, contentType: 'audio/mpeg', metadata: {cacheControl: FILE_CACHE_CONTROL}, preconditionOpts: {ifGenerationMatch: 0}});
  } catch (error) {
    // 412: another request stored the same audio first. Same text and voice, so either copy is fine.
    if ((error as {code?: unknown})?.code !== 412) throw error;
  }
}

// Per-instance burst guard for every request, cached or not. It costs nothing and stops a stuck loop.
const bursts = new Map<string, number[]>();
function assertBurst(uid: string, now = Date.now()) {
  const recent = (bursts.get(uid) ?? []).filter(time => time > now - 60_000);
  if (recent.length >= 120) throw new TtsError(429, 'TTS_RATE', '조금 천천히 눌러 주세요.');
  recent.push(now); bursts.set(uid, recent);
  if (bursts.size > 5000) bursts.clear();
}

/** One counter per person, hour and feature. A student's class is kept so the report can reach their teacher. */
async function recordReuse(ctx: Context, tool: string, info: {model: string; characters: number}) {
  const hour = aiUsageHour(new Date());
  await db().doc(`aiUsageHits/${hour}_${tool}_${hash(ctx.uid)}`).set({uid: ctx.uid, classId: ctx.role === 'student' ? ctx.classId ?? '' : '', tool, model: info.model, hour, hits: FieldValue.increment(1), characters: FieldValue.increment(info.characters), updatedAt: new Date().toISOString()}, {merge: true});
}

export function ttsDeps(ctx: Context, requestedClass?: string, source?: TtsSource): TtsDeps {
  const tool = ttsToolName(source);
  return {
    config: ttsConfig(process.env), hash, sleep, known, inflight, save, synthesize,
    exists: async path => (await bucket().file(path).exists())[0],
    readUrl: path => stableReadUrl(path),
    spend: characters => spend(ctx, characters),
    // Runs after the response so a free replay never waits on a database write.
    reused: info => after(() => recordReuse(ctx, tool, info).catch(() => console.error('TTS reuse record failed'))),
    claim,
    meter: (info, run) => runMeteredAi(ctx.uid, tool, info.model, info.fingerprint, async observe => {
      const result = await run();
      observe({}, {characters: info.characters});
      return result;
    }, ctx.role === 'student' ? undefined : requestedClass, {provider: 'google', ...(ctx.role === 'student' ? {trustedClassId: ctx.classId ?? ''} : {})}),
  };
}

/**
 * POST /api/tts {text, lang?, voice?, classId?} → {url, cached}. Any signed-in teacher or student: the audio is
 * only the spoken form of the text they sent, so there is nothing to protect beyond cost, which the length cap,
 * the burst guard and the daily character allowance bound. The URL is a signed Cloud Storage read link.
 */
export async function handleTts(request: Request) {
  const headers = {'Cache-Control': 'private, no-store'};
  try {
    if (request.method !== 'POST') throw new ApiError(405, '지원하지 않는 요청이에요.');
    assertOrigin(request);
    const ctx = await getContext(request);
    assertBurst(ctx.uid);
    const input = await readBoundedJson(request, 8_000);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, '입력을 확인해 주세요.');
    const body = input as Record<string, unknown>;
    const classId = typeof body.classId === 'string' && body.classId ? id(body.classId) : undefined;
    const result = await ttsAudio(ttsDeps(ctx, classId, ttsSource(body.source)), body);
    return NextResponse.json({url: result.url, cached: result.cached, lang: result.lang}, {headers});
  } catch (error) {
    if (error instanceof TtsError || error instanceof ApiError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status, headers});
    console.error('TTS request failed', 'INTERNAL_ERROR');
    return NextResponse.json({error: '읽어 줄 목소리를 만들지 못했어요.', code: 'INTERNAL_ERROR'}, {status: 500, headers});
  }
}
