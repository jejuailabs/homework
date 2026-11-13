// Twinkling stars and an occasional shooting star for the space galleries.
// Drawn just inside the sky dome, so walls hide them and only windows and the oculus show them.
// `avoid` keeps the planet (and its rings) clear of stars; `minElevation` keeps them off a horizon.

/**
 * @param {any} T three.js namespace
 * @param {{count?:number, radius?:number, avoid?:{dir:number[], angle:number}[], minElevation?:number}} [options]
 */
export function createStarfield(T, options = {}) {
  const {count = 1300, radius = 140, avoid = [], minElevation = -90} = options;
  const group = new T.Group();
  group.renderOrder = -9;
  const cones = avoid.map(({dir, angle}) => ({dir: new T.Vector3(...dir).normalize(), cos: Math.cos(angle * Math.PI / 180)}));
  const floor = Math.sin(minElevation * Math.PI / 180);

  // Stars: random directions on the sphere, each with its own size, warmth and twinkle phase/speed.
  const positions = [], sizes = [], phases = [], speeds = [], tints = [];
  const v = new T.Vector3();
  for (let tries = 0; positions.length / 3 < count && tries < count * 6; tries++) {
    v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    const length = v.length();
    if (length < .1 || length > 1) continue;
    v.divideScalar(length);
    if (v.y < floor || cones.some(cone => v.dot(cone.dir) > cone.cos)) continue;
    positions.push(v.x * radius, v.y * radius, v.z * radius);
    const bright = Math.random() < .08;
    sizes.push(bright ? 4.6 + Math.random() * 2.4 : 2.0 + Math.random() * 1.8);
    phases.push(Math.random() * Math.PI * 2);
    speeds.push(.6 + Math.random() * 2.2);
    const warm = Math.random();
    tints.push(warm < .2 ? 1 : .86, warm < .2 ? .9 : .92, warm < .2 ? .78 : 1);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('size', new T.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('phase', new T.Float32BufferAttribute(phases, 1));
  geometry.setAttribute('speed', new T.Float32BufferAttribute(speeds, 1));
  geometry.setAttribute('tint', new T.Float32BufferAttribute(tints, 3));
  const uniforms = {time: {value: 0}, pixelRatio: {value: Math.min(2, globalThis.devicePixelRatio || 1)}};
  const material = new T.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
    vertexShader: `
      attribute float size; attribute float phase; attribute float speed; attribute vec3 tint;
      uniform float time; uniform float pixelRatio;
      varying float vGlow; varying vec3 vTint;
      void main() {
        float twinkle = .55 + .45 * sin(time * speed + phase) * sin(time * speed * .37 + phase * 1.7);
        vGlow = twinkle; vTint = tint;
        gl_PointSize = size * pixelRatio * (.75 + .5 * twinkle);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying float vGlow; varying vec3 vTint;
      void main() {
        float d = length(gl_PointCoord - .5);
        float core = smoothstep(.5, 0., d);
        gl_FragColor = vec4(vTint, min(1., core * 1.4) * (.25 + .75 * vGlow));
      }`,
  });
  const stars = new T.Points(geometry, material);
  stars.frustumCulled = false; stars.renderOrder = -9;
  group.add(stars);

  // Shooting star: a short bright streak sliding along the sky every few seconds.
  const trail = new T.BufferGeometry();
  trail.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(6), 3));
  trail.setAttribute('color', new T.Float32BufferAttribute([1, 1, .95, 1, .75, .85, 1, 0], 4));
  const trailMaterial = new T.LineBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false});
  const streak = new T.Line(trail, trailMaterial);
  streak.frustumCulled = false; streak.visible = false; streak.renderOrder = -8;
  group.add(streak);
  let next = performance.now() + 2500 + Math.random() * 3000, flight = null;
  const from = new T.Vector3(), axis = new T.Vector3(), head = new T.Vector3(), tail = new T.Vector3();
  function launch(now) {
    for (let tries = 0; tries < 20; tries++) {
      from.set(Math.random() * 2 - 1, .25 + Math.random() * .7, Math.random() * 2 - 1).normalize();
      if (from.y >= floor && !cones.some(cone => from.dot(cone.dir) > cone.cos)) break;
    }
    axis.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).cross(from).normalize();
    flight = {start: now, duration: 700 + Math.random() * 500, arc: .28 + Math.random() * .2};
  }
  function update(now) {
    uniforms.time.value = now / 1000;
    if (!flight && now > next) launch(now);
    if (flight) {
      const t = (now - flight.start) / flight.duration;
      if (t >= 1) {flight = null; streak.visible = false; next = now + 4000 + Math.random() * 6000; return;}
      head.copy(from).applyAxisAngle(axis, flight.arc * t).multiplyScalar(radius - 4);
      tail.copy(from).applyAxisAngle(axis, Math.max(0, flight.arc * t - .07)).multiplyScalar(radius - 4);
      const p = trail.attributes.position;
      p.setXYZ(0, head.x, head.y, head.z); p.setXYZ(1, tail.x, tail.y, tail.z); p.needsUpdate = true;
      trailMaterial.opacity = Math.sin(Math.PI * t);
      streak.visible = true;
    }
  }
  function dispose() {
    group.removeFromParent();
    geometry.dispose(); material.dispose(); trail.dispose(); trailMaterial.dispose();
  }
  return {object: group, update, dispose};
}
