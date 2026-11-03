/** Page camera: screen point = translate(x, y) · rotate(rotation) · scale(scale) · page point. */
export type View = {x: number; y: number; scale: number; rotation: number};
export type Pt = {x: number; y: number};
export const MIN_SCALE = 0.05, MAX_SCALE = 16;

const clampScale = (scale: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));

export function pageToScreen(view: View, p: Pt): Pt {
  const c = Math.cos(view.rotation), s = Math.sin(view.rotation);
  return {x: view.x + (p.x * c - p.y * s) * view.scale, y: view.y + (p.x * s + p.y * c) * view.scale};
}

export function screenToPage(view: View, p: Pt): Pt {
  const c = Math.cos(-view.rotation), s = Math.sin(-view.rotation), dx = (p.x - view.x) / view.scale, dy = (p.y - view.y) / view.scale;
  return {x: dx * c - dy * s, y: dx * s + dy * c};
}

/** Whole page centred in the box with a margin, upright. */
export function fitView(pageWidth: number, pageHeight: number, boxWidth: number, boxHeight: number, margin = 24): View {
  const scale = clampScale(Math.min((boxWidth - margin * 2) / pageWidth, (boxHeight - margin * 2) / pageHeight));
  return {x: (boxWidth - pageWidth * scale) / 2, y: (boxHeight - pageHeight * scale) / 2, scale, rotation: 0};
}

/** Zooms keeping the page point under `anchor` (screen) fixed. */
export function zoomAt(view: View, factor: number, anchor: Pt): View {
  const page = screenToPage(view, anchor), next = {...view, scale: clampScale(view.scale * factor)}, moved = pageToScreen(next, page);
  return {...next, x: next.x + anchor.x - moved.x, y: next.y + anchor.y - moved.y};
}

/** Rotates around a screen point. */
export function rotateAt(view: View, radians: number, anchor: Pt): View {
  const page = screenToPage(view, anchor), next = {...view, rotation: view.rotation + radians}, moved = pageToScreen(next, page);
  return {...next, x: next.x + anchor.x - moved.x, y: next.y + anchor.y - moved.y};
}

/**
 * Two-finger gesture: the page points first touched stay under the fingers
 * (pan, pinch zoom and twist together).
 */
export function pinchView(start: View, from: [Pt, Pt], to: [Pt, Pt], allowRotate = true): View {
  const a = screenToPage(start, from[0]), b = screenToPage(start, from[1]);
  const fromLen = Math.hypot(from[1].x - from[0].x, from[1].y - from[0].y) || 1, toLen = Math.hypot(to[1].x - to[0].x, to[1].y - to[0].y) || 1;
  const turn = allowRotate ? Math.atan2(to[1].y - to[0].y, to[1].x - to[0].x) - Math.atan2(from[1].y - from[0].y, from[1].x - from[0].x) : 0;
  const scale = clampScale(start.scale * toLen / fromLen), rotation = start.rotation + turn;
  const mid = {x: (to[0].x + to[1].x) / 2, y: (to[0].y + to[1].y) / 2}, pageMid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
  const placed = pageToScreen({x: 0, y: 0, scale, rotation}, pageMid);
  return {x: mid.x - placed.x, y: mid.y - placed.y, scale, rotation};
}

/** Snaps a near-upright rotation back to 0 so a slight twist while pinching does not tilt the page. */
export function settleRotation(view: View, anchor: Pt, snap = 0.12): View {
  const turn = Math.PI / 2, nearest = Math.round(view.rotation / turn) * turn;
  return Math.abs(view.rotation - nearest) < snap ? rotateAt(view, nearest - view.rotation, anchor) : view;
}
