import {WEEKDAYS, causes, expand, hourStats, progressBook, shortDate, week, weekStartOf, type HourRow, type Plan} from './engine';
import {RULE_SOURCE, UNVERIFIED, nationalChecks} from './rules';
import {buildXlsx, type Cell, type Sheet} from './xlsx';

/** 베리와 화면 버튼이 같은 파일을 만든다. 새 종류는 여기에만 더한다. */
export const FILE_KINDS = ['hours', 'check', 'progress', 'weekly'] as const;
export type FileKind = typeof FILE_KINDS[number];
export const FILE_LABELS: Record<FileKind, string> = {hours: '연간 시수 통계표', check: '수업시수 점검표', progress: '교과 진도표', weekly: '주간학습 안내'};

const diffCell = (value: number): Cell => ({value, style: value < 0 ? 'short' : value > 0 ? 'over' : 'even'});
const head = (...labels: string[]): Cell[] => labels.map(value => ({value, style: 'head'}));
const title = (plan: Plan, label: string): Cell[][] => [[{value: `${plan.year}학년도 ${plan.className} ${label}`, style: 'title'}], [{value: plan.sample ? '시험용 예시 학급 자료입니다. 실제 학교 자료가 아닙니다.' : `${plan.schoolName} · 모두의 교실에서 만든 파일`, style: 'note'}], []];

function hoursSheet(plan: Plan): Sheet {
  const stats = hourStats(plan), line = (entry: HourRow, total = false): Cell[] => {
    const plain = (value: number): Cell => total ? {value, style: 'total'} : value;
    const diff = (value: number): Cell => entry.hasStandard ? diffCell(value) : {value: '—', style: 'even'};
    return [total ? {value: entry.name, style: 'total'} : entry.name, plain(entry.planned[1]), plain(entry.standard[1]), diff(entry.diff[1]), plain(entry.planned[2]), plain(entry.standard[2]), diff(entry.diff[2]), plain(entry.planned.year), plain(entry.standard.year), diff(entry.diff.year)];
  };
  return {name: '연간시수', widths: [18, 10, 10, 8, 10, 10, 8, 10, 10, 8], rows: [
    ...title(plan, '연간 시수 통계표'),
    head('교과', '1학기 편성', '1학기 기준', '증감', '2학기 편성', '2학기 기준', '증감', '연간 편성', '연간 기준', '증감'),
    ...stats.rows.map(entry => line(entry)), line(stats.total, true), [],
    ['수업일수', `1학기 ${stats.schoolDays[1]}일 · 2학기 ${stats.schoolDays[2]}일 · 연간 ${stats.schoolDays.year}일 (기준 ${stats.daysRequired}일)`],
    ...(stats.warnings.length ? stats.warnings.map(text => ['확인할 것', text] as Cell[]) : [['확인할 것', '기준과 어긋난 교과가 없어요.'] as Cell[]]),
    [{value: '증감: 빨강은 기준보다 모자람, 파랑은 기준보다 많음.', style: 'note'}],
  ]};
}

/** 수업시수 점검표: 국가 규칙 판정 + 교과별로 시수가 바뀐 날(원인) + 아직 확인하지 못한 규칙. 교육청 점검·학년 협의용. */
function checkSheets(plan: Plan): Sheet[] {
  const stats = hourStats(plan), checks = nationalChecks(plan, stats), why = causes(plan);
  const verdict = {ok: '맞음', short: '모자람', over: '넘음', info: '참고'} as const;
  const judged: Sheet = {name: '규칙 점검', widths: [30, 10, 70], rows: [
    ...title(plan, '수업시수 점검표'), head('항목', '판정', '내용'),
    ...checks.map(check => [check.title, {value: verdict[check.verdict], style: check.verdict === 'short' ? 'short' : check.verdict === 'over' ? 'over' : 'even'}, check.detail] as Cell[]),
    [], [{value: `근거: ${RULE_SOURCE.title} (${RULE_SOURCE.via}, ${RULE_SOURCE.checkedOn} 확인)`, style: 'note'}],
    [{value: `아직 확인하지 못한 규칙(판정에 쓰지 않음): ${UNVERIFIED.join(', ')}`, style: 'note'}],
  ]};
  const traced: Sheet = {name: '시수 변동 원인', widths: [14, 12, 10, 30, 8], rows: [
    ...title(plan, '교과별 시수 변동 원인'), head('날짜', '교과', '종류', '이유', '증감'),
    ...plan.subjects.flatMap(subject => (why.get(subject.key) ?? []).map(cause => [shortDate(cause.date), subject.name, {holiday: '공휴일', off: '재량휴업', event: '행사 단축', override: '시간표 바꾸기'}[cause.kind], cause.name, diffCell(cause.delta)] as Cell[])),
  ]};
  return [judged, traced];
}

function progressSheets(plan: Plan): Sheet[] {
  const sessions = expand(plan);
  return ([1, 2] as const).map(semester => ({
    name: `${semester}학기 진도`, widths: [12, 6, 8, 18, 12, 8],
    rows: [...title(plan, `${semester}학기 교과 진도표`), head('날짜', '교시', '교과', '단원', '차시', '누계'),
      ...plan.subjects.flatMap(subject => progressBook(plan, subject.key, semester, sessions).map(item => ({item, name: subject.name})))
        .sort((a, b) => a.item.date.localeCompare(b.item.date) || a.item.period - b.item.period)
        .map(({item, name}) => [shortDate(item.date), item.period, name, item.unit ?? '', item.lessons ? `${item.lesson}/${item.lessons}` : '', item.seq] as Cell[])],
  }));
}

function weeklySheet(plan: Plan, date: string): Sheet {
  const days = week(plan, date), periods = Math.max(plan.periodsPerDay, ...days.flatMap(day => day.cells.map(cell => cell.period)));
  const label = (day: typeof days[number]) => `${WEEKDAYS[day.weekday]} ${+day.date.slice(5, 7)}/${+day.date.slice(8, 10)}`;
  const rows: Cell[][] = [...title(plan, `주간학습 안내 (${shortDate(weekStartOf(date))} 주)`), head('교시', ...days.map(label))];
  rows.push(['행사', ...days.map(day => day.note ? day.note.name : '')]);
  for (let period = 1; period <= periods; period++) {
    rows.push([`${period}교시`, ...days.map(day => {
      if (!day.school) return period === 1 ? (day.note?.name ?? '수업 없음') : '';
      const cell = day.cells.find(entry => entry.period === period);
      return cell ? `${cell.name}${cell.unit ? `\n${cell.unit}${cell.lessons ? ` ${cell.lesson}/${cell.lessons}` : ''}` : ''}` : '';
    })]);
  }
  return {name: '주간학습', widths: [8, 20, 20, 20, 20, 20], rows};
}

export function fileName(plan: Plan, kind: FileKind, date?: string) {
  const suffix = kind === 'weekly' && date ? `_${weekStartOf(date)}` : '';
  return `${plan.year}_${plan.className.replace(/\s+/g, '')}_${FILE_LABELS[kind].replace(/\s+/g, '')}${suffix}${plan.sample ? '_예시' : ''}.xlsx`;
}

/** kind에 맞는 엑셀 바이트. weekly는 date가 있는 주(없으면 학년도 첫 주). */
export function buildFile(plan: Plan, kind: FileKind, date?: string) {
  const sheets = kind === 'hours' ? [hoursSheet(plan)] : kind === 'check' ? checkSheets(plan) : kind === 'progress' ? progressSheets(plan) : [weeklySheet(plan, date ?? plan.startsOn)];
  return {name: fileName(plan, kind, date), bytes: buildXlsx(sheets), rows: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)};
}
