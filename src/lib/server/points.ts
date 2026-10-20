import 'server-only';
import {NextResponse} from 'next/server';
import {FieldPath} from 'firebase-admin/firestore';
import {db} from './admin';
import {assertOrigin, requireStudent, requireTeacher, type Context} from './auth';
import {ApiError, canManageClass, id, text} from './policy';
import {addPointBalance, equipWardrobe, parsePointSettings, pointAwardDecision, pointBalance, pointInteger, pointLedgerId, pointPurchaseDecision, pointRevokeDecision, pointSettings, wardrobeOutfit, wardrobeOwnership} from './points-policy';
import {comparePointHistory, parsePointHistoryCursor, pointHistoryBoundary, pointHistoryCursor} from './points-history';
import type {PointLedgerEntry, PointStudent, TeacherPointLedgerEntry} from '../points-types';
import {companionProfile} from '@/modules/my-space/profile';

type Data = Record<string, any>;
const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control': 'private, no-store'}});
const studentRef = (classId: string, studentId: string) => db().doc(`classes/${id(classId)}/students/${id(studentId)}`);
const ledgerRef = (classId: string, studentId: string) => studentRef(classId, studentId).collection('pointLedger');
async function input(request: Request): Promise<Data> {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 20000) throw new ApiError(413, '입력 내용이 너무 커요.');
  try {const body = JSON.parse(raw); if (body && typeof body === 'object' && !Array.isArray(body)) return body;} catch {}
  throw new ApiError(400, '입력 내용을 확인해 주세요.');
}
function classOwner(ctx: Context, cls: FirebaseFirestore.DocumentSnapshot) {
  if (!cls.exists || !canManageClass(ctx.role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
}
function pointStudent(doc: FirebaseFirestore.DocumentSnapshot): PointStudent {
  const v = doc.data()!;
  return {id: doc.id, name: v.name, number: v.number, character: v.character || 'cat', points: pointBalance(v.points), pointsEarnedTotal: pointBalance(v.pointsEarnedTotal), wardrobeOwned: wardrobeOwnership(v.wardrobeOwned), wardrobeOutfit: wardrobeOutfit(v.wardrobeOutfit, v.wardrobeOwned), disabled: !!v.disabled};
}
async function activeStudent(ctx: Context & {classId: string; studentId: string}, tx?: FirebaseFirestore.Transaction) {
  const refs = [db().doc(`classes/${ctx.classId}`), studentRef(ctx.classId, ctx.studentId), db().doc(`users/${ctx.uid}`)];
  const [cls, pupil, profile] = await Promise.all(refs.map(ref => tx ? tx.get(ref) : ref.get()));
  if (!cls.exists || !pupil.exists || pupil.data()?.disabled || pupil.data()?.authUid !== ctx.uid || !profile.exists || profile.data()?.disabled || profile.data()?.role !== 'student' || profile.data()?.classId !== ctx.classId || profile.data()?.studentId !== ctx.studentId) throw new ApiError(403, '학생 코드를 선생님께 다시 확인해 주세요.', 'STUDENT_UNAVAILABLE');
  return {cls, pupil};
}

/** All reads happen before commit, so a batch of awards can share one transaction. */
async function prepareAward(tx: FirebaseFirestore.Transaction, options: {classId: string; studentId: string; source: 'manual' | 'homework'; sourceId: string; amount: number; reason: string; actorUid: string; cls: FirebaseFirestore.DocumentSnapshot; pupil?: FirebaseFirestore.DocumentSnapshot; at: Date}) {
  const ref = studentRef(options.classId, options.studentId), ledger = ledgerRef(options.classId, options.studentId).doc(pointLedgerId(options.source, options.sourceId, options.studentId));
  const [pupil, previous] = await Promise.all([options.pupil ? Promise.resolve(options.pupil) : tx.get(ref), tx.get(ledger)]);
  if (!pupil.exists || pupil.data()?.disabled) throw new ApiError(403, '이 학생에게는 포인트를 줄 수 없어요.', 'STUDENT_UNAVAILABLE');
  const userUid = pupil.data()?.authUid;
  if (typeof userUid !== 'string' || !userUid || userUid.includes('/')) throw new ApiError(403, '이 학생에게는 포인트를 줄 수 없어요.', 'STUDENT_UNAVAILABLE');
  const profile = await tx.get(db().doc(`users/${userUid}`));
  if (!profile.exists || profile.data()?.disabled || profile.data()?.role !== 'student' || profile.data()?.classId !== options.classId || profile.data()?.studentId !== options.studentId) throw new ApiError(403, '이 학생에게는 포인트를 줄 수 없어요.', 'STUDENT_UNAVAILABLE');
  if (previous.exists) return {status: 'already_awarded', amount: previous.data()!.amount, student: {id: pupil.id, points: pointBalance(pupil.data()?.points), pointsEarnedTotal: pointBalance(pupil.data()?.pointsEarnedTotal)}, commit: () => {}};
  const value = pupil.data()!, settings = pointSettings(options.cls.data()?.pointSettings);
  const decision = pointAwardDecision(settings, pointBalance(value.points), options.amount);
  const earnedTotal = addPointBalance(pointBalance(value.pointsEarnedTotal), options.amount);
  const record = {classId: options.classId, studentId: options.studentId, amount: options.amount, kind: 'earn', source: options.source, sourceId: options.sourceId, reason: options.reason, actorUid: options.actorUid, balanceAfter: decision.balance, createdAt: options.at.toISOString()};
  return {status: 'awarded', amount: options.amount, student: {id: pupil.id, points: decision.balance, pointsEarnedTotal: earnedTotal}, commit: () => {
    tx.update(ref, {points: decision.balance, pointsEarnedTotal: earnedTotal});
    tx.create(ledger, record);
  }};
}

/** Call before the review transaction's first write; each homework is rewarded once. */
export async function awardHomeworkPoints(tx: FirebaseFirestore.Transaction, options: {classId: string; studentId: string; assignmentId: string; actorUid: string}) {
  const cls = await tx.get(db().doc(`classes/${id(options.classId)}`));
  if (!cls.exists || cls.data()?.ownerUid !== options.actorUid) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
  const settings = pointSettings(cls.data()?.pointSettings);
  if (!settings.enabled || settings.rules.homework === 0) return {status: 'disabled', amount: 0};
  try {
    const award = await prepareAward(tx, {...options, cls, source: 'homework', sourceId: options.assignmentId, amount: settings.rules.homework, reason: '숙제 완료', at: new Date()});
    award.commit(); return {status: award.status, amount: award.amount};
  } catch (error) {
    if (error instanceof ApiError && error.code === 'STUDENT_UNAVAILABLE') return {status: 'student_unavailable', amount: 0};
    throw error;
  }
}

async function studentState(request: Request) {
  const ctx = await requireStudent(request), {cls, pupil} = await activeStudent(ctx);
  const params = new URL(request.url).searchParams;
  let query = ledgerRef(ctx.classId, ctx.studentId).orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (params.get('cursor')) {
    const cursor = await ledgerRef(ctx.classId, ctx.studentId).doc(id(params.get('cursor'))).get();
    if (!cursor.exists) throw new ApiError(400, '목록 위치를 확인해 주세요.', 'INVALID_CURSOR');
    query = query.startAfter(cursor);
  }
  const page = await query.limit(41).get(), rows = page.docs.slice(0, 40);
  const room=process.env.MY_SPACE_DISABLED==='true'?null:await pupil.ref.collection('mySpace').doc('room').get();
  return json({settings: pointSettings(cls.data()?.pointSettings), student: pointStudent(pupil),mySpaceEnabled:process.env.MY_SPACE_DISABLED!=='true',spaceCompanion:companionProfile(pupil.data()!,room?.data()), ledger: rows.map(row => ({...row.data(), id: row.id}) as PointLedgerEntry), nextCursor: page.size > 40 ? rows.at(-1)!.id : null});
}
async function teacherState(request: Request, classId: string) {
  const ctx = await requireTeacher(request), cls = await db().doc(`classes/${id(classId)}`).get(); classOwner(ctx, cls);
  const students = await db().collection(`classes/${classId}/students`).get();
  return json({classId, className: cls.data()!.name, settings: pointSettings(cls.data()?.pointSettings), students: students.docs.map(pointStudent).sort((a, b) => a.number - b.number)});
}
async function teacherHistory(request: Request, classId: string) {
  const ctx = await requireTeacher(request), cls = await db().doc(`classes/${classId}`).get(); classOwner(ctx, cls);
  const params = new URL(request.url).searchParams, filter = params.get('studentId') ? id(params.get('studentId')) : '';
  const cursor = parsePointHistoryCursor(params.get('cursor'), classId, filter);
  const roster = filter ? [await studentRef(classId, filter).get()] : (await db().collection(`classes/${classId}/students`).get()).docs;
  if (filter && !roster[0].exists) throw new ApiError(404, '학생을 찾을 수 없어요.', 'STUDENT_UNAVAILABLE');
  // Merge bounded student pages so existing awards appear immediately without
  // a migration or a collection-group index. No other class is ever queried.
  const pages = await Promise.all(roster.map(async pupil => {
    let query = ledgerRef(classId, pupil.id).orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (cursor) {
      const boundary = pointHistoryBoundary(cursor, pupil.id);
      query = boundary.inclusive ? query.startAt(...boundary.values) : query.startAfter(...boundary.values);
    }
    const page = await query.limit(41).get(), student = pupil.data()!;
    return page.docs.map(row => {
      const value = row.data();
      return {id: row.id, amount: value.amount, kind: value.kind, source: value.source, sourceId: value.sourceId, reason: value.reason, balanceAfter: value.balanceAfter, createdAt: value.createdAt, studentId: pupil.id, studentName: student.name, studentNumber: student.number} as TeacherPointLedgerEntry;
    });
  }));
  const all = pages.flat().sort(comparePointHistory), ledger = all.slice(0, 40);
  return json({ledger, nextCursor: all.length > 40 ? pointHistoryCursor(classId, filter, ledger.at(-1)!) : null});
}
async function studentBalance(request: Request) {
  const ctx = await requireStudent(request), {cls, pupil} = await activeStudent(ctx);
  return json({classId: ctx.classId, studentId: ctx.studentId, points: pointBalance(pupil.data()?.points), earned: pointBalance(pupil.data()?.pointsEarnedTotal), settings: pointSettings(cls.data()?.pointSettings)});
}
async function settings(request: Request, classId: string) {
  const ctx = await requireTeacher(request), parsed = parsePointSettings(await input(request)), ref = db().doc(`classes/${id(classId)}`);
  await db().runTransaction(async tx => {const cls = await tx.get(ref); classOwner(ctx, cls); tx.update(ref, {pointSettings: parsed});});
  return json({settings: parsed});
}
async function grant(request: Request, classId: string) {
  const ctx = await requireTeacher(request), data = await input(request), amount = pointInteger(data.amount, 1, Number.MAX_SAFE_INTEGER), reason = text(data.reason, '지급 이유', 200), requestId = id(data.requestId);
  if (!Array.isArray(data.studentIds) || !data.studentIds.length || data.studentIds.length > 100) throw new ApiError(400, '학생을 1~100명 선택해 주세요.', 'POINT_STUDENTS');
  const studentIds = [...new Set<string>(data.studentIds.map((value: unknown) => id(value)))].sort();
  const receipt = db().doc(`pointRequests/${pointLedgerId('manual', `${classId}:${ctx.uid}:${requestId}`, 'batch')}`), fingerprint = JSON.stringify({studentIds, amount, reason}), at = new Date();
  const result = await db().runTransaction(async tx => {
    const [cls, prior] = await Promise.all([tx.get(db().doc(`classes/${id(classId)}`)), tx.get(receipt)]); classOwner(ctx, cls);
    if (prior.exists) {
      if (prior.data()!.fingerprint !== fingerprint) throw new ApiError(409, '같은 요청에 다른 내용을 보낼 수 없어요.', 'REQUEST_CONFLICT');
      const pupils = await tx.getAll(...studentIds.map(studentId => studentRef(classId, studentId)));
      return {count: studentIds.length, repeated: true, students: pupils.map(doc => ({id: doc.id, points: pointBalance(doc.data()?.points), pointsEarnedTotal: pointBalance(doc.data()?.pointsEarnedTotal)}))};
    }
    const awards = await Promise.all(studentIds.map(studentId => prepareAward(tx, {classId, studentId, source: 'manual', sourceId: `${ctx.uid}:${requestId}`, amount, reason, actorUid: ctx.uid, cls, at})));
    awards.forEach(award => award.commit());
    tx.create(receipt, {classId, actorUid: ctx.uid, fingerprint, createdAt: at.toISOString()});
    return {count: studentIds.length, repeated: false, students: awards.map(award => award.student)};
  });
  return json(result);
}
async function revoke(request: Request, classId: string) {
  const ctx = await requireTeacher(request), data = await input(request), amount = pointInteger(data.amount, 1, Number.MAX_SAFE_INTEGER), reason = text(data.reason, '회수 사유', 200), requestId = id(data.requestId);
  if (!Array.isArray(data.studentIds) || !data.studentIds.length || data.studentIds.length > 100) throw new ApiError(400, '학생을 1~100명 선택해 주세요.', 'POINT_STUDENTS');
  const studentIds = [...new Set<string>(data.studentIds.map((value: unknown) => id(value)))].sort();
  const receipt = db().doc(`pointRequests/${pointLedgerId('revoke', `${classId}:${ctx.uid}:${requestId}`, 'batch')}`), fingerprint = JSON.stringify({studentIds, amount, reason}), at = new Date().toISOString();
  const result = await db().runTransaction(async tx => {
    const [cls, prior, pupils] = await Promise.all([tx.get(db().doc(`classes/${classId}`)), tx.get(receipt), tx.getAll(...studentIds.map(studentId => studentRef(classId, studentId)))]); classOwner(ctx, cls);
    if (prior.exists && prior.data()!.fingerprint !== fingerprint) throw new ApiError(409, '같은 요청에 다른 내용을 보낼 수 없어요.', 'REQUEST_CONFLICT');
    const students = pupils.map(pupil => {
      if (!pupil.exists) throw new ApiError(404, '학생을 찾을 수 없어요.', 'STUDENT_UNAVAILABLE');
      const balance = pointBalance(pupil.data()?.points);
      return {id: pupil.id, points: prior.exists ? balance : pointRevokeDecision(balance, amount).balance, pointsEarnedTotal: pointBalance(pupil.data()?.pointsEarnedTotal)};
    });
    if (!prior.exists) {
      students.forEach(student => {
        tx.update(studentRef(classId, student.id), {points: student.points});
        tx.create(ledgerRef(classId, student.id).doc(pointLedgerId('revoke', `${ctx.uid}:${requestId}`, student.id)), {classId, studentId: student.id, amount: -amount, kind: 'revoke', source: 'revoke', sourceId: `${ctx.uid}:${requestId}`, reason, actorUid: ctx.uid, balanceAfter: student.points, createdAt: at});
      });
      tx.create(receipt, {classId, actorUid: ctx.uid, fingerprint, createdAt: at});
    }
    return {count: students.length, repeated: prior.exists, students};
  });
  return json(result);
}
async function purchase(request: Request) {
  const ctx = await requireStudent(request), data = await input(request), requestId = id(data.requestId), itemId = id(data.itemId);
  const receipt = db().doc(`pointRequests/${pointLedgerId('wardrobe', `${ctx.classId}:${ctx.uid}:${requestId}`, ctx.studentId)}`);
  const result = await db().runTransaction(async tx => {
    const {cls, pupil} = await activeStudent(ctx, tx), prior = await tx.get(receipt), settings = pointSettings(cls.data()?.pointSettings);
    if (!settings.enabled) throw new ApiError(409, '선생님이 포인트 꾸미기를 켜면 사용할 수 있어요.', 'POINTS_DISABLED');
    if (prior.exists && prior.data()!.itemId !== itemId) throw new ApiError(409, '같은 요청에 다른 아이템을 담을 수 없어요.', 'REQUEST_CONFLICT');
    if (prior.exists) return {purchased: false, repeated: true};
    const value = pupil.data()!, decision = pointPurchaseDecision(pointBalance(value.points), value.wardrobeOwned, itemId);
    if (decision.purchased) {
      // One immutable spend ID per student/item also protects concurrent purchases with different request IDs.
      tx.create(ledgerRef(ctx.classId, ctx.studentId).doc(pointLedgerId('wardrobe', itemId, ctx.studentId)), {classId: ctx.classId, studentId: ctx.studentId, amount: -decision.item.price, kind: 'spend', source: 'wardrobe', sourceId: itemId, reason: decision.item.ko, actorUid: ctx.uid, balanceAfter: decision.balance, createdAt: new Date().toISOString()});
      tx.update(pupil.ref, {points: decision.balance, wardrobeOwned: decision.owned});
    }
    tx.create(receipt, {classId: ctx.classId, studentId: ctx.studentId, itemId, createdAt: new Date().toISOString()});
    return {purchased: decision.purchased, repeated: false};
  });
  return json(result);
}
async function equip(request: Request) {
  const ctx = await requireStudent(request), data = await input(request);
  const result = await db().runTransaction(async tx => {
    const {cls, pupil} = await activeStudent(ctx, tx);
    if (!pointSettings(cls.data()?.pointSettings).enabled) throw new ApiError(409, '선생님이 포인트 꾸미기를 켜면 사용할 수 있어요.', 'POINTS_DISABLED');
    const value = pupil.data()!, outfit = equipWardrobe(value.wardrobeOutfit, value.wardrobeOwned, data.slot, data.itemId);
    tx.update(pupil.ref, {wardrobeOutfit: outfit}); return outfit;
  });
  return json({outfit: result});
}
export async function handlePoints(request: Request, segments: string[]) {
  try {
    if (request.method !== 'GET') assertOrigin(request);
    if (segments.length === 1 && segments[0] === 'student' && request.method === 'GET') return await studentState(request);
    if (segments.length === 1 && segments[0] === 'balance' && request.method === 'GET') return await studentBalance(request);
    if (segments.length === 1 && segments[0] === 'purchase' && request.method === 'POST') return await purchase(request);
    if (segments.length === 1 && segments[0] === 'equip' && request.method === 'POST') return await equip(request);
    if (segments[0] === 'classes' && segments.length >= 2) {
      const classId = id(segments[1]);
      if (segments.length === 2 && request.method === 'GET') return await teacherState(request, classId);
      if (segments.length === 3 && segments[2] === 'settings' && request.method === 'POST') return await settings(request, classId);
      if (segments.length === 3 && segments[2] === 'grant' && request.method === 'POST') return await grant(request, classId);
      if (segments.length === 3 && segments[2] === 'revoke' && request.method === 'POST') return await revoke(request, classId);
      if (segments.length === 3 && segments[2] === 'history' && request.method === 'GET') return await teacherHistory(request, classId);
    }
    throw new ApiError(404, '요청한 기능을 찾을 수 없어요.', 'NOT_FOUND');
  } catch (error) {
    if (error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    console.error('Points operation failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '잠시 후 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
