// Hermetic API tests: all Auth/Firestore operations run against in-memory doubles.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const requestId = '46d75fd3-3448-4c70-a970-6b1a9d2e6a41';
function harness() {
  const data = new Map(), versions = new Map(), writes = [], reads = [];
  let serial = Promise.resolve(), counter = 0, ctx = {uid: 'teacher-1', role: 'teacher', displayName: '선생님', email: null}, authCalls = 0;
  const snapshot = path => ({id: path.split('/').at(-1), exists: data.has(path), data: () => structuredClone(data.get(path)), updateTime: {valueOf: () => String(versions.get(path) || '1')}, ref: ref(path)});
  function ref(path) {return {path, id: path.split('/').at(-1), get: async () => {reads.push(path); return snapshot(path);}};}
  function query(path, filters = [], orders = [], after = null, maximum = Infinity) {
    const rows = () => {
      const compare = (left, right) => {for (const [field, direction] of orders) {const a = field === '__name__' ? left.id : left.data()[field], b = field === '__name__' ? right.id : right.data()[field]; const delta = String(a).localeCompare(String(b)); if (delta) return direction === 'desc' ? -delta : delta;} return 0;};
      let rows = [...data.keys()].filter(key => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/')).map(snapshot).filter(doc => filters.every(([key, value]) => doc.data()[key] === value)).sort(compare);
      if (after) rows = rows.filter(doc => compare(doc, {id: after[1], data: () => ({createdAt: after[0]})}) > 0);
      return rows.slice(0, maximum);
    };
    return {
      doc: (name = 'generated-' + ++counter) => ref(path + '/' + name),
      where: (field, op, value) => {assert.equal(op, '=='); return query(path, [...filters, [field, value]], orders, after, maximum);},
      orderBy: (field, direction) => query(path, filters, [...orders, [field, direction]], after, maximum),
      startAfter: (...values) => query(path, filters, orders, values, maximum),
      limit: value => query(path, filters, orders, after, value),
      count: () => ({get: async () => {reads.push('count:' + path); return {data: () => ({count: rows().length})};}}),
      get: async () => {reads.push('query:' + path); return {docs: rows()};},
    };
  }
  const database = {doc: ref, collection: query, runTransaction: operation => {
    const run = serial.then(async () => {
      const pending = [];
      const tx = {get: async ref => {reads.push(ref.path); return snapshot(ref.path);}, create: (ref, value) => {assert.equal(data.has(ref.path), false); pending.push({ref, value});}, set: (ref, value) => pending.push({ref, value}), update: (ref, value) => pending.push({ref, value: {...data.get(ref.path), ...value}})};
      const result = await operation(tx);
      for (const write of pending) {data.set(write.ref.path, structuredClone(write.value)); versions.set(write.ref.path, ++counter); writes.push(write);}
      return result;
    });
    serial = run.catch(() => {}); return run;
  }};
  const modules = new Map();
  const overrides = {'server-only': {}, 'firebase-admin/firestore': {FieldPath: {documentId: () => '__name__'}}};
  function load(file) {
    const url = new URL(file, import.meta.url).href;
    if (modules.has(url)) return modules.get(url);
    const module = {exports: {}}; modules.set(url, module.exports);
    const source = ts.transpileModule(fs.readFileSync(new URL(url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
    const localRequire = name => {
      if (name in overrides) return overrides[name];
      if (name.startsWith('.')) return load(new URL(name + '.ts', url).href);
      return require(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, {filename: url})(localRequire, module, module.exports);
    return module.exports;
  }
  overrides['./admin'] = {db: () => database};
  const policy = load('./policy.ts'), actualAuth = load('./auth.ts');
  overrides['./auth'] = {...actualAuth, getContext: async () => {authCalls++; if (!ctx) throw new policy.ApiError(401, '로그인이 필요해요.'); return ctx;}};
  const api = load('./developer-mailbox.ts').handleDeveloperMailbox;
  function request(method = 'POST', input = {title: '기능 제안', message: '메시지를 남겨요.', requestId}, query = '', origin = 'https://local.test') {
    return new Request('https://local.test/api/developer-mailbox' + query, {method, headers: {'Content-Type': 'application/json', origin}, ...(method === 'GET' ? {} : {body: JSON.stringify(input)})});
  }
  return {data, writes, reads, api, request, setContext: value => ctx = value, get authCalls() {return authCalls;}};
}

test('mailbox denies anonymous and non-admin readers before touching Firestore', async () => {
  const h = harness(); h.setContext(null);
  assert.equal((await h.api(h.request())).status, 401);
  h.setContext({uid: 'student', role: 'student'});
  assert.equal((await h.api(h.request('GET'), true)).status, 403);
  assert.equal((await h.api(h.request('PATCH'), true, ['a'.repeat(64)])).status, 403);
  assert.deepEqual(h.reads, []); assert.deepEqual(h.writes, []);
});
test('cross-origin mutations are rejected before authentication', async () => {
  const h = harness(); const r = await h.api(h.request('POST', {}, '', 'https://evil.test'));
  assert.equal(r.status, 403); assert.equal(h.authCalls, 0); assert.equal(h.writes.length, 0);
});
test('author identity and initial status come from the server; concurrent retries create one letter', async () => {
  const h = harness(); const input = {requestId, title: '  새 기능  ', message: '  부탁해요.  ', author: {uid: 'admin', name: '위조'}, status: 'completed'};
  const responses = await Promise.all([h.api(h.request('POST', input)), h.api(h.request('POST', input))]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  const receipts = await Promise.all(responses.map(r => r.json())); assert.equal(receipts[0].id, receipts[1].id);
  const letter = h.data.get('developerMailbox/' + receipts[0].id);
  assert.equal(letter.author.uid, 'teacher-1'); assert.equal(letter.author.name, '선생님'); assert.equal(letter.status, 'new'); assert.equal(letter.title, '새 기능');
  assert.equal(h.writes.length, 2);
  const conflict = await h.api(h.request('POST', {...input, message: '다른 내용'})); assert.equal(conflict.status, 409);
  assert.match(responses[0].headers.get('cache-control'), /private.*no-store/); assert.equal(responses[0].headers.get('vary'), 'Cookie');
});
test('student letters use the enrolled student name and class, ignoring submitted identity', async () => {
  const h = harness(); h.setContext({uid: 'child-1', role: 'student', classId: 'class-1', studentId: 'student-1'});
  h.data.set('classes/class-1', {name: '3학년 1반'}); h.data.set('classes/class-1/students/student-1', {name: '학생 이름', authUid: 'child-1'});
  const response = await h.api(h.request()); assert.equal(response.status, 200);
  const letter = h.data.get('developerMailbox/' + (await response.json()).id);
  assert.deepEqual(letter.author, {uid: 'child-1', role: 'student', name: '학생 이름', className: '3학년 1반', classId: 'class-1', studentId: 'student-1'});
  const bad = harness(); bad.setContext({uid: 'child-2', role: 'student', classId: 'class-1', studentId: 'student-1'}); bad.data.set('classes/class-1', {}); bad.data.set('classes/class-1/students/student-1', {authUid: 'child-1'});
  assert.equal((await bad.api(bad.request())).status, 403); assert.equal(bad.writes.length, 0);
});
test('invalid input cannot write letters; cooldown and daily limits are enforced', async () => {
  const h = harness();
  for (const input of [{title: '', message: 'x', requestId}, {title: 'x'.repeat(81), message: 'x', requestId}, {title: 'x', message: 'x'.repeat(2001), requestId}, {title: 'x', message: 'y', requestId: '../invalid'}]) assert.equal((await h.api(h.request('POST', input))).status, 400);
  assert.equal(h.writes.length, 0); await h.api(h.request());
  assert.equal((await h.api(h.request('POST', {title: '다른 편지', message: '내용', requestId: '46d75fd3-3448-4c70-a970-6b1a9d2e6a42'}))).status, 429);
  const limit = [...h.data.keys()].find(k => k.startsWith('developerMailboxLimits/')); h.data.get(limit).count = 10; h.data.get(limit).lastAt = 0;
  assert.equal((await h.api(h.request('POST', {title: '다른 편지', message: '내용', requestId: '46d75fd3-3448-4c70-a970-6b1a9d2e6a42'}))).status, 429);
});
test('admin pagination is deterministic for identical timestamps; private detail and updates require a fresh version', async () => {
  const h = harness(); h.setContext({uid: 'operator', role: 'admin'});
  for (let i = 0; i < 25; i++) h.data.set('developerMailbox/' + i.toString(16).padStart(64, '0'), {title: '제안 ' + i, message: '<script>hello</script>', author: {uid: 'student', role: 'student', name: '학생'}, createdAt: '2026-10-30T01:00:00.000Z', status: 'new', adminNote: ''});
  const first = await (await h.api(h.request('GET'), true)).json(); assert.equal(first.items.length, 20); assert.equal(first.newCount, 25); assert.equal(first.items[0].message, undefined);
  const next = await (await h.api(h.request('GET', undefined, '?cursor=' + first.nextCursor), true)).json(); assert.equal(next.items.length, 5); assert.equal(next.nextCursor, null);
  assert.equal(new Set([...first.items, ...next.items].map(x => x.id)).size, 25);
  const id = first.items[0].id;
  const detail = await (await h.api(h.request('GET'), true, [id])).json(); assert.equal(detail.letter.message, '<script>hello</script>');
  const input = {status: 'reviewing', adminNote: '검토 메모', version: detail.letter.version};
  assert.equal((await h.api(h.request('PATCH', input), true, [id])).status, 200);
  assert.equal(h.data.get('developerMailbox/' + id).status, 'reviewing'); assert.equal(h.data.get('developerMailbox/' + id).adminNote, '검토 메모');
  assert.equal([...h.data.keys()].filter(key => key.startsWith('adminAudit/')).length, 1);
  assert.equal((await h.api(h.request('PATCH', input), true, [id])).status, 409);
  assert.equal((await h.api(h.request('PATCH', {...input, status: 'invented'}), true, [id])).status, 400);
  assert.equal((await h.api(h.request('GET', undefined, '?cursor=bad'), true)).status, 400);
});
