'use client';
import ko from '@/messages/cards-family-ko.json';
import en from '@/messages/cards-family-en.json';
import {usePreferences} from '@/components/providers';
export type CardsFamilyCopy = typeof ko;
/** 학부모 링크·카드놀이 보말 문구. `{name}` 같은 자리를 채워 쓴다. */
export function useCardsFamilyCopy() {
  const {locale} = usePreferences(), copy: CardsFamilyCopy = locale === 'ko' ? ko : en;
  const fill = (key: keyof CardsFamilyCopy, values: Record<string, string | number> = {}) => copy[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
  return {locale, copy, fill};
}
