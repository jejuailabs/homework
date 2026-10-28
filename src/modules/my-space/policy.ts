import { spaceCatalog, spaceItem, starterSpaceIds, type Room, type Placement, type DiaryPage, type DiaryLayer } from './catalog';
import {isWhiteknee, normalizeWhitekneePose, whitekneeItemCompatible, whitekneePoses} from './whiteknee';
export class SpaceError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export const ownedItems = (v: unknown) => [...new Set([...starterSpaceIds, ...(Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!spaceItem(s)) : [])])];
export function growth(earned: number, adopted = 0) { const total = Math.max(0, earned - adopted); return { stage: total >= 200 ? 2 : total >= 60 ? 1 : 0, total, next: total >= 200 ? null : total >= 60 ? 200 : 60 }; }
const object = (v: unknown): Record<string, any> => { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new SpaceError('꾸미기 내용을 확인해 주세요.'); return v as Record<string, any>; };
export function shortText(v: unknown, max: number) { if (typeof v !== 'string' || v.length > max)
    throw new SpaceError(`글은 ${max}자 이내로 적어 주세요.`); return v.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim(); }
const num = (v: unknown, min: number, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw new SpaceError('물건 위치와 크기를 확인해 주세요.'); return Math.round(v * 100) / 100; };
export function revision(v: unknown) { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
    throw new SpaceError('저장 버전을 다시 확인해 주세요.'); return v; }
function placement(v: unknown): Placement { const p = object(v); if (typeof p.id !== 'string' || !/^[\w-]{1,80}$/.test(p.id) || typeof p.itemId !== 'string')
    throw new SpaceError('물건을 다시 선택해 주세요.'); return { id: p.id, itemId: p.itemId, x: num(p.x, 0, 100), y: num(p.y, 0, 100), size: num(p.size, 5, 80), rotation: num(p.rotation, -180, 180), flip: p.flip === true }; }
function owned(id: unknown, kind: string, items: string[]) { if (typeof id !== 'string' || !items.includes(id) || spaceItem(id)?.kind !== kind)
    throw new SpaceError('보관함에 있는 물건만 사용할 수 있어요.', 403); return id; }
function unique(layers: {
    id: string;
}[], limit: number) { if (layers.length > limit || new Set(layers.map(p => p.id)).size !== layers.length)
    throw new SpaceError(`한 화면에 ${limit}개까지 꾸밀 수 있어요.`); }
/** Normalize saved appearance when another screen changes the active companion. */
export function roomCompanionAppearance(value: unknown, items: string[], pet: string): Pick<Room, 'pet' | 'pose' | 'outfit'> {
    const selectedPet = owned(pet, 'pet', items);
    const v = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
    const outfit: Room['outfit'] = {};
    for (const slot of ['body', 'bag'] as const) {
        const key = v.outfit?.[slot];
        const item = typeof key === 'string' ? spaceItem(key) : undefined;
        if (item?.kind === 'clothes' && item.slot === slot && items.includes(item.id) && whitekneeItemCompatible(selectedPet, item)) outfit[slot] = item.id;
    }
    return {pet: selectedPet, pose: isWhiteknee(selectedPet) ? normalizeWhitekneePose(v.pose) : 'rest', outfit};
}
export function validateRoom(value: unknown, items: string[], previousPet?: string): Room {
    const v = object(value);
    if (!Array.isArray(v.placements)) throw new SpaceError('방 구성을 확인해 주세요.');
    const pet = owned(v.pet, 'pet', items);
    if (v.pose !== undefined && !whitekneePoses.includes(v.pose)) throw new SpaceError('친구의 자세를 다시 골라 주세요.');
    const placements = v.placements.map(p => {
        const q = placement(p);
        owned(q.itemId, 'furniture', items);
        return q;
    });
    unique(placements, 40);
    const names = object(v.nicknames || {}), nicknames: Record<string, string> = {};
    if (Object.keys(names).length > spaceCatalog.filter(i => i.kind === 'pet').length) throw new SpaceError('친구 이름을 다시 확인해 주세요.');
    for (const [key, name] of Object.entries(names)) {
        owned(key, 'pet', items);
        nicknames[key] = shortText(name, 20);
    }
    const o = object(v.outfit || {}), outfit: Room['outfit'] = {};
    for (const slot of ['body', 'bag'] as const) {
        if (!o[slot]) continue;
        const key = owned(o[slot], 'clothes', items), item = spaceItem(key)!;
        if (item.slot !== slot) throw new SpaceError('옷 위치를 확인해 주세요.');
        if (!whitekneeItemCompatible(pet, item)) {
            // Changing the companion may carry the previous friend's clothes in an older client.
            // Remove only the worn selection; inventory ownership is never changed here.
            if (previousPet && previousPet !== pet) continue;
            throw new SpaceError('이 친구에게 맞는 전용 옷을 골라 주세요.', 403);
        }
        outfit[slot] = key;
    }
    return {
        version: revision(v.version), theme: owned(v.theme, 'theme', items), pet,
        pose: isWhiteknee(pet) ? normalizeWhitekneePose(v.pose) : 'rest',
        nicknames, outfit, placements,
    };
}
export function validateDiary(value: unknown, items: string[]): Omit<DiaryPage, 'id' | 'updatedAt'> { const v = object(value); if (!Array.isArray(v.layers))
    throw new SpaceError('노트 내용을 확인해 주세요.'); const layers = v.layers.map((raw: unknown): DiaryLayer => { const r = object(raw), p = placement(r); if (!['text', 'sticker', 'photo', 'art'].includes(r.kind))
    throw new SpaceError('노트 조각을 확인해 주세요.'); if (r.kind === 'sticker')
    owned(p.itemId, 'sticker', items); if (r.kind === 'photo' && (typeof r.assetId !== 'string' || !/^[\w-]{1,100}$/.test(r.assetId)))
    throw new SpaceError('사진을 다시 골라 주세요.'); if (r.kind === 'art' && (typeof r.assetId !== 'string' || !/^[\w-]+:[\w-]+$/.test(r.assetId)))
    throw new SpaceError('작품을 다시 골라 주세요.'); return { ...p, kind: r.kind, ...(r.kind === 'text' ? { text: shortText(r.text, 300), color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#355147' } : {}), ...(['photo', 'art'].includes(r.kind) ? { assetId: r.assetId } : {}) }; }); unique(layers, 50); if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Number.isFinite(Date.parse(v.date)) || new Date(v.date).toISOString().slice(0, 10) !== v.date)
    throw new SpaceError('날짜를 확인해 주세요.'); return { version: revision(v.version), title: shortText(v.title, 60) || '오늘의 작은 이야기', date: v.date, paper: owned(v.paper, 'paper', items), layers }; }
