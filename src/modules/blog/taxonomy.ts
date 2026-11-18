import type {MockId} from '@/modules/public-site/types';

// Blog map: two sections (manual = how-to, tips = teacher-work tips), each with
// sub-categories shown as tabs. Ids are URL- and DB-safe; names are what readers see.

export type BlogSectionId = 'manual' | 'tips';

export type BlogCategory = {id: string; name: string; blurb: string; features: FeatureId[]};
export type BlogSection = {id: BlogSectionId; name: string; title: string; blurb: string; categories: BlogCategory[]};

export type FeatureId = 'homework' | 'exhibition' | 'berry' | 'board' | 'cards' | 'points' | 'tools' | 'family' | 'myspace' | 'review';

/** Product features an article can point readers to, with a screen preview. */
export const FEATURES: Record<FeatureId, {name: string; blurb: string; mock: MockId; manual: string}> = {
  homework: {name: '온라인 숙제', blurb: '글·사진·영상·녹음 제출을 한 화면에서 한 명씩 확인하고 선생님 말씀을 남깁니다.', mock: 'homework-review', manual: 'online-homework-create'},
  exhibition: {name: '학급 작품 전시실', blurb: '반 작품을 3D 전시실에 걸고 보호자에게 링크·QR로 공개합니다.', mock: 'exhibition-wall', manual: 'online-art-exhibition'},
  berry: {name: 'AI 비서 베리', blurb: '숙제 확인, 학급 현황 정리, 수업 자료 준비를 말로 맡기는 선생님 전용 AI 비서입니다.', mock: 'berry-chat', manual: 'berry-ai-assistant'},
  board: {name: '참여보드·학급 투표', blurb: '수업 중 생각 나누기, 질문 모으기, 투표를 실시간으로 진행합니다.', mock: 'board', manual: 'participation-board'},
  cards: {name: '단어 카드', blurb: '어휘 카드 학습, 게임, 말하기 연습을 반 전체에 나눠 줍니다.', mock: 'cards', manual: 'word-cards'},
  points: {name: '포인트 칭찬 상점', blurb: '학급 포인트와 칭찬 상점으로 긍정 행동을 꾸준히 이어 갑니다.', mock: 'points-shop', manual: 'class-points-bomal'},
  tools: {name: '수업 도구', blurb: '타이머, 뽑기, 칠판 등 수업에 바로 쓰는 도구 모음입니다.', mock: 'timer', manual: 'classroom-tools'},
  family: {name: '가정 연계', blurb: '학습 결과와 작품을 보호자와 안전하게 나눕니다.', mock: 'family-report', manual: 'family-learning-news'},
  myspace: {name: '나의 작은 세상', blurb: '학생이 캐릭터를 키우고 방을 꾸미며 학습 동기를 이어 갑니다.', mock: 'my-space', manual: 'my-little-world'},
  review: {name: '수업 돌아보기', blurb: '수업이 끝난 뒤 학생 스스로 배운 점을 정리하고 선생님이 한눈에 확인합니다.', mock: 'lesson-review', manual: 'lesson-review-ai'},
};

export const SECTIONS: BlogSection[] = [
  {
    id: 'manual', name: '사용설명서', title: '모두의 교실 사용설명서',
    blurb: '숙제 내기부터 작품 전시, AI 비서 베리, 수업 활동과 학급 경영까지 기능별 사용법을 단계대로 정리했습니다.',
    categories: [
      {id: 'start', name: '시작하기', blurb: '가입부터 첫 숙제까지, 처음 쓰는 선생님을 위한 안내', features: ['homework', 'berry']},
      {id: 'homework', name: '숙제 · 과제', blurb: '온라인 숙제 내기, 제출 확인, 피드백과 보관', features: ['homework', 'berry']},
      {id: 'exhibition', name: '전시실', blurb: '학생 작품 전시회와 공개 갤러리 운영', features: ['exhibition', 'family']},
      {id: 'ai', name: 'AI 교실 · 베리', blurb: '교사용 AI 비서 베리와 AI 수업 도구', features: ['berry', 'homework']},
      {id: 'activities', name: '수업 활동', blurb: '참여보드, 학급 투표, 함께캔버스, 수업 돌아보기', features: ['board', 'review']},
      {id: 'cards', name: '단어 카드 · 어휘', blurb: '단어 카드 학습, 게임, 말하기 연습', features: ['cards', 'board']},
      {id: 'rewards', name: '학급 경영 · 보상', blurb: '포인트, 칭찬 상점, 학급 리포트', features: ['points', 'myspace']},
      {id: 'myspace', name: '나만의 공간', blurb: '캐릭터 꾸미기, 나의 작은 세상, 비밀 일기', features: ['myspace', 'points']},
      {id: 'tools', name: '교사 도구', blurb: '타이머, 뽑기, 칠판, 사전 등 수업 보조 도구', features: ['tools', 'board']},
      {id: 'family', name: '가정 연계', blurb: '보호자와 학습 결과를 나누는 방법', features: ['family', 'exhibition']},
      {id: 'safety', name: '안전 · 개인정보', blurb: '학생 정보 보호와 안전한 공유 방법', features: ['homework', 'family']},
    ],
  },
  {
    id: 'tips', name: '선생님 업무 Tip', title: '선생님 업무 Tip',
    blurb: '숙제 검사, 학급 경영, 수업 준비, 행정 업무까지. 선생님의 시간을 줄여 주는 실전 방법과 AI 비서 베리 활용법을 나눕니다.',
    categories: [
      {id: 'homework-eval', name: '숙제 · 평가', blurb: '숙제 검사와 피드백, 평가 기록을 빠르게', features: ['homework', 'berry']},
      {id: 'class-mgmt', name: '학급 경영', blurb: '규칙, 보상, 관계, 학기 운영 노하우', features: ['points', 'board']},
      {id: 'lesson-prep', name: '수업 준비', blurb: '수업 자료와 활동을 짧은 시간에 준비하기', features: ['berry', 'tools']},
      {id: 'ai-use', name: 'AI 활용', blurb: '교사 업무에 AI를 안전하게 쓰는 방법', features: ['berry', 'homework']},
      {id: 'admin-work', name: '행정 · 기록', blurb: '생활기록, 학급 기록, 보호자 소통 정리', features: ['berry', 'family']},
      {id: 'column', name: '교실 칼럼', blurb: '에듀테크와 학급 운영에 대한 실전 칼럼', features: ['exhibition', 'berry']},
    ],
  },
];

export const BLOG_NAME = '모두의 교실 블로그';

export function sectionById(id: string) {
  return SECTIONS.find(s => s.id === id);
}

export function categoryOf(section: BlogSectionId, category: string) {
  return sectionById(section)?.categories.find(c => c.id === category);
}

export function isBlogSection(id: string): id is BlogSectionId {
  return id === 'manual' || id === 'tips';
}
