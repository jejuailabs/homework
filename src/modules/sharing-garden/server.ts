import 'server-only';
import {AggregateField, FieldValue} from 'firebase-admin/firestore';
import {db} from '@/lib/server/admin';
import type {Context} from '@/lib/server/auth';
import {ApiError, canManageClass, id} from '@/lib/server/policy';
import {MONTHLY_CAP, WON_PER_POINT, creditMonth, gardenStage, isPaidClass, percentOf, publicClassLabel, seoulMonth, sharingConfig, validMonth, type ClassView, type NationalView} from './policy';

// classes/{classId}/growthMonthly/{YYYY-MM}
// {classId, month, points, credited, full, paid, updatedAt, filledAt?}
// Written only by the server inside the homework review transaction. Clients never read it directly.
const monthRef = (classId: string, month: string) => db().doc(`classes/${classId}/growthMonthly/${month}`);
const config = () => sharingConfig(process.env);

/** Read phase: call before any transaction write (Firestore needs every read first). */
export async function readClassGarden(tx: FirebaseFirestore.Transaction, classId: string, at = new Date()) {
  const month = seoulMonth(at), ref = monthRef(classId, month);
  const [snap, cls] = await Promise.all([tx.get(ref), tx.get(db().doc(`classes/${classId}`))]);
  return {ref, month, classId, previous: snap.data(), paid: isPaidClass(cls.data())};
}

/** Write phase: adds the same reward the student's own flowers got, capped per class month. */
export function writeClassGarden(tx: FirebaseFirestore.Transaction, read: Awaited<ReturnType<typeof readClassGarden>>, amount: number) {
  const next = creditMonth(read.previous, amount), stamp = new Date().toISOString();
  tx.set(read.ref, {
    classId: read.classId, month: read.month, points: next.points, credited: next.credited, full: next.full, paid: read.paid, updatedAt: stamp,
    ...(next.justFilled ? {filledAt: stamp} : {}),
  }, {merge: true});
  return next;
}

let cached: {key: string; at: number; value: Omit<NationalView, 'ranking'> & {ranking: (NationalView['ranking'][number] & {classId: string})[]}} | null = null;

/** National totals and the top classes, shared by every viewer and cached for a minute per instance. */
async function national(month: string) {
  try { return await nationalTotals(month); } catch (error) {
    // A missing index or a quota hiccup must not take the review flow or the student home down with it.
    console.error('[sharing-garden] national', error instanceof Error ? error.message : 'Unknown');
    const settings = config();
    return {month, preview: !settings.requirePaid, recipient: settings.recipient, monthWon: 0, monthClasses: 0, fullClasses: 0, goalWon: settings.monthlyGoalWon, goalPercent: 0, totalWon: 0, ranking: [], unavailable: true};
  }
}
async function nationalTotals(month: string) {
  const key = month;
  if (cached && cached.key === key && Date.now() - cached.at < 60_000) return cached.value;
  const settings = config();
  const groups = db().collectionGroup('growthMonthly');
  const base = settings.requirePaid ? groups.where('paid', '==', true) : groups;
  const thisMonth = base.where('month', '==', month);
  const [monthAgg, fullAgg, totalAgg, top] = await Promise.all([
    thisMonth.aggregate({won: AggregateField.sum('credited'), classes: AggregateField.count()}).get(),
    thisMonth.where('full', '==', true).count().get(),
    base.aggregate({won: AggregateField.sum('credited')}).get(),
    thisMonth.orderBy('credited', 'desc').limit(10).get(),
  ]);
  const classes = top.docs.length ? await db().getAll(...top.docs.map(doc => db().doc(`classes/${doc.data().classId}`))) : [];
  const monthWon = Math.round((monthAgg.data().won || 0) * WON_PER_POINT);
  const value = {
    month, preview: !settings.requirePaid, recipient: settings.recipient,
    monthWon, monthClasses: monthAgg.data().classes, fullClasses: fullAgg.data().count,
    goalWon: settings.monthlyGoalWon, goalPercent: percentOf(monthWon, settings.monthlyGoalWon),
    totalWon: Math.round((totalAgg.data().won || 0) * WON_PER_POINT),
    ranking: top.docs.map((doc, index) => ({
      classId: doc.data().classId as string, label: publicClassLabel(classes[index]?.data()),
      won: (doc.data().credited || 0) * WON_PER_POINT, full: doc.data().full === true,
    })).filter(row => row.won > 0).map((row, index) => ({rank: index + 1, ...row})),
  };
  cached = {key, at: Date.now(), value};
  return value;
}

function classView(month: string, cls: FirebaseFirestore.DocumentData | undefined, row: FirebaseFirestore.DocumentData | undefined): ClassView {
  const credited = Math.min(MONTHLY_CAP, row?.credited || 0);
  return {month, points: row?.points || 0, credited, cap: MONTHLY_CAP, stage: gardenStage(credited), showName: cls?.sharingGarden?.showName === true, label: publicClassLabel(cls), paid: isPaidClass(cls)};
}

/** Classes this viewer may see as "ours": a student's one class, or the classes a teacher owns. */
async function viewerClasses(ctx: Context | null) {
  if (!ctx) return [];
  if (ctx.role === 'student') { const doc = await db().doc(`classes/${ctx.classId}`).get(); return doc.exists ? [doc] : []; }
  return (await db().collection('classes').where('ownerUid', '==', ctx.uid).limit(30).get()).docs.filter(doc => doc.data().adminStatus !== 'deleted');
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
    classes: mine.map((doc, index) => ({id: doc.id, name: ctx?.role === 'student' ? undefined : doc.data()?.name as string, ...classView(month, doc.data(), rows[index]?.data())})),
    role: ctx ? (ctx.role === 'student' ? 'student' : 'teacher') : 'guest',
  };
}

/** Teachers decide whether their class name may appear in the national ranking. */
export async function setShowName(ctx: Context, classId: unknown, showName: unknown) {
  if (typeof showName !== 'boolean') throw new ApiError(400, '공개 여부를 골라 주세요.');
  const ref = db().doc(`classes/${id(classId, '학급')}`), doc = await ref.get();
  if (!doc.exists) throw new ApiError(404, '학급을 찾을 수 없어요.', 'NOT_FOUND');
  if (!canManageClass(ctx.role, ctx.uid, doc.data()?.ownerUid)) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
  await ref.update({'sharingGarden.showName': showName, 'sharingGarden.updatedAt': FieldValue.serverTimestamp()});
  cached = null;
  return {ok: true, showName};
}

/** Berry's read: one owned class's month plus the national line, with no student names. */
export async function gardenForClass(classId: string, cls: FirebaseFirestore.DocumentData, requestedMonth?: unknown) {
  const month = validMonth(requestedMonth) ? requestedMonth : seoulMonth(new Date());
  const [row, view] = await Promise.all([monthRef(classId, month).get(), national(month)]);
  const mine = classView(month, cls, row.data());
  return {
    month, points: mine.points, credited: mine.credited, cap: mine.cap, won: mine.credited * WON_PER_POINT, stage: mine.stage.label, show_name: mine.showName,
    national: {month_won: view.monthWon, classes: view.monthClasses, full_classes: view.fullClasses, goal_won: view.goalWon, goal_percent: view.goalPercent, total_won: view.totalWon, recipient: view.recipient || null, preview: view.preview},
  };
}
