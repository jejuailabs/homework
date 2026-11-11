import {createHash} from 'node:crypto';

/**
 * The core classification table ("핵심 분류표") Berry works from, shaped as a tree so it never has to read all of it:
 *
 *   root   one short line per menu plus the few rules that hold everywhere. Read on every question.
 *   menu   that menu's notes (`guide`) and tools. Read only when Berry opens the menu.
 *   tool   the tool's own description and input schema, attached when its menu opens.
 *
 * So a new feature inside a menu changes that menu's guide or a tool description, never the root; the root grows by one
 * line only when a whole new menu appears. `catalogBudget` and the tests hold each level to a fixed size. A menu whose
 * guide outgrows its budget is split into two menus (a sub-menu), not allowed to swell.
 * `words` are what teachers call the menu: Berry's brain opens a menu ahead of the model when the question says one.
 */
export type CatalogDomain = {
  key: string; menu: string; what: string; guide: string[]; metrics: string[]; tools: string[];
  sensitivity: string; cost: 'light' | 'medium' | 'heavy'; words: string[]; flag?: string;
};
export type CatalogTool = {name: string; description: string; scope: string | readonly string[]};
export const ROOT_BUDGET = 2_500, GUIDE_BUDGET = 1_500, RULE_LIMIT = 8, WHAT_LIMIT = 60;

export const DOMAINS: CatalogDomain[] = [
  {key: 'overview', menu: '홈', what: '모든 메뉴의 지금 숫자(대기·마감·용량·진행 중)', guide: ['get_signals 하나로 학급별 미제출·검사 대기·마감 지남·다시 하기, 전시·보드 승인 대기, 저장 공간 단계, 퀴즈 범위 설정, 진행 중 말놀이터 방, Kids Daily 공유 수, 오늘 일정 수를 숫자로 읽는다. 자세한 내용은 해당 메뉴를 연다.'], metrics: ['missing', 'waiting_review', 'overdue_missing', 'pending_artworks', 'pending_posts', 'storage.percent'], tools: ['get_signals'], sensitivity: '숫자만', cost: 'light', words: ['어때', '급한', '챙길', '현황', '요약', '브리핑']},
  {key: 'classes', menu: '숙제 > 학급·명단', what: '학급과 학생 명단', guide: ['학급 이름·학년·학년도·학생 수와 번호순 명단을 읽는다. 학급 만들기·고치기는 manage_class.'], metrics: ['students'], tools: ['manage_class', 'list_classes', 'get_roster'], sensitivity: '학생은 "학생 07" 가명, 실명은 names 권한일 때만', cost: 'light', words: ['학급', '명단']},
  {key: 'homework', menu: '숙제', what: '숙제방 열기·고치기, 제출·미제출, 검사, 마감', guide: [
    '숙제 목록·제출 방식(글·사진·영상·녹음)·마감·연동, 제출·검사·다시 하기 집계, 미제출 학생, 검사 대기를 읽는다. 학생은 검사 전까지 제출을 고치거나 지울 수 있고, 지운 제출은 미제출로 집계된다.',
    '숙제 고치기(제목·설명·마감·제출 방식·전시실/보드 연동)는 manage_homework edit로 하고 화면으로 돌려보내지 않는다. 제출이 있어 제출 방식을 못 바꾸면 같은 내용의 새 숙제방을 제안한다.',
    '전시실·보드 연동을 켜면 같은 이름의 방이 열리고 제출물이 자동으로 올라간다. 글·녹음 숙제는 전시실 연동이 안 된다. 첨부 자료 파일은 숙제 화면에서 올린다.',
  ], metrics: ['submitted', 'missing', 'waiting_review', 'overdue'], tools: ['manage_homework', 'list_assignments', 'get_missing_submissions', 'get_review_queue', 'list_deadlines', 'create_assignment'], sensitivity: '가명. 제출물 글·사진·영상 본문은 읽지 않음', cost: 'medium', words: ['숙제', '과제', '제출', '검사', '안 낸']},
  {key: 'exhibitions', menu: '작품전시', what: '3D 전시실, 작품 승인, QR 공개, 보관함', guide: [
    '전시실 상태(준비·열림·마감), 작품 수·승인 대기, QR 공개 여부, 주제 해시태그·연 날짜·직접 올림/숙제 연동을 읽는다. 지난 전시는 보관함에서 태그·기간으로 찾는다(search_exhibitions).',
    '도슨트 녹음, 작품과 함께 올리는 소리 파일(mp3·m4a·wav·ogg), 작품 이미지·음성 감상은 화면에서 한다.',
  ], metrics: ['pending_artworks', 'artworks', 'qr_open'], tools: ['manage_exhibition', 'list_exhibitions', 'search_exhibitions', 'get_moderation_queue', 'approve_artworks', 'create_exhibition'], sensitivity: '가명. 작품 이미지·음성은 화면에서만', cost: 'light', words: ['전시', '작품', '도슨트']},
  {key: 'boards', menu: '참여보드', what: '글·사진·영상 카드 보드, 승인, 댓글·반응', guide: ['보드 상태·게시물·참여자 수, 승인 대기 게시물, 숙제 연동 여부를 읽는다.'], metrics: ['pending_posts', 'posts', 'participants'], tools: ['manage_board', 'list_boards', 'get_moderation_queue', 'approve_posts', 'create_board'], sensitivity: '가명. 위치 정보·첨부 원본 제외', cost: 'light', words: ['보드', '게시물', '게시글']},
  {key: 'quiz', menu: 'Quiz', what: '매일 영어·수학·복습 퀴즈와 주간 기록', guide: ['오늘·내일 범위 설정 여부, 학생별 오늘 완료, 이번 주 맞힌 문제 수를 읽는다. 범위·학년은 manage_quiz.'], metrics: ['quiz_today_set', 'quiz_tomorrow_set', 'completed_all_today'], tools: ['manage_quiz', 'get_quiz_status'], sensitivity: '가명, 모두의 교실 기록 그대로', cost: 'medium', words: ['퀴즈']},
  {key: 'lesson_review', menu: '복습하기', what: '수업 복습 문제 발행과 참여', guide: ['복습 목록(초안·발행·숨김)과 발행 복습별 참여 학생 수를 읽는다. AI 초안은 화면에서 수업 사진 10장·PDF 1개로 만든다. 발행은 publish_review.'], metrics: ['review_drafts', 'joined'], tools: ['manage_review', 'get_review_status', 'publish_review'], sensitivity: '가명', cost: 'medium', words: ['복습']},
  {key: 'playground', menu: '말놀이터', what: '낱말·맞춤법 놀이, 대결, 실시간 방', guide: ['켜짐 여부·설정, 이번 주 혼자하기·대결·꾸준함 순위, 진행 중 방을 읽는다.'], metrics: ['live_rooms', 'rankings'], tools: ['manage_playground', 'get_playground_status'], sensitivity: '가명, 순위는 모두의 교실 기록 그대로', cost: 'medium', words: ['말놀이터', '낱말', '맞춤법'], flag: 'playground'},
  {key: 'points', menu: '보말', what: '학급 포인트(보말) 적립·사용', guide: ['학급 보말 설정과 학생별 잔액·누적 적립을 읽는다. 주기·빼기·설정은 manage_points.'], metrics: ['total_balance'], tools: ['manage_points', 'get_points'], sensitivity: '가명', cost: 'light', words: ['보말', '포인트']},
  {key: 'cards', menu: '카드놀이', what: '단어·문장 카드 세트 만들기·배부·진도·테스트', guide: [
    '읽는 것: 배부한 세트·마감·학습할 날·대상 수·옮겨 온 반, 필수 학습량·목표 점수·예상 분, 진도, 안 끝낸 학생 가명·지각 수, 많이 틀린 단어, 평균 숙련도, 차시 메모·순서, 동료 공유 수, 안 읽은 쪽지 수, 스피킹 켜짐·녹음 학생 수.',
    '세트를 보관함에 넣으면 그 세트로 배부한 것도 학생 목록·복습에서 숨겨진다(기록은 유지, 복구하면 다시 보임). 베리는 세트 만들기(create_set·create_review_set)·배부·멈춤·재개·진도 읽기만 한다. 고치기·기본 어휘, 인쇄, 팀전·반대항전(열린 팀전 다시 가기·끝내기 포함, 선생님당 반마다 6개까지 동시에)·교실 화면·지명 퀴즈, 설정 수정, 학습 기본값, 차시 메모·순서·학습 일정, 반 옮기기(이월)·클래스 복제, 동료 공유, 쪽지는 선생님이 화면에서 한다.',
    '배부 때 말하지 않은 값은 우리 반 학습 기본값(없으면 앱 값), 선택 학습은 count 0. format·time_limit_seconds·after_due(마감 있을 때만)도 정한다. 숙련도·복습은 학생 몫, 반 평균·남은 학생 수만 읽는다. 목록은 선생님 순서(order), 숨긴 줄·메모 포함.',
    '기본 어휘 3,000개 그림은 그림 묶음 연결이 완료된 경우에만 표시된다. 단어와 선택한 뜻이 맞으면 학습·목록에 자동 표시하며 그림 보기로 끌 수 있다. 연결 준비 중·문장·연습문제·뜻 불일치는 글자만 표시한다. 고르기·쓰기·복습은 답 확인 뒤, 시험에는 그림 힌트를 추가하지 않는다. 그림 표시는 기기 설정이라 베리가 변경하거나 저장하지 않는다.',
    '복습 게임은 학생 혼자 한다. 학부모 링크·카드 보말 켜기는 선생님 몫. game_players·parent_links·bomal_given·speaking은 수뿐, 순위·이름 없음. 스피킹 켜기와 녹음 듣기는 리포트 화면에서. 게임 점수·보말은 성적과 별개.',
  ], metrics: ['card_sets', 'unfinished', 'late', 'goal_reached', 'average_best_score', 'most_missed', 'average_mastery', 'minutes'], tools: ['manage_cards', 'list_card_sets', 'find_base_vocab'], sensitivity: '가명. 학생 답안 원문 제외', cost: 'medium', words: ['카드', '단어', '어휘', '세트'], flag: 'cards'},
  {key: 'tools', menu: 'Tools', what: '캔버스·투표·말하기 기록 등 수업 도구', guide: ['열린 캔버스, 투표(마감·참여 수), 말하기·읽기 기록(get_speech)을 읽는다. 투표 열기·닫기 등은 manage_class_tools.'], metrics: ['polls_open'], tools: ['manage_class_tools', 'list_class_tools', 'get_speech'], sensitivity: '가명, 개별 투표 선택 제외', cost: 'light', words: ['투표', '캔버스', '말하기']},
  {key: 'dictionary', menu: 'Tools > 국어사전', what: '국어사전(기초·표준) 3단계 해설·읽어주기', guide: [
    '연결 상태, 정확히/포함 검색, 뜻·품사·원어·출처, 초급·중급·고급 해설이 있다는 안내만 읽는다.',
    '검색·Google 음성은 화면에서 선생님이 실행한다. 기기 단어장·최근 검색어는 볼 수 없다. 표준국어대사전 낱말에 임의 난이도를 붙이지 않는다.',
  ], metrics: ['configured', 'available'], tools: ['get_dictionary_info'], sensitivity: '기기 단어장·검색 기록 제외. 검색·음성 실행 불가', cost: 'light', words: ['사전'], flag: 'dictionary'},
  {key: 'neighborhood', menu: 'Tools > 우리 동네 탐험', what: '우리 동네 탐험: 저장한 사회 수업 자료', guide: [
    '학교 둘레 지도에서 고른 수업 장소(최대 12곳), 약도·백지도, 수업 브리핑을 묶어 저장한 자료다. 제목·지역·학년·단원·연결 학급·저장한 날, 고른 장소(이름·종류·설명·교사 확인), AI 약도 제목·큰길, 지도 출처·기준일·참고 자료를 읽는다.',
    '읽기만 한다. 지도 불러오기·장소 고르기·약도 만들기·인쇄는 그 도구 화면에서 하도록 안내한다.',
  ], metrics: ['count', 'selected_places'], tools: ['list_neighborhood_packs', 'get_neighborhood_pack'], sensitivity: '선생님 자료, 학생 정보 없음. 좌표·도로 원본은 내보내지 않음', cost: 'light', words: ['동네', '탐험', '약도']},
  {key: 'kids_daily', menu: 'Kids Daily', what: '학생이 선생님께 공유한 일기(건수만)', guide: ['본문·사진은 절대 보지 않는다. 받은 공유 건수만 홈의 get_signals로 읽는다.'], metrics: ['kids_daily_shared'], tools: [], sensitivity: '본문·사진은 절대 보지 않음, 건수만(get_signals)', cost: 'light', words: ['일기', 'Kids Daily', '키즈 데일리'], flag: 'kids_daily'},
  {key: 'storage', menu: '홈 > 저장 공간', what: '선생님 저장 공간 용량', guide: ['전체·사용·남은 용량, 항목별(숙제 영상·사진·전시·자료·보드·업무), 경고 단계, 이용 기간 종료일을 읽는다.'], metrics: ['percent', 'level', 'days_left'], tools: ['get_storage'], sensitivity: '없음', cost: 'light', words: ['저장 공간', '용량']},
  {key: 'workspace', menu: '마이페이지 > 업무 공간', what: '일정·시간표·수업 일지·업무 폴더', guide: ['일정(숙제 마감 포함), 주간 시간표, 날짜별 수업 일지, 폴더 항목(메모·체크리스트·링크)을 읽는다. 새로 넣기는 add_*, 고치기·지우기는 manage_workspace.'], metrics: ['today_events'], tools: ['manage_workspace', 'get_calendar', 'get_timetable', 'get_lesson_log', 'search_workspace', 'get_work_item', 'add_calendar_event', 'add_lesson_log', 'add_work_item'], sensitivity: '민감 항목 제외, 이름 가명화', cost: 'medium', words: ['일정', '시간표', '수업 일지', '업무'], flag: 'workspace'},
  {key: 'notebook', menu: '마이페이지 > 교무수첩', what: '학생 관찰 기록(교무수첩)', guide: ['날짜·학생·분류별 관찰 기록을 찾고(search_notebook) 남긴다(add_notebook_entry). 민감 기록은 본문이 돌아오지 않는다.'], metrics: ['entries'], tools: ['search_notebook', 'add_notebook_entry'], sensitivity: '상담·건강·가정 기록은 절대 나가지 않음', cost: 'medium', words: ['교무수첩', '관찰'], flag: 'notebook'},
  {key: 'confirm', menu: '(저장 확인)', what: '미리보기 카드를 선생님이 확인한 뒤 저장', guide: [], metrics: [], tools: ['confirm_write'], sensitivity: '-', cost: 'light', words: []},
];

/** Rules that hold in every menu. Anything about one menu belongs in that menu's guide, not here. */
export const CATALOG_RULES = [
  '먼저 메뉴를 고르고, 그 메뉴의 도구만 불러 학급·기간을 좁혀 정확히 읽는다.',
  '"지금 어때/급한 거/이번 주 챙길 것"은 홈의 get_signals 숫자로 시작하고 필요한 메뉴만 상세로 읽는다.',
  '학생은 "학생 07" 같은 가명으로만 다룬다. 비밀 일기 본문, 학생 사진·영상·음성 원본, 위치, 상담·건강·가정 기록은 볼 수 없다고 안내한다.',
  '점수·순위는 모두의 교실에 있는 기록을 그대로 전한다. 베리가 새로 평가하거나 매기지 않는다.',
  '쓰기 도구는 미리보기 카드만 만든다. 선생님이 카드에서 저장해야 반영된다. 지우기·빼기·코드 재발급처럼 위험한 일은 빨간 카드로 두 번 눌러야 한다고 미리 알린다.',
  '선생님이 시키는 메뉴 일(설정 바꾸기·검사·숨기기·보말·배부·투표·일정 고치기 등)은 그 메뉴의 manage_* 도구를 쓴다. 한 문장에 여러 설정이면 한 번의 호출에 함께 넣는다. 대상 id는 먼저 읽기 도구로 확인하고, 비슷한 이름이 여럿이면 되묻는다.',
  '도구에 없는 일(파일 올리기, 실시간 진행, 인쇄 등)만 그 메뉴 화면에서 하도록 안내한다. 도구로 할 수 있는 일은 화면으로 돌려보내지 않는다.',
  '항목이나 메뉴를 말할 때는 도구 결과의 link를, 없으면 그 메뉴의 주소를 [이름](주소) 그대로 넣는다. 채팅창에서 누르면 바로 열리는 버튼이 된다. /teacher로 시작하는 주소만 쓰고 지어내지 않는다. 굵게(**) 같은 꾸밈 기호는 쓰지 않는다.',
];

/** Where each menu opens; it travels on the menu's root line. Tools add item links (one homework, one room) on top of these. */
export const MENU_LINKS: Partial<Record<string, string>> = {overview: '/teacher', classes: '/teacher/homework', homework: '/teacher/homework', exhibitions: '/teacher/exhibitions', boards: '/teacher/boards', quiz: '/teacher/daily-quiz', lesson_review: '/teacher/lesson-review', playground: '/teacher/playground', points: '/teacher/points', cards: '/teacher/cards', tools: '/teacher/tools', dictionary: '/teacher/tools/dictionary', neighborhood: '/teacher/tools/neighborhood', kids_daily: '/teacher/diary', storage: '/teacher', workspace: '/teacher/me/workspace', notebook: '/teacher/me/notebook'};

/** Builds the tree from the domain list and the live tool registry; unknown tools land in "기타" so nothing is ever missing. */
export function buildCatalog(tools: CatalogTool[], enabled: Record<string, unknown>) {
  const known = new Set(tools.map(tool => tool.name)), placed = new Set<string>();
  const domains = DOMAINS.map(domain => {
    const present = domain.tools.filter(name => known.has(name));
    present.forEach(name => placed.add(name));
    return {key: domain.key, menu: domain.menu, what: domain.what, guide: domain.guide, metrics: domain.metrics, tools: present, sensitivity: domain.sensitivity, cost: domain.cost, words: domain.words, link: MENU_LINKS[domain.key] ?? null, enabled: domain.flag ? enabled[domain.flag] !== false : true};
  }).filter(domain => domain.tools.length || domain.key === 'kids_daily');
  const rest = tools.filter(tool => !placed.has(tool.name));
  if (rest.length) domains.push({key: 'other', menu: '기타', what: '분류표에 아직 자리가 없는 새 도구', guide: [], metrics: [], tools: rest.map(tool => tool.name), sensitivity: '도구 설명을 따른다', cost: 'medium', words: [], link: null, enabled: true});
  const domainOf = new Map(domains.flatMap(domain => domain.tools.map(name => [name, domain.key] as const)));
  // Tool rows only place a tool in its menu. What a tool does is its own description, which arrives when the menu opens.
  const toolRows = tools.map(tool => ({name: tool.name, domain: domainOf.get(tool.name) ?? 'other', scope: tool.scope}));
  const body = {tree: true as const, domains, tools: toolRows, rules: [...CATALOG_RULES]};
  return {version: createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16), ...body};
}

/**
 * How many characters each level costs Berry, counted the way the brain writes it: the root is read on every question,
 * a guide only when its menu opens.
 */
export function catalogBudget(catalog: Pick<ReturnType<typeof buildCatalog>, 'domains' | 'rules'>) {
  const shown = catalog.domains.filter(domain => domain.key !== 'confirm');
  const root = [...shown.map(domain => `- ${domain.key} | ${domain.menu}${domain.link ? ` | ${domain.link}` : ''}: ${domain.what}`), ...catalog.rules.map(rule => `- ${rule}`)].join('\n').length;
  const guides = Object.fromEntries(shown.map(domain => [domain.key, [`${domain.what} | 지표 ${domain.metrics.join(', ')} | 민감도 ${domain.sensitivity} | 비용 ${domain.cost}`, ...domain.guide.map(line => `- ${line}`), `도구: ${domain.tools.join(', ')}`].join('\n').length]));
  return {root, guides};
}

/**
 * The same tree, flattened for a client that still reads the whole table at once (Berry's brain before it learned to
 * walk the tree, and any other connector that does not ask for `tree`). Menu guides travel as rules, one per menu, and
 * menu links as one rule line, which is how such a client always received them. Nothing is added here by hand: it is
 * derived, so the tree stays the only place to edit. Remove once no client reads the flat form.
 */
export function flatCatalog(tree: ReturnType<typeof buildCatalog>, tools: CatalogTool[]) {
  const guides = tree.domains.flatMap(domain => {
    // One rule per menu; a long guide is split so each rule stays readable (older clients cap a rule at 800 characters).
    const parts: string[] = [];
    for (const line of domain.guide) {
      if (parts.length && parts.at(-1)!.length + line.length < 700) parts[parts.length - 1] += ` ${line}`;
      else parts.push(`${domain.menu}: ${line}`);
    }
    return parts;
  });
  const menuLinks = `메뉴 바로가기: ${tree.domains.filter(domain => domain.link && domain.enabled).map(domain => `${domain.menu} ${domain.link}`).join(', ')}`;
  const body = {
    domains: tree.domains.map(({key, menu, what, metrics, tools: names, sensitivity, cost, enabled}) => ({key, menu, what, holds: [], metrics, tools: names, sensitivity, cost, questions: [], enabled})),
    tools: tree.tools.map(row => ({...row, summary: (tools.find(tool => tool.name === row.name)?.description ?? '').split(/(?<=[.다요])\s/)[0].slice(0, 160)})),
    rules: [...tree.rules, ...guides, menuLinks],
  };
  return {version: createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16), ...body};
}
