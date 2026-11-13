/** The approach on the sea floor and the central hall. */
export function buildArrival(C, stage) {
  const K = oceanParts(C);
  const {T, TH, L, V, PI} = K, group = C.group, theme = C.theme;
  const build = {coral: [coralExterior, coralHall], kelp: [kelpExterior, kelpHall], abyss: [abyssExterior, abyssHall], lagoon: [lagoonExterior, lagoonHall]}[theme];
  if (build) return stage === 'hub' ? build[1](K, C) : build[0](K, C);
  return stage === 'hub' ? hall() : exterior();

  function hall() {
    const Hs = L.hall, [W, H, D] = Hs.innerSize, t = Hs.wallThickness;
    const page = C.page || 0, wallMat = K.surface('wall'), trim = K.surface('trim');
    const walls = {
      north: {x: 0, z: -D / 2, rot: 0, len: W + 2 * t},
      south: {x: 0, z: D / 2, rot: PI, len: W + 2 * t},
      west: {x: -W / 2, z: 0, rot: PI / 2, len: D},
      east: {x: W / 2, z: 0, rot: -PI / 2, len: D},
    };
    const covers = [];
    for (const [name, w] of Object.entries(walls)) {
      const doors = [];
      Hs.pageDoors.forEach((door, slot) => {
        if (door.wall !== name) return;
        const abs = page * 5 + slot, room = BUNDLE.rooms[abs];
        if (!room) return;
        doors.push({u: door.u, kind: 'room', index: slot, view: 'galleryPlate', title: String(abs + 1).padStart(2, '0') + '  ' + room.title});
        covers.push({name, u: door.u, abs, slot});
      });
      if (Hs.returnDoor.wall === name) doors.push({u: Hs.returnDoor.u, kind: 'back', view: 'exteriorPlate', title: '바다로 나가기'});
      const tank = Hs.aquariumPanel.wall === name ? [{u: Hs.aquariumPanel.u, y: Hs.aquariumPanel.position[1], key: 'hallTank',
        maxW: Hs.aquariumPanel.maxSize[0], maxH: Hs.aquariumPanel.maxSize[1]}] : [];
      const g = K.wall({...w, height: H, thick: t, mat: wallMat, trim, doors, windows: tank});
      // A framed cover of each room beside its door; it opens the room too.
      for (const c of covers.filter(c => c.name === name)) {
        const side = c.u + 1.95 < w.len / 2 - .6 ? 1.95 : -1.95;
        const f = K.framedCover(g, c.abs, c.u + side, 1.55, .02, .78, .9);
        if (f) K.targets.push({mesh: f, kind: 'room', index: c.slot});
      }
    }
    for (const box of Hs.collisionBoxesXZ) K.solids.push({x: box.centerXZ[0], z: box.centerXZ[1], w: box.sizeXZ[0], d: box.sizeXZ[1], angle: 0});
    K.box(group, 0, -.1, 0, W + .4, .2, D + .4, K.surface('floor'), 2.2);
    // Ceiling slab with an oval skylight onto the open water.
    const rx = 4.4, rz = 2.6, cz = -.4;
    const s = new T.Shape(); s.moveTo(-W / 2 - .2, -D / 2 - .2); s.lineTo(W / 2 + .2, -D / 2 - .2); s.lineTo(W / 2 + .2, D / 2 + .2); s.lineTo(-W / 2 - .2, D / 2 + .2); s.closePath();
    const hole = new T.Path(); hole.absellipse(0, -cz, rx, rz, 0, PI * 2, false); s.holes.push(hole);
    const slab = new T.ExtrudeGeometry(s, {depth: .3, bevelEnabled: false, curveSegments: 48});
    slab.rotateX(-PI / 2);
    const p = slab.attributes.position, uv = slab.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2.6, p.getZ(i) / 2.6);
    K.mesh(group, slab, K.surface('ceiling'), 0, H, 0);
    for (const [r, y, m] of [[1, H + .02, trim], [1.04, H - .03, K.glow('#fff1d8')]]) {
      const ring = K.mesh(group, new T.TorusGeometry(1, m === trim ? .022 : .006, 8, 96), m, 0, y, cz);
      ring.rotation.x = PI / 2; ring.scale.set(rx * r, rz * r, m === trim ? 6 : 1);
    }
    // A low round planter under the skylight, planted with reef growth.
    const px = 0, pz = -.2, pr = 1.35;
    K.mesh(group, new T.CylinderGeometry(pr, pr + .06, .46, 64), K.surface('shell'), px, .23, pz);
    K.mesh(group, new T.CylinderGeometry(pr + .02, pr + .02, .05, 64), trim, px, .47, pz);
    const top = K.mesh(group, new T.CircleGeometry(pr - .04, 48), K.surface('seabed'), px, .5, pz); top.rotation.x = -PI / 2;
    for (let i = 0; i < 5; i++) {
      const item = K.pick(K.LIFE.growers, it => it.height < 2.6); if (!item) break;
      const a = i / 5 * PI * 2 + .4, r = i ? pr * .55 : 0;
      K.grower(item, px + Math.cos(a) * r, .5, pz + Math.sin(a) * r, item.height > 1.5 ? .55 : .9);
    }
    K.solids.push({x: px, z: pz, w: pr * 2, d: pr * 2, angle: 0});
    K.caustics(0, .004, cz, rx * 2.8, rz * 2.8, .55, TH.causticColor, .5);
    K.caustics(0, .003, 0, W, D, .12, TH.causticColor, .1);
    K.shafts([[-1.2, H - 1.6, cz, 2.6, 6], [1.4, H - 1.4, cz + .5, 2.2, 5.5]], .14);
    for (const x of [-6, 6]) { const l = new T.PointLight('#ffe7c8', 14, 16, 1.7); l.position.set(x, H - .7, 0); group.add(l); }
    // The water around the hall: tank on the west wall and the sky above the skylight.
    K.seabed(-.3, 140, [0, 0, W / 2 + .5, D / 2 + .5]);
    K.seaBeyondWindows(-.3, {plants: 9, schools: 4});
    for (let i = 0; i < 3; i++) {
      const item = K.pick(K.LIFE.swimmers, it => it.size < 1.2); if (!item) break;
      K.school(item, V(K.between(-2, 2), H + K.between(2, 4), cz), V(K.between(3, 5), 0, 0), V(0, 0, K.between(2, 3)));
    }
    K.bigVisitors(V(0, 0, 0), 17, H + 2, 2);
    K.drift(theme === 'abyss' ? 800 : 320, [-32, 32, -.5, 14, -28, 28], [-W / 2 - .5, W / 2 + .5, -D / 2 - .5, D / 2 + .5], TH.particle, theme === 'abyss' ? .06 : .045);
    return K.done({spawn: [Hs.spawn.position[0], Hs.spawn.position[2]], yaw: 0, bounds: [-W / 2, W / 2, -D / 2, D / 2],
      camera: {distance: 4.3, height: 1.85}, indoor: true});
  }

  function exterior() {
    // The building faces +Z. Its silhouette differs by theme; the walk approaches along the path.
    const shapes = {
      coral: {w: 15, h: 5.6, depth: 15},
      kelp: {w: 9.6, h: 5.2, depth: 22},
      abyss: {w: 9.2, h: 6.6, depth: 17},
      lagoon: {w: 17, h: 4.6, depth: 14},
    };
    const S = shapes[theme], hw = S.w / 2;
    const outline = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const a = i / N; let x, y;
      if (theme === 'coral') { const th = a * PI; x = hw * Math.cos(th); y = 1.6 + (S.h - 1.6) * Math.pow(Math.sin(th), .55); }
      else if (theme === 'kelp') { const th = a * PI; x = hw * Math.cos(th); y = .8 + (S.h - .8) * Math.sin(th); }
      else if (theme === 'abyss') { const th = a * PI; x = hw * Math.cos(th); y = 2.2 + (S.h - 2.2) * Math.pow(Math.sin(th), .8); }
      else { x = hw - a * S.w; y = S.h * (.78 + .22 * Math.sin(a * PI * 2.2 + .4)) * Math.pow(Math.sin(a * PI), .25); }
      outline.push([x, Math.max(.0, y)]);
    }
    const front = 0, wallMat = theme === 'coral' ? K.surface('wall') : K.surface(theme === 'abyss' ? 'hull' : 'shell');
    const doorScale = 1.15;
    // Facade: the door and two windows show the lit hall within.
    K.wall({x: 0, z: front, rot: 0, len: S.w, height: S.h, thick: .5, mat: wallMat, trim: K.surface('trim'), top: outline.slice(1, N),
      doorScale, doors: [{u: 0, kind: 'enter', view: 'hallPlate', depth: 2.6, title: TH.title}],
      windows: [-1, 1].map(s => ({u: s * S.w * .3, y: theme === 'lagoon' ? 2.0 : 2.5, maxW: S.w * .22, maxH: 2.3, aspect: TH.windowAspect, glowBehind: 'hallPlate', sea: false})),
      skirting: false, outerFrame: false, tile: 3});
    // The body: the same silhouette extruded back, slightly inset.
    // The front cap is left open so the door and windows look into the lit vestibule.
    const bodyPts = [[hw * .985, 0], ...outline.map(([x, y]) => [x * .985, y * .985]), [-hw * .985, 0]];
    const body = new T.Shape(); bodyPts.forEach(([x, y], i) => i ? body.lineTo(x, y) : body.moveTo(x, y)); body.closePath();
    const bodyGeo = new T.ExtrudeGeometry(body, {depth: S.depth, bevelEnabled: false, curveSegments: 8});
    bodyGeo.translate(0, 0, -S.depth - .45);
    {
      const p = bodyGeo.attributes.position, uv = bodyGeo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getZ(i) + p.getX(i) * .3) / 3, p.getY(i) / 3);
    }
    const bodySide = wallMat.clone(); bodySide.side = T.DoubleSide;
    K.mesh(group, bodyGeo, [new T.MeshBasicMaterial({visible: false}), bodySide]);
    K.mesh(group, new T.ShapeGeometry(body), bodySide, 0, 0, -S.depth - .45);
    const trim = K.surface('trim'), accent = K.surface(theme === 'coral' ? 'hull' : theme === 'kelp' ? 'trim' : theme === 'abyss' ? 'trim' : 'trim');
    if (theme === 'coral') {
      // Free-standing terracotta arches over the pavilion.
      for (const [z, r, tilt] of [[-1.6, 7.6, .12], [-7.2, 8.4, -.08], [-12.6, 7.2, .1]]) {
        const arch = K.mesh(group, new T.TorusGeometry(r, .62, 14, 64, PI), K.surface('hull'), 0, -.3, z);
        arch.rotation.z = tilt * .3; arch.rotation.y = tilt;
      }
      for (const [x, z, r] of [[-3.4, -6, 1.8], [3.8, -10.5, 1.4]]) {
        const ring = K.mesh(group, new T.TorusGeometry(r, .32, 10, 48), K.surface('hull'), x, S.h + .35, z); ring.rotation.x = PI / 2; ring.scale.set(1.4, 1, 1);
      }
    } else if (theme === 'kelp') {
      for (let z = -1.2; z > -S.depth; z -= 2.4) {
        const rib = K.mesh(group, new T.TorusGeometry(hw + .12, .12, 8, 48, PI), trim, 0, .8, z); rib.scale.set(1, (S.h - .8) / (hw + .12), 1);
      }
      const glassMat = new T.MeshStandardMaterial({color: '#ffd69a', emissive: '#ffb75e', emissiveIntensity: .45, roughness: .3});
      for (const s of [-1, 1]) for (let z = -2.4; z > -S.depth + 1; z -= 2.4) {
        const win = K.box(group, s * (hw + .2), 2.6, z, .06, 1.4, 1.7, glassMat); win.castShadow = false;
      }
    } else if (theme === 'abyss') {
      const ring = K.mesh(group, new T.TorusGeometry(1, .07, 12, 96, PI), trim, 0, 2.2, .12);
      ring.scale.set(hw * 1.01, (S.h - 2.2) * 1.01, 3);
      for (const s of [-1, 1]) K.box(group, s * hw * 1.01, 1.1, .12, .2, 2.2, .2, trim);
      for (const s of [-1, 1]) for (const z of [-3, -S.depth + 2]) {
        const leg = K.box(group, s * (hw - .6), .5, z, .4, 1.6, .5, trim); leg.rotation.z = s * .35;
      }
      const tube = K.mesh(group, new T.CylinderGeometry(.9, .9, 7, 32), K.surface('hull'), hw + 3.4, 3.1, -9); tube.rotation.z = PI / 2;
      K.mesh(group, new T.SphereGeometry(2.1, 40, 24), K.surface('hull'), hw + 7.6, 3.1, -9);
      const port = K.mesh(group, new T.TorusGeometry(.95, .14, 10, 40), trim, hw + 7.6, 3.1, -6.95);
      K.mesh(group, new T.CircleGeometry(.85, 32), new T.MeshBasicMaterial({color: '#ffcf8a', toneMapped: false}), hw + 7.6, 3.1, -6.9);
      const glassMat = new T.MeshBasicMaterial({color: '#ffcf8a', toneMapped: false});
      for (const s of [-1, 1]) for (let z = -3; z > -S.depth + 2; z -= 3.2) {
        const w = K.box(group, s * (hw + .02), S.h * .55, z, .08, .9, 1.9, glassMat); w.castShadow = false;
      }
    } else {
      for (const [x, z, sx, sy, sz] of [[-7.6, -6, 4.8, 2.4, 5.6], [7.4, -8, 5.4, 2.8, 6], [0, -11, 6.5, 3.6, 6.5]]) {
        const dome = K.mesh(group, new T.SphereGeometry(1, 48, 24, 0, PI * 2, 0, PI / 2), K.surface('shell'), x, 0, z); dome.scale.set(sx, sy, sz);
      }
      const band = new T.MeshStandardMaterial({color: '#bfeff2', emissive: '#9fe3ea', emissiveIntensity: .35, transparent: true, opacity: .55, roughness: .1});
      for (const s of [-1, 1]) K.box(group, s * (hw + .05), 1.5, -6, .06, 1.2, 9, band).castShadow = false;
    }
    K.solids.push({x: 0, z: -S.depth / 2 - .3, w: S.w + 1.2, d: S.depth + 1.4, angle: 0});
    // Sea floor, approach path and light bollards.
    K.seabed(-.06, 160, [0, 6, 3, 14]);
    const pathLen = 19, pathZ = pathLen / 2 + .2;
    K.box(group, 0, -.02, pathZ, 3.2, .14, pathLen, K.surface('tread'), 1.6);
    for (const s of [-1, 1]) K.box(group, s * 1.66, .02, pathZ, .14, .14, pathLen, trim);
    for (let z = 3.5; z < pathLen; z += 3.8) for (const s of [-1, 1]) {
      const b = new T.Sprite(new T.SpriteMaterial({map: C.tex('bollard'), alphaTest: .4, toneMapped: false, fog: true}));
      const [bw, bh] = C.size('bollard'); b.center.set(.5, 0); b.scale.set(.85 * bw / bh, .85, 1); b.position.set(s * 2.05, .02, z); b.raycast = () => {}; group.add(b);
      K.solids.push({x: s * 2.05, z, w: .3, d: .3, angle: 0});
    }
    // Reef, kelp or grass around the building.
    const tall = theme === 'kelp' ? 34 : 12, low = theme === 'lagoon' ? 70 : 46;
    for (let i = 0; i < tall + low; i++) {
      const isTall = i < tall;
      const item = K.pick(K.LIFE.growers, it => isTall ? it.height >= 1.3 : it.height < 1.3) || K.pick(K.LIFE.growers, () => true);
      if (!item) break;
      let x, z;
      do { x = K.between(-26, 26); z = K.between(-28, 22); }
      while ((Math.abs(x) < 3 && z > -1) || (Math.abs(x) < hw + 2.5 && z < 1.5 && z > -S.depth - 2) || (theme === 'abyss' && x > hw && x < hw + 10.5 && z > -12 && z < -6));
      K.grower(item, x, -.06 + .1 * Math.sin(x * .31 + z * .17), z, isTall && theme === 'kelp' ? K.between(.8, 1.15) : 1);
    }
    for (let i = 0; i < 6; i++) {
      const item = K.pick(K.LIFE.swimmers, it => it.size < 1.2); if (!item) break;
      K.school(item, V(K.between(-9, 9), K.between(1.5, 5.5), K.between(-6, 12)), V(K.between(4, 8), 0, 0), V(0, K.between(-.3, .3), K.between(2, 5)));
    }
    K.bigVisitors(V(0, 0, -4), 15, 4.5, 3);
    K.caustics(0, .08, 4, 70, 60, TH.causticsOutdoor ?? .45, TH.causticColor, .35);
    if (theme !== 'abyss') K.shafts([[-7, 9, 3, 6, 20], [6, 9, -2, 7, 20], [0, 10, 9, 5, 22], [-12, 9, -9, 7, 20]], theme === 'kelp' ? .3 : .24, theme === 'kelp' ? '#ffe6a6' : '#e6fbff');
    K.drift(theme === 'abyss' ? 1500 : 600, [-30, 30, 0, 14, -30, 26], null, TH.particle, theme === 'abyss' ? .07 : .05);
    const glowLight = new T.PointLight('#ffd49a', 30, 14, 1.5); glowLight.position.set(0, 2.4, 1.2); group.add(glowLight);
    return K.done({spawn: [0, 14.5], yaw: 0, bounds: [-11, 11, .4, 22],
      camera: {height: 2.1, distance: 4.6, pitch: -.06, fov: 54},
      establishing: {position: [-14, 7.4, 24], lookAt: [0, 2.4, -4], fov: 46}});
  }
}
