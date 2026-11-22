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
  /** 하루짜리 시간표 바꾸기(스쿨마스터 연간시간표의 칸 수정). subject가 null이면 그 시간 수업을 비운다. 없으면 []. */
  overrides?: Override[];
};
export type Override = {date: string; period: number; subject: SubjectKey | null; note?: string};
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

/** 그날 실제로 열리는 교시: 기초시간표에서 시작해 하루짜리 바꾸기를 덮어쓴다. */
function daySlots(plan: Plan, date: string, semester: 1 | 2, weekday: number, limit: number) {
  const byPeriod = new Map<number, SubjectKey>();
  for (const slot of plan.templates[semester]) if (slot.weekday === weekday && slot.period <= limit) byPeriod.set(slot.period, slot.subject);
  for (const change of plan.overrides ?? []) {
    if (change.date !== date || change.period > limit) continue;
    if (change.subject) byPeriod.set(change.period, change.subject); else byPeriod.delete(change.period);
  }
  return [...byPeriod.entries()].sort((a, b) => a[0] - b[0]).map(([period, subject]) => ({period, subject}));
}

/** 학년도 전체 차시. 단원은 교과별로 차시 순서대로 채운다(단원 차시가 모자라면 단원 없이 남는다). */
export function expand(plan: Plan): Session[] {
  const sessions: Session[] = [];
  const cursor = new Map<string, {unit: number; lesson: number}>();
  for (let date = plan.startsOn; date <= plan.endsOn; date = addDays(date, 1)) {
    if (!isSchoolDay(plan, date)) continue;
    const semester = semesterOf(plan, date), weekday = weekdayOf(date), limit = dayNote(plan, date)?.periods ?? plan.periodsPerDay;
    for (const slot of daySlots(plan, date, semester, weekday, limit)) {
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

/**
 * 왜 시수가 이렇게 됐나: 기초시간표대로라면 있었을 수업이 빠진 날(공휴일·재량휴업·행사 단축)과 하루짜리 바꾸기를 교과별로.
 * 방학은 원래 수업이 없는 기간이라 원인으로 세지 않는다. 양수 = 더해짐, 음수 = 빠짐.
 */
export type Cause = {date: string; kind: 'holiday' | 'off' | 'event' | 'override'; name: string; delta: number; period?: number};
export function causes(plan: Plan): Map<SubjectKey, Cause[]> {
  const out = new Map<SubjectKey, Cause[]>(), add = (key: SubjectKey, cause: Cause) => out.set(key, [...(out.get(key) ?? []), cause]);
  for (let date = plan.startsOn; date <= plan.endsOn; date = addDays(date, 1)) {
    const weekday = weekdayOf(date);
    if (weekday > 5) continue;
    const semester = semesterOf(plan, date), note = dayNote(plan, date), base = plan.templates[semester].filter(slot => slot.weekday === weekday);
    if (note && (note.kind === 'holiday' || note.kind === 'off')) {
      const lost = new Map<SubjectKey, number>();
      for (const slot of base) lost.set(slot.subject, (lost.get(slot.subject) ?? 0) + 1);
      lost.forEach((count, key) => add(key, {date, kind: note.kind as 'holiday' | 'off', name: note.name, delta: -count}));
      continue;
    }
    if (note?.kind === 'vacation') continue;
    if (note?.kind === 'event' && note.periods) {
      const lost = new Map<SubjectKey, number>();
      for (const slot of base) if (slot.period > note.periods) lost.set(slot.subject, (lost.get(slot.subject) ?? 0) + 1);
      lost.forEach((count, key) => add(key, {date, kind: 'event', name: note.name, delta: -count}));
    }
    const limit = note?.periods ?? plan.periodsPerDay;
    for (const change of (plan.overrides ?? []).filter(entry => entry.date === date && entry.period <= limit)) {
      const before = base.find(slot => slot.period === change.period)?.subject ?? null;
      if (before === change.subject) continue;
      const name = change.note || '하루 시간표 바꾸기';
      if (before) add(before, {date, kind: 'override', name, delta: -1, period: change.period});
      if (change.subject) add(change.subject, {date, kind: 'override', name, delta: 1, period: change.period});
    }
  }
  return out;
}

/**
 * 조절 제안: 교과 A를 n시간 늘리려면, 오늘 이후 그 학기에 기준보다 남는 교과의 수업을 A로 바꾼다(남는 만큼만).
 * 줄이려면, A의 수업을 기준보다 모자란 교과에 준다(모자란 만큼만). 기준이 없는 교과는 주고받지 않는다.
 * 그래서 체육·예술처럼 기준 밑으로 줄이면 안 되는 교과는 남는 시간이 없으면 건드리지 않는다.
 * 계산만 하고 저장하지 않는다(적용은 화면·베리의 확인 뒤). 다 못 채우면 채운 만큼만 돌려준다.
 */
export function suggestAdjust(plan: Plan, target: SubjectKey, amount: number, from: string, semester: 1 | 2): Override[] {
  const sessions = expand(plan), stats = hourStats(plan, sessions);
  const room = new Map(stats.rows.filter(row => row.hasStandard && row.subject !== target).map(row => [row.subject, amount > 0 ? row.diff[semester] : -row.diff[semester]]));
  const future = sessions.filter(session => session.semester === semester && session.date >= from);
  const out: Override[] = [];
  if (amount > 0) {
    const pool = future.filter(session => (room.get(session.subject) ?? 0) > 0).sort((a, b) => (room.get(b.subject)! - room.get(a.subject)!) || a.date.localeCompare(b.date) || b.period - a.period);
    for (const session of pool) {
      if (out.length >= amount) break;
      if ((room.get(session.subject) ?? 0) <= 0) continue;
      room.set(session.subject, room.get(session.subject)! - 1);
      out.push({date: session.date, period: session.period, subject: target, note: '시수 맞추기'});
    }
  } else {
    for (const session of future.filter(entry => entry.subject === target).sort((a, b) => a.date.localeCompare(b.date) || b.period - a.period)) {
      if (out.length >= -amount) break;
      const receiver = [...room.entries()].filter(([, need]) => need > 0).sort((a, b) => b[1] - a[1])[0];
      if (!receiver) break;
      room.set(receiver[0], receiver[1] - 1);
      out.push({date: session.date, period: session.period, subject: receiver[0], note: '시수 맞추기'});
    }
  }
  return out;
}

/** 같은 날·교시 바꾸기는 하나만: 새 것이 옛 것을 덮는다. */
export function applyOverrides(plan: Plan, changes: Override[]): Plan {
  const keys = new Set(changes.map(change => `${change.date}:${change.period}`));
  return {...plan, overrides: [...(plan.overrides ?? []).filter(change => !keys.has(`${change.date}:${change.period}`)), ...changes].sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period)};
}
