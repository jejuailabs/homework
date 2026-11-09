/**
 * Shared read-aloud audio rules (cards and the speech studio). Pure: no server or browser imports, so the
 * same choices run in tests, on the server and in the pre-generation script.
 */
export const TTS_TEXT_LIMIT = 1000;
export const TTS_CACHE_VERSION = 'v1';
export const ttsLangs = ['ko', 'en'] as const;
export type TtsLang = (typeof ttsLangs)[number];
export const ttsVoiceKeys = ['bright', 'calm', 'warm'] as const;
export type TtsVoiceKey = (typeof ttsVoiceKeys)[number];
export const ttsFamilies = ['chirp3-hd', 'neural2'] as const;
export type TtsFamily = (typeof ttsFamilies)[number];

/** Model id recorded in aiJobs; its price lives in ai-usage.ts. */
export const ttsModelName = (family: TtsFamily) => `google-tts-${family}`;

/** Which screen asked for the audio, so the admin report can split read-aloud cost by feature. */
export const ttsSources = ['cards', 'speech', 'dictionary'] as const;
export type TtsSource = (typeof ttsSources)[number];
export const ttsSource = (value: unknown): TtsSource | undefined => ttsSources.find(source => source === value);
export const ttsToolName = (source?: TtsSource) => source ? `tts-${source}` : 'tts';
/** Dictionary narration reads whole sentences, where Chirp 3 HD sounds natural; single-word cards stay on the default. */
export const ttsFamilyFor = (source: TtsSource | undefined, family: TtsFamily): TtsFamily => source === 'dictionary' ? 'chirp3-hd' : family;

/** Same text, same audio: NFC, one space between words, no edges. */
export function normalizeTtsText(value: unknown) {
  return typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
}

/**
 * Any Hangul reads as Korean (as the device voice always did: "apple 사과" is a Korean card), otherwise English.
 * Japanese or Chinese text without Hangul has no server voice here and returns null (device voice).
 */
export function detectTtsLang(text: string): TtsLang | null {
  if (/[ㄱ-ㆎ가-힣]/.test(text)) return 'ko';
  if (/[぀-ヿ㐀-鿿]/.test(text)) return null;
  return 'en';
}
export const ttsLanguageCode = (lang: TtsLang) => lang === 'ko' ? 'ko-KR' : 'en-US';

/** Chirp 3 HD speakers by role; every one exists in ko-KR and en-US. Neural2 keeps a separate letter per locale. */
const CHIRP: Record<TtsVoiceKey, string> = {bright: 'Kore', calm: 'Achernar', warm: 'Sulafat'};
const NEURAL2: Record<TtsLang, Record<TtsVoiceKey, string>> = {ko: {bright: 'A', calm: 'B', warm: 'C'}, en: {bright: 'F', calm: 'C', warm: 'D'}};

/** Full Google voice name, e.g. ko-KR-Chirp3-HD-Kore. An override must belong to the same locale and family. */
export function ttsVoiceName(lang: TtsLang, family: TtsFamily, key: TtsVoiceKey = 'bright', override?: string) {
  const code = ttsLanguageCode(lang), prefix = family === 'chirp3-hd' ? `${code}-Chirp3-HD-` : `${code}-Neural2-`;
  const custom = override?.trim();
  if (key === 'bright' && custom && custom.startsWith(prefix) && /^[A-Za-z0-9-]{1,60}$/.test(custom)) return custom;
  return prefix + (family === 'chirp3-hd' ? CHIRP[key] : NEURAL2[lang][key]);
}

export const ttsVoiceKey = (value: unknown): TtsVoiceKey => ttsVoiceKeys.includes(value as TtsVoiceKey) ? value as TtsVoiceKey : 'bright';
export const ttsFamily = (value: unknown): TtsFamily => ttsFamilies.includes(value as TtsFamily) ? value as TtsFamily : 'neural2';
export const ttsCharacters = (text: string) => text.length;

/** What the cache key hashes: normalized text + language + voice + model, in a fixed order. */
export const ttsCacheMaterial = (text: string, lang: TtsLang, voice: string, model: string) => JSON.stringify([`tts-${TTS_CACHE_VERSION}`, text, lang, voice, model]);
export const ttsObjectPath = (hash: string) => `tts/${TTS_CACHE_VERSION}/${hash}.mp3`;

/** One text request, checked the same way everywhere. Throws a short code for the caller to turn into a message. */
export function ttsRequest(input: {text?: unknown; lang?: unknown; voice?: unknown}) {
  const text = normalizeTtsText(input.text);
  if (!text) throw new Error('TTS_TEXT_EMPTY');
  if (text.length > TTS_TEXT_LIMIT) throw new Error('TTS_TEXT_TOO_LONG');
  const lang = ttsLangs.includes(input.lang as TtsLang) ? input.lang as TtsLang : detectTtsLang(text);
  if (!lang) throw new Error('TTS_LANG_UNSUPPORTED');
  return {text, lang, voice: ttsVoiceKey(input.voice)};
}
