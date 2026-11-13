/**
 * Browser side of the shared read-aloud audio. Asks /api/tts for a signed audio link, keeps a few links in
 * memory, plays them at the chosen speed, and falls back to the device voice whenever the server audio is
 * off, refused or fails to play. Browser objects are passed in so the choices are tested in Node.
 */
import {detectTtsLang, normalizeTtsText, type TtsLang, type TtsSource, type TtsVoiceKey} from './tts';

export type AudioLike = {src: string; playbackRate: number; preservesPitch?: boolean; preload?: string; play(): Promise<void>; pause(): void; onended: (() => void) | null; onerror: (() => void) | null};
export type TtsClientEnv = {
  post: (body: {text: string; lang: TtsLang; voice: TtsVoiceKey; classId?: string; source?: TtsSource}) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;
  createAudio: () => AudioLike;
};
export type SpeakOptions = {rate?: number; lang?: TtsLang; voice?: TtsVoiceKey; classId?: string; source?: TtsSource; fallback: () => void};

const MEMORY = 80;
/** Off for the rest of this page: the server said the feature is off, not set up, or today's allowance is gone. */
const STOP_CODES = new Set(['TTS_DISABLED', 'TTS_NOT_ALLOWED', 'TTS_DAILY_LIMIT', 'UNAUTHENTICATED']);

export function createTtsPlayer(env: TtsClientEnv) {
  const links = new Map<string, {url?: string | null; pending?: Promise<string | null>}>();
  let off = false, token = 0, current: AudioLike | null = null;
  const keyOf = (text: string, lang: TtsLang, voice: TtsVoiceKey) => `${voice}|${lang}|${text}`;

  function remember(key: string, value: {url?: string | null; pending?: Promise<string | null>}) {
    links.delete(key); links.set(key, value);
    while (links.size > MEMORY) links.delete(links.keys().next().value!);
  }
  /** The signed link for this text, or null when the device voice should read it. */
  function link(raw: string, options: {lang?: TtsLang; voice?: TtsVoiceKey; classId?: string; source?: TtsSource} = {}): Promise<string | null> {
    const text = normalizeTtsText(raw);
    if (off || !text || text.length > 1000) return Promise.resolve(null);
    const lang = options.lang ?? detectTtsLang(text);
    if (!lang) return Promise.resolve(null);
    const voice = options.voice ?? 'bright', key = keyOf(text, lang, voice), known = links.get(key);
    if (known?.url) return Promise.resolve(known.url);
    if (known?.pending) return known.pending;
    const pending = (async () => {
      try {
        const response = await env.post({text, lang, voice, ...(options.classId ? {classId: options.classId} : {}), ...(options.source ? {source: options.source} : {})});
        const data = await response.json().catch(() => null) as {url?: unknown; code?: unknown} | null;
        if (response.ok && typeof data?.url === 'string' && /^(https?:|blob:)/.test(data.url)) {remember(key, {url: data.url}); return data.url;}
        if (typeof data?.code === 'string' && STOP_CODES.has(data.code)) off = true;
      } catch {}
      links.delete(key);
      return null;
    })();
    remember(key, {pending});
    return pending;
  }
  /** Looked up right away when known, so a prefetched card plays inside the tap (mobile autoplay rules). */
  function knownLink(raw: string, options: {lang?: TtsLang; voice?: TtsVoiceKey} = {}) {
    const text = normalizeTtsText(raw), lang = options.lang ?? detectTtsLang(text);
    return lang ? links.get(keyOf(text, lang, options.voice ?? 'bright'))?.url ?? null : null;
  }
  function stop() {
    token++;
    if (current) {current.onended = null; current.onerror = null; current.pause(); current = null;}
  }
  function play(url: string, rate: number, mine: number, fallback: () => void) {
    if (mine !== token) return Promise.resolve();
    const audio = env.createAudio();
    audio.preload = 'auto'; audio.src = url; audio.playbackRate = rate; audio.preservesPitch = true;
    current = audio;
    return new Promise<void>(resolve => {
      const fail = () => {if (current === audio) current = null; if (mine === token) fallback(); resolve();};
      audio.onended = () => {if (current === audio) current = null; resolve();};
      audio.onerror = fail;
      audio.play().catch(fail);
    });
  }
  /** Reads `text` once. Resolves when playback ends (or the device voice has been asked to read it). */
  async function speak(text: string, options: SpeakOptions) {
    stop();
    const mine = token, rate = Math.min(2, Math.max(0.4, options.rate ?? 1));
    const ready = knownLink(text, options);
    if (ready) return play(ready, rate, mine, options.fallback);
    const url = await link(text, options);
    if (mine !== token) return;
    if (!url) {options.fallback(); return;}
    return play(url, rate, mine, options.fallback);
  }
  /** Fetch the next card's link (and let the browser start downloading the audio) before it is needed. */
  function prefetch(text: string, options: {lang?: TtsLang; voice?: TtsVoiceKey; classId?: string; source?: TtsSource} = {}) {
    void link(text, options).then(url => {
      if (!url) return;
      try {const audio = env.createAudio(); audio.preload = 'auto'; audio.src = url;} catch {}
    });
  }
  return {speak, stop, prefetch, link, get off() {return off;}};
}

let shared: ReturnType<typeof createTtsPlayer> | null = null;
/** One player per page, so links fetched on one screen are reused on the next. */
export function ttsPlayer() {
  if (!shared) shared = createTtsPlayer({
    post: body => fetch('/api/tts', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), credentials: 'same-origin'}),
    createAudio: () => new Audio() as unknown as AudioLike,
  });
  return shared;
}

/** Device voice, as the cards always used it: language from the text (`lang`, e.g. ko-KR), the chosen speed. */
export function speakWithDevice(text: string, rate = 1, onError?: () => void, lang = /[가-힣]/.test(text) ? 'ko-KR' : 'en-US') {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang; utterance.rate = rate;
  if (onError) utterance.onerror = event => {if (event.error !== 'interrupted' && event.error !== 'canceled') onError();};
  window.speechSynthesis.speak(utterance);
}
