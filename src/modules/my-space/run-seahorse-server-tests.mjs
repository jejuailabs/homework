// Real purchase/save/bootstrap functions with an atomic, in-memory Firestore adapter.
// This suite never initializes Firebase credentials or contacts a cloud service.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../../../', import.meta.url));
const modules = new Map(); let data, queue;
const reference = p => ({path: p, collection: name => ({doc: id => reference(p + '/' + name + '/' + id)}), async get() {return snapshot(p);}});
const snapshot = p => ({exists: data.has(p), data: () => structuredClone(data.get(p)), ref: reference(p), id: p.split('/').at(-1)});
const db = {
  doc: reference,
  runTransaction(fn) {
    const run = queue.then(async () => {
      const pending = [];
      const result = await fn({get: async ref => snapshot(ref.path), create: (ref, value) => pending.push(['create', ref.path, value]), update: (ref, value) => pending.push(['update', ref.path, value]), set: (ref, value) => pending.push(['set', ref.path, value])});
      for (const [kind, p, value] of pending) {
        if (kind === 'create') assert(!data.has(p), 'duplicate creation');
        if (kind === 'update') assert(data.has(p), 'missing update target');
        data.set(p, structuredClone(kind === 'update' ? {...data.get(p), ...value} : value));
      }
      return result;
    });
    queue = run.catch(() => {}); return run;
  },
};
function load(filename) {
  const file = path.resolve(root, filename);
  if (modules.has(file)) return modules.get(file).exports;
  const module = {exports: {}}; modules.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'server-only' || id === '@/lib/server/auth') return {};
    if (id === '@/lib/server/admin') return {db: () => db, bucket: () => {throw new Error('Storage is outside this test');}};
    if (id === 'firebase-admin/firestore') return {FieldPath: {documentId: () => '__name__'}};
    if (id.startsWith('@/')) return load('src/' + id.slice(2) + '.ts');
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
    return require(id);
  }, module, module.exports);
  return module.exports;
}
const server = load('src/modules/my-space/server.ts');
const {defaultRoom, starterSpaceIds} = load('src/modules/my-space/catalog.ts');
const {seahorsePets} = load('src/modules/my-space/seahorse.ts');
const points = load('src/lib/server/points-policy.ts');
const studentPath = 'classes/demo/students/pupil', roomPath = studentPath + '/mySpace/room';
const ctx = {classId: 'demo', studentId: 'pupil', uid: 'learner', authVersion: 0};
function fixture() {
  queue = Promise.resolve(); data = new Map([
    [studentPath, {name: '샘플', authUid: ctx.uid, points: 500, pointsEarnedTotal: 500, spaceOwned: [], wardrobeOwned: []}],
    ['classes/demo', {pointSettings: {enabled: true, label: '보말', rules: {homework: 10}}}],
    ['users/learner', {role: 'student', classId: 'demo', studentId: 'pupil', authVersion: 0}],
  ]);
}
const buy = (itemId, requestId) => server.buy(ctx, {itemId, requestId});
test('concurrent adoption and shared outfit purchase charge once and persist ownership', async () => {
  fixture();
  await Promise.all(Array.from({length: 6}, (_, i) => buy(seahorsePets[0].id, 'adopt-' + i)));
  await buy(seahorsePets[1].id, 'adopt-purple');
  await Promise.all(Array.from({length: 6}, (_, i) => buy('seahorse-set-scholar', 'clothes-' + i)));
  assert.equal(data.get(studentPath).points, 500 - 60 - 60 - 50);
  const before = data.get(studentPath).points;
  await buy('seahorse-set-scholar', 'clothes-owned');
  assert.equal(data.get(studentPath).points, before);
  assert(data.get(studentPath).spaceOwned.includes(seahorsePets[0].id));
  assert.equal([...data.keys()].filter(key => key.includes('/pointLedger/')).length, 3);
});
test('save, bootstrap, switch to the other seahorse and reload preserve a complete set and normalized pose', async () => {
  fixture(); for (const pet of seahorsePets) await buy(pet.id, 'adopt-' + pet.id);
  await buy('seahorse-set-dreamy', 'buy-pajamas');
  let result = await server.saveRoom(ctx, {...defaultRoom(), pet: seahorsePets[0].id, pose: 'raised', outfit: {body: 'seahorse-set-dreamy'}, nicknames: {[seahorsePets[0].id]: '반짝이'}});
  assert.equal(result.room.version, 1);
  let boot = await server.bootstrap(ctx);assert.equal(boot.room.pose, 'rest');assert.equal(boot.room.nicknames[seahorsePets[0].id], '반짝이');
  const balance = boot.profile.points;
  result = await server.saveRoom(ctx, {...boot.room, pet: seahorsePets[1].id});
  boot = await server.bootstrap(ctx);
  assert.equal(boot.room.version, 2);assert.equal(boot.room.pet, seahorsePets[1].id);
  assert.equal(boot.room.outfit.body, 'seahorse-set-dreamy');assert.equal(boot.profile.points, balance);
  await assert.rejects(server.saveRoom(ctx, {...boot.room, version: 0}), e => e.code === 'VERSION_CONFLICT');
  assert.equal(data.get(roomPath).version, 2);
});
test('unowned friends, unowned outfits and cross-family clothing cannot be saved', async () => {
  fixture(); await buy(seahorsePets[0].id, 'adopt-yellow');
  await assert.rejects(server.saveRoom(ctx, {...defaultRoom(), pet: seahorsePets[1].id}));
  await assert.rejects(server.saveRoom(ctx, {...defaultRoom(), pet: seahorsePets[0].id, outfit: {body: 'seahorse-set-winter'}}));
  await buy('body-knit', 'classic-knit');
  await server.saveRoom(ctx, {...defaultRoom(), pet: seahorsePets[0].id});
  await assert.rejects(server.saveRoom(ctx, {...data.get(roomPath), outfit: {body: 'body-knit'}}));
});
test('retired detached accessories cannot be bought or equipped, and ownership stays readable', () => {
  fixture();
  assert.throws(() => points.pointPurchaseDecision(100, [], 'seahorse-face-glasses'), e => e.code === 'ITEM_RETIRED');
  const oldOwned = ['seahorse-face-glasses'];
  assert(points.wardrobeOwnership(oldOwned).includes(oldOwned[0]));
  assert.equal(points.pointPurchaseDecision(65, oldOwned, oldOwned[0]).balance, 65);
  for (const pet of seahorsePets) assert.throws(() => points.equipWardrobe({}, oldOwned, 'face', oldOwned[0], pet.id));
  assert.deepEqual(points.equipWardrobe({face: oldOwned[0]}, oldOwned, 'face', null, seahorsePets[0].id), {});
});
test('old purchases unlock matching complete sets without another charge and survive reload', async () => {
  fixture();
  const pupil = data.get(studentPath);
  pupil.spaceOwned = [seahorsePets[0].id, seahorsePets[1].id, 'seahorse-body-pajamas'];
  pupil.wardrobeOwned = ['seahorse-face-glasses', 'seahorse-head-beanie'];
  pupil.wardrobeOutfit = {face: 'seahorse-face-glasses'};
  data.set(roomPath, {...defaultRoom(), pet: seahorsePets[0].id, outfit: {body: 'seahorse-body-pajamas'}, pose: 'raised'});
  let boot = await server.bootstrap(ctx);
  for (const id of ['dreamy', 'scholar', 'winter']) assert(boot.owned.includes('seahorse-set-'+id));
  assert.equal(boot.room.outfit.body, 'seahorse-set-dreamy');
  assert.equal(boot.room.pose, 'rest');
  await buy('seahorse-set-scholar', 'legacy-unlock');
  assert.equal(data.get(studentPath).points, 500);
  await assert.rejects(buy('seahorse-body-knit', 'retired-clothes'));
  data.get(roomPath).outfit = {};
  boot = await server.bootstrap(ctx);
  assert.equal(boot.room.outfit.body, 'seahorse-set-scholar');
  await server.saveRoom(ctx, {...boot.room, outfit: {body: 'seahorse-set-winter'}});
  boot = await server.bootstrap(ctx); assert.equal(boot.room.outfit.body, 'seahorse-set-winter');
  await server.saveRoom(ctx, {...boot.room, outfit: {}});
  boot = await server.bootstrap(ctx); assert.deepEqual(boot.room.outfit, {});
  assert(data.get(studentPath).wardrobeOwned.includes('seahorse-face-glasses'));
  assert.equal(boot.profile.points, 500);
});
test('switching owned sets and returning to basic never charges more points', async () => {
  fixture(); await buy(seahorsePets[0].id, 'pet');
  for(const set of ['scholar', 'dreamy']) await buy('seahorse-set-'+set, 'buy-'+set);
  let boot = await server.bootstrap(ctx); const balance = boot.profile.points;
  for(const id of ['seahorse-set-scholar', 'seahorse-set-dreamy', null, 'seahorse-set-scholar']) {
    await server.saveRoom(ctx, {...boot.room, pet: seahorsePets[0].id, outfit: id ? {body: id} : {}});
    boot = await server.bootstrap(ctx);assert.equal(boot.room.outfit.body, id || undefined);assert.equal(boot.profile.points, balance);
  }
});
test('teacher disabling decoration blocks adoption and room changes', async () => {
  fixture(); data.set('classes/demo', {pointSettings: {enabled: false}});
  await assert.rejects(buy(seahorsePets[0].id, 'disabled-adoption'));
  await assert.rejects(server.saveRoom(ctx, defaultRoom()));
  assert.equal(data.get(studentPath).points, 500);
});
