import type {HourStats, Plan} from './engine';

/**
 * 국가 수업시수 규칙(2022 개정 교육과정 총론 시간 배당 기준, 교육부 고시 제2022-33호).
 * 확인한 출처: 경기도교육청 「초등학교 2022 개정 교육과정 학교자율시간 과목 및 활동 개설 예시자료」 p.10·30,
 * 「초등 학교자율시간 이해와 실제 안내자료」 p.24 (2026-11-22 확인). 확인한 것만 판정에 쓴다.
 * 1~2학년군 시수, 안전교육·범교과 의무 시수는 아직 원문을 확인하지 못해 여기에 없다(화면에 "확인 필요"로만 보인다).
 * 지역 지침이 다르면 이 표를 덮어쓰는 규칙(curriculumRules)을 나중에 붙인다. 코드가 아니라 표를 바꾼다.
 */
export type RuleGroup = 'kor' | 'socEth' | 'mat' | 'sciPrc' | 'pe' | 'arts' | 'eng' | 'cre';
export type BandRule = {group: RuleGroup; name: string; band: number; noDecrease?: boolean};
export const RULE_SOURCE = {
  title: '2022 개정 교육과정 총론 시간 배당 기준(교육부 고시 제2022-33호)',
  via: '경기도교육청 학교자율시간 예시자료 p.30',
  url: 'https://www.goe.go.kr/resource/goe/na/bbs_2675/2025/10/d57c08a1-82ff-4dfc-850a-300808142bc4.pdf',
  checkedOn: '2026-11-22',
};
export const RATIO = 0.2;
/** 학년군(2년) 기준 수업 시수. */
export const BAND_RULES: Record<'3-4' | '5-6', BandRule[]> = {
  '3-4': [
    {group: 'kor', name: '국어', band: 408}, {group: 'socEth', name: '사회/도덕', band: 272}, {group: 'mat', name: '수학', band: 272},
    {group: 'sciPrc', name: '과학/실과', band: 204}, {group: 'pe', name: '체육', band: 204, noDecrease: true}, {group: 'arts', name: '예술(음악/미술)', band: 272, noDecrease: true},
    {group: 'eng', name: '영어', band: 136}, {group: 'cre', name: '창의적 체험활동', band: 204},
  ],
  '5-6': [
    {group: 'kor', name: '국어', band: 408}, {group: 'socEth', name: '사회/도덕', band: 272}, {group: 'mat', name: '수학', band: 272},
    {group: 'sciPrc', name: '과학/실과', band: 340}, {group: 'pe', name: '체육', band: 204, noDecrease: true}, {group: 'arts', name: '예술(음악/미술)', band: 272, noDecrease: true},
    {group: 'eng', name: '영어', band: 204}, {group: 'cre', name: '창의적 체험활동', band: 204},
  ],
};
/** 학교자율시간: 학기별 1주(학년 총 수업 시수 ÷ 34), 한 학기에 모아 운영(1·2학기 나눠 운영 불가). 나이스 최소 시수. */
export const AUTONOMY_MIN: Record<'3-4' | '5-6', number> = {'3-4': 29, '5-6': 32};
export const DAYS_REQUIRED = 190;

const GROUP_OF: Record<string, RuleGroup> = {kor: 'kor', soc: 'socEth', eth: 'socEth', mat: 'mat', sci: 'sciPrc', prc: 'sciPrc', pe: 'pe', mus: 'arts', art: 'arts', eng: 'eng', cre: 'cre'};
const NAME_GROUP: [RegExp, RuleGroup][] = [[/국어/, 'kor'], [/사회|도덕/, 'socEth'], [/수학/, 'mat'], [/과학|실과/, 'sciPrc'], [/체육/, 'pe'], [/음악|미술|예술/, 'arts'], [/영어/, 'eng'], [/창의적|창체/, 'cre']];
export const groupOf = (key: string, name: string): RuleGroup | null => GROUP_OF[key] ?? NAME_GROUP.find(([pattern]) => pattern.test(name))?.[1] ?? null;
export const isAutonomy = (key: string, name: string) => key.startsWith('auto') || /학교자율/.test(name);
export const bandOf = (grade: number): '3-4' | '5-6' | null => grade >= 3 && grade <= 4 ? '3-4' : grade >= 5 ? '5-6' : null;

export type Verdict = 'ok' | 'short' | 'over' | 'info';
export type RuleCheck = {id: string; title: string; verdict: Verdict; detail: string; planned?: number; min?: number; max?: number};

/**
 * 국가 규칙으로 한 해 계획을 본다. 학년군 기준은 2년 합계라서 한 해만으로는 확정할 수 없다:
 * 한 해 몫(÷2)과 그 ±20%를 "참고 범위"로 보여 주고, 벗어나면 "다른 학년과 합쳐 확인"으로 알린다(단정하지 않는다).
 */
export function nationalChecks(plan: Plan, stats: HourStats): RuleCheck[] {
  const band = bandOf(plan.grade), out: RuleCheck[] = [];
  out.push(stats.schoolDays.year >= DAYS_REQUIRED
    ? {id: 'days', title: '수업일수', verdict: 'ok', detail: `${stats.schoolDays.year}일 · 기준 ${DAYS_REQUIRED}일 이상`, planned: stats.schoolDays.year, min: DAYS_REQUIRED}
    : {id: 'days', title: '수업일수', verdict: 'short', detail: `${stats.schoolDays.year}일 · 기준 ${DAYS_REQUIRED}일보다 ${DAYS_REQUIRED - stats.schoolDays.year}일 모자람`, planned: stats.schoolDays.year, min: DAYS_REQUIRED});
  if (!band) {
    out.push({id: 'band', title: '1~2학년군 교과 시수', verdict: 'info', detail: '1~2학년군 시간 배당은 아직 원문을 확인하지 못했어요. 학교 기준시수로만 비교해요.'});
    return out;
  }
  const totals = new Map<RuleGroup, number>();
  for (const row of stats.rows) {
    const subject = plan.subjects.find(entry => entry.key === row.subject);
    const group = subject && !isAutonomy(subject.key, subject.name) ? groupOf(subject.key, subject.name) : null;
    if (group) totals.set(group, (totals.get(group) ?? 0) + row.planned.year);
  }
  for (const rule of BAND_RULES[band]) {
    const planned = totals.get(rule.group) ?? 0, half = rule.band / 2, spread = Math.floor(rule.band * RATIO) / 2;
    const min = rule.noDecrease ? half : half - spread, max = half + spread;
    const range = `${Math.ceil(min)}~${Math.floor(max)}`;
    const verdict: Verdict = planned < min ? 'short' : planned > max ? 'over' : 'ok';
    const detail = verdict === 'ok' ? `올해 ${planned}시간 · 한 해 몫 ${half} (참고 범위 ${range})`
      : rule.noDecrease && verdict === 'short' ? `올해 ${planned}시간 · ${rule.name}은(는) 기준보다 줄일 수 없어요. 한 해 몫 ${half}에 ${Math.ceil(half - planned)}시간 모자람(다른 학년과 합쳐 확인)`
      : `올해 ${planned}시간 · 참고 범위 ${range} ${verdict === 'short' ? '아래' : '위'} (학년군 2년 합계로 다시 확인)`;
    out.push({id: `band-${rule.group}`, title: `${rule.name} (${band}학년군 ${rule.band}시간)`, verdict, detail, planned, min, max});
  }
  const autonomy = plan.subjects.filter(subject => isAutonomy(subject.key, subject.name));
  if (autonomy.length) {
    const rows = stats.rows.filter(row => autonomy.some(subject => subject.key === row.subject));
    const first = rows.reduce((sum, row) => sum + row.planned[1], 0), second = rows.reduce((sum, row) => sum + row.planned[2], 0), need = AUTONOMY_MIN[band];
    const split = first > 0 && second > 0, enough = Math.max(first, second) >= need;
    out.push({id: 'autonomy', title: '학교자율시간', verdict: split ? 'over' : enough ? 'ok' : 'short',
      detail: split ? `1학기 ${first} · 2학기 ${second}: 한 학기에 모아 운영해야 해요(나눠 운영 불가)` : `${first ? '1' : '2'}학기 ${Math.max(first, second)}시간 · 최소 ${need}시간`, planned: Math.max(first, second), min: need});
  } else {
    out.push({id: 'autonomy', title: '학교자율시간', verdict: 'info', detail: `편제에 학교자율시간이 없어요. 운영한다면 한 학기에 ${AUTONOMY_MIN[band]}시간 이상 모아서 편성해요.`});
  }
  return out;
}

/** 아직 확인하지 못한 규칙: 판정하지 않고 목록으로만 알린다. */
export const UNVERIFIED = [
  '1~2학년군 교과별 시간 배당',
  '학교안전교육(7대 안전) 의무 시수',
  '범교과 학습 주제별 의무 시수(성교육·흡연예방 등)',
  '시·도교육청 편성·운영 지침의 지역 기준',
];
