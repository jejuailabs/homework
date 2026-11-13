// Coral Arch Museum, modelled on references/01-coral-*.png:
// a terracotta-tiled organic canopy pierced by oval skylights, nested entrance arches,
// curved glass walls with the lit gallery inside, and a reef-lined sand path.
export function coralExterior(K, C) {
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
      K.framedCover(holder, i % BUNDLE.rooms.length, 0, 1.55, 0, .95, 1.05);
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
  K.label(door, TH.title, 0, 2.95, .05, 1.6, .26, '#7a3a20');
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

export function coralHall(K, C) {
  const {T, V, PI, TAU} = K, group = C.group, TH = K.TH, L = K.L;
  const Hs = L.hall, [W, H, D] = Hs.innerSize, t = Hs.wallThickness, page = C.page || 0;
  const tile = K.surface('hull', null, {caustic: .55, normal: 1.4});
  const wallMat = K.surface('wall', '#fff8ee', {caustic: .1});
  const walls = {
    north: {x: 0, z: -D / 2, rot: 0, len: W + 2 * t},
    south: {x: 0, z: D / 2, rot: PI, len: W + 2 * t},
    west: {x: -W / 2, z: 0, rot: PI / 2, len: D},
    east: {x: W / 2, z: 0, rot: -PI / 2, len: D},
  };
  const groups = {};
  for (const [name, w] of Object.entries(walls)) {
    const doors = [], covers = [];
    Hs.pageDoors.forEach((door, slot) => {
      if (door.wall !== name) return;
      const abs = page * 5 + slot, room = BUNDLE.rooms[abs]; if (!room) return;
      doors.push({u: door.u, kind: 'room', index: slot, view: 'galleryPlate', title: String(abs + 1).padStart(2, '0') + '  ' + room.title});
      covers.push({u: door.u, abs, slot});
    });
    if (Hs.returnDoor.wall === name) doors.push({u: Hs.returnDoor.u, kind: 'back', view: 'exteriorPlate', title: '바다로 나가기'});
    // The kit's coral hall-tank facade becomes a second reef window on the east wall.
    const tank = name === 'east' ? [{u: 3.5, y: 2.0, key: 'hallTank', maxW: 3.8, maxH: 3.2}] : [];
    const g = groups[name] = K.wall({...w, height: H, thick: t, mat: wallMat, trim: K.surface('floor'), doors, windows: tank,
      sleeve: name === 'east' ? {mat: tile, depth: .7, rim: .1, front: .03} : null});
    for (const c of covers) K.doorCover(g, c.abs, c.slot, c.u + (c.u + 1.95 < w.len / 2 - .6 ? 1.95 : -1.95));
  }
  K.hallArchiveWall(groups.south, {top: [8.1, 5.6, -5.6, -8.1], low: [8.1, 5.6, -5.6, -8.1]}, '#7a3a20');
  K.plinthVase(9.9, 6.0, 0, 0); K.plinthVase(9.9, -6.0, 0, 0); K.plinthVase(-9.9, -6.0, 0, 0);
  K.chair(-8.0, 2.4, -11, 2.4); K.chair(-8.0, 4.8, -11, 4.8);
  K.wallBench(groups.north, 9.6, 2.0);
  K.reefBank(V(W / 2, 2, 3.5), V(1, 0, 0), V(0, 0, 1), 3.8, -.6, {rocks: 6});
  for (let i = 0; i < 3; i++) { const item = K.pick(K.LIFE.swimmers, K.small); if (item) K.school(item, V(W / 2 + 3.5, K.between(1.2, 3), 3.5), V(0, 0, 2.6), V(1.1, 0, 0), {scale: 1.4}); }
  K.waterSurface(H + 10, 120, .8);
  K.snowCurtains([[0, H + 4, -.6, 18, 7], [W / 2 + 4, 2.5, 3.5, 8, 5]], .3);
  for (const box of Hs.collisionBoxesXZ) K.solids.push({x: box.centerXZ[0], z: box.centerXZ[1], w: box.sizeXZ[0], d: box.sizeXZ[1], angle: 0});
  // Terrazzo floor with reflections.
  const floor = K.box(group, 0, -.1, 0, W + .4, .2, D + .4, K.surface('floor', null, {normal: .6}), 2.0);
  K.polish(floor, .32);
  // Tiled ceiling with three oval skylights onto the open sea.
  const sky = [[-6.6, -.6], [0, -.6], [6.6, -.6]], srx = 2.35, srz = 3.7;
  {
    const s = new T.Shape(); s.moveTo(-W / 2 - .3, -D / 2 - .3); s.lineTo(W / 2 + .3, -D / 2 - .3); s.lineTo(W / 2 + .3, D / 2 + .3); s.lineTo(-W / 2 - .3, D / 2 + .3); s.closePath();
    for (const [x, z] of sky) { const h = new T.Path(); h.absellipse(x, -z, srx, srz, 0, TAU, false); s.holes.push(h); }
    const g = new T.ExtrudeGeometry(s, {depth: .5, bevelEnabled: false, curveSegments: 48}); g.rotateX(-PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.15, (p.getZ(i) + p.getY(i)) / 1.15);
    K.mesh(group, g, tile, 0, H, 0);
    for (const [x, z] of sky) {
      const lip = K.mesh(group, new T.TorusGeometry(1, .22, 12, 96), tile, x, H + .05, z); lip.rotation.x = PI / 2; lip.scale.set(srx, srz, 1.5);
      K.caustics(x, .004, z + .6, srx * 3.4, srz * 2.8, .7, TH.causticColor, 1);
    }
  }
  // Vaulted terracotta ribs springing from the walls between the doors.
  for (const x of [-9.95, -3.3, 3.3, 9.95]) {
    const pts = []; const half = D / 2 - .32;
    for (let i = 0; i <= 32; i++) { const a = i / 32 * PI; pts.push(V(x, (H + .05) * Math.pow(Math.sin(a), .62), half * Math.cos(a))); }
    const curve = new T.CatmullRomCurve3(pts);
    const g = new T.TubeGeometry(curve, 96, .36, 16, false);
    const uv = g.attributes.uv; const L2 = curve.getLength();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L2 / 1.1, uv.getY(i) * TAU * .36 / 1.1);
    const rib = K.mesh(group, g, tile); rib.scale.x = 1;
    for (const s of [-1, 1]) K.solids.push({x, z: s * (half - .1), w: .9, d: .7, angle: 0});
  }
  // A curved reef aquarium bulging from the west wall.
  {
    const cx = -12.45, cz = 3.6, R = 3.15, y0 = .62, y1 = 3.8;
    const a0 = .3064, a1 = PI - .3064;               // three.js: x = R sin θ, z = R cos θ
    const sector = (r1, r2, ya, yb, m) => {
      const s = new T.Shape(), n = 48;
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; const x = cx + r2 * Math.sin(a), z = cz + r2 * Math.cos(a); i ? s.lineTo(x, -z) : s.moveTo(x, -z); }
      for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; const x = cx + r1 * Math.sin(a), z = cz + r1 * Math.cos(a); s.lineTo(Math.max(x, -W / 2 - .05), -z); }
      s.closePath();
      const g = new T.ExtrudeGeometry(s, {depth: yb - ya, bevelEnabled: true, bevelSize: .03, bevelThickness: .03, bevelSegments: 2, curveSegments: 8}); g.rotateX(-PI / 2);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.atan2(p.getX(i) - cx, p.getZ(i) - cz) * R) / 1.4, p.getY(i) / 1.4);
      return K.mesh(group, g, m, 0, ya, 0);
    };
    sector(0, R + .32, 0, y0, K.surface('floor', '#efe2cc', {caustic: .6}));
    sector(R - .05, R + .4, y1, H, tile);
    const glassM = new T.MeshPhysicalMaterial({color: '#d8f7fa', transparent: true, opacity: .14, roughness: .03, metalness: .1, depthWrite: false, side: T.DoubleSide, clearcoat: 1});
    const gl = K.mesh(group, new T.CylinderGeometry(R, R, y1 - y0, 64, 1, true, a0, a1 - a0), glassM, cx, (y0 + y1) / 2, cz); gl.renderOrder = 3;
    // Inside: open water behind, a reef on the tank floor, fish.
    const back = K.photoPlane(group, 'panorama', -W / 2 + .03, (y0 + y1) / 2 + .2, cz, 6.4, 3.6, {crop: [.36, .14, .66, .58]});
    back.rotation.y = PI / 2;
    const inner = K.grp(group, 0, 0, 0);
    for (let i = 0; i < 9; i++) {
      const a = K.between(a0 + .15, a1 - .15), r = K.between(.4, R - .6);
      const x = cx + r * Math.sin(a), z = cz + r * Math.cos(a);
      if (x < -W / 2 + .2) continue;
      K.rock(x, y0 - .05, z, K.between(.4, .8), K.between(.25, .55), K.between(.4, .7));
    }
    for (let i = 0; i < 14; i++) {
      const a = K.between(a0 + .1, a1 - .1), r = K.between(.2, R - .35);
      const x = cx + r * Math.sin(a), z = cz + r * Math.cos(a); if (x < -W / 2 + .15) continue;
      const item = K.pick(K.LIFE.growers, it => it.height < 1.8); if (!item) break;
      K.grower(item, x, y0, z, K.between(1.1, 1.9));
    }
    const anthias = K.LIFE.swimmers.find(s => s.id === 'lyretail-anthias');
    if (anthias) K.school(anthias, V(-10.6, 2.5, cz), V(.5, 0, 0), V(0, .25, 2.1), {count: 26, speed: .22, scale: 1.25});
    for (let i = 0; i < 4; i++) {
      const item = K.pick(K.LIFE.swimmers, it => it.size < .6 && it.id !== 'lyretail-anthias'); if (!item) break;
      K.school(item, V(-10.8, K.between(1.4, 3.1), cz + K.between(-.6, .6)), V(.45, 0, 0), V(0, 0, K.between(1.2, 2)), {count: Math.min(item.school, 4), speed: K.between(.18, .3), scale: 1.2});
    }
    K.shafts([[-10.8, 2.6, cz - .8, 1.6, 3.2], [-10.6, 2.6, cz + 1, 1.4, 3.2]], .22);
    const tankLight = new T.PointLight('#bff3ff', 8, 6, 1.5); tankLight.position.set(-10.5, 3.4, cz); group.add(tankLight);
    K.solids.push({x: -10.4, z: cz, w: 2.3, d: 6.4, angle: 0});
    void inner;
  }
  for (const x of [-6, 6]) { const l = new T.PointLight('#ffe7c8', 10, 16, 1.7); l.position.set(x, H - 1.4, 1.5); group.add(l); }
  K.shafts([[-6.6, H - 1.8, -.6, 2.6, 6], [0, H - 1.6, -.4, 2.4, 6], [6.6, H - 1.8, -.8, 2.6, 6]], .12);
  // The open sea above the skylights.
  const anthias = K.LIFE.swimmers.find(s => s.id === 'lyretail-anthias');
  if (anthias) K.school(anthias, V(0, H + 3.5, -.6), V(8, 0, 0), V(0, .5, 2.5), {count: 30, speed: .05, scale: 1.4});
  K.bigVisitors(V(0, 0, 0), 12, H + 3, 2);
  K.drift(320, [-30, 30, H, H + 14, -24, 24], null, TH.particle, .05);
  return K.done({spawn: [Hs.spawn.position[0], Hs.spawn.position[2]], yaw: 0, bounds: [-W / 2, W / 2, -D / 2, D / 2],
    camera: {distance: 4.3, height: 1.85}, indoor: true});
}
