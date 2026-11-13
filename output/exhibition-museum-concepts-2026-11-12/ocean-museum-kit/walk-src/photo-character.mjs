// yawRelative: 0 toward camera, +π/2 toward screen right, π away, -π/2 left.
// Source rectangles use top-left-origin normalized atlas coordinates by default.
// rects: [[{u0,v0,u1,v1,aspect}, ...], ...] or {front:[...],right:[...],rear:[...],left:[...]}.
const VIEW = ['front', 'right', 'rear', 'left'];
const quarter = Math.PI / 2;
const tau = Math.PI * 2;

function nearestView(angle, current) {
  if (!Number.isFinite(angle)) return current;
  const delta = angle - current * quarter;
  const distance = Math.atan2(Math.sin(delta), Math.cos(delta));
  // Slightly overlapping sectors keep slow camera drags steady at the diagonals.
  if (Math.abs(distance) <= Math.PI / 4 + 0.055) return current;
  return (Math.round(angle / quarter) % 4 + 4) % 4;
}

function alphaContact(T, height) {
  const n = 48;
  const pixels = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const radius = ((x + 0.5) / n * 2 - 1) ** 2 + ((y + 0.5) / n * 2 - 1) ** 2;
      const i = (y * n + x) * 4;
      pixels[i] = 37; pixels[i + 1] = 31; pixels[i + 2] = 26;
      pixels[i + 3] = Math.round(255 * Math.exp(-3.4 * radius) * Math.max(0, 1 - radius));
    }
  }
  const map = new T.DataTexture(pixels, n, n);
  map.magFilter = T.LinearFilter;
  map.minFilter = T.LinearFilter;
  map.colorSpace = T.SRGBColorSpace;
  map.needsUpdate = true;
  const geometry = new T.PlaneGeometry(height * 0.80, height * 0.47);
  const material = new T.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.27,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.005;
  return { mesh, dispose() { geometry.dispose(); material.dispose(); map.dispose(); } };
}

function fromMetadata(rects, isGuide, direction, frame, row, col) {
  if (!rects) return undefined;
  if (Array.isArray(rects)) {
    // Guide: either a 1x4 row or a flat array of four single portraits.
    if (isGuide && rects[0]?.u0 !== undefined) return rects[col];
    return rects[row]?.[col];
  }
  const rowMeta = rects[VIEW[direction]] || rects[row];
  if (rowMeta?.u0 !== undefined) return rowMeta;
  return rowMeta?.[isGuide && rects[VIEW[direction]] ? 0 : isGuide ? col : frame];
}

/** Does not dispose the given atlas, which can be shared by multiple characters.
 * config.kind: 'cat' (4x4), 'guide' (1x4). config.height in scene units.
 * Optional config.rects, origin:'bottom-left', blendMs, shadow:false.
 * update's optional fourth argument is a monotonic time in milliseconds.
 */
export function createPhotoCharacter(T, texture, config = {}) {
  const isGuide = config.kind === 'guide';
  const height = config.height > 0 ? config.height : isGuide ? 1.05 : 1.0;
  const group = new T.Group();
  group.name = isGuide ? '모아' : '모찌';
  const contact = config.shadow === false ? null : alphaContact(T, height);
  if (contact) group.add(contact.mesh);
  const rows = isGuide ? 1 : 4;
  const columns = 4;
  let imageWidth = 0, imageHeight = 0;
  function layer() {
    const map = texture.clone();
    map.colorSpace = T.SRGBColorSpace;
    map.wrapS = map.wrapT = T.ClampToEdgeWrapping;
    // Atlas bounds can touch. Filtering across mip levels would pull in other poses.
    map.generateMipmaps = false;
    map.minFilter = map.magFilter = T.LinearFilter;
    const material = new T.SpriteMaterial({
      map, transparent: true, depthWrite: false, alphaTest: 0.012, toneMapped: false,
    });
    const sprite = new T.Sprite(material);
    sprite.center.set(0.5, 0);
    group.add(sprite);
    return { sprite, material, map, direction: -1, frame: -1, aspect: 1 };
  }
  let active = layer(), previous = layer();
  previous.sprite.visible = false;
  let direction = 0;
  let transitionAt = -Infinity;
  const blendMs = Math.max(0, config.blendMs ?? 88);

  function assign(view, dir, frame) {
    const row = isGuide ? 0 : dir, col = isGuide ? dir : frame;
    const rect = fromMetadata(config.rects, isGuide, dir, frame, row, col);
    let u0 = col / columns, u1 = (col + 1) / columns;
    let top = row / rows, bottom = (row + 1) / rows;
    if (rect && rect.u1 > rect.u0 && rect.v1 > rect.v0) {
      u0 = rect.u0; u1 = rect.u1;
      top = config.origin === 'bottom-left' ? 1 - rect.v1 : rect.v0;
      bottom = config.origin === 'bottom-left' ? 1 - rect.v0 : rect.v1;
    }
    view.aspect = rect?.aspect > 0 ? rect.aspect : imageWidth / imageHeight * (u1 - u0) / (bottom - top);
    if (!Number.isFinite(view.aspect) || view.aspect <= 0) view.aspect = 0.72;
    view.map.repeat.set(u1 - u0, bottom - top);
    view.map.offset.set(u0, 1 - bottom);
    view.map.updateMatrix();
    view.direction = dir; view.frame = frame;
  }

  function update(yawRelative = 0, walkPhase = 0, moving = false, now = performance.now()) {
    const image = texture.image;
    const w = image?.naturalWidth || image?.videoWidth || image?.width || 0;
    const h = image?.naturalHeight || image?.videoHeight || image?.height || 0;
    if (w !== imageWidth || h !== imageHeight) {
      imageWidth = w; imageHeight = h;
      for (const view of [active, previous]) {
        view.map.needsUpdate = true;
        if (view.direction >= 0) assign(view, view.direction, view.frame);
      }
    }
    const phase = Number.isFinite(walkPhase) ? ((walkPhase % tau) + tau) % tau : 0;
    const walking = moving && !isGuide;
    const frame = walking ? Math.floor(phase / quarter) % columns : 0;
    const next = nearestView(yawRelative, direction);
    if (next !== direction && active.direction >= 0) {
      [previous, active] = [active, previous];
      previous.sprite.renderOrder = 1;
      active.sprite.renderOrder = 2;
      transitionAt = now;
    }
    direction = next;
    if (active.direction !== direction || active.frame !== frame) assign(active, direction, frame);
    const elapsed = now - transitionAt;
    const t = blendMs ? Math.max(0, Math.min(1, elapsed / blendMs)) : 1;
    const mix = t * t * (3 - 2 * t);
    previous.sprite.visible = mix < 1 && previous.direction >= 0;
    previous.material.opacity = 1 - mix;
    active.sprite.visible = true;
    active.material.opacity = mix;
    // Squash a few millimeters into a step. Both silhouettes keep the foot anchor.
    const scale = walking ? 1 - 0.008 * (1 - Math.cos(phase * 2)) / 2 : 1;
    active.sprite.scale.set(height * active.aspect, height * scale, 1);
    previous.sprite.scale.set(height * previous.aspect, height * scale, 1);
  }
  function dispose() {
    group.removeFromParent();
    for (const view of [active, previous]) {
      view.material.dispose();
      view.map.dispose();
    }
    contact?.dispose();
  }
  update();
  return { group, height, update, dispose };
}
