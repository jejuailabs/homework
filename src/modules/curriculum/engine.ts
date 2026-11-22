/**
 * 교육과정 계산기. 화면과 베리가 같은 함수를 부른다(베리는 시수를 직접 셈하지 않는다).
 * 원자는 차시 한 칸이다: 학사일정 × 기초시간표 → 차시 목록 → 시수표·진도표·주간학습은 모두 여기서 계산한다(저장하지 않는다).
 * 날짜는 'YYYY-MM-DD' 문자열, 요일은 1(월)~5(금).
 */
export type SubjectKey = string;
export type Subject = {key: SubjectKey; name: string; short: string; tone: string; standard: {1: number; 2: number}; units: {1: Unit[]; 2: Unit[]}};
export type Unit = {name: string; hours: number};
export type Slot = {weekday: number; period: number; subject: SubjectKey};
export type DayKind = 'holiday' | 'vacation' | 'event' | 'off';
/** 수업일이 아닌 날(holiday·vacation·off), 또는 수업은 하되 행사가 있는 날(event, periods가 있으면 그 교시까지만). */
export type DayNote = {date: string; kind: DayKind; name: string; periods?: number};
export type Plan = {
  sample: boolean; schoolName: string; className: string; grade: number; year: number;
  startsOn: string; semester2On: string; endsOn: string; periodsPerDay: number;
  subjects: Subject[]; templates: {1: Slot[]; 2: Slot[]}; days: DayNote[];
  /** 학교가 정한 법정 수업일수 기준. */
  daysRequired: number;
};
export type Session = {date: string; weekday: number; period: number; subject: SubjectKey; semester: 1 | 2; unit: string | null; lesson: number; lessons: number};
/** hasStandard=false면 학교 기준시수를 아직 넣지 않은 교과: 증감을 보이지 않는다(0과 비교하면 거짓 경고가 된다). */
export type HourRow = {subject: SubjectKey; name: string; planned: {1: number; 2: number; year: number}; standard: {1: number; 2: number; year: number}; diff: {1: number; 2: number; year: number}; outOfRange: boolean; hasStandard: boolean};
export type HourStats = {rows: HourRow[]; total: HourRow; schoolDays: {1: number; 2: number; year: number}; daysRequired: number; warnings: string[]};

/** 학교 기준시수 대비 증감 허용 폭(스쿨마스터 시수편제의 기본값 ±20%). */
export const ALLOWED_RATIO = 0.2;
/** 수업일수가 기준보다 이만큼 넘게 많으면 방학이 빠졌을 가능성을 알린다. */
export const DAYS_SLACK = 15;
export const WEEKDAYS = ['', '월', '화', '수', '목', '금', '토', '일'];

const toTime = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
export const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
export const addDays = (date: string, days: number) => iso(toTime(date) + days * 86_400_000);
/** 1(월)~7(일) */
export const weekdayOf = (date: string) => {const day = new Date(toTime(date)).getUTCDay(); return day === 0 ? 7 : day;};
export const weekStartOf = (date: string) => addDays(date, 1 - weekdayOf(date));
/** 주말이면 다음 주 월요일: "이번 주 주간학습"은 토·일에 다음 주를 뜻한다. */
export const schoolWeekOf = (date: string) => weekdayOf(date) > 5 ? addDays(date, 8 - weekdayOf(date)) : date;
export const semesterOf = (plan: Plan, date: string): 1 | 2 => date < plan.semester2On ? 1 : 2;
export const shortDate = (date: string) => `${+date.slice(5, 7)}/${+date.slice(8, 10)}(${WEEKDAYS[weekdayOf(date)]})`;

export function dayNote(plan: Plan, date: string) {return plan.days.find(day => day.date === date) ?? null;}
export function isSchoolDay(plan: Plan, date: string) {
  if (date < plan.startsOn || date > plan.endsOn || weekdayOf(date) > 5) return false;
  const note = dayNote(plan, date);
  return !note || note.kind === 'event';
}

/** 학년도 전체 차시. 단원은 교과별로 차시 순서대로 채운다(단원 차시가 모자라면 단원 없이 남는다). */
export function expand(plan: Plan): Session[] {
  const sessions: Session[] = [];
  const cursor = new Map<string, {unit: number; lesson: number}>();
  for (let date = plan.startsOn; date <= plan.endsOn; date = addDays(date, 1)) {
    if (!isSchoolDay(plan, date)) continue;
    const semester = semesterOf(plan, date), weekday = weekdayOf(date), limit = dayNote(plan, date)?.periods ?? plan.periodsPerDay;
    for (const slot of plan.templates[semester].filter(entry => entry.weekday === weekday && entry.period <= limit).sort((a, b) => a.period - b.period)) {
      const subject = plan.subjects.find(entry => entry.key === slot.subject);
      if (!subject) continue;
      const key = `${slot.subject}:${semester}`, at = cursor.get(key) ?? {unit: 0, lesson: 0}, units = subject.units[semester];
      while (at.unit < units.length && at.lesson >= units[at.unit].hours) {at.unit++; at.lesson = 0;}
      const unit = units[at.unit];
      at.lesson++;
      cursor.set(key, at);
      sessions.push({date, weekday, period: slot.period, subject: slot.subject, semester, unit: unit?.name ?? null, lesson: unit ? at.lesson : 0, lessons: unit?.hours ?? 0});
    }
  }
  return sessions;
}

export function schoolDayCount(plan: Plan) {
  const count = {1: 0, 2: 0, year: 0};
  for (let date = plan.startsOn; date <= plan.endsOn; date = addDays(date, 1)) {
    if (!isSchoolDay(plan, date)) continue;
    count[semesterOf(plan, date)]++; count.year++;
  }
  return count;
}

const row = (subject: SubjectKey, name: string, planned: HourRow['planned'], standard: HourRow['standard']): HourRow => {
  const diff = {1: planned[1] - standard[1], 2: planned[2] - standard[2], year: planned.year - standard.year};
  const hasStandard = standard.year > 0;
  return {subject, name, planned, standard, diff, outOfRange: hasStandard && Math.abs(diff.year) > standard.year * ALLOWED_RATIO, hasStandard};
};

/** 스쿨마스터 "연간시수 통계표"와 같은 표: 교과별 1·2학기 편성시수, 기준시수, 증감. */
export function hourStats(plan: Plan, sessions = expand(plan)): HourStats {
  const rows = plan.subjects.map(subject => {
    const mine = sessions.filter(session => session.subject === subject.key);
    const planned = {1: mine.filter(session => session.semester === 1).length, 2: mine.filter(session => session.semester === 2).length, year: mine.length};
    return row(subject.key, subject.name, planned, {1: subject.standard[1], 2: subject.standard[2], year: subject.standard[1] + subject.standard[2]});
  });
  const sum = (pick: (entry: HourRow) => {1: number; 2: number; year: number}) => ({1: rows.reduce((n, entry) => n + pick(entry)[1], 0), 2: rows.reduce((n, entry) => n + pick(entry)[2], 0), year: rows.reduce((n, entry) => n + pick(entry).year, 0)});
  const total = {...row('total', '합계', sum(entry => entry.planned), sum(entry => entry.standard)), hasStandard: rows.length > 0 && rows.every(entry => entry.hasStandard)};
  const schoolDays = schoolDayCount(plan), warnings: string[] = [];
  if (schoolDays.year < plan.daysRequired) warnings.push(`수업일수가 ${schoolDays.year}일로 기준 ${plan.daysRequired}일보다 ${plan.daysRequired - schoolDays.year}일 모자라요.`);
  if (schoolDays.year > plan.daysRequired + DAYS_SLACK) warnings.push(`수업일수가 ${schoolDays.year}일로 많아요. 방학·재량휴업일이 학사일정에 들어갔는지 확인해 주세요.`);
  const missing = rows.filter(entry => !entry.hasStandard);
  if (missing.length) warnings.push(`기준시수가 비어 있는 교과가 ${missing.length}개 있어요: ${missing.map(entry => entry.name).join(', ')}.`);
  if (!plan.templates[1].length) warnings.push('1학기 기초시간표가 비어 있어요.');
  for (const entry of rows.filter(item => item.hasStandard)) {
    if (entry.diff.year < 0) warnings.push(`${entry.name} 시수가 기준보다 ${-entry.diff.year}시간 모자라요.`);
    if (entry.outOfRange) warnings.push(`${entry.name} 증감이 기준의 ±${ALLOWED_RATIO * 100}%를 넘어요.`);
  }
  return {rows, total, schoolDays, daysRequired: plan.daysRequired, warnings};
}

export type WeekCell = {period: number; subject: SubjectKey; name: string; unit: string | null; lesson: number; lessons: number};
export type WeekDay = {date: string; weekday: number; note: DayNote | null; school: boolean; cells: WeekCell[]};
/** 주간학습안내·오늘 시간표의 재료: 월~금 × 교시. */
export function week(plan: Plan, anyDate: string, sessions = expand(plan)): WeekDay[] {
  const start = weekStartOf(anyDate), nameOf = (key: SubjectKey) => plan.subjects.find(subject => subject.key === key)?.name ?? key;
  return [0, 1, 2, 3, 4].map(offset => {
    const date = addDays(start, offset);
    const cells = sessions.filter(session => session.date === date).map(session => ({period: session.period, subject: session.subject, name: nameOf(session.subject), unit: session.unit, lesson: session.lesson, lessons: session.lessons}));
    return {date, weekday: offset + 1, note: dayNote(plan, date), school: isSchoolDay(plan, date), cells};
  });
}

/** 교과진도표: 한 교과의 학기 차시를 날짜 순으로. */
export function progressBook(plan: Plan, subject: SubjectKey, semester: 1 | 2, sessions = expand(plan)) {
  return sessions.filter(session => session.subject === subject && session.semester === semester).map((session, index) => ({...session, seq: index + 1}));
}

/** 오늘 기준 진도율: 오늘까지 지난 차시 / 학기 전체 차시. */
export function progressToDate(plan: Plan, today: string, sessions = expand(plan)) {
  const semester = semesterOf(plan, today < plan.startsOn ? plan.startsOn : today);
  return plan.subjects.map(subject => {
    const mine = sessions.filter(session => session.subject === subject.key && session.semester === semester), done = mine.filter(session => session.date < today).length;
    const next = mine.find(session => session.date >= today) ?? null;
    return {subject: subject.key, name: subject.name, done, total: mine.length, next: next && {date: next.date, unit: next.unit, lesson: next.lesson, lessons: next.lessons}};
  });
}

/** 기초시간표 한 칸을 바꾼 새 계획(원본은 그대로). 같은 칸에 과목을 비우면 지운다. */
export function setSlot(plan: Plan, semester: 1 | 2, weekday: number, period: number, subject: SubjectKey | null): Plan {
  const rest = plan.templates[semester].filter(slot => !(slot.weekday === weekday && slot.period === period));
  return {...plan, templates: {...plan.templates, [semester]: subject ? [...rest, {weekday, period, subject}] : rest}};
}

/** 기초시간표의 교과별 주당 시간. */
export function weeklyCounts(plan: Plan, semester: 1 | 2) {
  const counts = new Map<SubjectKey, number>();
  for (const slot of plan.templates[semester]) counts.set(slot.subject, (counts.get(slot.subject) ?? 0) + 1);
  return counts;
}
