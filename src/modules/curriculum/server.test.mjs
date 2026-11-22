// 서버 저장 경로 시험: 진짜 Firestore 대신 메모리 가짜 DB, 로그인 대신 고정 사용자.
import assert from 'node:assert/strict';
export async function run(load, sampleXlsx) {
  const docs = new Map(), auto = {n: 0}, files = new Map();
  const bucket = {file: path => ({getSignedUrl: async () => [`https://storage.test/${path}`], download: async () => {if (!files.has(path)) throw new Error('missing'); return [files.get(path)];}, delete: async () => {files.delete(path);}})};
  const ref = path => ({
    path,
    get: async () => ({exists: docs.has(path), data: () => structuredClone(docs.get(path))}),
    id: path.split('/').at(-1),
    set: async value => {docs.set(path, structuredClone(value));},
    update: async value => {docs.set(path, {...docs.get(path), ...structuredClone(value)});},
    delete: async () => {docs.delete(path);},
    collection: name => {
      const prefix = `${path}/${name}/`, list = () => [...docs.entries()].filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'));
      return {
        doc: id => ref(`${prefix}${id ?? `auto${String(++auto.n).padStart(10, '0')}`}`),
        orderBy: () => ({limit: () => ({get: async () => ({docs: list().reverse().map(([key, value]) => ({id: key.slice(prefix.length), data: () => value}))})})}),
        count: () => ({get: async () => ({data: () => ({count: list().length})})}),
      };
    },
  });
  const db = {doc: ref, runTransaction: async fn => {
    const writes = [];
    const result = await fn({get: r => r.get(), set: (r, value) => writes.push(() => docs.set(r.path, structuredClone(value))), update: (r, value) => writes.push(() => docs.set(r.path, {...docs.get(r.path), ...structuredClone(value)}))});
    writes.forEach(write => write());
    return result;
  }};
  const user = {uid: 'teacher1', role: 'teacher'};
  docs.set('featureAccess/curriculum', {mode: 'allowlist', teacherUids: ['teacher1']});
  const {handleCurriculum} = await load({db, user, bucket});
  const call = async (method, path, body) => {
    const response = await handleCurriculum(new Request(`http://x/api/curriculum/${path}`, {method, headers: {'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined}), path.split('/'));
    return {status: response.status, data: await response.json()};
  };
  assert.deepEqual((await call('GET', 'plan')).data, {plan: null}, '처음에는 계획이 없다');
  const created = await call('POST', 'plan', {schoolName: '제주시험초', className: '3학년 2반', grade: 3, useSampleTimetable: true});
  assert.equal(created.status, 201);
  assert.equal(created.data.version, 1);
  assert.equal((await call('POST', 'plan', {schoolName: 'a', className: 'b', grade: 3})).status, 409, '두 번 만들 수 없다');
  const plan = created.data.plan, edited = {...plan, subjects: plan.subjects.map(s => s.key === 'kor' ? {...s, standard: {1: 110, 2: 110}} : s)};
  const saved = await call('PUT', 'plan', {plan: edited, version: 1});
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data, {version: 2, summary: '기준시수 1개 교과'});
  assert.equal((await call('PUT', 'plan', {plan: edited, version: 1})).data.code, 'STALE_VERSION', '옛 버전으로 덮어쓰지 못한다');
  assert.equal((await call('PUT', 'plan', {plan: {...edited, className: ''}, version: 2})).status, 400, '잘못된 계획은 400');
  assert.deepEqual((await call('PUT', 'plan', {plan: edited, version: 2})).data, {version: 2, summary: ''}, '바뀐 게 없으면 버전을 올리지 않는다');
  const loaded = await call('GET', 'plan');
  assert.equal(loaded.data.plan.subjects.find(s => s.key === 'kor').standard[1], 110, '다시 열면 저장한 값');
  assert.deepEqual((await call('GET', 'changes')).data.changes.map(c => c.summary), ['기준시수 1개 교과', '우리 반 시작']);
  // 자료 올리기 → (브라우저가 Storage에 PUT) → 읽기 → 지우기
  const made = await call('POST', 'sources', {name: '편제표.xlsx', size: sampleXlsx.length, role: 'standards'});
  assert.equal(made.status, 201);
  assert.match(made.data.uploadUrl, /curriculum-sources\/teacher1\//, '교사 폴더 아래로만 올린다');
  assert.equal((await call('POST', `sources/${made.data.id}/read`)).status, 409, '파일이 올라가기 전에는 읽지 않는다');
  files.set(`curriculum-sources/teacher1/${made.data.id}`, sampleXlsx);
  const read = await call('POST', `sources/${made.data.id}/read`);
  assert.equal(read.data.status, 'read');
  assert.ok(read.data.findings.standards.some(item => item.subject === 'kor' && item.hours === 102), '올린 편제표에서 국어 기준시수');
  assert.equal((await call('POST', 'sources', {name: 'virus.exe', size: 10})).status, 400, '받지 않는 형식');
  assert.equal((await call('POST', 'sources', {name: 'big.xlsx', size: 30 * 1024 * 1024})).status, 400, '20MB 넘는 파일');
  const bad = await call('POST', 'sources', {name: '옛한글.hwp', size: 10, role: 'standards'});
  files.set(`curriculum-sources/teacher1/${bad.data.id}`, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]));
  const failed = await call('POST', `sources/${bad.data.id}/read`);
  assert.equal(failed.data.status, 'failed');
  assert.match(failed.data.error, /HWPX/, '못 읽는 이유와 방법');
  assert.equal((await call('GET', 'sources')).data.sources.length, 2);
  assert.deepEqual((await call('POST', `sources/${bad.data.id}/delete`)).data, {deleted: true});
  assert.equal((await call('GET', 'sources')).data.sources.length, 1);
  assert.equal((await call('POST', 'sources/../../x/read')).status, 404, '이상한 자료 번호');
  user.uid = 'teacher2';
  assert.equal((await call('GET', 'plan')).status, 403, '공개 범위 밖 선생님은 막힌다');
  console.log('curriculum server tests passed');
}
