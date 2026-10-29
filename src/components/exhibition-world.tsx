"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, DoorOpen, Images, Move, RotateCcw, Sparkles, X } from "lucide-react";
import type * as Three from "three";
import { exhibitionFrameSize, exhibitionRoomDimensions, exhibitionWallSlots, GALLERY_SCREEN, WORLD_WING_CAPACITY } from "@/lib/exhibition-world-layout";
import {createArtScreenPainter, type ArtScreenFrame} from '@/lib/exhibition-screen-painter';
import ExhibitionScreen from './exhibition-screen';
import WorldJoystick from './world-joystick';
import { createExhibitionLabelCanvas } from "@/lib/exhibition-label";
import {createWhitekneeWorldModel, type WorldCompanion} from '@/lib/whiteknee-world-model';
import "@/styles/exhibition-world.css";

export type WorldBuilding = { id: string; name: string };
export type WorldRoom = { id: string; title: string; description?: string; theme?: string; status?: string; artworkCount?: number };
export type WorldArtwork = { id: string; title: string; url?: string; thumbnailUrl?: string; artistName?: string; studentName?: string; width?: number; height?: number };
export type ExhibitionWorldProps = {
  stage: "campus" | "classroom" | "gallery";
  buildings: WorldBuilding[];
  buildingName?: string;
  rooms: WorldRoom[];
  artworks: WorldArtwork[];
  roomTitle?: string;
  theme?: "cozy" | "forest" | "sky" | "ocean";
  locale?: string;
  paused?: boolean;
  companion?: WorldCompanion | null;
  onEnterBuilding: (id: string) => void;
  onEnterRoom: (id: string) => void;
  onSelectArtwork: (id: string) => void;
  onExit: () => void;
};

type Action = { kind: "building" | "room" | "artwork" | "exit" | "screen"; id: string };
type Controls = { stick: (x: number, y: number) => void; direction: (key: string, active: boolean) => void; reset: () => void; refresh: () => void };
const PALETTES = {
  cozy: { wall: "#fff7e9", accent: "#bdd8c5", dark: "#6c9d89", coral: "#e99786", sky: "#d9eeec", rug: "#f2cec1" },
  forest: { wall: "#f7f5df", accent: "#b6ce9e", dark: "#70936c", coral: "#e6b487", sky: "#e4efd8", rug: "#cddcb4" },
  sky: { wall: "#f8f7ff", accent: "#c4d5e9", dark: "#829dc5", coral: "#dba9c0", sky: "#e5effb", rug: "#d9d3ed" },
  ocean: { wall: "#f3faf5", accent: "#a9d5cb", dark: "#5b9e9a", coral: "#eab0a0", sky: "#d7eef2", rug: "#bededb" },
};

/** A perspective world. Navigation belongs to the workspace; this component never fetches private records. */
export default function ExhibitionWorld(props: ExhibitionWorldProps) {
  const { stage, buildings, buildingName, rooms, artworks, roomTitle, theme = "cozy", locale = "ko", paused = false } = props;
  const english = locale.startsWith("en");
  const companionKey = JSON.stringify(props.companion || null);
  const rootRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  const pausedRef = useRef(paused);
  const controlsRef = useRef<Controls | null>(null);
  const screenPainter = useRef<((frame:ArtScreenFrame)=>void)|null>(null), screenFrame = useRef<ArtScreenFrame>({index:0,overview:false});
  const [screenExpanded,setScreenExpanded] = useState(false), [screenOpenSignal,setScreenOpenSignal] = useState(0);
  const showScreen = useCallback((frame:ArtScreenFrame)=>{screenFrame.current=frame;screenPainter.current?.(frame);},[]);
  const savedViews = useRef(new Map<string, { x: number; z: number; yaw: number; pitch: number }>());
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [indexOpen, setIndexOpen] = useState(false);
  const moveStick=useCallback((x:number,y:number)=>controlsRef.current?.stick(x,y),[]);
  const [failedImages, setFailedImages] = useState(0);
  const [loadedArtworkIds, setLoadedArtworkIds] = useState<string[]>([]);
  const [entering, setEntering] = useState(false);
  const [wingChoice, setWingChoice] = useState({ key: "", value: 0 });
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = matchMedia('(max-width:760px),(max-height:520px) and (pointer:coarse)');
    const update = () => setCompact(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const contextKey = `${stage}:${buildingName || ""}:${roomTitle || ""}`;
  const capacity = stage === "gallery" ? WORLD_WING_CAPACITY : stage === "campus" ? (compact ? 1 : 3) : 12;
  const items = stage === "gallery" ? artworks : stage === "campus" ? buildings : rooms;
  const wings = Math.max(1, Math.ceil(items.length / capacity));
  const wing = Math.min(wingChoice.key === contextKey ? wingChoice.value : 0, wings - 1);
  const packedData = JSON.stringify({
    buildings: stage === "campus" ? buildings.slice(wing * capacity, (wing + 1) * capacity) : [], buildingName, roomTitle,
    rooms: stage === "classroom" ? rooms.slice(wing * capacity, (wing + 1) * capacity) : [],
    artworks: stage === "gallery" ? artworks.slice(wing * capacity, (wing + 1) * capacity) : [],
  });
  const data = useMemo(() => JSON.parse(packedData) as {
    buildings: WorldBuilding[]; buildingName?: string; roomTitle?: string; rooms: WorldRoom[]; artworks: WorldArtwork[];
  }, [packedData]);

  useEffect(() => { callbacks.current = props; });
  useEffect(() => { pausedRef.current = paused || screenExpanded || indexOpen; controlsRef.current?.refresh(); }, [paused,screenExpanded,indexOpen]);
  useEffect(() => { setIndexOpen(false); }, [contextKey]);

  useEffect(() => {
    const host = hostRef.current;
    const root = rootRef.current;
    if (!host || !root) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    setStatus("loading");
    setFailedImages(0);
    setLoadedArtworkIds([]);
    setEntering(false);

    async function createWorld() {
      const T = await import("three");
      if (disposed || !host || !root) return;
      const geometries = new Set<Three.BufferGeometry>();
      const materials = new Set<Three.Material>();
      const textures = new Set<Three.Texture>();
      const materialCache = new Map<string, Three.MeshStandardMaterial>();
      const events: (() => void)[] = [];
      const scene = new T.Scene();
      const palette = PALETTES[theme];
      scene.background = new T.Color(stage === "campus" ? palette.sky : palette.wall);
      if (stage === "campus") scene.fog = new T.Fog(palette.sky, 45, 95);
      const camera = new T.PerspectiveCamera(stage === "campus" ? 54 : 64, 1, 0.09, 130);
      let renderer: Three.WebGLRenderer;
      try {
        renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
      } catch {
        if (!disposed) setStatus("fallback");
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.13;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      const canvas = renderer.domElement;
      canvas.setAttribute("aria-label", english ? "Walk through the exhibition. Drag to look, arrow keys to walk." : "전시 공간. 화면을 끌어 둘러보고 방향키로 걸어보세요.");
      canvas.tabIndex = 0;
      host.appendChild(canvas);
      const clickable: Three.Object3D[] = [];
      const raycaster = new T.Raycaster();
      const pointer = new T.Vector2();
      const keys = new Set<string>();
      const player = new T.Vector3(0, 0, stage === "campus" ? 8 : 2.3);
      const initialPlayer = player.clone();
      const viewKey = `${stage}:${data.buildingName || ""}:${data.roomTitle || ""}:${wing}`;
      const savedView = savedViews.current.get(viewKey);
      if (savedView) player.set(savedView.x, 0, savedView.z);
      let yaw = savedView?.yaw ?? 0;
      let pitch = savedView?.pitch ?? (stage === "campus" ? -0.08 : -0.045);
      let frame = 0;
      let lastTime = 0;
      let inView = true;
      let transitionTimer: ReturnType<typeof setTimeout> | undefined;
      let transitioning = false;
      let gait = 0;
      let width = 1;
      let height = 1;
      let lastPositionStamp = 0;
      const obstacles: { x: number; z: number; halfX: number; halfZ: number }[] = [];
      const campusColumns = Math.min(3, Math.max(1, data.buildings.length));
      const campusRows = Math.ceil(data.buildings.length / campusColumns);
      const roomDimensions = exhibitionRoomDimensions(data.artworks.length);
      const bounds = stage === "campus"
        ? { minX: -Math.max(14, campusColumns * 6), maxX: Math.max(14, campusColumns * 6), minZ: -Math.max(13, campusRows * 10), maxZ: 48 }
        : stage === "gallery" ? { minX: -roomDimensions.width / 2 + 0.85, maxX: roomDimensions.width / 2 - 0.85, minZ: -roomDimensions.depth / 2 + 0.85, maxZ: roomDimensions.depth / 2 - 0.85 }
          : { minX: -7.15, maxX: 7.15, minZ: -6.15, maxZ: 6.15 };
      player.x = T.MathUtils.clamp(player.x, bounds.minX, bounds.maxX);
      player.z = T.MathUtils.clamp(player.z, bounds.minZ, bounds.maxZ);

      const geo = <G extends Three.BufferGeometry,>(value: G) => { geometries.add(value); return value; };
      const mat = <M extends Three.Material,>(value: M) => { materials.add(value); return value; };
      function matte(color: string) {
        if (!materialCache.has(color)) materialCache.set(color, mat(new T.MeshStandardMaterial({ color, roughness: 0.82 })));
        return materialCache.get(color)!;
      }
      const cream = matte("#fff5df"), white = matte("#fffcf4"), wood = matte("#c59c78");
      const mint = matte(palette.accent), deepMint = matte(palette.dark), coral = matte(palette.coral);
      const sphereGeometry = geo(new T.SphereGeometry(1, 20, 14));
      const boxGeometry = geo(new T.BoxGeometry(1, 1, 1));
      function mesh(g: Three.BufferGeometry, m: Three.Material, parent: Three.Object3D = scene) {
        const object = new T.Mesh(g, m);
        object.castShadow = true;
        object.receiveShadow = true;
        parent.add(object);
        return object;
      }
      function ball(parent: Three.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, material: Three.Material) {
        const value = mesh(sphereGeometry, material, parent);
        value.position.set(x, y, z); value.scale.set(sx, sy, sz);
        return value;
      }
      function box(parent: Three.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, material: Three.Material) {
        const value = mesh(boxGeometry, material, parent);
        value.position.set(x, y, z); value.scale.set(w, h, d);
        return value;
      }
      function roundedShape(w: number, h: number, r: number) {
        const s = new T.Shape(), x = -w / 2, y = -h / 2;
        s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
      }
      function shaped(shape: Three.Shape, depth: number, material: Three.Material, parent: Three.Object3D, bevel = 0.04) {
        const geometry = geo(new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14, steps: 1 }));
        geometry.translate(0, 0, -depth / 2);
        return mesh(geometry, material, parent);
      }
      function rounded(parent: Three.Object3D, w: number, h: number, d: number, material: Three.Material, r = 0.16) {
        return shaped(roundedShape(w, h, Math.min(r, w / 2, h / 2)), d, material, parent);
      }
      function arch(parent: Three.Object3D, w: number, h: number, d: number, material: Three.Material) {
        const s = new T.Shape(), r = w / 2;
        s.moveTo(-r, -h / 2); s.lineTo(r, -h / 2); s.lineTo(r, h / 2 - r);
        s.absarc(0, h / 2 - r, r, 0, Math.PI, false); s.closePath();
        return shaped(s, d, material, parent);
      }
      function cylinder(parent: Three.Object3D, r1: number, r2: number, h: number, material: Three.Material) {
        return mesh(geo(new T.CylinderGeometry(r1, r2, h, 20)), material, parent);
      }
      function textPlane(parent: Three.Object3D, text: string, w: number, h: number, color = "#655643", bg?: string, size = 38, maxLines = 1) {
        const surface = createExhibitionLabelCanvas(text, w, h, { color, background: bg, fontSize: size, maxLines });
        const texture = new T.CanvasTexture(surface); texture.colorSpace = T.SRGBColorSpace; textures.add(texture);
        const plane = mesh(geo(new T.PlaneGeometry(w, h)), mat(new T.MeshBasicMaterial({ map: texture, transparent: !bg, depthWrite: !!bg, toneMapped: false })), parent);
        plane.castShadow = false;
        return plane;
      }
      function shadow(parent: Three.Object3D, x: number, z: number, radius: number, opacity = 0.1) {
        const surface = mesh(geo(new T.CircleGeometry(radius, 28)), mat(new T.MeshBasicMaterial({ color: "#71674d", transparent: true, opacity, depthWrite: false })), parent);
        surface.rotation.x = -Math.PI / 2; surface.position.set(x, 0.025, z); surface.castShadow = false;
      }
      function addAction(object: Three.Object3D, action: Action) { object.userData.worldAction = action; clickable.push(object); }
      function invoke(action: Action) {
        if (disposed || pausedRef.current || transitioning) return;
        if (action.kind === "screen") {setScreenOpenSignal(value=>value+1);return;}
        if (action.kind === "artwork") { callbacks.current.onSelectArtwork(action.id); return; }
        transitioning = true; keys.clear(); setEntering(true);
        transitionTimer = setTimeout(() => {
          if (disposed) return;
          if (action.kind === "building") callbacks.current.onEnterBuilding(action.id);
          else if (action.kind === "room") callbacks.current.onEnterRoom(action.id);
          else callbacks.current.onExit();
          transitioning = false; setEntering(false);
        }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 190);
      }
      function plant(x: number, z: number, scale = 1, parent: Three.Object3D = scene) {
        const group = new T.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); parent.add(group);
        const pot = cylinder(group, 0.34, 0.25, 0.55, coral); pot.position.y = 0.3;
        cylinder(group, 0.055, 0.065, 0.75, wood).position.y = 0.82;
        [[0, 1.35, 0], [-0.28, 1.13, 0.08], [0.29, 1.02, 0.08]].forEach(([a, b, c]) => ball(group, a, b, c, 0.38, 0.49, 0.32, mint));
      }
      function cloud(x: number, y: number, z: number, scale = 1) {
        const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(scale); scene.add(g);
        ball(g, 0, 0, 0, 1.25, 0.42, 0.48, white); ball(g, -0.42, 0.2, 0, 0.54, 0.55, 0.5, white); ball(g, 0.38, 0.32, 0, 0.68, 0.7, 0.52, white);
      }
      function tree(x: number, z: number, scale = 1) {
        const g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); scene.add(g);
        cylinder(g, 0.18, 0.27, 2, wood).position.y = 1;
        ball(g, 0, 2.55, 0, 1.1, 1.35, 0.95, mint);
        ball(g, -0.55, 2.05, 0.03, 0.78, 0.87, 0.8, matte("#a7c6a2"));
        ball(g, 0.57, 2.3, 0.1, 0.7, 0.94, 0.75, mint);
        shadow(scene, x, z, scale * 1.2, 0.055);
      }
      function character(kind: "cat" | "otter", scale: number) {
        const g = new T.Group(); g.scale.setScalar(scale);
        const fur = kind === "cat" ? cream : matte("#bd9776"), pink = matte("#efb4a9"), brown = matte("#6d4b3b");
        const body = ball(g, 0, 0.61, 0, 0.43, 0.56, 0.34, fur);
        ball(g, 0, 0.57, 0.29, 0.31, 0.37, 0.12, white);
        ball(g, 0, 1.16, 0.03, 0.57, 0.47, 0.43, fur);
        for (const side of [-1, 1]) {
          if (kind === "cat") {
            const ear = mesh(geo(new T.ConeGeometry(0.24, 0.45, 3)), fur, g); ear.position.set(side * 0.38, 1.6, 0.02); ear.rotation.z = -side * 0.2;
            const inside = mesh(geo(new T.ConeGeometry(0.115, 0.25, 3)), pink, g); inside.position.set(side * 0.38, 1.63, 0.13); inside.rotation.z = -side * 0.2;
          } else { ball(g, side * 0.48, 1.43, -0.03, 0.19, 0.19, 0.13, fur); ball(g, side * 0.48, 1.43, 0.07, 0.11, 0.11, 0.05, pink); }
          ball(g, side * 0.185, 1.21, 0.424, 0.038, 0.05, 0.027, brown);
          ball(g, side * 0.3, 1.08, 0.413, 0.105, 0.06, 0.021, pink);
          const arm = ball(g, side * 0.43, 0.68, 0.02, 0.13, 0.27, 0.14, fur); arm.rotation.z = side * 0.16;
        }
        ball(g, 0, 1.13, 0.47, 0.055, 0.037, 0.025, brown);
        const mouth = new T.CatmullRomCurve3([new T.Vector3(-0.1, 1.07, 0.448), new T.Vector3(-0.05, 1.045, 0.46), new T.Vector3(0, 1.08, 0.475), new T.Vector3(0.05, 1.045, 0.46), new T.Vector3(0.1, 1.07, 0.448)]);
        mesh(geo(new T.TubeGeometry(mouth, 12, 0.011, 5, false)), brown, g);
        const feet = [-1, 1].map(side => ball(g, side * 0.23, 0.13, 0.13, 0.21, 0.14, 0.29, fur));
        const tail = ball(g, 0.42, 0.37, -0.32, 0.17, 0.42, 0.19, fur); tail.rotation.z = -0.7;
        if (kind === "otter") {
          const beret = ball(g, 0.09, 1.58, 0.015, 0.43, 0.13, 0.35, mint); beret.rotation.z = -0.18;
          ball(g, 0.13, 1.71, 0.015, 0.045, 0.08, 0.045, deepMint);
        } else { const scarf = rounded(g, 0.64, 0.12, 0.42, coral, 0.06); scarf.position.set(0, 0.91, 0.03); }
        return { group: g, feet, body };
      }

      scene.add(new T.HemisphereLight("#fffef8", "#c6bba5", 2.4));
      if (stage !== "campus") scene.add(new T.AmbientLight("#fff9ee", 0.75));
      const sunlight = new T.DirectionalLight("#fff5dc", 2.1); sunlight.position.set(-6, 12, 8); sunlight.castShadow = true;
      sunlight.shadow.mapSize.set(1024, 1024); sunlight.shadow.camera.left = -23; sunlight.shadow.camera.right = 23;
      sunlight.shadow.camera.top = 22; sunlight.shadow.camera.bottom = -22; sunlight.shadow.normalBias = 0.04;
      scene.add(sunlight);

      function floorAndWalls() {
        const w = stage === "gallery" ? roomDimensions.width : 16, depth = stage === "gallery" ? roomDimensions.depth : 14, h = stage === "gallery" ? 7.2 : 6.3;
        box(scene, 0, -0.1, 0, w, 0.2, depth, matte("#e3c7a5"));
        for (let row = 0; row < Math.ceil(depth / 0.72); row++) {
          const z = -depth / 2 + row * 0.72;
          box(scene, 0, 0.006, z, w, 0.008, 0.014, matte("#d3b899"));
          for (let col = 0; col < 4; col++) box(scene, -w / 2 + col * w / 4 + (row % 2 ? 1.4 : 0), 0.008, z + 0.36, 0.014, 0.008, 0.7, matte("#d3b899"));
        }
        box(scene, 0, h / 2, -depth / 2 - 0.12, w + 0.4, h, 0.24, matte(palette.wall));
        box(scene, -w / 2 - 0.12, h / 2, 0, 0.24, h, depth, matte(palette.wall));
        box(scene, w / 2 + 0.12, h / 2, 0, 0.24, h, depth, matte(palette.wall));
        const ceiling = box(scene, 0, h + 0.12, 0, w + 0.4, 0.24, depth, mat(new T.MeshBasicMaterial({ color: "#fff9ed", toneMapped: false })));
        ceiling.castShadow = false;
        // The entry wall is behind the initial camera, keeping the experience inside an actual room.
        box(scene, -w / 4 - 0.7, h / 2, depth / 2, w / 2 - 1.4, h, 0.22, matte(palette.wall));
        box(scene, w / 4 + 0.7, h / 2, depth / 2, w / 2 - 1.4, h, 0.22, matte(palette.wall));
        box(scene, 0, 4.9, depth / 2, 2.8, 2.8, 0.22, matte(palette.wall));
        box(scene, 0, 0.48, -depth / 2 + 0.015, w, 0.96, 0.08, mint);
        for (const side of [-1, 1]) box(scene, side * (w / 2 - 0.03), 0.48, 0, 0.08, 0.96, depth, mint);
        box(scene, 0, 0.99, -depth / 2 + 0.04, w, 0.08, 0.11, white);
        for (const side of [-1, 1]) box(scene, side * (w / 2 - 0.04), 0.99, 0, 0.11, 0.08, depth, white);
        const doorway = new T.Group(); doorway.position.set(0, 1.8, depth / 2 - 0.12); doorway.rotation.y = Math.PI; scene.add(doorway);
        arch(doorway, 2.5, 3.5, 0.13, white); arch(doorway, 2.15, 3.2, 0.16, deepMint).position.z = 0.1;
        const exitLabel = textPlane(doorway, english ? "← BACK" : "← 돌아가기", 1.8, 0.38, "#fffdf5"); exitLabel.position.set(0, 0.1, 0.21);
        addAction(doorway, { kind: "exit", id: "exit" });
        const rug = rounded(scene, 4.6, 3.1, 0.03, matte(palette.rug), 0.65); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.025, 2.6);
        // Warm, small string lights sit well above the artwork rows.
        const points = Array.from({ length: 21 }, (_, i) => new T.Vector3(-w / 2 + 0.5 + i * (w - 1) / 20, h - .48 - Math.sin(i / 20 * Math.PI) * 0.3, -depth / 2 + 0.48));
        mesh(geo(new T.TubeGeometry(new T.CatmullRomCurve3(points), 40, 0.016, 5, false)), wood);
        points.filter((_, i) => i % 2 === 0).forEach(point => ball(scene, point.x, point.y - 0.1, point.z, 0.065, 0.09, 0.065, matte("#fff0bf")));
        plant(-w / 2 + 0.65, -depth / 2 + 0.9, 1.3); plant(w / 2 - 0.65, -depth / 2 + 0.9, 1.3);
      }

      function schoolBuilding(building: WorldBuilding, index: number) {
        const x = (index % campusColumns - (campusColumns - 1) / 2) * 11;
        const z = -3 - Math.floor(index / campusColumns) * 10;
        const group = new T.Group(); group.position.set(x, 0, z); scene.add(group);
        const buildingMaterial = matte(index % 3 === 1 ? "#f9efdc" : index % 3 === 2 ? "#f7eee7" : "#fff1db");
        const body = rounded(group, 8.2, 4.7, 4.2, buildingMaterial, 0.65); body.position.y = 2.55;
        const roof = rounded(group, 8.9, 0.74, 4.7, coral, 0.35); roof.position.y = 5.04;
        const top = rounded(group, 6.8, 0.5, 3.9, matte("#efa896"), 0.24); top.position.y = 5.57;
        const tower = rounded(group, 2.25, 1.5, 1.0, cream, 0.4); tower.position.set(0, 5.25, 2.0);
        const littleRoof = rounded(group, 2.75, 0.48, 1.5, coral, 0.23); littleRoof.position.set(0, 6.18, 2.0);
        const clock = mesh(geo(new T.CircleGeometry(0.48, 32)), white, group); clock.position.set(0, 5.25, 2.56);
        const hand = box(group, 0.07, 5.32, 2.58, 0.06, 0.31, 0.02, wood); hand.rotation.z = -0.55;
        box(group, -0.08, 5.25, 2.58, 0.26, 0.055, 0.02, wood);
        const door = new T.Group(); door.position.set(0, 1.45, 2.19); group.add(door);
        arch(door, 2.2, 2.85, 0.2, white); arch(door, 1.82, 2.56, 0.22, deepMint).position.z = 0.14;
        ball(door, 0.53, -0.25, 0.29, 0.075, 0.075, 0.075, matte("#e9c992"));
        box(group, 0, 0.17, 2.52, 3.1, 0.25, 1.05, cream);
        box(group, 0, 0.07, 3.0, 3.6, 0.12, 0.8, cream);
        for (const side of [-1, 1]) {
          const windowGroup = new T.Group(); windowGroup.position.set(side * 2.65, 2.85, 2.18); group.add(windowGroup);
          arch(windowGroup, 1.62, 2.3, 0.16, white); arch(windowGroup, 1.33, 2.04, 0.16, matte("#bddce0")).position.z = 0.1;
          box(windowGroup, 0, -0.1, 0.21, 0.075, 1.8, 0.03, white); box(windowGroup, 0, -0.06, 0.21, 1.3, 0.075, 0.03, white);
          const boxFlowers = rounded(group, 1.75, 0.28, 0.52, coral, 0.11); boxFlowers.position.set(side * 2.65, 1.64, 2.43);
          for (const flower of [-1, 0, 1]) { ball(group, side * 2.65 + flower * 0.42, 1.92, 2.42, 0.17, 0.19, 0.17, mint); ball(group, side * 2.65 + flower * 0.42, 2.03, 2.43, 0.11, 0.1, 0.11, matte(flower === 0 ? "#f4ce79" : "#edb3bd")); }
        }
        const sign = rounded(group, 3.5, 0.64, 0.13, white, 0.18); sign.position.set(0, 3.57, 2.29);
        textPlane(group, building.name, 3.22, 0.5).position.set(0, 3.57, 2.42);
        addAction(group, { kind: "building", id: building.id });
        obstacles.push({ x, z, halfX: 4.42, halfZ: 2.3 });
      }

      function poster(room: WorldRoom, index: number) {
        const group = new T.Group();
        if (index < 6) {
          const rowCount = Math.min(3, data.rooms.length - Math.floor(index / 3) * 3);
          group.position.set(((index % 3) - (rowCount - 1) / 2) * 3.55, index < 3 ? 3.95 : 1.95, -6.82);
        }
        else { const left = index < 9; group.position.set(left ? -7.83 : 7.83, 3.0, ((index - 6) % 3 - 1) * 3.4); group.rotation.y = left ? Math.PI / 2 : -Math.PI / 2; }
        scene.add(group);
        const color = PALETTES[(room.theme && room.theme in PALETTES ? room.theme : "cozy") as keyof typeof PALETTES];
        rounded(group, 2.7, 1.65, 0.13, wood, 0.13);
        rounded(group, 2.52, 1.48, 0.1, matte(color.accent), 0.1).position.z = 0.095;
        // Every real room has a different little illustration, not an invented exhibition.
        const mini = new T.Group(); mini.position.set(-0.82, 0.1, 0.24); mini.scale.setScalar(0.43); group.add(mini);
        if (room.theme === "forest") { ball(mini, 0, 0.22, 0, 0.65, 0.9, 0.18, matte(color.dark)); box(mini, 0, -0.57, 0, 0.2, 0.55, 0.2, wood); }
        else if (room.theme === "ocean") { ball(mini, 0, 0, 0, 0.8, 0.46, 0.2, white); const fin = mesh(geo(new T.ConeGeometry(0.45, 0.5, 3)), white, mini); fin.rotation.z = Math.PI / 2; fin.position.x = -0.7; ball(mini, 0.36, 0.12, 0.2, 0.065, 0.065, 0.04, deepMint); }
        else if (room.theme === "sky") { ball(mini, 0, 0, 0, 0.95, 0.4, 0.18, white); ball(mini, 0, 0.35, 0, 0.48, 0.48, 0.18, white); }
        else { const miniCat = character("cat", 0.7); miniCat.group.position.y = -0.55; mini.add(miniCat.group); }
        textPlane(group, room.title, 1.5, 0.66, "#49695d", undefined, 32, 2).position.set(0.39, 0.2, 0.205);
        textPlane(group, english ? `${room.artworkCount ?? 0} artworks · ENTER` : `${room.artworkCount ?? 0}개의 작품 · 입장`, 1.66, 0.3, "#49695d", undefined, 21).position.set(0.35, -0.34, 0.21);
        ball(group, 0, 0.75, 0.19, 0.075, 0.075, 0.07, coral);
        addAction(group, { kind: "room", id: room.id });
      }

      const textureJobs: { artwork: WorldArtwork; picture: Three.Mesh<Three.PlaneGeometry, Three.MeshBasicMaterial>; placeholder: Three.Object3D; w: number; h: number; resize: (width: number, height: number) => void }[] = [];
      function artworkFrame(artwork: WorldArtwork, index: number, slot: ReturnType<typeof exhibitionWallSlots>[number]) {
        const group = new T.Group(); group.position.set(slot.x, slot.y, slot.z); group.rotation.y = slot.rotationY; scene.add(group);
        const rim=box(group,0,0,.06,1,1,.12,matte("#c9baa2"));
        const mount=box(group,0,0,.125,1,1,.025,white);mount.castShadow=false;
        const placeholder=textPlane(group,artwork.title,1.2,.5,"#9e998b","#fffdf8",24,2);placeholder.position.z=.145;
        const picture=new T.Mesh(geo(new T.PlaneGeometry(1,1)),mat(new T.MeshBasicMaterial({color:"#ffffff",toneMapped:false})));
        picture.position.z=.15;picture.visible=false;group.add(picture);
        const plaque=rounded(group,2.3,.27,.025,white,.045);
        const caption=textPlane(group,`${wing*WORLD_WING_CAPACITY+index+1}. ${artwork.title}${artwork.artistName||artwork.studentName?` · ${artwork.artistName||artwork.studentName}`:""}`,2.17,.25,"#655643",undefined,21);
        function resize(width:number,height:number){const size=exhibitionFrameSize(width,height);rim.scale.set(size.width,size.height,.12);mount.scale.set(size.width-size.border*2,size.height-size.border*2,.025);picture.scale.set(size.imageWidth,size.imageHeight,1);plaque.position.set(0,-size.height/2-.23,.025);caption.position.set(0,-size.height/2-.23,.11);}
        resize(artwork.width||3,artwork.height||2);
        textureJobs.push({artwork,picture,placeholder,w:2.05,h:2.05,resize});
        addAction(group,{kind:"artwork",id:artwork.id});
      }
      function artScreen() {
        const screen=GALLERY_SCREEN,group=new T.Group();scene.add(group);
        group.position.z=-roomDimensions.depth/2+.34;
        const rim=box(group,0,screen.y,.06,1,1,.12,matte("#bfb7a8"));
        const mount=box(group,0,screen.y,.125,1,1,.025,white);mount.castShadow=false;
        const surface=document.createElement('canvas');let texture=new T.CanvasTexture(surface),textureWidth=0,textureHeight=0;texture.colorSpace=T.SRGBColorSpace;textures.add(texture);
        const screenMaterial=mat(new T.MeshBasicMaterial({map:texture,toneMapped:false}));
        const picture=mesh(geo(new T.PlaneGeometry(1,1)),screenMaterial,group);
        picture.position.set(0,screen.y,.15);picture.castShadow=false;
        const painter=createArtScreenPainter(surface,callbacks.current.artworks,size=>{
          // WebGL texture storage is immutable. A portrait/landscape or overview
          // resize needs a new texture, including after a thumbnail first loads.
          if(surface.width!==textureWidth||surface.height!==textureHeight){
            textures.delete(texture);texture.dispose();texture=new T.CanvasTexture(surface);
            texture.colorSpace=T.SRGBColorSpace;textures.add(texture);screenMaterial.map=texture;screenMaterial.needsUpdate=true;
            textureWidth=surface.width;textureHeight=surface.height;
          }
          rim.scale.set(size.width,size.height,.12);mount.scale.set(size.width-.09,size.height-.09,.025);picture.scale.set(size.imageWidth,size.surfaceHeight,1);root!.dataset.screenFrameSize=`${size.width.toFixed(3)},${size.height.toFixed(3)}`;texture.needsUpdate=true;invalidate();
        });
        screenPainter.current=frame=>{root!.dataset.screenIndex=String(frame.index+1);root!.dataset.screenMode=frame.overview?'overview':'slideshow';painter.show(frame);};
        screenPainter.current(screenFrame.current);
        events.push(()=>{screenPainter.current=null;painter.dispose();});
        addAction(group,{kind:'screen',id:'art-screen'});
      }

      if (stage === "campus") {
        box(scene, 0, -0.25, -10, 110, 0.5, 110, matte("#c9dda9"));
        const path = rounded(scene, 5.2, 42, 0.04, matte("#f4e5cb"), 1.4); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.014, 3);
        const crossPath = rounded(scene, Math.max(18, campusColumns * 12), 4.3, 0.04, matte("#f4e5cb"), 1.4); crossPath.rotation.x = -Math.PI / 2; crossPath.position.set(0, 0.019, 2.5);
        data.buildings.forEach(schoolBuilding);
        tree(-Math.max(7, campusColumns * 5.6), 0, 1.4); tree(Math.max(7, campusColumns * 5.6), 0, 1.3); tree(-9, 10, 0.8); tree(10, 11, 0.9);
        cloud(-12, 9, -17, 2); cloud(10, 9.5, -20, 2.2); cloud(0, 12, -30, 2);
        const rainbow = new T.Group(); rainbow.position.set(-11, 0, -24); scene.add(rainbow);
        ["#e6aaaa", "#f3d89b", "#bad6b6", "#adccdb"].forEach((color, i) => mesh(geo(new T.TorusGeometry(13 - i * 0.47, 0.2, 8, 48, Math.PI)), matte(color), rainbow));
        for (let i = 0; i < 18; i++) {
          const side = i % 2 ? 1 : -1, x = side * (3.8 + (i % 3) * 1.7), z = 4 + Math.floor(i / 3) * 1.9;
          cylinder(scene, 0.025, 0.03, 0.27, deepMint).position.set(x, 0.15, z);
          for (let p = 0; p < 5; p++) ball(scene, x + Math.cos(p * Math.PI * 0.4) * 0.09, 0.32, z + Math.sin(p * Math.PI * 0.4) * 0.09, 0.075, 0.05, 0.075, matte(i % 3 ? "#f0babc" : "#f3dc9a"));
        }
        if (!data.buildings.length) {
          const sign = rounded(scene, 6, 1.2, 0.15, white, 0.25); sign.position.set(0, 2.4, -2);
          textPlane(scene, english ? "Your class building will grow here" : "우리 반 건물이 이곳에 생겨요", 5.7, 0.85).position.set(0, 2.4, -1.9);
        }
      } else {
        floorAndWalls();
        if (stage === "classroom") {
          data.rooms.forEach(poster);
          const title = textPlane(scene, english ? `${data.buildingName || "Our class"} · EXHIBITIONS` : `${data.buildingName || "우리 반"}의 작은 전시회`, 9.5, 0.55, palette.dark); title.position.set(0, 5.4, -6.85);
          // Small window and a low book nook make the lobby feel like a classroom.
          const windowGroup = new T.Group(); windowGroup.position.set(-7.78, 3.0, 3.55); windowGroup.rotation.y = Math.PI / 2; scene.add(windowGroup);
          arch(windowGroup, 2.3, 3.1, 0.1, white); arch(windowGroup, 2.03, 2.8, 0.1, matte(palette.sky)).position.z = 0.08;
          box(windowGroup, 0, 0, 0.15, 0.07, 2.5, 0.025, white); box(windowGroup, 0, -0.15, 0.15, 2, 0.07, 0.025, white);
          const shelf = rounded(scene, 3.2, 0.8, 0.8, wood, 0.13); shelf.position.set(5.2, 0.44, 4.7);
          ["#a9c8b5", "#e9b5a5", "#e7d39b", "#b9cae1", "#cbbbd3"].forEach((color, i) => box(scene, 4.2 + i * 0.39, 1.08, 4.7, 0.27, 0.5 + (i % 2) * 0.14, 0.43, matte(color)));
          obstacles.push({ x: 5.2, z: 4.7, halfX: 1.8, halfZ: 0.6 });
          if (!data.rooms.length) {
            const board = rounded(scene, 6.6, 2.55, 0.15, mint, 0.25); board.position.set(0, 3.1, -6.82);
            textPlane(scene, english ? "A new exhibition is coming!" : "새로운 전시회를 기다리고 있어요!", 5.7, 0.9, "#49695d").position.set(0, 3.2, -6.71);
          }
        } else {
          const slots = exhibitionWallSlots(data.artworks.length);
          data.artworks.forEach((artwork, index) => artworkFrame(artwork, index, slots[index]));
          artScreen();
          textPlane(scene, data.roomTitle || (english ? "Our little gallery" : "우리들의 작은 전시회"), 8, 0.46, palette.dark).position.set(0, 6.75, -roomDimensions.depth / 2 + 0.18);
          const bench = rounded(scene, 3.5, 0.28, 1.0, cream, 0.14); bench.position.set(0, 0.58, -0.45);
          box(scene, -1.3, 0.26, -0.45, 0.23, 0.51, 0.7, wood); box(scene, 1.3, 0.26, -0.45, 0.23, 0.51, 0.7, wood);
          obstacles.push({ x: 0, z: -0.45, halfX: 1.95, halfZ: 0.75 });
          if (theme === "forest") { plant(-8.3, 5.7, 1.7); plant(8.3, 5.7, 1.6); }
          if (theme === "sky") { cloud(-roomDimensions.width / 2 + 1.3, 5.6, -roomDimensions.depth / 2 + 1.5, 0.7); cloud(roomDimensions.width / 2 - 1.3, 5.65, -roomDimensions.depth / 2 + 1.5, 0.7); }
          if (theme === "ocean") {
            for (const side of [-1, 1]) { const fish = ball(scene, side * (roomDimensions.width / 2 - 2.3), 5.55, -roomDimensions.depth / 2 + 0.5, 0.5, 0.23, 0.1, mint); fish.rotation.z = side * 0.16; ball(scene, side * (roomDimensions.width / 2 - 2.3) + 0.22, 5.57, -roomDimensions.depth / 2 + 0.61, 0.025, 0.03, 0.02, deepMint); }
          }
        }
      }

      const look = JSON.parse(companionKey) as WorldCompanion | null;
      const whiteknee = look?.pet === 'animal-whiteknee' ? createWhitekneeWorldModel(T, look) : null;
      const cat = whiteknee || character("cat", 0.82); scene.add(cat.group);
      const animatePlayer = (phase: number, moving: boolean) => {
        if (whiteknee) {whiteknee.animate(phase, moving); return;}
        const classic = cat as ReturnType<typeof character>;
        classic.feet.forEach((foot, i) => {foot.position.y = .13 + (moving ? Math.max(0, Math.sin(phase + i * Math.PI)) * .11 : 0);});
        classic.body.position.y = .61 + (moving ? Math.sin(phase * 2) * .015 : 0);
      };
      const guide = character("otter", stage === "campus" ? 1.04 : 0.95);
      guide.group.position.set(stage === "campus" ? 2.7 : stage === "gallery" ? 3.2 : -4.8, 0, stage === "campus" ? 4.7 : stage === "gallery" ? -1.9 : 1.6);
      guide.group.rotation.y = stage === "campus" ? -0.25 : 0.3; scene.add(guide.group);
      if (stage !== "gallery") {
        const guideSign = textPlane(scene, english ? "Moa · welcome!" : "모아와 함께 구경해요!", 2.3, 0.34, palette.dark, "#fff9ed", 28);
        guideSign.position.set(guide.group.position.x, 2.12, guide.group.position.z);
      }
      shadow(scene, guide.group.position.x, guide.group.position.z, 0.7, 0.075);

      function active() { return !disposed && !pausedRef.current && !document.hidden && inView && !renderer.getContext().isContextLost(); }
      function updateCamera() {
        let follow = stage === "campus" ? 5.8 : 3.75;
        // Fit the whole facade on portrait screens instead of cropping its sides.
        if (stage === 'campus') follow = Math.max(follow, 4.9 / (Math.tan(T.MathUtils.degToRad(27)) * camera.aspect * .84) - 8.65);
        // A camera following the child must not go through the class building when they turn around.
        if (stage === "campus") {
          const directionX = -Math.sin(yaw), directionZ = Math.cos(yaw);
          for (const obstacle of obstacles) {
            let near = 0, far = follow;
            for (const [position, direction, center, half] of [[player.x, directionX, obstacle.x, obstacle.halfX], [player.z, directionZ, obstacle.z, obstacle.halfZ]]) {
              if (Math.abs(direction) < 0.0001) { if (Math.abs(position - center) > half + 0.2) { far = -1; break; } }
              else {
                const a = (center - half - 0.2 - position) / direction, b = (center + half + 0.2 - position) / direction;
                near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
              }
            }
            if (far >= near && near < follow) follow = Math.max(0.35, near - 0.25);
          }
        }
        const cameraX = player.x - Math.sin(yaw) * follow, cameraZ = player.z + Math.cos(yaw) * follow;
        const portraitCampus = stage === 'campus' && camera.aspect < .85;
        camera.position.set(T.MathUtils.clamp(cameraX, bounds.minX + 0.15, bounds.maxX - 0.15), stage === "campus" ? (portraitCampus ? 5.6 : 3.6) : 2.3, T.MathUtils.clamp(cameraZ, bounds.minZ + 0.15, bounds.maxZ - 0.15));
        const viewPitch = pitch - (portraitCampus ? .05 : 0) - (whiteknee ? (stage === 'campus' ? .10 : .30) : 0);
        camera.lookAt(camera.position.x + Math.sin(yaw) * 10, camera.position.y + Math.sin(viewPitch) * 10, camera.position.z - Math.cos(yaw) * 10);
        cat.group.position.copy(player);
        cat.group.visible = camera.position.distanceTo(new T.Vector3(player.x, 1.1, player.z)) > 1.65;
      }
      const stick={x:0,y:0};
      function canStand(x: number, z: number) {
        const radius = whiteknee ? .67 : .26;
        return !obstacles.some(o => Math.abs(x - o.x) < o.halfX + radius && Math.abs(z - o.z) < o.halfZ + radius);
      }
      function draw(now: number) {
        frame = 0;
        if (!active()) { lastTime = 0; return; }
        const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.045) : 1 / 60; lastTime = now;
        const forward = -stick.y + Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
        const side = stick.x + Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
        const moving = !transitioning && (forward !== 0 || side !== 0);
        if (moving) {
          const length = Math.max(1,Math.hypot(forward, side)), speed = dt * (stage === "campus" ? 3.8 : 3.1) / length;
          const dx = (Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed;
          const dz = (-Math.cos(yaw) * forward + Math.sin(yaw) * side) * speed;
          const nx = T.MathUtils.clamp(player.x + dx, bounds.minX, bounds.maxX);
          const nz = T.MathUtils.clamp(player.z + dz, bounds.minZ, bounds.maxZ);
          if (canStand(nx, player.z)) player.x = nx;
          if (canStand(player.x, nz)) player.z = nz;
          cat.group.rotation.y = Math.atan2(dx, dz);
          gait += dt * 12;
          animatePlayer(gait, true);
        } else { animatePlayer(gait, false); }
        updateCamera(); renderer.render(scene, camera);
        if (now - lastPositionStamp > 100 || !moving) {
          root!.dataset.playerPosition = `${player.x.toFixed(3)},${player.z.toFixed(3)}`;
          root!.dataset.cameraPosition = camera.position.toArray().map(value => value.toFixed(3)).join(",");
          root!.dataset.cameraHeading = `${yaw.toFixed(3)},${pitch.toFixed(3)}`;
          root!.dataset.cameraFov = String(camera.fov);
          lastPositionStamp = now;
        }
        if (moving) invalidate();
      }
      function invalidate() { if (!frame && active()) frame = requestAnimationFrame(draw); }
      function reset() { player.copy(initialPlayer); yaw = 0; pitch = stage === "campus" ? -0.08 : -0.045; cat.group.rotation.y = 0; keys.clear();stick.x=stick.y=0; invalidate(); }
      controlsRef.current = {
        stick:(x,y)=>{stick.x=pausedRef.current?0:x;stick.y=pausedRef.current?0:y;invalidate();},
        direction: (key, down) => { if (down && !pausedRef.current) keys.add(key); else keys.delete(key); invalidate(); },
        reset,
        refresh: () => { if (pausedRef.current) {keys.clear();stick.x=stick.y=0;} invalidate(); },
      };

      const textureLoader = new T.TextureLoader(); textureLoader.setCrossOrigin("anonymous");
      let textureQueueIndex = 0;
      function loadNextTexture() {
        if (disposed || textureQueueIndex >= textureJobs.length) return;
        const job = textureJobs[textureQueueIndex++], source = job.artwork.thumbnailUrl || job.artwork.url;
        if (!source) { loadNextTexture(); return; }
        textureLoader.load(source, texture => {
          if (disposed) { texture.dispose(); return; }
          // The source is normally the server thumbnail; cap GPU memory even for legacy full-size photos.
          const image = texture.image as HTMLImageElement;
          const imageWidth = image.naturalWidth || image.width || job.artwork.width || 1;
          const imageHeight = image.naturalHeight || image.height || job.artwork.height || 1;
          if (Math.max(imageWidth, imageHeight) > 768) {
            const scaled = document.createElement("canvas"), ratio = 768 / Math.max(imageWidth, imageHeight);
            scaled.width = Math.max(1, Math.round(imageWidth * ratio)); scaled.height = Math.max(1, Math.round(imageHeight * ratio));
            const context = scaled.getContext("2d");
            if (context) { context.drawImage(image, 0, 0, scaled.width, scaled.height); (texture as Three.Texture).image = scaled; }
          }
          texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); texture.needsUpdate = true;
          textures.add(texture); job.picture.material.map = texture; job.picture.material.needsUpdate = true;
          job.resize(imageWidth,imageHeight);
          job.placeholder.visible = false; job.picture.visible = true; setLoadedArtworkIds(ids => [...ids, job.artwork.id]); invalidate(); loadNextTexture();
        }, undefined, () => { if (!disposed) { setFailedImages(value => value + 1); loadNextTexture(); } });
      }
      // Four concurrent thumbnail loads prevent large exhibitions monopolizing the connection.
      for (let i = 0; i < Math.min(4, textureJobs.length); i++) loadNextTexture();

      function actionAt(event: PointerEvent) {
        const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(clickable, true);
        for (const hit of hits) {
          let object: Three.Object3D | null = hit.object;
          while (object) { if (object.userData.worldAction) return object.userData.worldAction as Action; object = object.parent; }
        }
        return undefined;
      }
      let drag: { id: number; x: number; y: number; originX: number; originY: number; moved: boolean } | null = null;
      const down = (event: PointerEvent) => {
        if (pausedRef.current || event.button !== 0) return;
        canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, moved: false };
      };
      const move = (event: PointerEvent) => {
        if (pausedRef.current) return;
        if (drag && drag.id === event.pointerId) {
          const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
          drag.moved ||= Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) > 6;
          if (drag.moved) { yaw -= dx * 0.005; pitch = T.MathUtils.clamp(pitch + dy * 0.003, -0.22, 0.27); invalidate(); }
          drag.x = event.clientX; drag.y = event.clientY;
          canvas.style.cursor = drag.moved ? "grabbing" : "grab";
        } else canvas.style.cursor = actionAt(event) ? "pointer" : "grab";
      };
      const up = (event: PointerEvent) => {
        if (!drag || drag.id !== event.pointerId) return;
        const clicked = !drag.moved; drag = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        canvas.style.cursor = "grab";
        if (clicked) { const action = actionAt(event); if (action) invoke(action); }
      };
      const cancel = () => { drag = null; keys.clear();stick.x=stick.y=0;invalidate(); };
      const keydown = (event: KeyboardEvent) => {
        if (!root.contains(document.activeElement) || (event.target instanceof HTMLElement && event.target.matches("input, textarea, select, [contenteditable=true]"))) return;
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
          event.preventDefault(); if (!pausedRef.current) keys.add(event.code); invalidate();
        } else if (event.code === "KeyR") reset();
      };
      const keyup = (event: KeyboardEvent) => { keys.delete(event.code); invalidate(); };
      const visibility = () => { keys.clear();stick.x=stick.y=0; lastTime = 0; invalidate(); };
      const contextLost = (event: Event) => { event.preventDefault(); keys.clear(); if (!disposed) setStatus("fallback"); };
      canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", cancel); canvas.addEventListener("lostpointercapture", cancel); canvas.addEventListener("webglcontextlost", contextLost);
      window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", cancel); document.addEventListener("visibilitychange", visibility);
      events.push(() => {
        canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", cancel); canvas.removeEventListener("lostpointercapture", cancel); canvas.removeEventListener("webglcontextlost", contextLost);
        window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", cancel); document.removeEventListener("visibilitychange", visibility);
      });
      const resize = new ResizeObserver(() => {
        width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false); camera.aspect = width / height;
        // Preserve a comfortable horizontal view on a portrait phone.
        if(stage!=='campus')camera.fov=Math.min(94,Math.max(64,T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(32))*.62/camera.aspect))));
        camera.updateProjectionMatrix(); invalidate();
      }); resize.observe(host);
      const intersection = new IntersectionObserver(entries => { inView = entries[0]?.isIntersecting ?? true; if (!inView) {keys.clear();stick.x=stick.y=0;} invalidate(); }, { threshold: 0.01 }); intersection.observe(host);
      cleanup = () => {
        savedViews.current.set(viewKey, { x: player.x, z: player.z, yaw, pitch });
        if (frame) cancelAnimationFrame(frame);
        if (transitionTimer) clearTimeout(transitionTimer);
        resize.disconnect(); intersection.disconnect(); events.forEach(remove => remove());
        controlsRef.current = null;
        whiteknee?.dispose();
        textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
        renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      };
      setStatus("ready"); invalidate();
    }
    createWorld().catch(() => { cleanup?.(); if (!disposed) setStatus("fallback"); });
    return () => { disposed = true; cleanup?.(); };
  }, [data, stage, theme, english, wing, companionKey]);

  const title = stage === "campus" ? (english ? "Our little exhibition school" : "우리들의 작은 전시학교") : stage === "classroom" ? buildingName || (english ? "Our classroom" : "우리 반 교실") : roomTitle || (english ? "Our exhibition" : "우리들의 전시회");
  const indexTitle = stage === "campus" ? (english ? "Choose a classroom" : "우리 반 찾기") : stage === "classroom" ? (english ? "All exhibitions" : "전시실 모두 보기") : (english ? "All artworks" : "작품 모두 보기");
  const indexVisible = indexOpen || status === "fallback";

  return <section ref={rootRef} className={`ex-world ex-world--${stage}${paused || screenExpanded ? " ex-world--paused" : ""}`} data-world-stage={stage} data-world-status={status} data-visible-artwork-count={data.artworks.length} data-loaded-artwork-count={loadedArtworkIds.length} data-loaded-artwork-ids={loadedArtworkIds.join(",")} data-total-artwork-count={artworks.length} data-world-wing={wing + 1} aria-label={title}>
    <div ref={hostRef} className="ex-world-viewport" data-player-pet={props.companion?.pet === 'animal-whiteknee' ? 'animal-whiteknee' : 'friend-cat'} />
    <div className="ex-world-topbar">
      {stage === "campus" ? <span className="ex-world-back" /> : <button type="button" className="ex-world-pill ex-world-back" onClick={props.onExit} aria-label={english ? "Back" : "뒤로"}><ArrowLeft size={17} /><span>{stage === "gallery" ? (english ? "Classroom" : "교실로") : (english ? "Schoolyard" : "학교 앞으로")}</span></button>}
      <div className="ex-world-title"><span><Sparkles size={13} />{stage === "campus" ? "OUR LITTLE SCHOOL" : stage === "classroom" ? "OUR CLASSROOM" : "LITTLE ART GALLERY"}</span><strong>{title}</strong></div>
      <button type="button" className={`ex-world-pill ex-world-index-toggle${indexVisible ? " is-active" : ""}`} aria-label={indexTitle} onClick={() => setIndexOpen(value => !value)} aria-expanded={indexVisible}><Images size={17} /><span>{indexTitle}</span></button>
    </div>

    {stage==='gallery'&&<ExhibitionScreen key={contextKey} artworks={artworks} english={english} paused={paused||indexOpen} onFrame={showScreen} onExpanded={setScreenExpanded} openSignal={screenOpenSignal}/>}
    {status === "loading" && <div className="ex-world-loading" role="status"><span className="ex-world-loading-paw">🐾</span><strong>{english ? "Moa is opening the door…" : "모아가 문을 열고 있어요…"}</strong></div>}
    {entering && <div className="ex-world-entering" role="status"><DoorOpen size={23} /><span>{english ? "Come on in!" : "안으로 들어가요!"}</span></div>}

    {indexVisible && <aside className="ex-world-index" aria-label={indexTitle}>
      <div className="ex-world-index-heading"><div><small>{english ? "ONE LITTLE ADVENTURE" : "한눈에 찾아보기"}</small><h3>{indexTitle}</h3></div>{status !== "fallback" && <button type="button" onClick={() => setIndexOpen(false)} aria-label={english ? "Close list" : "목록 닫기"}><X size={18} /></button>}</div>
      {status === "fallback" && <p className="ex-world-fallback-note">{english ? "This browser could not open the 3D space. You can still enter every classroom, exhibition, and artwork here." : "이 브라우저에서는 3D 공간을 열지 못했어요. 아래 목록에서 반과 전시실에 들어가고 모든 작품을 볼 수 있어요."}</p>}
      <div className="ex-world-index-items">
        {stage === "campus" && buildings.map((building, i) => <button type="button" key={building.id} onClick={() => props.onEnterBuilding(building.id)}><span className="ex-world-index-icon">🏫</span><span><strong>{building.name}</strong><small>{english ? "Enter classroom" : "우리 반 교실로 들어가요"}</small></span><ChevronRight size={17} /></button>)}
        {stage === "classroom" && rooms.map(room => <button type="button" key={room.id} onClick={() => props.onEnterRoom(room.id)}><span className="ex-world-index-icon">{room.theme === "forest" ? "🌿" : room.theme === "sky" ? "☁️" : room.theme === "ocean" ? "🐳" : "🎨"}</span><span><strong>{room.title}</strong><small>{room.artworkCount ?? 0}{english ? " artworks" : "개의 작품"}</small></span><ChevronRight size={17} /></button>)}
        {stage === "gallery" && artworks.map((artwork, i) => <button type="button" key={artwork.id} onClick={() => props.onSelectArtwork(artwork.id)}><span className="ex-world-index-number">{i + 1}</span><span><strong>{artwork.title}</strong><small>{artwork.artistName || artwork.studentName || (english ? "Our class artist" : "우리 반 작가")}{wings > 1 ? ` · ${Math.floor(i / WORLD_WING_CAPACITY) + 1}${english ? " wing" : "관"}` : ""}</small></span><ChevronRight size={17} /></button>)}
        {(stage === "campus" ? buildings.length === 0 : items.length === 0) && <div className="ex-world-index-empty"><BookOpen size={28} /><p>{english ? "This space is waiting for its first story." : "첫 번째 이야기를 기다리고 있어요."}</p></div>}
      </div>
    </aside>}

    {status === "ready" && <>
      {stage !== 'gallery' && !indexOpen && <div className="ex-world-entry">
        {stage === 'campus' && data.buildings[0] && <button type="button" onClick={() => props.onEnterBuilding(data.buildings[0].id)}><span>{data.buildings[0].name}</span><strong>{english ? 'Enter classroom' : '우리 반 들어가기'} <DoorOpen size={16}/></strong></button>}
        {stage === 'classroom' && rooms.length > 0 && <button type="button" onClick={() => rooms.length === 1 ? props.onEnterRoom(rooms[0].id) : setIndexOpen(true)}><span>{rooms.length === 1 ? rooms[0].title : (english ? 'Our class exhibitions' : '우리 반의 작은 이야기들')}</span><strong>{english ? 'Choose an exhibition' : '전시실 들어가기'} <DoorOpen size={16}/></strong></button>}
      </div>}
      <div className="ex-world-bottom-hint"><span className="ex-world-guide-face" aria-hidden="true">🦦</span><p>{stage === "campus" ? (english ? "Pick your class building. Let's go inside!" : "우리 반 건물을 눌러 안으로 들어가요!") : stage === "classroom" ? (english ? "Pick a poster to enter its exhibition." : "벽에 걸린 포스터를 누르면 전시실이 열려요.") : (english ? "Every picture is a story. Tap a frame to look closer!" : "액자를 누르면 작품을 크게 감상할 수 있어요!")}<small><Move size={12} />{english ? "Drag to look · Arrow keys / WASD to walk" : "화면을 끌어 둘러보기 · 방향키 / WASD로 걷기"}</small></p></div>
      <WorldJoystick english={english} disabled={paused||screenExpanded||indexOpen||status!=="ready"} onMove={moveStick}/>
      <button type="button" className="ex-world-pill ex-world-reset" aria-label={english ? "Reset view" : "처음 위치로"} onClick={() => controlsRef.current?.reset()}><RotateCcw size={16} /><span>{english ? "Reset view" : "처음 위치로"}</span></button>
    </>}
    {wings > 1 && <div className="ex-world-wings" aria-label={stage === "campus" ? (english ? "Schoolyards" : "학교마당 이동") : (english ? "Exhibition wings" : "전시관 이동")}><button type="button" disabled={wing === 0} onClick={() => setWingChoice({ key: contextKey, value: wing - 1 })} aria-label={english ? "Previous wing" : "이전 공간"}><ChevronLeft size={19} /></button><span><strong>{wing + 1}{english ? " / " : stage === "campus" ? "마당 / " : "관 / "}{wings}{english ? (stage === "campus" ? " yards" : " wings") : stage === "campus" ? "마당" : "관"}</strong><small>{wing * capacity + 1}–{Math.min((wing + 1) * capacity, items.length)} / {items.length}</small></span><button type="button" disabled={wing === wings - 1} onClick={() => setWingChoice({ key: contextKey, value: wing + 1 })} aria-label={english ? "Next wing" : "다음 공간"}><ChevronRight size={19} /></button></div>}
    {failedImages > 0 && <p className="ex-world-image-note" role="status">{english ? `${failedImages} picture(s) could not load. Select a frame to open the artwork.` : `사진 ${failedImages}장을 불러오지 못했어요. 액자를 눌러 작품을 열 수 있어요.`}</p>}
  </section>;
}
