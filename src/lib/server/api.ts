import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { AggregateField, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { assignmentSubmissionType } from '../assignment-submission';
import { auth, bucket, db } from './admin';
import { getAiOperations } from './ai';
import { assertOrigin, contextForUid, cookieName, getContext, requireStudent, requireTeacher, type Context } from './auth';
import { ApiError, canDisableUser, canManageClass, canUseUpload, characters, id, isAdmin, nextReview, requiredSubmissionType, submissionContentPolicy, text, uploadPolicy } from './policy';

type Data = Record<string, any>;
const now = () => new Date().toISOString();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const mapped = (snap: FirebaseFirestore.DocumentSnapshot) => ({ id: snap.id, ...snap.data() }) as Data;
const mappedAssignment = (snap: FirebaseFirestore.DocumentSnapshot) => ({ ...mapped(snap), submissionType: assignmentSubmissionType(snap.data()?.submissionType) }) as Data;
const sorted = (items: Data[]) => items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
async function body(request: Request): Promise<Data> {
  const value = await request.json().catch(() => { throw new ApiError(400, '입력 내용을 다시 확인해 주세요.'); });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, '입력 내용을 다시 확인해 주세요.');
  return value;
}
function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
async function managedClass(ctx: Context, classId: string) {
  const doc = await db().doc(`classes/${id(classId)}`).get();
  if (!doc.exists) throw new ApiError(404, '학급을 찾을 수 없어요.', 'NOT_FOUND');
  if (!canManageClass(ctx.role, ctx.uid, doc.data()?.ownerUid)) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
  return mapped(doc);
}
async function assignmentForStudent(ctx: Context, assignmentId: string) {
  const doc = await db().doc(`assignments/${id(assignmentId)}`).get();
  const value = doc.data();
  if (!doc.exists || value?.classId !== ctx.classId || !value?.targetStudentIds?.includes(ctx.studentId)) throw new ApiError(404, '배부된 과제를 찾을 수 없어요.', 'NOT_FOUND');
  return mappedAssignment(doc);
}
async function studentProfile(ctx: Context) {
  const [student, cls] = await Promise.all([db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`).get(), db().doc(`classes/${ctx.classId}`).get()]);
  const data = student.data()!;
  return { id: student.id, name: data.name, number: data.number, classId: ctx.classId, className: cls.data()?.name ?? '', character: data.character ?? 'cat', xp: data.xp ?? 0 };
}
function publicStudent(doc: FirebaseFirestore.DocumentSnapshot) {
  const value = doc.data()!;
  return { id: doc.id, number: value.number, name: value.name, character: value.character ?? 'cat', xp: value.xp ?? 0, disabled: !!value.disabled };
}
async function withFileUrls(submission: Data): Promise<Data> {
  const uploads = await Promise.all((submission.uploads ?? []).map(async (upload: Data) => {
    const [url] = await bucket().file(upload.path).getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });
    return { ...upload, url };
  }));
  return { ...submission, uploads };
}
async function audit(ctx: Context, action: string, target?: string, details?: Data) {
  await db().collection('adminAudit').add({ actorUid: ctx.uid, action, target: target ?? null, details: details ?? {}, createdAt: now() });
}
async function adminContext(request: Request) {
  const ctx = await getContext(request);
  if (!isAdmin(ctx.role)) throw new ApiError(403, '운영자만 사용할 수 있어요.', 'FORBIDDEN');
  return ctx;
}
async function rateLimit(request: Request, code: string) {
  const address = request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for') ?? 'local';
  const window = Math.floor(Date.now() / 600_000);
  const ip = address.split(',')[0];
  // A whole school can share one public IP. Restrict repeated code attempts
  // without blocking a class's normal simultaneous sign-in.
  const limits = [
    { ref: db().doc(`rateLimits/${hash(`student-code-ip:${ip}:${window}`)}`), max: 2000 },
    { ref: db().doc(`rateLimits/${hash(`student-code-attempt:${ip}:${code}:${window}`)}`), max: 20 },
  ];
  await db().runTransaction(async tx => {
    const snapshots = await Promise.all(limits.map(limit => tx.get(limit.ref)));
    if (snapshots.some((snapshot, index) => (snapshot.data()?.count ?? 0) >= limits[index].max)) throw new ApiError(429, '잠시 기다린 뒤 다시 입력해 주세요.', 'RATE_LIMITED');
    snapshots.forEach((snapshot, index) => tx.set(limits[index].ref, { count: (snapshot.data()?.count ?? 0) + 1, expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000) }));
  });
}

async function session(request: Request) {
  if (request.method === 'DELETE') {
    const response = json({ ok: true });
    response.cookies.set(cookieName, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  }
  const input = await body(request);
  const token = text(input.idToken, '로그인 정보', 16000);
  const decoded = await auth().verifyIdToken(token, true).catch((error: { code?: string; message?: string }) => {
    // Classify the failure without logging token content or SDK payloads.
    const reason = ['eacces', 'enotfound', 'econnrefused', 'fetching public keys', 'aud', 'iss', 'kid', 'sub', 'algorithm', 'decode', 'signature'].find(part => error.message?.toLowerCase().includes(part)) ?? 'other';
    console.error('ID token verification failed', error.code ?? 'UNKNOWN', reason);
    throw new ApiError(401, 'Google 또는 학생 코드로 다시 로그인해 주세요.', 'UNAUTHENTICATED');
  });
  if (Date.now() / 1000 - decoded.auth_time > 300) throw new ApiError(401, '안전을 위해 다시 로그인해 주세요.', 'RECENT_LOGIN_REQUIRED');
  const ctx = await contextForUid(decoded.uid, decoded.authVersion);
  const expiresIn = ctx.role === 'student' ? 8 * 3_600_000 : 5 * 86_400_000;
  const value = await auth().createSessionCookie(token, { expiresIn });
  if (ctx.role !== 'student') await db().doc(`users/${ctx.uid}`).set({ uid: ctx.uid, email: ctx.email, displayName: ctx.displayName, role: 'teacher', lastLoginAt: now() }, { merge: true });
  const response = json(ctx);
  response.cookies.set(cookieName, value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: expiresIn / 1000 });
  return response;
}
async function classes(request: Request) {
  const ctx = await requireTeacher(request);
  if (request.method === 'GET') {
    const query = db().collection('classes').where('ownerUid', '==', ctx.uid);
    return json({ classes: sorted((await query.get()).docs.map(mapped)) });
  }
  const input = await body(request);
  const value = { name: text(input.name, '학급 이름', 80), grade: text(String(input.grade ?? ''), '학년', 20, true), year: Number(input.year ?? new Date().getFullYear()), ownerUid: ctx.uid, studentCount: 0, createdAt: now() };
  if (!Number.isInteger(value.year) || value.year < 2020 || value.year > 2100) throw new ApiError(400, '학년도를 확인해 주세요.');
  const ref = await db().collection('classes').add(value);
  return json({ class: { id: ref.id, ...value } }, 201);
}
async function students(request: Request, classId: string) {
  const ctx = await requireTeacher(request);
  await managedClass(ctx, classId);
  const collection = db().collection(`classes/${classId}/students`);
  if (request.method === 'GET') return json({ students: (await collection.get()).docs.map(publicStudent).sort((a, b) => a.number - b.number) });
  const input = await body(request);
  if (!Array.isArray(input.students) || input.students.length < 1 || input.students.length > 100) throw new ApiError(400, '학생은 한 번에 1~100명 추가할 수 있어요.');
  const rows = input.students.map((row: Data) => ({ number: Number(row.number), name: text(row.name, '학생 이름', 50) }));
  if (rows.some(row => !Number.isInteger(row.number) || row.number < 1 || row.number > 999) || new Set(rows.map(row => row.number)).size !== rows.length) throw new ApiError(400, '출석번호는 중복 없이 1~999로 입력해 주세요.');
  const results = rows.map(row => {
    const studentId = randomUUID();
    const code = randomBytes(9).toString('base64url').toUpperCase();
    return { ...row, id: studentId, authUid: `student_${studentId}`, accessCode: code };
  });
  // The transaction serializes roster additions to keep student numbers unique.
  await db().runTransaction(async tx => {
    const classRef = db().doc(`classes/${classId}`);
    const classDoc = await tx.get(classRef);
    const existing = await tx.get(collection);
    const numbers = new Set(existing.docs.map(doc => doc.data().number));
    if (rows.some(row => numbers.has(row.number))) throw new ApiError(409, '이미 사용 중인 출석번호가 있어요.', 'DUPLICATE_NUMBER');
    if (existing.size + results.length > 300) throw new ApiError(400, '한 학급은 최대 300명까지 추가할 수 있어요.');
    for (const row of results) {
      const { accessCode, ...record } = row;
      tx.create(collection.doc(row.id), { ...record, classId, character: 'cat', xp: 0, createdAt: now() });
      tx.create(db().doc(`studentCodes/${hash(accessCode)}`), { classId, studentId: row.id, authUid: row.authUid, authVersion: 0, active: true, createdAt: now() });
      tx.create(db().doc(`users/${row.authUid}`), { uid: row.authUid, displayName: row.name, role: 'student', classId, studentId: row.id, authVersion: 0, disabled: false, createdAt: now() });
    }
    tx.update(classRef, { studentCount: (classDoc.data()?.studentCount ?? existing.size) + results.length });
  });
  return json({ students: results.map(({ authUid: _authUid, ...entry }) => entry) }, 201);
}
async function studentCode(request: Request) {
  const input = await body(request);
  const code = text(input.code, '학생 코드', 100).replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z0-9_-]{12}$/.test(code)) throw new ApiError(401, '학생 코드를 확인해 주세요.', 'INVALID_CODE');
  await rateLimit(request, code);
  const doc = await db().doc(`studentCodes/${hash(code)}`).get();
  const value = doc.data();
  if (!value?.active) throw new ApiError(401, '학생 코드를 확인해 주세요.', 'INVALID_CODE');
  const [student, profile] = await Promise.all([db().doc(`classes/${value.classId}/students/${value.studentId}`).get(), db().doc(`users/${value.authUid}`).get()]);
  if (!student.exists || student.data()?.disabled || profile.data()?.disabled || (value.authVersion ?? 0) !== (profile.data()?.authVersion ?? 0)) throw new ApiError(401, '학생 코드를 확인해 주세요.', 'INVALID_CODE');
  try { await auth().getUser(value.authUid); }
  catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    await auth().createUser({ uid: value.authUid, displayName: student.data()?.name }).catch(error => { if (error.code !== 'auth/uid-already-exists') throw error; });
  }
  const record = await auth().getUser(value.authUid);
  if (record.disabled) throw new ApiError(401, '학생 코드를 확인해 주세요.', 'INVALID_CODE');
  const customToken = await auth().createCustomToken(value.authUid, { role: 'student', classId: value.classId, studentId: value.studentId, authVersion: profile.data()?.authVersion ?? 0 });
  return json({ customToken });
}
async function assignments(request: Request) {
  const ctx = await requireTeacher(request);
  if (request.method === 'GET') {
    const classId = new URL(request.url).searchParams.get('classId');
    if (classId) await managedClass(ctx, classId);
    const collection = db().collection('assignments');
    const query = classId ? collection.where('classId', '==', classId) : collection.where('ownerUid', '==', ctx.uid);
    const summary = new URL(request.url).searchParams.get('summary') === '1';
    const list = summary ? query.select('classId', 'title', 'submissionType', 'dueAt', 'targetCount', 'submittedCount', 'reviewedCount', 'createdAt') : query;
    return json({ assignments: sorted((await list.limit(200).get()).docs.map(mappedAssignment)) });
  }
  const input = await body(request);
  const submissionType = requiredSubmissionType(input.submissionType);
  const classId = id(input.classId);
  const cls = await managedClass(ctx, classId);
  const roster = await db().collection(`classes/${classId}/students`).get();
  const targetStudentIds = roster.docs.filter(doc => !doc.data().disabled).map(doc => doc.id);
  if (!targetStudentIds.length) throw new ApiError(400, '학생을 먼저 추가해 주세요.');
  const dueAt = input.dueAt ? new Date(input.dueAt).toISOString() : null;
  const value = { classId, className: cls.name, ownerUid: cls.ownerUid, title: text(input.title, '과제 제목', 120), description: text(input.description, '과제 설명', 5000, true), submissionType, dueAt, targetStudentIds, targetCount: targetStudentIds.length, submittedCount: 0, reviewedCount: 0, createdAt: now() };
  const ref = await db().collection('assignments').add(value);
  return json({ assignment: { id: ref.id, ...value } }, 201);
}
async function assignmentDetail(request: Request, assignmentId: string) {
  const ctx = await requireTeacher(request);
  const snap = await db().doc(`assignments/${id(assignmentId)}`).get();
  if (!snap.exists) throw new ApiError(404, '과제를 찾을 수 없어요.', 'NOT_FOUND');
  const assignment = mappedAssignment(snap);
  await managedClass(ctx, assignment.classId);
  const [roster, submissions] = await Promise.all([db().collection(`classes/${assignment.classId}/students`).get(), db().collection('submissions').where('assignmentId', '==', assignmentId).get()]);
  return json({ assignment, students: roster.docs.filter(doc => assignment.targetStudentIds.includes(doc.id)).map(publicStudent).sort((a, b) => a.number - b.number), submissions: await Promise.all(submissions.docs.map(doc => withFileUrls(mapped(doc)))) });
}
async function home(request: Request) {
  const ctx = await requireStudent(request);
  const [profile, tasks, submitted] = await Promise.all([studentProfile(ctx), db().collection('assignments').where('classId', '==', ctx.classId).limit(200).get(), db().collection('submissions').where('studentId', '==', ctx.studentId).limit(200).get()]);
  const byAssignment = new Map(submitted.docs.map(doc => [doc.data().assignmentId, mapped(doc)]));
  const assignments = await Promise.all(sorted(tasks.docs.map(mappedAssignment).filter(task => task.targetStudentIds.includes(ctx.studentId))).map(async task => {
    const submission = byAssignment.get(task.id);
    const { targetStudentIds: _targets, ownerUid: _owner, ...visibleTask } = task;
    return { ...visibleTask, status: submission?.status ?? 'pending', submission: submission ? await withFileUrls(submission) : null };
  }));
  return json({ profile, assignments });
}
async function character(request: Request) {
  const ctx = await requireStudent(request);
  const input = await body(request);
  if (!characters.includes(input.character)) throw new ApiError(400, '함께할 친구를 선택해 주세요.');
  await db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`).update({ character: input.character });
  return json({ profile: await studentProfile(ctx) });
}
async function initUpload(request: Request) {
  const ctx = await requireStudent(request);
  const input = await body(request);
  const assignmentId = id(input.assignmentId);
  const assignment = await assignmentForStudent(ctx, assignmentId);
  const { contentType, size } = uploadPolicy(input.contentType, input.size, assignment.submissionType);
  const uploadId = randomUUID();
  const path = `uploads/${ctx.uid}/${uploadId}/file`;
  await db().doc(`uploads/${uploadId}`).create({ userUid: ctx.uid, studentId: ctx.studentId, classId: ctx.classId, assignmentId, path, fileName: text(input.fileName, '파일 이름', 255), contentType, size, status: 'pending', createdAt: now(), expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000) });
  return json({ uploadId, path }, 201);
}
async function finalize(request: Request) {
  const ctx = await requireStudent(request);
  const input = await body(request);
  const assignmentId = id(input.assignmentId);
  const assignment = await assignmentForStudent(ctx, assignmentId);
  const answer = text(input.text, '내용', 10000, true);
  if (!Array.isArray(input.uploadIds) || input.uploadIds.length > 10 || new Set(input.uploadIds).size !== input.uploadIds.length) throw new ApiError(400, '첨부파일은 최대 10개까지 제출할 수 있어요.');
  const uploadIds = input.uploadIds.map((value: unknown) => id(value));
  submissionContentPolicy(assignment.submissionType, answer, uploadIds.length);
  const fingerprint = hash(JSON.stringify({ answer, uploadIds }));
  const ref = db().doc(`submissions/${assignmentId}_${ctx.studentId}`);
  const previous = await ref.get();
  // A revision is a new attempt even when a student sends the same text.
  // Submitted/done content still returns the existing attempt on retries.
  if (previous.data()?.fingerprint === fingerprint && previous.data()?.status !== 'revision') return json({ submission: await withFileUrls(mapped(previous)) });
  const uploadDocs = await Promise.all(uploadIds.map((uploadId: string) => db().doc(`uploads/${uploadId}`).get()));
  const uploads = await Promise.all(uploadDocs.map(async doc => {
    const value = doc.data();
    if (!canUseUpload(ctx.uid, assignmentId, value) || !value || value.expiresAt.toMillis() < Date.now()) throw new ApiError(400, '첨부파일을 다시 올려 주세요.', 'UPLOAD_INVALID');
    // Recheck the manifest here as well as at init: clients cannot bypass the
    // teacher's answer format by submitting an existing pending upload ID.
    uploadPolicy(value.contentType, value.size, assignment.submissionType);
    const [metadata] = await bucket().file(value.path).getMetadata().catch(() => { throw new ApiError(409, '아직 파일 전송 중이에요. 잠시 뒤 다시 제출해 주세요.', 'UPLOAD_INCOMPLETE'); });
    if (Number(metadata.size) !== value.size || metadata.contentType !== value.contentType) throw new ApiError(400, '파일 정보가 달라요. 다시 올려 주세요.', 'UPLOAD_MISMATCH');
    return { id: doc.id, path: value.path, fileName: value.fileName, contentType: value.contentType, size: value.size };
  }));
  const profile = await studentProfile(ctx);
  const attemptId = randomUUID();
  const result = await db().runTransaction(async tx => {
    const [oldDoc, ...freshUploads] = await Promise.all([tx.get(ref), ...uploadDocs.map(doc => tx.get(doc.ref))]);
    const old = oldDoc.data();
    if (old?.fingerprint === fingerprint && old?.status !== 'revision') return mapped(oldDoc);
    if (freshUploads.some(doc => doc.data()?.status !== 'pending')) throw new ApiError(409, '이미 사용된 첨부파일이에요.', 'UPLOAD_USED');
    const submission = { id: ref.id, assignmentId, classId: ctx.classId, studentId: ctx.studentId, studentName: profile.name, text: answer, uploads, attemptId, attemptNumber: (old?.attemptNumber ?? 0) + 1, status: 'submitted', feedback: '', submittedAt: now(), reviewedAt: null, fingerprint, rewardGranted: !!old?.rewardGranted };
    tx.set(ref, submission);
    tx.create(ref.collection('attempts').doc(attemptId), submission);
    uploadDocs.forEach(doc => tx.update(doc.ref, { status: 'submitted', submissionId: ref.id }));
    tx.update(db().doc(`assignments/${assignmentId}`), { submittedCount: FieldValue.increment(old ? 0 : 1), reviewedCount: FieldValue.increment(old && old.status !== 'submitted' ? -1 : 0) });
    return submission;
  });
  // The student can reopen the result immediately, before the home refresh.
  return json({ submission: await withFileUrls(result) });
}
async function review(request: Request, assignmentId: string) {
  const ctx = await requireTeacher(request);
  const task = await db().doc(`assignments/${id(assignmentId)}`).get();
  if (!task.exists) throw new ApiError(404, '과제를 찾을 수 없어요.');
  await managedClass(ctx, task.data()!.classId);
  const input = await body(request);
  const studentId = id(input.studentId);
  const feedback = text(input.feedback, '피드백', 5000, true);
  const ref = db().doc(`submissions/${assignmentId}_${studentId}`);
  const submission = await db().runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new ApiError(404, '아직 제출하지 않은 학생이에요.', 'NOT_SUBMITTED');
    const value = doc.data()!;
    if (!input.attemptId || input.attemptId !== value.attemptId) throw new ApiError(409, '새 제출물이 있어요. 새로 확인한 뒤 검사해 주세요.', 'STALE_ATTEMPT');
    const decision = nextReview(input.status, !!value.rewardGranted);
    const updated = { ...value, status: decision.status, feedback, reviewedAt: now(), reviewerUid: ctx.uid, rewardGranted: !!value.rewardGranted || decision.reward > 0 };
    tx.update(ref, updated);
    tx.update(ref.collection('attempts').doc(value.attemptId), { status: decision.status, feedback, reviewedAt: updated.reviewedAt, reviewerUid: ctx.uid });
    if (value.status === 'submitted') tx.update(task.ref, { reviewedCount: FieldValue.increment(1) });
    if (decision.reward) tx.update(db().doc(`classes/${value.classId}/students/${studentId}`), { xp: FieldValue.increment(decision.reward) });
    return updated;
  });
  return json({ submission });
}
async function adminOverview(request: Request) {
  const ctx = await adminContext(request);
  const [users, classes, assignments, submissions] = await Promise.all(['users', 'classes', 'assignments', 'submissions'].map(name => db().collection(name).count().get()));
  await audit(ctx, 'overview.view');
  return json({ userCount: users.data().count, classCount: classes.data().count, assignmentCount: assignments.data().count, submissionCount: submissions.data().count });
}
async function adminUsers(request: Request, uid?: string) {
  const ctx = await adminContext(request);
  if (request.method === 'GET') {
    const [users, roles] = await Promise.all([db().collection('users').limit(200).get(), db().collection('platformRoles').get()]);
    const roleMap = new Map(roles.docs.map(doc => [doc.id, doc.data().role]));
    await audit(ctx, 'users.list');
    return json({ users: users.docs.map(doc => ({ ...mapped(doc), uid: doc.id, role: roleMap.get(doc.id) ?? doc.data().role ?? 'teacher' })) });
  }
  const targetUid = id(uid);
  const targetRole = (await db().doc(`platformRoles/${targetUid}`).get()).data()?.role;
  if (!canDisableUser(ctx.role, ctx.uid, targetUid, targetRole)) throw new ApiError(403, '본인 또는 보호된 운영자 계정은 변경할 수 없어요.');
  const input = await body(request);
  if (typeof input.disabled !== 'boolean') throw new ApiError(400, '이용 중지 여부를 확인해 주세요.');
  const profile = await db().doc(`users/${targetUid}`).get();
  if (!profile.exists) throw new ApiError(404, '사용자를 찾을 수 없어요.');
  try { await auth().updateUser(targetUid, { disabled: input.disabled }); if (input.disabled) await auth().revokeRefreshTokens(targetUid); }
  catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found' || profile.data()?.role !== 'student') throw error; }
  await db().doc(`users/${targetUid}`).update({ disabled: input.disabled, updatedAt: now() });
  await audit(ctx, input.disabled ? 'user.disable' : 'user.enable', targetUid);
  return json({ ok: true, uid: targetUid, disabled: input.disabled });
}

async function resetStudentCode(request: Request, classId: string, studentId: string) {
  const ctx = await requireTeacher(request);
  await managedClass(ctx, classId);
  const studentRef = db().doc(`classes/${classId}/students/${studentId}`);
  const accessCode = randomBytes(9).toString('base64url').toUpperCase();
  const authUid = await db().runTransaction(async tx => {
    const student = await tx.get(studentRef);
    if (!student.exists) throw new ApiError(404, '학생을 찾을 수 없어요.');
    const uid = student.data()!.authUid;
    const userRef = db().doc(`users/${uid}`);
    const [user, oldCodes] = await Promise.all([tx.get(userRef), tx.get(db().collection('studentCodes').where('studentId', '==', studentId))]);
    const authVersion = (user.data()?.authVersion ?? 0) + 1;
    oldCodes.docs.forEach(code => tx.delete(code.ref));
    tx.create(db().doc(`studentCodes/${hash(accessCode)}`), { classId, studentId, authUid: uid, authVersion, active: true, createdAt: now() });
    tx.update(userRef, { authVersion });
    tx.update(studentRef, { codeResetAt: now() });
    return uid;
  });
  try { await auth().revokeRefreshTokens(authUid); }
  catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
  await audit(ctx, 'student.code-reset', authUid, { classId, studentId });
  return json({ accessCode, studentId });
}
async function adminOperations(request: Request) {
  const ctx = await adminContext(request);
  const [classes, submitted, pending, logs, ai] = await Promise.all([
    db().collection('classes').limit(200).get(),
    db().collection('uploads').where('status', '==', 'submitted').aggregate({ fileCount: AggregateField.count(), totalBytes: AggregateField.sum('size') }).get(),
    db().collection('uploads').where('status', '==', 'pending').count().get(),
    db().collection('adminAudit').orderBy('createdAt', 'desc').limit(50).get(),
    getAiOperations(),
  ]);
  await audit(ctx, 'operations.view');
  return json({
    classes: classes.docs.map(doc => { const value = doc.data(); return { id: doc.id, name: value.name, ownerUid: value.ownerUid, studentCount: value.studentCount ?? 0, year: value.year }; }),
    uploads: { fileCount: submitted.data().fileCount, totalBytes: submitted.data().totalBytes, pendingCount: pending.data().count },
    ai,
    audit: logs.docs.map(doc => { const value = doc.data(); return { id: doc.id, action: value.action, actorUid: value.actorUid, ...(value.target ? { targetUid: value.target } : {}), createdAt: value.createdAt }; }),
    health: { firebase: 'connected' },
  });
}

export async function handle(request: Request, operation: string, parameter?: string, secondaryParameter?: string) {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) assertOrigin(request);
    switch (operation) {
      case 'session': return await session(request);
      case 'me': return json(await getContext(request));
      case 'classes': return await classes(request);
      case 'students': return await students(request, id(parameter));
      case 'student-code': return await studentCode(request);
      case 'assignments': return await assignments(request);
      case 'assignment': return await assignmentDetail(request, id(parameter));
      case 'student-home': return await home(request);
      case 'student-character': return await character(request);
      case 'upload-init': return await initUpload(request);
      case 'submission-finalize': return await finalize(request);
      case 'review': return await review(request, id(parameter));
      case 'admin-overview': return await adminOverview(request);
      case 'admin-users': return await adminUsers(request, parameter);
      case 'admin-operations': return await adminOperations(request);
      case 'reset-code': return await resetStudentCode(request, id(parameter), id(secondaryParameter));
      default: throw new ApiError(404, '요청한 기능을 찾을 수 없어요.');
    }
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof RangeError) return json({ error: '날짜를 확인해 주세요.', code: 'INVALID_DATE' }, 400);
    // Do not log credentials, tokens, file URLs, student answers, or SDK error payloads.
    console.error('API operation failed', operation, (error as { code?: string }).code ?? 'INTERNAL');
    return json({ error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'INTERNAL_ERROR' }, 500);
  }
}
