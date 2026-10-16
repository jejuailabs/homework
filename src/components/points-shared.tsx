'use client';
import {useLocale} from 'next-intl';
import type {PointSettings} from '@/lib/points-types';
export function usePointCopy() {const locale = useLocale(); return {locale, ko: locale === 'ko', copy: (ko: string, en: string) => locale === 'ko' ? ko : en};}
export function pointLabel(settings: PointSettings, locale: string) {return settings.label === '보말' && locale !== 'ko' ? 'Bomal' : settings.label;}
export async function pointsRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {...init, cache: 'no-store', headers: {'Content-Type': 'application/json', ...init?.headers}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code || 'INTERNAL_ERROR');
  return body as T;
}
export function pointError(error: unknown, ko: boolean) {
  const code = error instanceof Error ? error.message : '';
  const errors: Record<string, [string, string]> = {
    POINTS_DISABLED: ['선생님이 꾸미기를 켜면 사용할 수 있어요.', 'Your teacher can enable the wardrobe for your class.'],
    POINTS_INSUFFICIENT: ['포인트를 조금 더 모아 주세요.', 'Collect a few more points first.'],
    POINT_DAILY_CAP: ['선택한 학생 중 하루 지급 한도를 넘는 학생이 있어요. 지급량이나 선택을 조정해 주세요. 아직 지급되지 않았어요.', 'This would exceed the daily limit for a selected student. Adjust the amount or selection; no points were awarded.'],
    POINT_AMOUNT: ['포인트 수를 확인해 주세요.', 'Check the number of points.'],
    POINT_STUDENTS: ['학생은 한 번에 1~100명 선택해 주세요.', 'Select 1–100 students at a time.'],
    POINT_BALANCE: ['포인트 잔액을 확인해 주세요. 선생님께 알려 주세요.', 'Please ask your teacher to check the point balance.'],
    REQUEST_CONFLICT: ['다른 내용의 요청이 겹쳤어요. 화면을 새로 열어 주세요.', 'A different request used this ID. Please reload the page.'],
    ITEM_NOT_OWNED: ['보유한 아이템만 착용할 수 있어요.', 'You can only wear items you own.'],
    STUDENT_UNAVAILABLE: ['학생 계정 상태를 확인해 주세요.', 'Please check the student account status.'],
    FORBIDDEN: ['이 학급에 접근할 수 없어요.', 'You do not have access to this class.'],
    UNAUTHENTICATED: ['다시 로그인해 주세요.', 'Please sign in again.'],
  };
  return errors[code]?.[ko ? 0 : 1] || (ko ? '처리하지 못했어요. 다시 시도해 주세요.' : 'Something went wrong. Please try again.');
}
