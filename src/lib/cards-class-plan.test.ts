import assert from 'node:assert/strict';
import {CardPlanError, appCardDefaults, distributionFromDefaults, moveRow, orderWithPlan, parseClassDefaults, parseClassDefaultsByType, parsePlan, patchFromDefaults, percentToCount, planFromRows, studentPlan, studentRows} from './cards-class-plan';

// 비율 → 장 수
assert.equal(percentToCount(100, 12), 12, '100%는 한 바퀴');
assert.equal(percentToCount(200, 12), 24, '200%는 두 바퀴');
assert.equal(percentToCount(50, 5), 3, '반올림');
assert.equal(percentToCount(50, 1), 1, '켜 둔 모드는 적어도 1장');
assert.equal(percentToCount(300, 12, false), 0, '끈 모드는 선택 학습(0)');
assert.equal(percentToCount(100, 0), 0, '빈 범위');

// 기본값 합치기
const app = appCardDefaults();
assert.deepEqual(parseClassDefaults(undefined), app, '문서가 없는 반은 앱 기본값');
const partial = parseClassDefaults({modes: {spell: {on: true, percent: 200}}, test: {goalScore: 90}});
assert.deepEqual([partial.modes.spell, partial.modes.memorize, partial.test.goalScore, partial.test.maxAttempts], [{on: true, percent: 200, direction: 'back-front'}, app.modes.memorize, 90, 3], '준 칸만 바뀌고 나머지는 앱 기본값');
assert.equal(parseClassDefaults({speechRate: 9, test: {goalScore: 'a'}}).speechRate, 1, '저장된 이상한 값은 읽을 때 기본값');
assert.throws(() => parseClassDefaults({speechRate: 9}, true), CardPlanError, '저장할 때는 이상한 값을 거절');
assert.throws(() => parseClassDefaults({modes: {recall: {percent: 120}}}, true), CardPlanError, '정해진 비율만');
assert.throws(() => parseClassDefaults({test: {timeLimitMinutes: 0}}, true), CardPlanError);
assert.equal(parseClassDefaults({test: {timeLimitMinutes: null}}, true).test.timeLimitMinutes, null, '제한 없음은 null');
const both = parseClassDefaultsByType({sentence: {afterDue: 'lock'}});
assert.deepEqual([both.word.afterDue, both.sentence.afterDue], ['late', 'lock'], '유형마다 따로');
assert.throws(() => parseClassDefaultsByType('x', true), CardPlanError);

// 새 배부 설정
const made = distributionFromDefaults(parseClassDefaults({modes: {recall: {on: true, percent: 200, direction: 'back-front'}, spell: {on: true, percent: 50}}, test: {questionCount: 30, timeLimitMinutes: 5}}), 12);
assert.deepEqual(made.requiredModes.recall, {requiredCount: 24, direction: 'back-front', rangeStart: 1, rangeEnd: 12});
assert.equal(made.requiredModes.spell.requiredCount, 6);
assert.deepEqual([made.test.questionCount, made.test.timeLimitSeconds, made.afterDue, made.speechRate], [12, 300, 'late', 1], '문항 수는 카드 수를 넘지 않고 분은 초로');
assert.ok(!('timeLimitMinutes' in made.test));

// 기존 배부에 적용: 범위 유지, 마감 없는 배부의 마감 후 공개는 건드리지 않음
const existing = {cardCount: 12, dueAt: null, requiredModes: {memorize: {requiredCount: 0, direction: 'front-back', rangeStart: 1, rangeEnd: 12}, recall: {requiredCount: 0, direction: 'front-back', rangeStart: 3, rangeEnd: 6}, spell: {requiredCount: 0, direction: 'front-back', rangeStart: 1, rangeEnd: 12}}} as const;
const patch = patchFromDefaults(parseClassDefaults({modes: {recall: {on: true, percent: 200}}, test: {answerRelease: 'after-due'}}), existing as never);
assert.deepEqual(patch.requiredModes.recall, {requiredCount: 8, direction: 'front-back'}, '그 배부의 범위(4장)에 비율을 곱함');
assert.ok(!('rangeStart' in (patch.requiredModes.recall as object)), '범위는 보내지 않아 그대로');
assert.ok(!('answerRelease' in patch.test), '마감이 없으면 마감 후 공개를 보내지 않음');
assert.equal(patchFromDefaults(parseClassDefaults({test: {answerRelease: 'after-due'}}), {...existing, dueAt: '2026-11-10T00:00:00.000Z'} as never).test.answerRelease, 'after-due');

// 순서와 메모
const d = (id: string, createdAt: string) => ({id, createdAt});
const rows = [d('a', '2026-11-01'), d('b', '2026-11-02'), d('c', '2026-11-03'), d('new', '2026-11-05')];
assert.deepEqual(orderWithPlan(rows, []).map(row => row.id), ['new', 'c', 'b', 'a'], '저장한 순서가 없으면 최신순');
const plan = parsePlan([{kind: 'memo', id: 'm1', text: '  3/12 수업:   Unit 1-2 '}, {kind: 'set', id: 'a', highlight: true}, {kind: 'set', id: 'gone'}, {kind: 'set', id: 'b', hidden: true}, {kind: 'memo', id: 'm2', text: '다음 시간', hidden: true}, {kind: 'set', id: 'c'}], true);
assert.equal((plan[0] as {text: string}).text, '3/12 수업: Unit 1-2', '메모 공백 정리');
const ordered = orderWithPlan(rows, plan);
assert.deepEqual(ordered.map(row => row.id), ['new', 'm1', 'a', 'b', 'm2', 'c'], '새 배부는 맨 위, 지워진 배부는 빠짐');
assert.deepEqual(ordered.filter(row => row.highlight).map(row => row.id), ['a']);
const seen = studentPlan(rows, plan);
assert.deepEqual(seen.distributions.map(row => row.id), ['new', 'a', 'c'], '숨긴 줄은 학생 목록에서 빠짐');
assert.deepEqual(seen.layout, [{kind: 'set', id: 'new', highlight: false}, {kind: 'memo', id: 'm1', text: '3/12 수업: Unit 1-2', highlight: false}, {kind: 'set', id: 'a', highlight: true}, {kind: 'set', id: 'c', highlight: false}], '숨긴 메모도 빠짐');
assert.deepEqual(studentRows([d('c', ''), d('a', ''), d('later', '')], seen.layout).map(row => row.id), ['m1', 'a', 'c', 'later'], '학생 화면: 레이아웃 순서, 다음 쪽 세트는 끝에');
assert.deepEqual(studentRows([d('a', '')], null).map(row => row.kind), ['set'], '검색 중에는 세트만');
assert.deepEqual(planFromRows(ordered), [{kind: 'set', id: 'new'}, {kind: 'memo', id: 'm1', text: '3/12 수업: Unit 1-2'}, {kind: 'set', id: 'a', highlight: true}, {kind: 'set', id: 'b', hidden: true}, {kind: 'memo', id: 'm2', text: '다음 시간', hidden: true}, {kind: 'set', id: 'c'}], '저장 형태로 되돌리기');
assert.deepEqual(moveRow([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]);
assert.deepEqual(moveRow([1, 2, 3], 2, 0), [3, 1, 2]);
assert.deepEqual(moveRow([1, 2], 1, 5), [1, 2], '밖으로는 못 옮김');

// 크기 제한
assert.throws(() => parsePlan(Array.from({length: 101}, (_, i) => ({kind: 'memo', id: `m${i}`, text: 'x'})), true), /100개/);
assert.equal(parsePlan(Array.from({length: 101}, (_, i) => ({kind: 'memo', id: `m${i}`, text: 'x'}))).length, 100, '읽을 때는 100개에서 자름');
assert.throws(() => parsePlan([{kind: 'memo', id: 'm', text: '가'.repeat(201)}], true), /200자/);
assert.equal(parsePlan([{kind: 'memo', id: 'm', text: '가'.repeat(200)}], true).length, 1);
assert.throws(() => parsePlan([{kind: 'memo', id: 'm', text: '  '}], true), CardPlanError, '빈 메모');
assert.throws(() => parsePlan([{kind: 'set', id: 'a'}, {kind: 'set', id: 'a'}], true), /두 번/);
assert.throws(() => parsePlan([{kind: 'set', id: 'a/b'}], true), CardPlanError, '문서 경로 글자는 안 됨');
assert.throws(() => parsePlan({}, true), CardPlanError);
assert.deepEqual(parsePlan([{kind: 'set', id: 'a', highlight: 'yes'}], true), [{kind: 'set', id: 'a'}], 'true가 아닌 표시는 버림');
console.log('cards class plan tests ok');
