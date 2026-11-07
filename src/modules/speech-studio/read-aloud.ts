'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {cacheVoice, cachedVoice} from './store';
import type {ReaderVoice} from './policy';
import {ttsPlayer} from '@/lib/tts-client';

/** listen: read on. echo: read one sentence, wait for the child to repeat it. turns: AI and child take turns. */
export type ReadMode = 'listen' | 'echo' | 'turns';
export const readModeName: Record<ReadMode, string> = {listen: '혼자 듣기', echo: '한 문장씩 따라 읽기', turns: '번갈아 읽기'};
export type VoiceSource = 'device' | 'ai';
/** Where AI voices come from: the shared Google audio (default) or the legacy OpenAI route (until 2027-01-06). */
export type VoiceProvider = 'google' | 'openai';

// Google audio is made once at normal speed and sped up on the device, so its key has no speed.
const sentenceKey = (text: string, voice: ReaderVoice, speed: number, provider: VoiceProvider) => {
  let h = 2166136261;
  for (const ch of provider === 'google' ? `g|${voice}|${text}` : `${voice}|${speed}|${text}`) {h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619);}
  return (h >>> 0).toString(36) + text.length.toString(36);
};
export const deviceVoiceAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
function koreanVoice() {
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('ko'));
  return voices.find(v => v.localService) ?? voices[0] ?? null;
}

/**
 * Reads a page sentence by sentence and reports which sentence is being read. `waiting` is the
 * sentence the child should read now (echo and turns modes); `next()` moves on.
 */
export function useReadAloud(options: {scope: string; bookId: string; classId: string; source: VoiceSource; provider: VoiceProvider; voice: ReaderVoice; speed: number; mode: ReadMode}) {
  const [active, setActive] = useState(-1), [waiting, setWaiting] = useState(-1), [playing, setPlaying] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const run = useRef(0), audio = useRef<HTMLAudioElement | null>(null), list = useRef<string[]>([]), opts = useRef(options);
  opts.current = options;

  const halt = useCallback(() => {
    run.current++;
    if (deviceVoiceAvailable()) window.speechSynthesis.cancel();
    if (audio.current) {audio.current.pause(); if (audio.current.src.startsWith('blob:')) URL.revokeObjectURL(audio.current.src); audio.current = null;}
    setPlaying(false); setLoading(false); setActive(-1); setWaiting(-1);
  }, []);
  useEffect(() => halt, [halt]);

  const speakDevice = (text: string, token: number) => new Promise<void>((resolve, reject) => {
    if (!deviceVoiceAvailable()) {reject(new Error('이 브라우저에는 읽어 주는 목소리가 없어요.')); return;}
    const utterance = new SpeechSynthesisUtterance(text), voice = koreanVoice();
    utterance.lang = 'ko-KR'; utterance.rate = opts.current.speed; if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = event => event.error === 'interrupted' || event.error === 'canceled' || run.current !== token ? resolve() : reject(new Error('읽어 주기가 멈췄어요. 다시 눌러 주세요.'));
    window.speechSynthesis.speak(utterance);
  });
  /** Shared Google audio: a signed link from /api/tts, kept as a blob on this device when the bucket allows reading it here. */
  const googleAudio = async (text: string): Promise<Blob | string | null> => {
    const {classId, voice} = opts.current;
    setLoading(true);
    const url = await ttsPlayer().link(text, {voice, ...(classId ? {classId} : {})}).finally(() => setLoading(false));
    if (!url) return null;
    try {const response = await fetch(url); if (response.ok) return await response.blob();} catch {}
    return url;
  };
  const speakAi = async (text: string, token: number) => {
    const {scope, bookId, classId, voice, speed, provider} = opts.current, cacheKey = sentenceKey(text, voice, speed, provider);
    let blob: Blob | string | null = await cachedVoice(scope, bookId, cacheKey).catch(() => null);
    if (!blob && provider === 'google') {
      blob = await googleAudio(text);
      // Off, refused or failed: this sentence is read by the device voice, as before AI voices existed.
      if (!blob) {if (deviceVoiceAvailable()) return speakDevice(text, token); throw new Error('AI 목소리를 만들지 못했어요.');}
      if (blob instanceof Blob) await cacheVoice(scope, bookId, cacheKey, blob).catch(() => undefined);
    }
    if (!blob) {
      setLoading(true);
      const response = await fetch('/api/speech-studio/voice', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, voice, speed, ...(classId ? {classId} : {})})});
      setLoading(false);
      if (!response.ok) {const data = await response.json().catch(() => null); throw new Error(data?.error || 'AI 목소리를 만들지 못했어요.');}
      blob = await response.blob();
      await cacheVoice(scope, bookId, cacheKey, blob).catch(() => undefined);
    }
    if (run.current !== token) return;
    const element = new Audio(typeof blob === 'string' ? blob : URL.createObjectURL(blob));
    if (provider === 'google') {element.playbackRate = speed; element.preservesPitch = true;}
    audio.current = element;
    await new Promise<void>((resolve, reject) => {
      element.onended = () => resolve();
      element.onerror = () => reject(new Error('목소리를 재생하지 못했어요.'));
      element.play().catch(reject);
    });
    if (element.src.startsWith('blob:')) URL.revokeObjectURL(element.src);
  };

  const playFrom = useCallback(async (index: number) => {
    const token = ++run.current, {mode} = opts.current;
    if (deviceVoiceAvailable()) window.speechSynthesis.cancel();
    setError(''); setPlaying(true); setWaiting(-1);
    try {
      for (let i = index; i < list.current.length; i++) {
        if (run.current !== token) return;
        // In turns mode the child reads every second sentence.
        if (mode === 'turns' && i % 2 === 1) {setActive(-1); setWaiting(i); setPlaying(false); return;}
        setActive(i);
        await (opts.current.source === 'ai' ? speakAi(list.current[i], token) : speakDevice(list.current[i], token));
        if (run.current !== token) return;
        if (mode === 'echo') {setActive(-1); setWaiting(i); setPlaying(false); return;}
      }
      setActive(-1); setPlaying(false);
    } catch (reason) {
      if (run.current === token) {setError(reason instanceof Error ? reason.message : '읽어 주지 못했어요.'); setActive(-1); setPlaying(false); setLoading(false);}
    }
    // speakAi/speakDevice read the latest options through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback((sentences: string[], from = 0) => {list.current = sentences; void playFrom(from);}, [playFrom]);
  const next = useCallback(() => {if (waiting >= 0) void playFrom(waiting + 1);}, [playFrom, waiting]);
  return {active, waiting, playing, loading, error, play, next, stop: halt};
}
