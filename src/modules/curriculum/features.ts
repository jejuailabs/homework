import {FEATURE_ROWS} from './feature-rows';

/**
 * 스쿨마스터 화면 구조를 그대로 따른다: 큰 탭 4개(교육과정-주간학습 / 평가-반편성 / 수업도우미 / 자료관리)와
 * 탭 안의 "작성 흐름도"(담당자 → 담임·전담 → 출력). 메뉴 이름은 스쿨마스터 사용설명서의 절 이름을 쓴다.
 */
export type TabKey = 'curriculum' | 'assessment' | 'helper' | 'data';
/** live = 지금 이 화면에서 동작 · elsewhere = 모두의 교실의 다른 메뉴에 이미 있음 · planned = 단계별로 만들 예정 */
export type FeatureStatus = 'live' | 'elsewhere' | 'planned';
export type Phase = 1 | 2 | 3 | 4;

export type Tab = {key: TabKey; no: string; name: string; short: string; summary: string};
export type Step = {key: string; tab: TabKey; no: number; name: string; who: string; sections: string[]};
export type Section = {key: string; name: string; tab: TabKey; step: string; page?: string};
export type Feature = {
  id: string; section: string; name: string; want: string; limit: string; ours: string;
  tab: TabKey; step: string; phase: Phase; core: boolean; status: FeatureStatus; decisive: boolean; extension: boolean; policyRisk: boolean;
  /** 지금 베리가 처리할 수 있으면 그 도구 이름. */
  berry: string | null;
  /** status가 elsewhere이면 그 메뉴 주소. */
  link: string | null;
};

export const TABS: Tab[] = [
  {key: 'curriculum', no: '1', name: '교육과정·주간학습', short: '교육과정', summary: '시수 편성부터 시간표·진도표, 주간학습 안내까지'},
  {key: 'assessment', no: '2', name: '평가·반편성', short: '평가', summary: '학급명부, 수행·지필·단원평가, 교과·종합의견, 반편성'},
  {key: 'helper', no: '3', name: '수업도우미', short: '수업도우미', summary: '발표자 뽑기, 자리 정하기, 타이머'},
  {key: 'data', no: '4', name: '자료관리·설정', short: '자료관리', summary: '백업·타임머신, 자료 가져오기, 학교 등록'},
];

export const STEPS: Step[] = [
  {key: 'school', tab: 'curriculum', no: 1, name: '학교 기준 정하기', who: '교육과정 담당자', sections: ['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10']},
  {key: 'class', tab: 'curriculum', no: 2, name: '우리 반 시간표·진도', who: '담임·전담', sections: ['1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.11', '1.2.12']},
  {key: 'print', tab: 'curriculum', no: 3, name: '안내장·문서 출력', who: '담임·전담', sections: ['1.2.9', '1.2.10']},
  {key: 'roster', tab: 'assessment', no: 1, name: '학급명부', who: '담임·전담', sections: ['2.1']},
  {key: 'record', tab: 'assessment', no: 2, name: '평가 기록', who: '담임·전담', sections: ['2.2', '2.3', '2.4']},
  {key: 'comment', tab: 'assessment', no: 3, name: '의견·나이스', who: '담임·전담', sections: ['2.5']},
  {key: 'class-time', tab: 'helper', no: 1, name: '수업 시간에', who: '담임·전담', sections: ['3.1', '3.2', '3.3']},
  {key: 'keep', tab: 'data', no: 1, name: '자료 보관', who: '모든 선생님', sections: ['4.1', '4.2', '4.3', '4.4', '4.5', '4.6']},
  {key: 'join', tab: 'data', no: 2, name: '학교 등록', who: '교육과정 담당자', sections: ['5.1']},
  {key: 'common', tab: 'data', no: 3, name: '어디서나 공통', who: '모든 선생님', sections: ['X']},
];

const SECTION_NAMES: Record<string, string> = {
  '1.1.1': '환경설정', '1.1.2': '특별실-전담 배정', '1.1.3': '학급현황설정', '1.1.4': '시수편제', '1.1.5': '학사일정-휴업일', '1.1.6': '행사설정',
  '1.1.7': '월간행사', '1.1.8': '학교공유진도표', '1.1.9': '교육과정자료공유', '1.1.10': '교육과정종합점검',
  '1.2.1': '교육과정자료공유', '1.2.2': '학년행사설정', '1.2.3': '기초시간표', '1.2.4': '연간시간표', '1.2.5': '교과진도표', '1.2.6': '창체진도표',
  '1.2.7': '교과주제통합', '1.2.8': '교육과정 자동완성 마법사', '1.2.9': '주간학습안내', '1.2.10': '교육과정편집', '1.2.11': '주제어별 편집', '1.2.12': '학교자율시간 설정',
  '2.1': '학급명부', '2.2': '수행평가', '2.3': '지필평가 기록', '2.4': '단원평가 기록', '2.5': '교과-종합의견',
  '3.1': '발표자 뽑기', '3.2': '자리정하기', '3.3': '타이머',
  '4.1': '파일 불러오기', '4.2': '파일로 저장', '4.3': '백업·복원', '4.4': '자료공유', '4.5': '데이터 초기화', '4.6': '타임머신',
  '5.1': '사용신청·학교등록', X: '스쿨마스터 전체에 걸친 특성',
};

/** 화면이 이미 있는 절: 메뉴에서 누르면 그 화면이 열린다. */
export const SECTION_PAGES: Record<string, string> = {'1.1.3': 'info', '1.1.4': 'hours', '1.1.5': 'calendar', '1.2.3': 'template', '1.2.4': 'hours', '1.2.5': 'progress', '1.2.9': 'weekly'};

export const SECTIONS: Section[] = STEPS.flatMap(step => step.sections.map(key => ({key, name: SECTION_NAMES[key], tab: step.tab, step: step.key, page: SECTION_PAGES[key]})));

/** 각 탭 맨 위에 카드로 먼저 보이는 핵심 기능. 설계도 1-8-1 우선순위(P0·P1)와 전환 결정타(★)에서 골랐다. */
export const CORE_IDS = new Set([
  '1.1.4-03', '1.1.5-03', '1.2.3-01', '1.2.4-01', '1.2.4-09', '1.2.5-01', '1.2.5-10', '1.2.6-01', '1.2.8-01', '1.2.9-01', '1.2.9-15',
  '2.1-01', '2.2-01', '2.3-02', '2.3-11', '2.4-01', '2.5-01', '2.5-05',
  '3.1-01', '3.2-01', '3.3-01',
  '4.1-01', '4.2-01', '4.6-01', 'X-14',
]);

/** 지금 이 화면에서 동작하는 기능과, 그 일을 베리가 맡는 도구. */
export const LIVE: Record<string, string | null> = {
  '1.1.4-03': 'get_curriculum_hours', '1.1.5-02': null, '1.1.5-03': 'get_curriculum_hours', '1.1.5-04': null, '1.2.3-01': 'get_curriculum_week', '1.2.3-02': null, '1.2.3-03': null, '1.2.4-01': 'get_curriculum_hours',
  '1.2.4-09': 'get_curriculum_hours', '1.2.5-01': 'make_curriculum_file', '1.2.9-01': 'get_curriculum_week',
  'X-01': null, 'X-11': 'find_schoolmaster_feature', 'X-14': 'find_schoolmaster_feature', 'X-15': null,
};
/** 모두의 교실에 이미 있는 기능: 그 메뉴로 보낸다. */
export const ELSEWHERE: Record<string, string> = {
  '3.1-01': '/teacher/tools/draw', '3.1-02': '/teacher/tools/draw', '3.2-01': '/teacher/tools/seats', '3.2-02': '/teacher/tools/seats',
  '3.2-05': '/teacher/tools/seats', '3.3-01': '/teacher/tools/timer', '3.3-02': '/teacher/tools/timer', 'X-12': '/teacher/exhibitions',
};

/** 설계도 4-4 로드맵: 어느 단계에서 만드는가. */
export function phaseOf(id: string): Phase {
  const section = id.replace(/-\w+$/, '');
  const p4 = ['1.2.7', '1.2.11', '1.2.12', '1.1.10', '3.1', '3.2', '3.3'];
  if (p4.includes(section) || ['1.2.5-14', '1.2.5-15', '1.2.10-01', '1.2.10-02', 'X-04', 'X-08'].includes(id)) return 4;
  if (['1.1.1', '1.1.2', '1.2.1', '1.2.2', '4.3', '4.6', '5.1'].includes(section) || ['X-12', 'X-13'].includes(id)) return 3;
  if (['2.2', '2.3', '2.4', '2.5', '1.2.8'].includes(section) || ['1.2.6-08', 'X-02', 'X-03', 'X-05'].includes(id)) return 2;
  return 1;
}

export const FEATURES: Feature[] = FEATURE_ROWS.map(([id, name, want, limit, ours, marks]) => {
  const section = id.startsWith('X-') ? 'X' : id.replace(/-\w+$/, ''), meta = SECTIONS.find(entry => entry.key === section);
  if (!meta) throw new Error(`절이 없는 기능: ${id}`);
  const status: FeatureStatus = id in LIVE ? 'live' : id in ELSEWHERE ? 'elsewhere' : 'planned';
  return {
    id, section, name, want, limit, ours, tab: meta.tab, step: meta.step, phase: phaseOf(id), core: CORE_IDS.has(id), status,
    decisive: marks.includes('s'), extension: marks.includes('e'), policyRisk: marks.includes('r'),
    berry: status === 'live' ? LIVE[id] : null, link: ELSEWHERE[id] ?? null,
  };
});

export const STATUS_LABELS: Record<FeatureStatus, string> = {live: '지금 사용', elsewhere: '모두의 교실에 있음', planned: '준비 중'};

/** 공백·대소문자를 무시하고 이름·결과물·대체 설명에서 찾는다. 이름에 맞으면 먼저. */
export function searchFeatures(query: string, limit = 20): Feature[] {
  const words = query.toLowerCase().split(/\s+/).map(word => word.trim()).filter(Boolean);
  if (!words.length) return [];
  const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '');
  return FEATURES.map(feature => {
    const name = squash(`${SECTION_NAMES[feature.section]} ${feature.name}`), rest = squash(`${feature.want} ${feature.ours} ${feature.id}`);
    let score = 0;
    for (const word of words.map(squash)) {
      if (name.includes(word)) score += 3; else if (rest.includes(word)) score += 1; else return {feature, score: -1};
    }
    return {feature, score: score + (feature.core ? 1 : 0)};
  }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(entry => entry.feature);
}

export const sectionName = (key: string) => SECTION_NAMES[key] ?? key;
export const tabOf = (key: TabKey) => TABS.find(tab => tab.key === key)!;
