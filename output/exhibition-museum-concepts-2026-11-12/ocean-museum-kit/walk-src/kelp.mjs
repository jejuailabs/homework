// Kelp Corridor Museum, after references/02-kelp-*.png: long riveted patina tubes with
// brass ribs and lit glazed bands, a rounded patina entrance canopy, a glass bridge,
// a golden kelp forest; inside, a glass barrel-vaulted hall with a kelp aquarium.
export function kelpExterior(K, C) {
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
    K.label(ent, TH.title, 0, 4.05, .3, 2.0, .3, '#f2dca8');
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

export function kelpHall(K, C) {
  const {T, V, PI} = K, group = C.group, TH = K.TH, L = K.L;
  const Hs = L.hall, [W, H, D] = Hs.innerSize, t = Hs.wallThickness, page = C.page || 0;
  const patina = K.surface('shell', '#fffffd', {caustic: .45, normal: 1.5, roughness: .45, metalness: .3}); patina.color.setRGB(1.8, 2.0, 1.8);
  const brass = K.surface('trim', '#e2b979', {metalness: .8, roughness: .3}); brass.color.setRGB(1.5, 1.25, .85);
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
    const tank = name === 'west' ? [{u: -3.9, y: 2.15, key: 'hallTank', maxW: 6.2, maxH: 4.0}] : [];
    const g = groups[name] = K.wall({...w, height: H, thick: t, mat: patina, trim: brass, doors, windows: tank,
      sleeve: name === 'west' ? {mat: brass, depth: .5, rim: .1, front: .03} : null});
    for (const c of covers) K.doorCover(g, c.abs, c.slot, c.u + (c.u + 2 < w.len / 2 - .6 ? 2.0 : -2.0));
    // Brass pilasters with rivet strips between the panels.
    for (let u = -w.len / 2 + 1.2; u < w.len / 2; u += 2.3) {
      if ([...doors].some(d => Math.abs(d.u - u) < 1.9) || (name === 'west' && Math.abs(u + 3.9) < 3.3)) continue;
      K.box(g, u, H / 2, .05, .16, H, .1, brass);
    }
  }
  K.hallArchiveWall(groups.south, {top: [8.1, 5.6, -5.6, -8.1], low: [8.1, 5.6, -5.6, -8.1]}, '#f0d9a8');
  for (const box of Hs.collisionBoxesXZ) K.solids.push({x: box.centerXZ[0], z: box.centerXZ[1], w: box.sizeXZ[0], d: box.sizeXZ[1], angle: 0});
  const stone = K.surface('tread', '#fffffc', {normal: .6}); stone.color.setRGB(1.5, 1.45, 1.35);
  const floor = K.box(group, 0, -.1, 0, W + .4, .2, D + .4, stone, 3.0);
  K.polish(floor, .3);
  // Glass barrel vault with brass ribs and purlins.
  const glass = new T.MeshStandardMaterial({color: '#cfe9d2', transparent: true, opacity: .1, roughness: .04, metalness: .3, depthWrite: false, side: T.DoubleSide});
  K.vault({x0: -W / 2, x1: W / 2, half: D / 2 + .1, y0: H, rise: 3.2, mat: glass, ribs: {every: 2.3, mat: brass, r: .09}, purlins: {at: [-.75, -.4, 0, .4, .75], mat: brass, r: .045}, gables: {mat: patina}});
  K.box(group, 0, H + .05, -D / 2 - .05, W, .3, .4, brass); K.box(group, 0, H + .05, D / 2 + .05, W, .3, .4, brass);
  for (let x = -9; x <= 9; x += 3) K.mesh(group, new T.SphereGeometry(.08, 10, 8), K.glow('#ffefc8'), x, H + .02, -D / 2 + .5);
  // Glass bridge crossing the hall under the vault.
  {
    const br = K.grp(group, 0, 5.1, 0);
    K.box(br, 0, 0, 0, 2.4, .22, D, brass);
    for (const s of [-1, 1]) { const rail = K.plane(br, s * 1.15, .55, 0, D, .9, glass); rail.rotation.y = PI / 2; rail.renderOrder = 3; K.box(br, s * 1.15, 1.02, 0, .06, .06, D, brass); }
    [-5, -2.5, 0, 2.5, 5].forEach((z, i) => { const f = K.framedCover(br, (page * 5 + i) % 20, 1.1, .55, z, .5, .55); if (f) f.rotation.y = PI / 2; });
  }
  // Kelp aquarium beyond the west window, a long leather bench below it.
  K.wallBench(groups.west, -3.9, 4.6);
  K.plinthVase(9.8, 5.6, 0, 0); K.plinthVase(-9.8, -5.6, 0, 0);
  K.chair(10.4, 3.6, 0, 3.6); K.chair(10.4, 2.4, 0, 2.4);
  for (const x of [-7, 0, 7]) for (const z of [-3, 3]) { const l = new T.PointLight('#ffe2b2', 9, 12, 1.6); l.position.set(x, H - .8, z); group.add(l); }
  K.caustics(0, .004, 0, W, D, .5, TH.causticColor, .2);
  K.shafts([[-6, 6, -1, 3, 9], [2, 6, 1, 3, 9], [8, 6, -2, 3, 9]], .16, '#ffe6a6');
  const tall = K.LIFE.growers.filter(g => g.height >= 2);
  for (let i = 0; i < 40; i++) {
    const a = K.rand() * PI * 2, r = K.between(14, 26), x = Math.cos(a) * r, z = Math.sin(a) * r * .8;
    const item = tall[Math.floor(K.rand() * tall.length)]; if (item) K.grower(item, x, -.6, z, K.between(1, 1.4));
  }
  K.reefBank(V(-W / 2, 2.15, 3.9), V(-1, 0, 0), V(0, 0, 1), 6, -.6, {rocks: 7, tall: true});
  const sardine = K.LIFE.swimmers.find(s => s.id === 'pacific-sardine');
  if (sardine) { K.school(sardine, V(-15, 2.5, 3.9), V(0, 0, 3.5), V(1.5, 0, 0), {count: 6, speed: .12, scale: 1.6}); K.school(sardine, V(0, H + 4, 0), V(7, 0, 0), V(0, .5, 3), {count: 7, speed: .05, scale: 2}); }
  for (let i = 0; i < 3; i++) { const item = K.pick(K.LIFE.swimmers, K.small); if (item) K.school(item, V(-14.5, K.between(1.2, 3.2), 3.9), V(0, 0, 3), V(1.2, 0, 0), {scale: 1.4}); }
  K.waterSurface(H + 14, 120, .6);
  K.snowCurtains([[-16, 2.5, 3.9, 8, 5], [0, H + 4, 0, 18, 6]], .3);
  return K.done({spawn: [Hs.spawn.position[0], Hs.spawn.position[2]], yaw: 0, bounds: [-W / 2, W / 2, -D / 2, D / 2], camera: {distance: 4.3, height: 1.85}, indoor: true});
}
