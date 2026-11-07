/**
 * Shared read-aloud audio: one Google Text-to-Speech call per distinct (text, language, voice, model), kept in
 * Cloud Storage and reused by every class and teacher. Storage, signing, Google, metering and the quota are
 * passed in, so the decisions here are tested without any network.
 */
import {ttsCacheMaterial, ttsCharacters, ttsLanguageCode, ttsModelName, ttsObjectPath, ttsRequest, ttsVoiceName, type TtsFamily, type TtsLang, type TtsVoiceKey} from '../tts';

export class TtsError extends Error {
  constructor(public status: number, public code: string, message: string) {super(message);}
}
export const TTS_MAX_AUDIO_BYTES = 6 * 1024 * 1024;

export type TtsConfig = {enabled: boolean; family: TtsFamily; voiceOverride: Partial<Record<TtsLang, string>>};
export type TtsSynthesis = {text: string; languageCode: string; voiceName: string; family: TtsFamily};
export type TtsMeterInfo = {model: string; fingerprint: string; characters: number};
export type TtsDeps = {
  config: TtsConfig;
  hash: (material: string) => string;
  exists: (path: string) => Promise<boolean>;
  readUrl: (path: string) => Promise<string>;
  save: (path: string, audio: Uint8Array) => Promise<void>;
  synthesize: (request: TtsSynthesis) => Promise<Uint8Array>;
  /** Wraps the one paid call: aiJobs record, characters and estimated USD. Never called on a cache hit. */
  meter: <T>(info: TtsMeterInfo, run: () => Promise<T>) => Promise<T>;
  /** Spends characters from the caller's daily allowance before a paid call; throws TtsError when it is used up. */
  spend: (characters: number) => Promise<void>;
  /** Cross-instance claim on one hash, so a class opening the same card at once pays once. True when this caller owns it. */
  claim: (hash: string) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  known: Set<string>;
  inflight: Map<string, Promise<TtsResult>>;
};
export type TtsResult = {url: string; cached: boolean; lang: TtsLang; voice: TtsVoiceKey; characters: number};

const WAIT_STEPS = 16, WAIT_MS = 500;

export function ttsPlan(config: TtsConfig, input: {text?: unknown; lang?: unknown; voice?: unknown}, hash: (material: string) => string) {
  let request;
  try {request = ttsRequest(input);}
  catch (error) {
    const code = error instanceof Error ? error.message : 'TTS_TEXT_EMPTY';
    throw new TtsError(400, code, code === 'TTS_TEXT_TOO_LONG' ? '한 번에 1,000자까지 읽어 줄 수 있어요.' : code === 'TTS_LANG_UNSUPPORTED' ? '한국어와 영어만 고음질로 읽어 줄 수 있어요.' : '읽어 줄 글을 확인해 주세요.');
  }
  const voiceName = ttsVoiceName(request.lang, config.family, request.voice, config.voiceOverride[request.lang]), model = ttsModelName(config.family);
  const key = hash(ttsCacheMaterial(request.text, request.lang, voiceName, model));
  return {...request, voiceName, model, key, path: ttsObjectPath(key), characters: ttsCharacters(request.text)};
}

export async function ttsAudio(deps: TtsDeps, input: {text?: unknown; lang?: unknown; voice?: unknown}): Promise<TtsResult> {
  if (!deps.config.enabled) throw new TtsError(503, 'TTS_DISABLED', '고음질 읽어주기가 꺼져 있어요. 기기 목소리로 읽어요.');
  const plan = ttsPlan(deps.config, input, deps.hash);
  const done = async (cached: boolean): Promise<TtsResult> => {deps.known.add(plan.path); return {url: await deps.readUrl(plan.path), cached, lang: plan.lang, voice: plan.voice, characters: plan.characters};};
  if (deps.known.has(plan.path) || await deps.exists(plan.path)) return done(true);
  const running = deps.inflight.get(plan.path);
  if (running) return {...await running, cached: true};
  const work = (async () => {
    if (!await deps.claim(plan.key)) {
      // Someone else is making this audio right now: wait for their file instead of paying twice.
      for (let step = 0; step < WAIT_STEPS; step++) {
        await deps.sleep(WAIT_MS);
        if (await deps.exists(plan.path)) return done(true);
      }
    }
    await deps.spend(plan.characters);
    const audio = await deps.meter({model: plan.model, fingerprint: plan.key, characters: plan.characters}, async () => {
      const bytes = await deps.synthesize({text: plan.text, languageCode: ttsLanguageCode(plan.lang), voiceName: plan.voiceName, family: deps.config.family});
      if (!bytes.length || bytes.length > TTS_MAX_AUDIO_BYTES) throw new TtsError(502, 'TTS_AUDIO_INVALID', '읽어 줄 목소리를 만들지 못했어요.');
      return bytes;
    });
    await deps.save(plan.path, audio);
    return done(false);
  })();
  deps.inflight.set(plan.path, work);
  try {return await work;} finally {deps.inflight.delete(plan.path);}
}

/** Google's synthesize response carries base64 MP3 in audioContent. */
export function ttsAudioContent(payload: unknown) {
  const value = payload && typeof payload === 'object' ? (payload as {audioContent?: unknown}).audioContent : undefined;
  if (typeof value !== 'string' || !value || value.length > TTS_MAX_AUDIO_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new TtsError(502, 'TTS_AUDIO_INVALID', '읽어 줄 목소리를 만들지 못했어요.');
  return Uint8Array.from(Buffer.from(value, 'base64'));
}
export const ttsSynthesizeBody = (request: TtsSynthesis) => ({input: {text: request.text}, voice: {languageCode: request.languageCode, name: request.voiceName}, audioConfig: {audioEncoding: 'MP3'}});

/** Daily character allowance, read from the environment; blank or invalid falls back to the default, 0 blocks. */
export function ttsAllowance(raw: string | undefined, fallback: number) {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 100_000_000 ? value : fallback;
}
export function ttsConfig(env: Record<string, string | undefined>): TtsConfig {
  const family = env.GOOGLE_TTS_FAMILY?.trim() === 'neural2' ? 'neural2' : 'chirp3-hd';
  return {enabled: env.GOOGLE_TTS_ENABLED === 'true', family, voiceOverride: {ko: env.GOOGLE_TTS_VOICE_KO, en: env.GOOGLE_TTS_VOICE_EN}};
}
