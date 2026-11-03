import test from 'node:test';
import assert from 'node:assert/strict';
import {PatchHistory, SKETCH_LIMITS, clipRect, containRect, createRaster, cropRaster, extractLineArt, fillRegion, fillWalls, fitSize, hexFromRgb, maskBounds, paintMask, pixelAt, pushRecentColor, putRaster, rgbFromHex, shapeOutline, stampPositions, symmetryPoints, wallDistance, type Raster} from './raster';
import {fitView, pageToScreen, pinchView, screenToPage, settleRotation, zoomAt} from './view';

// A 20x20 line drawing: a closed square from (4,4) to (15,15) one pixel wide.
function squareLines(gapAt?: number, gapWidth = 1): Raster {
  const r = createRaster(20, 20), set = (x: number, y: number) => {const i = (y * 20 + x) * 4; r.data[i + 3] = 255;};
  for (let i = 4; i <= 15; i++) {set(i, 4); set(i, 15); set(4, i); set(15, i);}
  if (gapAt !== undefined) for (let g = 0; g < gapWidth; g++) {const i = ((gapAt + g) * 20 + 15) * 4; r.data[i + 3] = 0;}
  return r;
}
const count = (mask: Uint8Array) => mask.reduce((sum, v) => sum + v, 0);

test('fill stays inside the line boundary and never paints outside it', () => {
  const lines = squareLines(), walls = fillWalls(lines, 8, 8, 'lines', 0);
  const inside = fillRegion(walls, 20, 20, 8, 8, {tolerance: 0, gap: 0, spread: 0})!;
  assert.equal(count(inside), 10 * 10);
  assert.equal(inside[2 * 20 + 2], 0);
  const outside = fillRegion(walls, 20, 20, 1, 1, {tolerance: 0, gap: 0, spread: 0})!;
  assert.equal(count(outside), 400 - 44 - 100);
  assert.equal(fillRegion(walls, 20, 20, 4, 8, {tolerance: 0, gap: 0, spread: 0}), null, 'tapping the line itself fills nothing');
  assert.equal(fillRegion(walls, 20, 20, -1, 8, {tolerance: 0, gap: 0, spread: 0}), null);
});

test('spread pushes paint under the line so no white rim remains, but not past it', () => {
  const walls = fillWalls(squareLines(), 8, 8, 'lines', 0), region = fillRegion(walls, 20, 20, 8, 8, {tolerance: 0, gap: 0, spread: 2})!;
  assert.equal(count(region), 12 * 12, 'interior plus the one-pixel outline');
  assert.equal(region[3 * 20 + 3], 0);
});

test('gap closing treats a small break in the outline as closed', () => {
  const lines = squareLines(9, 2), walls = fillWalls(lines, 8, 8, 'lines', 0);
  const leaky = fillRegion(walls, 20, 20, 8, 8, {tolerance: 0, gap: 0, spread: 0})!;
  assert(count(leaky) > 200, 'without gap closing the paint escapes');
  const closed = fillRegion(walls, 20, 20, 8, 8, {tolerance: 0, gap: 2, spread: 0})!;
  assert(count(closed) >= 96 && count(closed) <= 110, `region ${count(closed)} stays near the 100 inside pixels`);
  assert.equal(closed[1 * 20 + 18], 0, 'nothing reaches the far outside');
});

test('a tap in a narrow channel still fills although gap closing would block it', () => {
  const walls = new Uint8Array(20 * 3); for (let x = 0; x < 20; x++) {walls[x] = 1; walls[40 + x] = 1;}
  const region = fillRegion(walls, 20, 3, 5, 1, {tolerance: 0, gap: 3, spread: 0})!;
  assert.equal(count(region), 20);
});

test('colour tolerance decides which neighbouring colours join the fill', () => {
  const r = createRaster(4, 1);
  [[255, 255, 255], [245, 245, 245], [200, 200, 200], [0, 0, 0]].forEach((c, i) => r.data.set([...c, 255], i * 4));
  const strict = fillRegion(fillWalls(r, 0, 0, 'colors', 0), 4, 1, 0, 0, {tolerance: 0, gap: 0, spread: 0})!;
  const loose = fillRegion(fillWalls(r, 0, 0, 'colors', 10), 4, 1, 0, 0, {tolerance: 10, gap: 0, spread: 0})!;
  const wide = fillRegion(fillWalls(r, 0, 0, 'colors', 30), 4, 1, 0, 0, {tolerance: 30, gap: 0, spread: 0})!;
  assert.deepEqual([count(strict), count(loose), count(wide)], [1, 2, 3]);
});

test('line tolerance lets the fill run over faint anti-aliased line edges', () => {
  const r = createRaster(3, 1); r.data[3] = 0; r.data[7] = 90; r.data[11] = 0;
  assert.equal(count(fillRegion(fillWalls(r, 0, 0, 'lines', 0), 3, 1, 0, 0, {tolerance: 0, gap: 0, spread: 0})!), 1);
  assert.equal(count(fillRegion(fillWalls(r, 0, 0, 'lines', 50), 3, 1, 0, 0, {tolerance: 50, gap: 0, spread: 0})!), 3);
});

test('wall distance is the Chebyshev distance to the nearest line', () => {
  const walls = new Uint8Array(25); walls[12] = 1;
  const d = wallDistance(walls, 5, 5);
  assert.deepEqual([d[12], d[6], d[7], d[0], d[24]], [0, 1, 1, 2, 2]);
  assert.equal(wallDistance(new Uint8Array(4), 2, 2)[0], 255);
});

test('line-art extraction keeps dark lines and turns light paper transparent', () => {
  const photo = createRaster(4, 1);
  photo.data.set([250, 250, 245, 255, 20, 20, 30, 255, 128, 128, 128, 255, 0, 0, 0, 0]);
  const lines = extractLineArt(photo, 160, 24);
  assert.deepEqual([lines.data[3], lines.data[7], lines.data[15]], [0, 255, 0], 'paper and transparency vanish, ink stays');
  assert(lines.data[11] > 200, 'mid grey is a line below the threshold');
  assert.equal(extractLineArt(photo, 100, 24).data[11], 0, 'a lower threshold drops it');
  assert.deepEqual([...extractLineArt(photo, 160, 24, [0, 0, 0]).data.slice(4, 8)], [0, 0, 0, 255]);
});

test('colour picking, recent colours and hex conversion', () => {
  const r = createRaster(2, 2); r.data.set([12, 34, 56, 255], 12);
  assert.deepEqual(pixelAt(r, 1.7, 1.2), [12, 34, 56, 255]);
  assert.deepEqual(pixelAt(r, 5, 5), [0, 0, 0, 0]);
  assert.equal(hexFromRgb([12, 34, 56, 255]), '#0c2238');
  assert.deepEqual(rgbFromHex('#0C2238'), [12, 34, 56]);
  assert.deepEqual(rgbFromHex('nonsense'), [0, 0, 0]);
  let recent: string[] = [];
  for (const c of ['#111111', '#222222', '#111111', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#999999']) recent = pushRecentColor(recent, c);
  assert.equal(recent.length, 8);
  assert.equal(recent[0], '#999999');
  assert.equal(recent.includes('#222222'), false, 'the oldest falls out');
  assert.equal(recent.filter(c => c === '#111111').length, 1, 'a reused colour moves forward instead of repeating');
});

test('painting a mask blends with existing pixels and leaves the rest', () => {
  const walls = fillWalls(squareLines(), 8, 8, 'lines', 0), mask = fillRegion(walls, 20, 20, 8, 8, {tolerance: 0, gap: 0, spread: 0})!;
  const rect = maskBounds(mask, 20, 20)!;
  assert.deepEqual(rect, {x: 5, y: 5, width: 10, height: 10});
  const patch = createRaster(rect.width, rect.height);
  paintMask(patch, mask, 20, rect, [255, 0, 0], 1);
  assert.deepEqual([...patch.data.slice(0, 4)], [255, 0, 0, 255]);
  paintMask(patch, mask, 20, rect, [0, 0, 255], 0.5);
  assert.deepEqual([...patch.data.slice(0, 4)], [128, 0, 128, 255]);
  assert.equal(maskBounds(new Uint8Array(4), 2, 2), null);
});

test('undo patches restore the exact pixels and redo brings the change back', () => {
  const layer = createRaster(8, 8), history = new PatchHistory<{rect: {x: number; y: number; width: number; height: number}; pixels: Raster; bytes: number}>();
  const change = (x: number, y: number, value: number) => {
    const rect = {x, y, width: 2, height: 2}, before = cropRaster(layer, rect);
    history.record({rect, pixels: before, bytes: before.data.byteLength});
    const patch = cropRaster(layer, rect); patch.data.fill(value); putRaster(layer, patch, x, y);
  };
  const swap = (entry: {rect: {x: number; y: number; width: number; height: number}; pixels: Raster; bytes: number}) => {const now = cropRaster(layer, entry.rect); putRaster(layer, entry.pixels, entry.rect.x, entry.rect.y); return {...entry, pixels: now};};
  const blank = layer.data.slice();
  for (let i = 0; i < 30; i++) change(i % 7, (i * 3) % 7, i + 1);
  const finished = layer.data.slice();
  for (let i = 0; i < 30; i++) {const entry = history.takeUndo()!; history.pushRedo(swap(entry));}
  assert.deepEqual(layer.data, blank, '30 undos return to the empty page');
  assert.equal(history.canUndo, false);
  for (let i = 0; i < 30; i++) {const entry = history.takeRedo()!; history.pushUndo(swap(entry));}
  assert.deepEqual(layer.data, finished);
  change(0, 0, 99);
  assert.equal(history.canRedo, false, 'a new change clears redo');
});

test('history keeps at least 50 steps within its budget and drops the oldest beyond it', () => {
  const history = new PatchHistory<{bytes: number; id: number}>(1000, 120, 50);
  for (let i = 0; i < 80; i++) history.record({bytes: 10, id: i});
  assert.equal(history.size, 80);
  const tight = new PatchHistory<{bytes: number; id: number}>(1000, 120, 50);
  for (let i = 0; i < 80; i++) tight.record({bytes: 30, id: i});
  assert.equal(tight.size, 50, 'over budget the minimum number of steps stays');
  const hard = new PatchHistory<{bytes: number; id: number}>(1000, 120, 50);
  for (let i = 0; i < 10; i++) hard.record({bytes: 900, id: i});
  assert(hard.bytes <= 2000, 'twice the budget is a hard ceiling');
  assert.equal(hard.takeUndo()!.id, 9);
  const capped = new PatchHistory<{bytes: number}>(1e9, 120, 50);
  for (let i = 0; i < 200; i++) capped.record({bytes: 1});
  assert.equal(capped.size, 120);
  assert(SKETCH_LIMITS.minHistorySteps >= 50);
});

test('size limits keep imports and pages within the device budget', () => {
  assert.deepEqual(fitSize(4800, 1200), {width: 2400, height: 600});
  assert.deepEqual(fitSize(800, 600), {width: 800, height: 600});
  assert.deepEqual(containRect(200, 100, 100, 100), {x: 0, y: 25, width: 100, height: 50});
  assert.deepEqual(clipRect({x: -5, y: 3.5, width: 20, height: 100}, 10, 10), {x: 0, y: 3, width: 10, height: 7});
  assert.equal(clipRect({x: 20, y: 0, width: 5, height: 5}, 10, 10), null);
  const big = createRaster(10, 10); big.data.fill(7);
  assert.equal(cropRaster(big, {x: 8, y: 8, width: 5, height: 5}).width, 2);
});

test('stamps are evenly spaced across segments', () => {
  const first = stampPositions({x: 0, y: 0}, {x: 10, y: 0}, 4, 0);
  assert.deepEqual(first.points.map(p => p.x), [4, 8]);
  const second = stampPositions({x: 10, y: 0}, {x: 20, y: 0}, 4, first.carry);
  assert.deepEqual(second.points.map(p => p.x), [12, 16, 20]);
});

test('mirror drawing places copies symmetrically around the centre', () => {
  assert.deepEqual(symmetryPoints({x: 2, y: 3}, 5, 5, 'mirror'), [{x: 2, y: 3}, {x: 8, y: 3}]);
  assert.equal(symmetryPoints({x: 2, y: 3}, 5, 5, 'quad').length, 4);
  const radial = symmetryPoints({x: 10, y: 5}, 5, 5, 'radial', 4);
  assert.equal(radial.length, 4);
  assert(Math.abs(radial[2].x - 0) < 1e-9 && Math.abs(radial[2].y - 5) < 1e-9);
  assert.deepEqual(symmetryPoints({x: 1, y: 1}, 5, 5, 'off'), [{x: 1, y: 1}]);
});

test('shape outlines are closed and fit their box', () => {
  for (const kind of ['rect', 'ellipse', 'star', 'heart', 'triangle'] as const) {
    const points = shapeOutline(kind, {x: 10, y: 10}, {x: 110, y: 60});
    assert.deepEqual(points[0], points.at(-1), kind);
    for (const p of points) assert(p.x >= 9.9 && p.x <= 110.1 && p.y >= 9.9 && p.y <= 60.1, `${kind} ${p.x},${p.y}`);
  }
  assert.equal(shapeOutline('line', {x: 0, y: 0}, {x: 5, y: 5}).length, 2);
});

test('the view camera round-trips points and keeps pinch anchors under the fingers', () => {
  const view = {x: 40, y: 30, scale: 2, rotation: 0.4}, p = {x: 123, y: 45}, back = screenToPage(view, pageToScreen(view, p));
  assert(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
  const fit = fitView(1754, 1240, 1000, 800, 20);
  assert(fit.scale > 0.5 && fit.scale < 0.6);
  assert(Math.abs(fit.x - (1000 - 1754 * fit.scale) / 2) < 1e-9);
  const zoomed = zoomAt(fit, 2, {x: 300, y: 200}), anchor = screenToPage(fit, {x: 300, y: 200}), after = pageToScreen(zoomed, anchor);
  assert(Math.abs(after.x - 300) < 1e-9 && Math.abs(after.y - 200) < 1e-9);
  const from: [{x: number; y: number}, {x: number; y: number}] = [{x: 100, y: 100}, {x: 200, y: 100}], to: [{x: number; y: number}, {x: number; y: number}] = [{x: 120, y: 80}, {x: 120, y: 280}];
  const pinched = pinchView(fit, from, to), a = screenToPage(fit, from[0]), moved = pageToScreen(pinched, a);
  assert(Math.abs(moved.x - 120) < 1e-6 && Math.abs(moved.y - 80) < 1e-6);
  assert(Math.abs(pinched.scale - fit.scale * 2) < 1e-9);
  const settled = settleRotation({...fit, rotation: 0.05}, {x: 500, y: 400});
  assert.equal(settled.rotation, 0);
});
