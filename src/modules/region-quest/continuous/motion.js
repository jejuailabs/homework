'use strict';

// East/right and south/down world coordinates. Roads are immutable after world
// creation; replace world.roads when editing geometry. Obstacles may change.
globalThis.ContinuousMotion = (() => {
  const EPS = 1e-7, BUCKET = 160;
  const cache = new WeakMap();
  const point = p => Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const copy = p => ({x: p.x, y: p.y});
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));

  function prepare(world) {
    const old = cache.get(world);
    if (old && old.roads === world.roads) return old;
    const segments = [], buckets = new Map();
    for (const road of world.roads || []) {
      if (!Number.isFinite(road.width) || road.width <= 0 || !Array.isArray(road.points)) continue;
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1], b = road.points[i];
        if (!point(a) || !point(b)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy), radius = road.width / 2;
        const segment = {a: copy(a), b: copy(b), dx, dy, length, radius};
        const id = segments.push(segment) - 1;
        for (let y = Math.floor((Math.min(a.y, b.y) - radius) / BUCKET); y <= Math.floor((Math.max(a.y, b.y) + radius) / BUCKET); y++) {
          for (let x = Math.floor((Math.min(a.x, b.x) - radius) / BUCKET); x <= Math.floor((Math.max(a.x, b.x) + radius) / BUCKET); x++) {
            const key = `${x},${y}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(id);
          }
        }
      }
    }
    const result = {roads: world.roads, segments, buckets};
    cache.set(world, result);
    return result;
  }

  function nearby(from, to, data) {
    const ids = new Set();
    for (let y = Math.floor(Math.min(from.y, to.y) / BUCKET); y <= Math.floor(Math.max(from.y, to.y) / BUCKET); y++) {
      for (let x = Math.floor(Math.min(from.x, to.x) / BUCKET); x <= Math.floor(Math.max(from.x, to.x) / BUCKET); x++) {
        for (const id of data.buckets.get(`${x},${y}`) || []) ids.add(id);
      }
    }
    return ids;
  }

  function projection(p, segment) {
    const t = segment.length ? clamp(((p.x - segment.a.x) * segment.dx + (p.y - segment.a.y) * segment.dy) / segment.length ** 2, 0, 1) : 0;
    return {x: segment.a.x + segment.dx * t, y: segment.a.y + segment.dy * t};
  }
  function inBounds(p, world) {return point(p) && p.x >= 0 && p.y >= 0 && p.x <= world.width && p.y <= world.height;}
  function inRect(p, r) {return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;}

  function isWalkable(p, world) {
    if (!world || !inBounds(p, world) || (world.obstacles || []).some(r => inRect(p, r))) return false;
    const data = prepare(world);
    for (const id of data.buckets.get(`${Math.floor(p.x / BUCKET)},${Math.floor(p.y / BUCKET)}`) || []) {
      const s = data.segments[id];
      if (distance(p, projection(p, s)) <= s.radius + EPS) return true;
    }
    return false;
  }

  // Clip a parametric line to scalar bounds, retaining an interval of t in [0,1].
  function clip(interval, start, delta, low, high) {
    if (Math.abs(delta) < EPS) return start >= low - EPS && start <= high + EPS;
    const a = (low - start) / delta, b = (high - start) / delta;
    interval[0] = Math.max(interval[0], Math.min(a, b));
    interval[1] = Math.min(interval[1], Math.max(a, b));
    return interval[0] <= interval[1] + EPS;
  }

  function clearSegment(from, to, world) {
    if (!isWalkable(from, world) || !isWalkable(to, world)) return false;
    const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
    if (length2 < EPS) return true;
    for (const r of world.obstacles || []) {
      const interval = [0, 1];
      if (clip(interval, from.x, dx, r.x, r.x + r.width) && clip(interval, from.y, dy, r.y, r.y + r.height)) return false;
    }
    // Exact capsule intervals avoid jumping over narrow gaps between roads.
    const data = prepare(world), intervals = [];
    function circle(c, radius) {
      const fx = from.x - c.x, fy = from.y - c.y;
      const b = 2 * (fx * dx + fy * dy), c0 = fx * fx + fy * fy - radius * radius;
      const discriminant = b * b - 4 * length2 * c0;
      if (discriminant < 0) return;
      const root = Math.sqrt(discriminant);
      const low = Math.max(0, (-b - root) / (2 * length2)), high = Math.min(1, (-b + root) / (2 * length2));
      if (low <= high + EPS) intervals.push([low, high]);
    }
    for (const id of nearby(from, to, data)) {
      const s = data.segments[id];
      circle(s.a, s.radius); circle(s.b, s.radius);
      if (!s.length) continue;
      const ux = s.dx / s.length, uy = s.dy / s.length, fx = from.x - s.a.x, fy = from.y - s.a.y;
      const interval = [0, 1];
      if (clip(interval, fx * ux + fy * uy, dx * ux + dy * uy, 0, s.length)
        && clip(interval, -fx * uy + fy * ux, -dx * uy + dy * ux, -s.radius, s.radius)) intervals.push(interval);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let covered = 0;
    for (const [low, high] of intervals) {
      if (low > covered + EPS) return false;
      covered = Math.max(covered, high);
      if (covered >= 1 - EPS) return true;
    }
    return false;
  }

  function move(position, delta, world) {
    if (!point(position)) return point(world.spawn) ? copy(world.spawn) : {x: 0, y: 0};
    if (!point(delta) || !isWalkable(position, world)) return copy(position);
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / 3));
    if (steps > 4000) return copy(position);
    const dx = delta.x / steps, dy = delta.y / steps;
    let next = copy(position);
    for (let i = 0; i < steps; i++) {
      const direct = {x: next.x + dx, y: next.y + dy};
      if (clearSegment(next, direct, world)) {next = direct; continue;}
      const across = {x: next.x + dx, y: next.y};
      if (clearSegment(next, across, world)) next = across;
      const down = {x: next.x, y: next.y + dy};
      if (clearSegment(next, down, world)) next = down;
    }
    return next;
  }

  function nearestWalkable(p, world, maxRadius = 160) {
    if (!point(p) || !Number.isFinite(maxRadius) || maxRadius < 0) return null;
    if (isWalkable(p, world)) return copy(p);
    let best = null, bestDistance = maxRadius + EPS;
    const consider = candidate => {
      const d = distance(p, candidate);
      if (d < bestDistance && isWalkable(candidate, world)) {best = candidate; bestDistance = d;}
    };
    const data = prepare(world);
    for (const id of nearby({x: p.x - maxRadius, y: p.y - maxRadius}, {x: p.x + maxRadius, y: p.y + maxRadius}, data)) {
      const s = data.segments[id], center = projection(p, s), d = distance(p, center);
      if (d > maxRadius + s.radius) continue;
      const inset = Math.max(0, s.radius - 0.1);
      if (d > EPS) consider({x: center.x + (p.x - center.x) / d * Math.min(d, inset), y: center.y + (p.y - center.y) / d * Math.min(d, inset)});
      consider(center);
      if (s.length) for (const sign of [-1, 1]) consider({x: center.x - s.dy / s.length * inset * sign, y: center.y + s.dx / s.length * inset * sign});
    }
    for (const r of world.obstacles || []) {
      const xs = [r.x - 0.1, r.x + r.width + 0.1], ys = [r.y - 0.1, r.y + r.height + 0.1];
      for (const x of xs) consider({x, y: clamp(p.y, r.y, r.y + r.height)});
      for (const y of ys) consider({x: clamp(p.x, r.x, r.x + r.width), y});
      for (const x of xs) for (const y of ys) consider({x, y});
    }
    return best;
  }

  function findPath(from, to, world) {
    if (!isWalkable(from, world) || !isWalkable(to, world) || distance(from, to) < 0.01) return [];
    if (clearSegment(from, to, world)) return [copy(to)];
    const cell = world.cellSize ?? 20;
    if (!Number.isFinite(cell) || cell < 4) return [];
    const cols = Math.ceil(world.width / cell), rows = Math.ceil(world.height / cell), count = cols * rows;
    if (!Number.isFinite(count) || count < 1 || count > 250000) return [];
    const center = id => ({x: (id % cols + 0.5) * cell, y: (Math.floor(id / cols) + 0.5) * cell});
    const mask = new Int8Array(count);
    const valid = id => {if (!mask[id]) mask[id] = isWalkable(center(id), world) ? 1 : -1; return mask[id] === 1;};
    function nearCell(p) {
      const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), options = [];
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const id = y * cols + x;
        if (valid(id) && clearSegment(p, center(id), world)) options.push({id, d: distance(p, center(id))});
      }
      options.sort((a, b) => a.d - b.d);
      return options[0]?.id ?? -1;
    }
    const start = nearCell(from), goal = nearCell(to);
    if (start < 0 || goal < 0) return [];
    const parents = new Int32Array(count).fill(-1), scores = new Float64Array(count).fill(Infinity), closed = new Uint8Array(count), heap = [];
    const target = center(goal);
    function push(item) {
      heap.push(item); let i = heap.length - 1;
      while (i > 0) {const p = (i - 1) >> 1;if (heap[p].f <= item.f) break;heap[i] = heap[p];i = p;} heap[i] = item;
    }
    function pop() {
      const top = heap[0], last = heap.pop();
      if (heap.length) {let i = 0;while (i * 2 + 1 < heap.length) {let child = i * 2 + 1;if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++;if (heap[child].f >= last.f) break;heap[i] = heap[child];i = child;}heap[i] = last;}
      return top;
    }
    scores[start] = 0; push({id: start, f: distance(center(start), target)});
    while (heap.length) {
      const {id} = pop();
      if (closed[id]) continue;
      closed[id] = 1;
      if (id === goal) break;
      const x = id % cols, y = Math.floor(id / cols), here = center(id);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const next = ny * cols + nx, score = scores[id] + Math.hypot(dx, dy) * cell;
        if (closed[next] || score >= scores[next] || !valid(next) || !clearSegment(here, center(next), world)) continue;
        parents[next] = id; scores[next] = score;
        push({id: next, f: score + distance(center(next), target)});
      }
    }
    if (!closed[goal]) return [];
    const route = [copy(to)];
    for (let id = goal; id !== -1; id = parents[id]) route.push(center(id));
    route.push(copy(from)); route.reverse();
    const result = []; let anchor = 0;
    while (anchor < route.length - 1) {
      let next = anchor + 1;
      for (let i = next + 1; i < route.length; i++) {if (!clearSegment(route[anchor], route[i], world)) break;next = i;}
      if (distance(route[anchor], route[next]) > 0.001) result.push(route[next]);
      anchor = next;
    }
    return result;
  }

  function cameraFor(position, viewport, world) {
    const width = Math.max(1, Number.isFinite(viewport.width) ? viewport.width : 1);
    const height = Math.max(1, Number.isFinite(viewport.height) ? viewport.height : 1);
    const p = point(position) ? position : world.spawn || {x: 0, y: 0};
    const axis = (v, view, size) => size <= view ? (size - view) / 2 : clamp(v - view / 2, 0, size - view);
    return {x: axis(p.x, width, world.width), y: axis(p.y, height, world.height), width, height};
  }

  return {isWalkable, move, findPath, nearestWalkable, cameraFor};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.ContinuousMotion;
