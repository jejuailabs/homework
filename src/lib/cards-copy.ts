'use client';
import ko from '@/messages/cards-ko.json';
import en from '@/messages/cards-en.json';
import {usePreferences} from '@/components/providers';
export type CardsCopyKey = keyof typeof ko;
export function useCardsCopy() {const {locale} = usePreferences(); const messages = locale === 'ko' ? ko : en; return {locale, t: (key: CardsCopyKey) => messages[key]};}
