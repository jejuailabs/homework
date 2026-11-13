// White Lagoon Museum, after references/04-lagoon-*.png: pearl shell roofs floating over glass
// pavilions, an arched glass tunnel entrance with silver ribs, white sand and seagrass; inside,
// a terrazzo hall under a glass vault and a pearl wave canopy.
export function lagoonExterior(K, C) {
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
    K.label(tun, TH.title, 0, 2.95, 1.05, 2, .3, '#3e5f66');
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

export function lagoonHall(K, C) {
  const {T, V, PI} = K, group = C.group, TH = K.TH, L = K.L;
  const Hs = L.hall, [W, H, D] = Hs.innerSize, t = Hs.wallThickness, page = C.page || 0;
  const white = K.surface('wall', '#fdfcf8', {caustic: .12});
  const pearl = K.surface('shell', null, {caustic: .5, normal: 1.1, metalness: .15, roughness: .25});
  const silver = K.surface('trim', '#eef2f4', {metalness: .9, roughness: .2});
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
    const tank = name === 'west' ? [{u: -3.7, y: 2.0, key: 'hallTank', maxW: 6.0, maxH: 3.8}] : [];
    const g = groups[name] = K.wall({...w, height: H, thick: t, mat: white, trim: K.surface('floor', '#ece6da'), doors, windows: tank,
      sleeve: name === 'west' ? {mat: silver, depth: .5, rim: .08, front: .03} : null});
    for (const c of covers) K.doorCover(g, c.abs, c.slot, c.u + (c.u + 2 < w.len / 2 - .6 ? 2.0 : -2.0));
    K.box(g, 0, .08, .06, w.len, .025, .03, K.glow('#effcff'));
  }
  K.hallArchiveWall(groups.south, {top: [8.1, 5.6, -5.6, -8.1], low: [8.1, 5.6, -5.6, -8.1]}, '#3e5f66');
  for (const box of Hs.collisionBoxesXZ) K.solids.push({x: box.centerXZ[0], z: box.centerXZ[1], w: box.sizeXZ[0], d: box.sizeXZ[1], angle: 0});
  const floor = K.box(group, 0, -.1, 0, W + .4, .2, D + .4, K.surface('floor', '#f7f4ee', {normal: .5}), 2.0);
  K.polish(floor, .3);
  // Glass vault with silver ribs over the whole hall …
  const glass = new T.MeshStandardMaterial({color: '#d6f6f6', transparent: true, opacity: .1, roughness: .03, metalness: .3, depthWrite: false, side: T.DoubleSide});
  K.vault({x0: -W / 2, x1: W / 2, half: D / 2 + .1, y0: H, rise: 3, mat: glass, ribs: {every: 2.1, mat: silver, r: .1}, gables: {mat: white}});
  // … and a pearl wave canopy over the doorways on the north side.
  {
    const nx = 60, nz = 16, p = [], uv = [], ix = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = -W / 2 + W * i / nx, z = -D / 2 + 7.4 * j / nz;
      const y = H + .2 + .55 * Math.sin(x * .55) * Math.sin(Math.PI * j / nz) + .35 * j / nz;
      p.push(x, y, z); uv.push(x / 2.4, z / 2.4);
      if (i && j) { const a = (j - 1) * (nx + 1) + i - 1, b = a + nx + 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(ix); g.computeVertexNormals();
    const m = pearl.clone(); m.side = T.DoubleSide; if (pearl.onBeforeCompile) { m.onBeforeCompile = pearl.onBeforeCompile; m.customProgramCacheKey = pearl.customProgramCacheKey; }
    K.mesh(group, g, m);
    const edge = []; for (let i = 0; i <= nx; i++) { const x = -W / 2 + W * i / nx; edge.push(V(x, H + .55 + .0, -D / 2 + 7.4)); }
    K.mesh(group, new T.TubeGeometry(new T.CatmullRomCurve3(edge), 120, .03, 6, false), K.glow('#f4fdff'));
    for (let x = -9; x <= 9; x += 3) K.mesh(group, new T.CircleGeometry(.06, 12), K.glow('#fff8ec'), x, H + .25, -3.2).rotation.x = PI / 2;
  }
  K.wallBench(groups.east, 3.6, 2.2); K.plinthVase(9.8, 5.6, 0, 0); K.plinthVase(-9.8, -5.6, 0, 0); K.chair(-9.6, 1.6, -11.5, 1.6);
  for (const x of [-6, 6]) { const l = new T.PointLight('#fff3e2', 7, 15, 1.7); l.position.set(x, H - 1, -2); group.add(l); }
  K.caustics(0, .004, 0, W, D, .32, TH.causticColor, .3);
  K.shafts([[-6, 6, 3, 3, 9], [2, 6, 4, 3, 9], [8, 6, 2.5, 3, 9]], .2);
  // Sea floor and life outside the tank and above the glass.
  K.reefBank(V(-W / 2, 2, 3.7), V(-1, 0, 0), V(0, 0, 1), 6, -.6, {rocks: 5});
  const grass = K.LIFE.growers.filter(g => /grass/.test(g.id));
  for (let i = 0; i < 40; i++) { const item = grass[Math.floor(K.rand() * grass.length)]; if (item) K.grower(item, -W / 2 - K.between(1, 7), -.5, K.between(-2, 8), K.between(1.4, 2.2)); }
  const turtle = K.LIFE.swimmers.find(s => s.id === 'green-turtle');
  if (turtle) K.school(turtle, V(-3, H + 3.5, 1), V(6, 0, 0), V(0, .4, 3), {count: 1, speed: .06, scale: 1.3});
  const ray = K.LIFE.swimmers.find(s => s.id === 'spotted-eagle-ray');
  if (ray) K.school(ray, V(4, H + 5, -1), V(7, 0, 0), V(0, .5, 4), {count: 1, speed: .05});
  const sergeant = K.LIFE.swimmers.find(s => s.id === 'lagoon-striped-sergeant');
  if (sergeant) K.school(sergeant, V(0, H + 3, 2), V(5, 0, 0), V(0, .3, 2.5), {count: 12, speed: .09, scale: 1.2});
  for (let i = 0; i < 4; i++) { const item = K.pick(K.LIFE.swimmers, K.small); if (item) K.school(item, V(-15, K.between(1, 3.2), 3.7), V(0, 0, 3), V(1.2, 0, 0), {scale: 1.4}); }
  K.waterSurface(H + 9, 120, 1.0);
  K.drift(300, [-30, 30, -.5, 14, -26, 26], [-W / 2 - .5, W / 2 + .5, -D / 2 - .5, D / 2 + .5], TH.particle, .045);
  return K.done({spawn: [Hs.spawn.position[0], Hs.spawn.position[2]], yaw: 0, bounds: [-W / 2, W / 2, -D / 2, D / 2], camera: {distance: 4.3, height: 1.85}, indoor: true});
}
