/** Shared, browser-safe metadata for Whiteknee and its exclusive wardrobe. */
export const WHITEKNEE_ID = 'animal-whiteknee';
export const WHITEKNEE_ROOT = '/my-space/whiteknee/v1';
export const whitekneePoses = ['rest', 'raised'] as const;
export type WhitekneePose = typeof whitekneePoses[number];
export const normalizeWhitekneePose = (pose: unknown): WhitekneePose => pose === 'raised' ? 'raised' : 'rest';
export const isWhiteknee = (pet: string) => pet === WHITEKNEE_ID;

export const whitekneeBodyItems = [
  {id: 'whiteknee-body-explorer', kind: 'clothes', slot: 'body', name: '화이트니 숲속 탐험 조끼', en: 'Whiteknee explorer vest', price: 45, motif: 'explorer', color: '#a98b62'},
  {id: 'whiteknee-body-chef', kind: 'clothes', slot: 'body', name: '화이트니 꼬마 셰프 앞치마', en: 'Whiteknee little chef apron', price: 35, motif: 'chef', color: '#f0e8d9'},
  {id: 'whiteknee-body-pajamas', kind: 'clothes', slot: 'body', name: '화이트니 별빛 잠옷', en: 'Whiteknee starlight pajamas', price: 40, motif: 'pajamas', color: '#b5a0d2'},
  {id: 'whiteknee-body-hero', kind: 'clothes', slot: 'body', name: '화이트니 빨간 망토 히어로복', en: 'Whiteknee blue hero suit with red cape', price: 45, motif: 'hero', color: '#458fd1'},
] as const;

export const whitekneeAccessoryItems = [
  {id: 'whiteknee-head-explorer', slot: 'head', ko: '화이트니 탐험 모자', en: 'Whiteknee explorer hat', price: 35, motif: 'explorer', color: '#b58c5b'},
  {id: 'whiteknee-head-sprout', slot: 'head', ko: '화이트니 새싹 핀', en: 'Whiteknee sprout pin', price: 20, motif: 'sprout', color: '#8aaf63'},
  {id: 'whiteknee-head-chef', slot: 'head', ko: '화이트니 셰프 모자', en: 'Whiteknee chef hat', price: 30, motif: 'chef', color: '#f4eee2'},
  {id: 'whiteknee-head-sleep', slot: 'head', ko: '화이트니 별 수면모자', en: 'Whiteknee star sleep cap', price: 30, motif: 'sleep', color: '#aa91ca'},
  {id: 'whiteknee-head-bow', slot: 'head', ko: '화이트니 핑크 아이돌 리본', en: 'Whiteknee pink idol bow', price: 25, motif: 'bow', color: '#ee94bb'},
  {id: 'whiteknee-neck-scarf', slot: 'neck', ko: '화이트니 빨간 셰프 목수건', en: 'Whiteknee red chef neckerchief', price: 25, motif: 'scarf', color: '#db716c'},
  {id: 'whiteknee-face-glasses', slot: 'face', ko: '화이트니 동그란 안경', en: 'Whiteknee round glasses', price: 35, motif: 'glasses', color: '#6b5143'},
  {id: 'whiteknee-face-goggles', slot: 'face', ko: '화이트니 파란 물안경', en: 'Whiteknee blue swimming goggles', price: 40, motif: 'goggles', color: '#418fda'},
] as const;

export type WhitekneeBody = 'bare' | typeof whitekneeBodyItems[number]['motif'];
export type WhitekneeAccessoryId = typeof whitekneeAccessoryItems[number]['id'];

export function whitekneeBodyState(body?: string): WhitekneeBody {
  return whitekneeBodyItems.find(item => item.id === body)?.motif || 'bare';
}

export function whitekneeSprite(pose: WhitekneePose | undefined, body?: string) {
  return `${WHITEKNEE_ROOT}/poses/${normalizeWhitekneePose(pose)}/${whitekneeBodyState(body)}.webp`;
}

export function whitekneeAccessoryArt(id: string) {
  return whitekneeAccessoryItems.some(item => item.id === id)
    ? `${WHITEKNEE_ROOT}/accessories/${id.replace('whiteknee-', '')}.webp`
    : undefined;
}

/** Backgrounds and frames remain shared; body, head, face and neck pieces are exclusive. */
export function whitekneeItemCompatible(pet: string, item: string | {id: string; slot?: string}) {
  const id = typeof item === 'string' ? item : item.id;
  const slot = typeof item === 'string' ? undefined : item.slot;
  if (slot === 'background' || slot === 'frame' || /^(background|frame)-/.test(id)) return true;
  return isWhiteknee(pet) === id.startsWith('whiteknee-');
}
