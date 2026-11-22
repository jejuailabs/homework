import type {DayNote, Plan, Slot, Subject, Unit} from './engine';

/**
 * 시험용 예시 학급(실제 학교·학생이 아니다). 화면과 베리 도구 모두 `sample: true`로 표시한다.
 * 기준시수는 이 예시 학교가 정한 학교 기준(국가 최소 기준보다 많게 편성하는 흔한 경우), 학사일정은 2026학년도 공휴일에 예시 방학을 얹었다.
 * 일부러 몇 교과가 1~2시간 어긋나게 두었다: 시수표의 빨강(부족)·파랑(초과)이 어떻게 보이는지 확인하려는 것.
 * 단원 이름은 교과서에서 가져오지 않는다(지어낸 단원명을 진짜처럼 보이지 않게 "n단원"으로 둔다).
 */
const units = (count: number, total: number): Unit[] => Array.from({length: count}, (_, index) => ({name: `${index + 1}단원`, hours: Math.floor(total / count) + (index < total % count ? 1 : 0)}));
const both = (count: number, first: number, second: number) => ({1: units(count, first), 2: units(count, second).map((unit, index) => ({...unit, name: `${index + count + 1}단원`}))});
const creative = (): Subject['units'] => ({
  1: [{name: '자율·자치활동', hours: 22}, {name: '동아리활동', hours: 20}, {name: '진로활동', hours: 16}],
  2: [{name: '자율·자치활동', hours: 20}, {name: '동아리활동', hours: 18}, {name: '진로활동', hours: 16}],
});

const SUBJECTS: Subject[] = [
  {key: 'kor', name: '국어', short: '국', tone: 'coral', standard: {1: 117, 2: 116}, units: both(8, 117, 116)},
  {key: 'soc', name: '사회', short: '사', tone: 'apricot', standard: {1: 57, 2: 60}, units: both(3, 57, 60)},
  {key: 'eth', name: '도덕', short: '도', tone: 'rose', standard: {1: 19, 2: 20}, units: both(3, 19, 20)},
  {key: 'mat', name: '수학', short: '수', tone: 'sky', standard: {1: 76, 2: 79}, units: both(6, 76, 79)},
  {key: 'sci', name: '과학', short: '과', tone: 'mint', standard: {1: 58, 2: 56}, units: both(5, 58, 56)},
  {key: 'pe', name: '체육', short: '체', tone: 'lime', standard: {1: 56, 2: 56}, units: both(4, 56, 56)},
  {key: 'mus', name: '음악', short: '음', tone: 'lavender', standard: {1: 38, 2: 40}, units: both(4, 38, 40)},
  {key: 'art', name: '미술', short: '미', tone: 'pink', standard: {1: 37, 2: 40}, units: both(4, 37, 40)},
  {key: 'eng', name: '영어', short: '영', tone: 'teal', standard: {1: 40, 2: 41}, units: both(6, 40, 41)},
  {key: 'cre', name: '창의적 체험활동', short: '창', tone: 'sand', standard: {1: 58, 2: 54}, units: creative()},
];

const WEEK = [
  ['kor', 'mat', 'soc', 'sci', 'pe', 'cre'],
  ['kor', 'mat', 'eng', 'art', 'art', 'mus'],
  ['kor', 'soc', 'mat', 'pe', 'eth'],
  ['kor', 'sci', 'eng', 'soc', 'mus', 'cre'],
  ['kor', 'kor', 'mat', 'sci', 'pe', 'cre'],
];
const template: Slot[] = WEEK.flatMap((day, index) => day.map((subject, period) => ({weekday: index + 1, period: period + 1, subject})));

const range = (from: string, to: string, kind: DayNote['kind'], name: string): DayNote[] => {
  const out: DayNote[] = [];
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86_400_000) out.push({date: new Date(time).toISOString().slice(0, 10), kind, name});
  return out;
};

const DAYS: DayNote[] = [
  {date: '2026-03-02', kind: 'holiday', name: '삼일절 대체공휴일'},
  {date: '2026-03-03', kind: 'event', name: '시업식·입학식', periods: 4},
  {date: '2026-04-17', kind: 'event', name: '현장체험학습'},
  {date: '2026-05-04', kind: 'off', name: '재량휴업일'},
  {date: '2026-05-05', kind: 'holiday', name: '어린이날'},
  {date: '2026-05-08', kind: 'event', name: '운동회', periods: 4},
  {date: '2026-05-25', kind: 'holiday', name: '부처님오신날 대체공휴일'},
  {date: '2026-06-03', kind: 'holiday', name: '전국동시지방선거'},
  {date: '2026-07-21', kind: 'event', name: '여름방학식', periods: 4},
  ...range('2026-07-22', '2026-08-16', 'vacation', '여름방학'),
  {date: '2026-08-17', kind: 'holiday', name: '광복절 대체공휴일'},
  {date: '2026-08-18', kind: 'event', name: '2학기 개학식', periods: 4},
  {date: '2026-09-24', kind: 'holiday', name: '추석 연휴'},
  {date: '2026-09-25', kind: 'holiday', name: '추석'},
  {date: '2026-10-05', kind: 'holiday', name: '개천절 대체공휴일'},
  {date: '2026-10-09', kind: 'holiday', name: '한글날'},
  {date: '2026-10-23', kind: 'event', name: '학예회', periods: 4},
  {date: '2026-12-25', kind: 'holiday', name: '성탄절'},
  {date: '2027-01-01', kind: 'holiday', name: '신정'},
  {date: '2027-01-08', kind: 'event', name: '종업식', periods: 4},
  ...range('2027-01-09', '2027-02-28', 'vacation', '겨울방학'),
];

export const SAMPLE_PLAN: Plan = {
  sample: true, schoolName: '예시초등학교', className: '3학년 4반', grade: 3, year: 2026,
  startsOn: '2026-03-03', semester2On: '2026-08-18', endsOn: '2027-02-28', periodsPerDay: 6,
  subjects: SUBJECTS, templates: {1: template, 2: template}, days: DAYS, daysRequired: 190,
};
