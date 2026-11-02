/** Two companions share products, while their fitted artwork stays independent. */
export const SEAHORSE_ROOT = '/my-space/seahorse/v2';
export const seahorsePets = [
  {id: 'animal-seahorse-butter', name: '버터빛 아기 해마', buddyName: '해솔', en: 'Haesol', color: '#f3cc63', trait: '작은 발견을 반짝이는 눈으로 바라보는 바다 친구', hello: ['오늘은 어떤 반짝임을 찾을까?', '작은 지느러미로도 함께 멀리 갈 수 있어!', '네 이야기에 귀 기울이고 있어.']},
  {id: 'animal-seahorse-lilac', name: '보랏빛 아기 해마', buddyName: '별몽', en: 'Byeolmong', color: '#b7a0df', trait: '포근한 상상을 함께 나누는 보랏빛 바다 친구', hello: ['오늘의 상상을 조개에 담아 볼까?', '네 마음이 편안해지도록 옆에 있을게.', '작은 꿈도 반짝반짝 빛나고 있어.']},
] as const;
export type SeahorseId = typeof seahorsePets[number]['id'];
export const isSeahorse = (pet: string): pet is SeahorseId => seahorsePets.some(item => item.id === pet);
export const seahorsePoses = ['rest'] as const;
export type SeahorsePose = 'rest';
export const normalizeSeahorsePose = (_pose?: unknown): SeahorsePose => 'rest';
export const seahorseBodyItems = [
  {id: 'seahorse-body-overalls', kind: 'clothes', slot: 'body', name: '해마 소풍 멜빵옷', en: 'Seahorse picnic overalls', price: 50, motif: 'overalls', color: '#93b7d4'},
  {id: 'seahorse-body-pajamas', kind: 'clothes', slot: 'body', name: '해마 별빛 잠옷', en: 'Seahorse starlight pajamas', price: 40, motif: 'pajamas', color: '#b7a0df'},
  {id: 'seahorse-body-sailor', kind: 'clothes', slot: 'body', name: '해마 바다 세일러복', en: 'Seahorse sailor shirt', price: 45, motif: 'sailor', color: '#526d93'},
  {id: 'seahorse-body-knit', kind: 'clothes', slot: 'body', name: '해마 복숭아 니트', en: 'Seahorse peach knit', price: 35, motif: 'knit', color: '#e6a8b5'},
] as const;

export const seahorseAccessoryItems = [
  {id: 'seahorse-head-beanie', slot: 'head', ko: '해마 포근 방울모자', en: 'Seahorse cozy beanie', price: 40, motif: 'beanie', color: '#e9dbc3'},
  {id: 'seahorse-head-sleep', slot: 'head', ko: '해마 별 수면모자', en: 'Seahorse star sleep cap', price: 30, motif: 'sleep', color: '#b7a0df'},
  {id: 'seahorse-head-bow', slot: 'head', ko: '해마 복숭아 리본', en: 'Seahorse peach bow', price: 25, motif: 'bow', color: '#e8a2a0'},
  {id: 'seahorse-head-sailor', slot: 'head', ko: '해마 꼬마 선원 모자', en: 'Seahorse sailor cap', price: 35, motif: 'sailor', color: '#526d93'},
  {id: 'seahorse-face-glasses', slot: 'face', ko: '해마 동그란 안경', en: 'Seahorse round glasses', price: 35, motif: 'glasses', color: '#946946'},
  {id: 'seahorse-face-goggles', slot: 'face', ko: '해마 파란 물안경', en: 'Seahorse blue goggles', price: 40, motif: 'goggles', color: '#91c8e4'},
  {id: 'seahorse-neck-scarf', slot: 'neck', ko: '해마 포근 목도리', en: 'Seahorse cozy scarf', price: 45, motif: 'scarf', color: '#e6a8b5'},
  {id: 'seahorse-neck-shell', slot: 'neck', ko: '해마 진주 조개 목걸이', en: 'Seahorse pearl shell necklace', price: 40, motif: 'shell', color: '#eedabb'},
] as const;
export type SeahorseAccessoryId = typeof seahorseAccessoryItems[number]['id'];

/** Each set is one fully dressed character image; its parts are descriptive, never layers. */
export const seahorseSetItems = [
  {
    "id": "seahorse-set-scholar",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 소풍하는 책벌레 세트",
    "en": "Picnic scholar set",
    "price": 50,
    "motif": "scholar",
    "clothes": "데님 멜빵옷",
    "accessories": "동그란 안경 · 크림 가방",
    "color": "#93b7d4"
  },
  {
    "id": "seahorse-set-dreamy",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 별빛 꿈나라 세트",
    "en": "Starlight dreamer set",
    "price": 40,
    "motif": "dreamy",
    "clothes": "보라 별 잠옷",
    "accessories": "별 수면모자",
    "color": "#b7a0df"
  },
  {
    "id": "seahorse-set-captain",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 꼬마 바다 선장 세트",
    "en": "Little sea captain set",
    "price": 45,
    "motif": "captain",
    "clothes": "줄무늬 세일러복",
    "accessories": "선원 모자 · 조개 브로치",
    "color": "#526d93"
  },
  {
    "id": "seahorse-set-winter",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 포근한 겨울 산책 세트",
    "en": "Cozy winter walk set",
    "price": 45,
    "motif": "winter",
    "clothes": "복숭아 니트",
    "accessories": "방울모자 · 분홍 목도리",
    "color": "#e6a8b5"
  },
  {
    "id": "seahorse-set-ribbon",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 복숭아 리본 요정 세트",
    "en": "Peach ribbon fairy set",
    "price": 40,
    "motif": "ribbon",
    "clothes": "복숭아 물결 원피스",
    "accessories": "복숭아 리본 · 진주 목걸이",
    "color": "#e8a2a0"
  },
  {
    "id": "seahorse-set-diver",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 산호초 탐험대 세트",
    "en": "Coral reef diver set",
    "price": 50,
    "motif": "diver",
    "clothes": "파란 잠수복",
    "accessories": "물안경 · 스노클",
    "color": "#91c8e4"
  },
  {
    "id": "seahorse-set-explorer",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 두근두근 탐험가 세트",
    "en": "Little explorer set",
    "price": 50,
    "motif": "explorer",
    "clothes": "모래빛 탐험 조끼",
    "accessories": "탐험 모자 · 갈색 가방",
    "color": "#bb9a70"
  },
  {
    "id": "seahorse-set-chef",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 달콤한 바다 요리사 세트",
    "en": "Sweet sea chef set",
    "price": 45,
    "motif": "chef",
    "clothes": "크림 요리사복",
    "accessories": "요리사 모자 · 빨간 스카프",
    "color": "#e8d6b9"
  },
  {
    "id": "seahorse-set-rain",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 빗방울 소풍 세트",
    "en": "Rainy day picnic set",
    "price": 45,
    "motif": "rain",
    "clothes": "노란 우비",
    "accessories": "노란 모자 · 청록 가방",
    "color": "#efc64e"
  },
  {
    "id": "seahorse-set-artist",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 꿈을 그리는 화가 세트",
    "en": "Dream painter set",
    "price": 45,
    "motif": "artist",
    "clothes": "민트 작업복",
    "accessories": "보라 베레모 · 주머니 연필",
    "color": "#a3c6b4"
  },
  {
    "id": "seahorse-set-gardener",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 꽃밭의 작은 정원사 세트",
    "en": "Little gardener set",
    "price": 45,
    "motif": "gardener",
    "clothes": "세이지 멜빵옷",
    "accessories": "꽃 밀짚모자 · 꽃 브로치",
    "color": "#9aaf84"
  },
  {
    "id": "seahorse-set-wizard",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 달빛 꼬마 마법사 세트",
    "en": "Moonlight wizard set",
    "price": 55,
    "motif": "wizard",
    "clothes": "남색 별 망토",
    "accessories": "별 마법모자 · 달 목걸이",
    "color": "#536099"
  },
  {
    "id": "seahorse-set-hero",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 바다를 지키는 영웅 세트",
    "en": "Little sea hero set",
    "price": 50,
    "motif": "hero",
    "clothes": "파란 영웅복",
    "accessories": "빨간 망토 · 별 배지",
    "color": "#5b94c9"
  },
  {
    "id": "seahorse-set-musician",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 조개빛 음악가 세트",
    "en": "Seashell musician set",
    "price": 45,
    "motif": "musician",
    "clothes": "자주색 조끼",
    "accessories": "크림 나비넥타이 · 헤드폰",
    "color": "#a383b9"
  },
  {
    "id": "seahorse-set-sport",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 신나는 바다 운동회 세트",
    "en": "Seaside sports day set",
    "price": 45,
    "motif": "sport",
    "clothes": "청록 운동 재킷",
    "accessories": "선캡 · 보라 목도리",
    "color": "#8bbab2"
  },
  {
    "id": "seahorse-set-party",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 생일 축하 파티 세트",
    "en": "Birthday party set",
    "price": 40,
    "motif": "party",
    "clothes": "아이보리 파티 셔츠",
    "accessories": "고깔모자 · 복숭아 나비넥타이",
    "color": "#efc0a3"
  },
  {
    "id": "seahorse-set-royal",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 진주 궁전의 왕자 세트",
    "en": "Pearl palace royal set",
    "price": 55,
    "motif": "royal",
    "clothes": "크림 왕실 망토",
    "accessories": "금빛 왕관 · 진주 목걸이",
    "color": "#dfc282"
  },
  {
    "id": "seahorse-set-flower",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 봄꽃 바다 산책 세트",
    "en": "Spring flower walk set",
    "price": 45,
    "motif": "flower",
    "clothes": "복숭아 카디건",
    "accessories": "꽃 머리띠 · 조개 목걸이",
    "color": "#eab4a4"
  },
  {
    "id": "seahorse-set-bedtime",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 잘 자요 작은 별 세트",
    "en": "Goodnight little star set",
    "price": 40,
    "motif": "bedtime",
    "clothes": "크림 잠옷",
    "accessories": "보라 보닛 · 분홍 리본",
    "color": "#c1afd3"
  },
  {
    "id": "seahorse-set-holiday",
    "kind": "clothes",
    "slot": "body",
    "name": "해마 선물 배달 산타 세트",
    "en": "Little holiday Santa set",
    "price": 50,
    "motif": "holiday",
    "clothes": "빨간 산타 코트",
    "accessories": "산타 모자 · 초록 나비넥타이",
    "color": "#c86360"
  }
] as const;

const legacySets: Record<string, string> = {
  'seahorse-body-overalls': 'scholar', 'seahorse-body-pajamas': 'dreamy',
  'seahorse-body-sailor': 'captain', 'seahorse-body-knit': 'winter',
  'seahorse-head-beanie': 'winter', 'seahorse-head-sleep': 'dreamy',
  'seahorse-head-bow': 'ribbon', 'seahorse-head-sailor': 'captain',
  'seahorse-face-glasses': 'scholar', 'seahorse-face-goggles': 'diver',
  'seahorse-neck-scarf': 'winter', 'seahorse-neck-shell': 'ribbon',
};
export const isRetiredSeahorseItem = (id: string) => Object.hasOwn(legacySets, id);
export function seahorseSet(id?: string) {
  return seahorseSetItems.find(item => item.id === id || (id && item.motif === legacySets[id]));
}
/** Preserve purchases from the earlier split wardrobe without charging again. */
export function unlockedSeahorseSets(spaceOwned: unknown, wardrobeOwned?: unknown): string[] {
  const old = [...(Array.isArray(spaceOwned) ? spaceOwned : []), ...(Array.isArray(wardrobeOwned) ? wardrobeOwned : [])];
  return [...new Set(old.flatMap(id => typeof id === 'string' && legacySets[id] ? ['seahorse-set-' + legacySets[id]] : []))];
}
export type SeahorseBody = 'bare' | typeof seahorseSetItems[number]['motif'];
export const seahorseBodyState = (body?: string): SeahorseBody => seahorseSet(body)?.motif || 'bare';
export function seahorseSprite(pet: SeahorseId, _pose?: unknown, body?: string) {
  return `${SEAHORSE_ROOT}/${pet}/${seahorseBodyState(body)}.webp`;
}
/** Old IDs remain readable for inventory/receipts, but have no independent artwork. */
export function seahorseAccessoryArt(_id: string, _pet?: string): string | undefined {return undefined;}
