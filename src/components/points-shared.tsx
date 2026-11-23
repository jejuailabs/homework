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
    POINT_REVOKE_INSUFFICIENT: ['선택한 학생 중 잔액이 부족한 학생이 있어요. 회수 수량을 확인해 주세요. 아무도 차감되지 않았어요.', 'A selected student has insufficient points. Check the amount. No points were deducted.'],
    INVALID_CURSOR: ['목록 위치가 바뀌었어요. 내역을 새로고침해 주세요.', 'Please refresh the history and try again.'],
    POINT_AMOUNT: ['포인트 수를 확인해 주세요.', 'Check the number of points.'],
    POINT_STUDENTS: ['학생은 한 번에 1~100명 선택해 주세요.', 'Select 1–100 students at a time.'],
    POINT_BALANCE: ['포인트 잔액을 확인해 주세요. 선생님께 알려 주세요.', 'Please ask your teacher to check the point balance.'],
    REQUEST_CONFLICT: ['다른 내용의 요청이 겹쳤어요. 화면을 새로 열어 주세요.', 'A different request used this ID. Please reload the page.'],
    ITEM_NOT_OWNED: ['보유한 아이템만 착용할 수 있어요.', 'You can only wear items you own.'],
    STUDENT_UNAVAILABLE: ['학생 계정 상태를 확인해 주세요.', 'Please check the student account status.'],
    GOAL_LIMIT: ['진행 중인 기부는 3개까지 열 수 있어요.', 'Up to 3 goals can be open.'],
    GOAL_OVER: ['남은 보말보다 많이 낼 수 없어요. 딱 맞게만 낼 수 있어요.', 'You can give at most what is still missing.'],
    GOAL_CLOSED: ['이미 끝났거나 마감이 지난 기부예요.', 'This goal has ended.'],
    GOAL_NOT_REACHED: ['목표를 채운 기부만 보상 완료로 표시할 수 있어요.', 'Only a filled goal can be marked rewarded.'],
    GOAL_NOT_FOUND: ['기부를 찾을 수 없어요. 새로고침해 주세요.', 'Goal not found. Please refresh.'],
    GOAL_TARGET: ['목표 보말을 1~1,000,000 사이로 정해 주세요.', 'Set a goal between 1 and 1,000,000.'],
    GOAL_TARGET_BELOW: ['이미 모인 보말보다 목표를 크게 정해 주세요.', 'The goal must be more than what is already given.'],
    GOAL_DUE: ['마감은 지금보다 뒤로 정해 주세요.', 'The deadline must be in the future.'],
    FORBIDDEN: ['이 학급에 접근할 수 없어요.', 'You do not have access to this class.'],
    UNAUTHENTICATED: ['다시 로그인해 주세요.', 'Please sign in again.'],
  };
  return errors[code]?.[ko ? 0 : 1] || (ko ? '처리하지 못했어요. 다시 시도해 주세요.' : 'Something went wrong. Please try again.');
}
