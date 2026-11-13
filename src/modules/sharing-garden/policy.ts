// 함께 모은 성장 꽃 → 학급 나눔 꽃밭. Pure rules shared by the server, the screens and the tests.
// Nothing here moves money: a class month is a settlement record the operator pays out separately.

/** A class can grow at most this many sharing points a month (1 point = 1 won, 5% of the 30,000 won plan). */
export const MONTHLY_CAP = 1500;
export const WON_PER_POINT = 1;
export const CLASS_PLAN_WON = 30000;

export type SharingConfig = {
  /** Where the money goes. Chosen by the operator each round; empty until then. */
  recipient: string;
  /** Count only classes on the paid plan. Billing does not exist yet, so every class previews the garden. */
  requirePaid: boolean;
  /** National monthly target shown on the progress bar, in won. */
  monthlyGoalWon: number;
};

export function sharingConfig(env: Record<string, string | undefined> = {}): SharingConfig {
  const goal = Number(env.SHARING_GARDEN_GOAL_WON);
  return {
    recipient: (env.SHARING_GARDEN_RECIPIENT || '').trim().slice(0, 80),
    requirePaid: env.SHARING_GARDEN_REQUIRE_PAID === 'true',
    monthlyGoalWon: Number.isSafeInteger(goal) && goal > 0 ? goal : 1_500_000,
  };
}

/** YYYY-MM in Korea time, so a check at 23:30 on the last day still counts for that month. */
export function seoulMonth(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit'}).formatToParts(at);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`;
}
export function validMonth(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

const whole = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

/** Adds a reward to a class month. `points` keeps everything the class grew; `credited` stops at the cap. */
export function creditMonth(previous: {points?: unknown; credited?: unknown} | undefined, amount: number) {
  const before = whole(previous?.points), add = whole(amount);
  const points = before + add;
  const creditedBefore = Math.min(MONTHLY_CAP, whole(previous?.credited));
  const credited = Math.min(MONTHLY_CAP, points);
  return {points, credited, added: credited - creditedBefore, full: credited >= MONTHLY_CAP, justFilled: creditedBefore < MONTHLY_CAP && credited >= MONTHLY_CAP};
}

/** Billing placeholder: a class becomes paid when a future billing flow sets `billing.paid`. */
export function isPaidClass(cls: {billing?: {paid?: unknown}} | undefined) { return cls?.billing?.paid === true; }

/** 시·도 17곳. `row`/`col` place each one on the small tile map of Korea in the dashboard. */
export const REGIONS = [
  {code: 'seoul', name: '서울', row: 1, col: 3}, {code: 'gangwon', name: '강원', row: 1, col: 4},
  {code: 'incheon', name: '인천', row: 2, col: 2}, {code: 'gyeonggi', name: '경기', row: 2, col: 3}, {code: 'chungbuk', name: '충북', row: 2, col: 4},
  {code: 'chungnam', name: '충남', row: 3, col: 2}, {code: 'sejong', name: '세종', row: 3, col: 3}, {code: 'daejeon', name: '대전', row: 3, col: 4}, {code: 'gyeongbuk', name: '경북', row: 3, col: 5},
  {code: 'jeonbuk', name: '전북', row: 4, col: 2}, {code: 'daegu', name: '대구', row: 4, col: 4}, {code: 'ulsan', name: '울산', row: 4, col: 5},
  {code: 'gwangju', name: '광주', row: 5, col: 2}, {code: 'jeonnam', name: '전남', row: 5, col: 3}, {code: 'gyeongnam', name: '경남', row: 5, col: 4}, {code: 'busan', name: '부산', row: 5, col: 5},
  {code: 'jeju', name: '제주', row: 6, col: 2},
] as const;
export type RegionCode = (typeof REGIONS)[number]['code'];
export const regionName = (code: unknown) => REGIONS.find(region => region.code === code)?.name ?? '';

/** How much of the class appears in public: the region only (default), plus the school, plus the class name. */
export const VISIBILITY = ['region', 'school', 'class'] as const;
export type Visibility = (typeof VISIBILITY)[number];
export type GardenSettings = {joined: boolean; region: RegionCode | ''; school: string; visibility: Visibility};

/** Whatever is stored, a class only takes part when its teacher turned it on and picked a region. */
export function gardenSettings(raw: unknown): GardenSettings {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const region = REGIONS.some(item => item.code === value.region) ? value.region as RegionCode : '';
  const school = typeof value.school === 'string' ? cleanSchool(value.school) : '';
  const visibility = VISIBILITY.includes(value.visibility as Visibility) ? value.visibility as Visibility : 'region';
  return {joined: value.joined === true && !!region, region, school, visibility};
}
const cleanSchool = (text: string) => text.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);

/** Validates what a teacher sends from the settings card. */
export function settingsInput(raw: unknown): GardenSettings {
  if (!raw || typeof raw !== 'object') throw new Error('설정 내용을 확인해 주세요.');
  const value = raw as Record<string, unknown>;
  if (typeof value.joined !== 'boolean') throw new Error('참여 여부를 골라 주세요.');
  if (!REGIONS.some(item => item.code === value.region)) { if (value.joined) throw new Error('시·도를 골라 주세요.'); }
  if (value.school !== undefined && typeof value.school !== 'string') throw new Error('학교 이름을 확인해 주세요.');
  if (typeof value.school === 'string' && value.school.trim().length > 30) throw new Error('학교 이름은 30자까지 적을 수 있어요.');
  if (!VISIBILITY.includes(value.visibility as Visibility)) throw new Error('공개 범위를 골라 주세요.');
  const school = typeof value.school === 'string' ? cleanSchool(value.school) : '';
  if (value.visibility !== 'region' && !school) throw new Error('학교까지 공개하려면 학교 이름을 적어 주세요.');
  return {joined: value.joined, region: REGIONS.some(item => item.code === value.region) ? value.region as RegionCode : '', school, visibility: value.visibility as Visibility};
}

/** The public name of a class. Student names never appear; school and class name only when the teacher chose so. */
export function publicClassLabel(cls: {name?: unknown; grade?: unknown; sharingGarden?: unknown} | undefined) {
  const settings = gardenSettings(cls?.sharingGarden), region = regionName(settings.region);
  const grade = typeof cls?.grade === 'string' ? cls.grade.replace(/[^0-9]/g, '').slice(0, 1) : '';
  const gradeText = grade ? `${grade}학년` : '';
  const className = typeof cls?.name === 'string' ? cls.name.trim().slice(0, 30) : '';
  const parts = [region];
  if (settings.visibility === 'region' || !settings.school) parts.push(gradeText ? `${gradeText} 어느 반` : '어느 반');
  else if (settings.visibility === 'school') parts.push([settings.school, gradeText || '어느 반'].join(' '));
  else parts.push([settings.school, className || gradeText || '어느 반'].join(' '));
  return parts.filter(Boolean).join(' · ');
}

export const GARDEN_STAGES = [
  {min: 0, label: '씨앗', emoji: '🌰'},
  {min: 300, label: '새싹', emoji: '🌱'},
  {min: 750, label: '봉오리', emoji: '🌷'},
  {min: 1200, label: '꽃', emoji: '🌸'},
  {min: MONTHLY_CAP, label: '꽃밭 완성', emoji: '💐'},
] as const;
export function gardenStage(credited: number) {
  const value = Math.min(MONTHLY_CAP, whole(credited));
  let index = 0;
  GARDEN_STAGES.forEach((stage, i) => { if (value >= stage.min) index = i; });
  const next = GARDEN_STAGES[index + 1];
  return {index, ...GARDEN_STAGES[index], next: next ? next.min : null, percent: Math.round(value / MONTHLY_CAP * 100)};
}

export function percentOf(value: number, goal: number) {
  return goal > 0 ? Math.max(0, Math.min(100, Math.round(whole(value) / goal * 1000) / 10)) : 0;
}

export type NationalView = {
  month: string; preview: boolean; recipient: string;
  monthWon: number; monthClasses: number; fullClasses: number; goalWon: number; goalPercent: number;
  totalWon: number;
  /** True when the national totals could not be read this time; the class garden still shows. */
  unavailable?: boolean;
  ranking: {rank: number; label: string; won: number; full: boolean; mine?: boolean}[];
  regions: {code: RegionCode; name: string; won: number; classes: number}[];
};
export type ClassView = {month: string; points: number; credited: number; cap: number; stage: ReturnType<typeof gardenStage>; settings: GardenSettings; label: string; paid: boolean};
