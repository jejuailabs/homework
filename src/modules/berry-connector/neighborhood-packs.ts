import {SPOT_KINDS, spotKind} from '@/lib/neighborhood-spots';

/**
 * 우리 동네 탐험 lesson packs as Berry reads them: the saved list (same title·date rows as the tool's 저장한 자료)
 * filtered by class, date and words, and one pack's selected places, sketch title and sources. Raw map geometry
 * (coordinates, roads) and the full briefing stay in ourclass; free text passes through `mask` (the class roster).
 */
type Data = Record<string, any>;
export type PackDoc = {id: string; data: Data};
export type PackFilter = {q?: string; classId?: string; from?: string; to?: string};

export const PACK_LINK = '/teacher/tools/neighborhood';
const seoulDay = (iso: unknown) => {const time = Date.parse(String(iso ?? '')); return Number.isFinite(time) ? new Date(time + 9 * 3_600_000).toISOString().slice(0, 10) : '';};
/** YYYY-MM or YYYY-MM-DD; a month widens to its first or last day. */
export function packDay(value: unknown, end = false) {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (!/^\d{4}-\d{2}$/.test(text)) return '';
  if (!end) return `${text}-01`;
  const [year, month] = text.split('-').map(Number);
  return `${text}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
}

export function filterPacks(rows: PackDoc[], filter: PackFilter) {
  const words = String(filter.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const from = packDay(filter.from), to = packDay(filter.to, true);
  return rows.filter(({data}) => {
    const day = seoulDay(data.createdAt), haystack = `${data.title ?? ''} ${data.region ?? ''} ${data.unit ?? ''}`.toLowerCase();
    return words.every(word => haystack.includes(word)) && (!from || day >= from) && (!to || day <= to) && (!filter.classId || data.classId === filter.classId);
  });
}

const parseMap = (data: Data): Data | null => {try {return typeof data.mapJson === 'string' ? JSON.parse(data.mapJson) : null;} catch {return null;}};
const selectedPlaces = (map: Data | null): Data[] => Array.isArray(map?.places) ? map.places.filter((place: Data) => place?.selected === true) : [];

/** List rows skip `mapJson` (up to 700 KB each), so place counts come only with one pack. */
export function packSummary({id, data}: PackDoc, className: string | null, mask: (text: string) => string = text => text) {
  return {id, title: mask(String(data.title ?? '')), region: String(data.region ?? ''), grade: String(data.grade ?? ''), unit: mask(String(data.unit ?? '')), class: className, created_on: seoulDay(data.createdAt), has_sketch: !!data.sketch?.title, link: PACK_LINK};
}

export function packDetail(doc: PackDoc, className: string | null, mask: (text: string) => string = text => text) {
  const {data} = doc, map = parseMap(data);
  return {
    ...packSummary(doc, className, mask), reference_date: String(data.referenceDate ?? ''),
    map_source: map ? {source: map.source ?? null, attribution: String(map.attribution ?? ''), source_date: String(map.sourceDate ?? '')} : null,
    sketch: data.sketch?.title ? {title: mask(String(data.sketch.title)), main_roads: Array.isArray(data.sketch.mainRoads) ? data.sketch.mainRoads.map(String).slice(0, 10) : []} : null,
    selected_places: selectedPlaces(map).slice(0, 12).map(place => {const kind = spotKind(place.kind); return {name: String(place.name ?? ''), kind: kind ?? null, kind_label: kind ? SPOT_KINDS[kind].label : null, category: String(place.category ?? ''), note: mask(String(place.note ?? '')).slice(0, 400), verified: place.verified === true};}),
    sources: (Array.isArray(data.sources) ? data.sources : []).slice(0, 30).map((source: Data) => ({title: mask(String(source?.title ?? '')), url: String(source?.url ?? '')})),
    brief_preview: mask(String(data.brief ?? '')).slice(0, 400),
  };
}
