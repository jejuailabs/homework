import {PatchHistory, clipRect, containRect, createRaster, extractLineArt, hexFromRgb, maskBounds, paintMask, pixelAt, rgbFromHex, shapeOutline, stampPositions, symmetryPoints, type FillOptions, type Point, type Rect, type ShapeKind, type SymmetryMode} from './raster';
import {defaultLayers, type LayerKind, type LayerMeta, type PaperKind, type SketchManifest} from './document';
import type {FillRequest, FillResponse} from './fill-worker';

/** Raster painting engine: layer canvases, textured stamp brushes, reference fill and pixel undo. */
export type StrokeBrush = 'pencil' | 'colorPencil' | 'felt' | 'marker' | 'crayon' | 'watercolor' | 'oil' | 'eraser' | 'smudge';
type Stamp = 'round' | 'crayon' | 'chisel' | 'wash' | 'bristle';
type Grain = 'none' | 'fine' | 'coarse';
type BrushSpec = {stamp: Stamp; grain: Grain; spacing: number; op: GlobalCompositeOperation; pressureSize: number; smooth: number};
export const BRUSH_SPECS: Record<StrokeBrush, BrushSpec> = {
  pencil: {stamp: 'round', grain: 'fine', spacing: 0.18, op: 'source-over', pressureSize: 0.5, smooth: 0.35},
  colorPencil: {stamp: 'round', grain: 'fine', spacing: 0.15, op: 'source-over', pressureSize: 0.45, smooth: 0.35},
  felt: {stamp: 'round', grain: 'none', spacing: 0.1, op: 'source-over', pressureSize: 0.2, smooth: 0.45},
  marker: {stamp: 'chisel', grain: 'none', spacing: 0.08, op: 'multiply', pressureSize: 0.1, smooth: 0.45},
  crayon: {stamp: 'crayon', grain: 'coarse', spacing: 0.12, op: 'source-over', pressureSize: 0.35, smooth: 0.3},
  watercolor: {stamp: 'wash', grain: 'none', spacing: 0.12, op: 'multiply', pressureSize: 0.5, smooth: 0.5},
  oil: {stamp: 'bristle', grain: 'none', spacing: 0.06, op: 'source-over', pressureSize: 0.4, smooth: 0.45},
  eraser: {stamp: 'round', grain: 'none', spacing: 0.1, op: 'destination-out', pressureSize: 0.3, smooth: 0.3},
  smudge: {stamp: 'round', grain: 'none', spacing: 0.12, op: 'source-over', pressureSize: 0.3, smooth: 0.4},
};
export type BrushSettings = {color: string; size: number; opacity: number; texture: number};
export type InputPoint = Point & {pressure: number; pen: boolean};
export type StrokeOptions = {clip: boolean; symmetry: SymmetryMode; slices: number; fill: FillOptions};
export type Layer = LayerMeta & {canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; filled: boolean};
type Patch = {layerId: string; rect: Rect; image: ImageData; bytes: number};
type Buffers = {raw: HTMLCanvasElement; rawCtx: CanvasRenderingContext2D; finish: HTMLCanvasElement; finishCtx: CanvasRenderingContext2D};
// Each stroke owns its buffers, so a stroke still waiting for its "inside the lines" area keeps
// showing and commits in order while the next stroke has already started.
type Stroke = {brush: StrokeBrush; settings: BrushSettings; options: StrokeOptions; layer: Layer; last: InputPoint; smoothed: Point; carry: number; bounds: Rect | null; bristles: {offset: number; radius: number; alpha: number}[]; wash: HTMLCanvasElement | null; before: ImageData | null; shape?: {kind: ShapeKind; from: Point}; buf: Buffers; clip: HTMLCanvasElement | null; clipReady: Promise<void> | null; cancelled: boolean};

const PAPER_COLORS: Record<PaperKind, string> = {white: '#fffefb', cream: '#f6efdc', kraft: '#c8a479', black: '#26282d', grid: '#fffefb'};

function makeCanvas(width: number, height: number) {const c = document.createElement('canvas'); c.width = width; c.height = height; return c;}
function context(canvas: HTMLCanvasElement, frequent = false) {return canvas.getContext('2d', frequent ? {willReadFrequently: true} : undefined)!;}

// Seeded so the same paper tooth appears after reloads and in exports.
function noiseTile(size: number, cell: number, seed: number, contrast: number) {
  let s = seed >>> 0;
  const rand = () => {s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;};
  const grid = Math.ceil(size / cell), values = Array.from({length: grid * grid}, rand), at = (x: number, y: number) => values[((y + grid) % grid) * grid + ((x + grid) % grid)];
  const canvas = makeCanvas(size, size), ctx = context(canvas), image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const smooth = (t: number) => t * t * (3 - 2 * t), sx = smooth(fx), sy = smooth(fy);
    const v = (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
    const fine = rand() * 0.35, alpha = Math.max(0, Math.min(1, (v * 0.75 + fine - 0.42) * contrast));
    image.data[(y * size + x) * 4 + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

let grainCache: Partial<Record<Grain, HTMLCanvasElement>> | null = null;
function grainTile(grain: Exclude<Grain, 'none'>) {
  grainCache ??= {};
  return grainCache[grain] ??= grain === 'coarse' ? noiseTile(192, 5, 11, 2.6) : noiseTile(128, 2, 29, 2.2);
}

export class SketchEngine {
  width: number; height: number; paper: PaperKind; layers: Layer[] = []; activeId = 'draw';
  readonly history = new PatchHistory<Patch>();
  private display: CanvasRenderingContext2D;
  private work: HTMLCanvasElement; private workCtx: CanvasRenderingContext2D;
  private stroke: Stroke | null = null; private ending: Stroke[] = []; private spare: Buffers[] = []; private commits: Promise<unknown> = Promise.resolve();
  private frame = 0; private worker: Worker | null | undefined; private requests = new Map<number, (mask: Uint8Array | null) => void>(); private nextRequest = 1;
  onChange: (reason: 'pixels' | 'layers' | 'history') => void = () => {};

  constructor(private canvas: HTMLCanvasElement, manifest?: SketchManifest) {
    this.width = manifest?.width ?? 1754; this.height = manifest?.height ?? 1240; this.paper = manifest?.paper ?? 'white';
    this.display = context(canvas);
    this.work = makeCanvas(1, 1); this.workCtx = context(this.work);
    this.reset(this.width, this.height, this.paper, manifest?.layers ?? defaultLayers(), manifest?.activeId ?? 'draw');
  }

  /** Starts an empty page (also used before loading saved pixels). */
  reset(width: number, height: number, paper: PaperKind, layers: LayerMeta[], activeId: string) {
    this.width = width; this.height = height; this.paper = paper;
    for (const c of [this.canvas, this.work]) {c.width = width; c.height = height;}
    this.spare = []; for (const stroke of this.ending) stroke.cancelled = true; this.ending = [];
    this.layers = layers.map(meta => {const canvas = makeCanvas(width, height); return {...meta, canvas, ctx: context(canvas, true), filled: false};});
    this.activeId = this.layers.some(l => l.id === activeId) ? activeId : this.layers[this.layers.length - 1].id;
    this.history.clear(); this.stroke = null;
    this.render(); this.onChange('layers');
  }

  get active() {return this.layers.find(l => l.id === this.activeId) ?? this.layers[0];}
  layer(id: string) {return this.layers.find(l => l.id === id);}
  manifest(): SketchManifest {return {version: 1, width: this.width, height: this.height, paper: this.paper, activeId: this.activeId, layers: this.layers.map(({id, name, kind, visible, locked, opacity}) => ({id, name, kind, visible, locked, opacity}))};}

  // ---------- rendering ----------
  requestRender() {if (!this.frame) this.frame = requestAnimationFrame(() => {this.frame = 0; this.render();});}

  drawPaper(ctx: CanvasRenderingContext2D) {
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PAPER_COLORS[this.paper]; ctx.fillRect(0, 0, this.width, this.height);
    if (this.paper === 'grid') {
      ctx.strokeStyle = '#b9d3e866'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let x = 40; x < this.width; x += 40) {ctx.moveTo(x, 0); ctx.lineTo(x, this.height);}
      for (let y = 40; y < this.height; y += 40) {ctx.moveTo(0, y); ctx.lineTo(this.width, y);}
      ctx.stroke();
    } else {
      // Paper tooth: a faint pattern that differs per paper instead of a drop shadow.
      const pattern = ctx.createPattern(grainTile(this.paper === 'kraft' ? 'coarse' : 'fine'), 'repeat');
      if (pattern) {ctx.globalAlpha = this.paper === 'kraft' ? 0.16 : this.paper === 'black' ? 0.1 : 0.05; ctx.fillStyle = pattern; ctx.globalCompositeOperation = this.paper === 'black' ? 'screen' : 'multiply'; ctx.fillRect(0, 0, this.width, this.height);}
    }
    ctx.restore();
  }

  render() {
    const ctx = this.display, strokes = this.stroke ? [...this.ending, this.stroke] : this.ending;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.drawPaper(ctx);
    for (const layer of this.layers) {
      if (!layer.visible) continue;
      let source: HTMLCanvasElement = layer.canvas;
      const live = strokes.filter(s => s.layer === layer && s.bounds && s.brush !== 'smudge');
      for (const s of live) this.finishStroke(s);
      const erasers = live.filter(s => s.brush === 'eraser');
      if (erasers.length) {
        this.workCtx.globalCompositeOperation = 'copy'; this.workCtx.globalAlpha = 1; this.workCtx.drawImage(layer.canvas, 0, 0);
        this.workCtx.globalCompositeOperation = 'destination-out';
        for (const s of erasers) {this.workCtx.globalAlpha = s.settings.opacity; this.workCtx.drawImage(s.buf.finish, 0, 0);}
        source = this.work;
      }
      ctx.globalAlpha = layer.opacity; ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(source, 0, 0);
      for (const s of live) if (s.brush !== 'eraser') {ctx.globalAlpha = layer.opacity * s.settings.opacity; ctx.globalCompositeOperation = BRUSH_SPECS[s.brush].op; ctx.drawImage(s.buf.finish, 0, 0);}
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  private takeBuffers(): Buffers {
    const buf = this.spare.pop() ?? (() => {const raw = makeCanvas(this.width, this.height), finish = makeCanvas(this.width, this.height); return {raw, rawCtx: context(raw), finish, finishCtx: context(finish)};})();
    for (const ctx of [buf.rawCtx, buf.finishCtx]) {ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.clearRect(0, 0, this.width, this.height);}
    return buf;
  }
  private releaseBuffers(buf: Buffers) {if (buf.raw.width === this.width && buf.raw.height === this.height && this.spare.length < 2) this.spare.push(buf);}

  /** Page image with or without paper, for export, print, fill reference and colour picking. */
  composite(withPaper: boolean) {
    const out = makeCanvas(this.width, this.height), ctx = context(out, true);
    if (withPaper) this.drawPaper(ctx);
    for (const layer of this.layers) if (layer.visible) {ctx.globalAlpha = layer.opacity; ctx.drawImage(layer.canvas, 0, 0);}
    ctx.globalAlpha = 1;
    return out;
  }

  // ---------- strokes ----------
  canPaint(layer = this.active) {return layer.visible && !layer.locked;}

  beginStroke(brush: StrokeBrush, p: InputPoint, settings: BrushSettings, options: StrokeOptions) {
    const layer = this.active;
    if (!this.canPaint(layer)) return false;
    if (brush === 'smudge' && this.ending.length) return false;
    this.cancelStroke();
    const size = Math.max(1, settings.size);
    const bristles = brush === 'oil' ? Array.from({length: Math.max(6, Math.round(size / 2.2))}, () => ({offset: Math.random() * 2 - 1, radius: 0.08 + Math.random() * 0.12, alpha: 0.45 + Math.random() * 0.55})) : [];
    const stroke: Stroke = {brush, settings: {...settings, size}, options, layer, last: p, smoothed: p, carry: 0, bounds: null, bristles, wash: brush === 'watercolor' ? this.washStamp(settings.color) : null, before: brush === 'smudge' ? layer.ctx.getImageData(0, 0, this.width, this.height) : null, buf: this.takeBuffers(), clip: null, clipReady: null, cancelled: false};
    this.stroke = stroke;
    if (options.clip && brush !== 'smudge') stroke.clipReady = this.prepareClip(stroke, p, options.fill);
    this.dab(p, p);
    this.requestRender();
    return true;
  }

  moveStroke(points: InputPoint[]) {
    const stroke = this.stroke; if (!stroke || stroke.shape) return;
    const k = 1 - BRUSH_SPECS[stroke.brush].smooth;
    for (const p of points) {
      const next = {x: stroke.smoothed.x + (p.x - stroke.smoothed.x) * k, y: stroke.smoothed.y + (p.y - stroke.smoothed.y) * k, pressure: p.pressure, pen: p.pen};
      this.segment(stroke.last, next); stroke.smoothed = next; stroke.last = next;
    }
    this.requestRender();
  }

  endStroke(final?: InputPoint): Promise<boolean> {
    const stroke = this.stroke; if (!stroke) return Promise.resolve(false);
    if (final && !stroke.shape) {this.segment(stroke.last, final); stroke.last = final;}
    this.stroke = null; this.ending.push(stroke);
    const done = this.commits.then(() => stroke.clipReady?.catch(() => {})).then(() => this.commit(stroke));
    this.commits = done.catch(() => false);
    return done;
  }

  get busy() {return this.ending.length > 0;}

  private commit(stroke: Stroke) {
    this.ending = this.ending.filter(s => s !== stroke);
    if (stroke.cancelled || !this.layers.includes(stroke.layer)) return false;
    const layer = stroke.layer, rect = stroke.bounds && clipRect(stroke.bounds, this.width, this.height);
    if (rect) {
      if (stroke.brush === 'smudge') {
        const before = new ImageData(stroke.before!.width, stroke.before!.height); before.data.set(stroke.before!.data);
        this.record(layer, rect, cropImage(before, rect));
      } else {
        this.finishStroke(stroke);
        this.record(layer, rect, layer.ctx.getImageData(rect.x, rect.y, rect.width, rect.height));
        const ctx = layer.ctx; ctx.save();
        ctx.globalAlpha = stroke.settings.opacity; ctx.globalCompositeOperation = BRUSH_SPECS[stroke.brush].op;
        ctx.drawImage(stroke.buf.finish, rect.x, rect.y, rect.width, rect.height, rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
      }
      if (stroke.brush !== 'eraser') layer.filled = true;
    }
    this.releaseBuffers(stroke.buf);
    this.render(); if (rect) this.onChange('pixels');
    return !!rect;
  }

  cancelStroke() {
    const stroke = this.stroke; if (!stroke) return;
    if (stroke.brush === 'smudge' && stroke.before) stroke.layer.ctx.putImageData(stroke.before, 0, 0);
    stroke.cancelled = true; this.releaseBuffers(stroke.buf);
    this.stroke = null; this.requestRender();
  }

  get drawing() {return !!this.stroke;}

  beginShape(kind: ShapeKind, p: InputPoint, settings: BrushSettings, options: StrokeOptions) {
    if (!this.beginStroke('felt', p, settings, {...options, clip: false})) return false;
    this.stroke!.shape = {kind, from: p};
    this.stroke!.buf.rawCtx.clearRect(0, 0, this.width, this.height); this.stroke!.bounds = null;
    return true;
  }

  updateShape(p: InputPoint) {
    const stroke = this.stroke; if (!stroke?.shape) return;
    stroke.buf.rawCtx.clearRect(0, 0, this.width, this.height); stroke.bounds = null;
    const points = shapeOutline(stroke.shape.kind, stroke.shape.from, p);
    for (let i = 1; i < points.length; i++) {stroke.carry = 0; this.segment({...points[i - 1], pressure: 0.5, pen: false}, {...points[i], pressure: 0.5, pen: false});}
    this.requestRender();
  }

  private sizeAt(p: InputPoint) {
    const stroke = this.stroke!, factor = p.pen ? 1 - BRUSH_SPECS[stroke.brush].pressureSize + BRUSH_SPECS[stroke.brush].pressureSize * Math.min(1, p.pressure * 1.6) : 1;
    return Math.max(0.6, stroke.settings.size * factor);
  }

  private segment(from: InputPoint, to: InputPoint) {
    const stroke = this.stroke!, spacing = Math.max(0.6, stroke.settings.size * BRUSH_SPECS[stroke.brush].spacing);
    const {points, carry} = stampPositions(from, to, spacing, stroke.carry);
    stroke.carry = carry;
    let prev: Point = from;
    for (const point of points) {this.dab({...point, pressure: to.pressure, pen: to.pen}, prev); prev = point;}
  }

  private grow(x: number, y: number, r: number) {
    const stroke = this.stroke!, rect = {x: x - r - 2, y: y - r - 2, width: r * 2 + 4, height: r * 2 + 4};
    if (!stroke.bounds) {stroke.bounds = rect; return;}
    const b = stroke.bounds, right = Math.max(b.x + b.width, rect.x + rect.width), bottom = Math.max(b.y + b.height, rect.y + rect.height);
    b.x = Math.min(b.x, rect.x); b.y = Math.min(b.y, rect.y); b.width = right - b.x; b.height = bottom - b.y;
  }

  private dab(p: InputPoint, prev: Point) {
    const stroke = this.stroke!, size = this.sizeAt(p), r = size / 2, angle = Math.atan2(p.y - prev.y, p.x - prev.x);
    if (stroke.brush === 'smudge') {this.smudge(p, prev, r); return;}
    const copies = stroke.shape ? [p] : symmetryPoints(p, this.width / 2, this.height / 2, stroke.options.symmetry, stroke.options.slices);
    const ctx = stroke.buf.rawCtx, spec = BRUSH_SPECS[stroke.brush];
    ctx.fillStyle = stroke.settings.color;
    for (const c of copies) {
      this.grow(c.x, c.y, r);
      if (spec.stamp === 'round') {ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();}
      else if (spec.stamp === 'crayon') {
        ctx.beginPath(); ctx.ellipse(c.x, c.y, r * (0.92 + Math.random() * 0.12), r * (0.85 + Math.random() * 0.12), angle, 0, Math.PI * 2); ctx.fill();
      } else if (spec.stamp === 'chisel') {
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(-0.7); ctx.fillRect(-r * 0.32, -r, r * 0.64, r * 2); ctx.restore();
      } else if (spec.stamp === 'wash' && stroke.wash) {
        ctx.drawImage(stroke.wash, c.x - r, c.y - r, r * 2, r * 2);
      } else if (spec.stamp === 'bristle') {
        const nx = -Math.sin(angle), ny = Math.cos(angle);
        for (const b of stroke.bristles) {ctx.globalAlpha = b.alpha; ctx.beginPath(); ctx.arc(c.x + nx * b.offset * r, c.y + ny * b.offset * r, Math.max(0.7, b.radius * r), 0, Math.PI * 2); ctx.fill();}
        ctx.globalAlpha = 1;
      }
    }
  }

  // Wet edge: paint gathers at the rim of each dab, like watercolour drying.
  private washStamp(color: string) {
    const c = makeCanvas(64, 64), ctx = context(c), [r, g, b] = rgbFromHex(color), gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.07)`); gradient.addColorStop(0.75, `rgba(${r},${g},${b},0.11)`); gradient.addColorStop(0.92, `rgba(${r},${g},${b},0.16)`); gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    return c;
  }

  private smudge(p: InputPoint, prev: Point, r: number) {
    const stroke = this.stroke!, d = Math.max(2, Math.ceil(r * 2)), tmp = this.work, tctx = this.workCtx, layer = stroke.layer;
    this.grow(p.x, p.y, r);
    tctx.globalCompositeOperation = 'copy'; tctx.globalAlpha = 1;
    tctx.drawImage(layer.canvas, prev.x - r, prev.y - r, d, d, 0, 0, d, d);
    tctx.globalCompositeOperation = 'destination-in';
    const gradient = tctx.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
    gradient.addColorStop(0, '#000'); gradient.addColorStop(0.6, '#000c'); gradient.addColorStop(1, '#0000');
    tctx.fillStyle = gradient; tctx.fillRect(0, 0, d, d);
    layer.ctx.save(); layer.ctx.globalAlpha = 0.25 + 0.6 * stroke.settings.opacity;
    layer.ctx.drawImage(tmp, 0, 0, d, d, p.x - r, p.y - r, d, d);
    layer.ctx.restore();
    tctx.globalCompositeOperation = 'source-over';
  }

  /** Raw dabs → paper grain → "inside the lines" mask, within the stroke bounds only. */
  private finishStroke(stroke: Stroke) {
    const rect = stroke.bounds && clipRect(stroke.bounds, this.width, this.height);
    if (!rect) return;
    const ctx = stroke.buf.finishCtx, spec = BRUSH_SPECS[stroke.brush];
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'copy';
    ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
    ctx.drawImage(stroke.buf.raw, 0, 0);
    if (spec.grain !== 'none' && stroke.settings.texture > 0) {
      const pattern = ctx.createPattern(grainTile(spec.grain), 'repeat');
      if (pattern) {ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = Math.min(1, stroke.settings.texture); ctx.fillStyle = pattern; ctx.fillRect(rect.x, rect.y, rect.width, rect.height);}
    }
    if (stroke.clip) {ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(stroke.clip, 0, 0);}
    ctx.restore();
  }

  // ---------- fill, clip and colour picking ----------
  /** Lines when a line layer holds a drawing; otherwise the colours of everything visible. */
  private fillReference(): {mode: 'lines' | 'colors'; image: ImageData} {
    const lines = this.layers.find(l => l.kind === 'line' && l.visible && l.filled);
    if (lines) return {mode: 'lines', image: lines.ctx.getImageData(0, 0, this.width, this.height)};
    return {mode: 'colors', image: context(this.composite(false), true).getImageData(0, 0, this.width, this.height)};
  }

  hasLineReference() {return this.layers.some(l => l.kind === 'line' && l.visible && l.filled);}

  private async region(p: Point, options: FillOptions) {
    const {mode, image} = this.fillReference(), x = Math.floor(p.x), y = Math.floor(p.y);
    const request = {width: this.width, height: this.height, data: image.data, x, y, mode, options};
    const worker = this.ensureWorker();
    if (worker) {
      const id = this.nextRequest++;
      const result = await new Promise<Uint8Array | null | 'failed'>(resolve => {
        const timer = setTimeout(() => {this.requests.delete(id); resolve('failed');}, 15000);
        this.requests.set(id, mask => {clearTimeout(timer); resolve(mask);});
        try {worker.postMessage({id, ...request} satisfies FillRequest, [image.data.buffer]);} catch {clearTimeout(timer); this.requests.delete(id); resolve('failed');}
      });
      if (result !== 'failed') return result;
      this.worker?.terminate(); this.worker = null;
      return (await import('./fill-worker')).runFill({...request, data: this.fillReference().image.data});
    }
    return (await import('./fill-worker')).runFill(request);
  }

  private ensureWorker() {
    if (this.worker !== undefined) return this.worker;
    try {
      this.worker = new Worker(new URL('./fill-worker.ts', import.meta.url), {type: 'module'});
      this.worker.onmessage = ({data}: MessageEvent<FillResponse>) => {this.requests.get(data.id)?.(data.mask); this.requests.delete(data.id);};
      this.worker.onerror = () => {for (const resolve of this.requests.values()) resolve(null); this.requests.clear(); this.worker = null;};
    } catch {this.worker = null;}
    return this.worker;
  }

  async fill(p: Point, color: string, opacity: number, options: FillOptions): Promise<'filled' | 'boundary' | 'locked'> {
    const layer = this.active;
    if (!this.canPaint(layer)) return 'locked';
    const mask = await this.region(p, options);
    const rect = mask && maskBounds(mask, this.width, this.height);
    if (!mask || !rect) return 'boundary';
    const before = layer.ctx.getImageData(rect.x, rect.y, rect.width, rect.height), after = new ImageData(rect.width, rect.height);
    after.data.set(before.data);
    paintMask({width: rect.width, height: rect.height, data: after.data}, mask, this.width, rect, rgbFromHex(color), opacity);
    this.record(layer, rect, before);
    layer.ctx.putImageData(after, rect.x, rect.y); layer.filled = true;
    this.render(); this.onChange('pixels');
    return 'filled';
  }

  private async prepareClip(stroke: Stroke, p: Point, options: FillOptions) {
    const mask = await this.region(p, {...options, spread: Math.max(options.spread, 2)});
    if (!mask || stroke.cancelled) return;
    const canvas = makeCanvas(this.width, this.height), ctx = context(canvas), image = ctx.createImageData(this.width, this.height);
    for (let i = 0; i < mask.length; i++) if (mask[i]) image.data[i * 4 + 3] = 255;
    ctx.putImageData(image, 0, 0);
    stroke.clip = canvas; this.requestRender();
  }

  pick(p: Point) {
    const image = context(this.composite(true), true).getImageData(Math.max(0, Math.min(this.width - 1, Math.floor(p.x))), Math.max(0, Math.min(this.height - 1, Math.floor(p.y))), 1, 1);
    return hexFromRgb(pixelAt({width: 1, height: 1, data: image.data}, 0, 0));
  }

  // ---------- history ----------
  private record(layer: Layer, rect: Rect, before: ImageData) {
    this.history.record({layerId: layer.id, rect, image: before, bytes: before.data.byteLength});
    this.onChange('history');
  }

  private swap(patch: Patch) {
    const layer = this.layer(patch.layerId); if (!layer) return null;
    const now = layer.ctx.getImageData(patch.rect.x, patch.rect.y, patch.rect.width, patch.rect.height);
    layer.ctx.putImageData(patch.image, patch.rect.x, patch.rect.y); layer.filled = true;
    return {...patch, image: now};
  }

  undo() {
    if (this.stroke || this.ending.length) return;
    let patch = this.history.takeUndo();
    while (patch) {const swapped = this.swap(patch); if (swapped) {this.history.pushRedo(swapped); break;} patch = this.history.takeUndo();}
    this.render(); this.onChange('history'); this.onChange('pixels');
  }

  redo() {
    if (this.stroke || this.ending.length) return;
    let patch = this.history.takeRedo();
    while (patch) {const swapped = this.swap(patch); if (swapped) {this.history.pushUndo(swapped); break;} patch = this.history.takeRedo();}
    this.render(); this.onChange('history'); this.onChange('pixels');
  }

  /** Replaces a whole layer (image import or clearing) as one undoable step. */
  replaceLayer(layer: Layer, draw: (ctx: CanvasRenderingContext2D) => void) {
    const rect = {x: 0, y: 0, width: this.width, height: this.height};
    this.record(layer, rect, layer.ctx.getImageData(0, 0, this.width, this.height));
    layer.ctx.clearRect(0, 0, this.width, this.height); draw(layer.ctx);
    this.render(); this.onChange('pixels');
  }

  clearLayer(id: string) {const layer = this.layer(id); if (layer && !layer.locked) {this.replaceLayer(layer, () => {}); layer.filled = false;}}

  // ---------- images ----------
  /** Puts a photo under everything, fitted to the page, as one undoable step. */
  placePhoto(source: CanvasImageSource & {width: number; height: number}) {
    const layer = this.layers.find(l => l.kind === 'photo') ?? this.active, rect = containRect(source.width, source.height, this.width, this.height);
    const wasLocked = layer.locked; layer.locked = false;
    this.replaceLayer(layer, ctx => {ctx.imageSmoothingQuality = 'high'; ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);});
    layer.filled = true; layer.locked = wasLocked; layer.visible = true;
    this.onChange('layers');
    return layer;
  }

  /** Line art goes onto the top line layer, which is then locked so colour never touches it. */
  placeLines(source: HTMLCanvasElement, threshold: number, ink: [number, number, number] | undefined) {
    const layer = this.layers.find(l => l.kind === 'line') ?? this.active, rect = containRect(source.width, source.height, this.width, this.height);
    const scratch = makeCanvas(this.width, this.height), sctx = context(scratch, true);
    sctx.imageSmoothingQuality = 'high'; sctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
    const image = sctx.getImageData(0, 0, this.width, this.height), lines = extractLineArt({width: this.width, height: this.height, data: image.data}, threshold, 24, ink);
    layer.locked = false;
    this.replaceLayer(layer, ctx => ctx.putImageData(new ImageData(lines.data, this.width, this.height), 0, 0));
    layer.filled = true; layer.locked = true; layer.visible = true;
    const paint = this.layers.find(l => l.kind === 'paint' && !l.locked);
    if (paint) this.activeId = paint.id;
    this.onChange('layers');
    return layer;
  }

  // ---------- layers ----------
  addLayer(kind: LayerKind, name: string) {
    if (this.layers.length >= 5) return null;
    const canvas = makeCanvas(this.width, this.height), id = `${kind}-${Date.now().toString(36)}`;
    const layer: Layer = {id, name, kind, visible: true, locked: false, opacity: 1, canvas, ctx: context(canvas, true), filled: false};
    const index = this.layers.findIndex(l => l.id === this.activeId);
    this.layers.splice(index + 1, 0, layer); this.activeId = id;
    this.render(); this.onChange('layers');
    return layer;
  }

  removeLayer(id: string) {
    if (this.layers.length <= 1) return;
    this.layers = this.layers.filter(l => l.id !== id);
    if (this.activeId === id) this.activeId = this.layers[this.layers.length - 1].id;
    this.render(); this.onChange('layers');
  }

  moveLayer(id: string, direction: 1 | -1) {
    const i = this.layers.findIndex(l => l.id === id), j = i + direction;
    if (i < 0 || j < 0 || j >= this.layers.length) return;
    [this.layers[i], this.layers[j]] = [this.layers[j], this.layers[i]];
    this.render(); this.onChange('layers');
  }

  updateLayer(id: string, patch: Partial<Pick<LayerMeta, 'name' | 'visible' | 'locked' | 'opacity'>>) {
    const layer = this.layer(id); if (!layer) return;
    Object.assign(layer, patch); this.render(); this.onChange('layers');
  }

  setActive(id: string) {if (this.layer(id)) {this.activeId = id; this.onChange('layers');}}
  setPaper(paper: PaperKind) {this.paper = paper; this.render(); this.onChange('layers');}

  /** Restores saved layer pixels after `reset`. */
  async loadPixels(images: Record<string, Blob | null>) {
    for (const layer of this.layers) {
      const blob = images[layer.id]; if (!blob) continue;
      try {const bitmap = await createImageBitmap(blob); layer.ctx.drawImage(bitmap, 0, 0); bitmap.close(); layer.filled = true;} catch { /* an unreadable layer stays empty */ }
    }
    this.render(); this.onChange('layers');
  }

  layerPng(layer: Layer) {return layer.filled ? new Promise<Blob | null>(resolve => layer.canvas.toBlob(resolve, 'image/png')) : Promise.resolve(null);}
  pagePng() {return new Promise<Blob | null>(resolve => this.composite(true).toBlob(resolve, 'image/png'));}

  dispose() {cancelAnimationFrame(this.frame); this.worker?.terminate(); for (const resolve of this.requests.values()) resolve(null); this.requests.clear();}
}

function cropImage(image: ImageData, rect: Rect) {
  const raster = createRaster(rect.width, rect.height);
  for (let y = 0; y < rect.height; y++) raster.data.set(image.data.subarray(((rect.y + y) * image.width + rect.x) * 4, ((rect.y + y) * image.width + rect.x + rect.width) * 4), y * rect.width * 4);
  return new ImageData(raster.data, rect.width, rect.height);
}
