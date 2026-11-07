'use client';
import ko from '@/messages/cards-p2-ko.json';
import en from '@/messages/cards-p2-en.json';
import {usePreferences} from '@/components/providers';
/** 카드놀이 P2 문구: 다른 반 배치·이월, 클래스 복제·학습 일정, 동료 공유, 반대항전·먼저 쓰기, 끊어읽기, 연습문제, 쪽지. */
export type CardsP2Copy = typeof ko;
export function useCardsP2Copy(): CardsP2Copy {const {locale} = usePreferences(); return locale === 'ko' ? ko : en;}
