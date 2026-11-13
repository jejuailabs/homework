/**
 * 전시관(hall) = one room theme (11 of them); 전시실(room) = one exhibition inside it.
 * A room's hall is its saved theme, so existing rooms are grouped without rewriting them.
 */
import type {Exhibition, ExhibitionTheme} from './exhibition-types';

export const HALL_KINDS = ['cozy', 'forest', 'sky', 'ocean', 'earth', 'moon', 'saturn', 'coral', 'kelp', 'abyss', 'lagoon'] as const satisfies readonly ExhibitionTheme[];
export type HallKind = typeof HALL_KINDS[number];
export const isHallKind = (value: unknown): value is HallKind => HALL_KINDS.includes(value as HallKind);
/** Rooms saved before themes existed are cozy. */
export const hallOf = (theme: ExhibitionTheme | undefined): HallKind => isHallKind(theme) ? theme : 'cozy';
/** Which 3D family a hall belongs to (classic rooms, the space museum, the underwater museum). */
export const hallFamily = (kind: HallKind): 'classic' | 'space' | 'ocean' => ['earth', 'moon', 'saturn'].includes(kind) ? 'space' : ['coral', 'kelp', 'abyss', 'lagoon'].includes(kind) ? 'ocean' : 'classic';
export const HALL_TEXT: Record<HallKind, {ko: string; en: string}> = {
  cozy: {ko: '포근한 미술실', en: 'Cozy art room'}, forest: {ko: '초록 숲', en: 'Green forest'}, sky: {ko: '구름 하늘', en: 'Cloudy sky'}, ocean: {ko: '반짝 바다', en: 'Sparkling ocean'},
  earth: {ko: '지구 궤도 관측실', en: 'Earth orbit'}, moon: {ko: '달 분화구 미술관', en: 'Lunar crater'}, saturn: {ko: '토성 고리 회랑', en: 'Saturn ring'},
  coral: {ko: '산호 아치관', en: 'Coral arch gallery'}, kelp: {ko: '켈프 회랑관', en: 'Kelp corridor'}, abyss: {ko: '심해 블루아이관', en: 'Deep-sea blue eye'}, lagoon: {ko: '화이트 라군관', en: 'White lagoon'},
};
export const hallName = (kind: HallKind, locale: string) => HALL_TEXT[kind][locale === 'en' ? 'en' : 'ko'];
/** The 전시관 record a teacher keeps until they delete it; rooms never depend on it. ("theme" ids never clash with the earlier family records.) */
export const hallRecordId = (ownerUid: string, kind: HallKind) => `${ownerUid}__theme_${kind}`;

/** Sticker art shown on classic room thumbnails (one per colour theme). */
export const CLASSIC_STICKER: Record<string, string> = {
  cozy: '/exhibition-world/v1/gallery/g14-cozy-heart.webp', forest: '/exhibition-world/v1/gallery/g14-forest-leaf.webp',
  sky: '/exhibition-world/v1/gallery/g14-sky-rainbow.webp', ocean: '/exhibition-world/v1/gallery/g14-ocean-fish.webp',
};

export type HallSummary = {kind: HallKind; count: number; latestAt: string; rooms: Exhibition[]; saved: boolean};
/** Groups loaded rooms into halls (newest room first in each), keeping saved halls that have no rooms yet. */
export function summarizeHalls(rooms: Exhibition[], saved: HallKind[] = []): HallSummary[] {
  const halls = new Map<HallKind, HallSummary>();
  for (const kind of saved) halls.set(kind, {kind, count: 0, latestAt: '', rooms: [], saved: true});
  for (const room of [...rooms].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const kind = hallOf(room.theme), hall = halls.get(kind) || {kind, count: 0, latestAt: '', rooms: [], saved: false};
    hall.count++; hall.rooms.push(room); if (!hall.latestAt) hall.latestAt = room.createdAt;
    halls.set(kind, hall);
  }
  return HALL_KINDS.map(kind => halls.get(kind)).filter((hall): hall is HallSummary => !!hall);
}
/** The hall holding the newest room gets the LATEST mark. */
export const latestHall = (halls: HallSummary[]) => halls.reduce<HallSummary | null>((best, hall) => hall.latestAt && (!best || hall.latestAt > best.latestAt) ? hall : best, null)?.kind ?? null;
