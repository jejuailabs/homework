// 서버 저장 경로 시험: 진짜 Firestore 대신 메모리 가짜 DB, 로그인 대신 고정 사용자.
import assert from 'node:assert/strict';
export async function run(load) {
  const docs = new Map(), auto = {n: 0};
  const ref = path => ({
    path,
    get: async () => ({exists: docs.has(path), data: () => structuredClone(docs.get(path))}),
    collection: name => ({doc: () => ref(`${path}/${name}/${++auto.n}`), orderBy: () => ({limit: () => ({get: async () => ({docs: [...docs.entries()].filter(([key]) => key.startsWith(`${path}/${name}/`)).reverse().map(([, value]) => ({data: () => value}))})})})}),
  });
  const db = {doc: ref, runTransaction: async fn => {
    const writes = [];
    const result = await fn({get: r => r.get(), set: (r, value) => writes.push(() => docs.set(r.path, structuredClone(value))), update: (r, value) => writes.push(() => docs.set(r.path, {...docs.get(r.path), ...structuredClone(value)}))});
    writes.forEach(write => write());
    return result;
  }};
  const user = {uid: 'teacher1', role: 'teacher'};
  docs.set('featureAccess/curriculum', {mode: 'allowlist', teacherUids: ['teacher1']});
  const {handleCurriculum} = await load({db, user});
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
  user.uid = 'teacher2';
  assert.equal((await call('GET', 'plan')).status, 403, '공개 범위 밖 선생님은 막힌다');
  console.log('curriculum server tests passed');
}
