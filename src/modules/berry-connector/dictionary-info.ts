/** Metadata only: Berry never searches the dictionary, reads browser storage or generates speech here. */
export function dictionaryInfo(config: {configured: boolean; disabled: boolean}) {
  return {
    link: '/teacher/tools/dictionary',
    provider: '국립국어원 표준국어대사전',
    configured: config.configured,
    available: config.configured && !config.disabled,
    search_modes: ['exact', 'include'],
    result_fields: ['낱말', '뜻풀이', '품사', '원어(제공되는 경우)', '공식 원문 링크'],
    difficulty: '표준국어대사전은 공식 낱말 난이도를 제공하지 않아요. 한국어기초사전의 초급·중급·고급은 한국어 숙달도이며 초등 학년이 아니에요.',
    browser_only: ['단어장', '최근 검색어'],
    read_aloud: {provider: '공용 Google 음성 API', trigger: '선생님이 스피커 버튼을 누를 때만', berry_can_start: false},
    note: '이 도구는 사용 안내와 연결 상태만 읽어요. 검색·읽어주기는 선생님이 화면에서 하며, 베리는 단어장·최근 검색어를 읽거나 변경하지 않아요.',
  };
}
