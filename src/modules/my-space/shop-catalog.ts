import {wardrobeCatalog} from '@/lib/points-types';
import {spaceCatalog, type SpaceItem, type SpaceKind} from './catalog';

// Keep the original IDs and prices: both shops use the same wardrobe ownership.
export const accessoryCatalog = wardrobeCatalog.filter(item => item.slot === 'head' || item.slot === 'neck');
export type AccessoryItem = {id: string; kind: 'accessory'; slot: 'head' | 'neck'; name: string; en: string; price: number};
export type ShopItem = SpaceItem | AccessoryItem;
export type ShopKind = SpaceKind | 'accessory';
export const shopCategories: [ShopKind, string][] = [['pet', '동물 친구'], ['clothes', '옷과 가방'], ['accessory', '액세서리'], ['furniture', '가구와 소품'], ['theme', '방 배경'], ['sticker', '다꾸 조각'], ['paper', '노트 배경']];
export const shopCatalog: ShopItem[] = [...spaceCatalog, ...accessoryCatalog.map(item => ({id: item.id, kind: 'accessory' as const, slot: item.slot as 'head' | 'neck', name: item.ko, en: item.en, price: item.price}))];
export function wearableItem(item: ShopItem) {return item.kind === 'clothes' || item.kind === 'accessory';}
