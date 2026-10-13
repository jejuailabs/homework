"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as Three from "three";
import "@/styles/exhibition-scene.css";

export type ExhibitionSceneArtwork = {
  id: string;
  title: string;
  url?: string;
  thumbnailUrl?: string;
};

type Props = {
  artworks: ExhibitionSceneArtwork[];
  onSelect: (id: string) => void;
  locale?: string;
  mode?: "gallery" | "building";
  theme?: "cozy" | "forest" | "sky" | "ocean";
  buildingName?: string;
};

const ROOM_CAPACITY = 8;
const ROOM_THEMES = {
  cozy: { cream: "#f8edda", wall: "#fff4e4", wood: "#c89363", floor: "#e6bc89", mint: "#a5bfa3", deepMint: "#7d9f83", peach: "#e5aa8e", leaf: "#7f9f64", sky: "#d9edf1", rug: "#f7e7d0", seam: "#d8ad7c" },
  forest: { cream: "#eef0df", wall: "#edf2de", wood: "#a78561", floor: "#c7b492", mint: "#98b383", deepMint: "#709268", peach: "#d3a887", leaf: "#6f925e", sky: "#e0eed1", rug: "#e5ebd1", seam: "#b5a27e" },
  sky: { cream: "#f3f5fc", wall: "#f1f6fc", wood: "#b39a80", floor: "#e2ccac", mint: "#afc7e2", deepMint: "#8fa9cd", peach: "#d4bfda", leaf: "#a7bf9b", sky: "#dcedfa", rug: "#e8eafa", seam: "#ceb79b" },
  ocean: { cream: "#edf5ef", wall: "#e9f4f0", wood: "#ac967b", floor: "#dbc7a6", mint: "#8cbeb7", deepMint: "#6caaa4", peach: "#dfb1a0", leaf: "#78a497", sky: "#cce8ee", rug: "#d7eae5", seam: "#c5b091" },
};

/** A static, on-demand miniature: no render loop, avatar, or movement controls. */
export default function ExhibitionScene({ artworks, onSelect, locale = "ko", mode = "gallery", theme = "cozy", buildingName }: Props) {
  const isEnglish = locale.startsWith("en");
  const isBuilding = mode === "building";
  const hostRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const pages = Math.max(1, Math.ceil(artworks.length / ROOM_CAPACITY));
  const currentPage = Math.min(page, pages - 1);
  const visible = isBuilding ? [] : artworks.slice(currentPage * ROOM_CAPACITY, (currentPage + 1) * ROOM_CAPACITY);
  // Do not rebuild WebGL when a parent creates an equivalent array during a render.
  const sceneData = JSON.stringify(visible);
  const roomArtworks: ExhibitionSceneArtwork[] = useMemo(() => JSON.parse(sceneData), [sceneData]);

  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let disposeScene: (() => void) | undefined;
    setStatus("loading");
    setFailedImages([]);

    async function initialize() {
      const T = await import("three");
      if (disposed || !host) return;
      const geometries = new Set<Three.BufferGeometry>();
      const materials = new Set<Three.Material>();
      const textures = new Set<Three.Texture>();
      let renderer: Three.WebGLRenderer | undefined;
      let observer: ResizeObserver | undefined;
      let frame = 0;
      const scene = new T.Scene();
      const target = new T.Vector3(0, 1.55, 0);
      const camera = new T.OrthographicCamera(-7, 7, 5, -5, 0.1, 70);
      camera.position.set(11.5, 10, 14);
      if (isBuilding) {
        target.set(0, 1.8, 0);
        camera.position.set(9, 7, 14);
      }
      camera.lookAt(target);
      const clickable: Three.Object3D[] = [];
      const raycaster = new T.Raycaster();
      const pointer = new T.Vector2();
      let pointerStart: { x: number; y: number } | undefined;

      function render() {
        if (disposed || !renderer || frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!disposed && renderer) renderer.render(scene, camera);
        });
      }

      function geometry<G extends Three.BufferGeometry>(value: G): G { geometries.add(value); return value; }
      function material<M extends Three.Material>(value: M): M { materials.add(value); return value; }
      const matte = (color: string) => material(new T.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 }));
      const colors = ROOM_THEMES[theme] || ROOM_THEMES.cozy;
      const cream = matte(colors.cream);
      const wallCream = matte(colors.wall);
      const wood = matte(colors.wood);
      const lightWood = matte(colors.floor);
      const mint = matte(colors.mint);
      const deepMint = matte(colors.deepMint);
      const peach = matte(colors.peach);
      const leaf = matte(colors.leaf);

      function mesh(g: Three.BufferGeometry, m: Three.Material, parent: Three.Object3D = scene) {
        const value = new T.Mesh(g, m);
        value.castShadow = true;
        value.receiveShadow = true;
        parent.add(value);
        return value;
      }

      function roundedShape(width: number, height: number, radius: number) {
        const shape = new T.Shape();
        const x = -width / 2, y = -height / 2;
        const r = Math.min(radius, width / 2, height / 2);
        shape.moveTo(x + r, y);
        shape.lineTo(x + width - r, y);
        shape.quadraticCurveTo(x + width, y, x + width, y + r);
        shape.lineTo(x + width, y + height - r);
        shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        shape.lineTo(x + r, y + height);
        shape.quadraticCurveTo(x, y + height, x, y + height - r);
        shape.lineTo(x, y + r);
        shape.quadraticCurveTo(x, y, x + r, y);
        return shape;
      }

      function arch(width: number, height: number) {
        const shape = new T.Shape();
        const r = width / 2;
        shape.moveTo(-r, -height / 2);
        shape.lineTo(r, -height / 2);
        shape.lineTo(r, height / 2 - r);
        shape.absarc(0, height / 2 - r, r, 0, Math.PI, false);
        shape.closePath();
        return shape;
      }

      function panel(width: number, height: number, depth: number, radius: number, m: Three.Material, parent?: Three.Object3D) {
        const bevel = Math.min(depth / 3, 0.045);
        const g = geometry(new T.ExtrudeGeometry(roundedShape(width, height, radius), {
          depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8, steps: 1,
        }));
        g.translate(0, 0, -depth / 2);
        return mesh(g, m, parent);
      }

      function sphere(x: number, y: number, z: number, size: number, m: Three.Material, parent?: Three.Object3D) {
        const value = mesh(geometry(new T.SphereGeometry(size, 16, 12)), m, parent);
        value.position.set(x, y, z);
        return value;
      }

      function cylinder(radiusTop: number, radiusBottom: number, height: number, m: Three.Material, parent?: Three.Object3D) {
        return mesh(geometry(new T.CylinderGeometry(radiusTop, radiusBottom, height, 24)), m, parent);
      }

      function label(text: string, width: number, height: number, color = "#806849") {
        const canvas = document.createElement("canvas");
        canvas.width = 768;
        canvas.height = 160;
        const context = canvas.getContext("2d");
        if (context) {
          context.fillStyle = color;
          context.font = '500 44px "Noto Sans KR", sans-serif';
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(text, 384, 80, 720);
        }
        const texture = new T.CanvasTexture(canvas);
        texture.colorSpace = T.SRGBColorSpace;
        textures.add(texture);
        return mesh(geometry(new T.PlaneGeometry(width, height)), material(new T.MeshBasicMaterial({
          map: texture, transparent: true, depthWrite: false, toneMapped: false,
        })));
      }

      function pick(event: PointerEvent) {
        if (!renderer) return;
        const bounds = renderer.domElement.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(clickable, true)[0]?.object.userData.artworkId as string | undefined;
      }
      const onPointerMove = (event: PointerEvent) => { if (renderer) renderer.domElement.style.cursor = pick(event) ? "pointer" : "default"; };
      const onPointerDown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY }; };
      const onPointerCancel = () => { pointerStart = undefined; };
      const onPointerUp = (event: PointerEvent) => {
        const start = pointerStart;
        pointerStart = undefined;
        if (!start || Math.hypot(start.x - event.clientX, start.y - event.clientY) > 8) return;
        const id = pick(event);
        if (id) selectRef.current(id);
      };
      const onContextLost = (event: Event) => {
        event.preventDefault();
        if (!disposed) setStatus("fallback");
      };

      disposeScene = () => {
        cancelAnimationFrame(frame);
        observer?.disconnect();
        if (renderer) {
          renderer.domElement.removeEventListener("pointermove", onPointerMove);
          renderer.domElement.removeEventListener("pointerdown", onPointerDown);
          renderer.domElement.removeEventListener("pointerup", onPointerUp);
          renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
          renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
        }
        for (const item of geometries) item.dispose();
        for (const item of materials) item.dispose();
        for (const item of textures) item.dispose();
        scene.clear();
        renderer?.dispose();
        renderer?.forceContextLoss();
        renderer?.domElement.remove();
      };

      try {
        renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFShadowMap;
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointerup", onPointerUp);
        renderer.domElement.addEventListener("pointercancel", onPointerCancel);
        renderer.domElement.addEventListener("webglcontextlost", onContextLost);
        host.appendChild(renderer.domElement);

        scene.add(new T.HemisphereLight("#fff9ef", "#c1ae95", 2.15));
        const sunshine = new T.DirectionalLight("#fff5e1", 2.6);
        sunshine.position.set(3, 12, 8);
        sunshine.castShadow = true;
        sunshine.shadow.mapSize.set(1024, 1024);
        sunshine.shadow.camera.left = -8;
        sunshine.shadow.camera.right = 8;
        sunshine.shadow.camera.top = 8;
        sunshine.shadow.camera.bottom = -8;
        sunshine.shadow.normalBias = 0.03;
        sunshine.shadow.bias = -0.0004;
        scene.add(sunshine);
        const fill = new T.DirectionalLight("#edf7ef", 0.75);
        fill.position.set(-6, 6, 2);
        scene.add(fill);

        if (isBuilding) {
          const lawn = panel(8.6, 6.9, 0.15, 2.1, matte("#d8dec5"));
          lawn.rotation.x = -Math.PI / 2;
          lawn.position.y = -0.14;
          const houseShape = new T.Shape();
          houseShape.moveTo(-2.73, 0.03);
          houseShape.quadraticCurveTo(-2.93, 0.03, -2.93, 0.24);
          houseShape.lineTo(-2.93, 2.65);
          houseShape.bezierCurveTo(-1.9, 2.95, -1.72, 4.34, 0, 4.35);
          houseShape.bezierCurveTo(1.72, 4.34, 1.9, 2.95, 2.93, 2.65);
          houseShape.lineTo(2.93, 0.24);
          houseShape.quadraticCurveTo(2.93, 0.03, 2.73, 0.03);
          houseShape.closePath();
          const houseGeometry = geometry(new T.ExtrudeGeometry(houseShape, { depth: 3.35, bevelEnabled: true, bevelSize: 0.085, bevelThickness: 0.085, bevelSegments: 4, curveSegments: 24 }));
          const house = mesh(houseGeometry, wallCream);
          house.position.z = -1.65;
          const roofShape = new T.Shape();
          roofShape.moveTo(-3.23, 2.72);
          roofShape.bezierCurveTo(-1.91, 2.99, -1.8, 4.56, 0, 4.57);
          roofShape.bezierCurveTo(1.8, 4.56, 1.91, 2.99, 3.23, 2.72);
          roofShape.quadraticCurveTo(3.38, 2.57, 3.19, 2.4);
          roofShape.bezierCurveTo(1.69, 2.63, 1.52, 4.2, 0, 4.22);
          roofShape.bezierCurveTo(-1.52, 4.2, -1.69, 2.63, -3.19, 2.4);
          roofShape.quadraticCurveTo(-3.38, 2.57, -3.23, 2.72);
          const roof = mesh(geometry(new T.ExtrudeGeometry(roofShape, { depth: 3.85, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 4, curveSegments: 24 })), peach);
          roof.position.z = -1.9;
          const doorFrame = mesh(geometry(new T.ExtrudeGeometry(arch(1.74, 2.4), { depth: 0.1, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.04, bevelSegments: 3 })), lightWood);
          doorFrame.position.set(0, 1.2, 1.78);
          const door = mesh(geometry(new T.ShapeGeometry(arch(1.48, 2.22), 24)), wood);
          door.position.set(0, 1.16, 1.93);
          const doorSeam = panel(0.027, 1.85, 0.01, 0.01, lightWood);
          doorSeam.position.set(0, 1.06, 1.97);
          for (const x of [-0.16, 0.16]) {
            const handle = sphere(x, 1, 2.01, 0.065, matte("#e8c27c"));
            handle.scale.y = 1.45;
          }
          for (const x of [-1.94, 1.94]) {
            const frame = mesh(geometry(new T.ExtrudeGeometry(arch(0.98, 1.5), { depth: 0.08, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 20 })), lightWood);
            frame.position.set(x, 1.77, 1.79);
            const glass = mesh(geometry(new T.ShapeGeometry(arch(0.77, 1.28), 20)), material(new T.MeshBasicMaterial({ color: "#bed7ce" })));
            glass.position.set(x, 1.77, 1.92);
            const mullion = panel(0.05, 1.24, 0.03, 0.01, lightWood);
            mullion.position.set(x, 1.77, 1.97);
            const crossbar = panel(0.8, 0.05, 0.03, 0.01, lightWood);
            crossbar.position.set(x, 1.78, 1.98);
          }
          const sign = panel(2.46, 0.58, 0.1, 0.17, lightWood);
          sign.position.set(0, 2.94, 1.8);
          const signPaper = panel(2.26, 0.43, 0.025, 0.12, cream);
          signPaper.position.set(0, 2.94, 1.88);
          const buildingTitle = buildingName?.trim() || (isEnglish ? "Little gallery" : "우리의 미술관");
          const titleCharacters = Array.from(buildingTitle);
          const signText = label(titleCharacters.length > 14 ? titleCharacters.slice(0, 14).join("") + "…" : buildingTitle, 2.05, 0.4);
          signText.position.set(0, 2.94, 1.94);
          const flowerCenter = sphere(0, 3.63, 1.84, 0.095, matte("#c69c5b"));
          flowerCenter.scale.z = 0.3;
          for (let i = 0; i < 5; i++) {
            const petal = sphere(Math.cos(i * Math.PI * 0.4) * 0.15, 3.63 + Math.sin(i * Math.PI * 0.4) * 0.15, 1.83, 0.13, lightWood);
            petal.scale.z = 0.35;
          }
          const step = panel(2.15, 0.35, 0.72, 0.1, cream);
          step.position.set(0, 0.11, 2.08);
          for (let i = 0; i < 3; i++) {
            const steppingStone = panel(0.85 - i * 0.07, 0.48, 0.07, 0.22, cream);
            steppingStone.rotation.x = -Math.PI / 2;
            steppingStone.rotation.z = i % 2 ? -0.15 : 0.1;
            steppingStone.position.set(i % 2 ? 0.1 : -0.07, -0.01, 2.68 + i * 0.47);
          }
          for (const direction of [-1, 1]) {
            const trunk = cylinder(0.11, 0.15, 1.5, wood);
            trunk.position.set(direction * 3.45, 0.75, -0.42);
            const crown = sphere(direction * 3.45, 1.9, -0.42, 0.84, mint);
            crown.scale.set(0.86, 1.25, 0.86);
            sphere(direction * 3.42, 0.4, 1.4, 0.55, deepMint);
            sphere(direction * 2.98, 0.3, 2.18, 0.43, mint);
            const pot = cylinder(0.29, 0.21, 0.4, peach);
            pot.position.set(direction * 1.35, 0.2, 2.08);
            const flowerStem = cylinder(0.023, 0.023, 0.6, deepMint);
            flowerStem.position.set(direction * 1.35, 0.65, 2.08);
            for (let i = 0; i < 5; i++) {
              const petal = sphere(direction * 1.35 + Math.cos(i * Math.PI * 0.4) * 0.16, 0.98 + Math.sin(i * Math.PI * 0.4) * 0.16, 2.08, 0.12, cream);
              petal.scale.z = 0.5;
            }
            sphere(direction * 1.35, 0.98, 2.14, 0.08, lightWood);
          }
          const flagpole = cylinder(0.032, 0.032, 0.9, wood);
          flagpole.position.set(0, 4.95, -0.5);
          const flag = panel(0.7, 0.45, 0.035, 0.075, mint);
          flag.position.set(0.36, 5.13, -0.5);
        } else {
        // A rounded dollhouse floor and two cutaway walls keep the artwork visible.
        const floor = panel(9.1, 6.7, 0.32, 0.42, lightWood);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.15;
        const back = panel(9, 4.7, 0.22, 0.3, wallCream);
        back.position.set(0, 2.3, -3.15);
        const left = panel(6.45, 4.7, 0.22, 0.3, cream);
        left.rotation.y = Math.PI / 2;
        left.position.set(-4.4, 2.3, 0);
        const backTrim = panel(8.8, 0.14, 0.07, 0.03, wood);
        backTrim.position.set(0, 0.14, -2.98);
        const leftTrim = panel(6.2, 0.14, 0.07, 0.03, wood);
        leftTrim.rotation.y = Math.PI / 2;
        leftTrim.position.set(-4.25, 0.14, 0);

        // Fine plank seams are geometry rather than large texture downloads.
        const seamMaterial = matte(colors.seam);
        for (let i = 0; i < 12; i++) {
          const seam = mesh(geometry(new T.BoxGeometry(8.4, 0.008, 0.009)), seamMaterial);
          seam.position.set(0, 0.029, -2.85 + i * 0.52);
        }

        // The arched mint window reads as a little sculptural object.
        const windowGroup = new T.Group();
        windowGroup.rotation.y = Math.PI / 2;
        windowGroup.position.set(-4.22, 2.57, -1.63);
        scene.add(windowGroup);
        const windowFrame = mesh(geometry(new T.ExtrudeGeometry(arch(1.72, 2.7), { depth: 0.13, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 3, curveSegments: 24 })), mint, windowGroup);
        windowFrame.position.z = 0.04;
        const windowSky = mesh(geometry(new T.ShapeGeometry(arch(1.44, 2.41), 24)), material(new T.MeshBasicMaterial({ color: colors.sky })), windowGroup);
        windowSky.position.z = 0.2;
        const vertical = panel(0.07, 2.24, 0.04, 0.02, mint, windowGroup);
        vertical.position.z = 0.25;
        const horizontal = panel(1.48, 0.08, 0.04, 0.02, mint, windowGroup);
        horizontal.position.set(0, 0.03, 0.25);
        const sill = panel(1.95, 0.15, 0.32, 0.06, mint, windowGroup);
        sill.position.set(0, -1.38, 0.13);
        const clouds = material(new T.MeshBasicMaterial({ color: "#fffefa" }));
        for (const [x, y, size] of [[-0.38, 0.75, 0.19], [-0.2, 0.81, 0.23], [0.4, -0.47, 0.18]]) {
          const cloud = sphere(x, y, 0.218, size, clouds, windowGroup);
          cloud.scale.set(1.2, 0.65, 0.04);
          cloud.castShadow = false;
        }

        // Quiet furniture stays below the eye line of every artwork.
        const rug = panel(3.35, 2.05, 0.024, 0.93, matte(colors.rug));
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(0.9, 0.06, 1.56);
        const rugFlower = new T.Group();
        rugFlower.position.set(1.7, 0.08, 1.75);
        scene.add(rugFlower);
        for (let i = 0; i < 5; i++) {
          const petal = sphere(Math.cos(i * Math.PI * 0.4) * 0.17, 0, Math.sin(i * Math.PI * 0.4) * 0.17, 0.18, mint, rugFlower);
          petal.scale.y = 0.035;
          petal.castShadow = false;
        }
        const bench = panel(2, 0.7, 0.2, 0.3, mint);
        bench.rotation.x = -Math.PI / 2;
        bench.position.set(0.4, 0.72, 0.7);
        for (const x of [-0.21, 1.01]) {
          const foot = panel(0.21, 0.55, 0.39, 0.06, wood);
          foot.position.set(x, 0.32, 0.7);
        }

        function plant(x: number, z: number, scale: number) {
          const group = new T.Group();
          group.position.set(x, 0.04, z);
          group.scale.setScalar(scale);
          scene.add(group);
          const pot = cylinder(0.32, 0.24, 0.58, peach, group);
          pot.position.y = 0.29;
          const soil = cylinder(0.27, 0.27, 0.025, wood, group);
          soil.position.y = 0.58;
          const stem = cylinder(0.025, 0.035, 1.08, deepMint, group);
          stem.position.y = 1.07;
          for (let i = 0; i < 6; i++) {
            const direction = i % 2 ? 1 : -1;
            const sprout = sphere(direction * 0.17, 0.78 + i * 0.15, (i % 3 - 1) * 0.06, 0.2, leaf, group);
            sprout.scale.set(1.3, 0.62, 0.65);
            sprout.rotation.z = direction * 0.55;
          }
        }
        plant(-3.45, -1.64, 0.95);
        plant(3.7, -1.93, 1.05);

        // Small cupboard and books; these are decorations, never sample artworks.
        const cupboard = panel(1.9, 0.8, 0.5, 0.1, lightWood);
        cupboard.position.set(-2.56, 0.44, -2.5);
        const cupboardFace = panel(1.64, 0.51, 0.03, 0.05, cream);
        cupboardFace.position.set(-2.56, 0.43, -2.21);
        for (const x of [-2.88, -2.22]) sphere(x, 0.43, -2.16, 0.045, wood);
        [mint, peach, cream].forEach((color, i) => {
          const book = panel(0.14, 0.36 + i * 0.05, 0.23, 0.025, color);
          book.position.set(-3.05 + i * 0.17, 1.04, -2.47);
          book.rotation.z = i === 2 ? -0.1 : 0;
        });

        const easel = new T.Group();
        easel.position.set(-2.8, 0, 1.55);
        easel.rotation.y = 0.2;
        scene.add(easel);
        for (const direction of [-1, 1]) {
          const leg = panel(0.12, 1.54, 0.13, 0.04, wood, easel);
          leg.position.set(direction * 0.42, 0.76, 0);
          leg.rotation.z = direction * -0.13;
        }
        const welcomeFrame = panel(1.07, 1.04, 0.1, 0.075, lightWood, easel);
        welcomeFrame.position.set(0, 1.01, 0.1);
        const welcomePaper = panel(0.89, 0.85, 0.025, 0.045, cream, easel);
        welcomePaper.position.set(0, 1.01, 0.18);
        const welcomeText = label(isEnglish ? "Welcome!" : "어서 와요!", 0.83, 0.25);
        easel.add(welcomeText);
        welcomeText.position.set(0, 1.14, 0.21);
        const welcomeHeart = label("♡", 0.9, 0.3, "#b37d68");
        easel.add(welcomeHeart);
        welcomeHeart.position.set(0, 0.89, 0.21);

        const roomTitle = label(isEnglish ? "Every child is an artist" : "작은 작품, 반짝이는 마음", 3.8, 0.51);
        roomTitle.position.set(0.38, 4.13, -2.98);

        // Small sculptural details identify the room without recoloring the artworks.
        if (theme === "forest") {
          for (const side of [-1, 1]) {
            const stem = panel(0.035, 0.64, 0.025, 0.016, deepMint);
            stem.position.set(side * 3.69, 3.87, -2.97);
            stem.rotation.z = side * -0.22;
            for (let i = 0; i < 3; i++) {
              const direction = i % 2 ? -1 : 1;
              const sprout = sphere(side * 3.69 + direction * 0.12, 3.71 + i * 0.18, -2.91, 0.14, leaf);
              sprout.scale.set(1.12, 0.6, 0.12);
              sprout.rotation.z = direction * 0.5;
            }
          }
        } else if (theme === "sky") {
          for (const side of [-1, 1]) {
            for (const [x, y, radius] of [[-0.18, 0, 0.17], [0, 0.08, 0.21], [0.2, 0, 0.15]]) {
              const puff = sphere(side * 3.57 + x, 3.88 + y, -2.91, radius, clouds);
              puff.scale.z = 0.2;
              puff.castShadow = false;
            }
          }
        } else if (theme === "ocean") {
          const waveMaterial = matte("#94c3bf");
          for (const side of [-1, 1]) {
            for (let line = 0; line < 2; line++) {
              const wavePoints: Three.Vector3[] = [];
              for (let i = 0; i <= 16; i++) wavePoints.push(new T.Vector3(side * 3.66 - 0.27 + i * 0.034, 3.91 - line * 0.15 + Math.sin(i / 16 * Math.PI * 2) * 0.037, -2.91));
              const wave = new T.CatmullRomCurve3(wavePoints);
              mesh(geometry(new T.TubeGeometry(wave, 18, 0.016, 6, false)), waveMaterial);
            }
          }
          const shell = new T.Group();
          shell.position.set(2.79, 0.13, 2.13);
          scene.add(shell);
          for (let i = -2; i <= 2; i++) {
            const lobe = sphere(i * 0.055, 0.018, -0.09, 0.12, peach, shell);
            lobe.scale.set(0.52, 0.35, 1.4);
            lobe.rotation.y = i * -0.24;
          }
        }

        const loader = new T.TextureLoader();
        loader.setCrossOrigin("anonymous");
        function artworkFrame(artwork: ExhibitionSceneArtwork, index: number) {
          const group = new T.Group();
          if (index < 6) {
            group.position.set(-1.86 + (index % 3) * 2.16, index < 3 ? 3.08 : 1.44, -2.9);
          } else {
            group.position.set(-4.18, index === 6 ? 3.17 : 1.47, 1.25);
            group.rotation.y = Math.PI / 2;
          }
          scene.add(group);
          const border = panel(1.8, 1.42, 0.1, 0.09, lightWood, group);
          const matteBoard = panel(1.65, 1.27, 0.025, 0.035, cream, group);
          matteBoard.position.z = 0.08;
          const caption = label(`${currentPage * ROOM_CAPACITY + index + 1}. ${artwork.title}`, 1.9, 0.25);
          group.add(caption);
          caption.position.set(0, -0.9, 0.04);
          const placeholder = label(isEnglish ? "Loading artwork…" : "작품을 불러오는 중", 1.35, 0.28, "#a39581");
          group.add(placeholder);
          placeholder.position.z = 0.12;
          group.traverse(item => { item.userData.artworkId = artwork.id; });
          clickable.push(group);

          const markMissing = () => {
            if (disposed) return;
            placeholder.visible = false;
            const missing = label(isEnglish ? "Image unavailable" : "사진을 불러올 수 없어요", 1.35, 0.28, "#a39581");
            group.add(missing);
            missing.position.z = 0.12;
            missing.userData.artworkId = artwork.id;
            setFailedImages(previous => previous.includes(artwork.id) ? previous : [...previous, artwork.id]);
            render();
          };
          const source = artwork.thumbnailUrl || artwork.url;
          if (!source) { markMissing(); return; }
          let url: URL;
          try { url = new URL(source, window.location.origin); }
          catch { markMissing(); return; }
          const localStorageEmulator = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "true"
            && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "9199";
          if (url.protocol !== "https:" && !(url.protocol === "http:" && url.origin === window.location.origin) && !(url.protocol === "blob:" && url.origin === window.location.origin) && !localStorageEmulator) {
            markMissing(); return;
          }
          const texture = loader.load(url.href, loaded => {
            if (disposed) { loaded.dispose(); return; }
            const img = loaded.image as HTMLImageElement;
            const ratio = img.naturalWidth / img.naturalHeight;
            if (!Number.isFinite(ratio) || ratio <= 0) { markMissing(); return; }
            const width = Math.min(1.55, 1.16 * ratio);
            const height = width / ratio;
            loaded.colorSpace = T.SRGBColorSpace;
            loaded.anisotropy = Math.min(renderer?.capabilities.getMaxAnisotropy() || 1, 4);
            border.scale.set((width + 0.25) / 1.8, (height + 0.26) / 1.42, 1);
            matteBoard.scale.set((width + 0.1) / 1.65, (height + 0.11) / 1.27, 1);
            placeholder.visible = false;
            const art = mesh(geometry(new T.PlaneGeometry(width, height)), material(new T.MeshBasicMaterial({ map: loaded, toneMapped: false })), group);
            art.position.z = 0.104;
            art.userData.artworkId = artwork.id;
            art.castShadow = false;
            caption.position.y = -(height + 0.26) / 2 - 0.19;
            render();
          }, undefined, markMissing);
          textures.add(texture);
        }
        roomArtworks.forEach(artworkFrame);

        if (!roomArtworks.length) {
          const emptyFrame = panel(2.3, 1.8, 0.1, 0.12, lightWood);
          emptyFrame.position.set(0.5, 2.6, -2.9);
          const paper = panel(2.03, 1.54, 0.025, 0.05, cream);
          paper.position.set(0.5, 2.6, -2.81);
          const note = label(isEnglish ? "Your artwork belongs here" : "여기에 우리의 작품이 걸려요", 1.85, 0.32);
          note.position.set(0.5, 2.6, -2.76);
        }
        }

        function resize() {
          if (!renderer || disposed || !host) return;
          const width = host.clientWidth;
          const height = host.clientHeight;
          if (!width || !height) return;
          renderer.setSize(width, height);
          const aspect = width / height;
          const halfHeight = isBuilding ? Math.max(4.1, 5.15 / aspect) : Math.max(5.45, 6.6 / aspect);
          camera.left = -halfHeight * aspect;
          camera.right = halfHeight * aspect;
          camera.top = halfHeight;
          camera.bottom = -halfHeight;
          camera.updateProjectionMatrix();
          render();
        }
        observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();
        setStatus("ready");
      } catch {
        disposeScene();
        disposeScene = undefined;
        if (!disposed) setStatus("fallback");
      }
    }

    initialize().catch(() => { if (!disposed) setStatus("fallback"); });
    return () => { disposed = true; disposeScene?.(); };
  }, [roomArtworks, currentPage, isEnglish, isBuilding, theme, buildingName]);

  return (
    <section className={`exhibition-scene${isBuilding ? " exhibition-scene-building" : ""}`} data-room-theme={theme} aria-label={isBuilding && buildingName ? `${buildingName} ${isEnglish ? "class gallery" : "학급 전시관"}` : isEnglish ? "Our miniature gallery" : "우리의 작은 전시관"}>
      <div className="exhibition-scene-heading">
        <span className="exhibition-scene-badge"><span aria-hidden="true">✿</span> {isEnglish ? "Our little gallery" : "우리의 작은 전시관"}</span>
        {!isBuilding && <span>{isEnglish ? `Art wall ${currentPage + 1} of ${pages}` : `작품벽 ${currentPage + 1} / ${pages}`}</span>}
      </div>
      <div className={`exhibition-scene-stage ${status === "fallback" ? "has-fallback" : ""}`}>
        <div className="exhibition-scene-canvas" ref={hostRef} />
        {status === "loading" && <div className="exhibition-scene-message" role="status"><span aria-hidden="true">✿</span>{isEnglish ? "Opening our little gallery…" : "작은 전시관의 문을 열고 있어요…"}</div>}
        {status === "fallback" && <div className="exhibition-scene-message" role="status"><span aria-hidden="true">▧</span>{isBuilding ? (isEnglish ? "A little gallery for big imaginations." : "작은 상상이 모이는 우리의 미술관") : (isEnglish ? "This device cannot open the 3D room. Choose an artwork below to enjoy it." : "이 기기에서는 3D 전시실을 열 수 없어요. 아래 작품을 눌러 감상해 주세요.")}</div>}
      </div>
      {!isBuilding && <div className="exhibition-scene-caption">
        <p>{roomArtworks.length ? (isEnglish ? "Tap a frame or choose a title to see the artwork up close." : "액자나 아래 제목을 누르면 작품을 크게 볼 수 있어요.") : (isEnglish ? "The room is ready for our artists." : "우리 반 작가들을 기다리는 전시실이에요.")}</p>
        {pages > 1 && <div className="exhibition-scene-pagination" aria-label={isEnglish ? "Artwork walls" : "작품벽 이동"}>
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label={isEnglish ? "Previous art wall" : "이전 작품벽"}>←</button>
          <span aria-live="polite">{currentPage + 1} / {pages}</span>
          <button type="button" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)} aria-label={isEnglish ? "Next art wall" : "다음 작품벽"}>→</button>
        </div>}
      </div>}
      {roomArtworks.length > 0 && <ul className="exhibition-scene-artworks" aria-label={isEnglish ? "Artworks in this room" : "이 전시실의 작품"}>
        {roomArtworks.map((artwork, index) => <li key={artwork.id}><button type="button" onClick={() => onSelect(artwork.id)}>
          <span className="exhibition-scene-number">{currentPage * ROOM_CAPACITY + index + 1}</span>
          <span>{artwork.title || (isEnglish ? "Untitled artwork" : "제목 없는 작품")}{failedImages.includes(artwork.id) && <small>{isEnglish ? "Image unavailable" : "사진을 불러올 수 없어요"}</small>}</span>
          <span className="exhibition-scene-artwork-arrow" aria-hidden="true">↗</span>
        </button></li>)}
      </ul>}
    </section>
  );
}
