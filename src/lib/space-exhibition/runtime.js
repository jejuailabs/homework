// Space-mode exhibition runtime: exterior arrival, then one gallery per page of
// works. Adapted from the "궤도 위 미술관" design kit; the scene builders
// (arrival.js, room.js, photo-character.js) are kept as designed.
// The host page owns every visible control; this module only renders and moves.
import {buildArrival} from './arrival.js';
import {buildRoom} from './room.js';
import {createPhotoCharacter} from './photo-character.js';

/** Frames per gallery besides the main slide. */
export const SPACE_PAGE_SIZE = 24;
const HERO_INTERVAL = 7000;
const keyActions = {KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyQ:'turn-left',KeyE:'turn-right'};

/**
 * @param {{T:any, host:HTMLElement, theme:'earth'|'moon'|'saturn', images:Record<string,string>, cat:{url:string, rects:any},
 *   artworks:{id:string,title:string,image:string,hero:string,width?:number,height?:number}[], english?:boolean,
 *   isActive:()=>boolean, onState:(state:any)=>void, onSelect:(id:string)=>void, onExit:()=>void}} options
 */
export function createSpaceRuntime(options) {
  const {T, host, theme, images, cat, artworks, english = false} = options;
  const pageCount = Math.max(1, Math.ceil(artworks.length / SPACE_PAGE_SIZE));
  const pressed = new Set();
  const pos = new T.Vector2(), aimPoint = new T.Vector3();
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  const clock = {then: 0, walk: 0, actionCheck: 0, eDown: 0};
  const introPosition = new T.Vector3(), introRotation = new T.Quaternion();
  let renderer, scene, camera, player, playerTexture, hemisphere, sun;
  let stage = 'exterior', page = 0, heroIndex = 0, heroTimer = 0;
  let stageGroup = null, spec = null, resource = null, targetByObject = null, rayObjects = [], nearby = null;
  let yaw = 0, tilt = -.08, actorYaw = Math.PI, pointer = null, raf = 0, lastMoving = false;
  let needsFrame = false, pendingAssets = 0, loadVersion = 0, disposed = false, failed = false;
  let stick = {x: 0, y: 0}, intro = null;
  const listeners = [];
  const on = (target, type, fn, opts) => {target.addEventListener(type, fn, opts); listeners.push(() => target.removeEventListener(type, fn, opts));};

  const roomArtworks = () => {
    const slice = artworks.slice(page * SPACE_PAGE_SIZE, (page + 1) * SPACE_PAGE_SIZE);
    return artworks.length ? [artworks[heroIndex % artworks.length], ...slice] : [];
  };
  let roomArt = [];
  function nearbyLabel() {
    if (!nearby) return null;
    if (nearby.kind === 'art') return {kind: 'art', title: roomArt[nearby.index]?.title || '', id: roomArt[nearby.index]?.id || ''};
    return {kind: nearby.kind};
  }
  function emit() {
    options.onState({stage, page, pageCount, loading: pendingAssets > 0, failed, nearby: nearbyLabel(),
      hero: artworks.length ? {index: heroIndex % artworks.length, total: artworks.length} : null});
  }
  function headingDifference(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function paused() { return disposed || !options.isActive(); }
  function clearInput() { pressed.clear(); stick = {x: 0, y: 0}; pointer = null; clock.eDown = 0; }
  function schedule() {
    needsFrame = true;
    if (!raf && renderer && stageGroup && !document.hidden && !paused()) raf = requestAnimationFrame(frame);
  }
  function startRenderer() {
    if (renderer) return;
    renderer = new T.WebGLRenderer({antialias: true, alpha: false, powerPreference: 'high-performance'});
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', english ? 'Space gallery. Drag to look around, arrow keys to walk.' : '우주 전시 공간. 화면을 끌어 둘러보고 방향키로 걸어 보세요.');
    host.appendChild(canvas);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(52, 1, .045, 500);
    hemisphere = new T.HemisphereLight(0xf1f5ff, 0xa69b94, 1.5);
    sun = new T.DirectionalLight(0xffefda, 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {left: -26, right: 26, top: 26, bottom: -26, far: 145, near: .5});
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -.00035;
    sun.shadow.normalBias = .025;
    scene.add(hemisphere, sun, sun.target);
    const loader = new T.TextureLoader(); loader.setCrossOrigin('anonymous');
    playerTexture = loader.load(cat.url, schedule);
    playerTexture.colorSpace = T.SRGBColorSpace;
    player = createPhotoCharacter(T, playerTexture, {kind: 'cat', height: 1.01, rects: cat.rects, blendMs: 60});
    scene.add(player.group);
    on(canvas, 'webglcontextlost', event => { event.preventDefault(); failed = true; emit(); });
    on(canvas, 'webglcontextrestored', () => { failed = false; renderer.shadowMap.needsUpdate = true; emit(); schedule(); });
    bindSurface(canvas);
    resize();
  }
  function resize() {
    if (!renderer) return;
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    schedule();
  }
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(host);

  function stageContext(group) {
    const textures = new Map(), materials = new Map(), generated = new Set();
    const loader = new T.TextureLoader(); loader.setCrossOrigin('anonymous');
    const version = loadVersion;
    const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    function finished() {
      if (version !== loadVersion || disposed) return;
      pendingAssets = Math.max(0, pendingAssets - 1);
      if (!pendingAssets) { renderer.shadowMap.needsUpdate = true; emit(); }
      schedule();
    }
    function textureFrom(url, sizes) {
      if (!url) return null;
      if (!textures.has(url)) {
        pendingAssets++;
        const texture = loader.load(url, finished, undefined, finished);
        texture.colorSpace = T.SRGBColorSpace;
        texture.anisotropy = anisotropy;
        if (sizes?.width > 0 && sizes?.height > 0) { texture.userData.sourceWidth = sizes.width; texture.userData.sourceHeight = sizes.height; }
        textures.set(url, texture);
      }
      return textures.get(url);
    }
    function tex(key) { return textureFrom(images[key]); }
    function mat(key, repeatX = 1, repeatY = 1) {
      const id = [key, repeatX, repeatY].join('|');
      if (!materials.has(id)) {
        let map = tex(key);
        if (map && (repeatX !== 1 || repeatY !== 1)) {
          map = map.clone();
          map.wrapS = map.wrapT = T.RepeatWrapping;
          map.repeat.set(repeatX, repeatY);
          map.needsUpdate = true;
          generated.add(map);
        }
        materials.set(id, new T.MeshStandardMaterial({map, roughness: .78, metalness: .04}));
      }
      return materials.get(id);
    }
    function label(text, opts = {}) {
      const canvas = document.createElement('canvas');
      canvas.width = opts.width || 512;
      canvas.height = opts.height || 80;
      const ctx = canvas.getContext('2d');
      const background = opts.background || opts.bg;
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.fillStyle = opts.color || '#242321';
      ctx.font = opts.font || ('600 ' + Math.round(canvas.height * .57) + 'px "Malgun Gothic",sans-serif');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * .95);
      const map = new T.CanvasTexture(canvas);
      map.colorSpace = T.SRGBColorSpace; generated.add(map);
      const material = new T.MeshBasicMaterial({map, transparent: true, depthWrite: false, toneMapped: false, side: T.DoubleSide});
      generated.add(material);
      return material;
    }
    // Index 0 is the main slide and uses the full image; other frames use thumbnails.
    const artTex = index => { const work = roomArt[index]; return work ? textureFrom(index === 0 ? work.hero : work.image, work) : null; };
    // The exterior windows show the exhibition's own works.
    const coverTex = index => { const work = artworks.length ? artworks[index % artworks.length] : null; return work ? textureFrom(work.image, work) : null; };
    const ctx = {T, group, theme, stage, page, rooms: [], art: roomArt, tex, mat, label, artTex, coverTex, exitLabel: english ? 'Entrance' : '입구로',
      heroTexture: work => textureFrom(work.hero, work)};
    const dispose = () => {
      const geoms = new Set(), mats = new Set(materials.values()), maps = new Set(textures.values());
      for (const value of generated) { if (value.isTexture) maps.add(value); else if (value.isMaterial) mats.add(value); }
      group.traverse(obj => {
        if (obj.geometry) geoms.add(obj.geometry);
        if (obj.isInstancedMesh) obj.dispose();
        if (obj.material) for (const material of [].concat(obj.material)) mats.add(material);
        if (obj.isLight && obj.shadow) obj.shadow.dispose();
      });
      for (const m of mats) { for (const v of Object.values(m)) if (v?.isTexture) maps.add(v); m.dispose(); }
      for (const g of geoms) g.dispose();
      for (const map of maps) map.dispose();
    };
    return {ctx, dispose};
  }
  function instanceRepeats(group, originalMeshes) {
    const batches = new Map();
    for (const mesh of originalMeshes) {
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.children.length || Array.isArray(mesh.material) ||
          mesh.material.transparent || targetByObject.has(mesh) || !mesh.visible || mesh.matrixWorld.determinant() <= 0) continue;
      const key = [mesh.geometry.uuid, mesh.material.uuid, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder].join('|');
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(mesh);
    }
    const inverse = new T.Matrix4().copy(group.matrixWorld).invert(), matrix = new T.Matrix4();
    for (const meshes of batches.values()) {
      if (meshes.length < 4) continue;
      const first = meshes[0], batch = new T.InstancedMesh(first.geometry, first.material, meshes.length);
      batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow; batch.renderOrder = first.renderOrder;
      meshes.forEach((mesh, index) => { batch.setMatrixAt(index, matrix.multiplyMatrices(inverse, mesh.matrixWorld)); mesh.removeFromParent(); });
      batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere(); group.add(batch);
    }
    // The detached originals stay in rayObjects: picking uses their exact world matrices.
  }
  function releaseStage() {
    clearInput(); nearby = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    clearInterval(heroTimer); heroTimer = 0;
    if (!stageGroup) return;
    scene.background = null;
    stageGroup.removeFromParent(); resource.dispose();
    stageGroup = null; spec = null; rayObjects = []; targetByObject = null; resource = null;
    renderer.renderLists.dispose();
  }
  function lighting(ctx) {
    const outdoor = stage === 'exterior';
    const sky = ctx.tex('sky');
    if (sky) { sky.mapping = T.EquirectangularReflectionMapping; scene.background = sky; }
    else scene.background = new T.Color('#101620');
    scene.backgroundIntensity = spec.skyIntensity ?? (outdoor ? .98 : .8);
    scene.backgroundRotation.set(...(spec.skyRotation || [0, 0, 0]));
    hemisphere.color.set(outdoor ? '#dfe8ff' : '#fffbf4');
    hemisphere.groundColor.set(theme === 'moon' ? '#acaeb9' : '#b7aea3');
    hemisphere.intensity = outdoor ? 1.48 : 1.69;
    sun.color.set(theme === 'saturn' ? '#fff0d6' : '#fff4e9');
    sun.intensity = outdoor ? 2.35 : 1.32;
    sun.position.set(-14, 25, 10);
    renderer.shadowMap.needsUpdate = true;
  }
  function reset() {
    if (!spec) return;
    pos.set(spec.spawn[0], spec.spawn[1]);
    yaw = spec.yaw ?? 0; actorYaw = Math.PI - yaw;
    tilt = spec.camera?.pitch ?? (stage === 'exterior' ? -.085 : -.057);
    clock.then = 0; clock.walk = 0; clock.actionCheck = 0;
    intro = spec.establishing ? {mode: 'overview', at: 0} : null;
    clearInput(); schedule();
  }
  function registerTarget(target) {
    target.center = new T.Box3().setFromObject(target.mesh).getCenter(new T.Vector3());
    targetByObject.set(target.mesh, target);
    target.mesh.traverse?.(obj => { targetByObject.set(obj, target); if (obj.isMesh) rayObjects.push(obj); });
  }
  function advanceHero() {
    if (stage !== 'gallery' || !spec?.swapHero || artworks.length < 2 || paused()) return;
    heroIndex = (heroIndex + 1) % artworks.length;
    const work = artworks[heroIndex];
    roomArt[0] = work;
    const old = spec.targets.find(target => target.kind === 'art' && target.index === 0);
    const next = spec.swapHero(resource.ctx.heroTexture(work), work);
    if (!next) return;
    if (old) {
      const retired = new Set();
      old.mesh.removeFromParent();
      old.mesh.traverse(obj => {
        retired.add(obj); targetByObject.delete(obj);
        if (obj.geometry && obj.geometry.type !== 'BoxGeometry' && obj.geometry.type !== 'PlaneGeometry') obj.geometry.dispose();
        if (obj.isMesh && obj.material?.isMeshBasicMaterial) obj.material.dispose();
      });
      rayObjects = rayObjects.filter(obj => !retired.has(obj));
      spec.targets = spec.targets.filter(target => target !== old);
    }
    next.mesh.updateMatrixWorld(true);
    spec.targets.push(next); registerTarget(next);
    renderer.shadowMap.needsUpdate = true;
    if (nearby === old) nearby = null;
    emit(); schedule();
  }
  function enter(nextStage) {
    releaseStage(); loadVersion++; pendingAssets = 0;
    stage = nextStage;
    try {
      startRenderer(); resize();
      roomArt = stage === 'gallery' ? roomArtworks() : [];
      stageGroup = new T.Group();
      scene.add(stageGroup);
      resource = stageContext(stageGroup);
      spec = stage === 'gallery' ? buildRoom(resource.ctx) : buildArrival(resource.ctx, 'exterior');
      spec.targets ??= []; spec.solids ??= [];
      for (const solid of spec.solids) { solid.cos = Math.cos(solid.angle || 0); solid.sin = Math.sin(solid.angle || 0); }
      stageGroup.updateMatrixWorld(true);
      targetByObject = new Map();
      stageGroup.traverse(obj => { if (obj.isMesh || obj.isSprite) rayObjects.push(obj); });
      for (const target of spec.targets) {
        target.center = new T.Box3().setFromObject(target.mesh).getCenter(new T.Vector3());
        targetByObject.set(target.mesh, target);
        target.mesh.traverse?.(obj => targetByObject.set(obj, target));
      }
      instanceRepeats(stageGroup, [...rayObjects]);
      lighting(resource.ctx); reset();
      if (stage === 'gallery' && artworks.length > 1) heroTimer = setInterval(advanceHero, HERO_INTERVAL);
      failed = false;
    } catch (error) {
      console.error(error);
      failed = true;
    }
    emit(); schedule();
  }
  function back() {
    if (stage === 'gallery') enter('exterior');
    else options.onExit();
  }
  function setPage(next) {
    const clamped = Math.max(0, Math.min(pageCount - 1, next));
    if (clamped === page && stage === 'gallery') return;
    page = clamped; enter('gallery');
  }
  function activate(target) {
    if (!target) return;
    if (target.kind === 'enter') enter('gallery');
    else if (target.kind === 'art') { const work = roomArt[target.index]; if (work) { clearInput(); options.onSelect(work.id); } }
    else if (target.kind === 'back') back();
  }
  function insideSolid(x, z, solid, margin) {
    const dx = x - solid.x, dz = z - solid.z, c = solid.cos, s = solid.sin;
    const u = c * dx - s * dz, v = s * dx + c * dz;
    const ox = Math.max(Math.abs(u) - solid.w * .5, 0), oz = Math.max(Math.abs(v) - solid.d * .5, 0);
    return ox * ox + oz * oz < margin * margin;
  }
  function legal(x, z) {
    const b = spec.bounds, r = .23;
    return x >= b[0] + r && x <= b[1] - r && z >= b[2] + r && z <= b[3] - r && !spec.solids.some(s => insideSolid(x, z, s, r));
  }
  function walk(dt, side, forward) {
    if (!side && !forward) return false;
    const length = Math.max(1, Math.hypot(side, forward));
    const step = dt * (stage === 'exterior' ? 3.15 : 2.65) / length;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const dx = (cos * side + sin * forward) * step, dz = (sin * side - cos * forward) * step;
    const oldX = pos.x, oldZ = pos.y;
    if (legal(pos.x + dx, pos.y + dz)) pos.set(pos.x + dx, pos.y + dz);
    else { if (legal(pos.x + dx, pos.y)) pos.x += dx; if (legal(pos.x, pos.y + dz)) pos.y += dz; }
    if (Math.abs(oldX - pos.x) + Math.abs(oldZ - pos.y) < .00001) return false;
    const heading = Math.atan2(pos.x - oldX, pos.y - oldZ);
    actorYaw += headingDifference(heading, actorYaw) * (1 - Math.exp(-16 * dt));
    return true;
  }
  function solidRayDistance(x, z, vx, vz, solid, maxDist) {
    const c = solid.cos, s = solid.sin, dx = x - solid.x, dz = z - solid.z;
    const origins = [c * dx - s * dz, s * dx + c * dz], dirs = [c * vx - s * vz, s * vx + c * vz];
    const halves = [solid.w * .5 + .105, solid.d * .5 + .105];
    let near = 0, far = maxDist;
    for (let axis = 0; axis < 2; axis++) {
      const p = origins[axis], v = dirs[axis], half = halves[axis];
      if (Math.abs(v) < .00001) { if (Math.abs(p) > half) return maxDist; }
      else {
        const a = (-half - p) / v, b = (half - p) / v;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        if (far < near) return maxDist;
      }
    }
    return near > .015 ? Math.min(maxDist, near - .055) : maxDist;
  }
  function leaveOverview(now) {
    if (intro?.mode !== 'overview') return;
    introPosition.copy(camera.position); introRotation.copy(camera.quaternion);
    intro = {mode: 'transition', at: now, fov: camera.fov};
  }
  function adjustCamera(now) {
    const opts = spec.camera || {};
    const narrow = camera.aspect < .82, outdoor = stage === 'exterior';
    if (intro?.mode === 'overview') {
      const framing = spec.establishing;
      camera.position.fromArray(framing.position);
      aimPoint.fromArray(framing.lookAt);
      const baseFov = framing.fov || 43;
      camera.fov = baseFov + (narrow ? 14 : 0);
      if (narrow) {
        const fit = Math.max(1, 1.28 / camera.aspect * Math.tan(baseFov * Math.PI / 360) / Math.tan(camera.fov * Math.PI / 360));
        camera.position.sub(aimPoint).multiplyScalar(Math.min(2.5, fit)).add(aimPoint);
      }
      camera.lookAt(aimPoint);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      player.group.visible = true;
      return;
    }
    const desired = (opts.distance ?? (outdoor ? 4.8 : 3.75)) * (narrow ? 1.08 : 1);
    const vx = -Math.sin(yaw), vz = Math.cos(yaw), b = spec.bounds;
    let dist = desired;
    if (!outdoor) for (const [p, v, lo, hi] of [[pos.x, vx, b[0], b[1]], [pos.y, vz, b[2], b[3]]]) {
      if (v > .00001) dist = Math.min(dist, (hi - .12 - p) / v);
      if (v < -.00001) dist = Math.min(dist, (lo + .12 - p) / v);
    }
    for (const solid of spec.solids) dist = solidRayDistance(pos.x, pos.y, vx, vz, solid, dist);
    dist = Math.max(.08, dist);
    const ratio = Math.min(1, dist / desired);
    const height = opts.height ?? (outdoor ? 2.00 : 1.65);
    camera.position.set(pos.x + vx * dist, 1.30 + (height - 1.30) * ratio, pos.y + vz * dist);
    camera.rotation.set(tilt, -yaw, 0, 'YXZ');
    let fov = (opts.fov ?? (outdoor ? 54 : 51)) + (narrow ? 9 : 0) + (1 - ratio) * 6;
    if (intro?.mode === 'transition') {
      const t = Math.min(1, (now - intro.at) / 760), easing = t * t * (3 - 2 * t);
      camera.position.lerp(introPosition, 1 - easing);
      camera.quaternion.slerp(introRotation, 1 - easing);
      fov = intro.fov + (fov - intro.fov) * easing;
      if (t >= 1) intro = null;
    }
    if (Math.abs(camera.fov - fov) > .025) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    player.group.visible = dist > 1.04;
  }
  function isVisibleMesh(object) { for (let obj = object; obj; obj = obj.parent) if (!obj.visible) return false; return true; }
  function objectHitTarget() {
    const hits = ray.intersectObjects(rayObjects, false);
    let opaque = Infinity;
    for (const hit of hits) {
      const obj = hit.object;
      if (!isVisibleMesh(obj)) continue;
      if (hit.distance > opaque + .075) return null;
      const target = targetByObject.get(obj);
      if (target) return target;
      const m = Array.isArray(obj.material) ? obj.material[hit.face?.materialIndex ?? 0] : obj.material;
      if (m && (m.visible === false || m.depthWrite === false || m.transparent && m.opacity < .65)) continue;
      opaque = Math.min(opaque, hit.distance);
    }
    return null;
  }
  function selectPoint(clientX, clientY) {
    if (!spec) return;
    const r = host.getBoundingClientRect();
    ndc.set((clientX - r.left) / r.width * 2 - 1, 1 - (clientY - r.top) / r.height * 2);
    ray.setFromCamera(ndc, camera);
    activate(objectHitTarget());
  }
  function proximity() {
    let chosen = null, best = Infinity;
    for (const target of spec.targets) {
      const center = target.center;
      const range = target.kind === 'art' ? 3.6 : 4.0;
      const dx = center.x - pos.x, dz = center.z - pos.y, distance = Math.hypot(dx, dz);
      if (distance > range) continue;
      aimPoint.copy(center).project(camera);
      if (aimPoint.z > 1 || aimPoint.z < -1 || Math.abs(aimPoint.x) > 1.04 || Math.abs(aimPoint.y) > 1.08) continue;
      const score = distance + .85 * Math.abs(aimPoint.x);
      if (score >= best) continue;
      ndc.set(aimPoint.x, aimPoint.y); ray.setFromCamera(ndc, camera);
      if (objectHitTarget() === target) { chosen = target; best = score; }
    }
    if (chosen === nearby) return;
    nearby = chosen; emit();
  }
  function frame(now) {
    raf = 0;
    if (!spec || paused() || document.hidden) { clock.then = 0; return; }
    const dt = clock.then ? Math.min(.05, (now - clock.then) / 1000) : 1 / 60;
    clock.then = now; needsFrame = false;
    const actions = new Set([...pressed].map(code => keyActions[code]));
    if (pressed.has('KeyE') && now - clock.eDown < 220) actions.delete('turn-right');
    const side = Number(actions.has('right')) - Number(actions.has('left')) + stick.x;
    const forward = Number(actions.has('up')) - Number(actions.has('down')) + stick.y;
    const turn = Number(actions.has('turn-right')) - Number(actions.has('turn-left'));
    if (side || forward || turn) leaveOverview(now);
    yaw += turn * dt * 1.55;
    const moving = walk(dt, side, forward);
    if (moving) clock.walk += dt * 13;
    adjustCamera(now);
    player.group.position.set(pos.x, .008, pos.y);
    const eyeHeading = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.y);
    player.update(actorYaw - eyeHeading, clock.walk, moving, now);
    if (now - clock.actionCheck > 140 || !clock.actionCheck || !pressed.size && !stick.x && !stick.y) { clock.actionCheck = now; proximity(); }
    renderer.render(scene, camera);
    host.dataset.stage = stage;
    host.dataset.ready = String(!!spec && !pendingAssets);
    if (needsFrame || pressed.size || stick.x || stick.y || moving || lastMoving || intro?.mode === 'transition') schedule();
    else clock.then = 0;
    lastMoving = moving;
  }
  function bindSurface(canvas) {
    on(canvas, 'pointerdown', e => {
      if (pointer || e.button !== 0 && e.pointerType === 'mouse') return;
      canvas.focus({preventScroll: true});
      pointer = {id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, drag: false};
      canvas.setPointerCapture(e.pointerId);
    });
    on(canvas, 'pointermove', e => {
      if (pointer?.id !== e.pointerId) { if (e.pointerType === 'mouse' && spec) canvasCursor(canvas, e); return; }
      const p = pointer;
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 5) p.drag = true;
      if (p.drag) {
        leaveOverview(performance.now());
        yaw -= (e.clientX - p.x) * .0052;
        tilt = T.MathUtils.clamp(tilt + (e.clientY - p.y) * .0036, -.88, .75);
        canvas.style.cursor = 'grabbing';
        schedule();
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    on(canvas, 'pointerup', e => {
      if (pointer?.id !== e.pointerId) return;
      const tap = !pointer.drag;
      pointer = null; canvas.style.cursor = 'grab';
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (tap) selectPoint(e.clientX, e.clientY);
    });
    on(canvas, 'pointercancel', () => { pointer = null; });
    on(canvas, 'lostpointercapture', () => { pointer = null; });
  }
  let cursorCheck = 0;
  function canvasCursor(canvas, e) {
    const now = performance.now();
    if (now - cursorCheck < 90) return;
    cursorCheck = now;
    const r = host.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2);
    ray.setFromCamera(ndc, camera);
    canvas.style.cursor = objectHitTarget() ? 'pointer' : 'grab';
  }
  const typing = target => target?.matches?.('input,textarea,select') || target?.isContentEditable;
  on(window, 'keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || paused() || typing(e.target)) return;
    if (e.key === 'Enter' && (e.target === renderer?.domElement || e.target === document.body)) { e.preventDefault(); if (!e.repeat) activate(nearby); return; }
    if (!keyActions[e.code]) return;
    if (e.code === 'KeyE' && !pressed.has('KeyE')) clock.eDown = performance.now();
    pressed.add(e.code); e.preventDefault(); schedule();
  });
  on(window, 'keyup', e => {
    const used = pressed.delete(e.code);
    if (!used) return;
    if (e.code === 'KeyE' && clock.eDown && performance.now() - clock.eDown < 220) activate(nearby);
    schedule();
  });
  on(window, 'blur', clearInput);
  on(document, 'visibilitychange', () => { clearInput(); clock.then = 0; if (!document.hidden) schedule(); });

  enter('exterior');
  return {
    enterGallery: () => enter('gallery'),
    back, reset, setPage: delta => setPage(page + delta),
    activateNearby: () => activate(nearby),
    turn: direction => { leaveOverview(performance.now()); yaw += direction * .25; schedule(); },
    setStick: (x, y) => { stick = {x, y: -y}; if (x || y) leaveOverview(performance.now()); schedule(); },
    refresh: () => { if (paused()) clearInput(); clock.then = 0; schedule(); },
    dispose: () => {
      disposed = true;
      releaseStage();
      resizeObserver?.disconnect();
      for (const off of listeners.splice(0)) off();
      if (renderer) {
        playerTexture?.dispose();
        player?.group.traverse(obj => { obj.geometry?.dispose(); for (const m of [].concat(obj.material || [])) { m.map?.dispose(); m.dispose(); } });
        renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove();
      }
    },
  };
}
