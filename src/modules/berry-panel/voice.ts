'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {joinDictation} from './dictation';

/** The browser's own speech-to-text (Chrome, Edge, Safari). Firefox has none, so the mic button is hidden there. */
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: {resultIndex: number; results: ArrayLike<ArrayLike<{transcript: string}> & {isFinal: boolean}>}) => void) | null;
  onerror: ((event: {error: string}) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor};
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const VOICE_ERRORS: Record<string, string> = {
  'not-allowed': '마이크 사용이 막혀 있어요. 브라우저 주소창 옆 설정에서 마이크를 허용해 주세요.',
  'service-not-allowed': '이 브라우저에서는 음성 입력을 쓸 수 없어요.',
  'audio-capture': '마이크를 찾지 못했어요. 연결을 확인해 주세요.',
  network: '음성 인식 연결이 끊겼어요. 잠시 후 다시 눌러 주세요.',
};

/**
 * Press once to listen, again to stop. Text appears as it is heard (interim results)
 * and stays in the input box so the teacher can fix it before sending.
 */
export function useVoiceInput(text: string, setText: (value: string) => void) {
  const [supported, setSupported] = useState(false), [listening, setListening] = useState(false), [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null), base = useRef(''), finals = useRef(''), keep = useRef(true);
  const latest = useRef(text);
  useEffect(() => {latest.current = text;}, [text]);
  useEffect(() => {setSupported(!!recognitionCtor());}, []);
  useEffect(() => () => recognition.current?.abort(), []);
  const stop = useCallback(() => {recognition.current?.stop();}, []);
  /** Stops without putting the heard text back (used when the message is sent mid-listening). */
  const cancel = useCallback(() => {keep.current = false; recognition.current?.abort();}, []);
  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError('');
    const r = new Ctor();
    r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;
    base.current = latest.current; finals.current = ''; keep.current = true;
    r.onresult = event => {
      if (!keep.current) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i], said = result[0]?.transcript ?? '';
        if (result.isFinal) finals.current = joinDictation(finals.current, said); else interim = joinDictation(interim, said);
      }
      setText(joinDictation(base.current, joinDictation(finals.current, interim)));
    };
    r.onerror = event => {if (event.error !== 'no-speech' && event.error !== 'aborted') setError(VOICE_ERRORS[event.error] ?? '음성을 알아듣지 못했어요. 다시 눌러 주세요.');};
    r.onend = () => {setListening(false); recognition.current = null; if (keep.current && finals.current) setText(joinDictation(base.current, finals.current));};
    recognition.current = r;
    try {r.start(); setListening(true);} catch {setError('음성 입력을 시작하지 못했어요. 다시 눌러 주세요.');}
  }, [setText]);
  return {supported, listening, error, start, stop, cancel, toggle: () => (listening ? stop() : start())};
}
