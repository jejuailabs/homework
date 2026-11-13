// Ocean-mode gallery: the kit's room (layouts/exhibition.json) with up to 25 of the exhibition's
// own works — the main slide (index 0) on the central north wall, the rest in layout order.
// With nothing on display the walls stay bare.
// Each museum follows its references/0n-*-gallery.png:
//   coral  – cream plaster, curved cove, deep terracotta-tiled oval windows, terrazzo seating
//   kelp   – cream walls under a patina barrel vault with brass ribs, tall brass-framed arches
//   abyss  – corrugated dark vault, LED cove, steel portholes, grey ottomans
//   lagoon – white walls under a pearl wave ceiling, wide panoramic windows, white bench
import {oceanParts} from './parts.js';

const plaqueText = (index, work) => `${index + 1}. ${work?.title || ''}${work?.artist && work.artist !== work.title ? ` · ${work.artist}` : ''}`;
export function buildRoom(C) {
  const K = oceanParts(C);
  const {T, TH, L, V, PI} = K, group = C.group, theme = C.theme;
  const G = C.layout, [W, H, D] = G.innerSize, t = G.wallThickness;
  // Works fit their slot at their own ratio (max 1.42 × 1.26 m; the main slide 2.0 × 1.7 m).
  const profile = (work, hero) => {
    const a = work?.width > 0 && work?.height > 0 ? work.width / work.height : 1.3;
    const [aw, ah] = K.fit(a, hero ? 2.0 : 1.42, hero ? 1.7 : 1.26);
    return {artSize: [aw, ah], outerFrameSize: [aw + .22, ah + .22]};
  };
  // The main slide hangs on the north wall slot nearest the centre, facing the entrance.
  const heroSlot = G.artSlots.filter(slot => slot.wall === 'north').reduce((best, slot) => Math.abs(slot.u) < Math.abs(best.u) ? slot : best);
  const slotOrder = [heroSlot, ...G.artSlots.filter(slot => slot !== heroSlot)];
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
    // Each window grows to the space its neighbouring works leave free, at the reference's proportions.
    const slots = G.artSlots.filter(a => a.wall === name);
    const windows = G.windows.filter(v => v.wall === name).map(v => {
      const free = Math.min(...slots.map(a => Math.abs(a.u - v.u) - (a === heroSlot ? 1.3 : .95)), w.len / 2 - Math.abs(v.u) - .3);
      return {u: v.u, y: v.position[1] + S.winY, maxW: Math.min(2 * free, v.maxSize[0] * S.win), maxH: S.winH, aspect: TH.windowAspect};
    });
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
  let heroHang = null;
  function hang(slot, index, work, texture) {
    const prof = profile(work, index === 0);
    const g = K.grp(group, slot.position[0], 0, slot.position[2], slot.rotationY);
    K.lightPool(g, 0, slot.position[1] + .5, -.05, Math.max(1.5, prof.outerFrameSize[0] * 1.45), 2.6, theme === 'abyss' ? .36 : .3);
    const f = K.framedArt(g, texture, 0, slot.position[1] + (index === 0 ? .12 : 0), -.057, prof.artSize[0], prof.artSize[1], prof.outerFrameSize[0], prof.outerFrameSize[1]);
    // Name plate under the frame (number · title · artist); the rotating main slide shows its name in the bottom card.
    if (index !== 0 && C.label) {
      const w = Math.min(Math.max(prof.outerFrameSize[0], 1.05), 1.75), h = .16, text = plaqueText(index, work);
      K.plane(g, 0, slot.position[1] - prof.outerFrameSize[1] / 2 - .16, -.04, w, h, C.label(text, {width: Math.max(256, Math.round(w / h * 96)), height: 96, color: '#3c3a33', background: '#fbf6ec', font: '700 52px "Malgun Gothic",sans-serif'}));
    }
    return {g, target: {mesh: f, kind: 'art', index}};
  }
  slotOrder.forEach((slot, index) => {
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
