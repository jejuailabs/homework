// Ocean-mode gallery: the kit's room (layouts/exhibition.json) with up to 25 of the exhibition's
// own works — the main slide (index 0) on the central north wall, the rest in layout order.
// With nothing on display the walls stay bare.
// Each museum follows its references/0n-*-gallery.png:
//   coral  – cream plaster, curved cove, deep terracotta-tiled oval windows, terrazzo seating
//   kelp   – cream walls under a patina barrel vault with brass ribs, tall brass-framed arches
//   abyss  – corrugated dark vault, LED cove, steel portholes, grey ottomans
//   lagoon – white walls under a pearl wave ceiling, wide panoramic windows, white bench
import {oceanParts} from './parts.js';

export function buildRoom(C) {
  const K = oceanParts(C);
  const {T, TH, L, V, PI} = K, group = C.group, theme = C.theme;
  const G = C.layout, [W, H, D] = G.innerSize, t = G.wallThickness;
  // One big slide screen on the north wall shows every work in turn; every other work hangs in the
  // same frame (FRAME_W × FRAME_H) with its name card below, evenly spread over the four walls.
  const FRAME_W = 1.0, FRAME_H = .78, STEP = 1.6, CORNER = .95, SCREEN_W = 3.4, SCREEN_H = 2.0, ART_Y = 1.85;
  const fitArt = work => K.fit(work?.width > 0 && work?.height > 0 ? work.width / work.height : 1.3, FRAME_W, FRAME_H);
  const brass = () => K.surface('trim', '#e2b979', {metalness: .8, roughness: .3});
  const steel = () => K.surface('trim', '#d6dbe0', {metalness: .9, roughness: .25});
  const S = {
    coral: {wall: K.surface('wall', '#fff7ec', {caustic: .08}), trim: K.surface('floor', '#e9dcc6'),
      sleeve: {mat: K.surface('hull', null, {caustic: .45, normal: 1.4}), depth: 1.0, rim: .2, front: .05}, cove: .95, win: 1.12, winH: 2.65, winY: 0,
      floor: [K.surface('tread', '#fbf3e6', {normal: .5}), 3.2], track: '#2b2a28', seat: 'stone'},
    kelp: {wall: K.surface('wall', '#fbf0de'), trim: brass(), sleeve: {mat: brass(), depth: .6, rim: .12, front: .05}, cove: 0, win: 1.4, winH: 3.4, winY: .35,
      floor: [(() => { const m = K.surface('floor', '#fffffb', {normal: .6}); m.color.setRGB(1.55, 1.5, 1.4); return m; })(), 2.4], track: '#b88f4e', seat: 'leather', vault: {mat: K.surface('shell', null, {normal: 1.4}), rise: 1.8, ribs: brass()}},
    abyss: {wall: K.surface('wall', '#f3eee6'), trim: steel(), sleeve: {mat: steel(), depth: 1.1, rim: .16, front: .06}, cove: 0, win: 1.4, winH: 3.1, winY: .25,
      floor: [K.surface('floor', '#a3a09b', {normal: .6}), 2.4], track: '#2e3034', seat: 'ottoman', vault: {mat: K.surface('ceiling', '#7f858c', {normal: 1.6, metalness: .5}), rise: 2.0}, led: '#ffdcae'},
    lagoon: {wall: K.surface('wall', '#fdfcf8', {caustic: .1}), trim: K.surface('floor', '#ece6da'), sleeve: {mat: K.surface('trim', '#eef2f4', {metalness: .9, roughness: .2}), depth: .5, rim: .1, front: .04}, cove: 0, win: 2.0, winH: 2.1, winY: .05,
      floor: [K.surface('floor', '#f7f4ee', {normal: .5}), 2.0], track: '#e8e8e4', seat: 'white', wave: true, led: '#effcff'},
  }[theme];
  const walls = {
    north: {x: 0, z: -D / 2, rot: 0, len: W + 2 * t},
    south: {x: 0, z: D / 2, rot: PI, len: W + 2 * t},
    west: {x: -W / 2, z: 0, rot: PI / 2, len: D},
    east: {x: W / 2, z: 0, rot: -PI / 2, len: D},
  };
  const wallGroups = {};
  for (const [name, w] of Object.entries(walls)) {
    const doors = G.entry.wall === name ? [{u: G.entry.u, kind: 'back', view: 'exteriorPlate', title: C.exitLabel}] : [];
    // Windows keep their designed size; the works are placed around them (see wallSlots).
    const windows = G.windows.filter(v => v.wall === name).map(v => ({u: v.u, y: v.position[1] + S.winY, maxW: Math.min(v.maxSize[0] * S.win, w.len - 2 * Math.abs(v.u) - .6), maxH: S.winH, aspect: TH.windowAspect}));
    wallGroups[name] = K.wall({...w, height: H - S.cove, thick: t, mat: S.wall, trim: S.trim, doors, windows, sleeve: S.sleeve});
    if (S.cove) K.cove(wallGroups[name], w.len, H, S.cove, S.wall, '#fff0d4');
    if (S.led) K.box(wallGroups[name], 0, H - .12, .06, w.len, .03, .05, K.glow(S.led));
  }
  // Floor with reflections; ceiling by theme.
  const floor = K.box(group, 0, -.1, 0, W + .4, .2, D + .4, S.floor[0], S.floor[1]);
  K.polish(floor, .3);
  if (S.vault) {
    K.vault({x0: -W / 2 - t, x1: W / 2 + t, half: D / 2 + t, y0: H, rise: S.vault.rise, mat: S.vault.mat, tile: 2,
      ribs: S.vault.ribs ? {every: 2.4, mat: S.vault.ribs, r: .07} : null, gables: {mat: S.vault.mat}});
  } else if (S.wave) {
    const nx = 64, nz = 48, p = [], uv = [], ix = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = -W / 2 - .3 + (W + .6) * i / nx, z = -D / 2 - .3 + (D + .6) * j / nz;
      const edge = Math.min(1, Math.min(W / 2 + .3 - Math.abs(x), D / 2 + .3 - Math.abs(z)) / 2.2);
      p.push(x, H + edge * (.9 + .35 * Math.sin(x * .42) * Math.cos(z * .35)), z); uv.push(x / 2.4, z / 2.4);
      if (i && j) { const a = (j - 1) * (nx + 1) + i - 1, b = a + nx + 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(ix); g.computeVertexNormals();
    const m = K.surface('shell', null, {normal: 1.1, metalness: .15, roughness: .25, side: T.DoubleSide});
    K.mesh(group, g, m);
  } else {
    K.box(group, 0, H + .1, 0, W + .4, .2, D + .4, S.wall, 2.6);
    for (let x = -8; x <= 8; x += 4) for (const z of [-3.2, 3.2]) K.mesh(group, new T.CircleGeometry(.07, 16), K.glow('#fff4df'), x, H - .005, z).rotation.x = PI / 2;
  }
  // Artworks: the profile gives the art and outer frame size in metres; a track spot pools light on each.
  const art = C.art, heads = {north: [], south: [], east: [], west: []};
  // Wall position u → room coordinates, facing into the room.
  const onWall = (wall, u) => wall === 'north' ? {wall, u, position: [u, ART_Y, -D / 2 + .057], rotationY: 0}
    : wall === 'east' ? {wall, u, position: [W / 2 - .057, ART_Y, u], rotationY: -PI / 2}
    : wall === 'south' ? {wall, u, position: [-u, ART_Y, D / 2 - .057], rotationY: PI}
    : {wall, u, position: [-W / 2 + .057, ART_Y, -u], rotationY: PI / 2};
  const blocked = {north: [], east: [], south: [], west: []};
  for (const v of G.windows) blocked[v.wall].push([v.u - v.maxSize[0] * S.win / 2 - .6, v.u + v.maxSize[0] * S.win / 2 + .6]);
  blocked[G.entry.wall].push([G.entry.u - 1.7, G.entry.u + 1.7]);
  const free = (wall, a, b) => blocked[wall].every(([x, y]) => b < x || a > y);
  // The slide screen: on the north wall, as near the centre as the window allows.
  const northEnd = W / 2 - CORNER - SCREEN_W / 2;
  let screenU = 0;
  for (let step = 0; step <= northEnd * 10; step++) {
    const pick = [step / 10, -step / 10].find(u => free('north', u - SCREEN_W / 2 - .45, u + SCREEN_W / 2 + .45));
    if (pick !== undefined) {screenU = pick; break;}
  }
  blocked.north.push([screenU - SCREEN_W / 2 - .45, screenU + SCREEN_W / 2 + .45]);
  const heroSlot = onWall('north', screenU);
  // Every free stretch of wall gets evenly spaced places, walking round the room: north, east, south, west.
  const places = [];
  for (const wall of ['north', 'east', 'south', 'west']) {
    const half = (wall === 'north' || wall === 'south' ? W : D) / 2 - CORNER, cuts = [...blocked[wall]].sort((a, b) => a[0] - b[0]);
    let start = -half;
    for (const [x, y] of [...cuts, [half, half]]) {
      const a = start, b = Math.min(x, half);
      if (b - a >= FRAME_W + .2) {
        const n = Math.floor((b - a - FRAME_W - .2) / STEP) + 1, offset = (b - a - (n - 1) * STEP) / 2;
        for (let k = 0; k < n; k++) places.push(onWall(wall, a + offset + k * STEP));
      }
      start = Math.max(start, y);
    }
  }
  // Fewer works than places: spread them evenly round the room instead of crowding the first walls.
  const count = Math.min(art.length - 1, places.length);
  const slots = Array.from({length: Math.max(0, count)}, (_, k) => places[count >= places.length ? k : Math.round(k * (places.length - 1) / Math.max(1, count - 1))]);
  let heroHang = null;
  const bezel = new T.MeshStandardMaterial({color: '#15161c', roughness: .45, metalness: .35});
  function nameCard(g, work, top, width, opts) {
    if (!C.caption || !work) return;
    const card = C.caption(work, opts), h = width / card.aspect;
    K.plane(g, 0, top - h / 2, -.03, width, h, card.material).renderOrder = 2;
  }
  function hang(slot, index, work, texture) {
    const g = K.grp(group, slot.position[0], 0, slot.position[2], slot.rotationY), y = slot.position[1];
    let f;
    if (index === 0) {
      const y0 = y + .2, a = work?.width > 0 && work?.height > 0 ? work.width / work.height : 1.3, [iw, ih] = K.fit(a, SCREEN_W, SCREEN_H);
      K.lightPool(g, 0, y0 + .5, -.05, SCREEN_W * 1.3, 2.6, theme === 'abyss' ? .36 : .3);
      f = K.grp(g, 0, y0, -.05);
      K.box(f, 0, 0, 0, SCREEN_W + .2, SCREEN_H + .2, .06, bezel);
      K.plane(f, 0, 0, .032, SCREEN_W + .04, SCREEN_H + .04, new T.MeshBasicMaterial({color: '#0b0c10', toneMapped: false}));
      K.plane(f, 0, 0, .036, iw, ih, new T.MeshBasicMaterial({map: texture, toneMapped: false}));
      nameCard(g, work, y0 - SCREEN_H / 2 - .16, 2.4, {screen: true, total: C.total});
    } else {
      const [aw, ah] = fitArt(work);
      K.lightPool(g, 0, y + .5, -.05, 1.6, 2.6, theme === 'abyss' ? .36 : .3);
      f = K.framedArt(g, texture, 0, y, -.057, aw, ah, FRAME_W + .22, FRAME_H + .22);
      nameCard(g, work, y - (FRAME_H + .22) / 2 - .06, 1.05, {});
    }
    return {g, target: {mesh: f, kind: 'art', index}};
  }
  [heroSlot, ...slots].forEach((slot, index) => {
    const work = art[index]; if (!work) return;
    const placed = hang(slot, index, work, C.artTex(index));
    if (index === 0) heroHang = placed;
    K.targets.push(placed.target);
    heads[slot.wall].push(slot.u);
  });
  // Replace the main slide with the next work, sized to its own ratio (called by the runtime).
  function swapHero(texture, work) {
    if (!heroHang) return null;
    heroHang.g.removeFromParent();
    for (const child of heroHang.g.children) if (child !== heroHang.target.mesh) child.material?.dispose?.();
    heroHang = hang(heroSlot, 0, work, texture);
    return heroHang.target;
  }
  const trackMetal = new T.MeshStandardMaterial({color: S.track, roughness: .35, metalness: .7});
  for (const [name, w] of Object.entries(walls)) if (heads[name].length) K.track(wallGroups[name], w.len - 2.5, S.cove ? H - .04 : H - .05, S.cove ? S.cove + .55 : .7, heads[name], trackMetal);
  // Room title beside the entrance.
  const south = K.grp(group, 0, 0, D / 2, PI);
  if (C.roomTitle) K.label(south, C.roomTitle, 4.2, 2.95, .03, Math.min(5, C.roomTitle.length * .3 + .6), .4, TH.ink);
  // Seating.
  const seatMat = {stone: K.surface('floor', '#efe6d6', {normal: 1}), white: K.surface('wall', '#fbfaf6'), leather: new T.MeshStandardMaterial({color: TH.seat, roughness: .55}),
    ottoman: new T.MeshStandardMaterial({color: '#77777a', roughness: .95})}[S.seat];
  for (const f of G.furniture) {
    const b = K.grp(group, f.center[0], 0, f.center[2], f.rotationY);
    const [w, h, d] = f.size;
    if (S.seat === 'ottoman') {
      for (const x of [-.75, .75]) K.mesh(b, new T.CylinderGeometry(.55, .55, .46, 40), seatMat, x, .23, 0);
    } else if (S.seat === 'leather') {
      K.box(b, 0, h - .12, 0, w, .18, d * .8, seatMat);
      for (const x of [-w / 2 + .15, w / 2 - .15]) for (const z of [-d * .32, d * .32]) K.box(b, x, (h - .2) / 2, z, .05, h - .2, .05, brass());
    } else {
      const s = new T.Shape(), r = d / 2 - .02, hw = w / 2 - r;
      s.absarc(hw, 0, r, -PI / 2, PI / 2, false); s.absarc(-hw, 0, r, PI / 2, PI * 1.5, false);
      const g = new T.ExtrudeGeometry(s, {depth: h - .12, bevelEnabled: true, bevelSize: .07, bevelThickness: .07, bevelSegments: 4, curveSegments: 16});
      g.rotateX(-PI / 2); K.meterUV(g, 1.4); K.mesh(b, g, seatMat, 0, .07, 0);
    }
  }
  const stools = S.seat === 'ottoman' ? [[6.4, 3.4], [-7.4, 3.6], [7, -3.4]] : S.seat === 'stone' ? [[6.4, 3.4], [7.6, 2.4], [-7.4, 3.6]] : [];
  for (const [x, z] of stools) {
    K.mesh(group, new T.CylinderGeometry(.44, .46, .44, 40), seatMat, x, .22, z);
    K.solids.push({x, z, w: .95, d: .95, angle: 0});
  }
  // Plinths with vases in the corners, chairs facing two of the windows.
  for (const [x, z] of [[11.2, 8.2], [-11.2, -8.2], [11.2, -8.2]]) K.plinthVase(x, z, 0, 0);
  for (const w of K.seaWindows.slice(1, 3)) {
    const p = w.center.clone().addScaledVector(w.out, -2.3);
    for (const s of [-.8, .8]) { const q = p.clone().addScaledVector(w.along, s); K.chair(q.x, q.z, q.x + w.out.x * 5, q.z + w.out.z * 5, .9); }
  }
  for (const box of G.collisionBoxesXZ) K.solids.push({x: box.centerXZ[0], z: box.centerXZ[1], w: box.sizeXZ[0], d: box.sizeXZ[1], angle: 0});
  // Sea light falling through each window onto the floor.
  for (const w of K.seaWindows) {
    const p = w.center.clone().addScaledVector(w.out, -2.2);
    K.caustics(p.x, .004, p.z, 5.5, 5.5, theme === 'abyss' ? .3 : .8, TH.causticColor, .9);
  }
  const room = new T.PointLight('#ffe9cf', 7, 22, 1.6); room.position.set(0, H - 1.5, 0); group.add(room);
  // The sea outside: reef banks under each window against the open-water panorama.
  for (const w of K.seaWindows) {
    K.reefBank(w.center, w.out, w.along, w.width, .05, {rocks: 5, tall: theme === 'kelp', near: true});
    K.reefBank(w.center.clone().addScaledVector(w.out, 3.5), w.out, w.along, w.width * 1.8, -.4, {rocks: 6, tall: true, height: 1.5});
    for (let i = 0; i < (theme === 'kelp' ? 6 : 3); i++) {
      const item = K.pick(K.LIFE.growers, it => it.height >= (theme === 'kelp' ? 2.4 : 1.2)); if (!item) break;
      const p = w.center.clone().addScaledVector(w.out, K.between(2.2, 5)).addScaledVector(w.along, K.between(-1, 1) * w.width);
      K.grower(item, p.x, -.2, p.z, theme === 'kelp' ? K.between(.8, 1.1) : K.between(1.4, 2.2));
    }
    for (let i = 0; i < 4; i++) {
      const item = K.pick(K.LIFE.swimmers, K.small); if (!item) break;
      const c = w.center.clone().addScaledVector(w.out, K.between(1.8, 4.2)); c.y = w.center.y + K.between(-.4, .9);
      K.school(item, c, w.along.clone().multiplyScalar(K.between(2, 3.4)), w.out.clone().multiplyScalar(K.between(.5, 1.2)), {scale: 1.5});
    }
    const big = K.pick(K.LIFE.swimmers, it => it.size >= 1 && (it.size < 3 || theme === 'abyss'));
    if (big) { const c = w.center.clone().addScaledVector(w.out, big.size > 5 ? 14 : 5.5); c.y = w.center.y + .9; K.school(big, c, w.along.clone().multiplyScalar(big.size > 5 ? 10 : 4.5), w.out.clone().multiplyScalar(1.5), {count: 1, speed: big.size > 5 ? .03 : .07, scale: big.size > 5 ? .6 : 1}); }
    const s = w.center.clone().addScaledVector(w.out, 4);
    K.snowCurtains([[s.x, w.center.y + .5, s.z, 7, 5]], theme === 'abyss' ? .55 : .25);
  }
  K.bigVisitors(V(0, 0, 0), 17, 2.6, 2);
  K.drift(theme === 'abyss' ? 900 : 380, [-34, 34, -.5, 9, -30, 30], [-W / 2 - .5, W / 2 + .5, -D / 2 - .5, D / 2 + .5], TH.particle, theme === 'abyss' ? .06 : .045);
  if (theme !== 'abyss') K.shafts(K.seaWindows.map(w => { const p = w.center.clone().addScaledVector(w.out, 5); return [p.x, 4.5, p.z, 4, 11]; }), .22, theme === 'kelp' ? '#ffe6a6' : '#e6fbff');
  return K.done({swapHero, spawn: [G.spawn.position[0], G.spawn.position[2]], yaw: G.spawn.rotationY, bounds: [-W / 2, W / 2, -D / 2, D / 2],
    camera: {distance: 4.1, height: 1.75}, indoor: true});
}
