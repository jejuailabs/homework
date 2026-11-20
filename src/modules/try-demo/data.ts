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
  {id: 'spring', title: '봄 그림전', description: '운동장에서 본 봄을 크레파스로 그렸어요.', theme: 'cozy', hall: '아늑한 전시관', month: '4월'},
  {id: 'sea', title: '바닷속 친구들', description: '과학 시간에 배운 바다 생물을 상상해서 그렸어요.', theme: 'coral', hall: '바다 · 산호 전시관', month: '6월'},
  {id: 'space', title: '내가 꿈꾸는 우주', description: '우주에 간다면 무엇을 만날지 그려 봤어요.', theme: 'earth', hall: '우주 · 지구 전시관', month: '10월'},
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

/** Homework whose submissions hang in a linked exhibition room and board on their own. */
export const homework = {title: '내가 좋아하는 것 그리기', due: '금요일까지', room: '숙제 전시 · 내가 좋아하는 것', board: '내가 좋아하는 것 이야기'};
export const homeworkPeers: {workId: string; text: string}[] = [
  {workId: 'spring-07', text: '초코랑 산책하는 게 제일 좋아요.'},
  {workId: 'sea-02', text: '고래는 크고 순해서 좋아요.'},
  {workId: 'space-01', text: '로켓을 타고 우주에 가고 싶어요.'},
  {workId: 'spring-03', text: '비 온 뒤에 무지개 찾는 걸 좋아해요.'},
  {workId: 'sea-06', text: '잠수함을 타면 물고기를 가까이 볼 수 있어요.'},
];
export const homeworkPicks = ['spring-09', 'space-08', 'sea-04'];
export const praises = ['색을 정성껏 칠했네! 참 잘했어요.', '좋아하는 마음이 그림에 다 보여요.', '다음엔 배경도 그려 볼까요?'];

export type BoardNote = {id: string; column: number; from: string; text: string; color: string; hearts: number};
export const boardColumns = ['알게 된 점', '궁금한 점', '더 해 보고 싶은 것'];
export const boardColors = ['#fff3b0', '#ffd6e0', '#d3f0dc', '#d6e8ff', '#eadcff'];
export const boardNotes: BoardNote[] = [
  {id: 'n1', column: 0, from: '김하늘', text: '고래는 물고기가 아니라 젖을 먹는 동물이래요.', color: '#d6e8ff', hearts: 4},
  {id: 'n2', column: 0, from: '박서아', text: '문어 다리는 여덟 개! 내 그림은 여섯 개였다.', color: '#ffd6e0', hearts: 6},
  {id: 'n3', column: 1, from: '최지호', text: '거북은 등딱지를 벗을 수 있나요?', color: '#d3f0dc', hearts: 2},
  {id: 'n4', column: 1, from: '정유나', text: '해파리는 뼈가 없는데 어떻게 헤엄쳐요?', color: '#eadcff', hearts: 3},
  {id: 'n5', column: 2, from: '강민준', text: '잠수함 모형을 페트병으로 만들어 보고 싶어요.', color: '#fff3b0', hearts: 5},
  {id: 'n6', column: 2, from: '윤서연', text: '바닷가에 가서 불가사리를 직접 보고 싶다.', color: '#ffd6e0', hearts: 1},
  {id: 'n7', column: 0, from: '한지유', text: '상어는 이빨이 빠져도 또 난대요.', color: '#fff3b0', hearts: 3},
];

export type DemoCard = {word: string; meaning: string; emoji: string};
export const cardSet = {title: '바다 동물 영어', cards: [
  {word: 'whale', meaning: '고래', emoji: '🐋'}, {word: 'turtle', meaning: '거북', emoji: '🐢'}, {word: 'octopus', meaning: '문어', emoji: '🐙'},
  {word: 'shark', meaning: '상어', emoji: '🦈'}, {word: 'crab', meaning: '게', emoji: '🦀'}, {word: 'fish', meaning: '물고기', emoji: '🐟'},
] as DemoCard[]};

/** Answers recorded for the demo class. The real Berry reads the teacher's own class; nothing here calls an AI. */
export type BerryCard = {title: string; rows: [string, string][]; done: string};
export type BerryTurn = {ask: string; answer: string[]; card?: BerryCard; follow?: BerryTurn};
export const berryTurns: BerryTurn[] = [
  {ask: '지금 챙길 것 알려 줘', answer: ['오늘 챙기실 것은 네 가지예요.', '· 검사 기다리는 숙제 3건 (내가 좋아하는 것 그리기)', '· 승인 기다리는 작품 2점 (봄 그림전)', '· 오늘 마감 숙제 1개 (독서 감상문)', '· 내일 15:00 학년 협의회']},
  {ask: '독서 감상문 안 낸 학생 알려 줘', answer: ['아직 3명이 내지 않았어요: 학생 04, 학생 08, 학생 10.', '이름은 가명으로만 다뤄요. 안내 문구를 만들어 드릴까요?'],
    follow: {ask: '응, 다정하게 써 줘', answer: ['이렇게 써 보면 어떨까요?', '"금요일까지 감상문을 올려 주면 선생님이 꼭 읽어 볼게요. 한 줄이어도 괜찮아요!"']}},
  {ask: '내일 3시 학년 협의회 일정 넣어 줘', answer: ['이렇게 넣을게요. 저장 전에 확인해 주세요.'],
    card: {title: '일정 추가', rows: [['제목', '학년 협의회'], ['때', '내일 15:00 ~ 16:00'], ['종류', '회의']], done: '실제로는 선생님 달력에 들어가요. 체험에서는 저장되지 않아요.'}},
  {ask: '봄 그림전 승인 대기 작품 모두 승인해 줘', answer: ['승인 대기 작품 2점을 찾았어요. 바꾸기 전에 확인해 주세요.'],
    card: {title: '작품 승인', rows: [['전시실', '봄 그림전'], ['대상', '풍선 타고 훨훨, 낮잠 자는 치즈'], ['바뀌는 것', '승인 대기 → 승인 (전시실에 걸림)']], done: '실제로는 두 작품이 전시실에 걸려요. 체험에서는 반영되지 않아요.'}},
];

export type CornerId = 'gallery' | 'flow' | 'bomal' | 'board' | 'cards' | 'berry' | 'artbook' | 'start';
export const corners: {id: CornerId; label: string; lead: string}[] = [
  {id: 'gallery', label: '전시관', lead: '아이들 작품이 걸리는 3D 전시관'},
  {id: 'flow', label: '숙제 → 전시', lead: '숙제 하나가 전시실과 보드로 이어져요'},
  {id: 'bomal', label: '보말과 캐릭터', lead: '칭찬 보말로 꾸미는 나의 작은 세상'},
  {id: 'board', label: '참여보드', lead: '모두의 생각이 한 판에 모여요'},
  {id: 'cards', label: '카드놀이', lead: '단어 카드 짝 맞추기'},
  {id: 'berry', label: '베리', lead: '말로 시키는 선생님의 AI 비서'},
  {id: 'artbook', label: '작품집', lead: '한 해 작품을 한 권의 PDF로'},
  {id: 'start', label: '시작하기', lead: '우리 반으로 시작하기'},
];
export const isCorner = (value: unknown): value is CornerId => corners.some(c => c.id === value);
