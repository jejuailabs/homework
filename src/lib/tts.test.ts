import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {detectTtsLang, normalizeTtsText, ttsCacheMaterial, ttsObjectPath, ttsRequest, ttsVoiceName} from './tts';
import {ttsAllowance, ttsAudio, ttsAudioContent, ttsConfig, ttsPlan, ttsSynthesizeBody, TtsError, type TtsDeps, type TtsMeterInfo} from './server/tts-core';
import {createTtsPlayer, type AudioLike} from './tts-client';
import {aiProviderUsage} from './ai-usage';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

test('language: any Hangul is Korean, Latin-only is English, Japanese/Chinese has no server voice', () => {
  assert.equal(detectTtsLang('apple'), 'en');
  assert.equal(detectTtsLang('사과'), 'ko');
  assert.equal(detectTtsLang('apple 사과'), 'ko');
  assert.equal(detectTtsLang('123'), 'en');
  assert.equal(detectTtsLang('りんご'), null);
  assert.equal(detectTtsLang('苹果'), null);
  assert.deepEqual(ttsRequest({text: ' I  like\napples ', voice: 'nope'}), {text: 'I like apples', lang: 'en', voice: 'bright'});
  assert.equal(ttsRequest({text: 'apple', lang: 'ko'}).lang, 'ko', 'an explicit language wins');
  assert.throws(() => ttsRequest({text: 'りんご'}), /TTS_LANG_UNSUPPORTED/);
  assert.throws(() => ttsRequest({text: '   '}), /TTS_TEXT_EMPTY/);
  assert.throws(() => ttsRequest({text: 'a'.repeat(1001)}), /TTS_TEXT_TOO_LONG/);
  assert.equal(ttsRequest({text: 'a'.repeat(1000)}).text.length, 1000);
});

test('voices: Chirp 3 HD by default, Neural2 by env, overrides stay in their locale and family', () => {
  assert.equal(ttsVoiceName('ko', 'chirp3-hd'), 'ko-KR-Chirp3-HD-Kore');
  assert.equal(ttsVoiceName('en', 'chirp3-hd', 'warm'), 'en-US-Chirp3-HD-Sulafat');
  assert.equal(ttsVoiceName('ko', 'neural2', 'calm'), 'ko-KR-Neural2-B');
  assert.equal(ttsVoiceName('en', 'neural2'), 'en-US-Neural2-F');
  assert.equal(ttsVoiceName('en', 'chirp3-hd', 'bright', 'en-US-Chirp3-HD-Leda'), 'en-US-Chirp3-HD-Leda');
  assert.equal(ttsVoiceName('en', 'chirp3-hd', 'bright', 'ko-KR-Chirp3-HD-Leda'), 'en-US-Chirp3-HD-Kore', 'a wrong-locale override is ignored');
  assert.deepEqual(ttsConfig({GOOGLE_TTS_ENABLED: 'true', GOOGLE_TTS_FAMILY: 'neural2'}), {enabled: true, family: 'neural2', voiceOverride: {ko: undefined, en: undefined}});
  assert.equal(ttsConfig({GOOGLE_TTS_ENABLED: '1'}).enabled, false, 'only the exact word true turns it on');
  assert.equal(ttsConfig({}).family, 'neural2', 'Neural2 is the default family');
  assert.equal(ttsConfig({GOOGLE_TTS_FAMILY: 'chirp3-hd'}).family, 'chirp3-hd');
  assert.equal(ttsConfig({GOOGLE_TTS_FAMILY: 'wavenet'}).family, 'neural2', 'unknown families fall back to the default');
});

test('cache key: normalized text + language + voice + model; whitespace and Unicode form do not split the cache', () => {
  const config = ttsConfig({GOOGLE_TTS_ENABLED: 'true', GOOGLE_TTS_FAMILY: 'chirp3-hd'});
  const a = ttsPlan(config, {text: '안녕하세요'}, sha), b = ttsPlan(config, {text: '  안녕하세요 '.normalize('NFD')}, sha);
  assert.equal(ttsPlan(ttsConfig({GOOGLE_TTS_ENABLED: 'true'}), {text: 'apple'}, sha).voiceName, 'en-US-Neural2-F', 'the default family reads with Neural2');
  assert.equal(a.key, b.key);
  assert.equal(a.key, sha(ttsCacheMaterial('안녕하세요', 'ko', 'ko-KR-Chirp3-HD-Kore', 'google-tts-chirp3-hd')));
  assert.equal(a.path, ttsObjectPath(a.key));
  assert.match(a.path, /^tts\/v1\/[0-9a-f]{64}\.mp3$/);
  assert.notEqual(ttsPlan(config, {text: '안녕하세요', voice: 'calm'}, sha).key, a.key, 'voice is part of the key');
  assert.notEqual(ttsPlan({...config, family: 'neural2'}, {text: '안녕하세요'}, sha).key, a.key, 'model is part of the key');
  assert.notEqual(ttsPlan(config, {text: 'apple', lang: 'ko'}, sha).key, ttsPlan(config, {text: 'apple'}, sha).key, 'language is part of the key');
  assert.equal(normalizeTtsText(42), '');
});

function fakeDeps(over: Partial<TtsDeps> = {}) {
  const stored = new Map<string, Uint8Array>(), calls = {synth: 0, meter: [] as TtsMeterInfo[], spent: 0, exists: 0};
  const deps: TtsDeps = {
    config: {enabled: true, family: 'chirp3-hd', voiceOverride: {}}, hash: sha, known: new Set(), inflight: new Map(),
    exists: async path => {calls.exists++; return stored.has(path);},
    readUrl: async path => `https://signed.example/${path}`,
    save: async (path, audio) => {stored.set(path, audio);},
    synthesize: async () => {calls.synth++; return new Uint8Array([1, 2, 3]);},
    meter: async (info, run) => {calls.meter.push(info); return run();},
    spend: async characters => {calls.spent += characters;},
    claim: async () => true, sleep: async () => {},
    ...over,
  };
  return {deps, stored, calls};
}

test('a cache miss pays once and is metered; the next request is a free hit, even from a fresh instance', async () => {
  const {deps, stored, calls} = fakeDeps();
  const first = await ttsAudio(deps, {text: 'apple'});
  assert.equal(first.cached, false); assert.equal(calls.synth, 1); assert.equal(calls.spent, 5);
  assert.deepEqual(calls.meter.map(item => [item.model, item.characters]), [['google-tts-chirp3-hd', 5]]);
  assert.match(first.url, /^https:\/\/signed\.example\/tts\/v1\//);
  const second = await ttsAudio(deps, {text: 'apple'});
  assert.equal(second.cached, true); assert.equal(calls.synth, 1); assert.equal(calls.meter.length, 1, 'a hit is never metered'); assert.equal(calls.spent, 5, 'a hit spends no allowance');
  const other = fakeDeps({exists: async path => stored.has(path)});
  const third = await ttsAudio(other.deps, {text: 'apple'});
  assert.equal(third.cached, true); assert.equal(other.calls.synth, 0); assert.equal(other.calls.meter.length, 0);
});

test('simultaneous requests share one call; another instance waits for the file instead of paying', async () => {
  const {deps, calls} = fakeDeps({synthesize: async () => {calls.synth++; await new Promise(resolve => setTimeout(resolve, 10)); return new Uint8Array([9]);}});
  const results = await Promise.all([ttsAudio(deps, {text: 'banana'}), ttsAudio(deps, {text: 'banana'}), ttsAudio(deps, {text: 'banana'})]);
  assert.equal(calls.synth, 1);
  assert.deepEqual(results.map(result => result.cached), [false, true, true]);
  let checks = 0;
  const waiting = fakeDeps({claim: async () => false, exists: async () => ++checks >= 3});
  const waited = await ttsAudio(waiting.deps, {text: 'cherry'});
  assert.equal(waited.cached, true); assert.equal(waiting.calls.synth, 0);
});

test('off, too long, allowance used up and provider failures never store audio', async () => {
  const off = fakeDeps({config: {enabled: false, family: 'chirp3-hd', voiceOverride: {}}});
  await assert.rejects(ttsAudio(off.deps, {text: 'apple'}), (error: TtsError) => error.code === 'TTS_DISABLED' && error.status === 503);
  assert.equal(off.calls.exists, 0, 'disabled does not even look at storage');
  const long = fakeDeps();
  await assert.rejects(ttsAudio(long.deps, {text: 'x'.repeat(1001)}), (error: TtsError) => error.status === 400 && error.code === 'TTS_TEXT_TOO_LONG');
  const broke = fakeDeps({spend: async () => {throw new TtsError(429, 'TTS_DAILY_LIMIT', 'limit');}});
  await assert.rejects(ttsAudio(broke.deps, {text: 'apple'}), /limit/);
  assert.equal(broke.calls.synth, 0); assert.equal(broke.stored.size, 0);
  const failing = fakeDeps({synthesize: async () => {throw new TtsError(503, 'TTS_NOT_ALLOWED', 'no');}});
  await assert.rejects(ttsAudio(failing.deps, {text: 'apple'}), (error: TtsError) => error.code === 'TTS_NOT_ALLOWED');
  assert.equal(failing.stored.size, 0); assert.equal(failing.calls.meter.length, 1, 'a failed paid attempt is still recorded');
  const empty = fakeDeps({synthesize: async () => new Uint8Array()});
  await assert.rejects(ttsAudio(empty.deps, {text: 'apple'}), (error: TtsError) => error.code === 'TTS_AUDIO_INVALID');
  assert.equal(empty.stored.size, 0);
});

test('Google request and response shapes', () => {
  assert.deepEqual(ttsSynthesizeBody({text: 'hi', languageCode: 'en-US', voiceName: 'en-US-Chirp3-HD-Kore', family: 'chirp3-hd'}), {input: {text: 'hi'}, voice: {languageCode: 'en-US', name: 'en-US-Chirp3-HD-Kore'}, audioConfig: {audioEncoding: 'MP3'}});
  assert.deepEqual([...ttsAudioContent({audioContent: Buffer.from([1, 2, 3]).toString('base64')})], [1, 2, 3]);
  for (const bad of [null, {}, {audioContent: ''}, {audioContent: 'not base64!'}]) assert.throws(() => ttsAudioContent(bad), TtsError);
  assert.equal(ttsAllowance(undefined, 10), 10); assert.equal(ttsAllowance('', 10), 10); assert.equal(ttsAllowance('0', 10), 0); assert.equal(ttsAllowance('-1', 10), 10); assert.equal(ttsAllowance('2.5', 10), 10);
});

test('metering prices characters: Chirp 3 HD $30 and Neural2 $16 per 1M; no text is kept', () => {
  const chirp = aiProviderUsage({}, 'google-tts-chirp3-hd', {characters: 1000});
  assert.equal(chirp.characters, 1000); assert.ok(Math.abs(chirp.estimatedUsd! - .03) < 1e-12);
  assert.ok(Math.abs(aiProviderUsage({}, 'google-tts-neural2', {characters: 1_000_000}).estimatedUsd! - 16) < 1e-9);
  assert.equal(aiProviderUsage({}, 'google-tts-chirp3-hd').estimatedUsd, null, 'no character count, no made-up cost');
  assert.equal('characters' in aiProviderUsage({}, 'gpt-6-luna'), false, 'other models keep their old record shape');
});

class FakeAudio implements AudioLike {
  static played: FakeAudio[] = [];
  static fail = false;
  src = ''; playbackRate = 1; preservesPitch = false; preload = '';
  onended: (() => void) | null = null; onerror: (() => void) | null = null;
  play() {FakeAudio.played.push(this); if (FakeAudio.fail) return Promise.reject(new Error('NotAllowedError')); queueMicrotask(() => this.onended?.()); return Promise.resolve();}
  pause() {}
}
const reply = (status: number, body: unknown) => ({ok: status >= 200 && status < 300, status, json: async () => body});

test('player: server audio at the chosen speed, memory cache, device fallback when off or failing', async () => {
  FakeAudio.played = []; FakeAudio.fail = false;
  const posts: unknown[] = [];
  const player = createTtsPlayer({post: async body => {posts.push(body); return reply(200, {url: 'https://signed.example/a.mp3'});}, createAudio: () => new FakeAudio()});
  let device = 0;
  await player.speak('apple', {rate: 0.7, fallback: () => device++});
  assert.equal(device, 0); assert.equal(FakeAudio.played.at(-1)?.src, 'https://signed.example/a.mp3'); assert.equal(FakeAudio.played.at(-1)?.playbackRate, 0.7);
  assert.deepEqual(posts, [{text: 'apple', lang: 'en', voice: 'bright'}]);
  await player.speak(' apple ', {fallback: () => device++});
  assert.equal(posts.length, 1, 'the second play reuses the remembered link');
  player.prefetch('banana'); player.prefetch('banana');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(posts.length, 2, 'prefetch asks once');
  await player.speak('りんご', {fallback: () => device++});
  assert.equal(device, 1, 'no server voice for Japanese'); assert.equal(posts.length, 2);
  FakeAudio.fail = true;
  await player.speak('apple', {fallback: () => device++});
  assert.equal(device, 2, 'a blocked or broken play falls back to the device voice');
  FakeAudio.fail = false;

  const off = createTtsPlayer({post: async () => reply(503, {code: 'TTS_DISABLED'}), createAudio: () => new FakeAudio()});
  let offDevice = 0;
  await off.speak('apple', {fallback: () => offDevice++});
  assert.equal(offDevice, 1); assert.equal(off.off, true);
  await off.speak('pear', {fallback: () => offDevice++});
  assert.equal(offDevice, 2);

  let calls = 0;
  const flaky = createTtsPlayer({post: async () => {calls++; if (calls === 1) throw new Error('offline'); return reply(200, {url: 'https://signed.example/b.mp3'});}, createAudio: () => new FakeAudio()});
  let flakyDevice = 0;
  await flaky.speak('kiwi', {fallback: () => flakyDevice++});
  assert.equal(flakyDevice, 1); assert.equal(flaky.off, false, 'a network blip does not switch the feature off');
  await flaky.speak('kiwi', {fallback: () => flakyDevice++});
  assert.equal(flakyDevice, 1); assert.equal(calls, 2, 'and the next tap tries the server again');

  const bad = createTtsPlayer({post: async () => reply(200, {url: 'javascript:alert(1)'}), createAudio: () => new FakeAudio()});
  let badDevice = 0;
  await bad.speak('apple', {fallback: () => badDevice++});
  assert.equal(badDevice, 1, 'only http(s) links are played');
});

test('player: a newer tap cancels an older one that is still waiting for its link', async () => {
  FakeAudio.played = []; FakeAudio.fail = false;
  let release!: () => void;
  const slow = new Promise<void>(resolve => {release = resolve;});
  const player = createTtsPlayer({post: async body => {if (body.text === 'slow') await slow; return reply(200, {url: `https://signed.example/${body.text}.mp3`});}, createAudio: () => new FakeAudio()});
  const first = player.speak('slow', {fallback: () => {}});
  await player.speak('fast', {fallback: () => {}});
  release(); await first;
  assert.deepEqual(FakeAudio.played.map(audio => audio.src), ['https://signed.example/fast.mp3']);
});
