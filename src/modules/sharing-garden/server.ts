import 'server-only';
import {AggregateField, FieldValue} from 'firebase-admin/firestore';
import {db} from '@/lib/server/admin';
import type {Context} from '@/lib/server/auth';
import {ApiError, canManageClass, id} from '@/lib/server/policy';
import {MONTHLY_CAP, REGIONS, WON_PER_POINT, creditMonth, gardenSettings, gardenStage, isPaidClass, percentOf, publicClassLabel, regionName, seoulMonth, settingsInput, sharingConfig, validMonth, type ClassView, type NationalView} from './policy';

// classes/{classId}/growthMonthly/{YYYY-MM}
// {classId, month, region, points, credited, full, paid, updatedAt, filledAt?}
// Written only by the server inside the homework review transaction, and only for classes whose teacher joined.
// Clients never read it directly.
const monthRef = (classId: string, month: string) => db().doc(`classes/${classId}/growthMonthly/${month}`);
const config = () => sharingConfig(process.env);

/** Read phase: call before any transaction write (Firestore needs every read first). */
export async function readClassGarden(tx: FirebaseFirestore.Transaction, classId: string, at = new Date()) {
  const month = seoulMonth(at), ref = monthRef(classId, month);
  const [snap, cls] = await Promise.all([tx.get(ref), tx.get(db().doc(`classes/${classId}`))]);
  const settings = gardenSettings(cls.data()?.sharingGarden);
  return {ref, month, classId, previous: snap.data(), paid: isPaidClass(cls.data()), joined: settings.joined, region: settings.region};
}

/** Write phase: adds the same reward the student's own flowers got, capped per class month. Classes that did not join are left alone. */
export function writeClassGarden(tx: FirebaseFirestore.Transaction, read: Awaited<ReturnType<typeof readClassGarden>>, amount: number) {
  if (!read.joined) return null;
  const next = creditMonth(read.previous, amount), stamp = new Date().toISOString();
  tx.set(read.ref, {
    classId: read.classId, month: read.month, region: read.region, points: next.points, credited: next.credited, full: next.full, paid: read.paid, updatedAt: stamp,
    ...(next.justFilled ? {filledAt: stamp} : {}),
  }, {merge: true});
  return next;
}

type Totals = Omit<NationalView, 'ranking'> & {ranking: (NationalView['ranking'][number] & {classId: string})[]};
let cached: {key: string; at: number; value: Totals} | null = null;

/** National totals, regions and top classes, shared by every viewer and cached for a minute per instance. */
async function national(month: string): Promise<Totals> {
  try { return await nationalTotals(month); } catch (error) {
    // A missing index or a quota hiccup must not take the review flow or the student home down with it.
    console.error('[sharing-garden] national', error instanceof Error ? error.message : 'Unknown');
    const settings = config();
    return {month, preview: !settings.requirePaid, recipient: settings.recipient, monthWon: 0, monthClasses: 0, fullClasses: 0, goalWon: settings.monthlyGoalWon, goalPercent: 0, totalWon: 0, ranking: [], regions: REGIONS.map(region => ({code: region.code, name: region.name, won: 0, classes: 0})), unavailable: true};
  }
}
async function nationalTotals(month: string): Promise<Totals> {
  if (cached && cached.key === month && Date.now() - cached.at < 60_000) return cached.value;
  const settings = config();
  const groups = db().collectionGroup('growthMonthly');
  const base = settings.requirePaid ? groups.where('paid', '==', true) : groups;
  const thisMonth = base.where('month', '==', month);
  const [monthAgg, fullAgg, totalAgg, top, regions] = await Promise.all([
    thisMonth.aggregate({won: AggregateField.sum('credited'), classes: AggregateField.count()}).get(),
    thisMonth.where('full', '==', true).count().get(),
    base.aggregate({won: AggregateField.sum('credited')}).get(),
    // A few spare rows: classes that left the garden this month keep their record but leave the ranking.
    thisMonth.orderBy('credited', 'desc').limit(20).get(),
    Promise.all(REGIONS.map(region => thisMonth.where('region', '==', region.code).aggregate({won: AggregateField.sum('credited'), classes: AggregateField.count()}).get())),
  ]);
  const classes = top.docs.length ? await db().getAll(...top.docs.map(doc => db().doc(`classes/${doc.data().classId}`))) : [];
  const monthWon = Math.round((monthAgg.data().won || 0) * WON_PER_POINT);
  const value: Totals = {
    month, preview: !settings.requirePaid, recipient: settings.recipient,
    monthWon, monthClasses: monthAgg.data().classes, fullClasses: fullAgg.data().count,
    goalWon: settings.monthlyGoalWon, goalPercent: percentOf(monthWon, settings.monthlyGoalWon),
    totalWon: Math.round((totalAgg.data().won || 0) * WON_PER_POINT),
    ranking: top.docs.map((doc, index) => ({
      classId: doc.data().classId as string, joined: gardenSettings(classes[index]?.data()?.sharingGarden).joined, label: publicClassLabel(classes[index]?.data()),
      won: (doc.data().credited || 0) * WON_PER_POINT, full: doc.data().full === true,
    })).filter(row => row.joined && row.won > 0).slice(0, 10).map(({joined: _joined, ...row}, index) => ({rank: index + 1, ...row})),
    regions: REGIONS.map((region, index) => ({code: region.code, name: region.name, won: Math.round((regions[index].data().won || 0) * WON_PER_POINT), classes: regions[index].data().classes})),
  };
  cached = {key: month, at: Date.now(), value};
  return value;
}

function classView(month: string, cls: FirebaseFirestore.DocumentData | undefined, row: FirebaseFirestore.DocumentData | undefined): ClassView {
  const credited = Math.min(MONTHLY_CAP, row?.credited || 0);
  return {month, points: row?.points || 0, credited, cap: MONTHLY_CAP, stage: gardenStage(credited), settings: gardenSettings(cls?.sharingGarden), label: publicClassLabel(cls), paid: isPaidClass(cls)};
}

/** Classes this viewer may see as "ours": a student's one class, or the classes a teacher owns. */
async function viewerClasses(ctx: Context | null) {
  if (!ctx) return [];
  if (ctx.role === 'student') { const doc = await db().doc(`classes/${ctx.classId}`).get(); return doc.exists ? [doc] : []; }
  return (await db().collection('classes').where('ownerUid', '==', ctx.uid).limit(30).get()).docs.filter(doc => !['deleted', 'archived'].includes(doc.data().adminStatus));
}

/** The dashboard: national numbers for everyone, plus the viewer's own classes when signed in. */
export async function dashboard(ctx: Context | null, requestedMonth?: string | null) {
  const month = validMonth(requestedMonth) ? requestedMonth : seoulMonth(new Date());
  const [view, mine] = await Promise.all([national(month), viewerClasses(ctx)]);
  const rows = mine.length ? await db().getAll(...mine.map(doc => monthRef(doc.id, month))) : [];
  const ids = new Set(mine.map(doc => doc.id));
  return {
    ...view,
    ranking: view.ranking.map(({classId, ...row}) => ({...row, ...(ids.has(classId) ? {mine: true} : {})})),
    // A student sees their class only when it takes part; the teacher sees every class to decide.
    classes: mine.map((doc, index) => ({id: doc.id, ...(ctx?.role === 'student' ? {} : {name: doc.data()?.name as string, grade: doc.data()?.grade as string}), ...classView(month, doc.data(), rows[index]?.data())}))
      .filter(row => ctx?.role !== 'student' || row.settings.joined),
    role: ctx ? (ctx.role === 'student' ? 'student' : 'teacher') : 'guest',
  };
}

/** A teacher joins or leaves, and picks the region, the school and how much of it is public. */
export async function saveSettings(ctx: Context, classId: unknown, raw: unknown) {
  let next;
  try { next = settingsInput(raw); } catch (error) { throw new ApiError(400, error instanceof Error ? error.message : '설정 내용을 확인해 주세요.'); }
  const ref = db().doc(`classes/${id(classId, '학급')}`), month = seoulMonth(new Date());
  await db().runTransaction(async tx => {
    const [doc, row] = await Promise.all([tx.get(ref), tx.get(monthRef(ref.id, month))]);
    if (!doc.exists) throw new ApiError(404, '학급을 찾을 수 없어요.', 'NOT_FOUND');
    if (!canManageClass(ctx.role, ctx.uid, doc.data()?.ownerUid)) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
    const before = gardenSettings(doc.data()?.sharingGarden);
    const joinedAt = next.joined ? (before.joined && doc.data()?.sharingGarden?.joinedAt) || new Date().toISOString() : null;
    tx.update(ref, {sharingGarden: {...next, joinedAt, updatedAt: FieldValue.serverTimestamp()}});
    // This month's record follows a region change, so the regional totals stay right.
    if (row.exists && next.region && row.data()?.region !== next.region) tx.update(row.ref, {region: next.region});
  });
  cached = null;
  return {ok: true, settings: next};
}

/** Berry's read: one owned class's month plus the national line, with no student names. */
export async function gardenForClass(classId: string, cls: FirebaseFirestore.DocumentData, requestedMonth?: unknown) {
  const month = validMonth(requestedMonth) ? requestedMonth : seoulMonth(new Date());
  const [row, view] = await Promise.all([monthRef(classId, month).get(), national(month)]);
  const mine = classView(month, cls, row.data());
  const region = view.regions.find(item => item.code === mine.settings.region);
  return {
    month, joined: mine.settings.joined, region: regionName(mine.settings.region) || null, public_label: mine.label, visibility: mine.settings.visibility,
    points: mine.points, credited: mine.credited, cap: mine.cap, won: mine.credited * WON_PER_POINT, stage: mine.stage.label,
    region_total: region ? {won: region.won, classes: region.classes} : null,
    national: {month_won: view.monthWon, classes: view.monthClasses, full_classes: view.fullClasses, goal_won: view.goalWon, goal_percent: view.goalPercent, total_won: view.totalWon, recipient: view.recipient || null, preview: view.preview},
  };
}
