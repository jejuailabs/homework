'use client';
import {useCallback, useEffect, useRef, useState} from 'react';

export const HOMEWORK_RECORD_SECONDS = 300;

/** Records the microphone in the browser and hands back one audio File (webm on Chrome, mp4 on Safari). */
export function useHomeworkRecorder(onFile: (file: File) => void, fileLabel: string) {
  const [recording, setRecording] = useState(false), [seconds, setSeconds] = useState(0), [failed, setFailed] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), timer = useRef<ReturnType<typeof setInterval> | null>(null), mounted = useRef(true), deliver = useRef(onFile), discard = useRef(false);
  useEffect(() => {deliver.current = onFile;}, [onFile]);
  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current); timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
  }, []);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false; if (recorder.current?.state === 'recording') recorder.current.stop(); release();};}, [release]);
  const stop = useCallback(() => {if (recorder.current?.state === 'recording') recorder.current.stop();}, []);
  /** Stops without keeping the take, for example when the student leaves this homework. */
  const cancel = useCallback(() => {if (recorder.current?.state === 'recording') {discard.current = true; recorder.current.stop();}}, []);
  const start = useCallback(async () => {
    if (recorder.current?.state === 'recording') return;
    setFailed(false); discard.current = false;
    try {
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const media = await navigator.mediaDevices.getUserMedia({audio: true});
      if (!mounted.current) {media.getTracks().forEach(track => track.stop()); return;}
      const instance = new MediaRecorder(media), chunks: BlobPart[] = [], startedAt = new Date();
      recorder.current = instance; stream.current = media;
      instance.ondataavailable = event => {if (event.data.size) chunks.push(event.data);};
      instance.onstop = () => {
        release(); recorder.current = null;
        if (!mounted.current) return;
        setRecording(false);
        if (discard.current) {discard.current = false; return;}
        const type = instance.mimeType.split(';')[0] || 'audio/webm', contentType = type.includes('mp4') ? 'audio/mp4' : type.includes('ogg') ? 'audio/ogg' : 'audio/webm';
        const extension = contentType === 'audio/mp4' ? 'm4a' : contentType === 'audio/ogg' ? 'ogg' : 'webm';
        const stamp = `${String(startedAt.getHours()).padStart(2, '0')}${String(startedAt.getMinutes()).padStart(2, '0')}${String(startedAt.getSeconds()).padStart(2, '0')}`;
        const file = new File(chunks, `${fileLabel}-${stamp}.${extension}`, {type: contentType});
        if (file.size) deliver.current(file);
      };
      instance.start(1000); setRecording(true); setSeconds(0);
      timer.current = setInterval(() => setSeconds(value => {if (value + 1 >= HOMEWORK_RECORD_SECONDS && instance.state === 'recording') instance.stop(); return value + 1;}), 1000);
    } catch {release(); recorder.current = null; if (mounted.current) {setRecording(false); setFailed(true);}}
  }, [fileLabel, release]);
  return {recording, seconds, failed, start, stop, cancel};
}
