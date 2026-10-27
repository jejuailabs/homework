import test from 'node:test';
import assert from 'node:assert/strict';
import {appendDiaryPoint, diaryInkPath, diaryPoint, DIARY_STROKE_LIMIT, type DiaryInkPoint} from './diary-ink';

test('zoomed and scrolled paper maps pointer input to the fixed export coordinates', () => {
  assert.deepEqual(diaryPoint(290, 500, {left: 110, top: 260, width: 360, height: 480}, .7), [360, 480, .7]);
  assert.deepEqual(diaryPoint(290, 500, {left: -70, top: 20, width: 720, height: 960}, .7), [360, 480, .7]);
  assert.deepEqual(diaryPoint(-10, 1100, {left: 0, top: 0, width: 720, height: 960}, 1.2), [0, 960, 1]);
});

test('stationary pen pressure is retained while identical coalesced points are dropped', () => {
  const points: DiaryInkPoint[] = [];
  assert.equal(appendDiaryPoint(points, [12.123, 31.123, .2]), true);
  assert.equal(appendDiaryPoint(points, [12.123, 31.123, .2]), false);
  assert.equal(appendDiaryPoint(points, [12.123, 31.123, .8]), true);
  assert.deepEqual(points, [[12.12, 31.12, .2], [12.12, 31.12, .8]]);
});

test('sample limit preserves the previous stroke instead of silently mutating it', () => {
  const points: DiaryInkPoint[] = Array.from({length: DIARY_STROKE_LIMIT}, (_, index) => [index / 10, 20, .5]);
  assert.equal(appendDiaryPoint(points, [300, 50, .6]), false);
  assert.equal(points.length, DIARY_STROKE_LIMIT);
  assert.deepEqual(points.at(-1), [199.9, 20, .5]);
});

test('a short tap has a finite closed outline and pressure changes actual pen geometry', () => {
  const dot = diaryInkPath({points: [[40, 80, .5]], brush: 'pen', width: 4});
  assert.match(dot, /^M/);
  assert.match(dot, /Z$/);
  assert.doesNotMatch(dot, /NaN|Infinity/);
  const low: DiaryInkPoint[] = [[10, 10, .2], [20, 25, .2], [30, 15, .2]];
  const high = low.map(([x, y]) => [x, y, .9] as DiaryInkPoint);
  assert.notEqual(diaryInkPath({points: low, brush: 'pen', width: 8}), diaryInkPath({points: high, brush: 'pen', width: 8}));
  assert.equal(diaryInkPath({points: [], brush: 'pencil', width: 2}), '');
});

test('highlighter width remains stable across pressure changes', () => {
  const points: DiaryInkPoint[] = [[15, 20, .1], [25, 20, .9], [35, 20, .2]];
  const even = points.map(([x, y]) => [x, y, .5] as DiaryInkPoint);
  assert.equal(diaryInkPath({points, brush: 'marker', width: 20}), diaryInkPath({points: even, brush: 'marker', width: 20}));
});
