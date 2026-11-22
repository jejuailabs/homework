import 'server-only';
import type {BearerContext, McpTool} from '@/modules/berry-connector/types';
import {BerryError} from '@/modules/berry-connector/policy';
import {FEATURES, STATUS_LABELS, sectionName, searchFeatures, tabOf, type Feature} from './features';
import {expand, hourStats, progressToDate, schoolWeekOf, shortDate, week, weekStartOf} from './engine';
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
  {name: 'find_schoolmaster_feature', scope: 'workspace:read', description: '스쿨마스터에서 쓰던 기능(예: 연간시수 자동맞추기, 주간학습 높이자동조정, 나이스 올리기)을 모두의 교실 교육과정 메뉴의 어디에서 하는지 찾습니다. 지금 되는지, 모두의 교실 다른 메뉴에 있는지, 몇 단계에 만들 예정인지와 메뉴 주소를 돌려줍니다.', inputSchema: {type: 'object', properties: {query: {type: 'string', minLength: 1, maxLength: 60, description: '기능 이름이나 하고 싶은 일'}}, required: ['query'], additionalProperties: false}},
  {name: 'get_curriculum_hours', scope: 'workspace:read', description: '연간 시수 통계표: 교과별 1·2학기 편성시수, 학교 기준시수, 증감과 수업일수, 기준과 어긋난 교과를 돌려줍니다. 계산은 서버가 하며 직접 더하거나 고치지 말고 그대로 전합니다.', inputSchema: {type: 'object', properties: {}, additionalProperties: false}},
  {name: 'get_curriculum_week', scope: 'workspace:read', description: '한 주(월~금)의 시간표와 교시별 교과·단원·차시, 행사·휴업일, 교과별 진도율을 돌려줍니다. 주간학습 안내와 "오늘 몇 교시 뭐야"에 씁니다.', inputSchema: {type: 'object', properties: {date: DATE}, additionalProperties: false}},
  {name: 'make_curriculum_file', scope: 'workspace:read', description: `엑셀 파일을 만들어 내려받기 링크를 돌려줍니다. kind: hours(${FILE_LABELS.hours}), progress(${FILE_LABELS.progress}, 1·2학기), weekly(${FILE_LABELS.weekly}, date가 있는 주). 자료를 바꾸지 않으므로 확인 카드 없이 바로 링크를 전합니다.`, inputSchema: {type: 'object', properties: {kind: {type: 'string', enum: [...FILE_KINDS]}, date: DATE}, required: ['kind'], additionalProperties: false}},
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
  id: `SM-${feature.id}`, schoolmaster: `${sectionName(feature.section)} > ${feature.name}`, where: `${tabOf(feature.tab).name} > ${sectionName(feature.section)}`,
  status: STATUS_LABELS[feature.status], phase: feature.status === 'planned' ? `${feature.phase}단계 예정` : null, what_teachers_get: feature.want, berry_tool: feature.berry, link: featureLink(feature),
});

export async function callCurriculumTool(name: string, args: Record<string, unknown>, ctx: BearerContext) {
  if (!await curriculumAvailableFor(ctx.uid, ctx.role)) throw new BerryError('교육과정 메뉴는 아직 열리지 않았어요.', 403, 'forbidden');
  const plan = await planFor(ctx.uid), base = {sample: plan.sample, note: plan.sample ? SAMPLE_NOTE : null, class: `${plan.year}학년도 ${plan.className}`};
  switch (name) {
    case 'find_schoolmaster_feature': {
      if (typeof args.query !== 'string' || !args.query.trim()) throw new BerryError('query를 주세요.');
      const found = searchFeatures(args.query.slice(0, 60), 6);
      return {query: args.query, found: found.map(featureView), total_features: FEATURES.length, hint: found.length ? null : '비슷한 말로 다시 찾거나 교육과정 메뉴 검색창(Ctrl+K)을 안내합니다.'};
    }
    case 'get_curriculum_hours': {
      const stats = hourStats(plan), compact = (row: typeof stats.total) => ({subject: row.name, planned: row.planned, standard: row.standard, diff: row.diff, out_of_range: row.outOfRange});
      return {...base, rows: stats.rows.map(compact), total: compact(stats.total), school_days: stats.schoolDays, days_required: stats.daysRequired, warnings: stats.warnings, link: '/teacher/curriculum?tab=curriculum&section=1.2.4', file: '/teacher/curriculum?download=hours'};
    }
    case 'get_curriculum_week': {
      const date = dateArg(args.date), sessions = expand(plan), days = week(plan, date, sessions);
      return {...base, week_of: shortDate(weekStartOf(date)),
        days: days.map(day => ({date: shortDate(day.date), event: day.note?.name ?? null, school: day.school, periods: day.cells.map(cell => `${cell.period} ${cell.name}${cell.unit ? ` ${cell.unit}${cell.lessons ? ` ${cell.lesson}/${cell.lessons}` : ''}` : ''}`)})),
        progress: progressToDate(plan, date, sessions).map(entry => ({subject: entry.name, done: entry.done, total: entry.total})),
        link: `/teacher/curriculum?tab=curriculum&section=1.2.9&date=${date}`, file: `/teacher/curriculum?download=weekly&date=${date}`};
    }
    case 'make_curriculum_file': {
      if (!(FILE_KINDS as readonly unknown[]).includes(args.kind)) throw new BerryError(`kind는 ${FILE_KINDS.join('·')} 중 하나예요.`);
      const kind = args.kind as FileKind, date = kind === 'weekly' ? dateArg(args.date) : undefined, file = buildFile(plan, kind, date);
      return {...base, file_name: file.name, kind: FILE_LABELS[kind], rows: file.rows, link: `/teacher/curriculum?download=${kind}${date ? `&date=${date}` : ''}`, how: '링크를 누르면 교육과정 메뉴가 열리면서 파일이 내려받아져요.'};
    }
  }
  throw new BerryError(`알 수 없는 도구예요: ${name}`, 404, 'not_found');
}
