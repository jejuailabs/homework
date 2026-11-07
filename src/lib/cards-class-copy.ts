'use client';
import ko from '@/messages/cards-class-ko.json';
import en from '@/messages/cards-class-en.json';
import {usePreferences} from '@/components/providers';
export type CardsClassCopy = typeof ko;
export const fillCopy = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
export function useCardsClassCopy(): CardsClassCopy {const {locale} = usePreferences(); return locale === 'ko' ? ko : en;}
