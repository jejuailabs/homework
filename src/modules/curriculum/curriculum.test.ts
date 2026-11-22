import assert from 'node:assert/strict';
import {CORE_IDS, ELSEWHERE, FEATURES, LIVE, SECTIONS, STEPS, TABS, searchFeatures} from './features';
import {expand, hourStats, progressToDate, schoolWeekOf, setSlot, week, weekStartOf, weekdayOf} from './engine';
import {SAMPLE_PLAN} from './sample';
import {buildXlsx, sheetName} from './xlsx';
import {FILE_KINDS, buildFile} from './files';
import {PlanError, curriculumAccess, curriculumAllowed, planInput} from './policy';
import {HOLIDAYS_2026, starterPlan, subjectsFor} from './starter';
import {changeSummary} from './changes';

// 스쿨마스터 기능 229개가 빠짐없이, 한 번씩, 메뉴 자리를 갖는다.
assert.equal(FEATURES.length, 229, '설계도 제1부의 기능 수');
assert.equal(new Set(FEATURES.map(feature => feature.id)).size, 229, 'ID가 겹치지 않는다');
for (const section of SECTIONS) assert.ok(FEATURES.some(feature => feature.section === section.key), `${section.key} ${section.name}: 메뉴에 기능이 하나 이상`);
for (const tab of TABS) {
  assert.ok(STEPS.some(step => step.tab === tab.key), `${tab.name}: 흐름 단계가 있다`);
  assert.ok(FEATURES.filter(feature => feature.tab === tab.key && feature.core).length >= 3, `${tab.name}: 핵심 기능이 3개 이상 먼저 보인다`);
}
for (const id of [...CORE_IDS, ...Object.keys(LIVE), ...Object.keys(ELSEWHERE)]) assert.ok(FEATURES.some(feature => feature.id === id), `${id}: 표에 있는 기능만 표시한다`);
assert.deepEqual([...new Set(FEATURES.map(feature => feature.phase))].sort(), [1, 2, 3, 4], '1~4단계에 모두 나뉜다');
assert.ok(FEATURES.filter(feature => feature.status === 'elsewhere').every(feature => feature.link?.startsWith('/teacher/')), '다른 메뉴로 보내는 기능은 실제 주소를 갖는다');
assert.ok(FEATURES.filter(feature => feature.status !== 'live').every(feature => feature.berry === null), '아직 안 되는 기능을 베리가 된다고 말하지 않는다');
assert.ok(searchFeatures('시수').some(feature => feature.section === '1.2.4'), '"시수"로 연간시간표를 찾는다');
assert.ok(searchFeatures('나이스 올리기').some(feature => feature.id === '2.5-05'), '"나이스 올리기"로 평어 올리기를 찾는다');
assert.equal(searchFeatures('   ').length, 0);
assert.ok(searchFeatures('타이머')[0].link === '/teacher/tools/timer', '타이머는 이미 있는 도구로 보낸다');

// 계산기: 차시 한 칸이 원자다.
const sessions = expand(SAMPLE_PLAN);
assert.equal(new Set(sessions.map(session => `${session.date}:${session.period}`)).size, sessions.length, '같은 날 같은 교시에 수업이 둘일 수 없다');
assert.ok(sessions.every(session => weekdayOf(session.date) <= 5), '주말 수업 없음');
assert.ok(!sessions.some(session => session.date === '2026-05-05'), '공휴일은 수업 없음');
assert.equal(sessions.filter(session => session.date === '2026-03-03').length, 4, '행사로 4교시까지만 하는 날');
const stats = hourStats(SAMPLE_PLAN, sessions);
assert.ok(stats.schoolDays.year >= SAMPLE_PLAN.daysRequired, `예시 학교는 수업일수 기준을 채운다 (${stats.schoolDays.year}일)`);
assert.equal(stats.total.planned.year, sessions.length, '합계 = 차시 수');
assert.equal(stats.total.planned.year, stats.rows.reduce((sum, row) => sum + row.planned.year, 0));
assert.ok(stats.rows.some(row => row.diff.year < 0) && stats.rows.some(row => row.diff.year > 0), '예시에는 부족(빨강)과 초과(파랑)가 둘 다 보인다');
assert.ok(stats.warnings.some(text => text.includes('모자라요')), '부족한 교과를 문장으로 알려 준다');

// 기초시간표 한 칸을 바꾸면 시수·주간학습이 함께 바뀐다(따로 저장하지 않으므로 어긋날 수 없다).
const changed = setSlot(SAMPLE_PLAN, 1, 3, 5, 'mat'), after = hourStats(changed);
const pick = (value: typeof stats, key: string) => value.rows.find(row => row.subject === key)!.planned[1];
assert.ok(pick(after, 'mat') > pick(stats, 'mat') && pick(after, 'eth') < pick(stats, 'eth'), '수 5교시 도덕 → 수학: 수학 늘고 도덕 줄어든다');
assert.equal(after.total.planned[1], stats.total.planned[1], '칸을 바꿔도 전체 시수는 같다');
assert.equal(SAMPLE_PLAN.templates[1].find(slot => slot.weekday === 3 && slot.period === 5)?.subject, 'eth', '원본 계획은 그대로');
assert.equal(hourStats(setSlot(SAMPLE_PLAN, 1, 3, 5, null)).total.planned[1], stats.total.planned[1] - pick(stats, 'eth') + pick(hourStats(setSlot(SAMPLE_PLAN, 1, 3, 5, null)), 'eth'), '칸을 비우면 그만큼 준다');

const days = week(SAMPLE_PLAN, '2026-05-06', sessions);
assert.equal(days.length, 5);
assert.equal(days[0].date, '2026-05-04');
assert.equal(days[0].school, false, '재량휴업일');
assert.equal(days[1].note?.name, '어린이날');
assert.ok(days[2].cells.length > 0 && days[2].cells.every(cell => cell.unit), '수업일 칸에는 단원이 붙는다');
assert.equal(weekStartOf('2026-03-08'), '2026-03-02', '일요일은 그 주 월요일로');
assert.equal(schoolWeekOf('2026-11-22'), '2026-11-23', '일요일의 "이번 주 주간학습"은 다음 주');
assert.equal(schoolWeekOf('2026-11-20'), '2026-11-20', '평일은 그대로');
const progress = progressToDate(SAMPLE_PLAN, '2026-04-01', sessions);
assert.ok(progress.every(entry => entry.done <= entry.total && entry.next), '진도율과 다음 차시');

// 엑셀: 압축 파일 머리, 시트 이름 규칙, 세 종류 모두 생성.
const bytes = buildXlsx([{name: '시험', rows: [['<&>', 1, {value: -2, style: 'short'}]]}]);
assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
const text = new TextDecoder().decode(bytes);
assert.ok(text.includes('&lt;&amp;&gt;') && text.includes('<v>-2</v>'), '특수 문자는 바꾸고 숫자는 숫자로');
assert.equal(sheetName('1/2학기:[진도]'), '1 2학기  진도 ');
for (const kind of FILE_KINDS) {
  const file = buildFile(SAMPLE_PLAN, kind, '2026-05-06');
  assert.ok(file.bytes.length > 500 && file.name.endsWith('_예시.xlsx'), `${kind} 파일과 이름`);
}
assert.ok(new TextDecoder().decode(buildFile(SAMPLE_PLAN, 'hours').bytes).includes('시험용 예시 학급'), '예시 자료라고 파일 안에도 적는다');
assert.deepEqual(buildFile(SAMPLE_PLAN, 'hours').bytes, buildFile(SAMPLE_PLAN, 'hours').bytes, '같은 입력이면 같은 파일');

// 숨김 시험: 기본은 꺼짐, 관리자만 확인용으로 열림, 비상 스위치는 관리자까지 끈다.
const off = curriculumAccess(undefined);
assert.equal(off.mode, 'off');
assert.equal(curriculumAllowed(off, 'teacher1', 'teacher'), false, '기본값에서 일반 선생님에게 안 보인다');
assert.equal(curriculumAllowed(off, 'admin1', 'superadmin'), true, '관리자는 확인용으로 열 수 있다');
assert.equal(curriculumAllowed(off, 'admin1', 'superadmin', 'true'), false, 'CURRICULUM_DISABLED=true는 모두 끈다');
const pilot = curriculumAccess({mode: 'allowlist', teacherUids: ['teacher1', 'bad id!', 3]});
assert.deepEqual(pilot.teacherUids, ['teacher1'], '이상한 값은 버린다');
assert.equal(curriculumAllowed(pilot, 'teacher1', 'teacher'), true);
assert.equal(curriculumAllowed(pilot, 'teacher2', 'teacher'), false);
assert.equal(curriculumAllowed(curriculumAccess({mode: 'all'}), 'student1', 'student'), false, '학생에게는 열리지 않는다');
assert.equal(curriculumAccess({mode: 'everyone'}).mode, 'off', '모르는 값은 꺼짐');

// 우리 반 시작: 확실한 것만 채우고, 비운 곳은 시수표가 알린다.
assert.deepEqual(subjectsFor(1).map(entry => entry.name), ['국어', '수학', '바른 생활', '슬기로운 생활', '즐거운 생활', '창의적 체험활동'], '1·2학년은 통합교과');
assert.ok(subjectsFor(5).some(entry => entry.name === '실과') && !subjectsFor(4).some(entry => entry.name === '실과'), '실과는 5·6학년만');
const mine = starterPlan({schoolName: '제주시험초', className: '3학년 2반', grade: 3, useSampleTimetable: false});
assert.equal(mine.sample, false);
assert.equal(mine.templates[1].length, 0, '시간표는 비운 채 시작');
assert.ok(mine.subjects.every(entry => entry.standard[1] === 0 && entry.standard[2] === 0), '기준시수는 학교마다 달라 비운다');
assert.ok(HOLIDAYS_2026.some(day => day.date === '2026-05-01') && HOLIDAYS_2026.some(day => day.date === '2026-07-17'), '2026년부터 노동절·제헌절 공휴일');
const fresh = hourStats(mine);
assert.ok(fresh.rows.every(row => !row.hasStandard) && !fresh.total.hasStandard, '기준 없는 교과는 증감을 비교하지 않는다');
assert.ok(fresh.warnings.some(text => text.includes('기준시수가 비어')) && fresh.warnings.some(text => text.includes('기초시간표가 비어')), '무엇을 넣어야 하는지 알려 준다');
assert.equal(starterPlan({schoolName: 'a', className: 'b', grade: 3, useSampleTimetable: true}).templates[1].length, SAMPLE_PLAN.templates[1].length, '3·4학년은 예시 시간표로 시작할 수 있다');
assert.equal(starterPlan({schoolName: 'a', className: 'b', grade: 5, useSampleTimetable: true}).templates[1].length, 0, '다른 학년에는 예시 시간표를 넣지 않는다');
const filled = {...mine, days: [...mine.days, {date: '2026-07-22', kind: 'vacation' as const, name: '여름방학'}]};
assert.ok(hourStats(filled).schoolDays.year < hourStats(mine).schoolDays.year, '방학을 넣으면 수업일수가 준다');
assert.ok(hourStats(mine).warnings.some(text => text.includes('방학·재량휴업일')), '방학이 없으면 수업일수가 많다고 알린다');

// 저장 검사: 화면이 보낸 계획을 서버가 다시 확인한다.
assert.deepEqual(planInput(JSON.parse(JSON.stringify(mine))), mine, '시작 계획은 그대로 통과');
assert.equal(planInput({...SAMPLE_PLAN}).sample, false, '저장되는 계획은 예시 표시를 달 수 없다');
const bad = (patch: Record<string, unknown>, why: string) => assert.throws(() => planInput({...mine, ...patch}), PlanError, why);
bad({templates: {1: [{weekday: 1, period: 1, subject: 'kor'}, {weekday: 1, period: 1, subject: 'mat'}], 2: []}}, '같은 칸에 두 과목');
bad({templates: {1: [{weekday: 1, period: 1, subject: 'zzz'}], 2: []}}, '없는 교과');
bad({templates: {1: [{weekday: 6, period: 1, subject: 'kor'}], 2: []}}, '토요일 칸');
bad({templates: {1: [{weekday: 1, period: 9, subject: 'kor'}], 2: []}}, '하루 교시 수를 넘는 칸');
bad({semester2On: '2026-03-01'}, '학기 순서');
bad({days: [{date: '2025-12-01', kind: 'holiday', name: '밖'}]}, '학년도 밖 날짜');
bad({days: [{date: '2026-04-01', kind: 'holiday', name: 'a'}, {date: '2026-04-01', kind: 'off', name: 'b'}]}, '하루에 일정 둘');
bad({days: [{date: '2026-02-30', kind: 'holiday', name: '없는 날'}]}, '없는 날짜');
bad({className: ''}, '빈 학급 이름');
bad({subjects: mine.subjects.map(entry => entry.key === 'kor' ? {...entry, standard: {1: -1, 2: 0}} : entry)}, '음수 기준시수');
bad({subjects: [...mine.subjects, mine.subjects[0]]}, '같은 교과 두 번');

// 변경 요약: 무엇이 바뀌었는지 한 줄(재구성 내역의 연료).
const edited = {...setSlot(mine, 1, 1, 1, 'kor'), subjects: mine.subjects.map(entry => entry.key === 'kor' ? {...entry, standard: {1: 102, 2: 102}} : entry), days: filled.days};
assert.equal(changeSummary(mine, edited), '1학기 기초시간표 1칸 · 기준시수 1개 교과 · 학사일정 1건');
assert.equal(changeSummary(mine, mine), '', '바뀐 것이 없으면 기록하지 않는다');
assert.equal(changeSummary(mine, {...mine, className: '3학년 3반'}), '반 정보');

console.log('curriculum tests passed');
