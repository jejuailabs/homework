/**
 * 숨겨서 만드는 동안의 공개 범위. 교무수첩과 같은 3단 스위치(off → allowlist → all)이고 기본은 off다.
 * off여도 플랫폼 관리자는 확인을 위해 열 수 있다. CURRICULUM_DISABLED=true는 관리자까지 모두 끈다.
 */
export type CurriculumAccessMode = 'off' | 'allowlist' | 'all';
export type CurriculumAccess = {mode: CurriculumAccessMode; teacherUids: string[]};
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function curriculumAccess(value: unknown): CurriculumAccess {
  const data = (value ?? {}) as Partial<CurriculumAccess>;
  const mode = data.mode === 'all' || data.mode === 'allowlist' ? data.mode : 'off';
  return {mode, teacherUids: Array.isArray(data.teacherUids) ? data.teacherUids.filter((uid): uid is string => typeof uid === 'string' && ID.test(uid)).slice(0, 500) : []};
}

export function curriculumAllowed(config: CurriculumAccess, uid: string, role: string, killSwitch?: string) {
  if (killSwitch === 'true' || role === 'student') return false;
  if (role === 'admin' || role === 'superadmin') return true;
  return config.mode === 'all' || config.mode === 'allowlist' && config.teacherUids.includes(uid);
}

/** 선생님 반 계획 저장 검사. 화면이 보낸 계획 전체를 받아 모양·범위를 확인하고, 이상하면 이유와 함께 막는다. */
export class PlanError extends Error {constructor(message: string) {super(message);}}
const KINDS = ['holiday', 'vacation', 'event', 'off'] as const;
const TONES = ['coral', 'apricot', 'rose', 'sky', 'mint', 'lime', 'lavender', 'pink', 'teal', 'sand'];
const DATE = /^\d{4}-\d{2}-\d{2}$/, KEY = /^[a-z][a-z0-9_]{0,15}$/;
export const PLAN_LIMITS = {subjects: 20, units: 40, days: 400, nameLength: 40, periods: 10, overrides: 600};
type Raw = Record<string, unknown>;
const obj = (value: unknown, label: string): Raw => {if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlanError(`${label}을(를) 확인해 주세요.`); return value as Raw;};
const str = (value: unknown, label: string, max = PLAN_LIMITS.nameLength, optional = false) => {
  if (typeof value !== 'string' || (!optional && !value.trim())) throw new PlanError(`${label}을(를) 적어 주세요.`);
  const text = value.trim();
  if (text.length > max || /[\u0000-\u001f]/.test(text)) throw new PlanError(`${label}은(는) ${max}자까지예요.`);
  return text;
};
const int = (value: unknown, label: string, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new PlanError(`${label}은(는) ${min}~${max} 사이 정수예요.`);
  return value;
};
const date = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new PlanError(`${label} 날짜를 확인해 주세요.`);
  return value;
};
const list = (value: unknown, label: string, max: number) => {if (!Array.isArray(value) || value.length > max) throw new PlanError(`${label}은(는) ${max}개까지예요.`); return value;};

export function planInput(value: unknown): import('./engine').Plan {
  const raw = obj(value, '계획');
  const startsOn = date(raw.startsOn, '학년도 시작'), semester2On = date(raw.semester2On, '2학기 시작'), endsOn = date(raw.endsOn, '학년도 끝');
  if (!(startsOn < semester2On && semester2On <= endsOn)) throw new PlanError('학년도 시작 < 2학기 시작 ≤ 학년도 끝 순서여야 해요.');
  if ((Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000 > 400) throw new PlanError('학년도는 400일을 넘을 수 없어요.');
  const periodsPerDay = int(raw.periodsPerDay, '하루 교시 수', 1, PLAN_LIMITS.periods);
  const subjects = list(raw.subjects, '교과', PLAN_LIMITS.subjects).map((item, index) => {
    const entry = obj(item, `${index + 1}번째 교과`), standard = obj(entry.standard, '기준시수'), units = obj(entry.units, '단원');
    if (typeof entry.key !== 'string' || !KEY.test(entry.key)) throw new PlanError('교과 키를 확인해 주세요.');
    const unitList = (semester: 1 | 2) => list(units[semester], '단원', PLAN_LIMITS.units).map(unit => {const u = obj(unit, '단원'); return {name: str(u.name, '단원 이름'), hours: int(u.hours, '단원 차시', 0, 400)};});
    return {
      key: entry.key, name: str(entry.name, '교과 이름', 20), short: str(entry.short, '교과 줄임말', 4), tone: typeof entry.tone === 'string' && TONES.includes(entry.tone) ? entry.tone : 'sand',
      standard: {1: int(standard[1], '1학기 기준시수', 0, 400), 2: int(standard[2], '2학기 기준시수', 0, 400)}, units: {1: unitList(1), 2: unitList(2)},
    };
  });
  const keys = new Set(subjects.map(entry => entry.key));
  if (keys.size !== subjects.length) throw new PlanError('같은 교과가 두 번 있어요.');
  const templates = obj(raw.templates, '기초시간표'), slotList = (semester: 1 | 2) => {
    const seen = new Set<string>();
    return list(templates[semester], `${semester}학기 기초시간표`, 5 * PLAN_LIMITS.periods).map(item => {
      const slot = obj(item, '시간표 칸'), weekday = int(slot.weekday, '요일', 1, 5), period = int(slot.period, '교시', 1, periodsPerDay);
      if (typeof slot.subject !== 'string' || !keys.has(slot.subject)) throw new PlanError('시간표에 없는 교과가 있어요.');
      if (seen.has(`${weekday}:${period}`)) throw new PlanError('같은 요일·교시에 과목이 둘이에요.');
      seen.add(`${weekday}:${period}`);
      return {weekday, period, subject: slot.subject};
    });
  };
  const seenDays = new Set<string>();
  const days = list(raw.days, '학사일정', PLAN_LIMITS.days).map(item => {
    const day = obj(item, '학사일정'), on = date(day.date, '학사일정');
    if (on < startsOn || on > endsOn) throw new PlanError(`${on}은(는) 학년도 밖이에요.`);
    if (seenDays.has(on)) throw new PlanError(`${on}에 일정이 두 개예요.`);
    seenDays.add(on);
    if (!(KINDS as readonly unknown[]).includes(day.kind)) throw new PlanError('일정 종류를 확인해 주세요.');
    const note = {date: on, kind: day.kind as typeof KINDS[number], name: str(day.name, '일정 이름', 30)};
    return day.periods === undefined || day.periods === null ? note : {...note, periods: int(day.periods, '행사일 교시', 1, periodsPerDay)};
  }).sort((a, b) => a.date.localeCompare(b.date));
  const seenChanges = new Set<string>();
  const overrides = (raw.overrides === undefined ? [] : list(raw.overrides, '하루 시간표 바꾸기', PLAN_LIMITS.overrides)).map(item => {
    const change = obj(item, '하루 시간표 바꾸기'), on = date(change.date, '바꾸는 날'), period = int(change.period, '바꾸는 교시', 1, periodsPerDay);
    if (on < startsOn || on > endsOn) throw new PlanError(`${on}은(는) 학년도 밖이에요.`);
    if (seenChanges.has(`${on}:${period}`)) throw new PlanError(`${on} ${period}교시를 두 번 바꿨어요.`);
    seenChanges.add(`${on}:${period}`);
    if (change.subject !== null && (typeof change.subject !== 'string' || !keys.has(change.subject))) throw new PlanError('바꾸는 과목을 확인해 주세요.');
    const value = {date: on, period, subject: change.subject as string | null};
    return change.note === undefined || change.note === '' ? value : {...value, note: str(change.note, '바꾼 이유', 30)};
  }).sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
  return {
    overrides,
    sample: false, schoolName: str(raw.schoolName, '학교 이름'), className: str(raw.className, '학급 이름', 20), grade: int(raw.grade, '학년', 1, 6), year: int(raw.year, '학년도', 2020, 2100),
    startsOn, semester2On, endsOn, periodsPerDay, subjects, templates: {1: slotList(1), 2: slotList(2)}, days, daysRequired: int(raw.daysRequired, '법정 수업일수', 0, 250),
  };
}
