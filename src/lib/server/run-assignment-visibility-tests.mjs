import fs from 'node:fs';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';

function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  const module = {exports: {}};
  new Function('require', 'module', 'exports', compiled)(name => imports[name] ?? {}, module, module.exports);
  return module.exports;
}
const submission = load('../assignment-submission.ts');
const policy = load('./policy.ts', {'../assignment-submission': submission});
const visibility = load('./assignment-visibility-policy.ts', {'./policy': policy});
const teacher = {uid: 'teacher-1', role: 'teacher', email: null, displayName: null};
const student = {uid: 'student-1', role: 'student', classId: 'class-a', studentId: 'pupil-1'};

function fixture(initial) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)]));
  const writes = [], reads = [];
  let beforeTransaction = null;
  const snapshot = path => ({id: path.split('/').at(-1), ref: ref(path), exists: data.has(path), data: () => data.has(path) ? structuredClone(data.get(path)) : undefined});
  const ref = path => ({id: path.split('/').at(-1), path, get: async () => snapshot(path), collection: name => collection(`${path}/${name}`)});
  function collection(path, filters = [], fields = null) {
    return {
      doc: name => ref(`${path}/${name}`),
      where: (key, op, value) => {assert.equal(op, '=='); return collection(path, [...filters, [key, value]], fields);},
      select: (...names) => collection(path, filters, names),
      get: async () => {
        const docs = [...data.keys()].filter(key => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/')).map(snapshot).filter(doc => filters.every(([key, value]) => doc.data()[key] === value)).map(doc => fields ? {...doc, data: () => Object.fromEntries(Object.entries(data.get(doc.ref.path)).filter(([key]) => fields.includes(key)))} : doc);
        return {docs, size: docs.length};
      },
    };
  }
  const db = {
    doc: ref, collection,
    getAll: async (...refs) => {reads.push(refs.map(item => item.path)); return refs.map(item => snapshot(item.path));},
    runTransaction: async fn => {
      beforeTransaction?.(); beforeTransaction = null;
      const pending = [];
      const tx = {
        get: async item => snapshot(item.path),
        getAll: async (...items) => items.map(item => snapshot(item.path)),
        update: (item, patch) => pending.push({kind: 'update', path: item.path, patch}),
        set: (item, patch) => pending.push({kind: 'set', path: item.path, patch}),
        create: (item, patch) => pending.push({kind: 'create', path: item.path, patch}),
      };
      const result = await fn(tx);
      pending.forEach(write => {data.set(write.path, {...(write.kind === 'update' ? data.get(write.path) : {}), ...write.patch}); writes.push(write);});
      return result;
    },
  };
  const auth = {requireTeacher: async () => teacher, requireStudent: async () => student, getContext: async () => teacher, assertOrigin: () => {}};
  const imports = {'./admin': {db: () => db}, './auth': auth, './policy': policy, './assignment-visibility-policy': visibility};
  const archive = load('./assignment-visibility.ts', imports);
  const api = load('./api.ts', {
    ...imports, 'node:crypto': crypto, 'next/server': {NextResponse: {json: Response.json.bind(Response)}},
    'firebase-admin/firestore': {FieldValue: {increment: value => ({increment: value})}},
    '../assignment-submission': submission,
    './points-policy': {pointBalance: value => value ?? 0, pointSettings: () => ({}), wardrobeOutfit: () => ({})},
    '@/modules/my-space/profile': {companionProfile: () => null},
    './assignment-materials': {signedAssignmentMaterials: async value => {assert.notEqual(value?.[0]?.id, 'secret'); return value ?? [];}, bindAssignmentMaterials: async () => []},
    './video-submissions': {studentVideoJobs: async () => [], videoConfig: async () => null},
    './signed-urls': {stableReadUrl: async path => `signed:${path}`},
  });
  const homeworkUploads = load('./homework-uploads.ts', {...imports, 'node:crypto': crypto});
  const video = load('./video-submissions.ts', {
    ...imports, './admin': {db: () => db, bucket: () => ({file: () => ({getMetadata: async () => [{size: 1000, contentType: 'video/mp4', generation: '1'}]})})},
    'node:crypto': crypto, '../video-submission': {videoSelectionError: () => null},
  });
  const learningLinks = load('./learning-links.ts', {
    ...imports, 'node:crypto': crypto, 'next/server': {NextResponse: {json: Response.json.bind(Response)}},
    './participation-policy': {BOARD_POST_LIMIT: 500, changedReaction: () => ({})},
  });
  return {data, writes, reads, db, archive, api, homeworkUploads, video, learningLinks, before: callback => {beforeTransaction = callback;}};
}
const base = () => ({'classes/class-a': {ownerUid: teacher.uid, name: 'Our class'}, 'classes/class-a/students/pupil-1': {name: 'Student', number: 1}, 'assignments/task-a': {classId: 'class-a', targetStudentIds: ['pupil-1'], title: 'One', submissionType: 'text', createdAt: '2026-10-25', materials: []}});
const input = (action = 'hide', version = 0, ids = ['task-a']) => visibility.visibilityRequest({classId: 'class-a', action, items: ids.map(id => ({id, visibilityVersion: version}))});
const request = (method, body) => new Request('https://example.com/api/assignments', {method, headers: {'content-type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})});

test('old assignments are visible without migration and malformed selections are rejected', () => {
  assert.deepEqual(visibility.assignmentVisibility(), {visibility: 'visible', visibilityVersion: 0, hiddenAt: null, hiddenBy: null});
  for (const value of [null, {}, {classId: 'class-a', action: 'delete', items: []}, {classId: 'class-a', action: 'hide', items: [{id: 'task-a', visibilityVersion: -1}]}, {classId: 'class-a', action: 'hide', items: Array.from({length: 101}, (_, index) => ({id: `task-${index}`, visibilityVersion: 0}))}, {classId: 'class-a', action: 'hide', items: [{id: 'task-a', visibilityVersion: 0}, {id: 'task-a', visibilityVersion: 0}]}]) assert.throws(() => visibility.visibilityRequest(value), policy.ApiError);
});
test('hide and restore only change visibility, preserve submissions and rewards, and allow immediate retries', async () => {
  const setup = base(); setup['submissions/task-a_pupil-1'] = {status: 'done', rewardGranted: true, feedback: 'Great', uploads: [{path: 'original'}]};
  const f = fixture(setup), beforeSubmission = structuredClone(f.data.get('submissions/task-a_pupil-1'));
  const first = await f.archive.changeAssignmentVisibility(teacher, input());
  assert.equal(first[0].visibility, 'hidden'); assert.equal(first[0].visibilityVersion, 1);
  assert.equal(first[0].hiddenBy, teacher.uid); assert.ok(first[0].hiddenAt);
  assert.deepEqual(await f.archive.changeAssignmentVisibility(teacher, input()), first);
  assert.equal(f.writes.length, 1);
  const restored = await f.archive.changeAssignmentVisibility(teacher, input('restore', 1));
  assert.deepEqual(restored[0], {id: 'task-a', visibility: 'visible', visibilityVersion: 2, hiddenAt: null, hiddenBy: null});
  assert.deepEqual(f.data.get('submissions/task-a_pupil-1'), beforeSubmission);
  assert.deepEqual(f.writes.map(write => write.path), ['assignments/task-a', 'assignments/task-a']);
  await assert.rejects(f.archive.changeAssignmentVisibility(teacher, input()), error => error.code === 'VISIBILITY_CONFLICT');
});
test('a mixed-class or stale batch changes nothing, and nonowners cannot hide', async () => {
  const setup = base(); setup['assignments/task-b'] = {classId: 'other-class'};
  const f = fixture(setup);
  await assert.rejects(f.archive.changeAssignmentVisibility(teacher, input('hide', 0, ['task-a', 'task-b'])), error => error.status === 404);
  assert.equal(f.writes.length, 0);
  await assert.rejects(f.archive.changeAssignmentVisibility({...teacher, uid: 'other'}, input()), error => error.status === 403);
  await assert.rejects(f.archive.changeAssignmentVisibility({...teacher, role: 'student'}, input()), error => error.status === 403);
  f.data.set('assignments/task-b', {classId: 'class-a', visibility: 'visible', visibilityVersion: 2});
  await assert.rejects(f.archive.changeAssignmentVisibility(teacher, input('hide', 0, ['task-a', 'task-b'])), error => error.code === 'VISIBILITY_CONFLICT');
  assert.equal(f.writes.length, 0);
});
test('student home excludes hidden content and resolves submission records beyond the former 200 limit', async () => {
  const setup = base();
  for (let index = 0; index < 205; index++) setup[`assignments/old-${index}`] = {classId: 'class-a', targetStudentIds: ['pupil-1'], visibility: 'hidden', materials: [{id: 'secret'}]};
  for (let index = 0; index < 205; index++) {
    setup[`assignments/current-${index}`] = {classId: 'class-a', targetStudentIds: ['pupil-1'], title: `Current ${index}`, createdAt: `2026-${index}`, submissionType: 'text'};
    setup[`submissions/current-${index}_pupil-1`] = {assignmentId: `current-${index}`, classId: 'class-a', studentId: 'pupil-1', status: 'done', rewardGranted: true};
  }
  setup['assignments/not-assigned'] = {classId: 'class-a', targetStudentIds: ['other'], materials: [{id: 'secret'}]};
  const f = fixture(setup), response = await f.api.handle(request('GET'), 'student-home');
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.assignments.length, 206);
  assert.equal(result.assignments.find(task => task.id === 'current-204').status, 'done');
  assert.ok(result.assignments.every(task => task.visibility === 'visible'));
  assert.ok(f.reads.every(batch => batch.length <= 100));
  assert.ok(f.reads.flat().every(path => !path.startsWith('assignments/old-')));
});
test('teacher summary retains complete archived history and default visibility fields', async () => {
  const setup = base(); for (let index = 0; index < 205; index++) setup[`assignments/old-${index}`] = {classId: 'class-a', visibility: 'hidden'};
  const f = fixture(setup), response = await f.api.handle(new Request('https://example.com/api/assignments?classId=class-a&summary=1'), 'assignments');
  const body = await response.json(); assert.equal(body.assignments.length, 206);
  assert.equal(body.assignments.find(task => task.id === 'task-a').visibilityVersion, 0);
});
test('hidden assignments reject new uploads, submissions, edits, single reviews and batch reviews', async () => {
  const setup = base(); setup['assignments/task-a'].visibility = 'hidden'; const f = fixture(setup);
  for (const [operation, method, body] of [['upload-init', 'POST', {assignmentId: 'task-a'}], ['submission-finalize', 'POST', {assignmentId: 'task-a', text: 'Answer', uploadIds: []}], ['assignment', 'PATCH', {title: 'Changed'}], ['review', 'POST', {}], ['review-batch', 'POST', {}]]) {
    const response = await f.api.handle(request(method, body), operation, 'task-a'); assert.equal(response.status, 409, operation); assert.equal((await response.json()).code, 'ASSIGNMENT_HIDDEN', operation);
  }
  assert.equal(f.writes.length, 0);
});
test('hiding after a form was opened wins against edit, final submission and review transactions', async () => {
  for (const [operation, method, body] of [['assignment', 'PATCH', {title: 'Changed', description: ''}], ['submission-finalize', 'POST', {assignmentId: 'task-a', text: 'Answer', uploadIds: []}], ['review', 'POST', {studentId: 'pupil-1', attemptId: 'attempt', status: 'done', feedback: ''}]]) {
    const f = fixture(base()); f.before(() => {f.data.get('assignments/task-a').visibility = 'hidden';});
    const response = await f.api.handle(request(method, body), operation, 'task-a'); assert.equal(response.status, 409, operation); assert.equal((await response.json()).code, 'ASSIGNMENT_HIDDEN'); assert.equal(f.writes.length, 0);
  }
});
test('an upload request already in flight cannot reserve a manifest after the assignment is hidden', async () => {
  const f = fixture(base()); f.before(() => {f.data.get('assignments/task-a').visibility = 'hidden';});
  await assert.rejects(f.homeworkUploads.prepareHomeworkUpload(student.uid, {studentId: student.studentId, classId: student.classId, assignmentId: 'task-a', fileName: 'photo.jpg', contentType: 'image/jpeg', size: 1000}, 'https://example.com'), error => error.code === 'ASSIGNMENT_HIDDEN');
  assert.equal(f.writes.length, 0);
});
test('a new video job is rejected when hide wins the acceptance transaction', async () => {
  const setup = base();
  setup['runtimeConfig/videoProcessing'] = {enabled: true, projectId: 'test-project', workerUrl: 'https://test-video.run.app', invokerServiceAccount: 'worker@test-project.iam.gserviceaccount.com', location: 'asia-northeast3', queue: 'video'};
  setup['uploads/video-file'] = {userUid: student.uid, assignmentId: 'task-a', status: 'pending', path: 'original', size: 1000, contentType: 'video/mp4', expiresAt: {}};
  setup['classes/class-a/students/pupil-1'].authUid = student.uid;
  const f = fixture(setup);
  // Timestamp prototype is deliberately injected after the JSON-like fixture copy.
  const originalDoc = f.db.doc;
  f.db.doc = path => path === 'uploads/video-file' ? {...originalDoc(path), get: async () => ({exists: true, data: () => ({...f.data.get(path), expiresAt: {toMillis: () => Date.now() + 10000}})})} : originalDoc(path);
  f.before(() => {f.data.get('assignments/task-a').visibility = 'hidden';});
  await assert.rejects(f.video.createVideoSubmission(student, {id: 'task-a', ...setup['assignments/task-a']}, '', ['video-file']), error => error.code === 'ASSIGNMENT_HIDDEN');
  assert.equal(f.writes.length, 0);
});
test('the real video retry handler rechecks visibility inside its transaction', async () => {
  const setup = base();
  setup['videoJobs/video-file'] = {id: 'video-file', userUid: student.uid, classId: student.classId, assignmentId: 'task-a', status: 'failed', retryable: true, retryVersion: 1};
  const f = fixture(setup);
  f.before(() => {f.data.get('assignments/task-a').visibility = 'hidden';});
  const response = await f.video.handleVideoJob(request('POST', {}), 'video-file');
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'ASSIGNMENT_HIDDEN');
  assert.equal(f.data.get('videoJobs/video-file').retryVersion, 1);
  assert.equal(f.writes.length, 0);
});
test('the real board publish handler blocks hidden guides and answers, including an in-flight hide', async () => {
  for (const includeGuide of [true, false]) {
    for (const hiddenBeforeRequest of [true, false]) {
      const setup = base();
      setup['participationBoards/board-a'] = {ownerUid: teacher.uid, classId: 'class-a', status: 'open', postCount: 0, theme: 'mint'};
      setup['submissions/task-a_pupil-1'] = {assignmentId: 'task-a', studentId: 'pupil-1', attemptId: 'attempt-1', text: 'Original answer', uploads: []};
      if (hiddenBeforeRequest) setup['assignments/task-a'].visibility = 'hidden';
      const f = fixture(setup);
      if (!hiddenBeforeRequest) f.before(() => {f.data.get('assignments/task-a').visibility = 'hidden';});
      const response = await f.learningLinks.handleLearningLinks(request('POST', {assignmentId: 'task-a', boardId: 'board-a', includeGuide, hideNames: false, submissions: includeGuide ? [] : [{id: 'task-a_pupil-1', version: 'attempt-1'}]}), ['publish']);
      assert.equal(response.status, 409); assert.equal((await response.json()).code, 'ASSIGNMENT_HIDDEN'); assert.equal(f.writes.length, 0);
    }
  }
});
test('hiding preserves already published board copies and prevents a stale publish from changing them', async () => {
  const setup = base(); setup['participationBoards/board-a'] = {ownerUid: teacher.uid, classId: 'class-a', status: 'open', postCount: 0, theme: 'mint'};
  const f = fixture(setup), payload = {assignmentId: 'task-a', boardId: 'board-a', includeGuide: true, hideNames: false, submissions: []};
  const published = await f.learningLinks.handleLearningLinks(request('POST', payload), ['publish']);
  assert.equal(published.status, 201); assert.equal((await published.json()).created, 1);
  const postKey = [...f.data.keys()].find(key => key.startsWith('participationBoards/board-a/posts/'));
  const original = structuredClone(f.data.get(postKey)), writeCount = f.writes.length;
  f.before(() => {f.data.get('assignments/task-a').visibility = 'hidden';});
  const stale = await f.learningLinks.handleLearningLinks(request('POST', {...payload, hideNames: true}), ['publish']);
  assert.equal(stale.status, 409); assert.equal((await stale.json()).code, 'ASSIGNMENT_HIDDEN');
  assert.equal(f.writes.length, writeCount); assert.deepEqual(f.data.get(postKey), original);
});
