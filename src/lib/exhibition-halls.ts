/**
 * 전시관(hall) = a teacher's building for one theme family; 전시실(room) = one exhibition inside it.
 * A room's hall comes from its saved theme, so existing rooms are grouped without rewriting them.
 * Ocean hall joins when the underwater museum lands; the classic 'ocean' colour stays in the basic hall.
 */
import type {Exhibition, ExhibitionTheme} from './exhibition-types';

export const HALL_KINDS = ['classic', 'space'] as const;
export type HallKind = typeof HALL_KINDS[number];
export const isHallKind = (value: unknown): value is HallKind => HALL_KINDS.includes(value as HallKind);
export const HALL_THEMES: Record<HallKind, readonly ExhibitionTheme[]> = {classic: ['cozy', 'forest', 'sky', 'ocean'], space: ['earth', 'moon', 'saturn']};
export const hallOf = (theme: ExhibitionTheme | undefined): HallKind => (HALL_THEMES.space as readonly string[]).includes(theme || '') ? 'space' : 'classic';
export const HALL_TEXT: Record<HallKind, {ko: string; en: string}> = {classic: {ko: '기본관', en: 'Classic hall'}, space: {ko: '우주관', en: 'Space hall'}};
export const hallName = (kind: HallKind, locale: string) => HALL_TEXT[kind][locale === 'en' ? 'en' : 'ko'];
/** The 전시관 record a teacher keeps until they delete it; rooms never depend on it. */
export const hallRecordId = (ownerUid: string, kind: HallKind) => `${ownerUid}__${kind}`;

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
