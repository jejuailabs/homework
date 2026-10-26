import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import test from 'node:test';

function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports: {}};
  new Function('require', 'module', 'exports', code)(name => imports[name] ?? {}, module, module.exports);
  return module.exports;
}
const types = load('./types.ts');
const submission = load('../../lib/assignment-submission.ts');
const policy = load('../../lib/server/policy.ts', {'../assignment-submission': submission});
const guestPolicy = load('../warm-guestbook/policy.ts', {'../artwork-extensions/types': types});
const options = types.moduleOptions({voice: {enabled: true}, guestbook: {enabled: true, visitorComments: true, visitorStickers: true}});
const scope = {ownerUid: 'teacher-a', classId: 'class-a'};

function fixture(initial = {}) {
  const docs = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)]));
  const reads = [], writes = [], failing = new Set();
  let actor = {uid: scope.ownerUid, role: 'teacher'};
  const snapshot = path => ({id: path.split('/').at(-1), ref: ref(path), exists: docs.has(path), data: () => docs.has(path) ? structuredClone(docs.get(path)) : undefined});
  const ref = path => ({path, id: path.split('/').at(-1), get: async () => {if (failing.has(path)) throw Error('READ_FAILED'); return snapshot(path);}, collection: name => query(path + '/' + name)});
  function query(path, filters = [], fields = null, limit = Infinity) {
    return {
      doc: id => ref(path + '/' + id),
      where: (field, op, value) => {assert.equal(op, '=='); return query(path, [...filters, [field, value]], fields, limit);},
      orderBy: () => query(path, filters, fields, limit),
      select: (...selected) => query(path, filters, selected, limit),
      limit: amount => query(path, filters, fields, amount),
      get: async () => {
        reads.push(path);
        if (failing.has(path)) throw Error('READ_FAILED');
        const rows = [...docs.keys()].filter(key => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/')).map(snapshot)
          .filter(doc => filters.every(([field, value]) => doc.data()[field] === value)).slice(0, limit)
          .map(doc => fields ? {...doc, data: () => Object.fromEntries(Object.entries(docs.get(doc.ref.path)).filter(([key]) => fields.includes(key)))} : doc);
        return {docs: rows, size: rows.length};
      },
    };
  }
  const store = {doc: ref, collection: query, runTransaction: async work => {
    const staged = [];
    const result = await work({
      get: async record => snapshot(record.path),
      set: (record, value, config) => staged.push({path: record.path, value, merge: !!config?.merge}),
      delete: record => staged.push({path: record.path, remove: true}),
    });
    staged.forEach(change => {writes.push(change); if (change.remove) docs.delete(change.path); else docs.set(change.path, {...(change.merge ? docs.get(change.path) : {}), ...change.value});});
    return result;
  }};
  const imports = {'@/lib/server/admin': {db: () => store}, '@/lib/server/policy': policy, '@/lib/server/exhibition-policy': {EXHIBITION_ARTWORK_LIMIT: 300}};
  const review = load('./review-server.ts', imports);
  const guest = load('../warm-guestbook/server.ts', {...imports, './policy': guestPolicy, '../artwork-extensions/server-utils': {consumeModuleRate: async () => {}, moduleJson: request => request.json()}});
  const route = load('../../app/api/artwork-module-review/[container]/route.ts', {
    ...imports, 'next/server': {NextResponse: {json: Response.json.bind(Response)}},
    '@/modules/artwork-extensions/exhibition-adapter': {effectiveOptions: types.moduleOptions},
    '@/modules/artwork-extensions/review-server': review,
    '@/lib/server/auth': {requireTeacher: async () => {if (!actor) throw new policy.ApiError(401, '로그인이 필요해요.'); if (actor.role === 'student') throw new policy.ApiError(403, '선생님만 이용할 수 있어요.'); return actor;}},
  });
  return {docs, reads, writes, failing, guest, review, route, actor: next => {actor = next;}};
}
const room = () => ({'exhibitions/room-a': {...scope, artworkModules: options, commentsEnabled: true}, 'exhibitions/room-a/artworks/art-a': {title: '현재 작품 제목', commentCount: 0}});
const target = (role = 'student', extra = {}) => ({key: 'target-a', ownerUid: scope.ownerUid, classId: scope.classId, containerKey: 'exhibition:room-a', targetId: 'art-a', title: '현재 작품 제목', options,
  actor: {key: role + '-actor', name: role, role}, manage: role === 'teacher', contribute: true, publicView: role === 'visitor', assertFresh: async () => {}, ...extra});
const request = (method = 'GET', body, search = '') => new Request('https://example.com/guestbook' + search, {method, ...(body ? {body: JSON.stringify(body)} : {})});
const routeGet = f => f.route.GET(new Request('https://example.com/api/artwork-module-review/room-a'), {params: Promise.resolve({container: 'room-a'})});

test('guestbook comments remain private until approval, then can be hidden without stale overwrites', async () => {
  const f = fixture(room()), student = target(), teacher = target('teacher'), visitor = target('visitor');
  const submitted = await f.guest.guestbook(request('POST', {type: 'comment', text: '색이 참 아름다워요!'}), student, []);
  assert.equal(submitted.status, 'pending');
  assert.equal(f.docs.get('moduleGuestbooks/target-a').pendingCount, 1);
  await f.guest.guestbook(request('POST', {type: 'comment', text: '색이 참 아름다워요!'}), student, []);
  assert.equal(f.docs.get('moduleGuestbooks/target-a').pendingCount, 1, 'network retry does not double the queue');
  assert.deepEqual((await f.guest.guestbook(request(), visitor, [])).entries, []);
  assert.equal((await f.guest.guestbook(request(), student, [])).mine[0].status, 'pending');
  const queue = await f.guest.guestbook(request('GET', undefined, '?queue=1'), teacher, []), version = queue.entries[0].version;
  assert.equal(queue.entries.length, 1);
  assert.equal((await (await routeGet(f)).json()).entries[0].pending, 1);
  await f.guest.guestbook(request('PATCH', {status: 'approved', version}), teacher, ['student-actor_comment']);
  assert.equal((await f.guest.guestbook(request(), visitor, [])).entries[0].text, '색이 참 아름다워요!');
  assert.equal(f.docs.get('moduleGuestbooks/target-a').pendingCount, 0);
  await assert.rejects(f.guest.guestbook(request('PATCH', {status: 'hidden', version}), teacher, ['student-actor_comment']), error => error.status === 409);
  assert.equal((await f.guest.guestbook(request(), visitor, [])).entries.length, 1);
  const approved = f.docs.get('moduleGuestbooks/target-a/entries/student-actor_comment');
  await f.guest.guestbook(request('PATCH', {status: 'hidden', version: approved.version}), teacher, ['student-actor_comment']);
  assert.deepEqual((await f.guest.guestbook(request(), visitor, [])).entries, []);
  assert.deepEqual((await (await routeGet(f)).json()).entries, []);
});

test('students cannot see another pending comment or approve it, and revoked teacher access prevents changes', async () => {
  const f = fixture(room()), visitor = target('visitor'), teacher = target('teacher');
  await f.guest.guestbook(request('POST', {type: 'comment', text: '정성이 느껴져요', authorName: '관람객'}), visitor, []);
  assert.deepEqual((await f.guest.guestbook(request('GET', undefined, '?queue=1'), target(), [])).entries, []);
  const entry = f.docs.get('moduleGuestbooks/target-a/entries/visitor-actor_comment');
  await assert.rejects(f.guest.guestbook(request('PATCH', {status: 'approved', version: entry.version}), target(), ['visitor-actor_comment']), error => error.status === 405);
  const writeCount = f.writes.length;
  await assert.rejects(f.guest.guestbook(request('PATCH', {status: 'approved', version: entry.version}), {...teacher, assertFresh: async () => {throw new policy.ApiError(403, '권한이 변경됐어요.');}}, ['visitor-actor_comment']), error => error.status === 403);
  assert.equal(f.writes.length, writeCount);
});

test('fixed praise stickers are public immediately and do not create a moderation queue', async () => {
  const f = fixture(room());
  await f.guest.guestbook(request('POST', {type: 'sticker', sticker: 'colors'}), target(), []);
  assert.equal((await f.guest.guestbook(request(), target('visitor'), [])).entries[0].status, 'approved');
  assert.equal(f.docs.get('moduleGuestbooks/target-a').pendingCount, 0);
  assert.deepEqual((await (await routeGet(f)).json()).entries, []);
});

test('review combines legacy, guestbook and voice pending records with the live artwork title', async () => {
  const seed = room(); seed['exhibitions/room-a/artworks/art-a'].commentCount = 3;
  seed['exhibitions/room-a/artworks/art-a/comments/old'] = {status: 'pending'};
  seed['exhibitions/room-a/artworks/art-a/comments/shown'] = {status: 'approved'};
  seed['exhibitions/room-a/artworks/art-a/comments/hidden'] = {status: 'hidden'};
  seed['moduleGuestbooks/target-a'] = {...scope, containerKey: 'exhibition:room-a', targetId: 'art-a', title: '이전 제목', pendingCount: 2};
  seed['moduleVoices/target-a'] = {...scope, containerKey: 'exhibition:room-a', targetId: 'art-a', title: '이전 제목', draftId: 'draft'};
  const f = fixture(seed), response = await routeGet(f), entries = (await response.json()).entries;
  assert.equal(response.status, 200);
  assert.deepEqual(Object.fromEntries(entries.map(entry => [entry.kind, entry.pending])), {guestbook: 2, 'legacy-comment': 1, voice: 1});
  assert.ok(entries.every(entry => entry.title === '현재 작품 제목' && entry.targetId === 'art-a'));
});

test('legacy pending is reviewable with participation disabled and old missing counts; zero counts skip reads', async () => {
  const seed = room(); seed['exhibitions/room-a'].artworkModules = {}; seed['exhibitions/room-a'].commentsEnabled = false;
  delete seed['exhibitions/room-a/artworks/art-a'].commentCount;
  seed['exhibitions/room-a/artworks/art-a/comments/old'] = {status: 'pending'};
  seed['exhibitions/room-a/artworks/empty'] = {title: '댓글 없는 작품', commentCount: 0};
  const f = fixture(seed), entries = (await (await routeGet(f)).json()).entries;
  assert.deepEqual(entries, [{kind: 'legacy-comment', targetId: 'art-a', title: '현재 작품 제목', pending: 1}]);
  assert.ok(!f.reads.includes('exhibitions/room-a/artworks/empty/comments'));
  assert.ok(!f.reads.includes('moduleGuestbooks'));
});

test('orphan module records cannot crowd out live tasks or cross a gallery ownership boundary', async () => {
  const seed = room();
  for (let index = 0; index < 305; index++) seed[`moduleGuestbooks/orphan-${index}`] = {...scope, containerKey: 'exhibition:room-a', targetId: `removed-${index}`, pendingCount: 1};
  seed['moduleGuestbooks/wrong-owner'] = {...scope, ownerUid: 'someone-else', containerKey: 'exhibition:room-a', targetId: 'art-a', pendingCount: 2};
  seed['moduleGuestbooks/wrong-class'] = {...scope, classId: 'class-b', containerKey: 'exhibition:room-a', targetId: 'art-a', pendingCount: 3};
  seed['moduleGuestbooks/valid'] = {...scope, containerKey: 'exhibition:room-a', targetId: 'art-a', pendingCount: 4};
  const entries = (await (await routeGet(fixture(seed))).json()).entries;
  assert.deepEqual(entries, [{kind: 'guestbook', targetId: 'art-a', title: '현재 작품 제목', pending: 4}]);
});

test('review route denies anonymous, student and other teachers and never reports query errors as an empty queue', async () => {
  const f = fixture(room());
  f.actor(null); assert.equal((await routeGet(f)).status, 401);
  f.actor({uid: 'student', role: 'student'}); assert.equal((await routeGet(f)).status, 403);
  f.actor({uid: 'other-teacher', role: 'teacher'}); assert.equal((await routeGet(f)).status, 404);
  f.actor({uid: scope.ownerUid, role: 'teacher'}); f.failing.add('moduleGuestbooks');
  const failed = await routeGet(f); assert.equal(failed.status, 500);
  const body = await failed.json(); assert.ok(body.error); assert.ok(!Object.hasOwn(body, 'entries'));
});
