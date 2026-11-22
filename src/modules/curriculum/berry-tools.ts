import 'server-only';
import type {BearerContext, McpTool} from '@/modules/berry-connector/types';
import {BerryError} from '@/modules/berry-connector/policy';
import {FEATURES, STATUS_LABELS, sectionName, searchFeatures, tabOf, type Feature} from './features';
import {causes, expand, hourStats, progressToDate, schoolWeekOf, semesterOf, shortDate, suggestAdjust, week, weekStartOf} from './engine';
import {RULE_SOURCE, UNVERIFIED, nationalChecks} from './rules';
import {listSources} from './server';
import {FILE_KINDS, FILE_LABELS, buildFile, type FileKind} from './files';
import {curriculumAvailableFor, planFor} from './server';

/**
 * 교육과정 메뉴의 베리 도구. 숫자는 모두 서버 계산기(engine.ts)가 내고 베리는 전달만 한다.
 * 결과는 요약으로 짧게(베리 두뇌는 도구 결과를 6,000자에서 자른다), 큰 표는 파일 링크로 준다.
 * 지금은 시험용 예시 학급이라 모든 응답에 sample: true와 안내문을 붙인다.
 */
const DATE = {type: 'string', description: 'YYYY-MM-DD (Asia/Seoul). 비우면 이번 주(토·일이면 다음 주).'};
const SAMPLE_NOTE = '지금은 시험용 예시 학급(예시초등학교 3학년 4반) 자료예요. 선생님 반의 실제 자료가 아니라고 함께 말해 주세요.';
export const CURRICULUM_TOOLS: McpTool[] = [
  {name: 'find_curriculum_feature', scope: 'workspace:read', description: '교육과정 메뉴 기능 지도에서 하고 싶은 일(예: 연간시수 맞추기, 주간학습 한 장 맞춤, 나이스 올리기)이 어디 있는지 찾습니다. 지금 되는지, 모두의 교실 다른 메뉴에 있는지, 몇 단계에 만들 예정인지와 메뉴 주소를 돌려줍니다. 선생님이 다른 프로그램 이름을 말해도 그 이름을 되풀이하지 말고 하려는 일로 답합니다.', inputSchema: {type: 'object', properties: {query: {type: 'string', minLength: 1, maxLength: 60, description: '기능 이름이나 하고 싶은 일'}}, required: ['query'], additionalProperties: false}},
  {name: 'get_curriculum_hours', scope: 'workspace:read', description: '연간 시수 통계표: 교과별 1·2학기 편성시수, 학교 기준시수, 증감과 수업일수, 기준과 어긋난 교과를 돌려줍니다. 기준시수를 아직 넣지 않은 교과는 standard·diff가 null이며 비교하지 말고 "기준시수를 넣어 주세요"라고 안내합니다. 계산은 서버가 하며 직접 더하거나 고치지 말고 그대로 전합니다.', inputSchema: {type: 'object', properties: {}, additionalProperties: false}},
  {name: 'get_curriculum_week', scope: 'workspace:read', description: '한 주(월~금)의 시간표와 교시별 교과·단원·차시, 행사·휴업일, 교과별 진도율을 돌려줍니다. 주간학습 안내와 "오늘 몇 교시 뭐야"에 씁니다.', inputSchema: {type: 'object', properties: {date: DATE}, additionalProperties: false}},
  {name: 'suggest_hours_fix', scope: 'workspace:read', description: '교과 시수를 기준에 맞추는 방법을 날짜·교시 단위로 제안합니다(저장하지 않음). subject를 비우면 그 학기에 가장 어긋난 교과. amount는 늘릴 시간(+) 또는 줄일 시간(-), 비우면 어긋난 만큼. 기준보다 남는 교과에서만 가져오고 모자란 교과에만 줍니다. 적용은 선생님이 수업시수 센터 조절판에서 합니다.', inputSchema: {type: 'object', properties: {subject: {type: 'string', maxLength: 20, description: '교과 이름(예: 국어)'}, semester: {type: 'integer', enum: [1, 2]}, amount: {type: 'integer', minimum: -20, maximum: 20}}, additionalProperties: false}},
  {name: 'make_curriculum_file', scope: 'workspace:read', description: `엑셀 파일을 만들어 내려받기 링크를 돌려줍니다. kind: hours(${FILE_LABELS.hours}), check(${FILE_LABELS.check}: 국가 기준 판정과 날짜별 원인), progress(${FILE_LABELS.progress}, 1·2학기), weekly(${FILE_LABELS.weekly}, date가 있는 주). 자료를 바꾸지 않으므로 확인 카드 없이 바로 링크를 전합니다.`, inputSchema: {type: 'object', properties: {kind: {type: 'string', enum: [...FILE_KINDS]}, date: DATE}, required: ['kind'], additionalProperties: false}},
];
export const CURRICULUM_TOOL_NAMES = new Set(CURRICULUM_TOOLS.map(tool => tool.name));

const seoulToday = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
function dateArg(value: unknown) {
  if (value === undefined || value === '') return schoolWeekOf(seoulToday());
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new BerryError('date는 YYYY-MM-DD로 주세요.');
  return value;
}
const featureLink = (feature: Feature) => feature.link ?? `/teacher/curriculum?tab=${feature.tab}&section=${encodeURIComponent(feature.section)}`;
const featureView = (feature: Feature) => ({
  id: feature.id, feature: `${sectionName(feature.section)} > ${feature.name}`, where: `${tabOf(feature.tab).name} > ${sectionName(feature.section)}`,
  status: STATUS_LABELS[feature.status], phase: feature.status === 'planned' ? `${feature.phase}단계 예정` : null, what_teachers_get: feature.want, berry_tool: feature.berry, link: featureLink(feature),
});

export async function callCurriculumTool(name: string, args: Record<string, unknown>, ctx: BearerContext) {
  if (!await curriculumAvailableFor(ctx.uid, ctx.role)) throw new BerryError('교육과정 메뉴는 아직 열리지 않았어요.', 403, 'forbidden');
  const plan = await planFor(ctx.uid), base = {sample: plan.sample, note: plan.sample ? SAMPLE_NOTE : null, class: `${plan.year}학년도 ${plan.className}`};
  switch (name) {
    case 'find_curriculum_feature': {
      if (typeof args.query !== 'string' || !args.query.trim()) throw new BerryError('query를 주세요.');
      const found = searchFeatures(args.query.slice(0, 60), 6);
      return {query: args.query, found: found.map(featureView), total_features: FEATURES.length, hint: found.length ? null : '비슷한 말로 다시 찾거나 교육과정 메뉴의 [기능 지도](Ctrl+K)를 안내합니다.'};
    }
    case 'get_curriculum_hours': {
      const stats = hourStats(plan), compact = (row: typeof stats.total) => ({subject: row.name, planned: row.planned, standard: row.hasStandard ? row.standard : null, diff: row.hasStandard ? row.diff : null, out_of_range: row.outOfRange});
      const why = causes(plan), checks = nationalChecks(plan, stats);
      const reasons = stats.rows.filter(row => row.hasStandard && row.diff.year !== 0).map(row => ({subject: row.name, diff: row.diff.year, causes: (why.get(row.subject) ?? []).slice(0, 6).map(cause => `${shortDate(cause.date)} ${cause.name} ${cause.delta > 0 ? '+' : ''}${cause.delta}`)}));
      const sources = plan.sample ? [] : (await listSources(ctx.uid)).map(source => ({name: source.name, role: source.role, status: source.status}));
      return {...base, rows: stats.rows.map(compact), total: compact(stats.total), school_days: stats.schoolDays, days_required: stats.daysRequired, warnings: stats.warnings,
        national: checks.map(check => ({title: check.title, verdict: check.verdict, detail: check.detail})), national_source: `${RULE_SOURCE.title} (${RULE_SOURCE.via})`, not_checked: UNVERIFIED,
        reasons, sources, link: '/teacher/curriculum?tab=hours', file: '/teacher/curriculum?download=hours', check_file: '/teacher/curriculum?download=check'};
    }
    case 'get_curriculum_week': {
      const date = dateArg(args.date), sessions = expand(plan), days = week(plan, date, sessions);
      return {...base, week_of: shortDate(weekStartOf(date)),
        days: days.map(day => ({date: shortDate(day.date), event: day.note?.name ?? null, school: day.school, periods: day.cells.map(cell => `${cell.period} ${cell.name}${cell.unit ? ` ${cell.unit}${cell.lessons ? ` ${cell.lesson}/${cell.lessons}` : ''}` : ''}`)})),
        progress: progressToDate(plan, date, sessions).map(entry => ({subject: entry.name, done: entry.done, total: entry.total})),
        link: `/teacher/curriculum?tab=curriculum&section=1.2.9&date=${date}`, file: `/teacher/curriculum?download=weekly&date=${date}`};
    }
    case 'suggest_hours_fix': {
      const today = seoulToday(), semester = args.semester === 1 || args.semester === 2 ? args.semester : semesterOf(plan, today < plan.startsOn ? plan.startsOn : today);
      const stats = hourStats(plan), asked = typeof args.subject === 'string' ? args.subject.trim() : '', wanted = asked ? plan.subjects.find(subject => subject.name === asked || subject.name.startsWith(asked)) : null;
      if (asked && !wanted) throw new BerryError(`'${asked}' 교과를 찾지 못했어요. 교과: ${plan.subjects.map(subject => subject.name).join(', ')}`);
      const row = wanted ? stats.rows.find(entry => entry.subject === wanted.key)! : [...stats.rows].filter(entry => entry.hasStandard).sort((a, b) => Math.abs(b.diff[semester]) - Math.abs(a.diff[semester]))[0];
      if (!row || !row.hasStandard) return {...base, semester, proposal: [], message: '기준시수가 없어 맞출 기준이 없어요. 수업시수 센터에서 편제표를 올리거나 기준시수를 넣어 주세요.', link: '/teacher/curriculum?tab=hours'};
      const amount = typeof args.amount === 'number' && args.amount !== 0 ? Math.max(-20, Math.min(20, Math.trunc(args.amount))) : -row.diff[semester];
      if (!amount) return {...base, semester, subject: row.name, proposal: [], message: `${semester}학기 ${row.name}은(는) 기준과 같아요.`, link: '/teacher/curriculum?tab=hours'};
      const from = today > plan.startsOn ? today : plan.startsOn, changes = suggestAdjust(plan, row.subject, amount, from, semester);
      const nameOf = (key: string | null) => key ? plan.subjects.find(subject => subject.key === key)?.name ?? key : '비움';
      const was = (date: string, period: number) => expand(plan).find(session => session.date === date && session.period === period)?.subject ?? null;
      return {...base, semester, subject: row.name, diff_now: row.diff[semester], asked: amount, proposal: changes.map(change => `${shortDate(change.date)} ${change.period}교시 ${nameOf(was(change.date, change.period))} → ${nameOf(change.subject)}`),
        complete: changes.length === Math.abs(amount), saved: false, how: '저장하지 않았어요. 수업시수 센터 조절판에서 같은 교과·시간을 고르면 이 제안이 나오고 [이대로 적용]으로 넣어요.', link: '/teacher/curriculum?tab=hours'};
    }
    case 'make_curriculum_file': {
      if (!(FILE_KINDS as readonly unknown[]).includes(args.kind)) throw new BerryError(`kind는 ${FILE_KINDS.join('·')} 중 하나예요.`);
      const kind = args.kind as FileKind, date = kind === 'weekly' ? dateArg(args.date) : undefined, file = buildFile(plan, kind, date);
      return {...base, file_name: file.name, kind: FILE_LABELS[kind], rows: file.rows, link: `/teacher/curriculum?download=${kind}${date ? `&date=${date}` : ''}`, how: '링크를 누르면 교육과정 메뉴가 열리면서 파일이 내려받아져요.'};
    }
  }
  throw new BerryError(`알 수 없는 도구예요: ${name}`, 404, 'not_found');
}
