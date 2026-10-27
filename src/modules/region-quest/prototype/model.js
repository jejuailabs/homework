'use strict';

// A small local-only model. This prototype never reads or changes classroom data.
globalThis.RegionQuestModel = (() => {
  const WIDTH = 1600, HEIGHT = 1000;
  const DEFAULT_WORLD = {
    width: WIDTH, height: HEIGHT, cellSize: 25,
    walkRegions: [[[100, 470], [1500, 470], [1500, 910], [100, 910]]],
    obstacles: [],
  };
  const PHASES = ['meet', 'find', 'deliver', 'done'];
  const DIRECTIONS = ['down', 'left', 'right', 'up'];
  const point = value => Boolean(value && Number.isFinite(value.x) && Number.isFinite(value.y));
  const copyPoint = value => ({x: value.x, y: value.y});
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function insidePolygon(p, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [ax, ay] = polygon[j], [bx, by] = polygon[i];
      const cross = (p.x - ax) * (by - ay) - (p.y - ay) * (bx - ax);
      if (Math.abs(cross) < 0.0001 && p.x >= Math.min(ax, bx) && p.x <= Math.max(ax, bx) && p.y >= Math.min(ay, by) && p.y <= Math.max(ay, by)) return true;
      if ((ay > p.y) !== (by > p.y) && p.x < (bx - ax) * (p.y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  }

  function isWalkable(p, world = DEFAULT_WORLD) {
    if (!point(p) || p.x < 0 || p.y < 0 || p.x > world.width || p.y > world.height) return false;
    if (!world.walkRegions.some(polygon => insidePolygon(p, polygon))) return false;
    return !world.obstacles.some(rect => p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height);
  }

  // Each segment is checked, not only its destination, to prevent tunnelling.
  function clearSegment(from, to, world = DEFAULT_WORLD) {
    if (!isWalkable(from, world) || !isWalkable(to, world)) return false;
    // Intersect rectangles analytically so even a sub-pixel wall cannot be skipped.
    if (world.obstacles.some(rect => {
      let low = 0, high = 1;
      for (const [axis, size] of [['x', 'width'], ['y', 'height']]) {
        const delta = to[axis] - from[axis], min = rect[axis], max = min + rect[size];
        if (delta === 0) {
          if (from[axis] < min || from[axis] > max) return false;
        } else {
          const a = (min - from[axis]) / delta, b = (max - from[axis]) / delta;
          low = Math.max(low, Math.min(a, b));
          high = Math.min(high, Math.max(a, b));
          if (low > high) return false;
        }
      }
      return true;
    })) return false;
    const steps = Math.max(1, Math.ceil(distance(from, to) / 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!isWalkable({x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t}, world)) return false;
    }
    return true;
  }

  function move(position, delta, world = DEFAULT_WORLD) {
    if (!point(position)) return {x: 400, y: 700};
    if (!point(delta) || !isWalkable(position, world)) return copyPoint(position);
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / 2));
    // A frame should be short; cap pathological inputs instead of locking the UI.
    if (steps > 4000) return copyPoint(position);
    const dx = delta.x / steps, dy = delta.y / steps;
    let next = copyPoint(position);
    for (let i = 0; i < steps; i++) {
      const across = {x: next.x + dx, y: next.y};
      if (clearSegment(next, across, world)) next = across;
      const down = {x: next.x, y: next.y + dy};
      if (clearSegment(next, down, world)) next = down;
    }
    return next;
  }

  function findPath(from, to, world = DEFAULT_WORLD) {
    if (!isWalkable(from, world) || !isWalkable(to, world)) return [];
    if (distance(from, to) < 0.01) return [];
    const cell = world.cellSize;
    if (!Number.isFinite(cell) || cell < 4) return [];
    const cols = Math.ceil(world.width / cell), rows = Math.ceil(world.height / cell);
    if (cols * rows > 100000) return [];
    const center = id => ({x: (id % cols + 0.5) * cell, y: (Math.floor(id / cols) + 0.5) * cell});
    const nearCell = p => {
      const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), candidates = [];
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const id = y * cols + x, candidate = center(id);
        if (clearSegment(p, candidate, world)) candidates.push({id, distance: distance(p, candidate)});
      }
      candidates.sort((a, b) => a.distance - b.distance);
      return candidates[0]?.id ?? -1;
    };
    const start = nearCell(from), goal = nearCell(to);
    if (start < 0 || goal < 0) return [];
    const parents = new Int32Array(cols * rows).fill(-2), queue = [start];
    parents[start] = -1;
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      if (id === goal) break;
      const x = id % cols, y = Math.floor(id / cols);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const candidate = ny * cols + nx;
        if (parents[candidate] !== -2 || !clearSegment(center(id), center(candidate), world)) continue;
        parents[candidate] = id;
        queue.push(candidate);
      }
    }
    if (parents[goal] === -2) return [];
    const path = [];
    for (let id = goal; id !== -1; id = parents[id]) path.push(center(id));
    path.reverse();
    if (distance(path[0], from) < 0.01) path.shift();
    if (!path.length || distance(path[path.length - 1], to) > 0.01) path.push(copyPoint(to));
    return path;
  }

  function directionForDelta(dx, dy, last = 'down') {
    const fallback = DIRECTIONS.includes(last) ? last : 'down';
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) + Math.abs(dy) < 0.001) return fallback;
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }

  function createState() {
    return {version: 1, phase: 'meet', position: {x: 400, y: 700}, facing: 'down', atHome: false, resume: null};
  }

  function normalizeState(raw, world = DEFAULT_WORLD) {
    const safe = createState();
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return safe;
    const position = isWalkable(raw.position, world) ? copyPoint(raw.position) : safe.position;
    const facing = DIRECTIONS.includes(raw.facing) ? raw.facing : safe.facing;
    const phase = PHASES.includes(raw.phase) ? raw.phase : safe.phase;
    const atHome = raw.atHome === true && isWalkable(raw.resume, world);
    const resume = atHome ? {...copyPoint(raw.resume), facing: DIRECTIONS.includes(raw.resume.facing) ? raw.resume.facing : facing} : null;
    return {version: 1, phase, position, facing, atHome, resume};
  }

  function advanceQuest(state, event, world = DEFAULT_WORLD) {
    const next = normalizeState(state, world);
    if (next.atHome) return next;
    const transitions = {meet: {accept: 'find'}, find: {collect: 'deliver'}, deliver: {deliver: 'done'}};
    next.phase = transitions[next.phase]?.[event] ?? next.phase;
    return next;
  }

  function returnHome(state, home = {x: 400, y: 700}, world = DEFAULT_WORLD) {
    const next = normalizeState(state, world);
    if (!isWalkable(home, world) || next.atHome) return next;
    next.resume = {...copyPoint(next.position), facing: next.facing};
    next.position = copyPoint(home);
    next.facing = 'down';
    next.atHome = true;
    return next;
  }

  function resumeAdventure(state, world = DEFAULT_WORLD) {
    const next = normalizeState(state, world);
    if (!next.atHome || !next.resume) return next;
    next.position = copyPoint(next.resume);
    next.facing = next.resume.facing;
    next.atHome = false;
    next.resume = null;
    return next;
  }

  return {WIDTH, HEIGHT, DEFAULT_WORLD, isWalkable, findPath, move, directionForDelta, createState, normalizeState, advanceQuest, returnHome, resumeAdventure, reset: createState};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.RegionQuestModel;
