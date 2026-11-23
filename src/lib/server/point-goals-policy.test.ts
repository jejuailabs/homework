import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertGoalSlot, parsePointGoalEdit, goalDonationDecision, goalOverdue, goalRefunds, parsePointGoal, publicPointGoal} from './point-goals-policy';

const now = new Date('2026-11-20T00:00:00.000Z');
const open = {status: 'open', target: 100, raised: 70, dueAt: null, donors: {a: {name: '가', number: 1, amount: 50}, b: {name: '나', number: 2, amount: 20}}};

test('보말 기부 목표 입력', () => {
  assert.deepEqual(parsePointGoal({title: ' 영화 보기 ', target: 300}, now), {title: '영화 보기', description: '', target: 300, dueAt: null});
  assert.equal(parsePointGoal({title: '간식', target: 5, dueAt: '2026-11-21T00:00:00.000Z'}, now).dueAt, '2026-11-21T00:00:00.000Z');
  for (const target of [0, -1, 1.5, '10', 1_000_001]) assert.throws(() => parsePointGoal({title: '간식', target}, now));
  assert.throws(() => parsePointGoal({title: '', target: 5}, now));
  assert.throws(() => parsePointGoal({title: '간식', target: 5, dueAt: '2026-11-19T00:00:00.000Z'}, now), /마감/);
});
test('진행 중 목표는 3개까지', () => {
  assertGoalSlot(0); assertGoalSlot(2);
  assert.throws(() => assertGoalSlot(3), /3개/);
});
test('딱 맞게만 기부', () => {
  assert.deepEqual(goalDonationDecision(open, 40, 10, now), {raised: 80, remaining: 20, reached: false, balance: 30});
  assert.deepEqual(goalDonationDecision(open, 40, 30, now), {raised: 100, remaining: 0, reached: true, balance: 10});
  assert.throws(() => goalDonationDecision(open, 40, 31, now), /남은 보말은 30개/);
  assert.throws(() => goalDonationDecision(open, 5, 10, now), /가진 보말/);
  for (const amount of [0, -3, 2.5, '5']) assert.throws(() => goalDonationDecision(open, 40, amount, now));
  assert.throws(() => goalDonationDecision({...open, status: 'reached'}, 40, 1, now), /끝난/);
  assert.throws(() => goalDonationDecision({...open, dueAt: '2026-11-19T00:00:00.000Z'}, 40, 1, now), /마감/);
});
test('마감이 지난 진행 중 목표만 실패', () => {
  assert.equal(goalOverdue({status: 'open', dueAt: '2026-11-19T00:00:00.000Z'}, now), true);
  assert.equal(goalOverdue({status: 'open', dueAt: null}, now), false);
  assert.equal(goalOverdue({status: 'reached', dueAt: '2026-11-19T00:00:00.000Z'}, now), false);
});
test('실패하면 낸 만큼 모두 돌려줌', () => {
  assert.deepEqual(goalRefunds(open).map(row => [row.studentId, row.amount]), [['a', 50], ['b', 20]]);
  assert.deepEqual(goalRefunds({donors: {x: {amount: 0}, y: {amount: 'a'}}}), []);
});
test('학생끼리 보는 기부자 명단은 많이 낸 순', () => {
  const goal = publicPointGoal('g1', {...open, title: '영화', createdAt: '2026-11-19T00:00:00.000Z'});
  assert.deepEqual(goal.donors.map(row => row.name), ['가', '나']);
  assert.equal(goal.status, 'open'); assert.equal(goal.failReason, null);
});

test('기부 고치기: 모으는 중이면 전부, 끝났으면 이름·설명만', () => {
  const now = new Date('2026-11-24T00:00:00Z');
  const open = {status: 'open', raised: 30, target: 100};
  assert.deepEqual(parsePointGoalEdit({title: '영화', description: '', target: 50, dueAt: null}, open, now), {title: '영화', description: '', target: 50, dueAt: null});
  assert.throws(() => parsePointGoalEdit({title: '영화', target: 30}, open, now), /31개 이상/);
  assert.throws(() => parsePointGoalEdit({title: '영화', target: 80, dueAt: '2026-11-01T00:00:00Z'}, open, now), /마감/);
  assert.deepEqual(parsePointGoalEdit({title: ' 간식 ', description: '금요일', target: 1}, {status: 'rewarded', raised: 100, target: 100}, now), {title: '간식', description: '금요일'});
});
