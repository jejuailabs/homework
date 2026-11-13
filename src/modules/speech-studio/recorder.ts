'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {pcmWav} from '../voice-caption/wav';
import {SPEECH_MAX_SECONDS, SPEECH_RATE_HZ} from './policy';

/** Why the microphone could not start, each with its own fix for the teacher to follow. */
export type MicProblem = 'blocked' | 'busy' | 'missing' | 'in-app' | 'unsupported' | 'insecure';
export const micProblemText: Record<MicProblem, {title: string; steps: string[]}> = {
  blocked: {title: '이 사이트의 마이크가 차단되어 있어요', steps: [
    '크롬(안드로이드·PC): 주소창 왼쪽 아이콘 → 권한(사이트 설정) → 마이크 → 허용',
    '사파리(아이폰·아이패드): 주소창의 "가가" 또는 설정 아이콘 → 웹 사이트 설정 → 마이크 → 허용',
    '그래도 안 되면 기기 설정 → 앱 → 브라우저(Chrome·Safari) → 권한 → 마이크를 켜 주세요.',
    '허용으로 바꾸면 이 화면이 알아차리고 다시 시도할 수 있어요.',
  ]},
  busy: {title: '다른 앱이 마이크를 쓰고 있어요', steps: ['통화·녹음·화상 수업 앱을 닫거나 다른 탭의 녹음을 멈춘 뒤 다시 눌러 주세요.']},
  missing: {title: '마이크를 찾지 못했어요', steps: ['마이크나 이어폰을 연결한 뒤 다시 눌러 주세요.']},
  'in-app': {title: '앱 안의 브라우저에서는 마이크를 쓸 수 없어요', steps: ['오른쪽 위 메뉴에서 "다른 브라우저로 열기"(크롬·사파리)를 눌러 다시 열어 주세요.']},
  unsupported: {title: '이 브라우저는 녹음을 지원하지 않아요', steps: ['최신 크롬이나 사파리에서 열어 주세요.']},
  insecure: {title: '보안 연결(https)에서만 녹음할 수 있어요', steps: ['주소가 https로 시작하는지 확인해 주세요.']},
};
export const inAppBrowser = () => /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|BAND\//i.test(navigator.userAgent);

export async function microphonePermission(): Promise<PermissionState | 'unknown'> {
  try {return (await navigator.permissions.query({name: 'microphone' as PermissionName})).state;}
  catch {return 'unknown';}
}
export function classify(error: unknown): MicProblem {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return inAppBrowser() ? 'in-app' : 'blocked';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  return 'unsupported';
}

export type Take = {samples: Float32Array; wav: Uint8Array; url: string; seconds: number};

export async function toTake(blob: Blob, maxSeconds: number): Promise<Take> {
  const browser = globalThis as typeof globalThis & {webkitAudioContext?: typeof AudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext};
  const Audio = browser.AudioContext || browser.webkitAudioContext, Offline = browser.OfflineAudioContext || browser.webkitOfflineAudioContext;
  if (!Audio || !Offline) throw new Error('이 브라우저에서는 녹음을 바꿀 수 없어요. 최신 크롬·사파리에서 다시 녹음해 주세요.');
  const context = new Audio();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (!Number.isFinite(decoded.duration) || decoded.duration < 0.5) throw new Error('녹음이 너무 짧아요. 조금 더 길게 다시 녹음해 주세요.');
    const length = Math.min(SPEECH_RATE_HZ * maxSeconds, Math.floor(decoded.duration * SPEECH_RATE_HZ));
    const offline = new Offline(1, length, SPEECH_RATE_HZ), source = offline.createBufferSource();
    source.buffer = decoded; source.connect(offline.destination); source.start();
    const samples = (await offline.startRendering()).getChannelData(0), wav = pcmWav(samples);
    return {samples, wav, url: URL.createObjectURL(new Blob([Uint8Array.from(wav)], {type: 'audio/wav'})), seconds: samples.length / SPEECH_RATE_HZ};
  } finally {await context.close();}
}

/**
 * One take at a time: start, a live level for the meter, stop at two minutes. A blocked microphone is
 * watched, so allowing it in the browser settings clears the problem without a reload.
 */
export function useRecorder(onTake: (take: Take) => void, maxSeconds = SPEECH_MAX_SECONDS) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'processing'>('idle');
  const [problem, setProblem] = useState<MicProblem | null>(null), [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0), [level, setLevel] = useState(0);
  const parts = useRef<Blob[]>([]), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const timers = useRef<number[]>([]), meter = useRef<{context: AudioContext; frame: number} | null>(null), alive = useRef(true), cancelled = useRef(false);
  const handler = useRef(onTake);
  handler.current = onTake;

  const release = useCallback(() => {
    timers.current.forEach(t => clearInterval(t)); timers.current = [];
    if (meter.current) {cancelAnimationFrame(meter.current.frame); void meter.current.context.close().catch(() => undefined); meter.current = null;}
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    setLevel(0);
  }, []);
  useEffect(() => {alive.current = true; return () => {alive.current = false; cancelled.current = true; if (recorder.current?.state === 'recording') recorder.current.stop(); release();};}, [release]);

  // When the teacher allows the microphone in settings, drop the warning at once.
  useEffect(() => {
    if (problem !== 'blocked') return;
    let status: PermissionStatus | null = null;
    const watch = () => {if (status?.state === 'granted' || status?.state === 'prompt') setProblem(null);};
    navigator.permissions?.query({name: 'microphone' as PermissionName}).then(result => {status = result; status.addEventListener('change', watch); watch();}).catch(() => undefined);
    const onFocus = () => void microphonePermission().then(state => {if (state === 'granted' || state === 'prompt') setProblem(null);});
    window.addEventListener('focus', onFocus);
    return () => {status?.removeEventListener('change', watch); window.removeEventListener('focus', onFocus);};
  }, [problem]);

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    setError(''); setProblem(null);
    if (!window.isSecureContext) {setProblem('insecure'); return;}
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {setProblem(inAppBrowser() ? 'in-app' : 'unsupported'); return;}
    setState('starting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}, video: false});
      if (!alive.current) {media.getTracks().forEach(t => t.stop()); return;}
      stream.current = media; parts.current = []; cancelled.current = false;
      const rec = new MediaRecorder(media);
      rec.ondataavailable = event => {if (event.data.size) parts.current.push(event.data);};
      rec.onstop = async () => {
        const type = rec.mimeType || 'audio/webm';
        release();
        if (cancelled.current || !alive.current) {if (alive.current) setState('idle'); return;}
        setState('processing');
        try {const take = await toTake(new Blob(parts.current, {type}), maxSeconds); if (alive.current) handler.current(take);}
        catch (reason) {if (alive.current) setError(reason instanceof Error ? reason.message : '녹음을 처리하지 못했어요.');}
        finally {if (alive.current) setState('idle');}
      };
      recorder.current = rec; rec.start(500);
      const AudioCtor = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      if (AudioCtor) {
        const context = new AudioCtor(), analyser = context.createAnalyser(), data = new Uint8Array(512);
        analyser.fftSize = 512; context.createMediaStreamSource(media).connect(analyser);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 90));
          if (meter.current) meter.current.frame = requestAnimationFrame(tick);
        };
        meter.current = {context, frame: requestAnimationFrame(tick)};
      }
      const began = Date.now();
      setSeconds(0); setState('recording');
      timers.current.push(window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (elapsed >= maxSeconds && rec.state === 'recording') rec.stop();
      }, 250));
    } catch (reason) {
      release();
      if (alive.current) {setProblem(classify(reason)); setState('idle');}
    }
  }, [maxSeconds, release, state]);

  const stop = useCallback((discard = false) => {
    cancelled.current = discard;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    else {release(); setState('idle');}
  }, [release]);

  return {state, problem, error, seconds, level, start, stop, dismiss: () => setProblem(null)};
}

/**
 * The browser's own Korean recognizer, used only when it runs on this device (no audio sent out).
 * It listens alongside the recording and returns plain text; there are no timings or confidences.
 */
type LocalRecognition = {lang: string; continuous: boolean; interimResults: boolean; processLocally?: boolean; start(): void; stop(): void; onresult: ((event: {resultIndex: number; results: ArrayLike<ArrayLike<{transcript: string}> & {isFinal: boolean}>}) => void) | null; onerror: ((event: {error: string}) => void) | null; onend: (() => void) | null};
type LocalRecognitionConstructor = {new (): LocalRecognition; available?: (options: {langs: string[]; processLocally: boolean}) => Promise<string>};
export async function deviceRecognitionAvailable() {
  const ctor = (window as unknown as {SpeechRecognition?: LocalRecognitionConstructor}).SpeechRecognition;
  if (!ctor?.available) return false;
  try {return await ctor.available({langs: ['ko-KR'], processLocally: true}) === 'available';} catch {return false;}
}
export function startDeviceRecognition(onText: (text: string) => void) {
  const ctor = (window as unknown as {SpeechRecognition?: LocalRecognitionConstructor}).SpeechRecognition;
  if (!ctor) return null;
  const recognition = new ctor();
  if (!('processLocally' in recognition)) return null;
  let text = '';
  recognition.processLocally = true; recognition.lang = 'ko-KR'; recognition.continuous = true; recognition.interimResults = false;
  recognition.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) text = `${text} ${event.results[i][0].transcript}`.trim();
    onText(text);
  };
  recognition.onerror = () => undefined;
  recognition.start();
  return {stop: () => {try {recognition.stop();} catch {/* already stopped */}}};
}
