import type {Feature} from './features';

/**
 * 베리에게 맡기기 전에 보여 주는 계획. 버튼을 누르면 바로 보내지 않고 "이렇게 진행할게요"를 먼저 보여 주고,
 * 선생님이 확인하면 그때 베리 창에 문장을 보낸다(영문도 모르고 기다리지 않게).
 * 단계 설명은 실제 베리 도구가 하는 일과 맞춘다(berry-tools.ts). 도구가 바뀌면 여기도 고친다.
 */
export type BerryTask = {
  key: string; title: string; prompt: string;
  /** 베리가 하는 순서(사람 말로). */
  steps: string[];
  /** 끝나면 받는 것. */
  result: string;
  /** 자료가 바뀌는지. */
  changes: string;
  /** 보내기 전에 선생님이 채울 칸이 있으면 안내. */
  needsInput?: string;
};

/** 베리 한 번 대답의 최대 시간(베리 두뇌 TURN_TIME_LIMIT_MS = 45초). */
export const BERRY_MAX_SECONDS = 45;

const READ_ONLY = '자료는 바뀌지 않아요.';
export const BERRY_TASKS: BerryTask[] = [
  {
    key: 'check-hours', title: '수업시수 점검',
    prompt: '우리 반 수업시수를 점검해 줘. 학교 기준과 국가 기준으로 맞는지 보고, 어긋난 교과는 날짜별 원인과 맞추는 방법까지 알려줘.',
    steps: ['우리 반 시수표를 계산해 읽어요', '학교 기준시수와 국가 기준(확인된 기준만)으로 비교해요', '어긋난 교과마다 시수가 빠진 날짜(공휴일·행사 등)를 찾아요', '맞추는 방법을 날짜·교시로 제안해요'],
    result: '점검 요약과 수업시수 센터 바로가기', changes: '아무것도 저장하지 않아요. 제안을 넣을지는 조절판에서 선생님이 정해요.',
  },
  {
    key: 'short', title: '모자란 시수 교과 찾기', prompt: '기준보다 모자라거나 넘친 교과와 그 이유를 알려줘.',
    steps: ['교과별 편성 시수와 기준시수를 비교해요', '어긋난 교과의 날짜별 원인을 찾아요', '교과마다 한 줄로 정리해요'], result: '교과별 증감과 원인', changes: READ_ONLY,
  },
  {
    key: 'hours-file', title: '시수표 엑셀 만들기', prompt: '우리 반 연간 시수 통계표를 엑셀로 만들어줘.',
    steps: ['교과별 1·2학기 편성·기준·증감을 계산해요', '엑셀 파일을 만들어요', '내려받기 링크를 드려요'], result: '엑셀 내려받기 링크', changes: READ_ONLY,
  },
  {
    key: 'check-file', title: '수업시수 점검표 엑셀', prompt: '수업시수 점검표를 엑셀로 만들어줘.',
    steps: ['국가 기준으로 판정해요', '교과별 시수가 바뀐 날짜를 모두 모아요', '두 시트짜리 엑셀을 만들어 링크를 드려요'], result: '점검표 내려받기 링크', changes: READ_ONLY,
  },
  {
    key: 'week', title: '이번 주 주간학습', prompt: '이번 주 주간학습 보여줘.',
    steps: ['이번 주 요일·교시별 과목과 단원을 읽어요', '행사·휴업일을 표시해요', '교과별 진도율을 함께 정리해요'], result: '요약과 주간학습 화면 바로가기', changes: READ_ONLY,
  },
  {
    key: 'find', title: '기능 위치 찾기', prompt: '[하고 싶은 일]은 교육과정 메뉴 어디에서 해?',
    steps: ['기능 지도에서 하고 싶은 일과 맞는 기능을 찾아요', '지금 되는지, 언제 만들 예정인지 확인해요', '메뉴 바로가기를 드려요'],
    result: '메뉴 위치와 바로가기', changes: READ_ONLY, needsInput: '베리 창에서 [하고 싶은 일]을 채워 보내 주세요.',
  },
];
export const taskOf = (key: string) => BERRY_TASKS.find(task => task.key === key)!;

const TOOL_STEPS: Record<string, string> = {
  get_curriculum_hours: '우리 반 시수표를 계산해 읽어요',
  get_curriculum_week: '이번 주 시간표와 진도를 읽어요',
  make_curriculum_file: '엑셀 파일을 만들어 내려받기 링크를 준비해요',
  find_curriculum_feature: '기능 지도에서 위치를 찾아요',
};
/** 기능 카드의 [베리] 버튼: 그 기능을 맡는 도구에 맞춘 계획. */
export function featureTask(feature: Pick<Feature, 'id' | 'want' | 'berry'>): BerryTask {
  return {
    key: `feature-${feature.id}`, title: feature.want, prompt: `${feature.want} — 베리가 해 줘`,
    steps: ['교육과정 메뉴를 열어요', TOOL_STEPS[feature.berry ?? ''] ?? '필요한 자료를 읽어요', '결과를 정리하고 화면 바로가기를 드려요'],
    result: '정리한 답과 바로가기', changes: '읽기만 해요. 자료를 바꾸는 일이면 저장 전에 확인 카드를 따로 보여 드려요.',
  };
}
