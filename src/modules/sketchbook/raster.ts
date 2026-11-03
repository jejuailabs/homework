/**
 * DOM-free pixel work for the sketchbook: region fill, line-art extraction,
 * colour picking, undo patches and limits. Runs on the page and in the fill worker,
 * and is unit tested in Node.
 */
export type Raster = {width: number; height: number; data: Uint8ClampedArray<ArrayBuffer>};
export type Rect = {x: number; y: number; width: number; height: number};
export type Rgba = [number, number, number, number];

export const SKETCH_LIMITS = {maxEdge: 2400, maxLayers: 5, importEdge: 2400, historyBytes: 192 * 1024 ** 2, historySteps: 120, minHistorySteps: 50} as const;
export const PAPER_SIZES = {landscape: {width: 1754, height: 1240}, portrait: {width: 1240, height: 1754}, square: {width: 1600, height: 1600}} as const;
export type PaperSize = keyof typeof PAPER_SIZES;

export function createRaster(width: number, height: number): Raster {return {width, height, data: new Uint8ClampedArray(width * height * 4)};}

/** Largest size within `maxEdge` that keeps the aspect ratio. */
export function fitSize(width: number, height: number, maxEdge: number = SKETCH_LIMITS.importEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

/** Centres a source inside the page without cropping it. */
export function containRect(width: number, height: number, boxWidth: number, boxHeight: number): Rect {
  const scale = Math.min(boxWidth / width, boxHeight / height), w = width * scale, h = height * scale;
  return {x: (boxWidth - w) / 2, y: (boxHeight - h) / 2, width: w, height: h};
}

export function clampSize(width: number, height: number) {
  const max = SKETCH_LIMITS.maxEdge;
  return {width: Math.max(16, Math.min(max, Math.round(width))), height: Math.max(16, Math.min(max, Math.round(height)))};
}

export function pixelAt(raster: Raster, x: number, y: number): Rgba {
  const px = Math.floor(x), py = Math.floor(y);
  if (px < 0 || py < 0 || px >= raster.width || py >= raster.height) return [0, 0, 0, 0];
  const i = (py * raster.width + px) * 4, d = raster.data;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}

export function hexFromRgb([r, g, b]: Rgba | [number, number, number]) {return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');}
export function rgbFromHex(hex: string): [number, number, number] {
  const clean = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? '000000';
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

/** Keeps the eight latest distinct colours, newest first. */
export function pushRecentColor(recent: string[], color: string, limit = 8) {
  const value = color.toLowerCase();
  return [value, ...recent.filter(item => item.toLowerCase() !== value)].slice(0, limit);
}

/**
 * Line-art extraction for a photo of a colouring page: light paper becomes transparent
 * and dark lines stay. `threshold` is the brightness (0-255) where a line ends,
 * `softness` widens the anti-aliased edge. Transparent input counts as paper.
 */
export function extractLineArt(source: Raster, threshold: number, softness = 24, ink?: [number, number, number]): Raster {
  const out = createRaster(source.width, source.height), s = source.data, d = out.data, soft = Math.max(1, softness);
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3] / 255, lum = (0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2]) * a + 255 * (1 - a);
    const alpha = Math.max(0, Math.min(1, (threshold - lum) / soft + 0.5));
    if (!alpha) continue;
    d[i] = ink ? ink[0] : s[i]; d[i + 1] = ink ? ink[1] : s[i + 1]; d[i + 2] = ink ? ink[2] : s[i + 2]; d[i + 3] = Math.round(alpha * 255);
  }
  return out;
}

export type FillReference = 'lines' | 'colors';
export type FillOptions = {tolerance: number; gap: number; spread: number};

/**
 * Pixels that stop a fill. With a line layer the boundary is its opacity; otherwise it is
 * the colour difference from the tapped pixel. `tolerance` is 0-100.
 */
export function fillWalls(reference: Raster, seedX: number, seedY: number, mode: FillReference, tolerance: number) {
  const {width, height, data} = reference, walls = new Uint8Array(width * height), t = Math.max(0, Math.min(100, tolerance));
  if (mode === 'lines') {
    const limit = 40 + t * 2;
    for (let p = 0; p < walls.length; p++) walls[p] = data[p * 4 + 3] > limit ? 1 : 0;
    return walls;
  }
  const [r, g, b, a] = pixelAt(reference, seedX, seedY), limit = t * 2.55;
  for (let p = 0, i = 0; p < walls.length; p++, i += 4) {
    const diff = Math.max(Math.abs(data[i] - r), Math.abs(data[i + 1] - g), Math.abs(data[i + 2] - b), Math.abs(data[i + 3] - a));
    walls[p] = diff > limit ? 1 : 0;
  }
  return walls;
}

/** Chebyshev distance to the nearest wall, capped at 255 (two-pass transform, O(n)). */
export function wallDistance(walls: Uint8Array, width: number, height: number) {
  const dist = new Uint8Array(walls.length);
  for (let p = 0; p < walls.length; p++) dist[p] = walls[p] ? 0 : 255;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x; let v = dist[p]; if (!v) continue;
    if (x > 0) v = Math.min(v, dist[p - 1] + 1);
    if (y > 0) {const up = p - width; v = Math.min(v, dist[up] + 1); if (x > 0) v = Math.min(v, dist[up - 1] + 1); if (x < width - 1) v = Math.min(v, dist[up + 1] + 1);}
    dist[p] = v;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x; let v = dist[p]; if (!v) continue;
    if (x < width - 1) v = Math.min(v, dist[p + 1] + 1);
    if (y < height - 1) {const down = p + width; v = Math.min(v, dist[down] + 1); if (x > 0) v = Math.min(v, dist[down - 1] + 1); if (x < width - 1) v = Math.min(v, dist[down + 1] + 1);}
    dist[p] = v;
  }
  return dist;
}

// Four-connected so a one-pixel diagonal line still holds the paint.
function flood(blocked: (p: number) => boolean, width: number, height: number, seed: number) {
  const region = new Uint8Array(width * height), stack = new Int32Array(width * height);
  let top = 0; stack[top++] = seed; region[seed] = 1;
  while (top) {
    const p = stack[--top], x = p % width;
    if (x > 0 && !region[p - 1] && !blocked(p - 1)) {region[p - 1] = 1; stack[top++] = p - 1;}
    if (x < width - 1 && !region[p + 1] && !blocked(p + 1)) {region[p + 1] = 1; stack[top++] = p + 1;}
    if (p >= width && !region[p - width] && !blocked(p - width)) {region[p - width] = 1; stack[top++] = p - width;}
    if (p < width * (height - 1) && !region[p + width] && !blocked(p + width)) {region[p + width] = 1; stack[top++] = p + width;}
  }
  return region;
}

/** Grows a region `steps` pixels (8-connected) into pixels that `allowed` accepts. */
export function growRegion(region: Uint8Array, width: number, height: number, steps: number, allowed: (p: number) => boolean) {
  let frontier: number[] = [];
  for (let p = 0; p < region.length; p++) if (region[p]) {
    const x = p % width, y = (p - x) / width;
    if ((x > 0 && !region[p - 1]) || (x < width - 1 && !region[p + 1]) || (y > 0 && !region[p - width]) || (y < height - 1 && !region[p + width])) frontier.push(p);
  }
  for (let step = 0; step < steps && frontier.length; step++) {
    const next: number[] = [];
    for (const p of frontier) {
      const x = p % width, y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx; if (region[q] || !allowed(q)) continue;
        region[q] = 1; next.push(q);
      }
    }
    frontier = next;
  }
  return region;
}

/**
 * Bucket fill region. Gaps narrower than `gap * 2` pixels count as closed, and the result
 * spreads `spread` pixels under the boundary so no white rim shows beside a line.
 * Returns null when the tap lands on the boundary itself.
 */
export function fillRegion(walls: Uint8Array, width: number, height: number, x: number, y: number, options: FillOptions) {
  const px = Math.floor(x), py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return null;
  const seed = py * width + px; if (walls[seed]) return null;
  let gap = Math.max(0, Math.min(12, Math.round(options.gap))), region: Uint8Array;
  const dist = gap ? wallDistance(walls, width, height) : null;
  if (dist && dist[seed] <= gap) gap = 0; // tapped a narrow spot: fill it without gap closing
  if (gap && dist) {
    region = flood(p => dist[p] <= gap, width, height, seed);
    growRegion(region, width, height, gap, p => !walls[p]);
  } else region = flood(p => walls[p] === 1, width, height, seed);
  const spread = Math.max(0, Math.min(4, Math.round(options.spread)));
  if (spread) growRegion(region, width, height, spread, p => walls[p] === 1);
  return region;
}

export function maskBounds(mask: Uint8Array, width: number, height: number): Rect | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) if (mask[row + x]) {if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; maxY = y;}
  }
  return maxX < 0 ? null : {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1};
}

/** Paints `color` over the masked pixels of `target` (source-over), within `rect` of the mask. */
export function paintMask(target: Raster, mask: Uint8Array, maskWidth: number, rect: Rect, color: [number, number, number], opacity = 1) {
  const sa = Math.max(0, Math.min(1, opacity)), d = target.data;
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    if (!mask[(rect.y + y) * maskWidth + rect.x + x]) continue;
    const i = (y * target.width + x) * 4, da = d[i + 3] / 255, oa = sa + da * (1 - sa);
    if (!oa) continue;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round((color[c] * sa + d[i + c] * da * (1 - sa)) / oa);
    d[i + 3] = Math.round(oa * 255);
  }
  return target;
}

/** Copies `rect` (clipped to the raster) into a new raster. */
export function cropRaster(source: Raster, rect: Rect): Raster {
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(source.width, Math.ceil(rect.x + rect.width)), y1 = Math.min(source.height, Math.ceil(rect.y + rect.height));
  const out = createRaster(Math.max(0, x1 - x0), Math.max(0, y1 - y0));
  for (let y = 0; y < out.height; y++) out.data.set(source.data.subarray(((y0 + y) * source.width + x0) * 4, ((y0 + y) * source.width + x1) * 4), y * out.width * 4);
  return out;
}

export function putRaster(target: Raster, patch: Raster, x: number, y: number) {
  for (let row = 0; row < patch.height; row++) {
    const ty = y + row; if (ty < 0 || ty >= target.height) continue;
    target.data.set(patch.data.subarray(row * patch.width * 4, (row + 1) * patch.width * 4), (ty * target.width + x) * 4);
  }
  return target;
}

/** Clips a rectangle to the page; null when nothing is left. */
export function clipRect(rect: Rect, width: number, height: number): Rect | null {
  const x = Math.max(0, Math.floor(rect.x)), y = Math.max(0, Math.floor(rect.y));
  const r = Math.min(width, Math.ceil(rect.x + rect.width)), b = Math.min(height, Math.ceil(rect.y + rect.height));
  return r > x && b > y ? {x, y, width: r - x, height: b - y} : null;
}

/**
 * Undo/redo of pixel patches. A patch holds the pixels of one layer region before a
 * change; applying it swaps in the other side. The oldest steps are dropped when the
 * byte budget is exceeded, but never below `minSteps` unless one step alone is huge.
 */
export class PatchHistory<P extends {bytes: number}> {
  private undoStack: P[] = []; private redoStack: P[] = []; private total = 0;
  constructor(private budget: number = SKETCH_LIMITS.historyBytes, private maxSteps: number = SKETCH_LIMITS.historySteps, private minSteps: number = SKETCH_LIMITS.minHistorySteps) {}
  get canUndo() {return this.undoStack.length > 0;}
  get canRedo() {return this.redoStack.length > 0;}
  get size() {return this.undoStack.length;}
  get bytes() {return this.total;}
  record(patch: P) {for (const old of this.redoStack) this.total -= old.bytes; this.redoStack = []; this.pushUndo(patch);}
  takeUndo() {const p = this.undoStack.pop(); if (p) this.total -= p.bytes; return p;}
  takeRedo() {const p = this.redoStack.pop(); if (p) this.total -= p.bytes; return p;}
  pushRedo(patch: P) {this.redoStack.push(patch); this.total += patch.bytes;}
  pushUndo(patch: P) {this.undoStack.push(patch); this.total += patch.bytes; this.trim();}
  clear() {this.undoStack = []; this.redoStack = []; this.total = 0;}
  // Over budget, keep `minSteps` until twice the budget; that hard cap protects small devices.
  private trim() {
    const drop = () => {this.total -= this.undoStack.shift()!.bytes;};
    while (this.undoStack.length > 1 && (this.undoStack.length > this.maxSteps || (this.total > this.budget && this.undoStack.length > this.minSteps))) drop();
    while (this.undoStack.length > 1 && this.total > this.budget * 2) drop();
  }
}

export type Point = {x: number; y: number};

/** Evenly spaced stamp centres from `from` to `to`; `carry` is the distance already travelled since the last stamp. */
export function stampPositions(from: Point, to: Point, spacing: number, carry: number) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy), step = Math.max(0.5, spacing), points: Point[] = [];
  let at = step - carry;
  while (at <= length) {points.push({x: from.x + dx * at / length, y: from.y + dy * at / length}); at += step;}
  return {points, carry: length - (at - step)};
}

export type SymmetryMode = 'off' | 'mirror' | 'quad' | 'radial';
/** Copies of a point for mirror drawing around (cx, cy). The original comes first. */
export function symmetryPoints(p: Point, cx: number, cy: number, mode: SymmetryMode, slices = 8): Point[] {
  if (mode === 'mirror') return [p, {x: 2 * cx - p.x, y: p.y}];
  if (mode === 'quad') return [p, {x: 2 * cx - p.x, y: p.y}, {x: p.x, y: 2 * cy - p.y}, {x: 2 * cx - p.x, y: 2 * cy - p.y}];
  if (mode === 'radial') {
    const n = Math.max(2, Math.min(16, Math.round(slices))), dx = p.x - cx, dy = p.y - cy, out: Point[] = [];
    for (let i = 0; i < n; i++) {const a = (Math.PI * 2 * i) / n, c = Math.cos(a), s = Math.sin(a); out.push({x: cx + dx * c - dy * s, y: cy + dx * s + dy * c});}
    return out;
  }
  return [p];
}

export type ShapeKind = 'line' | 'rect' | 'ellipse' | 'star' | 'heart' | 'triangle';
/** Outline of a shape dragged from `a` to `b`, as a polyline (closed shapes repeat the first point). */
export function shapeOutline(kind: ShapeKind, a: Point, b: Point): Point[] {
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y), cx = x0 + w / 2, cy = y0 + h / 2;
  const close = (points: Point[]) => [...points, points[0]];
  if (kind === 'line') return [a, b];
  if (kind === 'rect') return close([{x: x0, y: y0}, {x: x0 + w, y: y0}, {x: x0 + w, y: y0 + h}, {x: x0, y: y0 + h}]);
  if (kind === 'triangle') return close([{x: cx, y: y0}, {x: x0 + w, y: y0 + h}, {x: x0, y: y0 + h}]);
  if (kind === 'star') return close(Array.from({length: 10}, (_, i) => {const r = i % 2 ? 0.42 : 1, t = -Math.PI / 2 + (Math.PI * i) / 5; return {x: cx + Math.cos(t) * r * w / 2, y: cy + Math.sin(t) * r * h / 2};}));
  if (kind === 'heart') return close(Array.from({length: 64}, (_, i) => {
    const t = (Math.PI * 2 * i) / 64, hx = 16 * Math.sin(t) ** 3, hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    return {x: cx + (hx / 32) * w, y: y0 + ((hy + 12) / 29) * h};
  }));
  return close(Array.from({length: 72}, (_, i) => {const t = (Math.PI * 2 * i) / 72; return {x: cx + Math.cos(t) * w / 2, y: cy + Math.sin(t) * h / 2};}));
}
