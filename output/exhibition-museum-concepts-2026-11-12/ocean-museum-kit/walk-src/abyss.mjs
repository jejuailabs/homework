// Abyss Blue-Eye Museum, after references/03-abyss-*.png: a corrugated steel capsule on a
// canyon ledge with a vast round glass end, a glass tube to a small entry pod, a whale overhead;
// inside, a concrete rotunda with a giant porthole and a glass dome.
export function abyssExterior(K, C) {
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
  K.label(pod, TH.title, 0, 3.2, 1.4, 2, .3, '#cfe0f0');
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

export function abyssHall(K, C) {
  const {T, V, PI, TAU} = K, group = C.group, TH = K.TH, L = K.L;
  const Hs = L.hall, [W, H, D] = Hs.innerSize, t = Hs.wallThickness, page = C.page || 0;
  const concrete = K.surface('wall', '#a7aaad', {normal: 1.2});
  const steel = K.surface('trim', '#d6dbe0', {metalness: .9, roughness: .25});
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
    const tank = name === 'west' ? [{u: -3.7, y: 2.2, key: 'hallTank', maxW: 5.4, maxH: 4.2}] : [];
    const g = groups[name] = K.wall({...w, height: H, thick: t, mat: concrete, trim: steel, doors, windows: tank,
      sleeve: name === 'west' ? {mat: steel, depth: 1.1, rim: .12, front: .04} : null});
    for (const c of covers) K.doorCover(g, c.abs, c.slot, c.u + (c.u + 2 < w.len / 2 - .6 ? 2.0 : -2.0));
    K.box(g, 0, .1, .05, w.len, .03, .03, K.glow('#ffe1b4'));
  }
  K.hallArchiveWall(groups.south, {top: [8.1, 5.6, -5.6, -8.1], low: [8.1, 5.6, -5.6, -8.1]}, '#3b3a36');
  for (const box of Hs.collisionBoxesXZ) K.solids.push({x: box.centerXZ[0], z: box.centerXZ[1], w: box.sizeXZ[0], d: box.sizeXZ[1], angle: 0});
  const floor = K.box(group, 0, -.1, 0, W + .4, .2, D + .4, K.surface('floor', '#a8a6a2', {normal: .6}), 2.6);
  K.polish(floor, .34);
  for (const r of [3.4, 5.6]) K.mesh(group, new T.TorusGeometry(r, .018, 6, 128), K.glow('#ffdcae'), 0, .006, 0).rotation.x = PI / 2;
  // Dark ceiling with a central glass dome.
  const dr = 3.4;
  {
    const s = new T.Shape(); s.moveTo(-W / 2 - .3, -D / 2 - .3); s.lineTo(W / 2 + .3, -D / 2 - .3); s.lineTo(W / 2 + .3, D / 2 + .3); s.lineTo(-W / 2 - .3, D / 2 + .3); s.closePath();
    const h = new T.Path(); h.absarc(0, 0, dr, 0, TAU, false); s.holes.push(h);
    const g = new T.ExtrudeGeometry(s, {depth: .4, bevelEnabled: false, curveSegments: 64}); g.rotateX(-PI / 2); K.meterUV(g, 2.2);
    K.mesh(group, g, K.surface('ceiling', '#6f747a'), 0, H, 0);
    K.mesh(group, new T.CylinderGeometry(dr, dr, .8, 64, 1, true), K.surface('ceiling', '#6f747a', {side: T.DoubleSide}), 0, H + .4, 0);
    const glass = new T.MeshStandardMaterial({color: '#a9c8e6', transparent: true, opacity: .1, roughness: .03, metalness: .4, depthWrite: false, side: T.DoubleSide});
    const dome = K.mesh(group, new T.SphereGeometry(dr, 48, 16, 0, TAU, 0, PI / 2), glass, 0, H + .8, 0); dome.scale.y = .55; dome.renderOrder = 3;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, pts = [];
      for (let k = 0; k <= 12; k++) { const f = k / 12 * PI / 2; pts.push(V(Math.cos(a) * dr * Math.cos(f), H + .8 + dr * .55 * Math.sin(f), Math.sin(a) * dr * Math.cos(f))); }
      K.mesh(group, new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, .035, 6, false), steel);
    }
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; K.mesh(group, new T.CircleGeometry(.06, 12), K.glow('#fff1dc'), Math.cos(a) * (dr + .6), H - .01, Math.sin(a) * (dr + .6)).rotation.x = PI / 2; }
    K.mesh(group, new T.TorusGeometry(dr + .02, .06, 8, 96), steel, 0, H - .02, 0).rotation.x = PI / 2;
  }
  // Round upholstered bench under the dome.
  K.mesh(group, new T.CylinderGeometry(1.65, 1.65, .46, 64), new T.MeshStandardMaterial({color: '#6d6c6a', roughness: .95}), 0, .29, 0);
  K.mesh(group, new T.CylinderGeometry(1.6, 1.6, .06, 64), K.glow('#ffd7a0'), 0, .03, 0);
  K.solids.push({x: 0, z: 0, w: 3.4, d: 3.4, angle: 0});
  K.plinthVase(9.9, 5.7, 0, 0); K.plinthVase(9.9, -5.7, 0, 0); K.chair(-9.4, -.5 + 3.9, 0, 3.4);
  K.wallBench(groups.east, 3.5, 2.4);
  for (const x of [-6, 6]) { const l = new T.PointLight('#ffe2bf', 9, 15, 1.7); l.position.set(x, H - 1.2, 0); group.add(l); }
  const domeLight = new T.SpotLight('#9fc4ff', 20, 12, .6, .8, 1.3); domeLight.position.set(0, H + 4, 0); domeLight.target.position.set(0, 0, 0); group.add(domeLight, domeLight.target);
  K.caustics(0, .004, 0, 8, 8, .25, TH.causticColor, .8);
  // The deep outside the porthole and above the dome.
  K.reefBank(V(-W / 2, 2.2, 3.7), V(-1, 0, 0), V(0, 0, 1), 5, -1.2, {rocks: 7, height: 1.4});
  const whale = K.LIFE.swimmers.find(s => s.id === 'sperm-whale');
  if (whale) K.school(whale, V(-24, 4, 3.7), V(0, 0, 9), V(5, 0, 0), {count: 1, speed: .045, scale: .8});
  for (let i = 0; i < 4; i++) { const item = K.pick(K.LIFE.swimmers, K.small); if (item) K.school(item, V(-15, K.between(1, 3.6), 3.7), V(0, 0, 3), V(1.2, 0, 0), {scale: 1.4}); }
  K.school(K.LIFE.swimmers.find(s => s.id === 'marine-hatchetfish') || K.LIFE.swimmers[0], V(0, H + 5, 0), V(4, 0, 0), V(0, .4, 3), {count: 6, speed: .07});
  K.snowCurtains([[-17, 2.5, 3.7, 10, 6], [0, H + 5, 0, 12, 8]], .5);
  K.drift(900, [-34, 34, -2, 16, -30, 30], [-W / 2 - .5, W / 2 + .5, -D / 2 - .5, D / 2 + .5], TH.particle, .06);
  return K.done({spawn: [Hs.spawn.position[0], Hs.spawn.position[2]], yaw: 0, bounds: [-W / 2, W / 2, -D / 2, D / 2], camera: {distance: 4.3, height: 1.85}, indoor: true});
}
