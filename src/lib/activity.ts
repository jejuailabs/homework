/**
 * Screen time statistics shared by the browser tracker, the recording API and the admin page.
 * The browser keeps active time in memory and sends it every few minutes; the server adds it to one
 * document per person per day, and a nightly summary is all the admin page reads.
 */
export const ACTIVITY_TICK_MS = 15_000;
export const ACTIVITY_IDLE_MS = 120_000;
export const ACTIVITY_FLUSH_MS = 300_000;
/** Raw per-person days are deleted after this many days; daily summaries stay. */
export const ACTIVITY_RETENTION_DAYS = 90;
// One flush covers at most one flush interval plus slack; a busy screen never needs more.
const FLUSH_MS_CAP = 10 * 60_000;
const FLUSH_VIEWS_CAP = 200;
const DAY_MS = 86_400_000;

export const activityRoles = ['teacher', 'student', 'parent', 'admin'] as const;
export type ActivityRole = (typeof activityRoles)[number];
export const activityRoleName: Record<ActivityRole, string> = {teacher: '교사', student: '학생', parent: '학부모·방문자', admin: '운영자'};

export const activityScreenName = {
  'teacher-home': '교사 홈', 'teacher-homework': '숙제', 'teacher-exhibitions': '작품전시', 'teacher-boards': '참여보드',
  'teacher-daily-quiz': '퀴즈', 'teacher-lesson-review': '복습하기', 'teacher-playground': '말놀이터', 'teacher-cards': '카드놀이',
  'teacher-diary': 'Kids Daily', 'teacher-tools': 'Tools', 'teacher-points': '보말', 'teacher-me': '마이페이지', 'teacher-berry': '베리', 'teacher-other': '교사 기타',
  'student-home': '학생 홈·숙제', 'student-exhibitions': '작품전시', 'student-my-exhibition': '나의 전시실', 'student-boards': '참여보드',
  'student-daily-quiz': '퀴즈', 'student-lesson-review': '복습하기', 'student-playground': '말놀이터', 'student-cards': '카드놀이',
  'student-my-space': '나의 작은 세상', 'student-canvases': '함께캔버스', 'student-polls': '학급 투표', 'student-shop': '보말 상점', 'student-other': '학생 기타',
  'public-gallery': '공개 전시 관람', 'public-board': '공개 보드 관람', 'admin': '운영 관리',
} as const;
export type ActivityScreen = keyof typeof activityScreenName;
export const isActivityScreen = (value: unknown): value is ActivityScreen => typeof value === 'string' && Object.hasOwn(activityScreenName, value);
export const isPublicScreen = (screen: ActivityScreen) => screen.startsWith('public-');

/** The screen a path belongs to, or null for pages that are not counted (login, sign-in callbacks). */
export function activityScreen(path: string): ActivityScreen | null {
  const [area, section] = path.split('?')[0].split('/').filter(Boolean);
  if (area === 'gallery') return 'public-gallery';
  if (area === 'board') return 'public-board';
  if (area === 'admin') return 'admin';
  if (area === 'berry') return 'teacher-berry';
  if (area !== 'teacher' && area !== 'student') return null;
  const key = `${area}-${section || 'home'}`;
  return isActivityScreen(key) ? key : `${area}-other`;
}

export type ActivityCounters = Partial<Record<ActivityScreen, {ms: number; views: number}>>;

/** Keeps known screens and whole, bounded numbers; the whole flush is capped at one interval's worth. */
export function cleanActivity(value: unknown, publicOnly = false): ActivityCounters {
  const result: ActivityCounters = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  let budget = FLUSH_MS_CAP;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isActivityScreen(key) || (publicOnly && !isPublicScreen(key)) || !raw || typeof raw !== 'object') continue;
    const {ms, views} = raw as Record<string, unknown>;
    const time = typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? Math.min(Math.round(ms), budget) : 0;
    const count = typeof views === 'number' && Number.isFinite(views) && views > 0 ? Math.min(Math.round(views), FLUSH_VIEWS_CAP) : 0;
    if (!time && !count) continue;
    budget -= time;
    result[key] = {ms: time, views: count};
  }
  return result;
}

export const seoulDay = (time = Date.now()) => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul'}).format(time);
export const seoulHour = (time = Date.now()) => Number(new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23'}).format(time));
/** Calendar days before `day` ("2026-11-03" minus 1 is "2026-11-02"). */
export const shiftDay = (day: string, by: number) => new Date(Date.parse(day + 'T00:00:00Z') + by * DAY_MS).toISOString().slice(0, 10);

/** One stored person-day, as the recording API writes it. */
export type ActivityDay = {role?: unknown; uid?: unknown; classId?: unknown; totalMs?: unknown; hours?: unknown; screens?: unknown};
type Tally = {users: number; ms: number; views: number};
export type ActivitySummary = {
  roles: Partial<Record<ActivityRole, Tally>>;
  screens: Partial<Record<ActivityScreen, Partial<Record<ActivityRole, Tally>>>>;
  hours: Partial<Record<ActivityRole, number[]>>;
  classes: Record<string, {users: number; ms: number}>;
  teachers: Record<string, {ms: number; views: number}>;
};
const amount = (value: unknown, cap = DAY_MS) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(value, cap) : 0;
const tally = (): Tally => ({users: 0, ms: 0, views: 0});

/** Folds person-days into one day's summary. A person's day never counts more than 24 hours. */
export function summarizeActivity(rows: ActivityDay[]): ActivitySummary {
  const summary: ActivitySummary = {roles: {}, screens: {}, hours: {}, classes: {}, teachers: {}};
  for (const row of rows) {
    const role = activityRoles.includes(row.role as ActivityRole) ? row.role as ActivityRole : null;
    if (!role) continue;
    const screens = row.screens && typeof row.screens === 'object' ? Object.entries(row.screens as Record<string, {ms?: unknown; views?: unknown}>).filter(([key]) => isActivityScreen(key)) : [];
    const ms = amount(row.totalMs), views = screens.reduce((sum, [, value]) => sum + amount(value?.views, 10_000), 0);
    if (!ms && !views) continue;
    const total = summary.roles[role] ??= tally();
    total.users++; total.ms += ms; total.views += views;
    for (const [key, value] of screens) {
      const time = amount(value?.ms), seen = amount(value?.views, 10_000);
      if (!time && !seen) continue;
      const cell = (summary.screens[key as ActivityScreen] ??= {})[role] ??= tally();
      cell.users++; cell.ms += time; cell.views += seen;
    }
    const hours = summary.hours[role] ??= Array(24).fill(0);
    if (row.hours && typeof row.hours === 'object') for (const [hour, value] of Object.entries(row.hours as Record<string, unknown>)) if (/^\d{1,2}$/.test(hour) && +hour < 24) hours[+hour] += amount(value, 3_600_000);
    if (role === 'student' && typeof row.classId === 'string' && row.classId) {
      const room = summary.classes[row.classId] ??= {users: 0, ms: 0};
      room.users++; room.ms += ms;
    }
    if (role === 'teacher' && typeof row.uid === 'string' && row.uid) {
      const teacher = summary.teachers[row.uid] ??= {ms: 0, views: 0};
      teacher.ms += ms; teacher.views += views;
    }
  }
  return summary;
}

/** "1시간 5분", "12분", "40초": the unit a teacher reads at a glance. */
export function activityDuration(ms: number) {
  if (ms < 60_000) return ms > 0 ? `${Math.max(1, Math.round(ms / 1000))}초` : '0분';
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours.toLocaleString('ko-KR')}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}` : `${minutes}분`;
}
