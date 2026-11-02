/** Two companions share products, while their fitted artwork stays independent. */
export const SEAHORSE_ROOT = '/my-space/seahorse/v1';
export const seahorsePets = [
  {id: 'animal-seahorse-butter', name: '버터빛 아기 해마', buddyName: '해솔', en: 'Haesol', color: '#f3cc63', trait: '작은 발견을 반짝이는 눈으로 바라보는 바다 친구', hello: ['오늘은 어떤 반짝임을 찾을까?', '작은 지느러미로도 함께 멀리 갈 수 있어!', '네 이야기에 귀 기울이고 있어.']},
  {id: 'animal-seahorse-lilac', name: '보랏빛 아기 해마', buddyName: '별몽', en: 'Byeolmong', color: '#b7a0df', trait: '포근한 상상을 함께 나누는 보랏빛 바다 친구', hello: ['오늘의 상상을 조개에 담아 볼까?', '네 마음이 편안해지도록 옆에 있을게.', '작은 꿈도 반짝반짝 빛나고 있어.']},
] as const;
export type SeahorseId = typeof seahorsePets[number]['id'];
export const isSeahorse = (pet: string): pet is SeahorseId => seahorsePets.some(item => item.id === pet);
export const seahorsePoses = ['rest', 'raised'] as const;
export type SeahorsePose = typeof seahorsePoses[number];
export const normalizeSeahorsePose = (pose: unknown): SeahorsePose => pose === 'raised' ? 'raised' : 'rest';
export const seahorseBodyItems = [
  {id: 'seahorse-body-overalls', kind: 'clothes', slot: 'body', name: '해마 소풍 멜빵옷', en: 'Seahorse picnic overalls', price: 50, motif: 'overalls', color: '#93b7d4'},
  {id: 'seahorse-body-pajamas', kind: 'clothes', slot: 'body', name: '해마 별빛 잠옷', en: 'Seahorse starlight pajamas', price: 40, motif: 'pajamas', color: '#b7a0df'},
  {id: 'seahorse-body-sailor', kind: 'clothes', slot: 'body', name: '해마 바다 세일러복', en: 'Seahorse sailor shirt', price: 45, motif: 'sailor', color: '#526d93'},
  {id: 'seahorse-body-knit', kind: 'clothes', slot: 'body', name: '해마 복숭아 니트', en: 'Seahorse peach knit', price: 35, motif: 'knit', color: '#e6a8b5'},
] as const;
export type SeahorseBody = 'bare' | typeof seahorseBodyItems[number]['motif'];
export const seahorseBodyState = (body?: string): SeahorseBody => seahorseBodyItems.find(item => item.id === body)?.motif || 'bare';
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
export function seahorseSprite(pet: SeahorseId, pose?: unknown, body?: string) {
  return `${SEAHORSE_ROOT}/${pet}/poses/${normalizeSeahorsePose(pose)}/${seahorseBodyState(body)}.webp`;
}
export function seahorseAccessoryArt(id: string, pet: string = seahorsePets[0].id) {
  return isSeahorse(pet) && seahorseAccessoryItems.some(item => item.id === id)
    ? `${SEAHORSE_ROOT}/${pet}/accessories/${id.slice('seahorse-'.length)}.webp` : undefined;
}
