/** Metadata only: Berry never searches the dictionary, reads browser storage or generates speech here. */
export function dictionaryInfo(config: {configured: boolean; disabled: boolean}) {
  return {
    link: '/teacher/tools/dictionary',
    provider: '국립국어원 한국어기초사전(기본)·표준국어대사전(깊이)',
    configured: config.configured,
    available: config.configured && !config.disabled,
    search_modes: ['exact', 'include'],
    grade_filter: ['초급', '중급', '고급'],
    explanation_levels: ['아주 쉽게(AI가 사전 뜻을 쉽게 풀이)', '보통(기초사전)', '깊이(표준국어대사전)'],
    result_fields: ['낱말', '뜻풀이', '품사', '난이도', '예문', '원어(제공되는 경우)', '공식 원문 링크'],
    difficulty: '한국어기초사전의 초급·중급·고급은 한국어 숙달도이며 초등 학년이 아니에요. 기초사전에 없는 낱말은 표준국어대사전에서 찾고 등급이 없어요.',
    browser_only: ['단어장', '최근 검색어'],
    read_aloud: {device: '기기 음성(무료)', provider: 'AI 나레이션은 공용 Google 음성 API', trigger: '선생님이 스피커 버튼을 누를 때만', berry_can_start: false},
    note: '이 도구는 사용 안내와 연결 상태만 읽어요. 검색·읽어주기는 선생님이 화면에서 하며, 베리는 단어장·최근 검색어를 읽거나 변경하지 않아요.',
  };
}
