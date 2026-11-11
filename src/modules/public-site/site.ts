import type {CategoryId} from './types';

export const SITE_URL = 'https://ourclass.co.kr';
export const SITE_NAME = '모두의 교실';
export const SITE_ALT_NAMES = ['모두의교실', '교실.com', 'ourclass', 'Our Classroom', '아워클래스'];
export const SITE_ONE_LINER =
  '모두의 교실(ourclass, 교실.com)은 초등 학급을 위한 온라인 교실입니다. 숙제 제출과 피드백, 학급 작품 전시실, 교사용 AI 비서 베리, 참여보드·학급 투표·단어 카드 같은 수업 활동을 한곳에서 운영합니다.';

/**
 * Public pages stay out of search until the owner approves the preview.
 * Flip to true together with the robots/sitemap step.
 */
export const PUBLIC_SITE_INDEXABLE = false;

export const CATEGORIES: {id: CategoryId; name: string; blurb: string}[] = [
  {id: 'start', name: '시작하기', blurb: '가입부터 첫 숙제까지, 처음 쓰는 선생님을 위한 안내'},
  {id: 'homework', name: '숙제 · 과제', blurb: '온라인 숙제 내기, 제출 확인, 피드백과 보관'},
  {id: 'exhibition', name: '전시실', blurb: '학생 작품 전시회와 공개 갤러리 운영'},
  {id: 'ai', name: 'AI 교실 · 베리', blurb: '교사용 AI 비서 베리와 AI 수업 도구'},
  {id: 'activities', name: '수업 활동', blurb: '참여보드, 학급 투표, 함께캔버스, 수업 돌아보기'},
  {id: 'cards', name: '단어 카드 · 어휘', blurb: '단어 카드 학습, 게임, 말하기 연습'},
  {id: 'rewards', name: '학급 경영 · 보상', blurb: '포인트, 칭찬 상점, 학급 리포트'},
  {id: 'myspace', name: '나만의 공간', blurb: '캐릭터 꾸미기, 나의 작은 세상, 비밀 일기'},
  {id: 'tools', name: '교사 도구', blurb: '타이머, 뽑기, 칠판, 사전 등 수업 보조 도구'},
  {id: 'family', name: '가정 연계', blurb: '보호자와 학습 결과를 나누는 방법'},
  {id: 'safety', name: '안전 · 개인정보', blurb: '학생 정보 보호와 안전한 공유 방법'},
  {id: 'insight', name: '교실 칼럼', blurb: '에듀테크, AI 교육, 학급 경영에 대한 실전 칼럼'},
];

export function categoryName(id: CategoryId) {
  return CATEGORIES.find(c => c.id === id)?.name ?? id;
}
