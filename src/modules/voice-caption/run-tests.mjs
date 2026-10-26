import fs from 'node:fs';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as nodeCrypto from 'node:crypto';

// Execute the real handler and permission adapter with no network or credentials.
function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  const module = {exports: {}};
  new Function('require', 'module', 'exports', compiled)(name => imports[name] ?? {}, module, module.exports);
  return module.exports;
}
const policy = load('../../lib/server/policy.ts', {'../assignment-submission': load('../../lib/assignment-submission.ts')});
const exhibitionPolicy = load('../../lib/server/exhibition-policy.ts', {'./policy': policy});
const options = load('../artwork-extensions/types.ts');
const wav = load('./wav.ts');
const audio = wav.pcmWav(new Float32Array(wav.VOICE_RATE * 3));
const teacher = {uid: 'teacher1', role: 'teacher', displayName: '선생님'};
const student = {uid: 'uid-student1', role: 'student', classId: 'class1', studentId: 'student1'};
const other = {uid: 'uid-student2', role: 'student', classId: 'class1', studentId: 'student2'};
const share = 's'.repeat(43);
const roomPath = 'exhibitions/room1';
const artPath = roomPath + '/artworks/art1';
const hash = value => nodeCrypto.createHash('sha256').update(value).digest('hex');
const rootPath = 'moduleVoices/' + hash('exhibition:room1:art1');
const recordingPath = id => rootPath + '/recordings/' + id;

async function environment(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { return await fn(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
const offline = fn => environment({VOICE_AI_TRANSCRIPTION_ENABLED: undefined, OPENAI_API_KEY: undefined, CREATIVE_VISITOR_SECRET: 'local-voice-test-secret', ARTWORK_MODULES_DISABLED: undefined}, fn);

function fixture() {
  const data = new Map(Object.entries({
    [roomPath]: {ownerUid: teacher.uid, classId: 'class1', status: 'open', allowStudentUploads: false, publicSharingEnabled: true, artworkModules: {voice: {enabled: true, publicAudio: true}}},
    [artPath]: {title: '나의 작품', studentId: 'student1', status: 'approved'},
    'users/teacher1': {disabled: false},
    'classes/class1/students/student1': {name: '하늘', authUid: student.uid, disabled: false},
    'classes/class1/students/student2': {name: '바다', authUid: other.uid, disabled: false},
    ['exhibitionShareLinks/' + hash(share)]: {exhibitionId: 'room1'},
  }));
  const stats = {writes: 0, uploads: 0, downloads: 0, ai: 0};
  const files = new Map();
  let actor = teacher;
  const snapshot = path => ({id: path.split('/').at(-1), ref: ref(path), exists: data.has(path), data: () => structuredClone(data.get(path))});
  const ref = path => ({path, id: path.split('/').at(-1), get: async () => snapshot(path), collection: name => ({doc: id => ref(path + '/' + name + '/' + id)})});
  const FieldValue = {arrayUnion: (...values) => ({operation: 'union', values}), arrayRemove: (...values) => ({operation: 'remove', values})};
  const db = {doc: ref, runTransaction: async fn => {
    const pending = [];
    const result = await fn({
      get: async item => snapshot(item.path),
      set: (item, value, config) => pending.push({path: item.path, value, merge: config?.merge}),
      update: (item, value) => {assert.ok(data.has(item.path)); pending.push({path: item.path, value, merge: true});},
    });
    for (const item of pending) {
      const old = data.get(item.path) ?? {}, next = item.merge ? {...old} : {};
      for (const [key, value] of Object.entries(item.value)) {
        if (value?.operation === 'union') next[key] = [...new Set([...(old[key] ?? []), ...value.values])];
        else if (value?.operation === 'remove') next[key] = (old[key] ?? []).filter(item => !value.values.includes(item));
        else next[key] = structuredClone(value);
      }
      data.set(item.path, next); stats.writes++;
    }
    return result;
  }};
  const bucket = {file: path => ({
    save: async (bytes, config) => {
      if (files.has(path)) throw Object.assign(new Error('exists'), {code: 412});
      files.set(path, {bytes: Buffer.from(bytes), metadata: config.metadata}); stats.uploads++;
    },
    getMetadata: async () => [files.get(path)?.metadata],
    download: async () => {stats.downloads++; assert.ok(files.has(path)); return [files.get(path).bytes];},
    delete: async () => {files.delete(path);},
  })};
  const utils = load('../artwork-extensions/server-utils.ts', {'node:crypto': nodeCrypto, 'firebase-admin/firestore': {Timestamp: {fromMillis: milliseconds => ({milliseconds})}}, '@/lib/server/admin': {db: () => db}, '@/lib/server/policy': policy});
  const adapter = load('../artwork-extensions/exhibition-adapter.ts', {
    'node:crypto': nodeCrypto,
    'node:fs/promises': {readFile: () => {throw new Error('Tests must not read credentials');}},
    '@/lib/server/admin': {db: () => db}, '@/lib/server/auth': {getContext: async () => actor},
    '@/lib/server/policy': policy, '@/lib/server/exhibition-policy': exhibitionPolicy, './types': options, './server-utils': utils,
  });
  const server = load('./server.ts', {
    'firebase-admin/firestore': {FieldValue}, '@/lib/server/admin': {db: () => db, bucket: () => bucket}, '@/lib/server/policy': policy,
    '../artwork-extensions/server-utils': utils, './wav': wav,
    './provider': {transcribeVoice: async () => {stats.ai++; return '테스트 음성 캡션';}},
  });
  const request = (who, method, segments = [], body) => new Request('https://example.test/api/artwork-modules/exhibition/room1/art1/voice' + (segments.length ? '/' + segments.join('/') : '') + (who === null ? '?share=' + share : ''), {
    method, ...(body === undefined ? {} : {body: body instanceof Uint8Array ? body : JSON.stringify(body), headers: {'Content-Type': body instanceof Uint8Array ? 'audio/wav' : 'application/json'}}),
  });
  async function target(who, req = request(who, 'GET')) {actor = who; return (await adapter.exhibitionModuleTarget(req, 'room1', 'art1')).target;}
  async function invoke(who, method = 'GET', segments = [], body) {
    const req = request(who, method, segments, body);
    return server.voiceCaption(req, await target(who, req), segments);
  }
  async function upload(id = 'voice1', who = student) {return (await invoke(who, 'POST', [id], audio)).recording;}
  async function caption(id = 'voice1', who = student, text = '바다와 섬을 그렸어요.') {
    await invoke(who, 'PATCH', [id], {caption: text, version: data.get(recordingPath(id)).version});
  }
  async function approve(id = 'voice1') {await invoke(teacher, 'PATCH', [id], {status: 'approved', version: data.get(recordingPath(id)).version});}
  return {data, stats, invoke, target, request, server, upload, caption, approve};
}
const rejectsStatus = (promise, status, code) => assert.rejects(promise, error => error instanceof policy.ApiError && error.status === status && (!code || error.code === code));

test('voice: upload, manual caption, approval and playback work without an AI key', () => offline(async () => {
  const f = fixture();
  const saved = await f.upload();
  assert.equal(saved.uploadStatus, 'ready');
  assert.equal(saved.transcription, 'idle');
  assert.equal(saved.caption, '');
  assert.equal((await f.invoke(student)).viewer.record, true); // Image-upload switch does not disable narration.
  assert.equal((await f.invoke(teacher)).viewer.transcribe, false);
  await f.upload(); // Idempotent upload does not count storage twice.
  assert.equal(f.stats.uploads, 1);
  assert.deepEqual(f.data.get('moduleVoiceStorage/teacher1'), {usedBytes: audio.length, reservedBytes: 0});
  await f.caption();
  assert.equal((await f.invoke(teacher)).draft.caption, '바다와 섬을 그렸어요.');
  await f.approve();
  const listing = await f.invoke(other);
  assert.equal(listing.active.id, 'voice1'); assert.equal(listing.draft, null);
  const response = await f.invoke(other, 'GET', ['voice1', 'audio']);
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), audio);
  assert.equal(f.stats.ai, 0);
}));

test('voice: replacing a published narration keeps the earlier audio until teacher approval', () => offline(async () => {
  const f = fixture();
  await f.upload(); await f.caption(); await f.approve();
  await f.upload('voice2'); await f.caption('voice2', student, '새롭게 덧붙이는 작품 이야기예요.');
  assert.equal((await f.invoke(student)).draft.id, 'voice2');
  for (const who of [other, null]) {
    const listing = await f.invoke(who);
    assert.equal(listing.active.id, 'voice1'); assert.equal(listing.draft, null); assert.deepEqual(listing.history, []);
    await rejectsStatus(f.invoke(who, 'GET', ['voice2', 'audio']), 404);
  }
  await f.approve('voice2');
  assert.equal((await f.invoke(null)).active.id, 'voice2');
  assert.equal(f.data.get(recordingPath('voice1')).status, 'hidden');
  await rejectsStatus(f.invoke(other, 'GET', ['voice1', 'audio']), 404);
  assert.equal((await f.invoke(student)).history[0].id, 'voice1');
  assert.equal(f.stats.ai, 0);
}));

test('voice: a different student cannot upload, edit or listen to a draft, and a student cannot approve', () => offline(async () => {
  const f = fixture();
  await f.upload();
  assert.equal((await f.invoke(other)).viewer.record, false);
  assert.equal((await f.invoke(other)).draft, null);
  await rejectsStatus(f.upload('voice2', other), 403);
  await rejectsStatus(f.caption('voice1', other), 403);
  await rejectsStatus(f.invoke(other, 'GET', ['voice1', 'audio']), 404);
  await rejectsStatus(f.invoke(student, 'PATCH', ['voice1'], {status: 'approved', version: f.data.get(recordingPath('voice1')).version}), 403);
  assert.equal(f.data.get(recordingPath('voice1')).status, 'draft');
}));

test('voice: narration requires the actual student link and respects exhibition closure', () => offline(async () => {
  const f = fixture();
  f.data.set(artPath, {...f.data.get(artPath), status: 'pending'});
  await f.upload(); // Student may prepare narration while their photo awaits approval.
  f.data.set(artPath, {...f.data.get(artPath), status: 'approved', studentId: ''});
  assert.equal((await f.invoke(student)).viewer.record, false);
  await rejectsStatus(f.caption(), 403);
  f.data.set(artPath, {...f.data.get(artPath), studentId: 'student1'});
  f.data.set(roomPath, {...f.data.get(roomPath), status: 'closed'});
  assert.equal((await f.invoke(student)).viewer.record, false);
  await rejectsStatus(f.caption(), 403);
  assert.equal((await f.invoke(teacher)).viewer.record, true);
  await f.caption('voice1', teacher); await f.approve();
  assert.equal((await f.invoke(student)).active.id, 'voice1');
}));

test('voice: fresh permission checks reject a recording when the exhibition closes after loading', () => offline(async () => {
  const f = fixture(), stale = await f.target(student);
  f.data.set(roomPath, {...f.data.get(roomPath), status: 'closed'});
  await rejectsStatus(f.server.voiceCaption(f.request(student, 'POST', ['voice1'], audio), stale, ['voice1']), 403);
  assert.equal(f.stats.uploads, 0); assert.equal(f.data.has(recordingPath('voice1')), false);
}));

test('voice: public audio needs both share access and explicit public-audio permission', () => offline(async () => {
  const f = fixture();
  await f.upload(); await f.caption(); await f.approve();
  assert.equal((await f.invoke(null)).active.id, 'voice1');
  f.data.set(roomPath, {...f.data.get(roomPath), artworkModules: {voice: {enabled: true, publicAudio: false}}});
  await rejectsStatus(f.invoke(null), 404, 'MODULE_DISABLED');
  await rejectsStatus(f.invoke(null, 'GET', ['voice1', 'audio']), 404, 'MODULE_DISABLED');
  assert.equal((await f.invoke(other)).active.id, 'voice1');
  f.data.set(roomPath, {...f.data.get(roomPath), publicSharingEnabled: false});
  await rejectsStatus(f.invoke(null), 404);
  f.data.set(roomPath, {...f.data.get(roomPath), artworkModules: {voice: {enabled: false, publicAudio: false}}});
  await rejectsStatus(f.invoke(teacher), 404, 'MODULE_DISABLED');
}));

test('voice: disabled AI rejects before download, provider invocation or state mutation', () => offline(async () => {
  const f = fixture();
  await f.upload();
  const before = {...f.stats};
  for (const who of [teacher, student]) await rejectsStatus(f.invoke(who, 'POST', ['voice1', 'transcribe'], {}), 403, 'VOICE_AI_DISABLED');
  assert.deepEqual(f.stats, before);
  assert.equal(f.data.get(recordingPath('voice1')).transcription, 'idle');
  const provider = load('./provider.ts', {
    '@/lib/server/policy': policy,
    '@/lib/server/ai': {runMeteredAi: () => {throw new Error('AI metering must never start');}},
  });
  await rejectsStatus(provider.transcribeVoice('teacher1', 'test', audio), 403, 'VOICE_AI_DISABLED');
}));

test('voice: even an enabled AI capability is teacher-only and invoked only explicitly', () => offline(async () => {
  // Process-local flag only; provider remains a stub and no deployment environment is changed.
  await environment({VOICE_AI_TRANSCRIPTION_ENABLED: 'true'}, async () => {
    const f = fixture();
    await f.upload();
    assert.equal(f.stats.ai, 0); assert.equal(f.stats.downloads, 0);
    assert.equal((await f.invoke(student)).viewer.transcribe, false);
    assert.equal((await f.invoke(teacher)).viewer.transcribe, true);
    const before = {...f.stats};
    await rejectsStatus(f.invoke(student, 'POST', ['voice1', 'transcribe'], {}), 403, 'VOICE_AI_DISABLED');
    assert.deepEqual(f.stats, before);
    const result = await f.invoke(teacher, 'POST', ['voice1', 'transcribe'], {});
    assert.equal(result.caption, '테스트 음성 캡션'); assert.equal(f.stats.ai, 1);
    await f.invoke(teacher, 'POST', ['voice1', 'transcribe'], {});
    assert.equal(f.stats.ai, 1); // Repeated explicit request returns the completed caption.
    assert.equal(f.data.get(recordingPath('voice1')).status, 'draft');
  });
}));
