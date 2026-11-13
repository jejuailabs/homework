(() => {
  const $ = id => document.getElementById(id);
  const world = $("world");
  const url = path => BUNDLE.images[path] || path;
  for (const art of BUNDLE.artworks) art.image = url(art.image);
  const catalog = BUNDLE.rooms;
  const artById = new Map(BUNDLE.artworks.map(art => [String(art.id), art]));
  const roomArt = catalog.map(room => room.artIds.map(id => artById.get(String(id))).filter(Boolean));
  // The archive room hangs each museum's own sheets, masters and references.
  const archiveIndex = catalog.findIndex(room => room.id === "archive");
  function useArchive(key) { if (archiveIndex >= 0) roomArt[archiveIndex] = (BUNDLE.archive[key] || []).map(id => artById.get(id)).filter(Boolean); }
  const themes = BUNDLE.themes;
  const groupSize = 5;
  const pageCount = Math.ceil(catalog.length / groupSize);
  const keyActions = {KeyW:"up",ArrowUp:"up",KeyS:"down",ArrowDown:"down",KeyA:"left",ArrowLeft:"left",KeyD:"right",ArrowRight:"right",KeyQ:"turn-left",KeyE:"turn-right"};
  const pressed = new Set();
  const touchSteps = new Map();
  const pos = new T.Vector2(), aimPoint = new T.Vector3(), hitPoint = new T.Vector3();
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  const clock = { then:0, walk:0, actionCheck:0, eDown:0 };
  const dialogs = [...document.querySelectorAll("dialog")];
  let renderer, scene, camera, player, playerTexture, hemisphere, sun;
  let theme = null, stage = "selector", page = 0, room = 0, currentArt = 0;
  let stageGroup, spec, resource, targetByObject, rayObjects = [], nearby = null;
  let yaw = 0, tilt = -.08, actorYaw = Math.PI, pointer = null, raf = 0, lastMoving = false;
  let needsFrame = false, pendingAssets = 0, loadVersion = 0;
  const introPosition = new T.Vector3(), introRotation = new T.Quaternion();
  let intro = null;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function headingDifference(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function anyDialog() { return dialogs.some(dialog => dialog.open); }
  function clearInput() { pressed.clear(); touchSteps.clear(); pointer = null; clock.eDown = 0; }
  function schedule() {
    needsFrame = true;
    if (!raf && renderer && stageGroup && !document.hidden && !anyDialog()) raf = requestAnimationFrame(frame);
  }
  function showStatus(text) {
    $("loading").textContent = text;
    $("loading").hidden = !text;
  }
  function startRenderer() {
    if (renderer) return;
    renderer = new T.WebGLRenderer({ antialias:true, alpha:false, powerPreference:"high-performance" });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    world.appendChild(renderer.domElement);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(52, 1, .045, 500);
    hemisphere = new T.HemisphereLight(0xf1f5ff,0xa69b94,1.5);
    sun = new T.DirectionalLight(0xffefda,2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-26,right:26,top:26,bottom:-26,far:145,near:.5});
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -.00035;
    sun.shadow.normalBias = .025;
    scene.add(hemisphere,sun,sun.target);
    const atlasUrl = url(BUNDLE.cat);
    playerTexture = new T.TextureLoader().load(atlasUrl,schedule);
    playerTexture.colorSpace = T.SRGBColorSpace;
    player = createPhotoCharacter(T,playerTexture,{kind:"cat",height:1.01,rects:BUNDLE.cutouts?.cat?.rects,blendMs:60});
    scene.add(player.group);
    world.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      showStatus("3D 화면을 다시 연결하고 있습니다.");
    },true);
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      showStatus(""); renderer.shadowMap.needsUpdate = true; schedule();
    });
    bindSurface();
    resize();
  }
  function resize() {
    if (!renderer || $("explorer").hidden) return;
    const width = world.clientWidth, height = world.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5));
    renderer.setSize(width,height,false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    schedule();
  }
  window.addEventListener("resize",resize);
  function roomLabel(index) { return catalog[index]?.title || "전시실"; }
  function stageContext(group) {
    const images = themes[theme].images;
    const textures = new Map(), materials = new Map(), generated = new Set();
    const loader = new T.TextureLoader();
    const version = loadVersion;
    const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(),8);
    function finished() {
      if (version !== loadVersion) return;
      pendingAssets = Math.max(0,pendingAssets-1);
      world.dataset.pending = String(pendingAssets);
      if (!pendingAssets) {
        renderer.shadowMap.needsUpdate = true;
        showStatus("");
      }
      schedule();
    }
    function textureFrom(source, repeat = false, linear = false) {
      if (!source) return null;
      const id = (repeat ? "r:" : "c:") + (linear ? "l:" : "") + source.length + ":" + source.slice(-48);
      if (!textures.has(id)) {
        pendingAssets++;
        world.dataset.pending = String(pendingAssets);
        const texture = loader.load(url(source),finished,undefined,finished);
        texture.colorSpace = linear ? T.NoColorSpace : T.SRGBColorSpace;
        texture.anisotropy = anisotropy;
        if (repeat) texture.wrapS = texture.wrapT = T.RepeatWrapping;
        textures.set(id,texture);
      }
      return textures.get(id);
    }
    function tex(key) { return textureFrom(images[key]); }
    function tile(key, linear) { return textureFrom(images[key], true, linear); }
    function mat(key, repeatX = 1, repeatY = 1) {
      const id = [key,repeatX,repeatY].join("|");
      if (!materials.has(id)) {
        let map = tex(key);
        if (map && (repeatX !== 1 || repeatY !== 1)) {
          // Give each tiling its own transform while retaining the shared image Source.
          map = map.clone();
          map.wrapS = map.wrapT = T.RepeatWrapping;
          map.repeat.set(repeatX,repeatY);
          map.needsUpdate = true;
          generated.add(map);
        }
        const material = new T.MeshStandardMaterial({map,roughness:.78,metalness:.04});
        materials.set(id,material);
      }
      return materials.get(id);
    }
    function label(text, options = {}) {
      const canvas = document.createElement("canvas");
      canvas.width = options.width || 512;
      canvas.height = options.height || 80;
      const ctx = canvas.getContext("2d");
      const background = options.background || options.bg;
      if (background) { ctx.fillStyle = background; ctx.fillRect(0,0,canvas.width,canvas.height); }
      ctx.fillStyle = options.color || "#242321";
      ctx.font = options.font || ('600 ' + Math.round(canvas.height*.57) + 'px "Malgun Gothic",sans-serif');
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text,canvas.width/2,canvas.height/2,canvas.width*.95);
      const map = new T.CanvasTexture(canvas);
      map.colorSpace = T.SRGBColorSpace; generated.add(map);
      const material = new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false,side:T.DoubleSide});
      generated.add(material);
      return material;
    }
    const art = roomArt[room];
    function coverTex(index) {
      const cover = roomArt[index]?.[0];
      const texture = textureFrom(cover?.image);
      if (texture && cover.width > 0 && cover.height > 0) {
        texture.userData.sourceWidth = cover.width;
        texture.userData.sourceHeight = cover.height;
      }
      return texture;
    }
    const ctx = {T,group,theme,stage,page,roomIndex:room,rooms:catalog,art,tex,tile,mat,label,
      img:(path,repeat,linear)=>textureFrom(path,repeat,linear),
      url:path=>url(path), imageUrl:key=>url(images[key]),
      renderer,
      size:key=>BUNDLE.sizes[images[key]],
      coverArt:index=>roomArt[index]?.[0],
      artTex:index=>textureFrom(art[index]?.image),
      coverTex};
    const dispose = () => {
      const geoms = new Set(), mats = new Set(materials.values()), maps = new Set(textures.values());
      for (const value of generated) {
        if (value.isTexture) maps.add(value);
        else if (value.isMaterial) mats.add(value);
      }
      group.traverse(obj => {
        if (obj.geometry) geoms.add(obj.geometry);
        if (obj.isInstancedMesh) obj.dispose();
        if (obj.material) for (const material of [].concat(obj.material)) mats.add(material);
        if (obj.isLight && obj.shadow) obj.shadow.dispose();
      });
      for (const m of mats) {
        for (const v of Object.values(m)) if (v?.isTexture) maps.add(v);
        m.dispose();
      }
      for (const g of geoms) g.dispose();
      for (const map of maps) map.dispose();
    };
    return {ctx,dispose};
  }
  function instanceRepeats(group,originalMeshes) {
    // Handrails, ribs and frame returns often repeat the same geometry and finish
    // hundreds of times. Keep original world-space meshes for precise CPU picking.
    const batches = new Map();
    for (const mesh of originalMeshes) {
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.children.length || Array.isArray(mesh.material) ||
          mesh.material.transparent || targetByObject.has(mesh) || !mesh.visible || mesh.matrixWorld.determinant() <= 0) continue;
      const key=[mesh.geometry.uuid,mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.renderOrder].join("|");
      if (!batches.has(key)) batches.set(key,[]);
      batches.get(key).push(mesh);
    }
    const inverse=new T.Matrix4().copy(group.matrixWorld).invert(), matrix=new T.Matrix4();
    for (const meshes of batches.values()) {
      if (meshes.length<4) continue;
      const first=meshes[0], batch=new T.InstancedMesh(first.geometry,first.material,meshes.length);
      batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;batch.renderOrder=first.renderOrder;
      meshes.forEach((mesh,index)=>{
        batch.setMatrixAt(index,matrix.multiplyMatrices(inverse,mesh.matrixWorld));
        mesh.removeFromParent();
      });
      batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();group.add(batch);
    }
  }
  function releaseStage() {
    clearInput(); nearby = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (!stageGroup) return;
    scene.background = null; scene.fog = null; scene.environment = null;
    stageGroup.removeFromParent(); resource.dispose();
    stageGroup = null; spec = null; rayObjects = []; targetByObject = null; resource = null;
    renderer.renderLists.dispose();
  }
  function lighting(ctx) {
    const outdoor = stage === "exterior", look = themes[theme].light;
    const sea = ctx.tex("panorama");
    if (sea) { sea.mapping = T.EquirectangularReflectionMapping; scene.background = sea; scene.environment = sea; scene.environmentIntensity = outdoor ? .7 : .55; }
    else scene.background = new T.Color(themes[theme].fog);
    scene.backgroundIntensity = outdoor ? look.sky : look.sky * .92;
    scene.backgroundRotation.set(0, outdoor ? 0 : .6, 0);
    scene.fog = outdoor ? new T.Fog(themes[theme].fog, look.fogNear, look.fogFar) : new T.Fog(themes[theme].fog, 4, look.fogFar * .8);
    hemisphere.color.set(outdoor ? look.hemi : "#fff8ee");
    hemisphere.groundColor.set(outdoor ? look.ground : "#c9b9a4");
    hemisphere.intensity = outdoor ? look.hemiPower : look.indoor;
    sun.color.set(look.sun);
    sun.intensity = outdoor ? look.sunPower : 1.1;
    sun.position.set(-8,26,9);
    renderer.toneMappingExposure = outdoor ? look.exposure : 1.02;
    renderer.shadowMap.needsUpdate = true;
  }
  function reset() {
    if (!spec) return;
    pos.set(spec.spawn[0],spec.spawn[1]);
    yaw = spec.yaw ?? 0; actorYaw = Math.PI - yaw;
    tilt = spec.camera?.pitch ?? (stage === "exterior" ? -.085 : -.057);
    clock.then = 0; clock.walk = 0; clock.actionCheck = 0;
    intro = spec.establishing ? {mode:"overview",at:0} : null;
    clearInput(); schedule();
  }
  function enter(nextStage, which = room) {
    for (const dialog of dialogs) if (dialog.open) dialog.close();
    releaseStage(); loadVersion++; pendingAssets = 0;
    stage = nextStage; room = which;
    if (nextStage === "gallery") page = Math.floor(which / groupSize);
    if (nextStage === "selector") {
      $("explorer").hidden = true; $("destinations").hidden = false;
      world.dataset.stage = "selector";
      document.querySelector('[data-theme="' + theme + '"]')?.focus({preventScroll:true});
      return;
    }
    $("destinations").hidden = true; $("explorer").hidden = false;
    showStatus("전시 공간을 여는 중…");
    world.dataset.stage = stage; world.dataset.room = String(room); world.dataset.page = String(page);
    world.dataset.theme = theme; world.dataset.pending = "0";
    try {
      startRenderer(); resize();
      stageGroup = new T.Group();
      scene.add(stageGroup);
      resource = stageContext(stageGroup);
      spec = stage === "gallery" ? buildRoom(resource.ctx) : buildArrival(resource.ctx,stage);
      spec.targets ??= []; spec.solids ??= [];
      for (const solid of spec.solids) {
        solid.cos = Math.cos(solid.angle || 0);
        solid.sin = Math.sin(solid.angle || 0);
      }
      stageGroup.updateMatrixWorld(true);
      for (const target of spec.targets) {
        target.center = new T.Box3().setFromObject(target.mesh).getCenter(new T.Vector3());
      }
      targetByObject = new Map(spec.targets.map(target => [target.mesh,target]));
      for (const target of spec.targets) target.mesh.traverse?.(obj => targetByObject.set(obj,target));
      // Raycast against architectural surfaces as well as interactions, so a work
      // across a corridor cannot be selected through an intervening wall.
      stageGroup.traverse(obj => { if (obj.isMesh || obj.isSprite) rayObjects.push(obj); });
      instanceRepeats(stageGroup,rayObjects);
      lighting(resource.ctx); updateHud(); reset();
      if (!pendingAssets) showStatus("");
      world.focus({preventScroll:true}); schedule();
    } catch (error) {
      console.error(error);
      world.dataset.failed = "true";
      $("back-label").textContent = "전시관 선택";
      $("back").onclick = () => enter("selector");
      showStatus("3D 공간을 열 수 없습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요.");
    }
  }
  function selectTheme(key) {
    if (!themes[key]) return;
    theme = key; useArchive(key); page = 0; room = 0;
    delete world.dataset.failed;
    $("back").onclick = back;
    enter("exterior");
  }
  function back() {
    if (stage === "gallery") enter("hub");
    else if (stage === "hub") enter("exterior");
    else enter("selector");
  }
  function changePage(delta) {
    const next = T.MathUtils.clamp(page + delta,0,pageCount - 1);
    if (next !== page) { page = next; enter("hub"); }
  }
  function updateHud() {
    $("location-type").textContent = stage === "gallery" ? themes[theme].title : "수중 미술관";
    $("location-title").textContent = stage === "gallery" ? roomLabel(room) : themes[theme].title + (stage === "hub" ? " · 중앙 홀" : "");
    $("back-label").textContent = stage === "gallery" ? "중앙 홀로" : stage === "hub" ? "바다로" : "전시관 선택";
    $("room-list").hidden = stage !== "hub"; $("works-list").hidden = stage !== "gallery";
    $("enter-hub").hidden = stage !== "exterior"; $("pages").hidden = stage !== "hub"; $("nearby").hidden = true;
    $("page-title").textContent = (page * groupSize + 1) + "–" + Math.min((page+1)*groupSize,catalog.length) + "실 · " + (page+1) + "/" + pageCount;
    $("page-prev").disabled = page === 0; $("page-next").disabled = page === pageCount - 1;
  }
  function buttonFor(title, url, action, idx) {
    const b = document.createElement("button");
    b.className = "item"; b.type = "button"; b.dataset.index = String(idx);
    if (url) { const im = new Image(); im.src = url; im.alt = ""; im.loading = "lazy"; b.appendChild(im); }
    const name = document.createElement("span"); name.textContent = title; b.append(name);
    b.addEventListener("click",() => { $("list-dialog").close(); action(); });
    return b;
  }
  function openList() {
    if (stage !== "hub" && stage !== "gallery") return;
    clearInput();
    const items = $("items"); items.replaceChildren();
    if (stage === "hub") {
      $("list-title").textContent = "전시실 목록 · " + (page+1) + "/" + pageCount;
      const start = page*groupSize;
      for(let i = start; i < Math.min(start+groupSize,catalog.length); i++)
        items.appendChild(buttonFor((i+1) + "실 · " + roomLabel(i),roomArt[i]?.[0]?.image,()=>enter("gallery",i),i));
    } else {
      $("list-title").textContent = roomLabel(room) + " · " + roomArt[room].length + "점";
      roomArt[room].forEach((art,i) => items.appendChild(buttonFor(art.title,art.image,()=>openArt(i),i)));
    }
    $("list-dialog").showModal();
  }
  function openArt(index) {
    if (stage !== "gallery" || !roomArt[room].length) return;
    clearInput();
    const arts = roomArt[room];
    currentArt = (index + arts.length) % arts.length;
    const art = arts[currentArt];
    $("art-image").src = art.image; $("art-image").alt = art.title;
    $("art-title").textContent = art.title; $("art-context").textContent = roomLabel(room);
    $("art-medium").textContent = art.medium || "";
    $("art-count").textContent = (currentArt+1) + " / " + arts.length;
    if (!$("art-dialog").open) $("art-dialog").showModal();
  }
  function openLook(target) {
    clearInput();
    $("art-image").src = target.image; $("art-image").alt = target.title;
    $("art-title").textContent = target.title; $("art-context").textContent = themes[theme].title + " · 설계와 도감";
    $("art-medium").textContent = ""; $("art-count").textContent = "";
    if (!$("art-dialog").open) $("art-dialog").showModal();
  }
  function activate(target) {
    if (!target) return;
    if (target.kind === "enter") enter("hub");
    else if (target.kind === "room") enter("gallery",page * groupSize + target.index);
    else if (target.kind === "art") openArt(target.index);
    else if (target.kind === "look") openLook(target);
    else if (target.kind === "back") back();
  }
  function insideSolid(x,z,solid,margin) {
    const dx = x - solid.x, dz = z - solid.z;
    const c = solid.cos, s = solid.sin;
    const u = c*dx - s*dz, v = s*dx + c*dz;
    const dxOutside = Math.max(Math.abs(u) - solid.w*.5,0);
    const dzOutside = Math.max(Math.abs(v) - solid.d*.5,0);
    return dxOutside*dxOutside + dzOutside*dzOutside < margin*margin;
  }
  function legal(x,z) {
    const b = spec.bounds, r = .23;
    return x>=b[0]+r && x<=b[1]-r && z>=b[2]+r && z<=b[3]-r &&
      !spec.solids.some(s => insideSolid(x,z,s,r));
  }
  function walk(dt,side,forward) {
    if (!side && !forward) return false;
    const length = Math.max(1,Math.hypot(side,forward));
    const step = dt * (stage === "exterior" ? 3.15 : 2.65) / length;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const dx = (cos*side + sin*forward)*step;
    const dz = (sin*side - cos*forward)*step;
    const oldX = pos.x, oldZ = pos.y;
    if (legal(pos.x+dx,pos.y+dz)) pos.set(pos.x+dx,pos.y+dz);
    else {
      if (legal(pos.x+dx,pos.y)) pos.x += dx;
      if (legal(pos.x,pos.y+dz)) pos.y += dz;
    }
    if (Math.abs(oldX-pos.x) + Math.abs(oldZ-pos.y) < .00001) return false;
    const heading = Math.atan2(pos.x-oldX,pos.y-oldZ);
    actorYaw += headingDifference(heading,actorYaw) * (1-Math.exp(-16*dt));
    return true;
  }
  function solidRayDistance(x,z,vx,vz,solid,maxDist) {
    const c=solid.cos,s=solid.sin,dx=x-solid.x,dz=z-solid.z;
    const origins=[c*dx-s*dz,s*dx+c*dz],dirs=[c*vx-s*vz,s*vx+c*vz];
    const halves=[solid.w*.5+.105,solid.d*.5+.105];
    let near = 0,far = maxDist;
    for (let axis = 0; axis < 2; axis++) {
      const p = origins[axis], v = dirs[axis], half = halves[axis];
      if (Math.abs(v)<.00001) {
        if (Math.abs(p)>half) return maxDist;
      } else {
        const a=(-half-p)/v, b=(half-p)/v;
        near = Math.max(near,Math.min(a,b)); far = Math.min(far,Math.max(a,b));
        if (far<near) return maxDist;
      }
    }
    return near > .015 ? Math.min(maxDist,near-.055) : maxDist;
  }
  function leaveOverview(now) {
    if (intro?.mode !== "overview") return;
    introPosition.copy(camera.position); introRotation.copy(camera.quaternion);
    intro = { mode:"transition", at:now, fov:camera.fov };
  }
  function adjustCamera(now) {
    const opts = spec.camera || {};
    const narrow = camera.aspect < .82, outdoor = stage === "exterior";
    if (intro?.mode === "overview") {
      const framing = spec.establishing;
      camera.position.fromArray(framing.position);
      aimPoint.fromArray(framing.lookAt);
      const baseFov=framing.fov || 43;
      camera.fov = baseFov+(narrow ? 14 : 0);
      if (narrow) {
        const fit=Math.max(1,1.28/camera.aspect*Math.tan(baseFov*Math.PI/360)/Math.tan(camera.fov*Math.PI/360));
        camera.position.sub(aimPoint).multiplyScalar(Math.min(2.5,fit)).add(aimPoint);
      }
      camera.lookAt(aimPoint);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      player.group.visible=true;world.dataset.framing="overview";
      return;
    }
    const desired = (opts.distance ?? (outdoor ? 4.8 : 3.75)) * (narrow ? 1.08 : 1);
    const vx = -Math.sin(yaw), vz = Math.cos(yaw), b = spec.bounds;
    let dist = desired;
    // Outdoor player bounds follow the narrow gangway; the camera may orbit
    // over its edges to show the station envelope and the visitor together.
    if (!outdoor) for (const [p,v,lo,hi] of [[pos.x,vx,b[0],b[1]],[pos.y,vz,b[2],b[3]]]) {
      if (v>.00001) dist=Math.min(dist,(hi-.12-p)/v);
      if (v<-.00001) dist=Math.min(dist,(lo+.12-p)/v);
    }
    for (const solid of spec.solids) dist=solidRayDistance(pos.x,pos.y,vx,vz,solid,dist);
    dist=Math.max(.08,dist);
    const ratio = Math.min(1,dist/desired);
    const height = opts.height ?? (outdoor ? 2.00 : 1.65);
    camera.position.set(pos.x+vx*dist,1.30+(height-1.30)*ratio,pos.y+vz*dist);
    camera.rotation.set(tilt,-yaw,0,"YXZ");
    let fov = (opts.fov ?? (outdoor ? 54 : 51)) + (narrow ? 9 : 0) + (1-ratio)*6;
    if (intro?.mode === "transition") {
      const t=Math.min(1,(now-intro.at)/760);
      const easing=t*t*(3-2*t);
      camera.position.lerp(introPosition,1-easing);
      camera.quaternion.slerp(introRotation,1-easing);
      fov=intro.fov+(fov-intro.fov)*easing;
      world.dataset.framing=t>=1 ? "follow" : "transition";
      if(t>=1) intro=null;
    } else world.dataset.framing="follow";
    if (Math.abs(camera.fov-fov) > .025) { camera.fov=fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    player.group.visible = dist>1.04;
  }
  function isVisibleMesh(object) {
    for (let obj=object;obj;obj=obj.parent) if (!obj.visible) return false;
    return true;
  }
  function objectHitTarget() {
    const hits = ray.intersectObjects(rayObjects,false);
    let opaque = Infinity;
    for (const hit of hits) {
      const obj = hit.object;
      if (!isVisibleMesh(obj)) continue;
      if (hit.distance > opaque + .075) return null;
      const target = targetByObject.get(obj);
      if (target) return target;
      const m = Array.isArray(obj.material) ? obj.material[hit.face?.materialIndex ?? 0] : obj.material;
      if (m && (m.visible === false || m.depthWrite === false || m.transparent && m.opacity < .65)) continue;
      opaque = Math.min(opaque,hit.distance);
    }
    return null;
  }
  function selectPoint(clientX,clientY) {
    if (!spec) return;
    const r = world.getBoundingClientRect();
    ndc.set((clientX-r.left)/r.width*2-1,1-(clientY-r.top)/r.height*2);
    ray.setFromCamera(ndc,camera);
    activate(objectHitTarget());
  }
  function proximity() {
    let chosen = null, best = Infinity;
    for (const target of spec.targets) {
      const center = target.center;
      const range = target.kind === "art" ? 3.6 : 4.0;
      const dx=center.x-pos.x,dz=center.z-pos.y, distance=Math.hypot(dx,dz);
      if (distance>range) continue;
      aimPoint.copy(center).project(camera);
      if (aimPoint.z>1 || aimPoint.z< -1 || Math.abs(aimPoint.x)>1.04 || Math.abs(aimPoint.y)>1.08) continue;
      const score=distance+.85*Math.abs(aimPoint.x);
      if (score >= best) continue;
      ndc.set(aimPoint.x,aimPoint.y); ray.setFromCamera(ndc,camera);
      if (objectHitTarget() === target) { chosen=target;best=score; }
    }
    if (chosen === nearby) return;
    nearby=chosen;
    $("nearby").hidden = !nearby || stage === "exterior";
    if (!nearby) return;
    if (nearby.kind === "room") $("nearby").textContent=roomLabel(page*groupSize+nearby.index)+" 입장";
    else if (nearby.kind === "art") $("nearby").textContent="작품 감상 · "+roomArt[room][nearby.index].title;
    else if (nearby.kind === "look") $("nearby").textContent="자세히 보기 · "+nearby.title;
    else $("nearby").textContent=nearby.kind === "back" ? $("back-label").textContent : "전시관 들어가기";
  }
  function frame(now) {
    raf=0;
    if (!spec || anyDialog() || document.hidden) { clock.then=0;return; }
    const dt=clock.then ? Math.min(.05,(now-clock.then)/1000) : 1/60;
    clock.then=now;needsFrame=false;
    const actions = new Set([...pressed].map(code => keyActions[code]));
    for (const step of touchSteps.values()) actions.add(step);
    if (pressed.has("KeyE") && now-clock.eDown<220) actions.delete("turn-right");
    const side=Number(actions.has("right"))-Number(actions.has("left"));
    const forward=Number(actions.has("up"))-Number(actions.has("down"));
    const turn=Number(actions.has("turn-right"))-Number(actions.has("turn-left"));
    if (side || forward || turn) leaveOverview(now);
    yaw += turn*dt*1.55;
    const moving=walk(dt,side,forward);
    if (moving) clock.walk+=dt*13;
    if (moving) for (const target of spec.targets) {
      const w = target.walkIn;
      if (w && Math.hypot(pos.x-w.x,pos.y-w.z) < w.r) { activate(target); return; }
    }
    adjustCamera(now);
    player.group.position.set(pos.x,.008,pos.y);
    const eyeHeading = Math.atan2(camera.position.x-pos.x,camera.position.z-pos.y);
    player.update(actorYaw-eyeHeading,clock.walk,moving,now);
    if (now - clock.actionCheck > 140 || !clock.actionCheck || !pressed.size && !touchSteps.size) {
      clock.actionCheck=now; proximity();
    }
    if (spec.animate && !reduceMotion) spec.animate(now/1000, camera);
    renderer.render(scene,camera);
    world.dataset.playerPosition=pos.x.toFixed(3)+","+pos.y.toFixed(3);
    world.dataset.yaw=yaw.toFixed(4);
    if (needsFrame || pressed.size || touchSteps.size || moving || lastMoving || intro?.mode === "transition" || (spec.animate && !reduceMotion)) schedule();
    else clock.then=0;
    lastMoving=moving;
  }
  function bindSurface() {
    const canvas=renderer.domElement;
    canvas.addEventListener("pointerdown",e=>{
      if (pointer || e.button !== 0 && e.pointerType === "mouse") return;
      world.focus({preventScroll:true});
      pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,drag:false};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove",e=>{
      if (pointer?.id!==e.pointerId) return;
      const p=pointer;
      if (Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>5) p.drag=true;
      if (p.drag) {
        leaveOverview(performance.now());
        yaw -= (e.clientX-p.x)*.0052;
        tilt=T.MathUtils.clamp(tilt+(e.clientY-p.y)*.0036,-.88,.75);
        schedule();
      }
      p.x=e.clientX;p.y=e.clientY;
    });
    canvas.addEventListener("pointerup",e=>{
      if (pointer?.id!==e.pointerId) return;
      const tap=!pointer.drag;
      pointer=null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (tap) selectPoint(e.clientX,e.clientY);
    });
    canvas.addEventListener("pointercancel",()=>{pointer=null;});
    canvas.addEventListener("lostpointercapture",()=>{pointer=null;});
  }
  for (const button of document.querySelectorAll("[data-step]")) {
    button.addEventListener("pointerdown",e=>{
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      touchSteps.set(e.pointerId,button.dataset.step);
      schedule();
    });
    const released=e=>{touchSteps.delete(e.pointerId);schedule();};
    button.addEventListener("pointerup",released);
    button.addEventListener("pointercancel",released);
    button.addEventListener("lostpointercapture",released);
    button.addEventListener("click",e=>{
      if(e.detail!==0 || !spec) return;
      leaveOverview(performance.now());
      const a=button.dataset.step;
      if(a.startsWith("turn-")) yaw += a==="turn-right" ? .25 : -.25;
      else walk(.13,Number(a==="right")-Number(a==="left"),Number(a==="up")-Number(a==="down"));
      schedule();
    });
  }
  window.addEventListener("keydown",e=>{
    if (stage==="selector" || e.altKey || e.ctrlKey || e.metaKey) return;
    if (anyDialog()) {
      if ($("art-dialog").open && (e.key==="ArrowLeft" || e.key==="ArrowRight")) {
        e.preventDefault();openArt(currentArt+(e.key==="ArrowLeft"?-1:1));
      }
      return;
    }
    if (e.key==="Enter" && (!document.activeElement || document.activeElement===world || document.activeElement===document.body)) {
      e.preventDefault(); if (!e.repeat) activate(nearby);return;
    }
    if (!keyActions[e.code] || e.target.matches?.("input,textarea,select") || e.target.isContentEditable) return;
    if (e.code==="KeyE" && !pressed.has("KeyE")) clock.eDown=performance.now();
    pressed.add(e.code);e.preventDefault();schedule();
  });
  window.addEventListener("keyup",e=>{
    const used=pressed.delete(e.code);
    if (!used) return;
    if (e.code==="KeyE" && clock.eDown && performance.now()-clock.eDown<220) activate(nearby);
    schedule();
  });
  window.addEventListener("blur",clearInput);
  document.addEventListener("visibilitychange",()=>{
    clearInput();clock.then=0;
    if (!document.hidden) schedule();
  });
  $("enter-hub").onclick=()=>enter("hub");
  $("back").onclick=back;$("reset").onclick=reset;
  $("room-list").onclick=openList;$("works-list").onclick=openList;
  $("page-prev").onclick=()=>changePage(-1);$("page-next").onclick=()=>changePage(1);
  $("nearby").onclick=()=>activate(nearby);
  $("help").onclick=()=>{clearInput();$("help-dialog").showModal();};
  $("prev-art").onclick=()=>openArt(currentArt-1);$("next-art").onclick=()=>openArt(currentArt+1);
  for (const dialog of dialogs) {
    dialog.querySelector("[data-close]").onclick=()=>dialog.close();
    dialog.addEventListener("close",()=>{clock.then=0;clock.actionCheck=0;schedule();});
    dialog.addEventListener("click",e=>{
      const box=dialog.getBoundingClientRect();
      if (e.clientX<box.left || e.clientX>box.right || e.clientY<box.top || e.clientY>box.bottom) dialog.close();
    });
  }
  // On touch devices a drag on the canvas can suppress the browser's next
  // compatibility click. Resolve an actual button tap on pointer release;
  // mouse, keyboard, assistive-technology, and scroll gestures retain native behavior.
  let touchButton = null, handledTouch = null;
  document.addEventListener("pointerdown",event=>{
    if(event.pointerType!=="touch") return;
    handledTouch=null;
    const control=event.target.closest?.("button:not([data-step]):not(:disabled)");
    if(control) touchButton={control,id:event.pointerId,x:event.clientX,y:event.clientY};
  },true);
  document.addEventListener("pointercancel",event=>{
    if(touchButton?.id===event.pointerId) touchButton=null;
  },true);
  document.addEventListener("pointerup",event=>{
    if(touchButton?.id!==event.pointerId) return;
    const touch=touchButton;touchButton=null;
    if(!touch.control.contains(event.target) || Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>9) return;
    handledTouch={x:event.clientX,y:event.clientY,time:performance.now()};
    touch.control.click();
  },true);
  document.addEventListener("click",event=>{
    if(!event.isTrusted || !handledTouch || performance.now()-handledTouch.time>650 ||
       !(event.pointerType==="touch" || event.sourceCapabilities?.firesTouchEvents)) return;
    if(Math.hypot(event.clientX-handledTouch.x,event.clientY-handledTouch.y)<12){
      event.preventDefault();event.stopImmediatePropagation();handledTouch=null;
    }
  },true);
  for (const key of ["coral","kelp","abyss","lagoon"]) {
    const item=themes[key];
    if (!item) continue;
    const card=document.createElement("button");card.type="button";card.className="theme-card";card.dataset.theme=key;
    const image=new Image();image.src=url(item.images.refExterior || item.images.exteriorPlate);image.alt="";
    const text=document.createElement("span");text.className="theme-title";text.textContent=item.title;
    const arrow=document.createElement("i");arrow.textContent="↗";arrow.setAttribute("aria-hidden","true");text.append(arrow);
    card.append(image,text);
    if (item.subtitle) { const small=document.createElement("small");small.textContent=item.subtitle;card.append(small); }
    card.onclick=()=>selectTheme(key);
    $("theme-list").appendChild(card);
  }
  world.dataset.stage = stage;
  window.oceanMuseum = Object.freeze({
    // For checks: open a stage directly and stand at a point facing a heading.
    open: (key, nextStage = "exterior", which = 0) => { theme = key; useArchive(key); page = Math.floor(which / groupSize); $("back").onclick = back; enter(nextStage, which); },
    pose: (x, z, heading) => { pos.set(x, z); yaw = heading; actorYaw = Math.PI - yaw; intro = null; schedule(); },
    getState: () => ({stage,theme,page,room,yaw,position:[pos.x,pos.y],targetCount:spec?.targets?.length || 0,
      ready:!!spec && !pendingAssets,drawCalls:renderer?.info.render.calls || 0,geometryCount:renderer?.info.memory.geometries || 0,textureCount:renderer?.info.memory.textures || 0}),
    projectTargets: () => {
      if (!camera || !spec) return [];
      const r=world.getBoundingClientRect();
      return spec.targets.map(t=>{
        hitPoint.copy(t.center).project(camera);
        return {kind:t.kind,index:t.index,x:r.left+(hitPoint.x+1)*.5*r.width,y:r.top+(1-hitPoint.y)*.5*r.height,
          visible:hitPoint.z>-1 && hitPoint.z<1 && Math.abs(hitPoint.x)<1 && Math.abs(hitPoint.y)<1};
      });
    }
  });
})();
