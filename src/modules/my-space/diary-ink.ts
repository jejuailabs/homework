import {getStroke} from 'perfect-freehand';
import type {DiaryLayer} from './catalog';

export type DiaryInkPoint = [number, number, number];
export const DIARY_WIDTH = 720;
export const DIARY_HEIGHT = 960;
export const DIARY_POINT_LIMIT = 20000;
export const DIARY_STROKE_LIMIT = 2000;

export function diaryInkPath(layer: Pick<DiaryLayer, 'points' | 'width' | 'brush'>, complete = true): string {
  const points = layer.points || [];
  if (!points.length) return '';
  const outline = getStroke(points, {
    size: layer.width || 4, thinning: layer.brush === 'marker' ? 0 : .55,
    smoothing: .65, streamline: .35, simulatePressure: false, last: complete,
    start: {cap: true}, end: {cap: true},
  });
  if (!outline.length) return '';
  const n = (value: number) => Math.round(value * 100) / 100;
  let path = `M${n(outline[0][0])},${n(outline[0][1])}Q`;
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index], b = outline[(index + 1) % outline.length];
    path += `${n(a[0])},${n(a[1])} ${n((a[0] + b[0]) / 2)},${n((a[1] + b[1]) / 2)} `;
  }
  return path + 'Z';
}

/** Keep fine pressure changes, avoiding duplicate samples without flattening handwriting. */
export function appendDiaryPoint(points: DiaryInkPoint[], point: DiaryInkPoint): boolean {
  if (points.length >= DIARY_STROKE_LIMIT) return false;
  const last = points.at(-1);
  if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < .3 && Math.abs(point[2] - last[2]) < .02) return false;
  points.push(point.map(value => Math.round(value * 100) / 100) as DiaryInkPoint);
  return true;
}

export function diaryPoint(clientX: number, clientY: number, rect: {left: number; top: number; width: number; height: number}, pressure = .5): DiaryInkPoint {
  return [
    Math.max(0, Math.min(DIARY_WIDTH, (clientX - rect.left) * DIARY_WIDTH / rect.width)),
    Math.max(0, Math.min(DIARY_HEIGHT, (clientY - rect.top) * DIARY_HEIGHT / rect.height)),
    Math.max(.05, Math.min(1, pressure || .5)),
  ];
}
