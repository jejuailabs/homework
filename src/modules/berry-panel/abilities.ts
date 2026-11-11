/**
 * What a teacher can ask Berry, as buttons. The chat panel and the /teacher/berry guide both render this list, and
 * docs/BERRY_GUIDE.md describes the same groups. A prompt with [빈칸] goes into the input box with the first blank
 * selected; a prompt without blanks is sent right away. `write` marks requests that end in an approval card.
 * `needs` lists the connection permissions the request depends on, including the reads that find its target; a button
 * whose permissions the connection lacks stays visible, locked, and asks for a reconnect instead of failing in chat.
 * `feature` names a menu that can be switched off; while it is off the button is not shown at all.
 */
import {BERRY_SCOPE_LABELS, type BerryScope} from '@/modules/berry-connector/types';

export type AbilityFeature = 'cards' | 'notebook' | 'playground';
export type Ability = {label: string; prompt: string; write?: boolean; danger?: boolean; feature?: AbilityFeature; needs: readonly BerryScope[]};
export type AbilityGroup = {key: string; label: string; emoji: string; abilities: Ability[]};
type GroupSource = Omit<AbilityGroup, 'abilities'> & {read: readonly BerryScope[]; change: readonly BerryScope[]; abilities: (Omit<Ability, 'needs'> & {needs?: readonly BerryScope[]})[]};

const CLASS_READ: readonly BerryScope[] = ['classes:read', 'classroom:read'], CLASS_WRITE: readonly BerryScope[] = ['classes:read', 'classroom:read', 'classroom:write'];
const GROUPS: GroupSource[] = [
  {key: 'now', label: '지금 현황', emoji: '☀️', read: ['classroom:read'], change: [], abilities: [
    {label: '지금 챙길 것', prompt: '지금 챙길 것 알려 줘'},
    {label: '오늘 일정·수업', prompt: '오늘 일정이랑 수업 정리해 줘', needs: ['workspace:read']},
    {label: '승인 기다리는 것', prompt: '승인 기다리는 작품이랑 게시물 알려 줘'},
    {label: '저장 공간', prompt: '저장 공간 얼마나 남았어?'},
  ]},
  {key: 'homework', label: '숙제', emoji: '📚', read: ['homework:read'], change: ['homework:read', 'classroom:write'], abilities: [
    {label: '이번 주 마감 숙제', prompt: '이번 주 마감 숙제 알려 줘'},
    {label: '안 낸 학생', prompt: '오늘 마감 숙제 안 낸 학생 알려 줘'},
    {label: '숙제 내기', prompt: '[학급]에 [숙제 제목] 숙제 내 줘. 제출은 [사진/글/동영상], 마감은 [날짜]', write: true, needs: ['classes:read', 'classroom:write']},
    {label: '마감 바꾸기', prompt: '[숙제 이름] 마감을 [날짜]로 바꿔 줘', write: true},
    {label: '제출 방식 바꾸기', prompt: '[숙제 이름] 제출 방식을 [사진/글/동영상/녹음]으로 바꿔 줘', write: true},
    {label: '전시실·보드 연동', prompt: '[숙제 이름] [전시실/참여보드] 연동을 [켜/꺼] 줘', write: true},
    {label: '검사 완료 한꺼번에', prompt: '[숙제 이름] 제출한 학생 모두 검사 완료로 해 줘', write: true},
    {label: '다시 하기 요청', prompt: '[숙제 이름]에서 [번호]번 학생 다시 하기로 돌려 줘. 피드백: [내용]', write: true},
    {label: '숙제 숨기기', prompt: '[숙제 이름] 학생 화면에서 숨겨 줘', write: true},
  ]},
  {key: 'exhibition', label: '작품전시', emoji: '🖼️', read: CLASS_READ, change: CLASS_WRITE, abilities: [
    {label: '전시실 열기', prompt: '[학급]에 [전시실 이름] 전시실 열어 줘', write: true},
    {label: '대기 작품 모두 승인', prompt: '[전시실 이름] 승인 대기 작품 모두 승인해 줘', write: true},
    {label: '테마 바꾸기', prompt: '[전시실 이름] 테마를 [아늑한/숲/하늘/바다]로 바꿔 줘', write: true},
    {label: 'QR 공개 켜기·끄기', prompt: '[전시실 이름] QR 공개 [켜/꺼] 줘', write: true},
    {label: '작품 날짜 일괄 변경', prompt: '[전시실 이름] 작품 날짜를 모두 [날짜]로 바꿔 줘', write: true},
    {label: '도슨트·방명록 켜기', prompt: '[전시실 이름] 도슨트 녹음이랑 방명록 켜 줘', write: true},
    {label: '전시 마감', prompt: '[전시실 이름] 전시 마감해 줘', write: true},
    {label: '지난 전시 찾기', prompt: '[4월쯤] 했던 [주제] 전시 찾아 줘'},
  ]},
  {key: 'board', label: '참여보드', emoji: '📌', read: CLASS_READ, change: CLASS_WRITE, abilities: [
    {label: '보드 열기', prompt: '[학급]에 [보드 이름] 참여보드 열어 줘', write: true},
    {label: '대기 글 모두 공개', prompt: '[보드 이름] 승인 대기 글 모두 공개해 줘', write: true},
    {label: '보드 설정 바꾸기', prompt: '[보드 이름] [익명으로 바꾸고 승인제 켜] 줘', write: true},
    {label: '선생님 글 올리기', prompt: '[보드 이름]에 "[내용]" 글 올려 줘', write: true},
    {label: '보드 잠그기', prompt: '[보드 이름] 더 못 올리게 잠가 줘', write: true},
    {label: '공개 링크 만들기', prompt: '[보드 이름] 공개 링크 만들어 줘', write: true},
  ]},
  {key: 'quiz', label: 'Quiz·복습', emoji: '✏️', read: CLASS_READ, change: CLASS_WRITE, abilities: [
    {label: '오늘 퀴즈 현황', prompt: '오늘 퀴즈 다 한 학생 몇 명이야?'},
    {label: '퀴즈 범위 정하기', prompt: '[내일] 퀴즈 범위 영어 [범위], 수학 [범위]로 정해 줘', write: true},
    {label: '복습 배포', prompt: '[복습 이름] 학생들에게 배포해 줘', write: true},
    {label: '복습 숨기기', prompt: '[복습 이름] 숨겨 줘', write: true},
  ]},
  {key: 'play', label: '보말·말놀이터', emoji: '🎯', read: CLASS_READ, change: CLASS_WRITE, abilities: [
    {label: '보말 순위', prompt: '보말 제일 많이 모은 학생 알려 줘'},
    {label: '보말 주기', prompt: '[번호]번 학생에게 보말 [점수]점 줘. 사유: [사유]', write: true},
    {label: '말놀이터 순위', prompt: '이번 주 말놀이터 순위 알려 줘', feature: 'playground'},
    {label: '말놀이터 설정', prompt: '말놀이터 [대결 켜고 순위는 숨겨] 줘', write: true, feature: 'playground'},
    {label: '말놀이터 문제 추가', prompt: '말놀이터에 [낱말] 문제 추가해 줘. 뜻: [뜻]', write: true, feature: 'playground'},
  ]},
  {key: 'tools', label: '수업 도구', emoji: '🧰', read: CLASS_READ, change: CLASS_WRITE, abilities: [
    {label: '투표 만들기', prompt: '[학급]에 "[질문]" 투표 만들어 줘. 보기: [보기1], [보기2]', write: true},
    {label: '투표 마감', prompt: '[투표 이름] 투표 마감해 줘', write: true},
    {label: '캔버스 만들기', prompt: '[학급]에 [제목] 캔버스 만들어 줘. 미션: [내용]', write: true},
    {label: '카드 진도', prompt: '[카드 세트 이름] 안 끝낸 학생이랑 많이 틀린 단어 알려 줘', feature: 'cards'},
    {label: '카드 배부', prompt: '[카드 세트 이름]을 [학급]에 배부해 줘. 마감 [날짜]', write: true, feature: 'cards'},
  ]},
  {key: 'work', label: '업무·일정', emoji: '🗂️', read: [], change: ['workspace:read', 'workspace:write'], abilities: [
    {label: '일정 넣기', prompt: '[날짜] [시간]에 [일정] 일정 넣어 줘', write: true, needs: ['calendar:write']},
    {label: '일정 옮기기', prompt: '[일정 이름]을 [날짜] [시간]으로 옮겨 줘', write: true},
    {label: '수업 일지 쓰기', prompt: '오늘 [교시]교시 [과목] 수업 일지 써 줘: [내용]', write: true, needs: ['workspace:write']},
    {label: '업무 메모', prompt: '[폴더]에 "[내용]" 메모 남겨 줘', write: true},
    {label: '교무수첩 기록', prompt: '[번호]번 학생 교무수첩에 "[내용]" 기록해 줘', write: true, feature: 'notebook', needs: ['classes:read', 'notebook:write']},
    {label: '알림 예약', prompt: '[내일 아침 8시]에 [할 일] 알려 줘'},
    {label: '매일 루틴', prompt: '평일 [아침 7시 30분]마다 [미제출 정리]해 줘'},
  ]},
  {key: 'class', label: '학급', emoji: '🏫', read: [], change: ['classes:read', 'classroom:write'], abilities: [
    {label: '학급 만들기', prompt: '[학년] [반] 학급 만들어 줘', write: true, needs: ['classroom:write']},
    {label: '학생 추가', prompt: '[학급]에 [번호]번 [이름] 학생 추가해 줘', write: true},
    {label: '학생 코드 다시 만들기', prompt: '[학급] [번호]번 학생 입장 코드 다시 만들어 줘', write: true, danger: true},
  ]},
];

export const ABILITY_GROUPS: AbilityGroup[] = GROUPS.map(({key, label, emoji, read, change, abilities}) => ({key, label, emoji, abilities: abilities.map(ability => ({...ability, needs: ability.needs ?? (ability.write ? change : read)}))}));

/** The buttons to show: a switched-off menu's buttons drop out, and a group left empty goes with them. */
export const abilityGroups = (off: readonly string[] = []) => ABILITY_GROUPS.map(group => ({...group, abilities: group.abilities.filter(ability => !ability.feature || !off.includes(ability.feature))})).filter(group => group.abilities.length);

/** Permissions this request needs and the connection does not have. */
export const lackingFor = (ability: Pick<Ability, 'needs'>, granted: readonly string[]) => ability.needs.filter(scope => !granted.includes(scope));
/** Every permission some button needs and the connection does not have, as the consent screen names them. */
export function missingPermissions(granted: readonly string[]): {scopes: BerryScope[]; titles: string[]} {
  const scopes = [...new Set(ABILITY_GROUPS.flatMap(group => group.abilities.flatMap(ability => lackingFor(ability, granted))))];
  return {scopes, titles: scopes.map(scope => BERRY_SCOPE_LABELS[scope].title)};
}

/** The first [빈칸] in a prompt, for selecting it in the input box. */
export function firstBlank(prompt: string): [number, number] | null {
  const match = /\[[^\]]+\]/.exec(prompt);
  return match ? [match.index, match.index + match[0].length] : null;
}
