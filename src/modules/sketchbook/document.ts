import {SKETCH_LIMITS} from './raster';

/** Saved sketch shape shared by the device store and the downloadable edit file. */
export type LayerKind = 'photo' | 'paint' | 'draw' | 'line';
export type PaperKind = 'white' | 'cream' | 'kraft' | 'black' | 'grid';
export type LayerMeta = {id: string; name: string; kind: LayerKind; visible: boolean; locked: boolean; opacity: number};
export type SketchManifest = {version: 1; width: number; height: number; paper: PaperKind; activeId: string; layers: LayerMeta[]};
export const SKETCH_FILE_FORMAT = 'ourclass-sketchbook';

const layerKinds: LayerKind[] = ['photo', 'paint', 'draw', 'line'], papers: PaperKind[] = ['white', 'cream', 'kraft', 'black', 'grid'];

export const defaultLayerNames: Record<LayerKind, {ko: string; en: string}> = {
  photo: {ko: '사진', en: 'Photo'}, paint: {ko: '칠하기', en: 'Colour'}, draw: {ko: '그리기', en: 'Drawing'}, line: {ko: '선', en: 'Lines'},
};

/** Bottom to top: photo, colour, drawing, lines. The line layer sits on top so colour never covers it. */
export function defaultLayers(locale: 'ko' | 'en' = 'ko'): LayerMeta[] {
  return (['photo', 'paint', 'draw', 'line'] as const).map(kind => ({id: kind, name: defaultLayerNames[kind][locale], kind, visible: true, locked: false, opacity: 1}));
}

/** Validates untrusted saved data (device store or an opened file); null when unusable. */
export function normalizeManifest(value: unknown): SketchManifest | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const width = Number(input.width), height = Number(input.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > SKETCH_LIMITS.maxEdge || height > SKETCH_LIMITS.maxEdge) return null;
  if (!Array.isArray(input.layers) || !input.layers.length || input.layers.length > SKETCH_LIMITS.maxLayers) return null;
  const ids = new Set<string>(), layers: LayerMeta[] = [];
  for (const raw of input.layers) {
    if (!raw || typeof raw !== 'object') return null;
    const layer = raw as Record<string, unknown>, id = typeof layer.id === 'string' ? layer.id.slice(0, 40) : '';
    if (!id || ids.has(id) || !layerKinds.includes(layer.kind as LayerKind)) return null;
    ids.add(id);
    const opacity = Number(layer.opacity);
    layers.push({id, name: typeof layer.name === 'string' && layer.name.trim() ? layer.name.trim().slice(0, 30) : defaultLayerNames[layer.kind as LayerKind].ko, kind: layer.kind as LayerKind, visible: layer.visible !== false, locked: layer.locked === true, opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1});
  }
  const activeId = typeof input.activeId === 'string' && ids.has(input.activeId) ? input.activeId : layers[layers.length - 1].id;
  return {version: 1, width, height, paper: papers.includes(input.paper as PaperKind) ? input.paper as PaperKind : 'white', activeId, layers};
}

/** Layer used for a tool when the layers are arranged automatically. */
export function autoLayerFor(group: 'draw' | 'paint' | 'decorate' | 'fix', layers: LayerMeta[], current: string) {
  const want: LayerKind | null = group === 'paint' ? 'paint' : group === 'fix' ? null : 'draw';
  if (!want) return current;
  return layers.find(layer => layer.kind === want && !layer.locked)?.id ?? current;
}
