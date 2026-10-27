'use strict';

// East/right and south/down world coordinates. Roads are immutable after world
// creation; replace their arrays when editing geometry. Obstacles may change.
globalThis.ContinuousMotion = (() => {
  const EPS = 1e-7, BUCKET = 160;
  const cache = new WeakMap(), terrainCache = new WeakMap(), roadWorldCache=new WeakMap();
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
  const actorRadius = world => Number.isFinite(world.actorRadius) ? Math.max(0, world.actorRadius) : 0;
  function inBounds(p, world) {const r=actorRadius(world);return point(p) && p.x >= r && p.y >= r && p.x <= world.width-r && p.y <= world.height-r;}
  function inRect(p, r, padding=0) {return p.x >= r.x-padding && p.x <= r.x+r.width+padding && p.y >= r.y-padding && p.y <= r.y+r.height+padding;}
  function segmentDistance(p, a, b) {
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const t=length?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/length,0,1):0;
    return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
  }
  function inPolygon(p, vertices) {
    let inside=false;
    for(let i=0,j=vertices.length-1;i<vertices.length;j=i++) {
      const a=vertices[i],b=vertices[j];
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  }
  function crossing(a,b,c,d) {
    const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
    return ((abC>EPS&&abD<-EPS)||(abC<-EPS&&abD>EPS))&&((cdA>EPS&&cdB<-EPS)||(cdA<-EPS&&cdB>EPS));
  }
  function edgeDistance(a,b,c,d) {
    return crossing(a,b,c,d)?0:Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b));
  }
  function terrain(world) {
    const old=terrainCache.get(world);
    if(old&&old.water===world.water&&old.solids===world.solids)return old;
    const shapes=[];
    for(const vertices of [...world.water||[],...world.solids||[]]) {
      if(!Array.isArray(vertices)||vertices.length<3||!vertices.every(point))continue;
      const xs=vertices.map(p=>p.x),ys=vertices.map(p=>p.y);
      const edges=vertices.map((a,i)=>{const b=vertices[(i+1)%vertices.length];return {a,b,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)};});
      shapes.push({vertices,edges,minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)});
    }
    const data={water:world.water,solids:world.solids,shapes};terrainCache.set(world,data);return data;
  }
  function nearShape(a,b,shape,r) {return Math.max(a.x,b.x)>=shape.minX-r&&Math.min(a.x,b.x)<=shape.maxX+r&&Math.max(a.y,b.y)>=shape.minY-r&&Math.min(a.y,b.y)<=shape.maxY+r;}
  function blocked(p,world) {
    const radius=actorRadius(world);
    for(const o of world.obstacles||[]) {
      if(Number.isFinite(o.radius)){const r=Math.max(0,o.radius)+radius+EPS,dx=p.x-o.x,dy=p.y-o.y;if(Math.abs(dx)<=r&&Math.abs(dy)<=r&&dx*dx+dy*dy<=r*r)return true;}
      else if(inRect(p,o,radius))return true;
    }
    for(const shape of terrain(world).shapes) {
      if(!nearShape(p,p,shape,radius))continue;
      if(inPolygon(p,shape.vertices))return true;
      for(const edge of shape.edges)if(nearShape(p,p,edge,radius)&&segmentDistance(p,edge.a,edge.b)<=radius+EPS)return true;
    }
    return false;
  }

  function isWalkable(p, world) {
    if (!world || !inBounds(p, world)) return false;
    if(world.freeRoam)return !blocked(p,world);
    const data = prepare(world);
    for (const id of data.buckets.get(`${Math.floor(p.x / BUCKET)},${Math.floor(p.y / BUCKET)}`) || []) {
      const s = data.segments[id];
      if (distance(p, projection(p, s)) <= s.radius + EPS) return !blocked(p,world);
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

  function clearSegment(from, to, world, endpointsKnown=false) {
    if (!endpointsKnown&&(!isWalkable(from, world) || !isWalkable(to, world))) return false;
    const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
    if (length2 < EPS) return true;
    const padding=actorRadius(world);
    for (const r of world.obstacles || []) {
      if(Number.isFinite(r.radius)) {const radius=Math.max(0,r.radius)+padding+EPS;if(Math.max(from.x,to.x)<r.x-radius||Math.min(from.x,to.x)>r.x+radius||Math.max(from.y,to.y)<r.y-radius||Math.min(from.y,to.y)>r.y+radius)continue;if(segmentDistance(r,from,to)<=radius)return false;continue;}
      if(Math.max(from.x,to.x)<r.x-padding||Math.min(from.x,to.x)>r.x+r.width+padding||Math.max(from.y,to.y)<r.y-padding||Math.min(from.y,to.y)>r.y+r.height+padding)continue;
      const interval = [0, 1];
      if (clip(interval, from.x, dx, r.x-padding, r.x+r.width+padding) && clip(interval, from.y, dy, r.y-padding, r.y+r.height+padding)) return false;
    }
    for(const shape of terrain(world).shapes) {
      if(!nearShape(from,to,shape,padding))continue;
      for(const edge of shape.edges)if(nearShape(from,to,edge,padding)&&edgeDistance(from,to,edge.a,edge.b)<=padding+EPS)return false;
    }
    if(world.freeRoam)return true;
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
    const padding=actorRadius(world)+.15;
    consider({x:clamp(p.x,padding,world.width-padding),y:clamp(p.y,padding,world.height-padding)});
    for (const r of world.obstacles || []) {
      if(Number.isFinite(r.radius)) {
        for(let i=0;i<32;i++){const angle=i*Math.PI/16;consider({x:r.x+Math.cos(angle)*(r.radius+padding),y:r.y+Math.sin(angle)*(r.radius+padding)});}continue;
      }
      const xs = [r.x-padding, r.x+r.width+padding], ys = [r.y-padding, r.y+r.height+padding];
      for (const x of xs) consider({x, y: clamp(p.y, r.y, r.y + r.height)});
      for (const y of ys) consider({x: clamp(p.x, r.x, r.x + r.width), y});
      for (const x of xs) for (const y of ys) consider({x, y});
    }
    for(const shape of terrain(world).shapes) {
      if(!nearShape(p,p,shape,maxRadius+padding))continue;
      const pts=shape.vertices;
      for(let i=0;i<pts.length;i++) {
        const a=pts[i],b=pts[(i+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
        if(!len)continue;
        const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(len*len),0,1),q={x:a.x+dx*t,y:a.y+dy*t};
        for(const sign of [-1,1])consider({x:q.x-dy/len*padding*sign,y:q.y+dx/len*padding*sign});
        for(let n=0;n<8;n++){const angle=n*Math.PI/4;consider({x:a.x+Math.cos(angle)*padding,y:a.y+Math.sin(angle)*padding});}
      }
    }
    return best;
  }

  // The guide deliberately retains the geographic road route. A player who
  // wandered onto a lawn first walks back to a reachable road, then follows it.
  function findRoadPath(from,to,world) {
    if(!world.freeRoam)return findPath(from,to,world);
    if(!isWalkable(from,world)||!isWalkable(to,world))return [];
    let roadWorld=roadWorldCache.get(world);
    if(!roadWorld){roadWorld={};roadWorldCache.set(world,roadWorld);}Object.assign(roadWorld,world,{freeRoam:false});
    const roadGoal=nearestWalkable(to,roadWorld,160);
    if(!roadGoal)return [];
    const leave=distance(roadGoal,to)<.01?[]:findPath(roadGoal,to,world);
    if(distance(roadGoal,to)>=.01&&!leave.length)return [];
    const nearest=nearestWalkable(from,roadWorld,Math.hypot(world.width,world.height));
    const via=roadStart=>{
      const along=distance(roadStart,roadGoal)<.01?[]:findPath(roadStart,roadGoal,roadWorld);
      if(distance(roadStart,roadGoal)>=.01&&!along.length)return null;
      const join=distance(from,roadStart)<.01?[]:findPath(from,roadStart,world);
      if(distance(from,roadStart)>=.01&&!join.length)return null;
      return [...join,...along,...leave];
    };
    if(nearest){const result=via(nearest);if(result)return result;}
    const candidates=[];
    // A nearby road can be disconnected by the clipped map boundary or water.
    // Try other geographic roads rather than refusing an otherwise valid trip.
    for(const segment of prepare(roadWorld).segments) {
      const candidate=nearestWalkable(projection(from,segment),roadWorld,40);
      if(candidate&&(!nearest||distance(nearest,candidate)>=20)&&!candidates.some(p=>distance(p,candidate)<20))candidates.push(candidate);
    }
    candidates.sort((a,b)=>distance(a,from)-distance(b,from));
    for(const roadStart of candidates) {
      const result=via(roadStart);if(result)return result;
    }
    return [];
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
        if (closed[next] || score >= scores[next] || !valid(next) || !clearSegment(here, center(next), world,true)) continue;
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

  return {isWalkable, move, findPath, findRoadPath, nearestWalkable, cameraFor};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.ContinuousMotion;
