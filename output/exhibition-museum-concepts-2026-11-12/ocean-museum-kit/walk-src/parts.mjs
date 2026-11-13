// Shared building blocks for the underwater museum: walls with real openings cut
// to the generated portal and window images, picture frames, sea life and water light.
// Local wall frame: +X along the wall, +Y up, +Z toward the visitor (inner face at z = 0).
export function oceanParts(C) {
  const {T, group, theme} = C;
  const TH = BUNDLE.themes[theme], L = BUNDLE.layout;
  const PI = Math.PI, TAU = PI * 2;
  const solids = [], targets = [], animators = [];
  const cache = new Map();
  const unitPlane = new T.PlaneGeometry();
  let seed = 7 + theme.length * 13;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const between = (a, b) => a + (b - a) * rand();
  const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

  function grp(parent, x = 0, y = 0, z = 0, ry = 0) {
    const o = new T.Group(); o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o;
  }
  function mesh(parent, g, m, x = 0, y = 0, z = 0) {
    const o = new T.Mesh(g, m); o.position.set(x, y, z);
    if (!m.transparent && m.isMeshStandardMaterial) { o.receiveShadow = true; o.castShadow = true; }
    parent.add(o); return o;
  }
  function plane(parent, x, y, z, w, h, m) { const o = mesh(parent, unitPlane, m, x, y, z); o.scale.set(w, h, 1); return o; }
  function meterUV(g, tile) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (az >= ax && az >= ay) uv.setXY(i, x / tile, y / tile);
      else if (ax >= ay) uv.setXY(i, z / tile, y / tile);
      else uv.setXY(i, x / tile, z / tile);
    }
    uv.needsUpdate = true; return g;
  }
  function box(parent, x, y, z, w, h, d, m, tile = 2.4) {
    const g = meterUV(new T.BoxGeometry(w, h, d).toNonIndexed(), tile);
    // Box UVs from local coordinates keep the material scale constant on every face.
    return mesh(parent, g, m, x, y, z);
  }
  const ROUGH = {floor: .42, trim: .38, hull: .55, shell: theme === 'lagoon' ? .3 : .62, ceiling: .8, wall: .88, tread: .8, seabed: .95};
  const METAL = {trim: .55, hull: theme === 'abyss' ? .45 : .1, shell: theme === 'abyss' ? .4 : .05};
  // Every surface uses the kit's base colour, normal and roughness maps.
  // `caustic` adds the moving sea light onto the surface itself (strength 0–1).
  function surface(key, tint, extra = {}) {
    const {caustic = 0, normal = 1, ...rest} = extra;
    const id = ['s', key, tint || '', caustic, normal, JSON.stringify(rest)].join('/');
    if (!cache.has(id)) {
      const m = new T.MeshStandardMaterial({map: C.tile(key), roughness: 1, metalness: METAL[key] ?? 0, ...rest});
      const nm = C.tile(key + 'N', true), rm = C.tile(key + 'R', true);
      if (nm) { m.normalMap = nm; m.normalScale.set(normal, normal); }
      if (rm) { m.roughnessMap = rm; m.roughness = ROUGH[key] ? ROUGH[key] / .62 : 1.1; } else m.roughness = ROUGH[key] ?? .8;
      if (rest.roughness !== undefined) m.roughness = rest.roughness;
      if (tint) m.color.set(tint);
      if (caustic) causticize(m, caustic);
      cache.set(id, m);
    }
    return cache.get(id);
  }
  // Materials that belong to the sea outside keep the fog indoors.
  function seaSurface(key, tint, caustic) {
    const id = ['sea', key, tint || '', caustic].join('/');
    if (!cache.has(id)) { const m = surface(key, tint, {caustic, normal: 1.2}).clone(); m.userData.sea = true; if (caustic) causticize(m, caustic); cache.set(id, m); }
    return cache.get(id);
  }
  // Shared, moving caustic light, projected from above onto any lit surface.
  const causticU = {time: {value: 0}, map: {value: null}, color: {value: new T.Color(TH.causticColor || '#d6fbff')}};
  let causticTicking = false;
  function causticize(m, strength) {
    causticU.map.value ||= C.img(BUNDLE.effects.caustics, true, true);
    if (!causticTicking) { causticTicking = true; animators.push(t => { causticU.time.value = t; }); }
    m.onBeforeCompile = s => {
      s.uniforms.cTime = causticU.time; s.uniforms.cMap = causticU.map; s.uniforms.cColor = causticU.color;
      s.vertexShader = 'varying vec3 vCw; varying vec3 vCn;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cw = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          cw = instanceMatrix * cw;
        #endif
        vCw = (modelMatrix * cw).xyz; vCn = normalize(mat3(modelMatrix) * objectNormal);`);
      s.fragmentShader = 'uniform float cTime; uniform sampler2D cMap; uniform vec3 cColor; varying vec3 vCw; varying vec3 vCn;\n' +
        s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec2 q = (vCw.xz + vCw.y * vec2(.35, .2)) * .21;
          float a = texture2D(cMap, q + vec2(cTime*.019, cTime*.011)).r;
          float b = texture2D(cMap, q*1.37 + vec2(-cTime*.014, cTime*.017)).r;
          float c = pow(min(a, b), 1.25) * 2.2;
          float up = clamp(vCn.y * .55 + .55, .15, 1.);
          totalEmissiveRadiance += cColor * c * up * ${strength.toFixed(3)} * diffuseColor.rgb * 2.; }`);
    };
    m.customProgramCacheKey = () => 'caustic' + strength;
  }
  function photo(key, opts = {}) {
    const id = ['p', key, opts.alpha ? 1 : 0, opts.side || 0, opts.dim || ''].join('/');
    if (!cache.has(id)) {
      const m = new T.MeshBasicMaterial({map: C.tex(key), toneMapped: false, side: opts.side || T.FrontSide,
        transparent: false, alphaTest: opts.alpha ? .5 : 0});
      if (opts.dim) m.color.set(opts.dim);
      cache.set(id, m);
    }
    return cache.get(id);
  }
  const glow = (color) => { const id = 'g/' + color; if (!cache.has(id)) cache.set(id, new T.MeshBasicMaterial({color, toneMapped: false})); return cache.get(id); };
  function croppedPlane(w, h, crop) {
    const g = new T.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, crop[0] + uv.getX(i) * (crop[2] - crop[0]), crop[1] + uv.getY(i) * (crop[3] - crop[1]));
    return g;
  }
  // Crop an image to fill a target aspect, like CSS object-fit: cover.
  function cover(key, aspect, focusY = .5) {
    const [w, h] = C.size(key) || [1, 1], a = w / h;
    if (a > aspect) { const k = aspect / a; return [.5 - k / 2, 0, .5 + k / 2, 1]; }
    const k = a / aspect, v0 = (1 - k) * (1 - focusY); return [0, v0, 1, v0 + k];
  }
  function photoPlane(parent, key, x, y, z, w, h, opts = {}) {
    const g = croppedPlane(w, h, opts.crop || [0, 0, 1, 1]);
    const o = mesh(parent, g, photo(key, opts), x, y, z); o.castShadow = false; return o;
  }
  function label(parent, text, x, y, z, w, h, color) {
    const m = C.label(text, {width: Math.max(256, Math.round(w / h * 96)), height: 96, color, font: '600 54px "Malgun Gothic",sans-serif'});
    return plane(parent, x, y, z, w, h, m);
  }

  // ---------- openings ----------
  // Aperture loops are measured from the image alpha by the build script.
  function loopPoints(loop, W, H, cx, cy, grow = .012) {
    const left = [], right = [];
    for (const [v, u0, u1] of loop) { const y = cy + (.5 - v) * H; left.push([cx + (u0 - .5) * W - grow, y]); right.push([cx + (u1 - .5) * W + grow, y]); }
    left[0][1] += grow; right[0][1] += grow; left[left.length - 1][1] -= grow; right[right.length - 1][1] -= grow;
    return [...left, ...right.reverse()];
  }
  function doorNotch(W, H, au, cx, grow = .015) {
    const loop = TH.apertures.portal.loops[0], left = [], right = [];
    for (const [v, u0, u1] of loop) { const y = Math.max(0, (1 - v) * H); left.push([cx + (u0 - au) * W - grow, y]); right.push([cx + (u1 - au) * W + grow, y]); }
    left[0][1] += grow; right[0][1] += grow;
    left.reverse(); left[0][1] = 0; right[right.length - 1][1] = 0;
    return [...left, ...right];
  }
  const extent = pts => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], y), Math.max(b[3], y)], [Infinity, -Infinity, Infinity, -Infinity]);
  function fit(aspect, maxW, maxH) { return aspect > maxW / maxH ? [maxW, maxW / aspect] : [maxH * aspect, maxH]; }

  function solidFrom(node, lx, lz, w, d) {
    node.updateWorldMatrix(true, false);
    const p = V(lx, 0, lz).applyMatrix4(node.matrixWorld);
    const q = new T.Quaternion(); node.getWorldQuaternion(q);
    const angle = new T.Euler().setFromQuaternion(q, 'YXZ').y;
    solids.push({x: p.x, z: p.z, w, d, angle});
  }
  const seaWindows = [];
  // A wall built in one piece with doorway notches and window holes.
  // spec: {x,z,rot,len,height,thick,mat,doors:[{u,kind,index,title,view,scale}],windows:[{u,y,key,maxW,maxH,aspect}],collide}
  function wall(spec) {
    const g = grp(group, spec.x, 0, spec.z, spec.rot);
    const thick = spec.thick ?? .24, H = spec.height, len = spec.len;
    const notches = [], holes = [], afters = [];
    const ds = TH.doorSkin, sc = spec.doorScale || 1;
    for (const d of spec.doors || []) {
      const W = ds.size[0] * sc, DH = ds.size[1] * sc, au = ds.anchorUV[0];
      const notch = doorNotch(W, DH, au, d.u);
      notches.push(notch);
      afters.push(() => doorway(g, d, notch, W, DH, au, thick, spec));
    }
    for (const w of spec.windows || []) {
      const key = w.key || 'viewport';
      const [iw, ih] = C.size(key);
      const [ww, wh] = fit(w.aspect || iw / ih, w.maxW, w.maxH);
      const loops = TH.apertures[key].loops.map(loop => loopPoints(loop, ww, wh, w.u, w.y));
      holes.push(...loops);
      afters.push(() => windowDressing(g, w, key, ww, wh, loops, thick, spec));
    }
    const s = new T.Shape(); s.moveTo(-len / 2, 0);
    notches.sort((a, b) => a[0][0] - b[0][0]);
    for (const n of notches) for (const [x, y] of n) s.lineTo(x, y);
    s.lineTo(len / 2, 0);
    for (const [x, y] of (spec.top || [[len / 2, H], [-len / 2, H]])) s.lineTo(x, y);
    s.closePath();
    for (const h of holes) { const p = new T.Path(); h.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); s.holes.push(p); }
    const geo = new T.ExtrudeGeometry(s, {depth: thick, bevelEnabled: false, curveSegments: 10});
    geo.translate(0, 0, -thick);
    mesh(g, meterUV(geo, spec.tile || 2.4), spec.mat);
    // A contrasting skirting and cornice where the wall is long and plain.
    if (spec.skirting !== false) {
      const runs = []; let from = -len / 2;
      for (const n of notches) { const [x0, x1] = extent(n); runs.push([from, x0]); from = x1; }
      runs.push([from, len / 2]);
      for (const [a, b] of runs) if (b - a > .05) box(g, (a + b) / 2, .06, .015, b - a, .12, .03, spec.trim || surface('trim'));
    }
    if (spec.collide) solidFrom(g, 0, -thick / 2, len, thick);
    for (const f of afters) f();
    return g;
  }
  function doorway(g, d, notch, W, DH, au, thick, spec) {
    const [x0, x1, , y1] = extent(notch), cx = (x0 + x1) / 2, ow = x1 - x0;
    const portal = photoPlane(g, 'portal', d.u + (.5 - au) * W, DH / 2, .012, W, DH, {alpha: true});
    portal.renderOrder = 2;
    if (d.kind !== 'none') {
      // A shallow lit vestibule beyond the opening, so the doorway reads as a passage.
      const depth = d.depth || 1.7, back = -thick - depth, room = grp(g, cx, 0, 0);
      const side = surface('wall'), lid = surface('ceiling');
      box(room, 0, -.05, back / 2, ow + .3, .1, depth + thick, surface('floor'));
      for (const s of [-1, 1]) {
        box(room, s * (ow / 2 + .06), (y1 + .1) / 2, back / 2 - .02, .12, y1 + .1, depth + thick - .04, side);
        // The kit's door-return photograph on each side of the passage.
        const jamb = photoPlane(room, 'jamb', s * (ow / 2 - .005), y1 / 2, back / 2, depth + thick, y1, {crop: cover('jamb', (depth + thick) / y1, .5)});
        jamb.rotation.y = -s * Math.PI / 2;
      }
      box(room, 0, y1 + .08, back / 2 - .02, ow + .24, .12, depth + thick - .04, lid);
      if (d.view && C.tex(d.view)) photoPlane(room, d.view, 0, y1 / 2, back + .02, ow, y1, {crop: cover(d.view, ow / y1, .45)});
      box(room, 0, y1 - .02, back + .25, ow * .7, .025, .04, glow('#ffe7c2'));
      const pick = plane(g, cx, y1 / 2, -.06, ow, y1, new T.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, colorWrite: false}));
      const inward = V(cx, 0, .5).applyMatrix4((g.updateWorldMatrix(true, false), g.matrixWorld));
      targets.push({mesh: pick, kind: d.kind, index: d.index, walkIn: {x: inward.x, z: inward.z, r: .42}});
    }
    if (d.title) label(g, d.title, d.u, Math.min(DH + .26, spec.height - .3), .03, Math.min(3.4, d.title.length * .22 + .5), .3, d.ink || TH.ink);
  }
  function windowDressing(g, w, key, ww, wh, loops, thick, spec) {
    const sleeve = w.sleeve || spec.sleeve;
    if (sleeve) {
      // A deep tiled reveal around the opening, as in the reference renders.
      const depth = sleeve.depth ?? .75, front = sleeve.front ?? .07;
      for (const loop of loops) {
        const [x0, x1, y0, y1] = extent(loop), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const grow = sleeve.rim ?? .16;
        const s = new T.Shape();
        loop.forEach(([x, y], i) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; const px = x + dx / l * grow, py = y + dy / l * grow; i ? s.lineTo(px, py) : s.moveTo(px, py); });
        const hole = new T.Path(); loop.forEach(([x, y], i) => i ? hole.lineTo(x, y) : hole.moveTo(x, y)); s.holes.push(hole);
        const geo = new T.ExtrudeGeometry(s, {depth, bevelEnabled: true, bevelSize: .03, bevelThickness: .03, bevelSegments: 2, curveSegments: 12});
        geo.translate(0, 0, front - depth);
        // Tile along the reveal: around the loop on U, through the wall on V.
        const p = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getY(i) - cy, p.getX(i) - cx); uv.setXY(i, a * Math.max(x1 - x0, y1 - y0) / 1.6, p.getZ(i) / .55 + Math.hypot(p.getX(i) - cx, p.getY(i) - cy) / .55); }
        mesh(g, geo, sleeve.mat);
      }
      photoPlane(g, key, w.u, w.y, front + .012, ww, wh, {alpha: true}).renderOrder = 2;
    } else photoPlane(g, key, w.u, w.y, .014, ww, wh, {alpha: true}).renderOrder = 2;
    if (spec.outerFrame) { const o = photoPlane(g, key, w.u, w.y, -thick - .014, ww, wh, {alpha: true}); o.rotation.y = PI; }
    const glass = new T.MeshStandardMaterial({color: '#bfe8f0', transparent: true, opacity: .1, roughness: .04, metalness: .2, depthWrite: false});
    for (const loop of loops) {
      const s = new T.Shape(); loop.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
      const pane = mesh(g, new T.ShapeGeometry(s), glass, 0, 0, -thick * .5); pane.renderOrder = 3;
    }
    if (w.glowBehind) {
      // Exterior: the lit interior seen through a window.
      const [x0, x1, y0, y1] = extent(loops.flat());
      photoPlane(g, w.glowBehind, (x0 + x1) / 2, (y0 + y1) / 2, -thick - 1.6, (x1 - x0) * 1.6, (y1 - y0) * 1.6, {crop: cover(w.glowBehind, (x1 - x0) / (y1 - y0))});
    }
    g.updateWorldMatrix(true, false);
    const center = V(w.u, w.y, 0).applyMatrix4(g.matrixWorld);
    const out = V(0, 0, -1).transformDirection(g.matrixWorld);
    const along = V(1, 0, 0).transformDirection(g.matrixWorld);
    seaWindows.push({center, out, along, width: ww, sea: w.sea !== false});
  }

  // ---------- art ----------
  function nineSlice(W, H, m) {
    const [iw, ih] = TH.frameSize, [l, t, r, b] = TH.frameSlice, e = .045;
    const xs = [-W / 2, -W / 2 + e, W / 2 - e, W / 2], ys = [-H / 2, -H / 2 + e, H / 2 - e, H / 2];
    const us = [0, l / iw, 1 - r / iw, 1], vs = [0, b / ih, 1 - t / ih, 1];
    const p = [], uv = [], ix = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { p.push(xs[i], ys[j], 0); uv.push(us[i], vs[j]); }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      if (i === 1 && j === 1) continue;
      const k = j * 4 + i; ix.push(k, k + 1, k + 5, k, k + 5, k + 4);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
    return g;
  }
  const matte = new T.MeshStandardMaterial({color: '#f3eee3', roughness: .92});
  function framedArt(parent, tex, x, y, z, artW, artH, outerW, outerH) {
    const f = grp(parent, x, y, z);
    const back = mesh(f, new T.BoxGeometry(outerW - .02, outerH - .02, .03), surface('trim'), 0, 0, .012); back.castShadow = false;
    plane(f, 0, 0, .038, outerW - .07, outerH - .07, matte);
    plane(f, 0, 0, .044, artW, artH, new T.MeshBasicMaterial({map: tex, toneMapped: false}));
    const frame = mesh(f, nineSlice(outerW, outerH), photo('frame', {alpha: true}), 0, 0, .057); frame.castShadow = false;
    return f;
  }
  function framedCover(parent, roomIndex, x, y, z, maxW, maxH) {
    const tex = C.coverTex(roomIndex); if (!tex) return null;
    const art = BUNDLE.rooms[roomIndex] && C.coverArt(roomIndex);
    const a = art ? art.width / art.height : 1;
    const [aw, ah] = fit(a, maxW, maxH);
    return framedArt(parent, tex, x, y, z, aw, ah, aw + .2, ah + .2);
  }

  // ---------- the sea ----------
  const LIFE = TH.life;
  function spriteMat(path) {
    const m = new T.SpriteMaterial({map: C.img(path), alphaTest: .35, transparent: false, depthWrite: true, toneMapped: false, fog: true});
    m.userData.sea = true; return m;
  }
  function grower(item, x, y, z, scale = 1) {
    const s = new T.Sprite(spriteMat(item.src));
    s.center.set(item.anchor[0], 1 - item.anchor[1]);
    const h = item.height * scale * between(.8, 1.2); s.scale.set(h * item.aspect, h, 1);
    s.position.set(x, y, z); s.raycast = () => {}; group.add(s);
    const ph = rand() * TAU, amp = item.height > 2 ? .05 : .025;
    animators.push(t => { s.material.rotation = amp * Math.sin(t * .7 + ph); });
    return s;
  }
  // A school follows an ellipse around `center`, in the plane of `a` and `b`.
  function school(item, center, a, b, opts = {}) {
    const frames = item.frames.map(p => C.img(p));
    const n = opts.count ?? item.school, speed = (opts.speed ?? between(.1, .2)) * (rand() < .5 ? -1 : 1);
    const phase = rand() * TAU, members = [];
    const spread = Math.max(.25, Math.sqrt(n) * item.size * .7);
    for (let i = 0; i < n; i++) {
      const mat = new T.SpriteMaterial({map: frames[0], alphaTest: .3, depthWrite: true, toneMapped: false, fog: true});
      mat.userData.sea = true;
      const s = new T.Sprite(mat); s.center.set(item.anchor[0], 1 - item.anchor[1]); s.raycast = () => {};
      group.add(s);
      const size = item.size * (opts.scale || 1) * (n > 1 ? between(.75, 1.15) : 1);
      members.push({s, size, off: V(between(-1, 1), between(-.5, .5), between(-1, 1)).multiplyScalar(i ? spread : 0),
        lag: i * between(.02, .08), wob: rand() * TAU});
    }
    const pos = V(), vel = V();
    animators.push((t, cam) => {
      for (const m of members) {
        const ang = phase + (t - m.lag * 8) * speed;
        const c = Math.cos(ang), s = Math.sin(ang);
        pos.copy(center).addScaledVector(a, c).addScaledVector(b, s).add(m.off);
        pos.y += .18 * Math.sin(t * .9 + m.wob);
        vel.copy(a).multiplyScalar(-s).addScaledVector(b, c).multiplyScalar(speed);
        m.s.position.copy(pos);
        const flip = vel.dot(cam.right) < 0 ? -1 : 1;
        m.s.scale.set(flip * m.size, m.size / item.aspect, 1);
        if (frames.length > 1) m.s.material.map = frames[Math.floor((t + m.wob) * (item.fps || 3)) % frames.length];
      }
    });
  }
  function pick(list, filter) { const items = list.filter(filter); return items.length ? items[Math.floor(rand() * items.length)] : null; }
  const big = it => it.size >= 1.2, small = it => it.size < 1.2;
  // Populate the water in front of each window: growth on the sea floor and moving fish.
  function seaBeyondWindows(floorY, opts = {}) {
    for (const w of seaWindows) {
      if (!w.sea) continue;
      const n = opts.plants ?? 7;
      for (let i = 0; i < n; i++) {
        const item = pick(LIFE.growers, it => i < 2 || it.height < 3); if (!item) break;
        const d = between(.9, 7);
        const p = w.center.clone().addScaledVector(w.out, d).addScaledVector(w.along, between(-.7, .7) * (w.width + d * 1.2));
        grower(item, p.x, floorY, p.z, item.height < 1.5 ? between(1.3, 2.1) : 1);
      }
      for (let i = 0; i < (opts.schools ?? 3); i++) {
        const item = pick(LIFE.swimmers, small); if (!item) break;
        const c = w.center.clone().addScaledVector(w.out, between(2.2, 4.5)); c.y = w.center.y + between(-.6, .5);
        school(item, c, w.along.clone().multiplyScalar(between(2.2, 3.6)), w.out.clone().multiplyScalar(between(.7, 1.4)), {scale: 1.3});
      }
    }
  }
  function bigVisitors(center, radius, y, count = 2) {
    for (let i = 0; i < count; i++) {
      const item = pick(LIFE.swimmers, big); if (!item) return;
      const r = radius * between(.85, 1.15);
      school(item, V(center.x, y + between(-1, 2.5) + (item.size > 5 ? 6 : 0), center.z), V(r, 0, 0), V(0, 0, r * between(.6, 1)),
        {count: 1, speed: item.size > 5 ? .035 : between(.05, .08)});
    }
  }
  function seabed(y, size, flat, tile = 3.2) {
    const g = new T.PlaneGeometry(size, size, 72, 72); g.rotateX(-PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      let h = .22 * Math.sin(x * .31 + z * .17) + .16 * Math.sin(z * .43 - x * .21) + .07 * Math.sin(x * 1.3 + z * .9);
      const dx = Math.max(0, Math.abs(x - flat[0]) - flat[2]), dz = Math.max(0, Math.abs(z - flat[1]) - flat[3]);
      const k = Math.min(1, Math.hypot(dx, dz) / 5);
      h *= k; h += k * k * Math.max(0, Math.hypot(x, z) - size * .3) * .06;
      p.setY(i, y + h);
    }
    g.computeVertexNormals();
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
    const o = mesh(group, g, seaSurface('seabed', null, TH.causticsOutdoor ?? .6)); o.castShadow = false; return o;
  }
  // Moving caustic light on a horizontal surface (additive).
  function caustics(x, y, z, w, d, strength, color = '#cdf6ff', fade = 0) {
    const uniforms = {map: {value: C.img(BUNDLE.effects.caustics, true, true)}, time: {value: 0}, color: {value: new T.Color(color)},
      strength: {value: strength}, size: {value: new T.Vector2(w, d)}, fade: {value: fade}};
    const m = new T.ShaderMaterial({uniforms, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'varying vec3 vw; varying vec2 vl; void main(){ vl = position.xy; vec4 p = modelMatrix * vec4(position,1.); vw = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }',
      fragmentShader: `uniform sampler2D map; uniform float time, strength, fade; uniform vec3 color; uniform vec2 size;
        varying vec3 vw; varying vec2 vl;
        void main(){ vec2 uv = vw.xz * .23;
          float a = texture2D(map, uv + vec2(time*.019, time*.011)).r;
          float b = texture2D(map, uv*1.37 + vec2(-time*.014, time*.017)).r;
          float c = pow(min(a, b), 1.3) * 1.8;
          vec2 q = abs(vl) / (size * .5); float edge = 1. - smoothstep(1. - fade, 1., max(q.x, q.y));
          gl_FragColor = vec4(color * c * strength * (fade > 0. ? edge : 1.), 1.); }`});
    const g = new T.PlaneGeometry(w, d); const o = new T.Mesh(g, m); o.rotation.x = -PI / 2; o.position.set(x, y, z);
    o.raycast = () => {}; o.renderOrder = 4; group.add(o);
    animators.push(t => { uniforms.time.value = t; });
    return o;
  }
  // Soft shafts of daylight that always turn toward the visitor.
  function shafts(list, opacity = .22, color = '#e6fbff') {
    const map = C.img(BUNDLE.effects.shafts);
    for (const [x, y, z, w, h] of list) {
      const m = new T.MeshBasicMaterial({map, color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false, fog: false});
      const o = new T.Mesh(unitPlane, m); o.scale.set(w, h, 1); o.position.set(x, y, z); o.raycast = () => {}; o.renderOrder = 5; group.add(o);
      const ph = rand() * TAU;
      animators.push((t, cam) => { o.rotation.y = Math.atan2(cam.position.x - x, cam.position.z - z); m.opacity = opacity * (.7 + .3 * Math.sin(t * .35 + ph)); });
    }
  }
  // Drifting particles (marine snow) inside a box, avoiding an excluded rectangle.
  function drift(count, b, exclude, color = '#e8f6ff', size = .05, rise = -.05) {
    const p = new Float32Array(count * 3), base = [];
    for (let i = 0; i < count; i++) {
      let x, z, k = 0;
      do { x = between(b[0], b[1]); z = between(b[4], b[5]); k++; }
      while (exclude && k < 30 && x > exclude[0] && x < exclude[1] && z > exclude[2] && z < exclude[3]);
      const y = between(b[2], b[3]); p.set([x, y, z], i * 3); base.push([x, y, z, rand() * TAU]);
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d'), grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(.5, 'rgba(255,255,255,.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
    const map = new T.CanvasTexture(canvas);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    const m = new T.PointsMaterial({map, color, size, transparent: true, opacity: .75, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true, fog: true});
    m.userData.sea = true;
    const pts = new T.Points(g, m); pts.raycast = () => {}; group.add(pts);
    const span = b[3] - b[2];
    animators.push(t => {
      for (let i = 0; i < count; i++) {
        const [x, y, z, ph] = base[i];
        let yy = y + rise * t; yy = b[2] + ((yy - b[2]) % span + span) % span;
        p[i * 3] = x + .25 * Math.sin(t * .3 + ph); p[i * 3 + 1] = yy; p[i * 3 + 2] = z + .25 * Math.cos(t * .27 + ph);
      }
      g.attributes.position.needsUpdate = true;
    });
  }
  // ---------- realism helpers ----------
  // Rock: a lumpy, flattened icosahedron in the seabed material.
  function rock(x, y, z, sx, sy, sz, tint, detail = 3) {
    const g = new T.IcosahedronGeometry(1, detail), p = g.attributes.position, ph = rand() * 10;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const k = 1 + .2 * Math.sin(vx * 3.1 + ph) * Math.cos(vz * 2.7 + ph) + .12 * Math.sin(vy * 5.3 + vx * 2 + ph)
        + .07 * Math.sin(vx * 9.1 + vz * 7.3 + ph) + .05 * Math.cos(vy * 11.7 - vz * 8.1);
      p.setXYZ(i, vx * k, Math.max(vy * k, -.25), vz * k);
    }
    g.computeVertexNormals();
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) * sx + p.getZ(i) * sz * .7) / 1.8, (p.getY(i) * sy + p.getZ(i) * sz * .5) / 1.8);
    const o = mesh(group, g, seaSurface(TH.rock || 'seabed', tint || TH.rockTint || '#9a8f80', .55), x, y, z); o.scale.set(sx, sy, sz); o.rotation.y = rand() * TAU; return o;
  }
  // A reef bank in front of a window: rocks crowned with the theme's growth.
  function reefBank(center, out, along, width, floorY, opts = {}) {
    const n = opts.rocks ?? 5;
    for (let i = 0; i < n; i++) {
      const r = opts.near ? between(.45, .8) : between(.9, 1.7), h = between(.6, 1.3) * (opts.height || 1);
      // Keep every rock wholly outside the wall (rocks are 1.3 r wide along the wall).
      const d = Math.max(opts.near ? between(.9, 2.4) : between(1.6, 4.5), r * 1.35 + .45), s = between(-1, 1) * (width * (opts.near ? .55 : .8) + d * .5);
      const p = center.clone().addScaledVector(out, d).addScaledVector(along, s);
      rock(p.x, floorY, p.z, r * 1.3, h, r);
      for (let k = 0; k < 4; k++) {
        const item = pick(LIFE.growers, it => it.height < 3.2 || opts.tall); if (!item) break;
        const a = rand() * TAU, rr = between(0, r * .7);
        grower(item, p.x + Math.cos(a) * rr, floorY + h * .78, p.z + Math.sin(a) * rr, item.height < 1.4 ? between(1.4, 2.3) : between(.8, 1.1));
      }
    }
  }
  // Polished floor: a small reflected view of the room, blurred and faded by angle.
  function polish(floor, opacity = .3) {
    const rt = new T.WebGLRenderTarget(384, 256, {minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter, generateMipmaps: true});
    const reflected = new T.PerspectiveCamera(), matrix = new T.Matrix4(), up = V(0, 1, 0), look = V();
    const uniforms = {plate: {value: rt.texture}, reflectionProjection: {value: matrix}, opacityScale: {value: opacity}};
    const coating = new T.ShaderMaterial({uniforms, transparent: true, depthWrite: false,
      vertexShader: `uniform mat4 reflectionProjection; varying vec4 coord; varying vec3 world;
        void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;coord=reflectionProjection*p;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: `uniform sampler2D plate;uniform float opacityScale;varying vec4 coord;varying vec3 world;
        void main(){vec2 u=coord.xy/coord.w*.5+.5;vec2 b=vec2(.007,.02);
          vec3 c=texture2D(plate,u,3.).rgb*.25;
          c+=(texture2D(plate,u+b,3.).rgb+texture2D(plate,u-b,3.).rgb)*.125;
          c+=(texture2D(plate,u+vec2(-b.x,b.y),3.).rgb+texture2D(plate,u+vec2(b.x,-b.y),3.).rgb)*.125;
          c+=(texture2D(plate,u+vec2(0.,2.*b.y),3.).rgb+texture2D(plate,u-vec2(0.,2.*b.y),3.).rgb)*.125;
          float g=1.-clamp(normalize(cameraPosition-world).y,0.,1.);gl_FragColor=vec4(c,opacityScale*(.35+.65*g*g));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`});
    coating.addEventListener('dispose', () => rt.dispose());
    const top = new T.Mesh(floor.geometry, coating);
    top.position.copy(floor.position); top.position.y += .003; top.quaternion.copy(floor.quaternion); top.scale.copy(floor.scale);
    top.renderOrder = 1; top.raycast = () => {}; floor.parent.add(top);
    const surfaceY = floor.position.y + (floor.geometry.boundingBox || (floor.geometry.computeBoundingBox(), floor.geometry.boundingBox)).max.y * floor.scale.y;
    top.onBeforeRender = (renderer, scene, camera) => {
      if (camera === reflected) return;
      reflected.copy(camera, false); reflected.position.y = 2 * surfaceY - camera.position.y;
      camera.getWorldDirection(look).add(camera.position); look.y = 2 * surfaceY - look.y;
      reflected.up.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(up); reflected.lookAt(look); reflected.updateMatrixWorld();
      matrix.multiplyMatrices(reflected.projectionMatrix, reflected.matrixWorldInverse);
      const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.needsUpdate;
      top.visible = false; floor.visible = false; renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(rt);
      try { renderer.render(scene, reflected); }
      finally { renderer.setRenderTarget(previous); renderer.shadowMap.needsUpdate = shadows; floor.visible = true; top.visible = true; }
    };
    return top;
  }
  // A quarter-round cove joining a wall to the ceiling (wall-local frame).
  function cove(parent, len, H, R, m, glowColor) {
    const n = 14, p = [], uv = [], ix = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * PI / 2, y = H - R + R * Math.sin(a), z = R - R * Math.cos(a);
      for (const x of [-len / 2, len / 2]) { p.push(x, y, z); uv.push(x / 2.4, a * R / 2.4); }
      if (i) { const k = i * 2; ix.push(k - 2, k - 1, k + 1, k - 2, k + 1, k); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(ix); g.computeVertexNormals();
    const o = mesh(parent, g, m); o.castShadow = false;
    if (glowColor) box(parent, 0, H - R - .02, .05, len - .3, .03, .1, glow(glowColor));
    return o;
  }
  // Soft pool of light on a wall, as cast by a track spot.
  let poolTex = null;
  function lightPool(parent, x, y, z, w, h, opacity = .35, color = '#ffe2b8') {
    if (!poolTex) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 256; const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64, 40, 4, 64, 110, 120);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 256); poolTex = new T.CanvasTexture(c);
    }
    const m = new T.MeshBasicMaterial({map: poolTex, color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false});
    const o = plane(parent, x, y, z, w, h, m); o.raycast = () => {}; o.renderOrder = 1; return o;
  }
  // A ceiling track with small spot heads aimed at the wall (wall-local frame).
  function track(parent, len, y, z, heads, m) {
    const rail = mesh(parent, new T.CylinderGeometry(.022, .022, len, 8), m, 0, y, z); rail.rotation.z = PI / 2; rail.castShadow = false;
    for (const x of heads) {
      const stem = mesh(parent, new T.CylinderGeometry(.012, .012, .12, 6), m, x, y - .07, z); stem.castShadow = false;
      const can = mesh(parent, new T.CylinderGeometry(.045, .06, .17, 12), m, x, y - .16, z - .03); can.rotation.x = -.75; can.castShadow = false;
      const lens = mesh(parent, new T.CircleGeometry(.04, 12), glow('#fff6e2'), x, y - .21, z - .09); lens.rotation.x = .85;
    }
  }
  // ---------- kit pieces placed in the spaces ----------
  // A photographed piece standing on the floor (bench, chair, vase, plinth, bollard, rail).
  function standee(parent, key, x, y, z, yaw, height, opts = {}) {
    if (!C.tex(key)) return null;
    const [iw, ih] = C.size(key), w = height * iw / ih;
    const g = croppedPlane(w, height, [0, 0, 1, 1]); g.translate(0, height / 2 - (opts.sink || 0), 0);
    const m = photo(key, {alpha: true, side: T.DoubleSide});
    const o = new T.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = yaw; o.castShadow = false; o.raycast = () => {}; parent.add(o);
    return o;
  }
  // Plinth with a vase on top, facing a point.
  function plinthVase(x, z, faceX, faceZ, scale = 1) {
    const yaw = Math.atan2(faceX - x, faceZ - z);
    const plinth = standee(group, 'plinth', x, 0, z, yaw, .62 * scale);
    standee(group, 'vase', x, .52 * scale, z + .01, yaw, .78 * scale);
    solids.push({x, z, w: .9 * scale, d: .9 * scale, angle: 0});
    return plinth;
  }
  function chair(x, z, faceX, faceZ, scale = 1) {
    standee(group, 'chair', x, 0, z, Math.atan2(faceX - x, faceZ - z), .95 * scale);
    solids.push({x, z, w: .8, d: .8, angle: 0});
  }
  // Bench photograph against a wall (wall-local frame).
  function wallBench(parent, u, width = 2.3) {
    const [iw, ih] = C.size('bench'); standee(parent, 'bench', u, 0, .45, 0, width * ih / iw);
    parent.updateWorldMatrix(true, false);
    const p = V(u, 0, .45).applyMatrix4(parent.matrixWorld), q = new T.Quaternion(); parent.getWorldQuaternion(q);
    solids.push({x: p.x, z: p.z, w: width, d: .9, angle: new T.Euler().setFromQuaternion(q, 'YXZ').y});
  }
  // Bollard lights and railing photographs along both sides of a straight path.
  function pathDressing(z0, z1, half, opts = {}) {
    for (let z = z0; z < z1; z += opts.step || 3.6) for (const s of [-1, 1]) {
      const b = new T.Sprite(new T.SpriteMaterial({map: C.tex('bollard'), alphaTest: .4, toneMapped: false, fog: true}));
      const [bw, bh] = C.size('bollard'); b.center.set(.5, 0); b.scale.set(.9 * bw / bh, .9, 1); b.position.set(s * half, .02, z); b.raycast = () => {}; group.add(b);
      solids.push({x: s * half, z, w: .3, d: .3, angle: 0});
    }
    if (opts.rails) {
      const [rw, rh] = C.size('rail'), h = .95, len = h * rw / rh;
      for (let z = z0 + 1.8; z + len / 2 < z1; z += len * .98) for (const s of [-1, 1]) standee(group, 'rail', s * (half + .25), 0, z, s * Math.PI / 2, h);
    }
  }
  // A glazing post skinned with the kit's gasket section.
  function gasketPost(parent, x, y0, z, yaw, h, w = .16) {
    const o = photoPlane(parent, 'gasket', x, y0 + h / 2, z, w, h, {alpha: true, side: T.DoubleSide, crop: [.35, 0, .65, 1]}); o.rotation.y = yaw; return o;
  }
  // The open sea surface far overhead, rippling.
  function waterSurface(y, size = 160, strength = .55) {
    const map = C.img(BUNDLE.effects.ripples, true, true), map2 = C.img(BUNDLE.effects.caustics, true, true);
    const uniforms = {map: {value: map}, map2: {value: map2}, time: {value: 0}, color: {value: new T.Color(TH.causticColor || '#d6fbff')}, strength: {value: strength}};
    const m = new T.ShaderMaterial({uniforms, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'varying vec2 vw; void main(){ vec4 p = modelMatrix * vec4(position,1.); vw = p.xz; gl_Position = projectionMatrix * viewMatrix * p; }',
      fragmentShader: `uniform sampler2D map, map2; uniform float time, strength; uniform vec3 color; varying vec2 vw;
        void main(){ float r = texture2D(map, vw*.035 + vec2(time*.006, time*.004)).r;
          float c = texture2D(map2, vw*.05 + vec2(-time*.01, time*.008) + r*.15).r;
          float d = length(vw) / ${(size / 2).toFixed(1)}; float fade = 1. - smoothstep(.35, 1., d);
          gl_FragColor = vec4(color * (r*.55 + pow(c, 1.6)*1.4) * strength * fade, 1.); }`});
    const o = new T.Mesh(new T.PlaneGeometry(size, size), m); o.rotation.x = Math.PI / 2; o.position.y = y; o.raycast = () => {}; o.renderOrder = -1; group.add(o);
    animators.push(t => { uniforms.time.value = t; });
    return o;
  }
  // Curtains of drifting particles from the kit's snow texture, turning to face the visitor.
  let curtainFade = null;
  function snowCurtains(list, opacity = .5) {
    const map = C.img(BUNDLE.effects.snow, true, true);
    if (!curtainFade) {
      // Soft oval fade so a curtain never shows its rectangular edge.
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 6, 64, 64, 64); g.addColorStop(0, '#fff'); g.addColorStop(.55, '#bbb'); g.addColorStop(1, '#000');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128); curtainFade = new T.CanvasTexture(c);
    }
    for (const [x, y, z, w, h] of list) {
      const m = new T.MeshBasicMaterial({map: map.clone(), alphaMap: curtainFade, color: TH.particle, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false});
      m.map.wrapS = m.map.wrapT = T.RepeatWrapping; m.map.repeat.set(w / 4, h / 4); m.map.needsUpdate = true; m.userData.sea = true;
      const o = new T.Mesh(unitPlane, m); o.scale.set(w, h, 1); o.position.set(x, y, z); o.raycast = () => {}; o.renderOrder = 5; group.add(o);
      const ph = rand() * 3;
      animators.push((t, cam) => { o.rotation.y = Math.atan2(cam.position.x - x, cam.position.z - z); m.map.offset.set(Math.sin(t * .05 + ph) * .1, t * .012 + ph); });
    }
  }
  // Display wall in the central hall (wall-local frame): building elevations above,
  // the kit's life sheets below; lagoon also shows the visitor cat's sixteen poses.
  function hallArchiveWall(parent, slots, ink) {
    const items = [['front', '정면도'], ['side', '측면도'], ['rear', '배면도'], ['roof', '지붕 평면도']];
    items.forEach(([key, ko], i) => {
      const [iw, ih] = C.size(key), [aw, ah] = fit(iw / ih, 1.55, .9), u = slots.top[i];
      const f = framedArt(parent, C.tex(key), u, 2.95, .02, aw, ah, aw + .2, ah + .2);
      label(parent, TH.title + ' ' + ko, u, 2.95 - ah / 2 - .28, .04, 1.6, .2, ink);
      lightPool(parent, u, 3.3, .03, 1.8, 2.0, .22);
      targets.push({mesh: f, kind: 'look', title: TH.title + ' ' + ko, image: C.imageUrl(key)});
    });
    const extras = BUNDLE.hallExtras[theme] || [];
    extras.forEach((item, i) => {
      const [iw, ih] = BUNDLE.sizes[item.image], [aw, ah] = fit(iw / ih, 1.5, .95), u = slots.low[i];
      const f = framedArt(parent, C.img(item.image), u, 1.45, .02, aw, ah, aw + .2, ah + .2);
      label(parent, item.title, u, 1.45 - ah / 2 - .28, .04, 1.7, .2, ink);
      targets.push({mesh: f, kind: 'look', title: item.title, image: C.url(item.image)});
    });
    if (theme === 'lagoon' && slots.low[3] !== undefined) {
      const g = grp(parent, slots.low[3], 1.45, .03), cell = .3;
      box(g, 0, 0, -.01, cell * 4 + .2, cell * 4 + .2, .03, surface('trim'));
      plane(g, 0, 0, .008, cell * 4 + .1, cell * 4 + .1, matte);
      BUNDLE.catFrames.forEach((path, k) => {
        const [iw, ih] = BUNDLE.sizes[path], [aw, ah] = fit(iw / ih, cell * .9, cell * .9);
        plane(g, ((k % 4) - 1.5) * cell, (1.5 - Math.floor(k / 4)) * cell, .015, aw, ah, new T.MeshBasicMaterial({map: C.img(path), transparent: true, alphaTest: .3, toneMapped: false}));
      });
      label(parent, '관람 고양이 · 네 방향 걷기 16컷', slots.low[3], 1.45 - .92, .04, 1.9, .2, ink);
    }
  }
  // Framed cover of a room beside its door, in a lit art bay with a spot above.
  function doorCover(parent, abs, slot, u) {
    const bay = photoPlane(parent, 'artBay', u, 1.75, .006, 1.5, 1.34, {alpha: true, crop: cover('artBay', 1.5 / 1.34, .55)}); bay.castShadow = false;
    const f = framedCover(parent, abs, u, 1.62, .02, .74, .86);
    if (f) targets.push({mesh: f, kind: 'room', index: slot});
    const [sw, sh] = C.size('spot'); photoPlane(parent, 'spot', u, 2.72, .05, .34, .34 * sh / sw, {alpha: true});
    lightPool(parent, u, 1.95, .03, 1.4, 2.0, .26);
  }
  // Barrel vault running along X between x0 and x1, springing at y0 across ±half in Z.
  function vault(spec) {
    const {x0, x1, half, y0, rise, mat, tile = 2.2, ribs, gables, purlins} = spec;
    const R = (half * half + rise * rise) / (2 * rise), cy = y0 + rise - R, al = Math.asin(half / R);
    const N = 40, M = Math.max(2, Math.ceil((x1 - x0) / 1.5)), p = [], uv = [], ix = [];
    for (let i = 0; i <= N; i++) {
      const f = -al + 2 * al * i / N;
      for (let j = 0; j <= M; j++) { const x = x0 + (x1 - x0) * j / M; p.push(x, cy + R * Math.cos(f), R * Math.sin(f)); uv.push(x / tile, R * f / tile); }
      if (i) for (let j = 0; j < M; j++) { const a = (i - 1) * (M + 1) + j, b = a + M + 1; ix.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(ix); g.computeVertexNormals();
    const m = mat.clone ? mat : mat; const o = mesh(group, g, m); o.castShadow = !mat.transparent; if (mat.transparent) o.renderOrder = 3;
    const arc = (r, n = 32) => Array.from({length: n + 1}, (_, i) => { const f = -al + 2 * al * i / n; return [cy + r * Math.cos(f), r * Math.sin(f)]; });
    if (ribs) for (let x = x0 + (ribs.offset ?? ribs.every / 2); x < x1; x += ribs.every) {
      const curve = new T.CatmullRomCurve3(arc(R - (ribs.inset ?? .02)).map(([y, z]) => V(x, y, z)));
      const rg = new T.TubeGeometry(curve, 48, ribs.r || .07, 8, false); mesh(group, rg, ribs.mat).castShadow = false;
    }
    if (purlins) for (const f of purlins.at) {
      const y = cy + (R - .03) * Math.cos(f * al), z = (R - .03) * Math.sin(f * al);
      const b = mesh(group, new T.CylinderGeometry(purlins.r || .04, purlins.r || .04, x1 - x0, 8), purlins.mat, (x0 + x1) / 2, y, z); b.rotation.z = PI / 2; b.castShadow = false;
    }
    if (gables) for (const x of [x0, x1]) {
      const s = new T.Shape(); const pts = arc(R, 40); s.moveTo(-half, y0);
      for (const [y, z] of pts) s.lineTo(z, y); s.lineTo(half, y0); s.closePath();
      const gg = new T.ShapeGeometry(s); const gp = gg.attributes.position, gu = gg.attributes.uv;
      for (let i = 0; i < gp.count; i++) gu.setXY(i, gp.getX(i) / tile, gp.getY(i) / tile);
      const gm = mesh(group, gg, gables.mat, x, 0, 0); gm.rotation.y = x === x0 ? PI / 2 : -PI / 2; gm.castShadow = false;
    }
    return {R, cy, al};
  }
  // A long half-cylinder building lying along local Z, raised on a skirt, with a
  // glazed band on the -X side that shows a lit gallery inside (kelp corridor).
  function tubeBuilding(spec) {
    const {x, z, yaw = 0, length, r, skirt = .8, shell, ribMat, glass, band = [1.3, 3.5], inner, covers = 6, coverStart = 0} = spec;
    const b = grp(group, x, 0, z, yaw);
    const ang = y => Math.acos(Math.max(-1, Math.min(1, -(y - skirt) / r)));
    const wA = 2 * PI - ang(band[0]), wB = 2 * PI - ang(band[1]);   // -X side, wB < wA
    const piece = (t0, t1, m) => {
      const g = new T.CylinderGeometry(r, r, length, Math.max(6, Math.ceil(48 * (t1 - t0) / PI)), 1, true, t0, t1 - t0);
      g.rotateX(PI / 2); const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * (t1 - t0) / 1.6, uv.getY(i) * length / 1.6);
      const o = mesh(b, g, m, 0, skirt, 0); if (m.transparent) o.renderOrder = 3; return o;
    };
    const shellD = shell.clone(); shellD.side = T.DoubleSide; if (shell.onBeforeCompile) { shellD.onBeforeCompile = shell.onBeforeCompile; shellD.customProgramCacheKey = shell.customProgramCacheKey; }
    piece(PI / 2, wB, shellD); piece(wA, PI * 1.5, shellD); piece(wB, wA, glass);
    for (const s of [-1, 1]) box(b, s * r, skirt / 2, 0, .3, skirt, length, shellD, 1.6);
    for (const zz of [-length / 2, length / 2]) {
      const cap = new T.Shape(); cap.absarc(0, 0, r, 0, PI, false); cap.closePath();
      const c = mesh(b, new T.ShapeGeometry(cap, 24), shellD, 0, skirt, zz);
    }
    for (let zz = -length / 2 + .8; zz < length / 2; zz += 1.6) {
      const rib = mesh(b, new T.TorusGeometry(r + .06, .06, 6, 40, PI), ribMat, 0, skirt, zz); rib.castShadow = false;
    }
    // Inside: floor, back wall hung with works, warm light.
    box(b, 0, skirt - .05, 0, 2 * r - .4, .1, length - .4, surface('floor'));
    const wall = grp(b, r * .55, 0, 0, -PI / 2);
    box(wall, 0, skirt + 1.6, -.06, length - .6, 3.2, .1, inner);
    for (let i = 0; i < covers; i++) {
      const u = -length / 2 + (i + .5) * length / covers;
      const f = framedCover(wall, (coverStart + i) % 20, u, skirt + 1.75, .02, 1.0, 1.1);
      lightPool(wall, u, skirt + 2.05, .01, 1.5, 2.1, .3);
    }
    for (let i = 0; i < 3; i++) { const l = new T.PointLight('#ffd9a8', 14, 8, 1.6); l.position.set(-r * .2, skirt + 2.6, -length / 2 + (i + .5) * length / 3); b.add(l); }
    b.updateWorldMatrix(true, false);
    const c = V(0, 0, 0).applyMatrix4(b.matrixWorld);
    solids.push({x: c.x, z: c.z, w: 2 * r + .6, d: length + .4, angle: yaw});
    return b;
  }
  function done(spec) {
    // Indoors the fog only thickens the water outside; the rooms themselves stay clear.
    if (spec.indoor) group.traverse(o => { for (const m of [].concat(o.material || [])) if (!m.userData.sea && m.fog !== undefined) m.fog = false; });
    const right = V(), up = V(), fwd = V();
    spec.animate = (t, cam) => {
      cam.matrixWorld.extractBasis(right, up, fwd); cam.right = right;
      for (const f of animators) f(t, cam);
    };
    return {...spec, solids, targets};
  }
  return {T, TH, L, PI, TAU, rand, between, V, grp, mesh, plane, box, surface, photo, photoPlane, glow, cover, label,
    wall, fit, extent, framedArt, framedCover, solids, targets, animators, seaWindows, solidFrom,
    grower, school, pick, seaBeyondWindows, bigVisitors, seabed, caustics, shafts, drift, done, LIFE, croppedPlane,
    rock, reefBank, seaSurface, standee, plinthVase, chair, wallBench, pathDressing, gasketPost, waterSurface, snowCurtains,
    hallArchiveWall, doorCover, matte, vault, tubeBuilding, polish, cove, lightPool, track, causticize, meterUV, big, small};
}
