'use client';
import {useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject} from 'react';
import {usePreferences} from '@/components/providers';
import type {CardSet, CardSetType} from '@/lib/cards-types';
import {fitFontSize, speechLang} from '@/lib/cards-classroom';
import ko from '@/messages/cards-classroom-ko.json';
import en from '@/messages/cards-classroom-en.json';
import {cardsRequest} from './cards-shared';
import {speakWithDevice, ttsPlayer} from '@/lib/tts-client';

export type ClassroomCopyKey = keyof typeof ko;
export function useClassroomCopy() {
  const {locale} = usePreferences(), messages = locale === 'ko' ? ko : en;
  const c = useCallback((key: ClassroomCopyKey, values?: Record<string, string | number>) => values ? messages[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? '')) : messages[key], [messages]);
  return {locale, c};
}
/** 세트 종류에 맞는 앞·뒷면 이름. */
export const faceLabels = (type: CardSetType, c: ReturnType<typeof useClassroomCopy>['c']) => type === 'sentence' ? {front: c('sentenceFront'), back: c('sentenceBack'), example: c('example')} : {front: c('front'), back: c('back_'), example: c('example')};

/** 교사 본인의 세트를 읽기만 한다. */
export function useTeacherSet(setId: string) {
  const [set, setSet] = useState<CardSet | null>(null), [failed, setFailed] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {let alive = true; setFailed(false); cardsRequest<{set: CardSet}>(`/api/cards/sets/${encodeURIComponent(setId)}`).then(data => {if (alive) setSet(data.set);}).catch(() => {if (alive) setFailed(true);}); return () => {alive = false;};}, [setId, revision]);
  return {set, failed, retry: () => setRevision(value => value + 1)};
}

/** 칸 안에 다 들어가는 가장 큰 글자로 그린다. 추정값으로 시작해서 실제로 넘치면 조금씩 줄인다. */
export function FitText({text, min = 18, max = 220, className = ''}: {text: string; min?: number; max?: number; className?: string}) {
  const box = useRef<HTMLDivElement>(null), inner = useRef<HTMLSpanElement>(null), [size, setSize] = useState({width: 0, height: 0});
  const [fonts, setFonts] = useState(0);
  // 웹 글꼴이 늦게 오면 글자 폭이 바뀌므로 한 번 더 잰다.
  useEffect(() => {let alive = true; document.fonts?.ready.then(() => {if (alive) setFonts(value => value + 1);}); return () => {alive = false;};}, []);
  useEffect(() => {const element = box.current; if (!element) return; const observer = new ResizeObserver(([entry]) => setSize({width: entry.contentRect.width, height: entry.contentRect.height})); observer.observe(element); return () => observer.disconnect();}, []);
  useLayoutEffect(() => {
    const element = box.current, span = inner.current; if (!element || !span) return;
    // 첫 그림부터 맞는 크기로: 관찰 결과를 기다리지 않고 지금 상자 크기로 계산한다.
    const area = size.width ? size : {width: element.clientWidth, height: element.clientHeight}; if (!area.width) return;
    // 재는 동안은 낱말 중간 끊기를 막아 넘침을 드러내고, 최소 크기에서도 넘칠 때만 끊는다.
    let font = fitFontSize(text, area, {min, max}); span.style.overflowWrap = 'normal'; span.style.fontSize = `${font}px`;
    for (let step = 0; step < 16 && font > min && (span.scrollHeight > element.clientHeight + 1 || span.scrollWidth > element.clientWidth + 1); step++) {font = Math.max(min, Math.floor(font * .92)); span.style.fontSize = `${font}px`;}
    span.style.overflowWrap = '';
  }, [text, size, min, max, fonts]);
  return <div ref={box} className={`cards-fit ${className}`}><span ref={inner} lang={speechLang(text).slice(0, 2)}>{text}</span></div>;
}

/** 원어민 음성(서버 TTS)으로 읽고, 꺼졌거나 실패하면 기기 목소리(`speechSynthesis`)로 읽는다. */
export function useSpeech() {
  const [can, setCan] = useState(false);
  useEffect(() => {setCan('speechSynthesis' in window || typeof Audio !== 'undefined'); return () => {ttsPlayer().stop(); if ('speechSynthesis' in window) window.speechSynthesis.cancel();};}, []);
  const speak = useCallback((text: string, rate: number) => {
    if (!text.trim()) return;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    void ttsPlayer().speak(text, {rate, fallback: () => speakWithDevice(text, rate, undefined, speechLang(text))});
  }, []);
  return {can, speak};
}
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false), [supported, setSupported] = useState(false);
  useEffect(() => {setSupported(!!document.fullscreenEnabled); const changed = () => setOn(!!document.fullscreenElement); document.addEventListener('fullscreenchange', changed); return () => document.removeEventListener('fullscreenchange', changed);}, []);
  const toggle = useCallback(() => {if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void ref.current?.requestFullscreen?.().catch(() => {});}, [ref]);
  return {on, supported, toggle};
}
/** 마우스를 잠시 움직이지 않으면 커서와 조작줄을 숨긴다. 키보드 초점이 들어가면 CSS가 다시 보여 준다. */
export function useIdle(ms = 2500) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>; const wake = () => {setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), ms);};
    wake(); window.addEventListener('pointermove', wake); window.addEventListener('pointerdown', wake);
    return () => {clearTimeout(timer); window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake);};
  }, [ms]);
  return idle;
}
/** 이 기기에만 남기는 화면 취향. 저장이 막혀 있어도 기본값으로 동작한다. */
export function useLocalPrefs<T extends object>(key: string, initial: T): [T, (patch: Partial<T>) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {try {const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved && typeof saved === 'object') setValue(current => ({...current, ...Object.fromEntries(Object.entries(saved).filter(([name, item]) => name in current && typeof item === typeof (current as Record<string, unknown>)[name]))}));} catch {}}, [key]);
  const update = useCallback((patch: Partial<T>) => setValue(current => {const next = {...current, ...patch}; try {localStorage.setItem(key, JSON.stringify(next));} catch {} return next;}), [key]);
  return [value, update];
}
export const typingTarget = (target: EventTarget | null) => target instanceof HTMLElement && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable);
export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const SPEECH_RATES = [.6, .8, 1, 1.2];
