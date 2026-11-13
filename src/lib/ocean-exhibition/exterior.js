// Exterior arrival scenes for the four ocean museums (fronts face +Z).
import {oceanParts} from './parts.js';

// Coral Arch Museum, modelled on references/01-coral-*.png:
// a terracotta-tiled organic canopy pierced by oval skylights, nested entrance arches,
// curved glass walls with the lit gallery inside, and a reef-lined sand path.
function coralExterior(K, C) {
  const {T, V, PI, TAU} = K, group = C.group, TH = K.TH;
  const tile = K.surface('hull', null, {caustic: .75, normal: 1.4});
  const cream = K.surface('wall', '#fff6ea', {emissive: '#5a4630', emissiveIntensity: .55});
  const glass = new T.MeshStandardMaterial({color: '#cfeff2', transparent: true, opacity: .08, roughness: .05, metalness: .3, depthWrite: false, side: T.DoubleSide});
  const steel = new T.MeshStandardMaterial({color: '#c9c3b6', roughness: .3, metalness: .85});
  const cz = -7, rx = 10.5, rz = 8.5, ry = 7.0, baseY = 3.6;
  const rimK = Math.sqrt(1 - (baseY / ry) ** 2), Rx = rx * rimK, Rz = rz * rimK;
  // Tile UVs on a torus / tube: metres along and around.
  function tubeUV(g, along, around, scale = .8) {
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * along / scale, uv.getY(i) * around / scale); return g;
  }
  // --- canopy: the upper part of an ellipsoid, cut by oval skylights ---
  const holes = [[-5.2, -4.0, 2.5, 1.6, .3], [.3, -3.1, 2.1, 1.35, -.2], [5.4, -4.7, 2.3, 1.5, .5], [-6.3, -9.9, 2.0, 1.4, -.4],
    [-1.3, -8.4, 2.5, 1.7, .1], [4.5, -10.4, 2.6, 1.7, -.3], [-2.0, -13.1, 1.7, 1.0, .2], [7.8, -7.6, 1.2, .95, .6], [-8.6, -6.6, 1.1, .9, .2]];
  const inHole = (x, z, grow = 0) => holes.some(([hx, hz, a, b, r]) => {
    const c = Math.cos(r), s = Math.sin(r), dx = x - hx, dz = z - (hz + 0);
    const u = (c * dx + s * dz) / (a + grow), v = (-s * dx + c * dz) / (b + grow); return u * u + v * v < 1;
  });
  {
    const N = 160, M = 46, p = [], uv = [], ix = [], begin = Math.asin(rimK) ;
    for (let j = 0; j <= M; j++) {
      const th = begin * (1 - j / M);              // polar angle from the top
      for (let i = 0; i <= N; i++) {
        const a = i / N * TAU, s = Math.sin(th);
        const x = rx * s * Math.cos(a), y = ry * Math.cos(th), z = cz + rz * s * Math.sin(a);
        // A gentle organic wave in the shell.
        const wob = .25 * Math.sin(a * 3 + 1.1) * s;
        p.push(x * (1 + wob * .04), y + wob, z); uv.push(x / 1.15, (z + y * .8) / 1.15);
      }
    }
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const k = j * (N + 1) + i;
      const mx = (p[k * 3] + p[(k + N + 2) * 3]) / 2, mz = (p[k * 3 + 2] + p[(k + N + 2) * 3 + 2]) / 2;
      if (inHole(mx, mz - 0)) continue;
      ix.push(k, k + N + 1, k + 1, k + 1, k + N + 1, k + N + 2);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(ix); g.computeVertexNormals();
    const m = tile.clone(); m.side = T.DoubleSide; K.causticize(m, .75);
    K.mesh(group, g, m);
    // Thick tiled lips around every skylight and around the canopy edge.
    for (const [hx, hz, a, b, r] of holes) {
      const y = ry * Math.sqrt(Math.max(0, 1 - (hx / rx) ** 2 - ((hz - cz) / rz) ** 2));
      const ring = K.mesh(group, tubeUV(new T.TorusGeometry(1, .16, 12, 72), 2 * PI * (a + b) / 2, 1), tile, hx, y + .02, hz);
      ring.rotation.set(PI / 2, 0, r); ring.scale.set(a, b, 1.6);
    }
    const lip = K.mesh(group, tubeUV(new T.TorusGeometry(1, .34, 14, 140), PI * (Rx + Rz), 2.1), tile, 0, baseY, cz);
    lip.rotation.x = PI / 2; lip.scale.set(Rx, Rz, 1);
  }
  // --- curved glass walls with the lit gallery inside ---
  const gx = Rx - .45, gz = Rz - .45, front = cz + gz;
  const entryGap = .2;
  for (let i = 0; i < 72; i++) {
    const a0 = i / 72 * TAU, a1 = (i + 1) / 72 * TAU, am = (a0 + a1) / 2;
    if (Math.abs(am - PI / 2) < entryGap) continue;
    const x0 = gx * Math.cos(a0), z0 = cz + gz * Math.sin(a0), x1 = gx * Math.cos(a1), z1 = cz + gz * Math.sin(a1);
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
    const pane = K.plane(group, (x0 + x1) / 2, baseY / 2, (z0 + z1) / 2, len, baseY, glass); pane.rotation.y = yaw; pane.renderOrder = 3;
    if (i % 2 === 0) { K.box(group, x0, baseY / 2, z0, .05, baseY, .05, steel); K.gasketPost(group, x0, 0, z0, yaw, baseY, .12); }
  }
  const floor = K.mesh(group, new T.CircleGeometry(1, 64), K.surface('floor', '#f4ead8'), 0, .03, cz); floor.rotation.x = -PI / 2; floor.scale.set(gx, gz, 1);
  const ceiling = K.mesh(group, new T.CircleGeometry(1, 64), cream, 0, baseY - .05, cz); ceiling.rotation.x = PI / 2; ceiling.scale.set(gx, gz, 1);
  const cove = K.mesh(group, new T.TorusGeometry(1, .03, 6, 96), K.glow('#fff1d6'), 0, baseY - .12, cz); cove.rotation.x = PI / 2; cove.scale.set(gx - .3, gz - .3, 1);
  // An inner cream wall ring hung with real works, facing the glass.
  const ix = gx * .68, iz = gz * .62;
  {
    const g = new T.CylinderGeometry(1, 1, baseY - .1, 72, 1, true);
    const ring = K.mesh(group, g, cream, 0, (baseY - .1) / 2, cz); ring.scale.set(ix, 1, iz);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i + .5) / n * TAU; if (Math.abs(a - PI / 2) < .25) continue;
      const x = ix * Math.cos(a), z = cz + iz * Math.sin(a);
      const nx = Math.cos(a) / ix, nz = Math.sin(a) / iz, yaw = Math.atan2(nx, nz);
      const holder = K.grp(group, x + nx / Math.hypot(nx, nz) * .02, 0, z + nz / Math.hypot(nx, nz) * .02, yaw);
      K.framedCover(holder, i, 0, 1.55, 0, .95, 1.05);
      K.lightPool(holder, 0, 1.85, .08, 1.4, 2.0, .28);
    }
    for (const [x, z] of [[-5, cz + 3], [5, cz + 3], [-6, cz - 3], [6, cz - 3], [0, cz - 5], [0, cz + 5]]) { const l = new T.PointLight('#ffe2bd', 28, 10, 1.5); l.position.set(x, 2.8, z); group.add(l); }
  }
  // Entrance: glass doors and a short lit lobby.
  const door = K.grp(group, 0, 0, front);
  for (const s of [-1, 1]) K.box(door, s * 1.3, 1.35, 0, .08, 2.7, .08, steel);
  K.box(door, 0, 2.72, 0, 2.7, .08, .08, steel);
  const doorGlass = K.plane(door, 0, 1.35, 0, 2.52, 2.62, glass); doorGlass.renderOrder = 3;
  const revolving = K.mesh(door, new T.CylinderGeometry(1.15, 1.15, 2.6, 40, 1, true), glass, 0, 1.32, -.9); revolving.renderOrder = 3;
  for (let i = 0; i < 4; i++) { const leaf = K.box(door, 0, 1.32, -.9, 2.2, 2.5, .02, glass); leaf.rotation.y = i * PI / 4 + .3; leaf.renderOrder = 3; }
  K.mesh(door, new T.CylinderGeometry(1.2, 1.2, .12, 40), steel, 0, 2.66, -.9);
  if (C.roomTitle) K.label(door, C.roomTitle, 0, 2.95, .05, 1.6, .26, '#7a3a20');
  const pick = K.plane(door, 0, 1.35, .3, 2.6, 2.7, new T.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, colorWrite: false}));
  K.targets.push({mesh: pick, kind: 'enter', walkIn: {x: 0, z: front + .9, r: .55}});
  // Three nested arches stepping out over the path.
  for (let k = 0; k < 3; k++) {
    const r = 3.2 + k * .55, z = front + .7 + k * 2.0, band = .62 + k * .06, depth = .78;
    const sh = new T.Shape(); sh.absarc(0, 0, r + band, 0, PI, false); sh.absarc(0, 0, r, PI, 0, true); sh.closePath();
    const g = new T.ExtrudeGeometry(sh, {depth, bevelEnabled: true, bevelSize: .09, bevelThickness: .09, bevelSegments: 3, curveSegments: 48});
    g.translate(0, 0, -depth / 2);
    const pa = g.attributes.position, ua = g.attributes.uv, na = g.attributes.normal;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), ang = Math.atan2(y, x);
      if (Math.abs(na.getZ(i)) > .6) ua.setXY(i, x / .7, y / .7);
      else ua.setXY(i, ang * (r + band / 2) / .7, pa.getZ(i) / .7);
    }
    const arch = K.mesh(group, g, tile, 0, -.35, z); arch.rotation.y = (k - 1) * .05;
    for (const s of [-1, 1]) K.solids.push({x: s * (r + band / 2), z, w: band + .3, d: depth + .3, angle: 0});
  }
  // Organic legs sweeping from the canopy edge to the sea floor.
  for (const a of [.18, .95, 1.75, 2.45, 3.25, 4.1, 5.0, 5.85]) {
    if (Math.abs(a - PI / 2) < .45) continue;
    const ex = Rx * Math.cos(a), ez = cz + Rz * Math.sin(a), ox = Math.cos(a), oz = Math.sin(a);
    const path = new T.CatmullRomCurve3([V(ex * .97, baseY + .25, ez), V(ex + ox * 1.1, baseY - .7, ez + oz * 1.1), V(ex + ox * 1.9, 1.0, ez + oz * 1.9), V(ex + ox * 2.2, -.3, ez + oz * 2.2)]);
    const sec = new T.Shape(); const bw = .5, bh = .32, br = .14;
    sec.moveTo(-bw + br, -bh); sec.lineTo(bw - br, -bh); sec.quadraticCurveTo(bw, -bh, bw, -bh + br); sec.lineTo(bw, bh - br); sec.quadraticCurveTo(bw, bh, bw - br, bh);
    sec.lineTo(-bw + br, bh); sec.quadraticCurveTo(-bw, bh, -bw, bh - br); sec.lineTo(-bw, -bh + br); sec.quadraticCurveTo(-bw, -bh, -bw + br, -bh);
    const g = new T.ExtrudeGeometry(sec, {steps: 48, extrudePath: path, bevelEnabled: false});
    const pa = g.attributes.position, ua = g.attributes.uv;
    for (let i = 0; i < pa.count; i++) ua.setXY(i, (pa.getX(i) * ox + pa.getZ(i) * oz) / .8 + pa.getY(i) * .2, pa.getY(i) / .8 + (pa.getX(i) * oz - pa.getZ(i) * ox) / .8);
    K.mesh(group, g, tile);
    K.solids.push({x: ex + ox * 2.1, z: ez + oz * 2.1, w: 1.4, d: 1.4, angle: 0});
  }
  K.solids.push({x: 0, z: cz, w: Rx * 1.9, d: Rz * 1.9 - 1.2, angle: 0});
  // --- sea floor, sand path, reef borders ---
  K.seabed(-.08, 170, [0, 8, 3.2, 15]);
  const pathLen = 21, pz = front + 1.0 + pathLen / 2;
  K.pathDressing(front + 3, front + pathLen, 1.95, {rails: true, step: 4});
  const path = K.box(group, 0, -.04, pz, 3.6, .12, pathLen, K.seaSurface('tread', '#efe3cc', .9), 2.2); path.castShadow = false;
  for (let z = front + 2.2; z < front + pathLen; z += K.between(1.2, 1.8)) for (const s of [-1, 1]) {
    const x = s * K.between(2.55, 3.3), r = K.between(.7, 1.25), h = K.between(.45, .95);
    K.rock(x, -.1, z, r * 1.25, h, r);
    for (let k = 0; k < 4; k++) {
      const item = K.pick(K.LIFE.growers, it => it.height < 1.2); if (!item) break;
      K.grower(item, x + K.between(-.55, .55), -.1 + h * .75, z + K.between(-.5, .5), K.between(.8, 1.4));
    }
  }
  // Big reef masses at the sides of the building, crowned with coral.
  for (let i = 0; i < 26; i++) {
    const a = K.between(0, TAU), r = K.between(12, 24), x = Math.cos(a) * r, z = cz + Math.sin(a) * r * .9;
    if (Math.abs(x) < 6 && z > front) continue;
    const s = K.between(1.4, 3.2); K.rock(x, -.3, z, s * 1.4, s * K.between(.5, 1), s);
    for (let k = 0; k < 4; k++) { const item = K.pick(K.LIFE.growers, () => true); if (!item) break; K.grower(item, x + K.between(-1, 1) * s * .7, -.3 + s * .55, z + K.between(-1, 1) * s * .6, K.between(1.2, 2)); }
  }
  for (let i = 0; i < 18; i++) {
    const item = K.pick(K.LIFE.growers, it => it.height >= .9); if (!item) break;
    const s = K.rand() < .5 ? -1 : 1, x = s * K.between(4, 9), z = K.between(front + 3, front + 19);
    if (x < -3 && z > front + 8) continue;             // keep the establishing view clear
    K.grower(item, x * 1.15, -.08, z, K.between(1.1, 1.7));
  }
  // Life in the water.
  const anthias = K.LIFE.swimmers.find(s => s.id === 'lyretail-anthias');
  if (anthias) {
    K.school(anthias, V(-7, 6.5, front + 3), V(5, 0, 0), V(0, .5, 3), {count: 34, speed: .07});
    K.school(anthias, V(6, 5, cz - 2), V(4, 0, 0), V(0, .4, 4), {count: 22, speed: .08});
  }
  for (let i = 0; i < 6; i++) {
    const item = K.pick(K.LIFE.swimmers, it => it.size < 1.2 && it.id !== 'lyretail-anthias'); if (!item) break;
    K.school(item, V(K.between(-8, 8), K.between(1.2, 3.5), K.between(front + 2, front + 14)), V(K.between(3, 6), 0, 0), V(0, 0, K.between(1.5, 3.5)));
  }
  K.bigVisitors(V(0, 0, cz), 16, 6, 2);
  K.caustics(0, .06, front + 9, 60, 46, .35, TH.causticColor, .4);
  K.shafts([[-6, 10, front + 2, 6, 22], [5, 10, cz + 1, 7, 22], [0, 10, front + 10, 5, 22], [-11, 10, cz - 6, 7, 22], [10, 10, front + 6, 6, 20]], .26, '#e9fcff');
  K.drift(700, [-28, 28, 0, 14, -30, 26], null, TH.particle, .05);
  K.waterSurface(18, 180, .85);
  K.snowCurtains([[-6, 3.5, front + 9, 14, 7], [7, 3.5, front + 5, 14, 7], [0, 6, cz - 6, 22, 10]], .25);
  const lobbyGlow = new T.PointLight('#ffd9a8', 22, 10, 1.6); lobbyGlow.position.set(0, 2.2, front - .6); group.add(lobbyGlow);
  return K.done({spawn: [0, front + 14.5], yaw: 0, bounds: [-2.35, 2.35, front + .55, front + pathLen - .3],
    camera: {height: 2.05, distance: 4.7, pitch: -.03, fov: 56},
    establishing: {position: [-2.6, 2.4, front + 12.5], lookAt: [0, 3.4, cz + 3.5], fov: 58}});
}

// Kelp Corridor Museum, after references/02-kelp-*.png: long riveted patina tubes with
// brass ribs and lit glazed bands, a rounded patina entrance canopy, a glass bridge,
// a golden kelp forest; inside, a glass barrel-vaulted hall with a kelp aquarium.
function kelpExterior(K, C) {
  const {T, V, PI} = K, group = C.group, TH = K.TH;
  // The patina plate is dark; lift it so the riveted panels read under green water.
  const patina = K.surface('shell', '#fffffe', {caustic: .7, normal: 1.6, roughness: .45, metalness: .35}); patina.color.setRGB(1.7, 1.9, 1.7);
  const brass = K.surface('trim', '#e2b979', {metalness: .8, roughness: .32});
  const glass = new T.MeshStandardMaterial({color: '#cfe9d0', transparent: true, opacity: .14, roughness: .05, metalness: .3, depthWrite: false, side: T.DoubleSide});
  const cream = K.surface('wall', '#fff1dc', {emissive: '#4a3a24', emissiveIntensity: .5});
  // Two long gallery tubes either side of the entrance.
  K.tubeBuilding({x: 9.2, z: -6, yaw: -.12, length: 26, r: 4.3, shell: patina, ribMat: brass, glass, inner: cream, covers: 7, band: [1.4, 3.9]});
  K.tubeBuilding({x: -14.75, z: -15, yaw: .62, length: 32, r: 3.5, shell: patina, ribMat: brass, glass, inner: cream, covers: 9, coverStart: 7, band: [1.3, 3.2]});
  // Entrance canopy: a rounded patina portal with a lit lobby and glass doors.
  const ent = K.grp(group, 0, 0, 0);
  {
    const rr = (w, h, r, x = 0, y = 0, p = new T.Shape()) => { p.moveTo(x - w / 2 + r, y); p.lineTo(x + w / 2 - r, y); p.quadraticCurveTo(x + w / 2, y, x + w / 2, y + r);
      p.lineTo(x + w / 2, y + h - r); p.quadraticCurveTo(x + w / 2, y + h, x + w / 2 - r, y + h); p.lineTo(x - w / 2 + r, y + h); p.quadraticCurveTo(x - w / 2, y + h, x - w / 2, y + h - r);
      p.lineTo(x - w / 2, y + r); p.quadraticCurveTo(x - w / 2, y, x - w / 2 + r, y); return p; };
    // Outline with the doorway notched out of the bottom edge (a hole may not touch the outline).
    const outer = new T.Shape(); outer.moveTo(-3.1, 0); outer.lineTo(-2.2, 0); outer.lineTo(-2.2, 2.9); outer.quadraticCurveTo(-2.2, 3.7, -1.4, 3.7);
    outer.lineTo(1.4, 3.7); outer.quadraticCurveTo(2.2, 3.7, 2.2, 2.9); outer.lineTo(2.2, 0); outer.lineTo(3.1, 0);
    outer.lineTo(3.1, 3.3); outer.quadraticCurveTo(3.1, 4.6, 1.8, 4.6); outer.lineTo(-1.8, 4.6); outer.quadraticCurveTo(-3.1, 4.6, -3.1, 3.3); outer.closePath();
    const g = new T.ExtrudeGeometry(outer, {depth: 4, bevelEnabled: true, bevelSize: .12, bevelThickness: .12, bevelSegments: 3, curveSegments: 16});
    g.translate(0, 0, -4); K.meterUV(g, 1.6);
    K.mesh(ent, g, patina);
    // A slim brass edge around the doorway only.
    const edge = new T.CatmullRomCurve3([V(-2.25, 0, .14), V(-2.25, 2.9, .14), V(-1.95, 3.55, .14), V(-1.4, 3.75, .14), V(1.4, 3.75, .14), V(1.95, 3.55, .14), V(2.25, 2.9, .14), V(2.25, 0, .14)]);
    K.mesh(ent, new T.TubeGeometry(edge, 80, .06, 8, false), brass);
    for (let i = -1; i <= 1; i++) K.mesh(ent, new T.CircleGeometry(.07, 12), K.glow('#fff1d0'), i * 1.1, 3.68, -1.5).rotation.x = PI / 2;
    // Lobby and doors.
    K.box(ent, 0, -.03, -2, 4.4, .06, 4, K.surface('floor'));
    K.photoPlane(ent, 'hallPlate', 0, 1.6, -5.9, 4.4, 3.4, {crop: K.cover('hallPlate', 4.4 / 3.4)});
    for (const s of [-1, 1]) K.box(ent, s * 2.2, 1.7, -4, .3, 3.4, .3, brass);
    for (let i = -2; i <= 2; i++) K.gasketPost(ent, i * .88, 0, -3.9, 0, 2.95, .12);
    const dg = K.plane(ent, 0, 1.45, -3.92, 4.3, 2.9, glass); dg.renderOrder = 3;
    const pick = K.plane(ent, 0, 1.6, -.5, 4.3, 3.4, new T.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, colorWrite: false}));
    K.targets.push({mesh: pick, kind: 'enter', walkIn: {x: 0, z: -.9, r: .6}});
    if (C.roomTitle) K.label(ent, C.roomTitle, 0, 4.05, .3, 2.0, .3, '#f2dca8');
    const l = new T.PointLight('#ffd49a', 30, 9, 1.5); l.position.set(0, 3, -2); group.add(l);
    K.solids.push({x: -2.65, z: -2, w: .9, d: 4.4, angle: 0}, {x: 2.65, z: -2, w: .9, d: 4.4, angle: 0});
  }
  // Glass bridge linking the tubes above the entrance.
  {
    const br = K.grp(group, -1, 5.7, -5.5, .05);
    const tube = K.mesh(br, new T.CylinderGeometry(1.35, 1.35, 13, 32, 1, true), glass); tube.rotation.z = PI / 2; tube.renderOrder = 3;
    K.box(br, 0, -1.2, 0, 13, .18, 2.3, brass);
    for (let x = -6; x <= 6; x += 1.2) { const rib = K.mesh(br, new T.TorusGeometry(1.36, .05, 6, 32), brass, x, 0, 0); rib.rotation.y = PI / 2; }
    for (let x = -5; x <= 5; x += 2.5) K.framedCover(br, Math.abs(Math.round(x)) % 20, x, -.25, -.95, .6, .7);
    const bl = new T.PointLight('#ffd9a8', 10, 8, 1.6); bl.position.set(0, .6, 0); br.add(bl);
  }
  // Rocky floor, path, bollards, kelp forest.
  K.seabed(-.06, 170, [0, 9, 2.6, 13]);
  K.box(group, 0, -.04, 10.5, 3.4, .12, 21, K.seaSurface('tread', '#c9c2b2', .8), 2.2).castShadow = false;
  K.pathDressing(2.5, 20, 2.15, {rails: false, step: 4.2});
  for (let z = 2; z < 21; z += K.between(1.1, 1.7)) for (const s of [-1, 1]) {
    const x = s * K.between(2.7, 4.2), r = K.between(.5, 1.1); K.rock(x, -.1, z, r * 1.3, r * .7, r);
    if (K.rand() < .6) { const item = K.pick(K.LIFE.growers, it => it.height < 2.6); if (item) K.grower(item, x, -.1 + r * .5, z, K.between(.9, 1.4)); }
  }
  const tall = K.LIFE.growers.filter(g => g.height >= 3.5);
  for (let i = 0; i < 70; i++) {
    let x, z; do { x = K.between(-30, 30); z = K.between(-38, 24); } while ((Math.abs(x) < 10 && z > 3) || (Math.abs(x) < 3.6 && z > -4) || (x > 3 && x < 15 && z > -20 && z < 8) || (Math.abs((x + 14.75) * .81 - (z + 15) * .58) < 5.5 && Math.abs((x + 14.75) * .58 + (z + 15) * .81) < 17.5));
    const item = tall[Math.floor(K.rand() * tall.length)] || K.pick(K.LIFE.growers, () => true);
    K.grower(item, x, -.1, z, K.between(.9, 1.5));
  }
  // Fish and light.
  const sardine = K.LIFE.swimmers.find(s => s.id === 'pacific-sardine');
  if (sardine) K.school(sardine, V(5, 8, -2), V(5, 0, 0), V(0, .5, 4), {count: 9, speed: .06, scale: 2.2});
  for (let i = 0; i < 6; i++) { const item = K.pick(K.LIFE.swimmers, K.small); if (!item) break; K.school(item, V(K.between(-8, 8), K.between(1.5, 6), K.between(-4, 15)), V(K.between(3, 6), 0, 0), V(0, 0, K.between(2, 4))); }
  K.bigVisitors(V(0, 0, -6), 16, 7, 1);
  K.caustics(0, .06, 6, 60, 50, .4, TH.causticColor, .4);
  K.shafts([[-8, 11, 4, 8, 26], [6, 11, -2, 8, 26], [0, 12, 12, 6, 26], [-14, 11, -10, 9, 26], [14, 11, 8, 7, 24]], .32, '#ffe6a6');
  K.waterSurface(22, 180, .28);
  K.snowCurtains([[-6, 4, 8, 14, 8], [7, 4, 4, 14, 8], [0, 5, -14, 22, 10]], .35);
  K.drift(500, [-28, 28, 0, 14, -30, 26], null, TH.particle, .05);
  return K.done({spawn: [0, 16], yaw: 0, bounds: [-2.3, 2.3, -1.2, 20.5],
    camera: {height: 2.1, distance: 4.7, pitch: -.02, fov: 56},
    establishing: {position: [-2.2, 2.3, 15], lookAt: [1.2, 3.6, -5], fov: 62}});
}

// Abyss Blue-Eye Museum, after references/03-abyss-*.png: a corrugated steel capsule on a
// canyon ledge with a vast round glass end, a glass tube to a small entry pod, a whale overhead;
// inside, a concrete rotunda with a giant porthole and a glass dome.
function abyssExterior(K, C) {
  const {T, V, PI, TAU} = K, group = C.group, TH = K.TH;
  const hull = K.surface('ceiling', '#fffffe', {normal: 1.6, metalness: .45, roughness: .4}); hull.color.setRGB(2.0, 2.15, 2.4);
  const steel = K.surface('trim', '#d8dde2', {metalness: .9, roughness: .25});
  const glass = new T.MeshStandardMaterial({color: '#bcd6ea', transparent: true, opacity: .1, roughness: .03, metalness: .4, depthWrite: false, side: T.DoubleSide});
  const cream = K.surface('wall', '#f3ebe0', {emissive: '#3b3226', emissiveIntensity: .7});
  // Canyon: a deep floor, a walkable ledge, cliff masses either side.
  K.seabed(-9, 200, [0, 0, 1, 1]);
  K.rock(0, -4.2, 9, 7, 4.3, 14, '#56606c', 4);
  K.box(group, 0, -.05, 9, 3.2, .12, 24, K.seaSurface('tread', '#7f868d', .3), 2.2).castShadow = false;
  K.rock(-10, -6, -6, 9, 7, 9, '#4d5764', 4); K.rock(-16, -4, 8, 6, 9, 7, '#465060', 4); K.rock(15, -5, -8, 8, 11, 9, '#4a5462', 4);
  K.rock(13, -3, 10, 5, 7, 6, '#505a68', 4); K.rock(-20, 0, -20, 10, 16, 8, '#3f4856', 4); K.rock(18, 0, -26, 10, 18, 9, '#3f4856', 4);
  for (let i = 0; i < 26; i++) { const s = K.rand() < .5 ? -1 : 1; K.rock(s * K.between(3.2, 9), -.6, K.between(-2, 22), K.between(.6, 1.6), K.between(.5, 1.2), K.between(.6, 1.4), '#5c6673'); }
  // Capsule: three corrugated drums and a huge steel-ringed glass end, raised on struts.
  const cap = K.grp(group, -8.5, 4.6, -7, .62);
  const drum = (z, r, len) => {
    const g = new T.CylinderGeometry(r, r * .97, len, 64, 1, true); g.rotateX(PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * r / 1.4, uv.getY(i) * len / 1.4);
    const sm = hull.clone(); sm.side = T.DoubleSide; K.mesh(cap, g, sm, 0, 0, z);
    for (const s of [-1, 1]) { const ring = K.mesh(cap, new T.TorusGeometry(r + .02, .09, 8, 64), steel, 0, 0, z + s * len / 2); }
    // Glazed band on the visitor side with a lit gallery behind.
    const band = K.mesh(cap, new T.CylinderGeometry(r + .01, r + .01, len * .8, 24, 1, true, PI * .35, PI * .3), glass, 0, 0, z); band.rotation.x = PI / 2; band.renderOrder = 3;
  };
  drum(0, 4.3, 5.2); drum(-5.6, 3.9, 5.2); drum(-10.8, 3.4, 4.6);
  const front = 2.7;
  K.mesh(cap, new T.TorusGeometry(4.35, .45, 18, 96), steel, 0, 0, front);
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; K.mesh(cap, new T.SphereGeometry(.07, 8, 6), steel, Math.cos(a) * 4.35, Math.sin(a) * 4.35, front + .44); }
  const disc = K.mesh(cap, new T.CircleGeometry(3.95, 64), glass, 0, 0, front + .05); disc.renderOrder = 3;
  K.box(cap, 0, 0, front + .06, .07, 7.9, .07, steel);
  // The lit interior seen through the glass end.
  K.box(cap, 0, -2.6, -1.5, 7, .2, 8, K.surface('floor', '#bdb7ae'));
  const back = K.grp(cap, 0, 0, -4.3);
  K.box(back, 0, -.6, 0, 7.4, 4.2, .2, cream);
  [-2.3, 0, 2.3].forEach((x, i) => { K.framedCover(back, i, x, -.4, .12, 1.4, 1.2); K.lightPool(back, x, 0, .11, 2, 2.4, .32); });
  const sideL = K.grp(cap, -2.9, 0, -1.2, PI / 2); K.box(sideL, 0, -.6, 0, 6, 4.2, .2, cream); K.framedCover(sideL, 3, 0, -.4, .12, 1.2, 1.1);
  const sideR = K.grp(cap, 2.9, 0, -1.2, -PI / 2); K.box(sideR, 0, -.6, 0, 6, 4.2, .2, cream); K.framedCover(sideR, 4, 0, -.4, .12, 1.2, 1.1);
  K.mesh(cap, new T.CylinderGeometry(.9, .9, .4, 32), K.surface('shell', '#7a7c80'), 0, -2.3, 0);
  K.mesh(cap, new T.TorusGeometry(2.6, .03, 6, 64), K.glow('#ffe7c4'), 0, 2.2, -1.2).rotation.x = PI / 2;
  for (const [x, z] of [[-1.5, -1], [1.5, -1], [0, -3]]) { const l = new T.PointLight('#ffdcae', 26, 9, 1.5); l.position.set(x, 1.4, z); cap.add(l); }
  // Struts down to the cliff.
  for (const [x, z, a] of [[-2.6, 0, .45], [2.6, 0, -.45], [-2.4, -8, .4], [2.4, -8, -.4]]) {
    const st = K.box(cap, x, -5.2, z, .5, 6.5, .7, steel); st.rotation.z = a;
  }
  K.solids.push({x: -8.5, z: -9, w: 10, d: 18, angle: .62});
  // Glass tube to the entry pod at the end of the ledge.
  const tube = K.grp(group, -2.6, 2.0, -2.2, .2);
  const tg = K.mesh(tube, new T.CylinderGeometry(1.05, 1.05, 6.4, 32, 1, true), glass); tg.rotation.z = PI / 2; tg.renderOrder = 3;
  for (let x = -3; x <= 3; x += .8) { const r = K.mesh(tube, new T.TorusGeometry(1.07, .05, 6, 32), steel, x, 0, 0); r.rotation.y = PI / 2; }
  K.box(tube, 0, -.95, 0, 6.4, .12, 1.6, K.surface('floor', '#c9c2b6'));
  const tl = new T.PointLight('#ffe2b8', 8, 6, 1.6); tl.position.set(0, .4, 0); tube.add(tl);
  // Entry pod with a round hatch facing the path.
  const pod = K.grp(group, 0, 0, -1.2);
  K.mesh(pod, new T.SphereGeometry(2.3, 48, 24), hull, 0, 2.0, -.6).scale.set(1, .95, .9);
  K.mesh(pod, new T.TorusGeometry(1.25, .16, 12, 48), steel, 0, 1.45, 1.42);
  const hatch = K.mesh(pod, new T.CircleGeometry(1.15, 40), new T.MeshStandardMaterial({color: '#6d747c', metalness: .9, roughness: .3}), 0, 1.45, 1.44);
  K.mesh(pod, new T.TorusGeometry(.22, .05, 8, 24), steel, .5, 1.6, 1.47);
  K.mesh(pod, new T.CircleGeometry(.2, 20), K.glow('#ffe1b0'), .5, 1.6, 1.48);
  if (C.roomTitle) K.label(pod, C.roomTitle, 0, 3.2, 1.4, 2, .3, '#cfe0f0');
  const pick = K.plane(pod, 0, 1.45, 1.6, 2.5, 2.6, new T.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, colorWrite: false}));
  K.targets.push({mesh: pick, kind: 'enter', walkIn: {x: 0, z: 1.1, r: .6}});
  K.solids.push({x: 0, z: -1.6, w: 4.6, d: 4, angle: 0});
  K.pathDressing(3.5, 21, 1.95, {rails: true, step: 3.6});
  // White growth clinging to the cliffs; deep-sea life.
  for (let i = 0; i < 36; i++) {
    const item = K.pick(K.LIFE.growers, () => true); if (!item) break;
    const s = K.rand() < .5 ? -1 : 1;
    K.grower(item, s * K.between(2.6, 7), -.3, K.between(-1, 22), K.between(1, 1.8));
  }
  K.bigVisitors(V(-2, 0, -6), 15, 9, 2);
  const whale = K.LIFE.swimmers.find(s => s.id === 'sperm-whale');
  if (whale) K.school(whale, V(4, 12, -12), V(14, 0, 0), V(0, 1, 6), {count: 1, speed: .03});
  for (let i = 0; i < 6; i++) { const item = K.pick(K.LIFE.swimmers, K.small); if (item) K.school(item, V(K.between(-10, 8), K.between(-2, 6), K.between(-6, 14)), V(K.between(3, 6), 0, 0), V(0, 0, K.between(2, 4))); }
  K.waterSurface(26, 200, .25);
  K.snowCurtains([[-5, 3, 10, 18, 10], [6, 4, 2, 18, 10], [-10, 6, -10, 20, 14], [0, 2, 18, 16, 8]], .55);
  K.drift(1600, [-30, 30, -6, 16, -30, 26], null, TH.particle, .07);
  for (const [x, z] of [[-1.6, 6], [1.6, 14]]) { const l = new T.SpotLight('#9fc8ff', 30, 30, .5, .8, 1.2); l.position.set(x, 14, z); l.target.position.set(x, 0, z - 3); group.add(l, l.target); }
  return K.done({spawn: [0, 17], yaw: 0, bounds: [-1.9, 1.9, .6, 21.5],
    camera: {height: 2.2, distance: 4.8, pitch: -.02, fov: 56},
    establishing: {position: [5.5, 3.6, 15], lookAt: [-4.5, 4, -6], fov: 58}});
}

// White Lagoon Museum, after references/04-lagoon-*.png: pearl shell roofs floating over glass
// pavilions, an arched glass tunnel entrance with silver ribs, white sand and seagrass; inside,
// a terrazzo hall under a glass vault and a pearl wave canopy.
function lagoonExterior(K, C) {
  const {T, V, PI, TAU} = K, group = C.group, TH = K.TH;
  const pearl = K.surface('shell', null, {caustic: .8, normal: 1.1, metalness: .15, roughness: .25});
  const silver = K.surface('trim', '#eef2f4', {metalness: .9, roughness: .2});
  const glass = new T.MeshStandardMaterial({color: '#d3f4f4', transparent: true, opacity: .1, roughness: .03, metalness: .3, depthWrite: false, side: T.DoubleSide});
  const white = K.surface('wall', '#fbfaf6', {emissive: '#4a4740', emissiveIntensity: .5});
  // Pearl shell roofs: thin lens shells, the central one tilted up like a seashell.
  const shell = (x, y, z, rx, rz, th, tilt, yaw) => {
    const g = new T.SphereGeometry(1, 64, 24); const o = K.mesh(group, g, pearl, x, y, z);
    o.scale.set(rx, th, rz); o.rotation.set(tilt, yaw, 0); return o;
  };
  shell(-9.5, 3.9, -6, 7.6, 6, .55, -.04, .2); shell(9.2, 3.7, -5.5, 8.2, 6.4, .6, .03, -.15); shell(.4, 5.6, -8.5, 7.2, 6.5, .75, .2, .05);
  // Glass pavilions under the side roofs, with the gallery lit inside.
  for (const [cx, cz, rx, rz, start] of [[-9.5, -6, 6.6, 5.1, 0], [9.2, -5.5, 7.1, 5.4, 8]]) {
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2;
      const x0 = cx + rx * Math.cos(a0), z0 = cz + rz * Math.sin(a0), x1 = cx + rx * Math.cos(a1), z1 = cz + rz * Math.sin(a1);
      if (Math.abs(x0) < 2.8 && Math.abs(x1) < 2.8) continue;
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
      const pane = K.plane(group, (x0 + x1) / 2, 1.75, (z0 + z1) / 2, len, 3.5, glass); pane.rotation.y = yaw; pane.renderOrder = 3;
      if (i % 2 === 0) K.gasketPost(group, x0, 0, z0, yaw, 3.5, .12);
    }
    const floor = K.mesh(group, new T.CircleGeometry(1, 48), K.surface('floor', '#f6f2ea'), cx, .1, cz); floor.rotation.x = -PI / 2; floor.scale.set(rx, rz, 1);
    K.mesh(group, new T.CylinderGeometry(1, 1, .2, 48), K.surface('floor', '#ece6da'), cx, .0, cz).scale.set(rx + .3, 1, rz + .3);
    const ring = K.mesh(group, new T.TorusGeometry(1, .025, 6, 96), K.glow('#e9fbff'), cx, .12, cz); ring.rotation.x = PI / 2; ring.scale.set(rx + .2, rz + .2, 1);
    const ix = rx * .62, iz = rz * .55;
    K.mesh(group, new T.CylinderGeometry(1, 1, 3.3, 48, 1, true), white, cx, 1.75, cz).scale.set(ix, 1, iz);
    for (let i = 0; i < 10; i++) {
      const a = (i + .5) / 10 * TAU, x = cx + ix * Math.cos(a), z = cz + iz * Math.sin(a);
      const nx = Math.cos(a) / ix, nz = Math.sin(a) / iz, ln = Math.hypot(nx, nz);
      const h = K.grp(group, x + nx / ln * .02, 0, z + nz / ln * .02, Math.atan2(nx, nz));
      K.framedCover(h, (start + i) % 20, 0, 1.75, 0, .95, 1.0); K.lightPool(h, 0, 2.05, .07, 1.4, 2, .28);
    }
    for (const dx of [-3, 3]) { const l = new T.PointLight('#fff0dc', 22, 9, 1.5); l.position.set(cx + dx, 3, cz + 1.5); group.add(l); }
    K.solids.push({x: cx, z: cz, w: rx * 2 + .6, d: rz * 2 + .6, angle: 0});
  }
  // Glass tunnel entrance with silver ribs.
  const tun = K.grp(group, 0, 0, 0);
  const tunnelLen = 8, tr = 2.5;
  {
    const g = new T.CylinderGeometry(tr, tr, tunnelLen, 48, 1, true, PI / 2, PI); g.rotateX(PI / 2);
    const tg = K.mesh(tun, g, glass, 0, 0, -tunnelLen / 2 + 1); tg.renderOrder = 3;
    for (let z = 1; z >= -tunnelLen + 1; z -= 1.15) { const r = K.mesh(tun, new T.TorusGeometry(tr + .03, .07, 8, 48, PI), silver, 0, 0, z); }
    K.box(tun, 0, .05, -tunnelLen / 2 + 1, 4.4, .1, tunnelLen, K.surface('floor', '#f4f0e8'));
    for (const s of [-1, 1]) K.box(tun, s * 2.05, .12, -tunnelLen / 2 + 1, .05, .03, tunnelLen, K.glow('#e9fbff'));
    K.photoPlane(tun, 'hallPlate', 0, 1.9, -tunnelLen + .9, 4.8, 3.8, {crop: K.cover('hallPlate', 4.8 / 3.8)});
    for (let z = 0; z > -tunnelLen; z -= 2.6) { K.framedCover(K.grp(tun, -2.1, 0, z, PI / 2), Math.round(-z) % 20, 0, 1.5, 0, .6, .7); K.framedCover(K.grp(tun, 2.1, 0, z - 1.3, -PI / 2), (Math.round(-z) + 5) % 20, 0, 1.5, 0, .6, .7); }
    const l = new T.PointLight('#f2fbff', 18, 10, 1.5); l.position.set(0, 2.2, -3); group.add(l);
    const pick = K.plane(tun, 0, 1.4, .6, 4.4, 2.6, new T.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, colorWrite: false}));
    K.targets.push({mesh: pick, kind: 'enter', walkIn: {x: 0, z: .2, r: .7}});
    if (C.roomTitle) K.label(tun, C.roomTitle, 0, 2.95, 1.05, 2, .3, '#3e5f66');
    K.solids.push({x: -2.6, z: -3, w: .5, d: 8, angle: 0}, {x: 2.6, z: -3, w: .5, d: 8, angle: 0});
  }
  // White sand, terrazzo path with glowing edges, seagrass, coral heads.
  K.seabed(-.06, 180, [0, 9, 2.4, 13]);
  K.box(group, 0, -.02, 10.5, 3.6, .12, 20, K.seaSurface('floor', '#f3efe6', .9), 2.2).castShadow = false;
  for (const s of [-1, 1]) K.box(group, s * 1.85, .05, 10.5, .06, .04, 20, K.glow('#f0fcff'));
  K.pathDressing(3, 20, 2.25, {rails: true, step: 4.5});
  const grass = K.LIFE.growers.filter(g => /grass|eelgrass/.test(g.id));
  for (let i = 0; i < 160; i++) {
    let x, z; do { x = K.between(-26, 26); z = K.between(-24, 24); } while ((Math.abs(x) < 3 && z > -1) || (Math.abs(z + 6) < 7 && Math.abs(x) < 17));
    const item = (K.rand() < .78 && grass.length) ? grass[Math.floor(K.rand() * grass.length)] : K.pick(K.LIFE.growers, () => true);
    K.grower(item, x, -.06, z, K.between(1, 1.8));
  }
  // Turtle, rays and striped schools in bright water.
  const turtle = K.LIFE.swimmers.find(s => s.id === 'green-turtle');
  if (turtle) K.school(turtle, V(-4, 2.2, 10), V(4, 0, 0), V(0, .3, 3), {count: 1, speed: .09, scale: 1.2});
  const sergeant = K.LIFE.swimmers.find(s => s.id === 'lagoon-striped-sergeant');
  if (sergeant) K.school(sergeant, V(1, 7, 2), V(5, 0, 0), V(0, .4, 3), {count: 16, speed: .08, scale: 1.3});
  for (let i = 0; i < 5; i++) { const item = K.pick(K.LIFE.swimmers, K.small); if (item) K.school(item, V(K.between(-9, 9), K.between(1.2, 4), K.between(0, 15)), V(K.between(3, 5), 0, 0), V(0, 0, K.between(2, 3.5))); }
  K.bigVisitors(V(0, 0, -4), 14, 6, 2);
  K.caustics(0, .06, 6, 70, 60, .55, TH.causticColor, .35);
  K.shafts([[-7, 10, 4, 7, 24], [6, 10, -2, 8, 24], [0, 11, 12, 6, 24], [-13, 10, -8, 7, 22], [12, 10, 8, 6, 22]], .3);
  K.waterSurface(16, 180, .9);
  K.snowCurtains([[-6, 3, 9, 14, 7], [7, 3, 6, 14, 7]], .25);
  K.drift(400, [-28, 28, 0, 12, -28, 24], null, TH.particle, .045);
  return K.done({spawn: [0, 16], yaw: 0, bounds: [-2.2, 2.2, -.2, 20.5],
    camera: {height: 2.05, distance: 4.7, pitch: -.03, fov: 56},
    establishing: {position: [-3.2, 2.2, 15.5], lookAt: [0, 3.4, -5], fov: 60}});
}

export function buildOceanExterior(C) {
  const K = oceanParts(C);
  const build = {coral: coralExterior, kelp: kelpExterior, abyss: abyssExterior, lagoon: lagoonExterior}[C.theme] || coralExterior;
  return build(K, C);
}
