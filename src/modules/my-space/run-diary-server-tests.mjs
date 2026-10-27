// Hermetic security checks: Firebase, Storage and all account services are memory substitutes.
import ts from 'typescript';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const cache = new Map();
const mocks = {
  '@/lib/server/admin': moduleUrl('export const db=()=>globalThis.__diaryFixture.db;export const bucket=()=>globalThis.__diaryFixture.bucket;'),
  '@/lib/server/auth': moduleUrl('export const getContext=async()=>globalThis.__diaryFixture.actor;'),
  'firebase-admin/firestore': moduleUrl('export const FieldPath={documentId:()=>"__name__"};'),
  'next/server': moduleUrl(`export class NextResponse extends Response {constructor(body, options){super(body,options);this.cookies={set:(name,value,options)=>{this.cookieOptions=options;this.headers.append('Set-Cookie',name+'='+value);}};}static json(value, options){return new NextResponse(JSON.stringify(value),{...options,headers:{...options?.headers,'Content-Type':'application/json'}});}}`),
};
function load(path) {
  if (cache.has(path)) return cache.get(path);
  let code = ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText.replace(/import ['"]server-only['"];?/g, '');
  code = code.replace(/from\s*(['"])([^'"]+)\1/g, (whole, quote, name) => {
    if (mocks[name]) return 'from ' + JSON.stringify(mocks[name]);
    if (!name.startsWith('.') && !name.startsWith('@/')) return whole;
    const target = name.startsWith('@/') ? resolve(here, '../../', name.slice(2)) : resolve(dirname(path), name);
    const file = ['.ts', '.tsx', '.js', ''].map(s => target + s).find(existsSync);
    if (!file) throw Error('Missing local dependency: ' + name);
    return 'from ' + JSON.stringify(load(file));
  });
  const url = moduleUrl(code); cache.set(path, url); return url;
}
const security = await import(load(resolve(here, 'diary-vault.ts')));
const server = await import(load(resolve(here, 'diary-server.ts')));
const route = await import(load(resolve(here, '../../app/api/secret-diary/[[...segments]]/route.ts')));
process.env.DIARY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
Error.prepareStackTrace = (error, stack) => error.name + ': ' + error.message + '\n' + stack.filter(s => !String(s).includes('data:')).slice(0, 6).join('\n');

const student = {uid: 'student-a', role: 'student', classId: 'class-a', studentId: 'pupil-a', authVersion: 1, email: null, displayName: '가온'};
const second = {uid: 'student-b', role: 'student', classId: 'class-b', studentId: 'pupil-b', authVersion: 1, email: null, displayName: '가온'};
const admin = {uid: 'admin-a', role: 'admin', email: 'admin@example.invalid', displayName: '담당자'};
const teacher = {...admin, uid: 'teacher-a', role: 'teacher'};
const page = (title = '오늘의 비밀') => ({schemaVersion: 2, version: 0, title, date: '2026-10-27', paper: 'paper-cream', mood: '', layers: [{id: 'text-a', kind: 'text', itemId: '', text: 'PRIVATE EMOTION CONTENT', color: '#123456', x: 50, y: 30, size: 60, rotation: 0, flip: false, fontSize: 24}]});
const request = token => new Request('http://localhost/api/secret-diary/pages', {headers: {cookie: security.diaryCookieName + '=' + token}});
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

function fixture() {
  const values = new Map(), files = new Map(); let chain = Promise.resolve();
  const clone = value => value === undefined ? undefined : structuredClone(value);
  class Ref {
    constructor(path) {this.path = path; this.id = path.split('/').at(-1);}
    collection(name) {return new Query(this.path + '/' + name);}
    async get() {const value = clone(values.get(this.path)); return {id: this.id, ref: this, exists: value !== undefined, data: () => clone(value)};}
    async update(value) {if (!values.has(this.path)) throw Error('Missing update ' + this.path); values.set(this.path, {...values.get(this.path), ...clone(value)});}
  }
  class Query {
    constructor(path, filters = [], count = Infinity, cursor = '') {this.path = path; this.filters = filters; this.count = count; this.cursor = cursor;}
    doc(id) {return new Ref(this.path + '/' + id);}
    where(field, op, value) {assert.equal(op, '=='); return new Query(this.path, [...this.filters, [field, value]], this.count, this.cursor);}
    orderBy() {return this;}
    limit(count) {return new Query(this.path, this.filters, count, this.cursor);}
    startAfter(cursor) {return new Query(this.path, this.filters, this.count, typeof cursor === 'string' ? cursor : cursor.id);}
    async get() {
      const paths = [...values.keys()].filter(path => path.startsWith(this.path + '/') && path.slice(this.path.length + 1).indexOf('/') < 0 && path.split('/').at(-1) > this.cursor && this.filters.every(([field, value]) => values.get(path)[field] === value)).sort().slice(0, this.count);
      const docs = await Promise.all(paths.map(path => new Ref(path).get()));
      return {docs, empty: docs.length === 0, size: docs.length};
    }
  }
  const database = {
    doc: path => new Ref(path), collection: path => new Query(path),
    runTransaction: callback => {
      const operation = chain.then(async () => {
        const writes = [];
        const tx = {
          get: async ref => {assert.equal(writes.length, 0, 'Firestore requires all reads before writes'); return ref.get();},
          set: (ref, value, options) => writes.push(() => values.set(ref.path, options?.merge ? {...values.get(ref.path), ...clone(value)} : clone(value))),
          create: (ref, value) => {if (values.has(ref.path)) throw Error('Already exists'); writes.push(() => values.set(ref.path, clone(value)));},
          update: (ref, value) => {if (!values.has(ref.path)) throw Error('Missing document ' + ref.path); writes.push(() => values.set(ref.path, {...values.get(ref.path), ...clone(value)}));},
          delete: ref => writes.push(() => values.delete(ref.path)),
        };
        const result = await callback(tx); writes.forEach(write => write()); return result;
      });
      chain = operation.catch(() => {}); return operation;
    },
  };
  for (const ctx of [student, second]) {
    values.set('users/' + ctx.uid, {role: 'student', classId: ctx.classId, studentId: ctx.studentId, authVersion: 1});
    values.set('classes/' + ctx.classId, {ownerUid: teacher.uid, pointSettings: {enabled: false}});
    values.set(`classes/${ctx.classId}/students/${ctx.studentId}`, {authUid: ctx.uid, name: '가온', spaceOwned: ['sticker-flower']});
  }
  globalThis.__diaryFixture = {actor: student, db: database, bucket: {file: path => ({download: async () => {if (!files.has(path)) throw Error('Missing object'); return [Buffer.from(files.get(path))];}, save: async bytes => {files.set(path, Buffer.from(bytes));}})}};
  return {values, files, db: database, vault: uid => values.get('users/' + uid).diaryVaultId};
}

test('dedicated key fails closed, encrypted pages authenticate their owner and identifier', () => {
  const saved = process.env.DIARY_ENCRYPTION_KEY;
  delete process.env.DIARY_ENCRYPTION_KEY; assert.equal(security.diaryAvailable(), false); assert.throws(() => security.sealDiary(page(), 'v/p'), e => e.code === 'DIARY_UNAVAILABLE');
  process.env.DIARY_ENCRYPTION_KEY = saved;
  const sealed = security.sealDiary(page(), 'v/p');
  assert(!JSON.stringify(sealed).includes('PRIVATE')); assert.deepEqual(security.openDiary(sealed, 'v/p'), page());
  assert.throws(() => security.openDiary(sealed, 'different-vault/p'), e => e.code === 'DIARY_READ_FAILED');
  assert.throws(() => security.openDiary({...sealed, tag: Buffer.alloc(16).toString('base64url')}, 'v/p'), e => e.code === 'DIARY_READ_FAILED');
});

test('PIN hashes are salted and cookie claims reject another account, expiry and lock version', async () => {
  const a = await security.hashDiaryPin('123456'), b = await security.hashDiaryPin('123456');
  assert.notEqual(a.hash, b.hash); assert(await security.verifyDiaryPin('123456', a)); assert.equal(await security.verifyDiaryPin('123457', a), false);
  const expected = {uid: 'a', vaultId: 'v', authVersion: 1, lockVersion: 2, loginBinding: 'login-a'}, now = Date.now();
  const token = security.signDiarySession({...expected, expiresAt: now + 1000});
  assert(security.readDiarySession(token, expected, now));
  for (const other of [{...expected, uid: 'b'}, {...expected, authVersion: 2}, {...expected, lockVersion: 3}, {...expected, loginBinding: 'login-b'}]) assert.equal(security.readDiarySession(token, other, now), null);
  assert.equal(security.readDiarySession(token, expected, now + 1001), null);
});

test('student-only unlocked reads, encryption at rest and writes independent of point settings', async () => {
  const f = fixture(), opened = await server.setupDiary(student, {pin: '123456'}), req = request(opened.token);
  const saved = await server.saveDiaryPage(req, student, 'page-a', page());
  assert.equal(saved.page.version, 1);
  const stored = f.values.get(`personalDiaries/${f.vault(student.uid)}/entries/page-a`);
  assert(!JSON.stringify(stored).includes('PRIVATE')); assert(!('title' in stored));
  assert.equal((await server.listDiaryPages(req, student, '2026-10', '')).pages[0].title, page().title);
  await rejects(server.listDiaryPages(req, teacher, '', ''), 'DIARY_STUDENT_ONLY');
  await rejects(server.listDiaryPages(req, admin, '', ''), 'DIARY_STUDENT_ONLY');
  await rejects(server.listDiaryPages(req, second, '', ''), 'DIARY_LOCKED');
  await rejects(server.saveDiaryPage(req, student, 'page-a', page()), 'VERSION_CONFLICT');
  await server.lockDiary(req, student); await rejects(server.listDiaryPages(req, student, '', ''), 'DIARY_LOCKED');
});

test('wrong PIN attempts persist even when rejected and block repeated guesses', async () => {
  const f = fixture(); await server.setupDiary(student, {pin: '123456'});
  for (let i = 0; i < 5; i++) await rejects(server.unlockDiary(student, {pin: '000000'}), 'DIARY_PIN_WRONG');
  assert.equal(f.values.get('personalDiaries/' + f.vault(student.uid)).failedAttempts, 5);
  await rejects(server.unlockDiary(student, {pin: '123456'}), 'DIARY_THROTTLED');
  const v = f.values.get('personalDiaries/' + f.vault(student.uid)); v.blockedUntil = Date.now() - 1;
  const opened = await server.unlockDiary(student, {pin: '123456'}); assert(opened.token);
  assert.equal(f.values.get('personalDiaries/' + f.vault(student.uid)).failedAttempts, 0);
});

test('teacher cannot reset; verified admin ticket is single-use and preserves encrypted records', async () => {
  const f = fixture(), original = await server.setupDiary(student, {pin: '123456'}), vaultId = f.vault(student.uid);
  await server.saveDiaryPage(request(original.token), student, 'page-a', page());
  const before = structuredClone(f.values.get(`personalDiaries/${vaultId}/entries/page-a`));
  await server.requestDiaryRecovery(student);
  await rejects(server.issueDiaryRecovery(teacher, vaultId, {verified: true, reason: '학생 본인 확인 완료'}), 'DIARY_RECOVERY_FORBIDDEN');
  await rejects(server.issueDiaryRecovery(admin, vaultId, {verified: false, reason: '학생 본인 확인 완료'}), 'DIARY_VERIFICATION_REQUIRED');
  const listing = await server.listDiaryRecovery(admin); assert.equal(listing.requests.length, 1); assert(!JSON.stringify(listing).includes('PRIVATE'));
  const issued = await server.issueDiaryRecovery(admin, vaultId, {verified: true, reason: '학생과 대면하여 본인 확인'});
  await rejects(server.listDiaryPages(request(original.token), student, '', ''), 'DIARY_LOCKED');
  assert(!JSON.stringify([...f.values.values()]).includes(issued.ticket));
  const recovered = await server.recoverDiary(student, {ticket: issued.ticket, pin: '654321'});
  assert.deepEqual(f.values.get(`personalDiaries/${vaultId}/entries/page-a`), before);
  assert.equal((await server.listDiaryPages(request(recovered.token), student, '', '')).pages.length, 1);
  await rejects(server.recoverDiary(student, {ticket: issued.ticket, pin: '777777'}), 'DIARY_RECOVERY_INVALID');
  await rejects(server.unlockDiary(student, {pin: '123456'}), 'DIARY_PIN_WRONG');
  assert((await server.unlockDiary(student, {pin: '654321'})).token);
});

test('legacy pages and photos become independent encrypted copies before transfer', async () => {
  const f = fixture(), originalPath = `classes/${student.classId}/students/${student.studentId}/diaryPages/legacy-a`;
  const legacy = {...page(), layers: [...page().layers, {id: 'photo-layer', kind: 'photo', itemId: '', assetId: 'photo-a', x: 30, y: 50, size: 30, rotation: 0, flip: false}]};
  f.values.set(originalPath, {...legacy, updatedAt: '2026-10-26T00:00:00.000Z'});
  f.values.set(`classes/${student.classId}/students/${student.studentId}/spacePhotos/photo-a`, {status: 'ready'});
  const pixels = Buffer.from('synthetic-test-image-only'); f.files.set(`student-spaces/${student.classId}/${student.studentId}/photo-a.webp`, pixels);
  const opened = await server.setupDiary(student, {pin: '123456'}), vaultId = f.vault(student.uid);
  assert.equal(f.values.has(originalPath), false); assert.equal(f.values.get('personalDiaries/' + vaultId).legacyMigrated, true);
  const transferred = await server.issueDiaryTransfer(request(opened.token), student);
  const claimed = await server.claimDiaryTransfer(second, {token: transferred.token, pin: '123456'});
  assert.equal(f.vault(second.uid), vaultId); assert.equal(f.vault(student.uid), null);
  f.files.delete(`student-spaces/${student.classId}/${student.studentId}/photo-a.webp`);
  const asset = await server.readDiaryAsset(request(claimed.token), second, 'photo', 'photo-a'); assert.deepEqual(asset.bytes, pixels);
  assert.equal((await server.listDiaryPages(request(claimed.token), second, '', '')).pages.length, 1);
  assert(claimed.body.owned.includes('sticker-flower'));
  await rejects(server.listDiaryPages(request(opened.token), student, '', ''), 'DIARY_LOCKED');
  await rejects(server.claimDiaryTransfer(student, {token: transferred.token, pin: '123456'}), 'DIARY_TRANSFER_INVALID');
});

test('failed legacy asset migration preserves source and encrypted page for retry', async () => {
  const f = fixture(), originalPath = `classes/${student.classId}/students/${student.studentId}/diaryPages/legacy-a`;
  f.values.set(originalPath, {...page(), layers: [{id: 'photo-layer', kind: 'photo', itemId: '', assetId: 'missing-photo', x: 30, y: 50, size: 30, rotation: 0, flip: false}], updatedAt: '2026-10-26T00:00:00.000Z'});
  await assert.rejects(server.setupDiary(student, {pin: '123456'}));
  const vaultId = f.vault(student.uid); assert.equal(f.values.get('personalDiaries/' + vaultId).legacyMigrated, false);
  assert(f.values.has(originalPath), 'Original pages stay present until every attachment copy succeeds');
  assert(f.values.has(`personalDiaries/${vaultId}/entries/legacy-a`));
  f.values.set(`classes/${student.classId}/students/${student.studentId}/spacePhotos/missing-photo`, {status: 'ready'});
  f.files.set(`student-spaces/${student.classId}/${student.studentId}/missing-photo.webp`, Buffer.from('restored pixels'));
  const opened = await server.unlockDiary(student, {pin: '123456'}); assert(opened.token);
  assert.equal((await server.listDiaryPages(request(opened.token), student, '', '')).pages.length, 1);
});

test('month pagination is complete and an arbitrary image reference is rejected', async () => {
  fixture(); const opened = await server.setupDiary(student, {pin: '123456'}), req = request(opened.token);
  for (let i = 0; i < 45; i++) await server.saveDiaryPage(req, student, 'page-' + String(i).padStart(3, '0'), page());
  const first = await server.listDiaryPages(req, student, '2026-10', '');
  const next = await server.listDiaryPages(req, student, '2026-10', first.cursor);
  assert.equal(first.pages.length, 40); assert.equal(next.pages.length, 5); assert.equal(next.cursor, '');
  assert.equal(new Set([...first.pages, ...next.pages].map(p => p.id)).size, 45);
  assert.equal((await server.listDiaryPages(req, student, '2026-11', '')).pages.length, 0);
  await rejects(server.saveDiaryPage(req, student, 'injected', {...page(), layers: [{id: 'a', kind: 'photo', itemId: '', assetId: 'other-student-photo', x: 30, y: 40, size: 30, rotation: 0, flip: false}]}), 'DIARY_ASSET_FORBIDDEN');
});

test('API rejects CSRF, marks private responses no-store and binds secure HttpOnly cookie to login', async () => {
  fixture();
  const params = {params: Promise.resolve({segments: ['setup']})};
  const make = origin => new Request('https://school.example/api/secret-diary/setup', {method: 'POST', headers: {'Content-Type': 'application/json', ...(origin ? {Origin: origin} : {}), Cookie: '__session=login-one'}, body: JSON.stringify({pin: '123456'})});
  assert.equal((await route.POST(make('https://evil.example'), params)).status, 403);
  assert.equal((await route.POST(make(null), params)).status, 403);
  const response = await route.POST(make('https://school.example'), params);
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private,no-store');
  assert.deepEqual(response.cookieOptions, {httpOnly: true, secure: true, sameSite: 'strict', path: '/api', maxAge: 1200});
  const token = response.headers.get('Set-Cookie').split('=')[1];
  const firstLogin = new Request('https://school.example/api/secret-diary/pages', {headers: {Cookie: '__session=login-one; diary_unlock=' + token}});
  const secondLogin = new Request('https://school.example/api/secret-diary/pages', {headers: {Cookie: '__session=login-two; diary_unlock=' + token}});
  assert.equal((await server.diaryStatus(firstLogin, student)).unlocked, true);
  assert.equal((await server.diaryStatus(secondLogin, student)).unlocked, false);
  globalThis.__diaryFixture.actor = teacher;
  const denied = await route.GET(firstLogin, {params: Promise.resolve({segments: ['pages']})});
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('Cache-Control'), 'private,no-store');
});

test('explicit share is immutable, version checked and readable only by the chosen teacher', async () => {
  const f = fixture(), opened = await server.setupDiary(student, {pin: '123456'}), req = request(opened.token);
  const saved = await server.saveDiaryPage(req, student, 'page-a', page('공개하기로 한 이야기'));
  await rejects(server.shareDiaryPage(req, student, 'page-a', {version: 0}), 'VERSION_CONFLICT');
  const shared = await server.shareDiaryPage(req, student, 'page-a', {version: saved.page.version});
  assert.deepEqual(await server.shareDiaryPage(req, student, 'page-a', {version: saved.page.version}), shared, 'The same saved version does not create duplicate copies');
  assert(!JSON.stringify(f.values.get('diaryShares/' + shared.shareId)).includes('PRIVATE'));
  await rejects(server.readReceivedDiaryShare(admin, shared.shareId), 'DIARY_SHARE_UNAVAILABLE');
  await rejects(server.readReceivedDiaryShare({...teacher, uid: 'another-teacher'}, shared.shareId), 'DIARY_SHARE_UNAVAILABLE');
  await rejects(server.readReceivedDiaryShare(student, shared.shareId), 'DIARY_RECIPIENT_ONLY');
  assert.equal((await server.listReceivedDiaryShares(admin)).shares.length, 0);
  assert.equal((await server.listReceivedDiaryShares(teacher)).shares.length, 1);
  await server.saveDiaryPage(req, student, 'page-a', {...saved.page, title: '새로 적은 비공개 이야기'});
  assert.equal((await server.readReceivedDiaryShare(teacher, shared.shareId)).page.title, '공개하기로 한 이야기');
  assert.equal((await server.listDiaryShares(req, student)).shares.length, 1);
  await server.revokeDiaryShare(req, student, shared.shareId);
  await rejects(server.readReceivedDiaryShare(teacher, shared.shareId), 'DIARY_SHARE_UNAVAILABLE');
  assert.equal((await server.listReceivedDiaryShares(teacher)).shares.length, 0);
});

test('shared image route checks snapshot membership and revocation, never arbitrary vault assets', async () => {
  const f = fixture();
  const original = {...page(), layers: [{id: 'photo-layer', kind: 'photo', itemId: '', assetId: 'photo-a', x: 30, y: 50, size: 30, rotation: 0, flip: false}]};
  f.values.set(`classes/${student.classId}/students/${student.studentId}/diaryPages/legacy-a`, {...original, updatedAt: '2026-10-26T00:00:00.000Z'});
  f.values.set(`classes/${student.classId}/students/${student.studentId}/spacePhotos/photo-a`, {status: 'ready'});
  const pixels = Buffer.from('shared pixels'); f.files.set(`student-spaces/${student.classId}/${student.studentId}/photo-a.webp`, pixels);
  const opened = await server.setupDiary(student, {pin: '123456'}), req = request(opened.token);
  const shared = await server.shareDiaryPage(req, student, 'legacy-a', {version: 0});
  assert.deepEqual((await server.readReceivedDiaryAsset(teacher, shared.shareId, 'photo', 'photo-a')).bytes, pixels);
  await rejects(server.readReceivedDiaryAsset(teacher, shared.shareId, 'photo', 'not-in-snapshot'), 'DIARY_SHARE_ASSET_FORBIDDEN');
  await rejects(server.readReceivedDiaryAsset(admin, shared.shareId, 'photo', 'photo-a'), 'DIARY_SHARE_UNAVAILABLE');
  await server.revokeDiaryShare(req, student, shared.shareId);
  await rejects(server.readReceivedDiaryAsset(teacher, shared.shareId, 'photo', 'photo-a'), 'DIARY_SHARE_UNAVAILABLE');
});

test('vault quotas are transactional, count replacements once and release revoked copies', async () => {
  const f = fixture(), opened = await server.setupDiary(student, {pin: '123456'}), req = request(opened.token), vaultPath = 'personalDiaries/' + f.vault(student.uid);
  const saved = await server.saveDiaryPage(req, student, 'page-a', page());
  const originalBytes = f.values.get(vaultPath).usedBytes;
  assert(originalBytes > 0); assert.equal(f.values.get(vaultPath).entryCount, 1);
  f.values.get(vaultPath).entryCount = server.DIARY_VAULT_MAX_PAGES;
  await rejects(server.saveDiaryPage(req, student, 'page-overflow', page()), 'DIARY_CAPACITY');
  assert(!f.values.has(vaultPath + '/entries/page-overflow'));
  f.values.get(vaultPath).entryCount = 1; f.values.get(vaultPath).usedBytes = server.DIARY_VAULT_MAX_BYTES;
  await rejects(server.saveDiaryPage(req, student, 'page-overflow', page()), 'DIARY_CAPACITY');
  const updated = await server.saveDiaryPage(req, student, 'page-a', {...saved.page});
  assert.equal(f.values.get(vaultPath).entryCount, 1); assert.equal(f.values.get(vaultPath).usedBytes, server.DIARY_VAULT_MAX_BYTES);
  f.values.get(vaultPath).usedBytes = originalBytes; f.values.get(vaultPath).shareCount = server.DIARY_VAULT_MAX_SHARES;
  await rejects(server.shareDiaryPage(req, student, 'page-a', {version: updated.page.version}), 'DIARY_SHARE_CAPACITY');
  f.values.get(vaultPath).shareCount = 0;
  const shared = await server.shareDiaryPage(req, student, 'page-a', {version: updated.page.version});
  assert(f.values.get(vaultPath).usedBytes > originalBytes); assert.equal(f.values.get(vaultPath).shareCount, 1);
  await server.revokeDiaryShare(req, student, shared.shareId); await server.revokeDiaryShare(req, student, shared.shareId);
  assert.equal(f.values.get(vaultPath).usedBytes, originalBytes); assert.equal(f.values.get(vaultPath).shareCount, 0);
  await server.deleteDiaryPage(req, student, 'page-a', updated.page.version);
  assert.equal(f.values.get(vaultPath).entryCount, 0); assert.equal(f.values.get(vaultPath).usedBytes, 0);
});
