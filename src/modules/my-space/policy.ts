import { spaceCatalog, spaceItem, starterSpaceIds, type Room, type Placement, type DiaryPage, type DiaryLayer } from './catalog';
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
export function validateRoom(value: unknown, items: string[]): Room { const v = object(value); if (!Array.isArray(v.placements))
    throw new SpaceError('방 구성을 확인해 주세요.'); const placements = v.placements.map(p => { const q = placement(p); owned(q.itemId, 'furniture', items); return q; }); unique(placements, 40); const names = object(v.nicknames || {}), nicknames: Record<string, string> = {}; if (Object.keys(names).length > spaceCatalog.filter(i => i.kind === 'pet').length)
    throw new SpaceError('친구 이름을 다시 확인해 주세요.'); for (const [key, name] of Object.entries(names)) {
    owned(key, 'pet', items);
    nicknames[key] = shortText(name, 20);
} const o = object(v.outfit || {}), outfit: Room['outfit'] = {}; for (const slot of ['body', 'bag'] as const) {
    if (o[slot]) {
        const key = owned(o[slot], 'clothes', items);
        if (spaceItem(key)?.slot !== slot)
            throw new SpaceError('옷 위치를 확인해 주세요.');
        outfit[slot] = key;
    }
} return { version: revision(v.version), theme: owned(v.theme, 'theme', items), pet: owned(v.pet, 'pet', items), nicknames, outfit, placements }; }
/** Bounded, versioned document shared by persistence and portable import. */
export function validateDiary(value: unknown, items: string[]): Omit<DiaryPage, 'id' | 'updatedAt'> {
    const v = object(value);
    if (v.schemaVersion !== undefined && v.schemaVersion !== 2)
        throw new SpaceError('이 일기 형식은 아직 지원하지 않아요.');
    if (!Array.isArray(v.layers) || v.layers.length > 500)
        throw new SpaceError('한 장에 500조각까지 담을 수 있어요. 새 페이지를 펼쳐 주세요.');
    if (new TextEncoder().encode(JSON.stringify(v)).length > 600000)
        throw new SpaceError('이 페이지가 가득 찼어요. 새 페이지에 이어 써 주세요.', 413);
    let pointCount = 0, textCount = 0;
    const layers = v.layers.map((raw: unknown): DiaryLayer => {
        const r = object(raw);
        if (!['text', 'sticker', 'photo', 'art', 'ink'].includes(r.kind))
            throw new SpaceError('노트 조각을 확인해 주세요.');
        // Diary pages use the full paper width; room placements remain unchanged.
        const p = {...placement({...r, size: Math.min(80, r.size)}), size: num(r.size, 5, 100)};
        if (r.kind === 'sticker') owned(p.itemId, 'sticker', items);
        if (r.kind === 'photo' && (typeof r.assetId !== 'string' || !/^[\w-]{1,100}$/.test(r.assetId)))
            throw new SpaceError('사진을 다시 골라 주세요.');
        if (r.kind === 'art' && (typeof r.assetId !== 'string' || !/^[\w-]+:[\w-]+$/.test(r.assetId)))
            throw new SpaceError('작품을 다시 골라 주세요.');
        const color = /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#355147';
        if (r.kind === 'ink') {
            if (!Array.isArray(r.points) || !r.points.length || r.points.length > 2000 || (pointCount += r.points.length) > 20000)
                throw new SpaceError('손글씨가 가득 찼어요. 새 페이지에 이어 써 주세요.');
            const points: [number, number, number][] = r.points.map((point: unknown) => {
                if (!Array.isArray(point) || point.length !== 3) throw new SpaceError('손글씨 획을 확인해 주세요.');
                return [num(point[0], 0, 720), num(point[1], 0, 960), num(point[2], 0, 1)];
            });
            return {...p, kind: 'ink', points, color, brush: ['pen', 'pencil', 'marker'].includes(r.brush) ? r.brush : 'pen', width: num(r.width ?? 3, .5, 32), opacity: num(r.opacity ?? 1, .05, 1)};
        }
        if (r.kind === 'text') {
            if (typeof r.text !== 'string' || r.text.length > (v.schemaVersion === 2 ? 6000 : 300) || (textCount += r.text.length) > 30000)
                throw new SpaceError('글이 가득 찼어요. 새 페이지에 이어 써 주세요.');
            // Preserve intentional spaces and line breaks; do not trim Korean IME input.
            const text = r.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '');
            return {...p, kind: 'text', text, color, fontSize: num(r.fontSize ?? 24, 12, 72), align: ['left', 'center', 'right'].includes(r.align) ? r.align : 'left'};
        }
        return {...p, kind: r.kind, ...(['photo', 'art'].includes(r.kind) ? {assetId: r.assetId} : {})};
    });
    unique(layers, 500);
    if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Number.isFinite(Date.parse(v.date)) || new Date(v.date).toISOString().slice(0, 10) !== v.date)
        throw new SpaceError('날짜를 확인해 주세요.');
    const mood = v.mood ?? '';
    if (!['', 'happy', 'excited', 'calm', 'sad', 'angry', 'worried'].includes(mood)) throw new SpaceError('기분 스티커를 다시 골라 주세요.');
    return {schemaVersion: 2, version: revision(v.version), title: shortText(v.title, 60) || '오늘의 작은 이야기', date: v.date, paper: owned(v.paper, 'paper', items), mood, layers};
}
