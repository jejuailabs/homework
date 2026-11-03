import 'server-only';
import {FieldValue, Timestamp} from 'firebase-admin/firestore';
import {auth, db} from './admin';
import {cookieName} from './auth';
import {ApiError} from './policy';
import {ACTIVITY_RETENTION_DAYS, activityRoles, cleanActivity, seoulDay, seoulHour, shiftDay, summarizeActivity, type ActivityRole, type ActivitySummary} from '../activity';

type Data = Record<string, any>;
type Viewer = {key: string; role: ActivityRole; uid?: string; classId?: string};

// Role lookups are reused for ten minutes per server instance, so a five-minute flush rarely reads Firestore.
const viewers = new Map<string, {viewer: Viewer; expires: number}>();
async function sessionViewer(request: Request): Promise<Viewer | null> {
  const raw = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw) return null;
  const decoded = await auth().verifySessionCookie(decodeURIComponent(raw), false).catch(() => null);
  if (!decoded) return null;
  const cached = viewers.get(decoded.uid);
  if (cached && cached.expires > Date.now()) return cached.viewer;
  const [user, platform] = await db().getAll(db().doc(`users/${decoded.uid}`), db().doc(`platformRoles/${decoded.uid}`));
  if (!user.exists && !platform.exists) return null;
  const platformRole = platform.data()?.role, data = user.data() ?? {};
  const role: ActivityRole = platformRole === 'admin' || platformRole === 'superadmin' ? 'admin' : data.role === 'student' ? 'student' : 'teacher';
  const viewer: Viewer = {key: decoded.uid, role, uid: decoded.uid, ...(role === 'student' && typeof data.classId === 'string' ? {classId: data.classId} : {})};
  if (viewers.size > 5000) viewers.clear();
  viewers.set(decoded.uid, {viewer, expires: Date.now() + 600_000});
  return viewer;
}

// Anonymous visitors only reach public pages; a per-address budget keeps a script from filling the collection.
const visitorBudget = new Map<string, {count: number; reset: number}>();
function allowVisitor(request: Request) {
  const address = (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const now = Date.now(), entry = visitorBudget.get(address);
  if (!entry || entry.reset < now) {
    if (visitorBudget.size > 5000) visitorBudget.clear();
    visitorBudget.set(address, {count: 1, reset: now + 3_600_000});
    return true;
  }
  return ++entry.count <= 60;
}

/** Adds one flush to the person's day: a single merged write, whatever the number of screens. */
export async function recordActivity(request: Request, input: Data) {
  const signedIn = await sessionViewer(request);
  const visitor = typeof input?.visitor === 'string' && /^[a-f0-9]{24}$/.test(input.visitor) ? input.visitor : '';
  const viewer: Viewer | null = signedIn ?? (visitor ? {key: 'v_' + visitor, role: 'parent'} : null);
  if (!viewer) throw new ApiError(401, '로그인이 필요해요.', 'UNAUTHENTICATED');
  const screens = cleanActivity(input?.screens, viewer.role === 'parent');
  const entries = Object.entries(screens);
  if (!entries.length) return;
  if (viewer.role === 'parent' && !allowVisitor(request)) throw new ApiError(429, '잠시 뒤에 다시 시도해 주세요.', 'RATE_LIMITED');
  const now = Date.now(), date = seoulDay(now), total = entries.reduce((sum, [, value]) => sum + value!.ms, 0);
  await db().doc(`activityDaily/${date}_${viewer.key}`).set({
    date, role: viewer.role, ...(viewer.uid ? {uid: viewer.uid} : {}), ...(viewer.classId ? {classId: viewer.classId} : {}),
    updatedAt: new Date(now).toISOString(),
    expiresAt: Timestamp.fromMillis(Date.parse(shiftDay(date, ACTIVITY_RETENTION_DAYS + 1) + 'T00:00:00+09:00')),
    totalMs: FieldValue.increment(total),
    ...(total ? {hours: {[String(seoulHour(now))]: FieldValue.increment(total)}} : {}),
    screens: Object.fromEntries(entries.map(([key, value]) => [key, {ms: FieldValue.increment(value!.ms), views: FieldValue.increment(value!.views)}])),
  }, {merge: true});
}

async function readDay(date: string) {
  const snap = await db().collection('activityDaily').where('date', '==', date).select('role', 'uid', 'classId', 'totalMs', 'hours', 'screens').get();
  return summarizeActivity(snap.docs.map(doc => doc.data()));
}

/** Class and teacher names are stored with the summary, so the admin page never looks them up again. */
async function withNames(summary: ActivitySummary) {
  const classIds = Object.keys(summary.classes).filter(id => /^[A-Za-z0-9_-]+$/.test(id)).slice(0, 1000);
  const teacherIds = Object.keys(summary.teachers).filter(id => /^[A-Za-z0-9_-]+$/.test(id)).slice(0, 1000);
  const [classes, teachers] = await Promise.all([
    classIds.length ? db().getAll(...classIds.map(id => db().doc(`classes/${id}`))) : [],
    teacherIds.length ? db().getAll(...teacherIds.map(id => db().doc(`users/${id}`))) : [],
  ]);
  return {
    classNames: Object.fromEntries(classes.map(doc => [doc.id, doc.data()?.name || '삭제된 학급'])),
    teacherNames: Object.fromEntries(teachers.map(doc => [doc.id, doc.data()?.displayName || doc.data()?.email || '이름 없는 계정'])),
  };
}

/** Builds the summary of a finished day. Safe to run again: it overwrites with the same result. */
export async function buildActivitySummary(date: string) {
  const summary = await readDay(date);
  const value = {date, builtAt: new Date().toISOString(), ...summary, ...await withNames(summary)};
  await db().doc(`activitySummary/${date}`).set(value);
  return value;
}

/** Nightly: yesterday's summary, any missed day still within retention, and expired raw days. */
export async function rollupActivity() {
  const today = seoulDay(), built: string[] = [];
  const days = Array.from({length: 7}, (_, index) => shiftDay(today, -1 - index));
  const existing = await db().getAll(...days.map(day => db().doc(`activitySummary/${day}`)));
  for (const doc of existing) if (!doc.exists || doc.id === days[0]) {await buildActivitySummary(doc.id); built.push(doc.id);}
  // TTL deletes these too; this keeps storage bounded even where no TTL policy is set.
  let removed = 0;
  for (let round = 0; round < 10; round++) {
    const snap = await db().collection('activityDaily').where('date', '<', shiftDay(today, -ACTIVITY_RETENTION_DAYS)).limit(400).get();
    if (snap.empty) break;
    const batch = db().batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    removed += snap.size;
  }
  return {built, removed};
}

const todayCache = new Map<string, {value: Data; expires: number}>();
/** Admin page: finished days from summaries (built on demand when missing), today read live and cached for a minute. */
export async function adminActivity(params: URLSearchParams) {
  const span = [7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 7;
  const today = seoulDay(), dates = Array.from({length: span}, (_, index) => shiftDay(today, index - span));
  const docs = await db().getAll(...dates.map(day => db().doc(`activitySummary/${day}`)));
  const oldest = shiftDay(today, -ACTIVITY_RETENTION_DAYS);
  // Missing days are filled a few at a time so the first visit after launch stays quick.
  let builds = 0;
  const days: Data[] = [];
  for (const doc of docs) {
    if (doc.exists) days.push(doc.data()!);
    else if (doc.id >= oldest && builds < 14) {builds++; days.push(await buildActivitySummary(doc.id));}
    else days.push({date: doc.id, missing: true});
  }
  let live = todayCache.get(today);
  if (!live || live.expires < Date.now()) {
    const summary = await readDay(today);
    live = {value: {date: today, live: true, ...summary, ...await withNames(summary)}, expires: Date.now() + 60_000};
    todayCache.clear(); todayCache.set(today, live);
  }
  return {span, today: live.value, days, pending: days.filter(day => day.missing).length, roles: activityRoles, retentionDays: ACTIVITY_RETENTION_DAYS, checkedAt: new Date().toISOString()};
}
