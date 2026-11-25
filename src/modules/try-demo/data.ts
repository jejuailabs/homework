import storage from '@/data/try-demo-storage.json';
import type {ExhibitionTheme} from '@/lib/exhibition-types';

/**
 * The demo class 햇살초 3학년 2반. Every name, picture and sentence here is made up for the
 * login-free tour; nothing is read from or written to the real service.
 */
export const DEMO_CLASS = {school: '햇살초등학교', name: '3학년 2반', teacher: '이슬 선생님', year: 2026};

/** Sample pictures live in Firebase Storage like every other image; they never ship through the deploy. */
export function demoAsset(path: string) {
  const override = process.env.NEXT_PUBLIC_TRY_DEMO_ASSET_BASE;
  if (override) return `${override.replace(/\/$/, '')}/${path}`;
  return `https://firebasestorage.googleapis.com/v0/b/${storage.bucket}/o/${encodeURIComponent(`${storage.prefix}/${path}`)}?alt=media&token=${storage.downloadToken}`;
}
export const demoAssetsReady = storage.ready || !!process.env.NEXT_PUBLIC_TRY_DEMO_ASSET_BASE;

export type DemoStudent = {id: string; number: number; name: string; character: 'cat' | 'dog' | 'hamster' | 'alpaca' | 'rabbit' | 'otter'; bomal: number};
export const students: DemoStudent[] = [
  {id: 's1', number: 1, name: '김하늘', character: 'cat', bomal: 200},
  {id: 's2', number: 2, name: '이도윤', character: 'dog', bomal: 85},
  {id: 's3', number: 3, name: '박서아', character: 'rabbit', bomal: 140},
  {id: 's4', number: 4, name: '최지호', character: 'otter', bomal: 60},
  {id: 's5', number: 5, name: '정유나', character: 'hamster', bomal: 95},
  {id: 's6', number: 6, name: '강민준', character: 'alpaca', bomal: 70},
  {id: 's7', number: 7, name: '윤서연', character: 'cat', bomal: 110},
  {id: 's8', number: 8, name: '임준우', character: 'dog', bomal: 45},
  {id: 's9', number: 9, name: '한지유', character: 'rabbit', bomal: 130},
  {id: 's10', number: 10, name: '오시우', character: 'otter', bomal: 75},
];
export const student = (id: string) => students.find(s => s.id === id)!;

export type DemoRoom = {id: string; title: string; description: string; theme: ExhibitionTheme; hall: string; month: string};
export const rooms: DemoRoom[] = [
  {id: 'space', title: '내가 꿈꾸는 우주', description: '우주에 간다면 무엇을 만날지 그려 봤어요.', theme: 'saturn', hall: '우주 · 토성 고리 회랑', month: '10월'},
  {id: 'sea', title: '바닷속 친구들', description: '과학 시간에 배운 바다 생물을 상상해서 그렸어요.', theme: 'coral', hall: '바다 · 산호 전시관', month: '6월'},
  {id: 'spring', title: '봄 그림전', description: '운동장에서 본 봄을 크레파스로 그렸어요.', theme: 'cozy', hall: '아늑한 전시관', month: '4월'},
];

export type DemoWork = {id: string; roomId: string; title: string; studentId: string; date: string; story: string};
const work = (id: string, title: string, studentId: string, date: string, story: string): DemoWork => ({id, roomId: id.split('-')[0], title, studentId, date, story});
export const works: DemoWork[] = [
  work('spring-01', '벚꽃이 팡팡', 's1', '2026-04-08', '운동장 벚나무가 팝콘처럼 터졌어요. 분홍색을 두 번 겹쳐 칠했어요.'),
  work('spring-02', '우리 집', 's2', '2026-04-08', '빨간 지붕이 우리 집이에요. 굴뚝은 없지만 있으면 좋겠어서 그렸어요.'),
  work('spring-03', '비 온 뒤 무지개', 's3', '2026-04-09', '비가 그치고 본 무지개예요. 색 순서를 틀리지 않으려고 노래를 불렀어요.'),
  work('spring-04', '꽃밭 소풍', 's4', '2026-04-09', '꽃이 다 다르게 생긴 게 좋아서 색을 전부 다르게 했어요.'),
  work('spring-05', '나비야 나비야', 's5', '2026-04-10', '날개 무늬를 양쪽 똑같이 그리는 게 제일 어려웠어요.'),
  work('spring-06', '우리 가족', 's6', '2026-04-10', '아빠, 엄마, 나, 동생이에요. 동생은 일부러 작게 그렸어요.'),
  work('spring-07', '초코랑 산책', 's7', '2026-04-13', '우리 집 강아지 초코예요. 공을 던지면 제일 빨리 뛰어요.'),
  work('spring-08', '낮잠 자는 치즈', 's8', '2026-04-13', '할머니 댁 고양이 치즈예요. 수염을 그릴 때 숨을 참았어요.'),
  work('spring-09', '풍선 타고 훨훨', 's9', '2026-04-14', '풍선을 많이 잡으면 날 수 있을 것 같아요.'),
  work('sea-01', '물고기 삼총사', 's10', '2026-06-03', '큰 물고기가 대장이고 작은 물고기가 막내예요.'),
  work('sea-02', '웃는 고래', 's1', '2026-06-03', '고래가 물을 뿜을 때 기분이 좋을 것 같아서 웃게 그렸어요.'),
  work('sea-03', '분홍 문어', 's3', '2026-06-04', '다리가 여덟 개인지 세어 보면서 그렸는데 여섯 개가 됐어요.'),
  work('sea-04', '느릿느릿 거북', 's4', '2026-06-04', '등딱지 무늬를 자로 안 대고 그렸어요.'),
  work('sea-05', '해파리 자매', 's5', '2026-06-05', '해파리는 뼈가 없대요. 그래서 흐물흐물하게 그렸어요.'),
  work('sea-06', '노란 잠수함', 's6', '2026-06-05', '창문이 세 개라서 친구 두 명이랑 같이 탈 수 있어요.'),
  work('sea-07', '불가사리와 산호', 's7', '2026-06-08', '불가사리가 별처럼 생겨서 바다의 별이라고 지었어요.'),
  work('sea-08', '상어도 친구', 's9', '2026-06-08', '상어가 무섭지 않게 이빨을 조금만 그렸어요.'),
  work('space-01', '출발! 햇살호', 's2', '2026-10-14', '우리 반 이름을 딴 로켓이에요. 불꽃은 주황색이 제일 멋져요.'),
  work('space-02', '고리 달린 행성', 's8', '2026-10-14', '토성 고리를 타고 미끄럼틀을 타고 싶어요.'),
  work('space-03', '우주인이 된 나', 's10', '2026-10-15', '헬멧 안에서 웃고 있는 사람이 저예요.'),
  work('space-04', '안녕, 외계인', 's1', '2026-10-15', '외계인도 인사하면 친구가 될 수 있을 것 같아요.'),
  work('space-05', '내 별자리', 's3', '2026-10-16', '별을 이어서 국자 모양을 만들었어요. 이름은 국자자리예요.'),
  work('space-06', '달 토끼', 's5', '2026-10-16', '달에 토끼가 산다고 할머니가 말해 줬어요.'),
  work('space-07', '소를 데려가지 마', 's7', '2026-10-19', '만화에서 본 장면이에요. 소가 놀라지 않았으면 좋겠어요.'),
  work('space-08', '우주 고양이 치즈', 's9', '2026-10-19', '치즈가 우주에 가면 헬멧을 써야 해요.'),
];
export const roomWorks = (roomId: string) => works.filter(w => w.roomId === roomId);
/** Pictures of the Saturn room, outside and inside, shown before the 3D room loads. */
export const spaceShots = {outside: demoAsset('shots/space-outside.webp'), inside: demoAsset('shots/space-inside.webp')};
export const workImage = (id: string, thumb = false) => demoAsset(`art/${id}${thumb ? '-thumb' : ''}.webp`);

export type DemoNote = {from: string; text: string};
/** Friendly guestbook notes shown under a few works. A visitor's own notes stay in memory only. */
export const guestbook: Record<string, DemoNote[]> = {
  'spring-01': [{from: '박서아', text: '진짜 팝콘 같아!'}, {from: '하늘이 엄마', text: '분홍색이 참 따뜻하네요.'}],
  'spring-07': [{from: '이도윤', text: '초코 나도 만나고 싶다'}],
  'sea-02': [{from: '정유나', text: '고래가 웃으니까 나도 웃게 돼'}, {from: '이슬 선생님', text: '물줄기 표현이 시원해요.'}],
  'sea-03': [{from: '한지유', text: '다리 여섯 개 문어 귀여워 ㅎㅎ'}],
  'space-01': [{from: '임준우', text: '햇살호 나도 태워 줘!'}],
  'space-05': [{from: '이슬 선생님', text: '국자자리, 이름을 정말 잘 지었어요.'}],
};

/** Homework whose submissions hang in a linked exhibition room on their own. */
export const homework = {title: '내가 좋아하는 것 그리기', due: '금요일까지', room: '숙제 전시 · 내가 좋아하는 것'};
export const homeworkPeers: {workId: string; text: string}[] = [
  {workId: 'spring-07', text: '초코랑 산책하는 게 제일 좋아요.'},
  {workId: 'sea-02', text: '고래는 크고 순해서 좋아요.'},
  {workId: 'space-01', text: '로켓을 타고 우주에 가고 싶어요.'},
  {workId: 'spring-03', text: '비 온 뒤에 무지개 찾는 걸 좋아해요.'},
  {workId: 'sea-06', text: '잠수함을 타면 물고기를 가까이 볼 수 있어요.'},
];
export const homeworkPicks = ['spring-09', 'space-08', 'sea-04'];
export const praises = ['색을 정성껏 칠했네! 참 잘했어요.', '좋아하는 마음이 그림에 다 보여요.', '다음엔 배경도 그려 볼까요?'];

export type DemoCard = {word: string; meaning: string; emoji: string};
export const cardSet = {title: '바다 동물 영어', cards: [
  {word: 'whale', meaning: '고래', emoji: '🐋'}, {word: 'turtle', meaning: '거북', emoji: '🐢'}, {word: 'octopus', meaning: '문어', emoji: '🐙'},
  {word: 'shark', meaning: '상어', emoji: '🦈'}, {word: 'crab', meaning: '게', emoji: '🦀'}, {word: 'fish', meaning: '물고기', emoji: '🐟'},
] as DemoCard[]};

/** Berry corner: two recorded requests. The real Berry reads the teacher's own class; nothing here calls an AI. */
export const berryDemo = {
  give: {
    ask: '오늘 숙제 좀 내 줘',
    thinking: ['이번 주 수업 내용을 살펴보는 중', '지난 숙제와 겹치지 않게 고르는 중', '숙제 초안을 만드는 중'],
    answer: ['이번 주 미술 시간에 배운 "상상해서 그리기"로 숙제를 준비했어요.', '내용을 확인하고 내 주세요.'],
    button: '숙제 초안 열기',
    draft: {title: '내가 가 보고 싶은 우주', body: '우주에 간다면 무엇을 만나고 싶나요? 상상해서 그리고, 한 줄로 소개해 주세요.', due: '금요일 오후 6시까지', kind: '사진 (그림을 찍어서 올리기)', room: '우주 전시실 · 내가 꿈꾸는 우주', to: '3학년 2반 10명'},
    done: '숙제를 냈어요. 학생 10명 화면에 바로 보여요. 검사하면 우주 전시실에 저절로 걸려요.',
  },
  check: {
    ask: '숙제 검사해 줘',
    thinking: ['제출한 숙제를 모으는 중', '한 명씩 그림과 소개 글을 읽는 중', '칭찬 한마디를 준비하는 중'],
    answer: ['"내가 가 보고 싶은 우주" 제출 6건 중 검사 안 한 숙제가 6건이에요.', '한 명씩 칭찬 한마디도 미리 적어 두었어요.'],
    button: '검사 화면 열기',
    items: [
      {workId: 'space-01', note: '로켓 불꽃 색이 정말 멋져요!'},
      {workId: 'space-02', note: '토성 고리 미끄럼틀, 상상력이 최고예요.'},
      {workId: 'space-03', note: '헬멧 속 웃는 얼굴이 보기 좋아요.'},
      {workId: 'space-04', note: '외계인과 친구가 되는 마음이 따뜻해요.'},
      {workId: 'space-05', note: '국자자리, 이름을 정말 잘 지었어요.'},
      {workId: 'space-08', note: '치즈 헬멧까지 꼼꼼하게 그렸네요.'},
    ],
    done: '6건 모두 "참 잘했어요"로 검사했어요. 작품은 우주 전시실에 저절로 걸렸어요.',
  },
};
/** Screen recording of the same two requests, played on the left of the corner. */
export const berryVideo = {src: demoAsset('video/berry-demo.mp4'), poster: demoAsset('video/berry-demo.webp')};

export type CornerId = 'gallery' | 'flow' | 'bomal' | 'cards' | 'berry' | 'artbook' | 'start';
export const corners: {id: CornerId; label: string; lead: string}[] = [
  {id: 'gallery', label: '전시관', lead: '아이들 작품이 걸리는 3D 전시관'},
  {id: 'flow', label: '숙제 → 전시', lead: '검사한 숙제가 그대로 전시실에 걸려요'},
  {id: 'bomal', label: '보말과 캐릭터', lead: '칭찬 보말로 꾸미는 나의 작은 세상'},
  {id: 'cards', label: '카드놀이', lead: '단어 카드 짝 맞추기'},
  {id: 'berry', label: '부담임 베리', lead: '말로 시키는 우리 반 부담임 AI'},
  {id: 'artbook', label: '작품집', lead: '한 해 작품을 한 권의 PDF로'},
  {id: 'start', label: '시작하기', lead: '우리 반으로 시작하기'},
];
export const isCorner = (value: unknown): value is CornerId => corners.some(c => c.id === value);
