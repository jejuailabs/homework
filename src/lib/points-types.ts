import {whitekneeAccessoryItems, type WhitekneePose} from '../modules/my-space/whiteknee';

export type WardrobeSlot = 'head' | 'face' | 'neck' | 'background' | 'frame';
export type WardrobeOutfit = Partial<Record<WardrobeSlot, string>>;
export type WardrobeItem = {id: string; slot: WardrobeSlot; ko: string; en: string; price: number; color: string; motif: string};
/** Original CSS/SVG decorations. Prices are re-resolved from this catalogue on the server. */
export const wardrobeCatalog: WardrobeItem[] = [
  ...whitekneeAccessoryItems,
  {"id":"junior-head-beret","slot":"head","ko":"보송 별 베레모","en":"Fluffy star beret","price":40,"color":"#b5a0d2","motif":"beret"},
  {"id":"junior-head-crown","slot":"head","ko":"보송 별빛 왕관","en":"Fluffy starlight crown","price":60,"color":"#e5b95d","motif":"crown"},
  {"id":"junior-head-flower","slot":"head","ko":"보송 복숭아 꽃핀","en":"Fluffy peach blossom","price":25,"color":"#eea3ad","motif":"flower"},
  {"id":"junior-head-beanie","slot":"head","ko":"보송 민트 방울모자","en":"Fluffy mint beanie","price":40,"color":"#a5c9b4","motif":"beanie"},
  {"id":"junior-head-party","slot":"head","ko":"보송 살구 고깔모자","en":"Fluffy apricot party hat","price":35,"color":"#efaa93","motif":"party"},
  {"id":"junior-neck-bow","slot":"neck","ko":"보송 딸기 리본","en":"Fluffy strawberry bow","price":25,"color":"#e794a6","motif":"bow"},
  {"id":"junior-neck-scarf","slot":"neck","ko":"보송 하늘 목도리","en":"Fluffy sky scarf","price":45,"color":"#a8bedb","motif":"scarf"},
  {"id":"junior-neck-bandana","slot":"neck","ko":"보송 노란 반다나","en":"Fluffy yellow bandana","price":35,"color":"#f0d17e","motif":"bandana"},
  {"id":"junior-neck-moon","slot":"neck","ko":"보송 달빛 목걸이","en":"Fluffy moon pendant","price":50,"color":"#a5adbf","motif":"moon"},
  {id: 'head-sprout', slot: 'head', ko: '새싹 친구', en: 'Little sprout', price: 0, color: '#7baa68', motif: 'sprout'},
  {id: 'head-crown', slot: 'head', ko: '별빛 왕관', en: 'Starlight crown', price: 60, color: '#e5ad45', motif: 'crown'},
  {id: 'head-beret', slot: 'head', ko: '화가 베레모', en: 'Artist beret', price: 40, color: '#aa7ba9', motif: 'beret'},
  {id: 'head-party', slot: 'head', ko: '축제 모자', en: 'Party hat', price: 35, color: '#e89984', motif: 'party'},
  {id: 'head-flower', slot: 'head', ko: '꽃 한 송이', en: 'Tiny blossom', price: 25, color: '#d888a9', motif: 'flower'},
  {id: 'neck-bow', slot: 'neck', ko: '리본 나비', en: 'Ribbon bow', price: 25, color: '#d6828c', motif: 'bow'},
  {id: 'neck-scarf', slot: 'neck', ko: '포근한 목도리', en: 'Cozy scarf', price: 45, color: '#74a9a0', motif: 'scarf'},
  {id: 'neck-medal', slot: 'neck', ko: '도전 메달', en: 'Adventure medal', price: 50, color: '#d9a949', motif: 'medal'},
  {id: 'neck-bandana', slot: 'neck', ko: '탐험가 스카프', en: 'Explorer scarf', price: 35, color: '#799ec7', motif: 'bandana'},
  {id: 'background-cloud', slot: 'background', ko: '구름 쉼터', en: 'Cloud nook', price: 0, color: '#e6f0f1', motif: 'cloud'},
  {id: 'background-garden', slot: 'background', ko: '작은 정원', en: 'Little garden', price: 50, color: '#deecd1', motif: 'garden'},
  {id: 'background-sea', slot: 'background', ko: '보말 바다', en: 'Bomal beach', price: 55, color: '#d7edf0', motif: 'sea'},
  {id: 'background-night', slot: 'background', ko: '별 헤는 밤', en: 'Starry night', price: 70, color: '#555b86', motif: 'night'},
  {id: 'background-peach', slot: 'background', ko: '복숭아 노을', en: 'Peach sunset', price: 40, color: '#f5d4c5', motif: 'peach'},
  {id: 'frame-soft', slot: 'frame', ko: '포근한 테두리', en: 'Soft frame', price: 0, color: '#d8cebd', motif: 'soft'},
  {id: 'frame-rainbow', slot: 'frame', ko: '무지개 길', en: 'Rainbow trail', price: 60, color: '#b698ce', motif: 'rainbow'},
  {id: 'frame-stars', slot: 'frame', ko: '반짝 별', en: 'Sparkling stars', price: 45, color: '#d2ae60', motif: 'stars'},
  {id: 'frame-leaves', slot: 'frame', ko: '초록 잎사귀', en: 'Green leaves', price: 40, color: '#7fa477', motif: 'leaves'},
  {id: 'frame-bubbles', slot: 'frame', ko: '비눗방울', en: 'Bubbles', price: 35, color: '#8ebec9', motif: 'bubbles'},
];
export const starterWardrobeIds = wardrobeCatalog.filter(item => item.price === 0).map(item => item.id);
export type PointSettings = {enabled: boolean; label: string; rules: {homework: number}};
export const defaultPointSettings: PointSettings = {enabled: false, label: '보말', rules: {homework: 10}};
export type PointBalanceState = {classId: string; studentId: string; points: number; earned: number; settings: PointSettings};
export type PointGrantResult = {count: number; repeated: boolean; students: {id: string; points: number; pointsEarnedTotal: number}[]};
export type PointLedgerEntry = {id: string; amount: number; kind: 'earn' | 'spend' | 'revoke'; source: 'manual' | 'homework' | 'wardrobe' | 'myspace' | 'revoke' | 'daily-quiz' | 'playground' | 'lesson-review'; sourceId: string; reason: string; balanceAfter: number; createdAt: string};
export type TeacherPointLedgerEntry = PointLedgerEntry & {studentId: string; studentName: string; studentNumber: number};
export type TeacherPointHistory = {ledger: TeacherPointLedgerEntry[]; nextCursor: string | null};
export type PointStudent = {id: string; name: string; number: number; character: string; points: number; pointsEarnedTotal: number; wardrobeOwned: string[]; wardrobeOutfit: WardrobeOutfit; disabled: boolean};
export type StudentPointsState = {settings: PointSettings; student: PointStudent; ledger: PointLedgerEntry[]; nextCursor: string | null;mySpaceEnabled?:boolean;spaceCompanion?:{pet?:string;art?:string;name:string;pose?:WhitekneePose;outfit:Partial<Record<'body'|'bag',string>>}|null};
