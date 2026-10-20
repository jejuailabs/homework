import 'server-only';
import {AggregateField, FieldValue} from 'firebase-admin/firestore';
import {db} from './admin';
import {ApiError} from './policy';
import {BASE_PLAN_BYTES, daysUntil, fitsPlan, planPeriodEnd, storageCategories, usageLevel, type StorageCategory, type StoragePlanView} from '../storage-plan';

type Data = FirebaseFirestore.DocumentData;
const planRef = (uid: string) => db().doc(`teacherPlans/${uid}`);
const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);

/** Created on first use: the one-year period starts when the teacher first meets the plan. */
async function teacherPlan(uid: string): Promise<Data> {
  return db().runTransaction(async tx => {
    const snapshot = await tx.get(planRef(uid));
    if (snapshot.exists) return snapshot.data()!;
    const periodStart = new Date().toISOString();
    const plan = {baseBytes: BASE_PLAN_BYTES, extraBytes: 0, periodStart, periodEnd: planPeriodEnd(periodStart), createdAt: periodStart};
    tx.create(planRef(uid), plan); return plan;
  });
}

// One aggregation per field: a combined aggregation only counts documents that have every field.
const total = async (query: FirebaseFirestore.Query, ...fields: string[]) => {
  const sums = await Promise.all(fields.map(async field => Number((await query.aggregate({value: AggregateField.sum(field)}).get()).data().value || 0)));
  return sums.reduce((value, item) => value + item, 0);
};

/** Sum aggregations bill about one read per thousand files, so measuring stays cheap as a year of uploads accumulates. */
async function measureUsage(uid: string) {
  const classes = await db().collection('classes').where('ownerUid', '==', uid).get();
  const perClass = await Promise.all(classes.docs.map(async cls => {
    const uploads = db().collection('uploads').where('classId', '==', cls.id);
    const [submitted, video, processing, pending] = await Promise.all([
      total(uploads.where('status', '==', 'submitted'), 'storedBytes', 'originalRetainedBytes'),
      // Verified homework videos are always stored as MP4 by the video worker.
      total(uploads.where('status', '==', 'submitted').where('contentType', '==', 'video/mp4'), 'storedBytes', 'originalRetainedBytes'),
      total(uploads.where('status', '==', 'video-processing'), 'size', 'stagedOutputBytes'),
      total(uploads.where('status', 'in', ['pending', 'cleanup']), 'size', 'thumbnailSize'),
    ]);
    return {video: video + processing, photo: submitted - video, pending};
  }));
  const materials = db().collection('assignmentMaterials').where('ownerUid', '==', uid);
  const [gallery, boards, materialsUsed, materialsPending] = await Promise.all([
    db().doc(`exhibitionStorage/${uid}`).get(), db().doc(`participationStorage/${uid}`).get(),
    // Equality filters only, so no composite index is needed.
    total(materials, 'size'), total(materials.where('status', 'in', ['pending', 'cleanup']), 'size'),
  ]);
  const categories: Record<StorageCategory, number> = {
    homeworkVideo: sum(perClass, row => row.video), homeworkPhoto: sum(perClass, row => row.photo),
    gallery: Number(gallery.data()?.usedBytes || 0), materials: materialsUsed - materialsPending, boards: Number(boards.data()?.usedBytes || 0),
  };
  const reservedBytes = sum(perClass, row => row.pending) + Number(gallery.data()?.reservedBytes || 0) + materialsPending + Number(boards.data()?.reservedBytes || 0);
  return {categories, usedBytes: storageCategories.reduce((value, key) => value + categories[key], 0), reservedBytes};
}

/** Usage is re-measured at most once per `maxAgeMs`; the dashboard asks for a fresh figure. */
export async function teacherStorage(uid: string, maxAgeMs = 0): Promise<StoragePlanView> {
  const plan = await teacherPlan(uid), cached = plan.usage as (Awaited<ReturnType<typeof measureUsage>> & {computedAt: string}) | undefined;
  const usage = cached && Date.now() - Date.parse(cached.computedAt) <= maxAgeMs ? cached : {...await measureUsage(uid), computedAt: new Date().toISOString()};
  if (usage !== cached) await planRef(uid).set({usage}, {merge: true});
  const quotaBytes = Number(plan.baseBytes || BASE_PLAN_BYTES) + Number(plan.extraBytes || 0);
  return {baseBytes: Number(plan.baseBytes || BASE_PLAN_BYTES), extraBytes: Number(plan.extraBytes || 0), quotaBytes, usedBytes: usage.usedBytes, reservedBytes: usage.reservedBytes,
    remainingBytes: Math.max(0, quotaBytes - usage.usedBytes - usage.reservedBytes), categories: usage.categories, periodStart: plan.periodStart, periodEnd: plan.periodEnd,
    daysLeft: daysUntil(plan.periodEnd), level: usageLevel(usage.usedBytes + usage.reservedBytes, quotaBytes), computedAt: usage.computedAt};
}

/**
 * Checked before every new upload in the teacher's classes. Usage is cached for a
 * couple of minutes, so this is a soft limit: a burst of parallel uploads can pass
 * it by at most a few files.
 */
export async function assertTeacherStorage(ownerUid: string | undefined, bytes: number) {
  if (!ownerUid) return;
  const plan = await teacherStorage(ownerUid, 120_000);
  if (!fitsPlan(plan.usedBytes, plan.reservedBytes, bytes, plan.quotaBytes)) throw new ApiError(413, '선생님 저장 공간이 가득 찼어요. 선생님께 알려 주세요.', 'PLAN_STORAGE_FULL');
  // Until the next measurement, count this upload as pending so a class-wide burst still sees it.
  await planRef(ownerUid).update({'usage.reservedBytes': FieldValue.increment(bytes)});
}
