/** BERRY DUO companions: two berries share 16 complete outfit sets, each with its own fitted image. */
// Images live in Firebase Storage (scripts/upload-berry-pet-assets.mjs rewrites this line); nothing ships with the app.
export const BERRY_STORAGE = {bucket: 'book-9b8ce.firebasestorage.app', prefix: 'my-space/berry/v1', token: '99c74d88-cb41-4c4d-815a-d191a321d376'} as const;
export const BERRY_ROOT = `https://firebasestorage.googleapis.com/v0/b/${BERRY_STORAGE.bucket}/o/`;

export const berryPets = [
  {id: 'berry-blue', key: 'blue', name: '블루베리', buddyName: '제리', en: 'Jerry', color: '#7b83e8', trait: '차분하게 계획하고 끝까지 함께하는 든든한 베리', hello: ['오늘 할 일을 같이 하나씩 정리해 볼까?', '천천히 해도 괜찮아. 내가 옆에 있을게.', '작지만 특별한 하루를 같이 만들자!']},
  {id: 'berry-rasp', key: 'rasp', name: '라즈베리', buddyName: '주리', en: 'Jurry', color: '#f0607a', trait: '궁금한 것이 많고 먼저 손 내미는 명랑한 베리', hello: ['오늘은 어떤 재미있는 일이 있었어?', '궁금한 건 같이 찾아보자!', '윙크 한 번, 응원 한 번 보낼게!']},
] as const;
export type BerryId = typeof berryPets[number]['id'];
export const berryPet = (id: string) => berryPets.find(pet => pet.id === id);
export const isBerry = (id: string): id is BerryId => !!berryPet(id);
export const berryWardrobe = {id: 'berry', ko: '베리', en: 'Berry', title: '제리·주리의 베리 옷장', friends: '제리와 주리', badge: '제리·주리 전용'} as const;

/** Each set is one fully dressed image per berry; blue/rasp describe what that berry wears. */
const sets: [motif: string, name: string, en: string, price: number, color: string, blue: [string, string], rasp: [string, string]][] = [
  ['haenyeo', '제주 해녀 세트', 'Jeju haenyeo diver set', 50, '#4a4a55', ['검은 해녀 물옷', '분홍 물안경 · 테왁 망사리'], ['검은 해녀 물옷', '분홍 물안경 · 성게']],
  ['hallabong', '한라봉 수확 세트', 'Hallabong harvest set', 40, '#f6a623', ['가벼운 맨몸 차림', '커다란 한라봉'], ['밀짚모자', '한라봉 바구니']],
  ['horse', '조랑말 나들이 세트', 'Jeju pony ride set', 50, '#c9a27a', ['노란 목도리', '제주 조랑말'], ['노란 깃발', '제주 조랑말']],
  ['hareubang', '돌하르방 세트', 'Dol hareubang set', 45, '#6e6a66', ['현무암 돌옷', '돌하르방 모자'], ['현무암 돌옷', '돌하르방 모자']],
  ['canola', '유채꽃 소풍 세트', 'Canola picnic set', 45, '#f2cf5b', ['노란 체크 셔츠', '유채꽃 다발'], ['노란 체크 원피스', '유채 화관 · 소풍 바구니']],
  ['camellia', '동백꽃 겨울 세트', 'Camellia winter set', 45, '#a8323c', ['빨간 떡볶이 코트', '동백꽃'], ['빨간 털 망토', '동백 머리꽃']],
  ['olle', '올레길 여행 세트', 'Olle trail trip set', 45, '#d9c7a3', ['베이지 여행 재킷', '가죽 가방 · 돌담 지도'], ['노란 돌담 망토', '여행 카메라']],
  ['gotjawal', '곶자왈 탐험 세트', 'Gotjawal forest explorer set', 45, '#7f9a4e', ['초록 탐험 조끼', '고사리 돋보기'], ['초록 숲 망토', '쌍안경']],
  ['pampas', '억새 오름 세트', 'Silver grass hill set', 45, '#c98f55', ['누빔 조끼', '배낭 · 억새'], ['주황 망토', '억새 지팡이']],
  ['kite', '연날리기 세트', 'Kite flying set', 45, '#3f9a94', ['청록 후드', '방패연 · 얼레'], ['분홍 후드', '가오리연 · 얼레']],
  ['overalls', '데님 멜빵 세트', 'Denim overalls set', 35, '#5b74a8', ['데님 멜빵바지', '꽃 자수'], ['데님 멜빵바지', '꽃 자수']],
  ['cardigan', '포근 가디건 세트', 'Cozy cardigan set', 35, '#efe3cc', ['크림 줄무늬 가디건', '나무 단추'], ['분홍 꽈배기 가디건', '빨간 단추']],
  ['beret', '꼬마 화가 세트', 'Little artist set', 40, '#2f6f63', ['데님 멜빵바지', '초록 베레모'], ['데님 멜빵바지', '보라 베레모']],
  ['hairpin', '동백 머리핀 세트', 'Camellia hairpin set', 40, '#d6404a', ['크림 줄무늬 가디건', '동백 머리핀'], ['분홍 꽈배기 가디건', '동백 머리핀']],
  ['bowtie', '리본 멋쟁이 세트', 'Bow tie set', 40, '#e2a83a', ['데님 멜빵바지', '노란 리본'], ['데님 멜빵바지', '초록 리본']],
  ['scarf', '포근 스카프 세트', 'Cozy scarf set', 40, '#5a66b0', ['크림 줄무늬 가디건', '줄무늬 스카프'], ['분홍 꽈배기 가디건', '체크 스카프']],
];
export const berrySetItems = sets.map(([motif, name, en, price, color, blue, rasp]) => ({
  id: `berry-set-${motif}`, kind: 'clothes' as const, slot: 'body' as const, name: `베리 ${name}`, en: `Berry ${en}`, price, motif, color,
  clothes: blue[0] === rasp[0] ? blue[0] : `${blue[0]} / ${rasp[0]}`,
  accessories: blue[1] === rasp[1] ? blue[1] : `${blue[1]} / ${rasp[1]}`,
  looks: {'berry-blue': {clothes: blue[0], accessories: blue[1]}, 'berry-rasp': {clothes: rasp[0], accessories: rasp[1]}},
}));
export const berrySet = (id?: string) => berrySetItems.find(set => set.id === id);
export const isBerryItem = (id: string) => id.startsWith('berry-set-');
export function berryBodyState(body?: string) {return berrySet(body)?.motif || 'bare';}
export const berryStates = ['bare', ...sets.map(set => set[0])];
/** Remote object path, e.g. my-space/berry/v1/berry-blue/haenyeo.webp */
export const berryObject = (pet: BerryId, state: string) => `${BERRY_STORAGE.prefix}/${pet}/${state}.webp`;
export function berrySprite(pet: BerryId, body?: string) {
  return `${BERRY_ROOT}${encodeURIComponent(berryObject(pet, berryBodyState(body)))}?alt=media&token=${BERRY_STORAGE.token}`;
}
export const berryPetFromArt = (src?: string) => berryPets.find(pet => src?.startsWith(BERRY_ROOT + encodeURIComponent(`${BERRY_STORAGE.prefix}/${pet.id}/`)));
