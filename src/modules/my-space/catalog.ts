import { characterFiles } from '@/lib/characters';
import {WHITEKNEE_ID, whitekneeBodyItems, whitekneeSprite, type WhitekneePose} from './whiteknee';
import { diaryStickers } from './diary-stickers';
import { newPets } from './new-pets';
export type SpaceKind = 'pet' | 'furniture' | 'theme' | 'clothes' | 'sticker' | 'paper';
export type SpaceItem = {
    id: string;
    kind: SpaceKind;
    name: string;
    en: string;
    price: number;
    art?: string;
    previewArt?: string;
    motif?: string;
    color?: string;
    slot?: 'body' | 'bag';
    base?: string;
    buddyName?: string;
};
const furniture = (id: string, name: string, en: string, price: number): SpaceItem => ({ id, kind: 'furniture', name, en, price, art: `/my-space/v1/${id}.webp` });
export const illustratedRoomThemes: SpaceItem[] = [
    {"id":"theme-aegean","kind":"theme","name":"레몬꽃 지중해 바다방","en":"Lemon blossom seaside room","price":80,"art":"/my-space/v6/rooms/theme-aegean.webp","previewArt":"/my-space/v6/rooms/thumbs/theme-aegean.webp"},
    {"id":"theme-kyoto","kind":"theme","name":"벚꽃 교토의 작은 찻집","en":"Cherry blossom Kyoto tea room","price":80,"art":"/my-space/v6/rooms/theme-kyoto.webp","previewArt":"/my-space/v6/rooms/thumbs/theme-kyoto.webp"},
    {"id":"theme-paris","kind":"theme","name":"파리 지붕 위 그림 다락방","en":"Paris rooftop artist attic","price":80,"art":"/my-space/v6/rooms/theme-paris.webp","previewArt":"/my-space/v6/rooms/thumbs/theme-paris.webp"},
    {"id":"theme-riad","kind":"theme","name":"별빛 모로코 타일 리야드","en":"Moroccan lantern riad","price":80,"art":"/my-space/v6/rooms/theme-riad.webp","previewArt":"/my-space/v6/rooms/thumbs/theme-riad.webp"},
    {"id":"theme-nordic","kind":"theme","name":"눈꽃 북유럽 숲속 오두막","en":"Nordic snowy woodland cabin","price":80,"art":"/my-space/v6/rooms/theme-nordic.webp","previewArt":"/my-space/v6/rooms/thumbs/theme-nordic.webp"},
    {"id":"theme-lagoon","kind":"theme","name":"조개빛 열대 수상집","en":"Tropical shell lagoon bungalow","price":80,"art":"/my-space/v6/rooms/theme-lagoon.webp","previewArt":"/my-space/v6/rooms/thumbs/theme-lagoon.webp"},
    {"id":"theme-magic","kind":"theme","name":"달빛이 머무는 마법 도서관","en":"Moonlit little magic library","price":80,"art":"/my-space/v6/rooms/theme-magic.webp","previewArt":"/my-space/v6/rooms/thumbs/theme-magic.webp"},
    {"id":"theme-space","kind":"theme","name":"별사탕 우주 관측실","en":"Stardust space observatory","price":80,"art":"/my-space/v6/rooms/theme-space.webp","previewArt":"/my-space/v6/rooms/thumbs/theme-space.webp"},
    {"id":"theme-coral","kind":"theme","name":"산호 궁전의 바닷속 방","en":"Coral palace undersea room","price":80,"art":"/my-space/v6/rooms/theme-coral.webp","previewArt":"/my-space/v6/rooms/thumbs/theme-coral.webp"},
    {"id":"theme-sweets","kind":"theme","name":"딸기 크림 디저트 공방","en":"Strawberry cream dessert atelier","price":80,"art":"/my-space/v6/rooms/theme-sweets.webp","previewArt":"/my-space/v6/rooms/thumbs/theme-sweets.webp"},
];
export const spaceCatalog: SpaceItem[] = [
    {id: WHITEKNEE_ID, kind: 'pet', name: '자이언트 화이트니', buddyName: '화이트니', en: 'Whiteknee', price: 60, base: 'cat', art: whitekneeSprite('rest')},
    ...whitekneeBodyItems,
    ...diaryStickers,
    ...illustratedRoomThemes,
    {"id":"junior-body-knit","kind":"clothes","slot":"body","name":"보송 딸기 니트","en":"Fluffy strawberry knit","price":35,"motif":"knit","color":"#e9a6b5"},
    {"id":"junior-body-overalls","kind":"clothes","slot":"body","name":"보송 소풍 멜빵옷","en":"Fluffy picnic overalls","price":50,"motif":"overalls","color":"#9ab6cc"},
    {"id":"junior-body-raincoat","kind":"clothes","slot":"body","name":"보송 노란 비옷","en":"Fluffy yellow raincoat","price":40,"motif":"raincoat","color":"#efcf70"},
    {"id":"junior-body-sailor","kind":"clothes","slot":"body","name":"보송 바다 세일러복","en":"Fluffy sailor suit","price":45,"motif":"sailor","color":"#96b9d2"},
    {"id":"junior-body-pajamas","kind":"clothes","slot":"body","name":"보송 별빛 잠옷","en":"Fluffy starlight pajamas","price":40,"motif":"pajamas","color":"#b9a5d3"},
    {"id":"junior-body-cape","kind":"clothes","slot":"body","name":"보송 숲속 망토","en":"Fluffy forest cape","price":45,"motif":"cape","color":"#a6baa0"},
    ...newPets.map(pet => ({id: pet.id, kind: 'pet' as const, name: pet.species, en: pet.en, buddyName: pet.name, price: 60, base: pet.base, art: pet.art})),
    ...Object.entries(characterFiles).map(([base, file]) => ({ id: 'friend-' + base, kind: 'pet' as const, name: ({ cat: '모찌', dog: '두부', hamster: '콩이', alpaca: '구름이', rabbit: '토리', otter: '모아' } as Record<string, string>)[base], en: base, price: 0, base, art: `/characters/${file}.webp` })),
    ...[['american', '아메리칸 쇼트헤어', 'American shorthair', '줄이'], ['british', '브리티시 쇼트헤어', 'British shorthair', '포포'], ['siamese', '샴', 'Siamese', '코코'], ['persian', '페르시안', 'Persian', '솜이'], ['ragdoll', '랙돌', 'Ragdoll', '라라'], ['maine', '메인쿤', 'Maine coon', '솔이']].map(([breed, name, en, buddyName]) => ({ id: 'cat-' + breed, kind: 'pet' as const, name, en, buddyName, price: 60, base: 'cat', art: `/my-space/v1/cat-${breed}.webp` })),
    furniture('bed', '포근한 낮잠 침대', 'Cozy little bed', 60), furniture('shelf', '이야기 책장', 'Story bookshelf', 50), furniture('plant', '초록 리본 화분', 'Ribbon plant', 20), furniture('lamp', '반짝 버섯 조명', 'Mushroom lamp', 35),
    { id: 'rug', kind: 'furniture', name: '구름 러그', en: 'Cloud rug', price: 0, motif: 'rug', color: '#ecd9bb' },
    { id: 'cushion', kind: 'furniture', name: '복숭아 쿠션', en: 'Peach cushion', price: 15, motif: 'cushion', color: '#f1bcad' },
    { id: 'theme-sage', kind: 'theme', name: '햇살 드는 내 방', en: 'Sunny room', price: 0, art: '/my-space/v1/room.webp' },
    { id: 'theme-peach', kind: 'theme', name: '복숭아빛 오후', en: 'Peach afternoon', price: 70, art: '/my-space/v1/room.webp', color: '#f7ddca' },
    { id: 'theme-night', kind: 'theme', name: '별이 쉬는 밤', en: 'Starry night', price: 80, art: '/my-space/v1/night.webp' },
    { id: 'body-knit', kind: 'clothes', slot: 'body', name: '딸기 우유 니트', en: 'Strawberry knit', price: 35, motif: 'knit', color: '#e5a5ac' },
    { id: 'body-sailor', kind: 'clothes', slot: 'body', name: '바다 탐험복', en: 'Little sailor', price: 45, motif: 'sailor', color: '#7cabb9' },
    { id: 'body-apron', kind: 'clothes', slot: 'body', name: '그림쟁이 앞치마', en: 'Painter apron', price: 35, motif: 'apron', color: '#d6b77f' },
    { id: 'body-raincoat', kind: 'clothes', slot: 'body', name: '햇살 노란 비옷', en: 'Sunshine raincoat', price: 40, motif: 'raincoat', color: '#efcc61' },
    { id: 'body-hoodie', kind: 'clothes', slot: 'body', name: '라벤더 포근 후드', en: 'Lavender hoodie', price: 45, motif: 'hoodie', color: '#b6a0d0' },
    { id: 'body-overalls', kind: 'clothes', slot: 'body', name: '소풍 데님 멜빵옷', en: 'Picnic denim overalls', price: 50, motif: 'overalls', color: '#648ba8' },
    { id: 'body-dino', kind: 'clothes', slot: 'body', name: '민트 꼬마 공룡옷', en: 'Mint little dinosaur', price: 55, motif: 'dino', color: '#9fbea0' },
    { id: 'body-pajamas', kind: 'clothes', slot: 'body', name: '별빛 꿈나라 잠옷', en: 'Starlight pajamas', price: 40, motif: 'pajamas', color: '#e6ddbb' },
    { id: 'bag-leaf', kind: 'clothes', slot: 'bag', name: '새싹 소풍 가방', en: 'Sprout picnic bag', price: 30, motif: 'bag', color: '#8eae82' },
    { id: 'sticker-star', kind: 'sticker', name: '반짝 별 스티커', en: 'Star sticker', price: 0, motif: '⭐' },
    { id: 'sticker-flower', kind: 'sticker', name: '봄꽃 스티커', en: 'Blossom sticker', price: 15, motif: '🌸' },
    { id: 'sticker-shell', kind: 'sticker', name: '보말 바다 스티커', en: 'Seashell sticker', price: 15, motif: '🐚' },
    { id: 'sticker-leaf', kind: 'sticker', name: '초록 잎 스티커', en: 'Leaf sticker', price: 15, motif: '🌿' },
    { id: 'sticker-bow', kind: 'sticker', name: '리본 스티커', en: 'Ribbon sticker', price: 20, motif: '🎀' },
    { id: 'tape-peach', kind: 'sticker', name: '복숭아 마스킹테이프', en: 'Peach washi tape', price: 20, motif: 'tape', color: '#e9b8a9' },
    { id: 'paper-cream', kind: 'paper', name: '크림 노트', en: 'Cream paper', price: 0, color: '#fffbee' },
    { id: 'paper-sky', kind: 'paper', name: '하늘 모눈 노트', en: 'Sky grid paper', price: 25, color: '#edf6fc' },
    { id: 'paper-sage', kind: 'paper', name: '숲속 도트 노트', en: 'Forest dot paper', price: 25, color: '#edf4e7' },
];
export const starterSpaceIds = spaceCatalog.filter(i => i.price === 0).map(i => i.id);
export const spaceItem = (id: string) => spaceCatalog.find(i => i.id === id);
export type Placement = {
    id: string;
    itemId: string;
    x: number;
    y: number;
    size: number;
    rotation: number;
    flip: boolean;
};
export type Room = {
    version: number;
    theme: string;
    pet: string;
    pose?: WhitekneePose;
    nicknames: Record<string, string>;
    outfit: Partial<Record<'body' | 'bag', string>>;
    placements: Placement[];
};
export type DiaryLayer = Placement & {
    kind: 'text' | 'sticker' | 'photo' | 'art' | 'ink';
    text?: string;
    assetId?: string;
    color?: string;
    points?: [number, number, number][];
    brush?: 'pen' | 'pencil' | 'marker';
    width?: number;
    opacity?: number;
    fontSize?: number;
    align?: 'left' | 'center' | 'right';
};
export type DiaryPage = {
    schemaVersion?: 2;
    mood?: string;
    id: string;
    version: number;
    title: string;
    date: string;
    paper: string;
    layers: DiaryLayer[];
    updatedAt: string;
};
export const defaultRoom = (character = 'cat'): Room => ({ version: 0, theme: 'theme-sage', pet: 'friend-' + character, nicknames: {}, outfit: {}, placements: [{ id: 'starter-rug', itemId: 'rug', x: 48, y: 76, size: 36, rotation: 0, flip: false }] });
