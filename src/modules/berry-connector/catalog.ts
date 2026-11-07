import {createHash} from 'node:crypto';

/**
 * The core classification table ("핵심 분류표") Berry plans from: every ourclass menu, what it holds, the numbers that
 * matter, which tools read it, how sensitive it is and how heavy it is to read. Clients keep it and load only the tools
 * a question needs. It is built from this list plus the live tool registry, so a new tool always appears (under its
 * declared domain, or "기타" if none) and the version hash changes whenever menus, tools or switches change.
 */
export type CatalogDomain = {
  key: string; menu: string; what: string; holds: string[]; metrics: string[]; tools: string[];
  sensitivity: string; cost: 'light' | 'medium' | 'heavy'; questions: string[]; flag?: string;
};
export type CatalogTool = {name: string; description: string; scope: string | readonly string[]};

export const DOMAINS: CatalogDomain[] = [
  {key: 'overview', menu: '홈', what: '모든 메뉴의 지금 숫자(대기·마감·용량·진행 중)', holds: ['학급별 미제출·검사 대기·마감 지남·다시 하기', '전시·보드 승인 대기', '저장 공간 단계', '퀴즈 범위 설정', '진행 중 말놀이터 방', '받은 Kids Daily 공유 수', '오늘 일정 수'], metrics: ['missing', 'waiting_review', 'overdue_missing', 'pending_artworks', 'pending_posts', 'storage.percent'], tools: ['get_signals'], sensitivity: '숫자만', cost: 'light', questions: ['지금 우리 반 어때?', '이번 주 내가 챙길 거 뭐야?']},
  {key: 'classes', menu: '숙제 > 학급·명단', what: '학급과 학생 명단', holds: ['학급 이름·학년·학년도·학생 수', '번호순 명단'], metrics: ['students'], tools: ['manage_class', 'list_classes', 'get_roster'], sensitivity: '학생은 "학생 07" 가명, 실명은 names 권한일 때만', cost: 'light', questions: ['우리 반 몇 명이야?', '3번 학생 누구야?']},
  {key: 'homework', menu: '숙제', what: '숙제방, 제출, 학생의 제출 수정·삭제(검사 전까지, 삭제한 제출은 미제출로 집계), 검사, 마감, 전시실·보드 자동 연동', holds: ['숙제 목록·제출 방식·마감', '제출·검사·다시 하기 집계', '미제출 학생(학생이 지운 제출 포함)', '검사 대기(학생이 고친 제출 포함)'], metrics: ['submitted', 'missing', 'waiting_review', 'overdue'], tools: ['manage_homework', 'list_assignments', 'get_missing_submissions', 'get_review_queue', 'list_deadlines', 'create_assignment'], sensitivity: '가명. 제출물 글·사진·영상 본문은 읽지 않음', cost: 'medium', questions: ['어제 숙제 안 낸 사람?', '검사 안 한 거 몇 개야?', '사진 숙제 내 줘']},
  {key: 'exhibitions', menu: '작품전시', what: '3D 전시실, 작품 승인, 감상, 도슨트 녹음, QR 공개, 보관함(태그·기간 검색)', holds: ['전시실 상태(준비·열림·마감)', '작품 수·승인 대기', 'QR 공개 여부', '주제 해시태그·연 날짜·직접 올림/숙제 연동'], metrics: ['pending_artworks', 'artworks', 'qr_open'], tools: ['manage_exhibition', 'list_exhibitions', 'search_exhibitions', 'get_moderation_queue', 'approve_artworks', 'create_exhibition'], sensitivity: '가명. 작품 이미지·음성은 화면에서만', cost: 'light', questions: ['승인할 작품 있어?', '대기 작품 다 승인해 줘', '4월쯤 봄 주제 전시 모아 줘']},
  {key: 'boards', menu: '참여보드', what: '글·사진·영상 카드 보드, 댓글, 반응', holds: ['보드 상태·게시물·참여자 수', '승인 대기 게시물', '숙제 연동 여부'], metrics: ['pending_posts', 'posts', 'participants'], tools: ['manage_board', 'list_boards', 'get_moderation_queue', 'approve_posts', 'create_board'], sensitivity: '가명. 위치 정보·첨부 원본 제외', cost: 'light', questions: ['보드에 새로 올라온 거?', '승인 기다리는 게시물', '보드 하나 열어 줘']},
  {key: 'quiz', menu: 'Quiz', what: '매일 영어·수학·복습 퀴즈와 주간 기록', holds: ['오늘·내일 범위 설정 여부', '학생별 오늘 완료', '이번 주 맞힌 문제 수'], metrics: ['quiz_today_set', 'quiz_tomorrow_set', 'completed_all_today'], tools: ['manage_quiz', 'get_quiz_status'], sensitivity: '가명, 모두의 교실 기록 그대로', cost: 'medium', questions: ['내일 퀴즈 범위 정했어?', '오늘 퀴즈 안 한 사람']},
  {key: 'lesson_review', menu: '복습하기', what: '수업 복습 문제 발행과 참여', holds: ['복습 목록(초안·발행·숨김)', '발행 복습별 참여 학생 수'], metrics: ['review_drafts', 'joined'], tools: ['manage_review', 'get_review_status', 'publish_review'], sensitivity: '가명', cost: 'medium', questions: ['복습 초안 남은 거?', '어제 복습 몇 명 했어?', '복습 발행해 줘']},
  {key: 'playground', menu: '말놀이터', what: '낱말·맞춤법 놀이, 대결, 실시간 방', holds: ['켜짐 여부·설정', '이번 주 혼자하기·대결·꾸준함 순위', '진행 중 방'], metrics: ['live_rooms', 'rankings'], tools: ['manage_playground', 'get_playground_status'], sensitivity: '가명, 순위는 모두의 교실 기록 그대로', cost: 'medium', questions: ['말놀이터 요즘 어때?', '지금 열린 방 있어?'], flag: 'playground'},
  {key: 'points', menu: '보말', what: '학급 포인트 적립·사용', holds: ['학급 보말 설정', '학생별 잔액·누적 적립'], metrics: ['total_balance'], tools: ['manage_points', 'get_points'], sensitivity: '가명', cost: 'light', questions: ['보말 제일 많이 모은 사람', '보말 쓰고 있어?']},
  {key: 'cards', menu: '카드놀이', what: '단어·문장·연습문제: 세트 배부·학습(끊어읽기)·테스트·팀전', holds: ['배부한 세트·마감·학습할 날·대상 수·옮겨 온 반', '필수 학습량·목표 점수·예상 분', '최근 세트의 진도', '안 끝낸 학생 가명', '지각 학생 수', '많이 틀린 단어', '평균 숙련도', '차시 메모·순서', '동료 공유 수'], metrics: ['card_sets', 'unfinished', 'late', 'goal_reached', 'average_best_score', 'most_missed', 'average_mastery', 'minutes'], tools: ['manage_cards', 'list_card_sets'], sensitivity: '가명. 학생 답안 원문 제외', cost: 'medium', questions: ['배부한 카드 세트 뭐 있어?', '단어 세트 안 끝낸 학생 누구야?', '이번 세트에서 많이 틀린 단어 뭐야?'], flag: 'cards'},
  {key: 'tools', menu: 'Tools', what: '캔버스·투표·수업 보고서 등 수업 도구', holds: ['열린 캔버스', '투표(마감·참여 수)'], metrics: ['polls_open'], tools: ['manage_class_tools', 'list_class_tools', 'get_speech'], sensitivity: '가명, 개별 투표 선택 제외', cost: 'light', questions: ['열려 있는 투표 있어?']},
  {key: 'neighborhood', menu: 'Tools > 우리 동네 탐험', what: '학교 둘레 지도에서 고른 수업 장소, 약도·백지도, 수업 브리핑을 묶어 저장한 사회 수업 자료', holds: ['자료 제목·지역·학년·단원·연결 학급·저장한 날', '고른 장소(이름·종류·설명·교사 확인, 최대 12곳)', 'AI 약도 제목·큰길', '지도 출처·기준일·참고 자료'], metrics: ['count', 'selected_places'], tools: ['list_neighborhood_packs', 'get_neighborhood_pack'], sensitivity: '선생님 자료, 학생 정보 없음. 좌표·도로 원본은 내보내지 않음', cost: 'light', questions: ['지난달 만든 동네 탐험 자료 뭐 있어?', '그 자료에 고른 장소 알려 줘', '약도 출처 어디야?']},
  {key: 'kids_daily', menu: 'Kids Daily', what: '학생이 선생님께 공유한 일기', holds: ['받은 공유 건수'], metrics: ['kids_daily_shared'], tools: [], sensitivity: '본문·사진은 절대 보지 않음, 건수만(get_signals)', cost: 'light', questions: ['일기 공유 온 거 있어?'], flag: 'kids_daily'},
  {key: 'storage', menu: '홈 > 저장 공간', what: '선생님 저장 공간', holds: ['전체·사용·남은 용량', '항목별(숙제 영상·사진·전시·자료·보드·업무)', '경고 단계', '이용 기간 종료일'], metrics: ['percent', 'level', 'days_left'], tools: ['get_storage'], sensitivity: '없음', cost: 'light', questions: ['저장 공간 얼마 남았어?', '왜 이렇게 찼어?']},
  {key: 'workspace', menu: '마이페이지 > 업무 공간', what: '일정·시간표·수업 일지·업무 폴더', holds: ['일정(숙제 마감 포함)', '주간 시간표', '날짜별 수업 일지', '폴더 항목(메모·체크리스트·링크)'], metrics: ['today_events'], tools: ['manage_workspace', 'get_calendar', 'get_timetable', 'get_lesson_log', 'search_workspace', 'get_work_item', 'add_calendar_event', 'add_lesson_log', 'add_work_item'], sensitivity: '민감 항목 제외, 이름 가명화', cost: 'medium', questions: ['오늘 일정', '내일 시간표', '수업 일지 써 줘'], flag: 'workspace'},
  {key: 'notebook', menu: '마이페이지 > 교무수첩', what: '학생 관찰 기록', holds: ['날짜·학생·분류별 기록(민감 제외)'], metrics: ['entries'], tools: ['search_notebook', 'add_notebook_entry'], sensitivity: '상담·건강·가정 기록은 절대 나가지 않음', cost: 'medium', questions: ['이번 달 민준이 기록', '관찰 기록 남겨 줘'], flag: 'notebook'},
  {key: 'confirm', menu: '(저장 확인)', what: '미리보기 카드를 선생님이 확인한 뒤 저장', holds: [], metrics: [], tools: ['confirm_write'], sensitivity: '-', cost: 'light', questions: []},
];

export const CATALOG_RULES = [
  '먼저 이 분류표로 필요한 메뉴와 도구를 고르고, 그 도구만 불러 정확히 읽는다.',
  '"지금 어때/급한 거/이번 주 챙길 것"은 get_signals 숫자로 시작하고 필요한 메뉴만 상세로 읽는다.',
  '학생은 "학생 07" 같은 가명으로만 다룬다. 비밀 일기 본문, 학생 사진·영상·음성 원본, 위치, 상담·건강·가정 기록은 볼 수 없다고 안내한다.',
  '점수·순위는 모두의 교실에 있는 기록을 그대로 전한다. 베리가 새로 평가하거나 매기지 않는다.',
  '쓰기 도구는 미리보기 카드만 만든다. 선생님이 카드에서 저장해야 반영된다.',
  '선생님이 시키는 메뉴 일(설정 바꾸기·검사·숨기기·보말·배부·투표·일정 고치기 등)은 그 메뉴의 manage_* 도구를 쓴다. 한 문장에 여러 설정이면 한 번의 호출에 함께 넣는다. 대상 id는 먼저 읽기 도구로 확인하고, 비슷한 이름이 여럿이면 되묻는다.',
  '지우기·빼기·코드 재발급처럼 위험한 일은 빨간 카드로 두 번 눌러야 한다고 미리 알린다. 파일 올리기와 실시간 진행은 그 메뉴 화면에서 하도록 안내한다.',
  '카드놀이: 베리는 배부·멈춤·다시 열기와 진도 읽기만 한다. 세트 만들기·고치기·AI 초안, 인쇄, 팀전·반대항전·먼저 쓰기·교실 화면·지명 퀴즈, 설정 수정, 학습 기본값, 차시 메모·순서·학습 일정, 다른 반 옮기기(이월)·클래스 복제, 동료 공유·공유 세트 찾기·복사는 선생님이 화면에서 한다. 배부 때 말하지 않은 값은 우리 반 학습 기본값(없으면 앱 기본값), 선택 학습은 count 0. format·time_limit_seconds·after_due(마감 있을 때만)도 정한다. 숙련도·복습은 학생 몫, 반 평균·남은 학생 수만 읽는다. 목록은 선생님 순서(order), 숨긴 줄·메모 포함.',
  '복습 게임은 학생 혼자 한다. 학부모 링크·카드 보말 켜기는 선생님 몫. game_players·parent_links·bomal_given은 수뿐, 순위·이름 없음. 게임 점수·보말은 성적과 별개.',
  '우리 동네 탐험 자료는 읽기만 한다. 지도 불러오기·장소 고르기·약도 만들기·인쇄는 그 도구 화면에서 하도록 안내한다.',
  '숙제·전시실·보드처럼 항목이나 메뉴를 말할 때는 도구 결과의 link를, 없으면 아래 메뉴 바로가기를 [이름](link) 그대로 넣는다. 채팅창에서 누르면 바로 열리는 버튼이 된다. /teacher로 시작하는 주소만 쓰고 주소를 지어내지 않는다. 굵게(**) 같은 꾸밈 기호는 쓰지 않는다.',
];

/** Where each menu opens; tools add item links (one homework, one room) on top of these. */
export const MENU_LINKS: Partial<Record<string, string>> = {overview: '/teacher', classes: '/teacher/homework', homework: '/teacher/homework', exhibitions: '/teacher/exhibitions', boards: '/teacher/boards', quiz: '/teacher/daily-quiz', lesson_review: '/teacher/lesson-review', playground: '/teacher/playground', points: '/teacher/points', cards: '/teacher/cards', tools: '/teacher/tools', neighborhood: '/teacher/tools/neighborhood', kids_daily: '/teacher/diary', storage: '/teacher', workspace: '/teacher/me/workspace', notebook: '/teacher/me/notebook'};

/** Builds the catalog from the domain list and the live tool registry; unknown tools land in "기타" so nothing is ever missing. */
export function buildCatalog(tools: CatalogTool[], enabled: Record<string, unknown>) {
  const known = new Set(tools.map(tool => tool.name)), placed = new Set<string>();
  const domains = DOMAINS.map(domain => {
    const present = domain.tools.filter(name => known.has(name));
    present.forEach(name => placed.add(name));
    return {key: domain.key, menu: domain.menu, what: domain.what, holds: domain.holds, metrics: domain.metrics, tools: present, sensitivity: domain.sensitivity, cost: domain.cost, questions: domain.questions, enabled: domain.flag ? enabled[domain.flag] !== false : true};
  }).filter(domain => domain.tools.length || domain.key === 'kids_daily');
  const rest = tools.filter(tool => !placed.has(tool.name));
  if (rest.length) domains.push({key: 'other', menu: '기타', what: '분류표에 아직 자리가 없는 새 도구', holds: [], metrics: [], tools: rest.map(tool => tool.name), sensitivity: '도구 설명을 따른다', cost: 'medium', questions: [], enabled: true});
  const domainOf = new Map(domains.flatMap(domain => domain.tools.map(name => [name, domain.key] as const)));
  const toolRows = tools.map(tool => ({name: tool.name, domain: domainOf.get(tool.name) ?? 'other', scope: tool.scope, summary: tool.description.split(/(?<=[.다요])\s/)[0].slice(0, 160)}));
  // Links travel as one rule line: the brain renders rules, not extra domain fields.
  const menuLinks = `메뉴 바로가기: ${domains.filter(domain => MENU_LINKS[domain.key] && domain.enabled).map(domain => `${domain.menu} ${MENU_LINKS[domain.key]}`).join(', ')}`;
  const body = {domains, tools: toolRows, rules: [...CATALOG_RULES, menuLinks]};
  return {version: createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16), ...body};
}
