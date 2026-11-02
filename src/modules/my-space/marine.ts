import {seahorseSetItems} from './seahorse';

export const MARINE_ROOT = '/my-space/marine/v1';
export const marineFamilies = [
  {id: 'dolphin', ko: '돌고래', en: 'Dolphin', title: '파도·로지의 돌고래 옷장', friends: '파도와 로지', badge: '돌고래 전용'},
  {id: 'crab', ko: '꽃게', en: 'Crab', title: '라비·집콩의 꽃게 옷장', friends: '라비와 집콩', badge: '꽃게 전용'},
  {id: 'jellyfish', ko: '해파리', en: 'Jellyfish', title: '루미·오로라의 해파리 옷장', friends: '루미와 오로라', badge: '해파리 전용'},
] as const;
export type MarineFamily = typeof marineFamilies[number]['id'];
/** The selected concept numbers are recorded beside each permanent companion ID. */
export const marinePets = [
  {id: 'animal-dolphin-blue', family: 'dolphin', concept: 1, name: '하늘빛 아기 돌고래', buddyName: '파도', en: 'Pado', color: '#89bce9', trait: '새로운 발견을 함께 찾아가는 명랑한 바다 친구', hello: ['작은 파도를 타고 같이 가 볼까?', '오늘도 네 편에서 응원할게!', '네가 오니까 마음이 반짝여!']},
  {id: 'animal-dolphin-pink', family: 'dolphin', concept: 2, name: '분홍빛 아기 돌고래', buddyName: '로지', en: 'Rosie', color: '#edabc1', trait: '다정한 마음을 하트처럼 나누는 분홍 친구', hello: ['네 이야기 한 조각 들려줄래?', '작은 기쁨도 같이 나누면 더 커져.', '오늘 네 마음은 어떤 색일까?']},
  {id: 'animal-crab-lilac', family: 'crab', concept: 3, name: '보랏빛 아기 꽃게', buddyName: '라비', en: 'Lavi', color: '#b8a1de', trait: '호기심을 집게에 살짝 담아 오는 꼬마 탐험가', hello: ['오늘의 보물을 함께 찾아보자!', '옆으로 한 걸음, 새로운 발견!', '작은 도전도 내가 응원할게.']},
  {id: 'animal-crab-butter', family: 'crab', concept: 5, name: '노랑 아기 꽃게', buddyName: '집콩', en: 'Jipkong', color: '#efd06c', trait: '따뜻한 응원을 꼭꼭 모아 주는 작은 꽃게', hello: ['작은 성취를 하나씩 모아 보자.', '네가 해낸 오늘이 정말 반짝여!', '동글동글한 기쁨을 나눠 줄게.']},
  {id: 'animal-jellyfish-lilac', family: 'jellyfish', concept: 3, name: '별빛 보라 해파리', buddyName: '루미', en: 'Lumi', color: '#bda3ea', trait: '보랏빛 별처럼 상상을 밝혀 주는 해파리', hello: ['오늘의 상상을 별에 담아 볼까?', '천천히 떠다녀도 괜찮아.', '작은 꿈도 함께하면 반짝여.']},
  {id: 'animal-jellyfish-rainbow', family: 'jellyfish', concept: 6, name: '무지갯빛 아기 해파리', buddyName: '오로라', en: 'Aurora', color: '#d7b8e4', trait: '여러 가지 마음을 무지갯빛으로 안아 주는 친구', hello: ['오늘의 마음도 예쁜 색이야.', '다른 색이 모여 더 예쁜 우리가 돼.', '네 상상을 무지개로 이어 보자.']},
] as const;
export type MarineId = typeof marinePets[number]['id'];
export const marinePet = (id: string) => marinePets.find(p => p.id === id);
export const isMarine = (id: string): id is MarineId => !!marinePet(id);
export const marineFamily = (pet: string) => marineFamilies.find(f => f.id === marinePet(pet)?.family);
export const marineItemFamily = (id: string) => marineFamilies.find(f => id.startsWith(f.id + '-set-'))?.id;

const jellyClothes: Record<string, string> = {
  scholar: '데님 멜빵 케이프', dreamy: '보라 별 잠옷 케이프', captain: '줄무늬 세일러 케이프', winter: '복숭아 니트 케이프', ribbon: '복숭아 물결 케이프', diver: '파란 다이빙 케이프', explorer: '탐험 조끼 케이프', chef: '크림 앞치마 케이프', rain: '노란 비옷 케이프', artist: '민트 작업 케이프', gardener: '세이지 정원사 케이프', wizard: '남색 별 망토', hero: '파란 영웅 케이프', musician: '자주색 음악가 케이프', sport: '청록 운동 케이프', party: '아이보리 파티 케이프', royal: '크림 왕실 망토', flower: '복숭아 꽃 케이프', bedtime: '크림 잠옷 케이프', holiday: '빨간 산타 케이프',
};
/** Each species shares 20 products between its pair, with separate fitted images. */
export const marineSetItems = marineFamilies.flatMap(f => seahorseSetItems.map(set => ({
  ...set,
  id: `${f.id}-set-${set.motif}`,
  family: f.id,
  name: `${f.ko} ${set.name.replace(/^해마 /, '')}`,
  en: `${f.en} ${set.en}`,
  clothes: f.id === 'jellyfish' ? jellyClothes[set.motif] : set.clothes,
})));
export const marineSet = (id?: string) => marineSetItems.find(set => set.id === id);
export function marineBodyState(pet: string, body?: string) {
  const set = marineSet(body);
  return set && set.family === marinePet(pet)?.family ? set.motif : 'bare';
}
export function marineSprite(pet: MarineId, body?: string) {
  return `${MARINE_ROOT}/${pet}/${marineBodyState(pet, body)}.webp`;
}
