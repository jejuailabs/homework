// Loads one visitor model (/exhibition-walkers/*.glb) and plays its `walk` clip only while moving.
const bytesByUrl = new Map();
function walkerBytes(url) {
  let bytes = bytesByUrl.get(url);
  if (!bytes) {
    bytes = fetch(url).then(response => { if (!response.ok) throw new Error(String(response.status)); return response.arrayBuffer(); });
    bytes.catch(() => bytesByUrl.delete(url));
    bytesByUrl.set(url, bytes);
  }
  return bytes;
}

/** @returns {Promise<{group:any, update:(moving:boolean, dt:number)=>void, dispose:()=>void}>} */
export async function loadWalkerModel(T, url, {height = 1, maxWidth = height * 1.2, anisotropy = 4, castShadow = false, fog = true} = {}) {
  const [{GLTFLoader}, {MeshoptDecoder}, bytes] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js'), walkerBytes(url),
  ]);
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes.slice(0), '');
  const clip = gltf.animations.find(item => item.name === 'walk');
  if (!clip) throw new Error('walk clip missing');
  const model = gltf.scene, owned = [];
  model.traverse(part => {
    if (!part.isMesh) return;
    part.castShadow = castShadow; part.receiveShadow = false; part.frustumCulled = false;
    owned.push(part.geometry);
    for (const material of [].concat(part.material)) { material.fog = fog; owned.push(material); if (material.map) { material.map.anisotropy = anisotropy; owned.push(material.map); } }
  });
  model.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(model, true), size = box.getSize(new T.Vector3()), middle = box.getCenter(new T.Vector3());
  const scale = Math.min(height / Math.max(size.y, .01), maxWidth / Math.max(size.x, size.z, .01));
  model.scale.setScalar(scale); model.position.set(-middle.x * scale, -box.min.y * scale, -middle.z * scale);
  const group = new T.Group(); group.name = 'walker'; group.add(model);
  const mixer = new T.AnimationMixer(model); mixer.clipAction(clip).play(); mixer.setTime(0);
  let wasMoving = false;
  return {
    group,
    update(moving, dt) { if (moving) mixer.update(dt * 1.25); else if (wasMoving) mixer.setTime(0); wasMoving = moving; },
    dispose() { group.removeFromParent(); mixer.stopAllAction(); for (const item of owned) item.dispose(); },
  };
}
