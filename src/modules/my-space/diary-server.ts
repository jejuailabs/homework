import 'server-only';
import {randomUUID} from 'node:crypto';
import {FieldPath} from 'firebase-admin/firestore';
import {db, bucket} from '@/lib/server/admin';
import type {Context} from '@/lib/server/auth';
import {ApiError, id, isAdmin} from '@/lib/server/policy';
import type {DiaryPage} from './catalog';
import {ownedItems, revision, validateDiary} from './policy';
import {DIARY_RECOVERY_MS, DIARY_SESSION_MS, assertDiaryAttempt, diaryAvailable, diaryDigest, diaryKey, diaryPin, diaryRequestToken, diarySecret, failedDiaryAttempt, hashDiaryPin, openDiary, openDiaryAsset, readDiarySession, sealDiary, sealDiaryAsset, signDiarySession, verifyDiaryPin, type DiaryEnvelope, type DiaryPinHash} from './diary-vault';

type Data = Record<string, any>;
export type DiaryStudent = Context & {classId: string; studentId: string};
type Vault = Data & {ownerUid: string; pin: DiaryPinHash; lockVersion: number; failedAttempts?: number; blockedUntil?: number};
export const DIARY_VAULT_MAX_PAGES = 10_000, DIARY_VAULT_MAX_BYTES = 256 * 1024 * 1024, DIARY_VAULT_MAX_SHARES = 100;
const payloadBytes = (envelope: unknown) => Buffer.byteLength(JSON.stringify(envelope), 'utf8');
function capacity(vault: Data, bytes: number, entries = 0, shares = 0) {
  const next = {usedBytes: Math.max(0, (vault.usedBytes || 0) + bytes), entryCount: Math.max(0, (vault.entryCount || 0) + entries), shareCount: Math.max(0, (vault.shareCount || 0) + shares)};
  if (next.entryCount > DIARY_VAULT_MAX_PAGES || next.usedBytes > DIARY_VAULT_MAX_BYTES) throw new ApiError(409, '일기장 보관함이 가득 찼어요. 백업한 기록을 정리하거나 운영 담당자에게 문의해 주세요.', 'DIARY_CAPACITY');
  if (next.shareCount > DIARY_VAULT_MAX_SHARES) throw new ApiError(409, '공개본은 100개까지 보관해요. 예전 공개를 취소한 뒤 다시 공개해 주세요.', 'DIARY_SHARE_CAPACITY');
  return next;
}
const userRef = (uid: string) => db().doc('users/' + id(uid));
const vaultRef = (vaultId: string) => db().doc('personalDiaries/' + id(vaultId));
const requestRef = (vaultId: string) => db().doc('diaryRecoveryRequests/' + id(vaultId));
const shareRef = (shareId: string) => db().doc('diaryShares/' + id(shareId));
const stamp = () => new Date().toISOString();
const read = <T extends FirebaseFirestore.DocumentReference>(ref: T, tx?: FirebaseFirestore.Transaction) => tx ? tx.get(ref) : ref.get();
function studentRole(ctx: Context): asserts ctx is DiaryStudent {
  if (ctx.role !== 'student' || !ctx.classId || !ctx.studentId) throw new ApiError(403, '학생의 비밀일기장에서 이용해 주세요.', 'DIARY_STUDENT_ONLY');
}
function recoveryRole(ctx: Context) {
  if (!isAdmin(ctx.role)) throw new ApiError(403, '지정된 운영 복구 담당자만 처리할 수 있어요.', 'DIARY_RECOVERY_FORBIDDEN');
}
async function student(ctx: Context, tx?: FirebaseFirestore.Transaction) {
  studentRole(ctx);
  const [u, s, c] = await Promise.all([
    read(userRef(ctx.uid), tx), read(db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`), tx), read(db().doc('classes/' + ctx.classId), tx),
  ]);
  if (!u.exists || u.data()?.disabled || u.data()?.role !== 'student' || u.data()?.classId !== ctx.classId || u.data()?.studentId !== ctx.studentId || (u.data()?.authVersion || 0) !== ctx.authVersion || !s.exists || s.data()?.disabled || s.data()?.authUid !== ctx.uid || !c.exists) throw new ApiError(403, '학생 계정을 다시 확인해 주세요.', 'DIARY_ACCOUNT_CHANGED');
  return {user: u.data()!, pupil: s.data()!, ctx};
}
async function findVault(ctx: Context, tx?: FirebaseFirestore.Transaction) {
  const profile = await student(ctx, tx), vaultId = profile.user.diaryVaultId;
  if (typeof vaultId !== 'string' || !vaultId) return {...profile, vaultId: '', vault: null};
  const doc = await read(vaultRef(vaultId), tx);
  if (!doc.exists || doc.data()?.ownerUid !== ctx.uid) throw new ApiError(403, '일기장 연결을 다시 확인해 주세요.', 'DIARY_OWNER_CHANGED');
  return {...profile, vaultId, vault: doc.data() as Vault};
}
function claims(ctx: Context, vaultId: string, vault: Vault, request?: Request) {
  const session = request?.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('__session='))?.slice(10) || '';
  return {uid: ctx.uid, vaultId, authVersion: ctx.authVersion ?? -1, lockVersion: vault.lockVersion, loginBinding: diaryDigest(session)};
}
function assertUnlocked(request: Request, ctx: Context, vaultId: string, vault: Vault | null) {
  if (!vault || !readDiarySession(diaryRequestToken(request), claims(ctx, vaultId, vault, request))) throw new ApiError(423, '비밀일기장 잠금을 먼저 열어 주세요.', 'DIARY_LOCKED');
}
export async function requireDiaryUnlocked(request: Request, ctx: Context) {
  diaryKey();
  const found = await findVault(ctx);
  assertUnlocked(request, ctx, found.vaultId, found.vault);
  return {...found, vault: found.vault!};
}
const publicState = (found: Awaited<ReturnType<typeof findVault>>, unlocked: boolean) => ({
  available: true, configured: !!found.vault, unlocked, recoveryPending: !!found.vault?.recoveryPending,
  recoveredAt: found.vault?.recoveredAt || null,
  ...(unlocked ? {vaultId: found.vaultId, owned: ownedItems([...ownedItems(found.pupil.spaceOwned), ...(found.vault?.owned || [])])} : {}),
});
export async function diaryStatus(request: Request, ctx: Context) {
  studentRole(ctx);
  if (!diaryAvailable()) return {available: false, configured: false, unlocked: false, recoveryPending: false, recoveredAt: null};
  const found = await findVault(ctx);
  return publicState(found, !!found.vault && !!readDiarySession(diaryRequestToken(request), claims(ctx, found.vaultId, found.vault, request)));
}
function opened(ctx: Context, vaultId: string, vault: Vault, request?: Request) {
  return {body: {available: true, configured: true, unlocked: true, recoveryPending: !!vault.recoveryPending, recoveredAt: vault.recoveredAt || null, vaultId, owned: ownedItems(vault.owned)}, token: signDiarySession({...claims(ctx, vaultId, vault, request), expiresAt: Date.now() + DIARY_SESSION_MS})};
}
async function migrateLegacy(ctx: DiaryStudent, vaultId: string) {
  const ref = vaultRef(vaultId), current = await ref.get();
  if (current.data()?.legacyMigrated) return;
  const source = db().collection(`classes/${ctx.classId}/students/${ctx.studentId}/diaryPages`);
  const legacy = await source.limit(61).get();
  if (legacy.size > 60) throw new ApiError(409, '기존 노트가 많아 운영 담당자의 이전 확인이 필요해요.', 'DIARY_MIGRATION_REVIEW');
  for (const previous of legacy.docs) {
    await db().runTransaction(async tx => {
      const profile = await student(ctx, tx);
      const [v, old, destination] = await Promise.all([tx.get(ref), tx.get(previous.ref), tx.get(ref.collection('entries').doc(previous.id))]);
      if (v.data()?.ownerUid !== ctx.uid) throw new ApiError(403, '일기장 연결이 바뀌었어요.', 'DIARY_OWNER_CHANGED');
      if (!old.exists) return;
      const value = validateDiary(old.data(), ownedItems(profile.pupil.spaceOwned));
      const page = {...value, id: old.id, updatedAt: typeof old.data()?.updatedAt === 'string' ? old.data()!.updatedAt : stamp()};
      if (destination.exists) {
        if (!destination.data()?.legacy || destination.data()?.migrationHash !== diaryDigest(JSON.stringify(old.data()))) throw new ApiError(409, '기존 노트를 안전하게 옮기기 위해 확인이 필요해요.', 'DIARY_MIGRATION_CONFLICT');
        return;
      }
      const envelope = sealDiary(page, `${vaultId}/${old.id}`), bytes = payloadBytes(envelope);
      const quota = capacity(v.data()!, bytes, 1);
      tx.create(ref.collection('entries').doc(old.id), {envelope, bytes, month: value.date.slice(0, 7), version: value.version, updatedAt: page.updatedAt, legacy: true, migrationHash: diaryDigest(JSON.stringify(old.data()))});
      tx.update(ref, quota);
      // Snapshot the original ownership boundary. Legacy images are read only through this vault after transfer.
      for (const layer of value.layers) if ((layer.kind === 'photo' || layer.kind === 'art') && layer.assetId) {
        tx.set(ref.collection('legacyAssets').doc(diaryDigest(layer.kind + ':' + layer.assetId)), {kind: layer.kind, assetId: layer.assetId, classId: ctx.classId, studentId: ctx.studentId});
      }
    });
  }
  // Finish independent, encrypted copies before allowing a session or account handoff.
  // The old originals remain untouched; a failed copy can be retried without data loss.
  const assets = await ref.collection('legacyAssets').get();
  for (const asset of assets.docs) await snapshotLegacyAsset(vaultId, asset.ref, asset.data());
  await db().runTransaction(async tx => {
    const [v, remaining] = await Promise.all([tx.get(ref), tx.get(source.limit(61))]);
    if (v.data()?.ownerUid !== ctx.uid || remaining.size > 60) throw new ApiError(409, '노트 이전을 다시 시도해 주세요.', 'DIARY_MIGRATION_RETRY');
    const copies = await Promise.all(remaining.docs.map(old => tx.get(ref.collection('entries').doc(old.id))));
    if (copies.some((copy, i) => !copy.exists || !copy.data()?.legacy || copy.data()?.migrationHash !== diaryDigest(JSON.stringify(remaining.docs[i].data())))) throw new ApiError(409, '이전 중 기존 노트가 바뀌었어요. 운영 담당자에게 알려 주세요.', 'DIARY_MIGRATION_CONFLICT');
    for (const old of remaining.docs) tx.delete(old.ref);
    tx.update(ref, {legacyMigrated: true, migratedAt: stamp()});
  });
}
export async function setupDiary(ctx: Context, input: Data, request?: Request) {
  diaryKey(); studentRole(ctx);
  const pin = await hashDiaryPin(input.pin), vaultId = randomUUID();
  const vault = await db().runTransaction(async tx => {
    const profile = await student(ctx, tx);
    if (profile.user.diaryVaultId) throw new ApiError(409, '이미 잠금번호가 있어요. 잠금을 열거나 복구를 요청해 주세요.', 'DIARY_ALREADY_CONFIGURED');
    const value: Vault = {ownerUid: ctx.uid, pin, lockVersion: 1, failedAttempts: 0, blockedUntil: 0, createdAt: stamp(), legacyMigrated: false, owned: ownedItems(profile.pupil.spaceOwned), usedBytes: 0, entryCount: 0, shareCount: 0};
    tx.create(vaultRef(vaultId), value); tx.update(userRef(ctx.uid), {diaryVaultId: vaultId});
    return value;
  });
  await migrateLegacy(ctx, vaultId);
  return opened(ctx, vaultId, vault, request);
}
export async function unlockDiary(ctx: Context, input: Data, request?: Request) {
  diaryKey(); diaryPin(input.pin); studentRole(ctx);
  const result = await db().runTransaction(async tx => {
    const found = await findVault(ctx, tx);
    if (!found.vault) throw new ApiError(409, '먼저 일기장 잠금번호를 만들어 주세요.', 'DIARY_NOT_CONFIGURED');
    assertDiaryAttempt(found.vault);
    if (!await verifyDiaryPin(input.pin, found.vault.pin)) {
      tx.update(vaultRef(found.vaultId), failedDiaryAttempt(found.vault));
      return null;
    }
    const owned = ownedItems([...ownedItems(found.pupil.spaceOwned), ...(found.vault.owned || [])]);
    tx.update(vaultRef(found.vaultId), {failedAttempts: 0, blockedUntil: 0, owned});
    found.vault.owned = owned;
    return found;
  });
  if (!result) throw new ApiError(403, '잠금번호가 맞지 않아요. 다시 확인해 주세요.', 'DIARY_PIN_WRONG');
  await migrateLegacy(ctx, result.vaultId);
  return opened(ctx, result.vaultId, result.vault!, request);
}
export async function lockDiary(request: Request, ctx: Context) {
  diaryKey();
  await db().runTransaction(async tx => {
    const found = await findVault(ctx, tx);
    if (found.vault && readDiarySession(diaryRequestToken(request), claims(ctx, found.vaultId, found.vault, request))) tx.update(vaultRef(found.vaultId), {lockVersion: found.vault.lockVersion + 1});
  });
  return {locked: true};
}
export async function listDiaryPages(request: Request, ctx: Context, month: string, cursor: string) {
  const found = await requireDiaryUnlocked(request, ctx);
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, '달력의 월을 확인해 주세요.');
  let query: FirebaseFirestore.Query = vaultRef(found.vaultId).collection('entries');
  if (month) query = query.where('month', '==', month);
  query = query.orderBy(FieldPath.documentId()).limit(41);
  if (cursor) query = query.startAfter(id(cursor));
  const docs = (await query.get()).docs;
  return {pages: docs.slice(0, 40).map(doc => openDiary<DiaryPage>(doc.data().envelope, `${found.vaultId}/${doc.id}`)), cursor: docs.length > 40 ? docs[39].id : ''};
}
export async function saveDiaryPage(request: Request, ctx: Context, pageId: string, input: Data) {
  diaryKey(); id(pageId);
  return db().runTransaction(async tx => {
    const found = await findVault(ctx, tx);
    assertUnlocked(request, ctx, found.vaultId, found.vault);
    const ref = vaultRef(found.vaultId).collection('entries').doc(pageId), old = await tx.get(ref);
    const items = ownedItems([...ownedItems(found.pupil.spaceOwned), ...(found.vault!.owned || [])]);
    const value = validateDiary(input, items);
    if ((old.data()?.version || 0) !== value.version) throw new ApiError(409, '다른 화면에서 일기가 바뀌었어요. 새로 불러와 주세요.', 'VERSION_CONFLICT');
    // Photo/art references may only come from migrated pages. Arbitrary class assets are never accepted.
    const media = value.layers.filter(l => l.kind === 'photo' || l.kind === 'art');
    for (const layer of media) {
      const reference = await tx.get(vaultRef(found.vaultId).collection('legacyAssets').doc(diaryDigest(layer.kind + ':' + layer.assetId)));
      if (!reference.exists) throw new ApiError(403, '이 일기장에 보관된 사진만 사용할 수 있어요.', 'DIARY_ASSET_FORBIDDEN');
    }
    const page: DiaryPage = {...value, id: pageId, version: value.version + 1, updatedAt: stamp()};
    const envelope = sealDiary(page, `${found.vaultId}/${pageId}`), bytes = payloadBytes(envelope);
    const quota = capacity(found.vault!, bytes - (old.exists ? old.data()?.bytes ?? payloadBytes(old.data()!.envelope) : 0), old.exists ? 0 : 1);
    tx.set(ref, {envelope, bytes, month: page.date.slice(0, 7), version: page.version, updatedAt: page.updatedAt});
    tx.update(vaultRef(found.vaultId), {owned: items, ...quota});
    return {page};
  });
}
export async function deleteDiaryPage(request: Request, ctx: Context, pageId: string, expected: number) {
  diaryKey(); id(pageId); revision(expected);
  return db().runTransaction(async tx => {
    const found = await findVault(ctx, tx); assertUnlocked(request, ctx, found.vaultId, found.vault);
    const ref = vaultRef(found.vaultId).collection('entries').doc(pageId), old = await tx.get(ref);
    if (!old.exists) return {deleted: true};
    if (old.data()?.version !== expected) throw new ApiError(409, '일기가 바뀌었어요. 새로 불러와 주세요.', 'VERSION_CONFLICT');
    const quota = capacity(found.vault!, -(old.data()?.bytes ?? payloadBytes(old.data()!.envelope)), -1);
    tx.delete(ref); tx.update(vaultRef(found.vaultId), quota); return {deleted: true};
  });
}
export async function requestDiaryRecovery(ctx: Context) {
  diaryKey();
  return db().runTransaction(async tx => {
    const found = await findVault(ctx, tx);
    if (!found.vault) throw new ApiError(409, '아직 잠금번호를 만들지 않았어요.', 'DIARY_NOT_CONFIGURED');
    const previous = await tx.get(requestRef(found.vaultId));
    if (previous.data()?.status === 'pending') return {requested: true};
    tx.set(requestRef(found.vaultId), {vaultId: found.vaultId, ownerUid: ctx.uid, studentName: found.pupil.name || '', classId: found.ctx.classId, studentId: found.ctx.studentId, status: 'pending', requestedAt: stamp()});
    tx.update(vaultRef(found.vaultId), {recoveryPending: true});
    return {requested: true};
  });
}
export async function listDiaryRecovery(ctx: Context) {
  recoveryRole(ctx);
  const rows = await db().collection('diaryRecoveryRequests').where('status', '==', 'pending').limit(100).get();
  return {requests: rows.docs.map(doc => {
    const row = doc.data();
    return {id: doc.id, studentName: row.studentName, classId: row.classId, studentId: row.studentId, requestedAt: row.requestedAt};
  }).sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt)))};
}
export async function issueDiaryRecovery(ctx: Context, vaultId: string, input: Data) {
  recoveryRole(ctx); diaryKey(); id(vaultId);
  if (input.verified !== true || typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 500) throw new ApiError(400, '학생 본인 확인 후 확인 방법을 10~500자로 남겨 주세요.', 'DIARY_VERIFICATION_REQUIRED');
  const secret = diarySecret(), expiresAt = Date.now() + DIARY_RECOVERY_MS, eventId = randomUUID();
  await db().runTransaction(async tx => {
    const [v, r] = await Promise.all([tx.get(vaultRef(vaultId)), tx.get(requestRef(vaultId))]);
    if (!v.exists || r.data()?.status !== 'pending' || r.data()?.ownerUid !== v.data()?.ownerUid) throw new ApiError(409, '처리할 복구 요청을 다시 확인해 주세요.');
    tx.update(vaultRef(vaultId), {recovery: {hash: diaryDigest(secret), expiresAt, issuedBy: ctx.uid}, lockVersion: (v.data()?.lockVersion || 0) + 1, failedAttempts: 0, blockedUntil: 0});
    tx.update(requestRef(vaultId), {status: 'issued', issuedAt: stamp(), issuedBy: ctx.uid});
    tx.create(vaultRef(vaultId).collection('audit').doc(eventId), {kind: 'recovery-issued', actorUid: ctx.uid, at: stamp(), verification: input.reason.trim()});
  });
  return {ticket: vaultId + '.' + secret, expiresAt};
}
export async function recoverDiary(ctx: Context, input: Data, request?: Request) {
  diaryKey(); studentRole(ctx);
  const pin = await hashDiaryPin(input.pin), ticket = typeof input.ticket === 'string' ? input.ticket.trim() : '';
  const [vaultId, secret, extra] = ticket.split('.');
  if (!vaultId || !secret || extra || ticket.length > 240) throw new ApiError(400, '담당자가 알려 준 복구 코드를 확인해 주세요.', 'DIARY_RECOVERY_INVALID');
  id(vaultId);
  const result = await db().runTransaction(async tx => {
    const found = await findVault(ctx, tx);
    if (!found.vault || found.vaultId !== vaultId) return null;
    assertDiaryAttempt(found.vault);
    if (!found.vault.recovery || found.vault.recovery.expiresAt <= Date.now() || found.vault.recovery.hash !== diaryDigest(secret)) {
      tx.update(vaultRef(vaultId), failedDiaryAttempt(found.vault)); return null;
    }
    const recoveredAt = stamp(), vault = {...found.vault, pin, recovery: null, recoveryPending: false, recoveredAt, lockVersion: found.vault.lockVersion + 1, failedAttempts: 0, blockedUntil: 0};
    tx.set(vaultRef(vaultId), vault);
    tx.set(requestRef(vaultId), {status: 'completed', completedAt: recoveredAt}, {merge: true});
    tx.create(vaultRef(vaultId).collection('audit').doc(randomUUID()), {kind: 'recovery-completed', actorUid: ctx.uid, at: recoveredAt});
    return vault;
  });
  if (!result) throw new ApiError(403, '복구 코드가 맞지 않거나 시간이 지났어요. 담당자에게 다시 요청해 주세요.', 'DIARY_RECOVERY_INVALID');
  await migrateLegacy(ctx, vaultId);
  return opened(ctx, vaultId, result, request);
}
export async function issueDiaryTransfer(request: Request, ctx: Context) {
  diaryKey(); const secret = diarySecret(), expiresAt = Date.now() + DIARY_RECOVERY_MS;
  const vaultId = await db().runTransaction(async tx => {
    const found = await findVault(ctx, tx); assertUnlocked(request, ctx, found.vaultId, found.vault);
    if (!found.vault!.legacyMigrated) throw new ApiError(409, '기존 일기 이전이 끝난 뒤 이어쓰기 코드를 만들 수 있어요.', 'DIARY_MIGRATION_PENDING');
    tx.update(vaultRef(found.vaultId), {transfer: {hash: diaryDigest(secret), expiresAt}, owned: ownedItems([...ownedItems(found.pupil.spaceOwned), ...(found.vault!.owned || [])])});
    return found.vaultId;
  });
  return {token: vaultId + '.' + secret, expiresAt};
}
export async function claimDiaryTransfer(ctx: Context, input: Data, request?: Request) {
  diaryKey(); studentRole(ctx); diaryPin(input.pin);
  const [vaultId, secret, extra] = (typeof input.token === 'string' ? input.token.trim() : '').split('.');
  if (!vaultId || !secret || extra || vaultId.length > 100 || secret.length > 100) throw new ApiError(400, '이어쓰기 코드를 확인해 주세요.', 'DIARY_TRANSFER_INVALID');
  id(vaultId);
  const result = await db().runTransaction(async tx => {
    const profile = await student(ctx, tx), snapshot = await tx.get(vaultRef(vaultId));
    if (profile.user.diaryVaultId) throw new ApiError(409, '이미 일기장이 연결된 계정이에요. 먼저 백업을 내려받고 담당자에게 문의해 주세요.', 'DIARY_TRANSFER_HAS_VAULT');
    const vault = snapshot.data() as Vault | undefined;
    if (!vault || !vault.transfer || vault.transfer.expiresAt <= Date.now() || vault.transfer.hash !== diaryDigest(secret)) return null;
    assertDiaryAttempt(vault);
    if (!await verifyDiaryPin(input.pin, vault.pin)) {tx.update(snapshot.ref, failedDiaryAttempt(vault)); return null;}
    const oldUser = await tx.get(userRef(vault.ownerUid));
    const next = {...vault, ownerUid: ctx.uid, lockVersion: vault.lockVersion + 1, transfer: null, recovery: null, recoveryPending: false, failedAttempts: 0, blockedUntil: 0, transferredAt: stamp()};
    tx.set(snapshot.ref, next); tx.update(userRef(ctx.uid), {diaryVaultId: vaultId});
    if (oldUser.exists && oldUser.data()?.diaryVaultId === vaultId) tx.update(oldUser.ref, {diaryVaultId: null});
    tx.set(requestRef(vaultId), {status: 'transferred', ownerUid: ctx.uid}, {merge: true});
    tx.create(snapshot.ref.collection('audit').doc(randomUUID()), {kind: 'owner-transfer', fromUid: vault.ownerUid, actorUid: ctx.uid, at: stamp()});
    return next;
  });
  if (!result) throw new ApiError(403, '이어쓰기 코드나 기존 잠금번호를 확인해 주세요.', 'DIARY_TRANSFER_INVALID');
  return opened(ctx, vaultId, result, request);
}

/** Preserve migrated image references without giving the new account access to the former class. */
export async function readDiaryAsset(request: Request, ctx: Context, kind: string, assetId: string) {
  if (!['photo', 'art'].includes(kind) || !/^[\w-]+(?::[\w-]+)?$/.test(assetId)) throw new ApiError(400, '일기 사진을 확인해 주세요.');
  const found = await requireDiaryUnlocked(request, ctx);
  return readStoredDiaryAsset(found.vaultId, kind, assetId);
}
async function readStoredDiaryAsset(vaultId: string, kind: string, assetId: string) {
  const key = diaryDigest(kind + ':' + assetId);
  const ref = vaultRef(vaultId).collection('legacyAssets').doc(key), snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, '보관된 사진을 찾을 수 없어요.');
  const source = snapshot.data()!;
  const snapshotPath = await snapshotLegacyAsset(vaultId, ref, source);
  const [raw] = await bucket().file(snapshotPath).download();
  return {bytes: openDiaryAsset(JSON.parse(raw.toString('utf8')) as DiaryEnvelope, `${vaultId}/asset/${key}`), contentType: 'image/webp'};
}
async function snapshotLegacyAsset(vaultId: string, ref: FirebaseFirestore.DocumentReference, source: Data) {
  if (source.snapshot) return source.snapshot as string;
  const {kind, assetId} = source, key = diaryDigest(kind + ':' + assetId);
  let path: string;
  if (kind === 'photo') {
    const photo = await db().doc(`classes/${source.classId}/students/${source.studentId}/spacePhotos/${assetId}`).get();
    if (photo.data()?.status !== 'ready') throw new ApiError(404, '이전 노트의 사진을 찾을 수 없어요.');
    path = `student-spaces/${source.classId}/${source.studentId}/${assetId}.webp`;
  } else {
    const [exhibitionId, artworkId] = assetId.split(':');
    const [exhibition, artwork] = await Promise.all([db().doc(`exhibitions/${exhibitionId}`).get(), db().doc(`exhibitions/${exhibitionId}/artworks/${artworkId}`).get()]);
    if (exhibition.data()?.classId !== source.classId || artwork.data()?.studentId !== source.studentId || artwork.data()?.status !== 'approved' || typeof artwork.data()?.displayPath !== 'string') throw new ApiError(404, '이전 노트의 작품을 찾을 수 없어요.');
    path = artwork.data()!.displayPath;
  }
  const [bytes] = await bucket().file(path).download();
  const snapshotPath = `private-diaries/${vaultId}/assets/${key}.json`;
  const envelope = sealDiaryAsset(bytes, `${vaultId}/asset/${key}`);
  const bytesToReserve = payloadBytes(envelope);
  const alreadyCopied = await db().runTransaction(async tx => {
    const [currentVault, currentAsset] = await Promise.all([tx.get(vaultRef(vaultId)), tx.get(ref)]);
    if (currentAsset.data()?.snapshot) return currentAsset.data()!.snapshot as string;
    if (!currentVault.exists || !currentAsset.exists) throw new ApiError(409, '사진 이전을 다시 확인해 주세요.', 'DIARY_MIGRATION_RETRY');
    // Reserve before a storage write. Failed attempts retain the reservation for a bounded, idempotent retry.
    tx.update(vaultRef(vaultId), capacity(currentVault.data()!, bytesToReserve - (currentAsset.data()?.reservedBytes || 0)));
    tx.update(ref, {reservedBytes: bytesToReserve});
    return '';
  });
  if (alreadyCopied) return alreadyCopied;
  await bucket().file(snapshotPath).save(Buffer.from(JSON.stringify(envelope)), {resumable: false, metadata: {contentType: 'application/json', cacheControl: 'private,no-store'}});
  await ref.update({snapshot: snapshotPath});
  return snapshotPath;
}

/** Share an explicit immutable copy; private pages and later edits retain their own access boundary. */
export async function shareDiaryPage(request: Request, ctx: Context, pageId: string, input: Data) {
  diaryKey(); id(pageId); revision(input.version);
  return db().runTransaction(async tx => {
    const found = await findVault(ctx, tx); assertUnlocked(request, ctx, found.vaultId, found.vault);
    const [entry, classroom] = await Promise.all([tx.get(vaultRef(found.vaultId).collection('entries').doc(pageId)), tx.get(db().doc('classes/' + found.ctx.classId))]);
    if (!entry.exists) throw new ApiError(404, '공개할 일기를 찾을 수 없어요.');
    if (entry.data()?.version !== input.version) throw new ApiError(409, '먼저 최신 내용을 저장한 뒤 공개해 주세요.', 'VERSION_CONFLICT');
    const recipientUid = classroom.data()?.ownerUid;
    if (typeof recipientUid !== 'string' || !recipientUid || recipientUid === ctx.uid) throw new ApiError(409, '현재 학급의 선생님을 확인해 주세요.', 'DIARY_RECIPIENT_UNAVAILABLE');
    id(recipientUid);
    const shareId = diaryDigest([found.vaultId, pageId, input.version, recipientUid].join('/'));
    const ref = shareRef(shareId), existing = await tx.get(ref);
    if (existing.exists) return {shareId};
    const page = openDiary<DiaryPage>(entry.data()!.envelope, `${found.vaultId}/${pageId}`);
    const envelope = sealDiary(page, 'diary-share/' + shareId), bytes = payloadBytes(envelope);
    const quota = capacity(found.vault!, bytes, 0, 1);
    tx.create(ref, {vaultId: found.vaultId, ownerUid: ctx.uid, recipientUid, classId: found.ctx.classId, pageId, version: input.version, studentName: String(found.pupil.name || '').slice(0, 80), sharedAt: stamp(), envelope, bytes});
    tx.update(vaultRef(found.vaultId), quota);
    return {shareId};
  });
}
export async function listDiaryShares(request: Request, ctx: Context, cursor = '') {
  const found = await requireDiaryUnlocked(request, ctx);
  let query = db().collection('diaryShares').where('vaultId', '==', found.vaultId).orderBy(FieldPath.documentId()).limit(51);
  if (cursor) query = query.startAfter(id(cursor));
  const rows = (await query.get()).docs;
  return {shares: rows.slice(0, 50).map(doc => {
    const value = doc.data(), page = openDiary<DiaryPage>(value.envelope, 'diary-share/' + doc.id);
    return {id: doc.id, pageId: value.pageId, version: value.version, title: page.title, date: page.date, sharedAt: value.sharedAt};
  }), cursor: rows.length > 50 ? rows[49].id : ''};
}
export async function revokeDiaryShare(request: Request, ctx: Context, shareId: string) {
  diaryKey(); id(shareId);
  return db().runTransaction(async tx => {
    const found = await findVault(ctx, tx); assertUnlocked(request, ctx, found.vaultId, found.vault);
    const ref = shareRef(shareId), shared = await tx.get(ref);
    if (shared.exists && shared.data()?.vaultId !== found.vaultId) throw new ApiError(404, '공개한 일기를 찾을 수 없어요.');
    if (shared.exists) {tx.delete(ref); tx.update(vaultRef(found.vaultId), capacity(found.vault!, -(shared.data()?.bytes ?? payloadBytes(shared.data()!.envelope)), 0, -1));}
    return {revoked: true};
  });
}
function recipientRole(ctx: Context) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님에게 공개한 일기만 이 화면에서 볼 수 있어요.', 'DIARY_RECIPIENT_ONLY');
}
export async function listReceivedDiaryShares(ctx: Context, cursor = '') {
  recipientRole(ctx); diaryKey();
  let query = db().collection('diaryShares').where('recipientUid', '==', ctx.uid).orderBy(FieldPath.documentId()).limit(51);
  if (cursor) query = query.startAfter(id(cursor));
  const rows = (await query.get()).docs;
  return {shares: rows.slice(0, 50).map(doc => {
    const value = doc.data(), page = openDiary<DiaryPage>(value.envelope, 'diary-share/' + doc.id);
    return {id: doc.id, studentName: value.studentName, title: page.title, date: page.date, sharedAt: value.sharedAt};
  }), cursor: rows.length > 50 ? rows[49].id : ''};
}
async function receivedShare(ctx: Context, shareId: string) {
  recipientRole(ctx); diaryKey(); id(shareId);
  const document = await shareRef(shareId).get();
  // An administrator has no implicit read privilege: only the exact chosen recipient can read this copy.
  if (!document.exists || document.data()?.recipientUid !== ctx.uid) throw new ApiError(404, '공개한 일기를 찾을 수 없거나 공개가 취소됐어요.', 'DIARY_SHARE_UNAVAILABLE');
  const value = document.data()!;
  return {value, page: openDiary<DiaryPage>(value.envelope, 'diary-share/' + shareId)};
}
export async function readReceivedDiaryShare(ctx: Context, shareId: string) {
  const {value, page} = await receivedShare(ctx, shareId);
  return {page, studentName: value.studentName, sharedAt: value.sharedAt};
}
export async function readReceivedDiaryAsset(ctx: Context, shareId: string, kind: string, assetId: string) {
  const {value, page} = await receivedShare(ctx, shareId);
  if (!['photo', 'art'].includes(kind) || !page.layers.some(layer => layer.kind === kind && layer.assetId === assetId)) throw new ApiError(404, '이 공개본에 들어 있는 사진만 볼 수 있어요.', 'DIARY_SHARE_ASSET_FORBIDDEN');
  return readStoredDiaryAsset(value.vaultId, kind, assetId);
}
