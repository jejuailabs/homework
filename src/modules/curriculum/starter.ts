import type {DayNote, Plan, Subject} from './engine';
import {SAMPLE_PLAN} from './sample';

/**
 * "우리 반 시작하기": 선생님 반의 첫 계획. 확실한 것만 채우고 나머지는 비워 둔다(비운 곳은 시수표가 "확인 필요"로 알린다).
 * - 교과 이름: 2022 개정 초등 학년군 편제(1·2학년 통합교과, 5·6학년 실과).
 * - 기준시수: 학교마다 다르므로 0(미입력). 단원: 비움(진도표를 가져오거나 직접 넣을 때 채운다).
 * - 학사일정: 2026학년도 법정 공휴일·대체공휴일만. 방학·재량휴업·행사는 학교가 넣는다.
 * NEIS·학교알리미에서 학교 자료를 가져오는 온보딩이 들어오면 이 함수 대신 그 결과로 시작한다.
 */
export type StarterInput = {schoolName: string; className: string; grade: number; useSampleTimetable: boolean};
export const STARTER_YEARS = [2026] as const;

const subject = (key: string, name: string, short: string, tone: string): Subject => ({key, name, short, tone, standard: {1: 0, 2: 0}, units: {1: [], 2: []}});
export function subjectsFor(grade: number): Subject[] {
  if (grade <= 2) return [
    subject('kor', '국어', '국', 'coral'), subject('mat', '수학', '수', 'sky'), subject('bar', '바른 생활', '바', 'rose'),
    subject('sul', '슬기로운 생활', '슬', 'mint'), subject('jul', '즐거운 생활', '즐', 'lavender'), subject('cre', '창의적 체험활동', '창', 'sand'),
  ];
  const base = [
    subject('kor', '국어', '국', 'coral'), subject('soc', '사회', '사', 'apricot'), subject('eth', '도덕', '도', 'rose'), subject('mat', '수학', '수', 'sky'),
    subject('sci', '과학', '과', 'mint'), subject('pe', '체육', '체', 'lime'), subject('mus', '음악', '음', 'lavender'), subject('art', '미술', '미', 'pink'),
    subject('eng', '영어', '영', 'teal'), subject('cre', '창의적 체험활동', '창', 'sand'),
  ];
  return grade >= 5 ? [...base.slice(0, 5), subject('prc', '실과', '실', 'sky'), ...base.slice(5)] : base;
}

/**
 * 2026학년도(2026-03-01 ~ 2027-02-28)의 공휴일·대체공휴일. 학교 일정이 아니라 나라 달력이다.
 * 노동절·제헌절은 2026년부터 공휴일(인사혁신처 2026-04-29 발표), 2027년 설은 2/6~2/8 + 대체 2/9. 2026-11-22 확인.
 */
export const HOLIDAYS_2026: DayNote[] = [
  ['2026-03-02', '삼일절 대체공휴일'], ['2026-05-01', '노동절'], ['2026-05-05', '어린이날'], ['2026-05-25', '부처님오신날 대체공휴일'], ['2026-06-03', '전국동시지방선거'], ['2026-07-17', '제헌절'],
  ['2026-08-17', '광복절 대체공휴일'], ['2026-09-24', '추석 연휴'], ['2026-09-25', '추석'], ['2026-10-05', '개천절 대체공휴일'], ['2026-10-09', '한글날'],
  ['2026-12-25', '성탄절'], ['2027-01-01', '신정'], ['2027-02-08', '설 연휴'], ['2027-02-09', '설 대체공휴일'],
].map(([date, name]) => ({date, kind: 'holiday' as const, name}));

export function starterPlan(input: StarterInput): Plan {
  const subjects = subjectsFor(input.grade), keys = new Set(subjects.map(entry => entry.key));
  const template = input.useSampleTimetable && input.grade >= 3 && input.grade <= 4 ? SAMPLE_PLAN.templates[1].filter(slot => keys.has(slot.subject)) : [];
  return {
    sample: false, schoolName: input.schoolName, className: input.className, grade: input.grade, year: 2026,
    startsOn: '2026-03-02', semester2On: '2026-08-17', endsOn: '2027-02-28', periodsPerDay: 6,
    subjects, templates: {1: template, 2: template.map(slot => ({...slot}))}, days: HOLIDAYS_2026.map(day => ({...day})), daysRequired: 190,
  };
}
