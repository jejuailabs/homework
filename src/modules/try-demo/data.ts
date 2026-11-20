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
  {id: 's1', number: 1, name: '김하늘', character: 'cat', bomal: 120},
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

export type CornerId = 'gallery' | 'bomal' | 'artbook' | 'start';
export const corners: {id: CornerId; label: string; lead: string}[] = [
  {id: 'gallery', label: '전시관', lead: '아이들 작품이 걸리는 3D 전시관'},
  {id: 'bomal', label: '보말과 캐릭터', lead: '칭찬 보말로 꾸미는 나의 작은 세상'},
  {id: 'artbook', label: '작품집', lead: '한 해 작품을 한 권의 PDF로'},
  {id: 'start', label: '시작하기', lead: '우리 반으로 시작하기'},
];
export const isCorner = (value: unknown): value is CornerId => corners.some(c => c.id === value);
