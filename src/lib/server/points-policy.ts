import {createHash} from 'node:crypto';
import {defaultPointSettings, starterWardrobeIds, wardrobeCatalog, type PointSettings, type WardrobeOutfit, type WardrobeSlot} from '../points-types';
import {ApiError, id, text} from './policy';

export function pointInteger(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new ApiError(400, '포인트 수를 확인해 주세요.', 'POINT_AMOUNT');
  return value;
}
export function pointSettings(value: unknown): PointSettings {
  const v = value && typeof value === 'object' ? value as Record<string, any> : {};
  // Ignore stored dailyCap values from older versions; teachers control rewards.
  return {enabled: v.enabled === true, label: typeof v.label === 'string' && v.label.trim() ? v.label.trim().slice(0, 16) : defaultPointSettings.label, rules: {homework: Number.isSafeInteger(v.rules?.homework) && v.rules.homework >= 0 ? v.rules.homework : 10}};
}
export function parsePointSettings(value: Record<string, any>): PointSettings {
  if (typeof value.enabled !== 'boolean') throw new ApiError(400, '사용 설정을 확인해 주세요.', 'POINT_SETTINGS');
  return {enabled: value.enabled, label: text(value.label, '포인트 이름', 16), rules: {homework: pointInteger(value.rules?.homework, 0, Number.MAX_SAFE_INTEGER)}};
}
export function pointBalance(value: unknown) {return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;}
export function wardrobeOwnership(value: unknown): string[] {return [...new Set([...starterWardrobeIds, ...(Array.isArray(value) ? value.filter(v => typeof v === 'string' && wardrobeCatalog.some(item => item.id === v)) : [])])];}
export function wardrobeOutfit(value: unknown, owned: unknown): WardrobeOutfit {
  const result: WardrobeOutfit = {}, ownership = wardrobeOwnership(owned);
  if (!value || typeof value !== 'object') return result;
  for (const [slot, itemId] of Object.entries(value)) if (ownership.includes(itemId as string) && wardrobeCatalog.some(item => item.id === itemId && item.slot === slot)) result[slot as WardrobeSlot] = itemId;
  return result;
}
export function wardrobeItem(itemId: unknown) {
  const item = wardrobeCatalog.find(item => item.id === id(itemId));
  if (!item) throw new ApiError(404, '꾸미기 아이템을 찾을 수 없어요.', 'ITEM_NOT_FOUND');
  return item;
}
export function pointLedgerId(source: 'manual' | 'homework' | 'wardrobe' | 'revoke', sourceId: string, studentId: string) {return createHash('sha256').update(JSON.stringify([source, sourceId, studentId])).digest('hex');}
export function pointAwardDecision(settings: PointSettings, balance: number, amount: number) {
  if (!settings.enabled) throw new ApiError(409, '선생님이 포인트 꾸미기를 켜면 사용할 수 있어요.', 'POINTS_DISABLED');
  pointInteger(amount, 1, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(balance + amount)) throw new ApiError(409, '포인트 잔액을 확인해 주세요.', 'POINT_BALANCE');
  return {balance: balance + amount};
}
export function pointRevokeDecision(balance: number, amount: number) {
  pointInteger(amount, 1, Number.MAX_SAFE_INTEGER);
  if (balance < amount) throw new ApiError(409, '현재 잔액보다 많이 회수할 수 없어요.', 'POINT_REVOKE_INSUFFICIENT');
  return {balance: balance - amount};
}
export function pointPurchaseDecision(balance: number, owned: unknown, itemId: unknown) {
  const item = wardrobeItem(itemId), ownership = wardrobeOwnership(owned);
  if (ownership.includes(item.id)) return {item, balance, owned: ownership, purchased: false};
  if (balance < item.price) throw new ApiError(409, '포인트를 조금 더 모아 주세요.', 'POINTS_INSUFFICIENT');
  return {item, balance: balance - item.price, owned: [...ownership, item.id], purchased: true};
}
export function equipWardrobe(current: unknown, owned: unknown, slot: unknown, itemId: unknown) {
  if (!['head', 'neck', 'background', 'frame'].includes(slot as string)) throw new ApiError(400, '꾸미기 위치를 확인해 주세요.', 'WARDROBE_SLOT');
  const outfit = wardrobeOutfit(current, owned);
  if (itemId === null) {delete outfit[slot as WardrobeSlot]; return outfit;}
  const item = wardrobeItem(itemId);
  if (item.slot !== slot || !wardrobeOwnership(owned).includes(item.id)) throw new ApiError(403, '보유한 아이템만 착용할 수 있어요.', 'ITEM_NOT_OWNED');
  return {...outfit, [slot as string]: item.id};
}
