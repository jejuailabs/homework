'use client';
import {useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent} from 'react';
import {Brush, Camera, ChevronDown, Download, Droplets, Ellipsis, Eraser, FilePlus, FileUp, Fingerprint, FlipHorizontal2, Hand, Highlighter, ImagePlus, Layers, LoaderCircle, Maximize, PaintBucket, Paintbrush, PenLine, Pencil, PencilLine, Pipette, Printer, Redo2, RotateCcw, Save, Shapes, Sparkles, Undo2, X, ZoomIn, ZoomOut, type LucideIcon} from 'lucide-react';
import {SketchEngine, type BrushSettings, type InputPoint, type StrokeBrush} from './engine';
import {autoLayerFor, defaultLayers, type PaperKind} from './document';
import {PAPER_SIZES, pushRecentColor, type PaperSize, type ShapeKind, type SymmetryMode} from './raster';
import {fitView, pinchView, screenToPage, settleRotation, zoomAt, type Pt, type View} from './view';
import {decodeSketchFile, encodeSketchFile, loadSketch, saveSketch} from './storage';
import ColorDish from './color-dish';
import ImageImport, {type ImportChoice} from './image-import';
import LayersPanel from './layers-panel';
import './styles.css';

type ToolId = StrokeBrush | 'fill' | 'shape' | 'mirror' | 'picker';
type GroupId = 'draw' | 'paint' | 'decorate' | 'fix';
type Settings = {size: number; opacity: number; texture: number};
const GROUPS: {id: GroupId; ko: string; en: string; icon: LucideIcon; tools: ToolId[]}[] = [
  {id: 'draw', ko: '그리기', en: 'Draw', icon: PencilLine, tools: ['pencil', 'colorPencil', 'felt', 'marker']},
  {id: 'paint', ko: '칠하기', en: 'Colour', icon: Paintbrush, tools: ['crayon', 'watercolor', 'oil', 'fill']},
  {id: 'decorate', ko: '꾸미기', en: 'Decorate', icon: Sparkles, tools: ['shape', 'mirror']},
  {id: 'fix', ko: '고치기', en: 'Fix', icon: Eraser, tools: ['eraser', 'smudge', 'picker']},
];
const TOOLS: Record<ToolId, {ko: string; en: string; icon: LucideIcon; note: [string, string]}> = {
  pencil: {ko: '연필', en: 'Pencil', icon: Pencil, note: ['연하고 가는 밑그림 선', 'Light sketch lines']},
  colorPencil: {ko: '색연필', en: 'Coloured pencil', icon: PencilLine, note: ['종이 결이 살짝 보여요', 'Shows a little paper grain']},
  felt: {ko: '사인펜', en: 'Felt pen', icon: PenLine, note: ['또렷하고 고른 선', 'Crisp, even line']},
  marker: {ko: '마커', en: 'Marker', icon: Highlighter, note: ['납작한 촉, 겹치면 진해져요', 'Flat tip; layers darken']},
  crayon: {ko: '크레파스', en: 'Crayon', icon: Brush, note: ['거칠게 끊기는 질감', 'Waxy, broken texture']},
  watercolor: {ko: '수채 물감', en: 'Watercolour', icon: Droplets, note: ['가장자리에 물감이 고여요', 'Pigment gathers at the edges']},
  oil: {ko: '물감 붓', en: 'Paint brush', icon: Paintbrush, note: ['붓 결이 남는 두꺼운 물감', 'Thick paint with bristle marks']},
  fill: {ko: '채우기 통', en: 'Fill', icon: PaintBucket, note: ['누른 칸을 한 번에 칠해요', 'Fills the tapped area']},
  shape: {ko: '도형', en: 'Shapes', icon: Shapes, note: ['끌어서 도형 그리기', 'Drag to draw a shape']},
  mirror: {ko: '거울 그리기', en: 'Mirror drawing', icon: FlipHorizontal2, note: ['한 번 그으면 대칭으로 함께', 'Draws symmetric copies']},
  eraser: {ko: '지우개', en: 'Eraser', icon: Eraser, note: ['지금 레이어에서 지워요', 'Erases on this layer']},
  smudge: {ko: '문지르기', en: 'Smudge', icon: Fingerprint, note: ['칠한 색을 끌어 번지게', 'Drags colour to blend']},
  picker: {ko: '색 고르기', en: 'Colour picker', icon: Pipette, note: ['그림을 눌러 그 색을 써요', 'Tap the page to take a colour']},
};
const DEFAULTS: Record<ToolId, Settings> = {
  pencil: {size: 4, opacity: 0.85, texture: 0.55}, colorPencil: {size: 9, opacity: 0.9, texture: 0.7}, felt: {size: 7, opacity: 1, texture: 0}, marker: {size: 22, opacity: 0.7, texture: 0},
  crayon: {size: 26, opacity: 1, texture: 0.65}, watercolor: {size: 48, opacity: 0.85, texture: 0}, oil: {size: 30, opacity: 1, texture: 0}, fill: {size: 1, opacity: 1, texture: 0},
  shape: {size: 8, opacity: 1, texture: 0}, mirror: {size: 10, opacity: 1, texture: 0}, eraser: {size: 36, opacity: 1, texture: 0}, smudge: {size: 34, opacity: 0.6, texture: 0}, picker: {size: 1, opacity: 1, texture: 0},
};
const TEXTURED: ToolId[] = ['pencil', 'colorPencil', 'crayon'];
const CLIPPABLE: ToolId[] = ['pencil', 'colorPencil', 'felt', 'marker', 'crayon', 'watercolor', 'oil'];
const SHAPES: {id: ShapeKind; ko: string; en: string}[] = [{id: 'line', ko: '직선', en: 'Line'}, {id: 'rect', ko: '네모', en: 'Box'}, {id: 'ellipse', ko: '동그라미', en: 'Circle'}, {id: 'triangle', ko: '세모', en: 'Triangle'}, {id: 'star', ko: '별', en: 'Star'}, {id: 'heart', ko: '하트', en: 'Heart'}];
const PAPERS: {id: PaperKind; ko: string; en: string}[] = [{id: 'white', ko: '흰 도화지', en: 'White'}, {id: 'cream', ko: '미색 도화지', en: 'Cream'}, {id: 'kraft', ko: '크라프트지', en: 'Kraft'}, {id: 'black', ko: '검은 종이', en: 'Black'}, {id: 'grid', ko: '모눈 종이', en: 'Grid'}];
const RATIOS: {id: PaperSize; ko: string; en: string}[] = [{id: 'landscape', ko: '가로 A4', en: 'A4 landscape'}, {id: 'portrait', ko: '세로 A4', en: 'A4 portrait'}, {id: 'square', ko: '정사각형', en: 'Square'}];
const groupOf = (tool: ToolId) => GROUPS.find(g => g.tools.includes(tool))!.id;

type Prefs = {color: string; recent: string[]; settings: Partial<Record<ToolId, Settings>>; simple: boolean; penOnly: boolean; autoLayer: boolean; clip: boolean; tolerance: number; gap: number; spread: number};
const prefsKey = (scope: string) => `ourclass:sketchbook:prefs:${scope}`;
function readPrefs(scope: string): Partial<Prefs> {try {return JSON.parse(localStorage.getItem(prefsKey(scope)) ?? '{}') as Partial<Prefs>;} catch {return {};}}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const stamp = () => {const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;};

export default function Sketchbook({locale, storageScope}: {locale: 'ko' | 'en'; storageScope: string}) {
  const w = useCallback((ko: string, en: string) => locale === 'en' ? en : ko, [locale]);
  const scope = `sketchbook:${storageScope}`;
  const root = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), engineRef = useRef<SketchEngine | null>(null);
  const [, setRevision] = useState(0), refresh = useCallback(() => setRevision(v => v + 1), []);
  const [ready, setReady] = useState(false), [status, setStatus] = useState<'loading' | 'saved' | 'dirty' | 'saving' | 'error'>('loading'), [savedAt, setSavedAt] = useState(0);
  const [tool, setTool] = useState<ToolId>('crayon'), [drawer, setDrawer] = useState<GroupId | null>(null), [cardOpen, setCardOpen] = useState(true);
  const [color, setColor] = useState('#e5484d'), [recent, setRecent] = useState<string[]>(['#e5484d', '#ffc53d', '#3e9fd8', '#2e9e6a', '#1f2328']);
  const [settings, setSettings] = useState<Record<ToolId, Settings>>(DEFAULTS);
  const [shape, setShape] = useState<ShapeKind>('ellipse'), [symmetry, setSymmetry] = useState<SymmetryMode>('mirror'), [slices, setSlices] = useState(8), [mirrorBrush, setMirrorBrush] = useState<StrokeBrush>('felt');
  const [clip, setClip] = useState(false), [tolerance, setTolerance] = useState(20), [gap, setGap] = useState(3), [spread, setSpread] = useState(2);
  const [simple, setSimple] = useState(false), [penOnly, setPenOnly] = useState(false), [autoLayer, setAutoLayer] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false), [imageMenu, setImageMenu] = useState(false), [newOpen, setNewOpen] = useState(false);
  const [importFile, setImportFile] = useState<Blob | null>(null), [toast, setToast] = useState(''), [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>({x: 0, y: 0, scale: 0.4, rotation: 0}), viewRef = useRef(view);
  const [hover, setHover] = useState<Pt | null>(null), [panning, setPanning] = useState(false), [handTool, setHandTool] = useState(false);
  const previousTool = useRef<ToolId>('crayon');
  const fileInput = useRef<HTMLInputElement>(null), cameraInput = useRef<HTMLInputElement>(null), sketchInput = useRef<HTMLInputElement>(null);
  const gesture = useRef<{pointers: Map<number, Pt & {type: string}>; mode: 'none' | 'draw' | 'pan' | 'pinch'; startView: View; from: Pt[]; penSeen: boolean; space: boolean; drawId: number | null}>({pointers: new Map(), mode: 'none', startView: view, from: [], penSeen: false, space: false, drawId: null});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null), saving = useRef(false), pendingSave = useRef(false);

  useEffect(() => {if (tool !== 'picker') previousTool.current = tool;}, [tool]);
  // While the page sits at "fit", a resized window or rotated tablet refits it; once moved by hand it stays put.
  const fitted = useRef(true);
  const updateView = useCallback((next: View) => {viewRef.current = next; fitted.current = false; setView(next);}, []);
  const say = useCallback((message: string) => {setToast(message); setTimeout(() => setToast(current => current === message ? '' : current), 2600);}, []);
  const fit = useCallback(() => {const box = stage.current, engine = engineRef.current; if (box && engine) {updateView(fitView(engine.width, engine.height, box.clientWidth, box.clientHeight, box.clientWidth < 600 ? 10 : 28)); fitted.current = true;}}, [updateView]);

  // ---------- saving ----------
  const save = useCallback(async () => {
    const engine = engineRef.current; if (!engine) return;
    if (saving.current) {pendingSave.current = true; return;}
    saving.current = true; setStatus('saving');
    try {
      const images: Record<string, Blob | null> = {};
      for (const layer of engine.layers) images[layer.id] = await engine.layerPng(layer);
      const now = Date.now();
      await saveSketch(scope, {manifest: engine.manifest(), images, savedAt: now});
      setSavedAt(now); setStatus('saved');
    } catch {setStatus('error');}
    finally {saving.current = false; if (pendingSave.current) {pendingSave.current = false; void save();}}
  }, [scope]);
  const scheduleSave = useCallback(() => {setStatus('dirty'); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => {saveTimer.current = null; void save();}, 1200);}, [save]);

  // ---------- engine lifecycle ----------
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const engine = new SketchEngine(canvas, {version: 1, ...PAPER_SIZES.landscape, paper: 'white', activeId: 'paint', layers: defaultLayers(locale)});
    engineRef.current = engine;
    engine.onChange = reason => {refresh(); if (reason !== 'history') scheduleSave();};
    let alive = true;
    const prefs = readPrefs(storageScope);
    if (prefs.color) setColor(prefs.color); if (Array.isArray(prefs.recent)) setRecent(prefs.recent.slice(0, 8));
    if (prefs.settings) setSettings(old => ({...old, ...prefs.settings}));
    if (typeof prefs.simple === 'boolean') setSimple(prefs.simple); if (typeof prefs.penOnly === 'boolean') setPenOnly(prefs.penOnly); if (typeof prefs.autoLayer === 'boolean') setAutoLayer(prefs.autoLayer); if (typeof prefs.clip === 'boolean') setClip(prefs.clip);
    if (typeof prefs.tolerance === 'number') setTolerance(prefs.tolerance); if (typeof prefs.gap === 'number') setGap(prefs.gap); if (typeof prefs.spread === 'number') setSpread(prefs.spread);
    if (window.innerWidth < 700) setCardOpen(false);
    loadSketch(scope).then(async saved => {
      if (!alive) return;
      if (saved) {
        engine.onChange = () => {};
        engine.reset(saved.manifest.width, saved.manifest.height, saved.manifest.paper, saved.manifest.layers, saved.manifest.activeId);
        await engine.loadPixels(saved.images);
        engine.onChange = reason => {refresh(); if (reason !== 'history') scheduleSave();};
        setSavedAt(saved.savedAt);
      }
      if (!alive) return;
      setStatus('saved'); setReady(true); refresh(); requestAnimationFrame(fit);
    }).catch(() => {if (alive) {setStatus('error'); setReady(true); requestAnimationFrame(fit);}});
    return () => {alive = false; engine.dispose(); engineRef.current = null;};
  }, [scope, storageScope, locale, refresh, scheduleSave, fit]);

  // Keep preferences per scope; small values only, the drawing itself is in IndexedDB.
  useEffect(() => {
    if (!ready) return;
    try {localStorage.setItem(prefsKey(storageScope), JSON.stringify({color, recent, settings, simple, penOnly, autoLayer, clip, tolerance, gap, spread} satisfies Prefs));} catch {}
  }, [ready, storageScope, color, recent, settings, simple, penOnly, autoLayer, clip, tolerance, gap, spread]);

  useEffect(() => () => {if (saveTimer.current) {clearTimeout(saveTimer.current); void save();}}, [save]);

  useEffect(() => {
    const box = stage.current; if (!box) return;
    let last = {w: box.clientWidth, h: box.clientHeight};
    const observer = new ResizeObserver(() => {
      if (!last.w || !last.h || fitted.current) {fit(); last = {w: box.clientWidth, h: box.clientHeight}; return;}
      const dx = (box.clientWidth - last.w) / 2, dy = (box.clientHeight - last.h) / 2; last = {w: box.clientWidth, h: box.clientHeight};
      updateView({...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy});
    });
    observer.observe(box); return () => observer.disconnect();
  }, [fit, updateView]);

  const engine = engineRef.current;
  const current = settings[tool];
  const strokeBrush: StrokeBrush | null = tool === 'mirror' ? mirrorBrush : (['fill', 'shape', 'picker'] as ToolId[]).includes(tool) ? null : tool as StrokeBrush;

  const chooseColor = useCallback((next: string, commit = false) => {setColor(next); if (commit) setRecent(old => pushRecentColor(old, next));}, []);
  const chooseTool = (next: ToolId) => {
    setTool(next); setDrawer(null);
    if (autoLayer && engine) {const id = autoLayerFor(groupOf(next), engine.layers, engine.activeId); if (id !== engine.activeId) engine.setActive(id);}
  };
  const patchSettings = (patch: Partial<Settings>) => setSettings(old => ({...old, [tool]: {...old[tool], ...patch}}));

  // ---------- pointer input ----------
  const local = (event: {clientX: number; clientY: number}): Pt => {const rect = stage.current!.getBoundingClientRect(); return {x: event.clientX - rect.left, y: event.clientY - rect.top};};
  const pagePoint = (event: PointerEvent | ReactPointerEvent): InputPoint => {const p = screenToPage(viewRef.current, local(event)); return {...p, pressure: event.pressure || 0.5, pen: event.pointerType === 'pen'};};
  const brushSettings = (): BrushSettings => ({color, size: current.size, opacity: current.opacity, texture: simple ? DEFAULTS[tool].texture : current.texture});
  const strokeOptions = () => ({clip: clip && CLIPPABLE.includes(strokeBrush ?? 'eraser'), symmetry: tool === 'mirror' ? symmetry : 'off' as SymmetryMode, slices, fill: {tolerance, gap: simple ? 3 : gap, spread: simple ? 2 : spread}});
  const lockedMessage = () => {
    const active = engine?.active; if (!active) return;
    say(active.locked ? w(`'${active.name}' 레이어는 잠겨 있어요. 레이어에서 잠금을 풀어 주세요.`, `'${active.name}' is locked.`) : w(`'${active.name}' 레이어가 숨겨져 있어요.`, `'${active.name}' is hidden.`));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current, eng = engineRef.current; if (!eng || !ready) return;
    if (event.pointerType === 'pen') g.penSeen = true;
    try {event.currentTarget.setPointerCapture(event.pointerId);} catch {}
    g.pointers.set(event.pointerId, {...local(event), type: event.pointerType});
    setMenuOpen(false); setImageMenu(false); setDrawer(null);
    const touches = [...g.pointers.values()].filter(p => p.type === 'touch');
    if (event.pointerType === 'touch' && touches.length >= 2) {
      // A second finger turns a just-started touch stroke into a pinch.
      if (g.mode === 'draw') eng.cancelStroke();
      const pts = [...g.pointers.entries()].filter(([, p]) => p.type === 'touch').slice(0, 2).map(([, p]) => ({x: p.x, y: p.y}));
      g.mode = 'pinch'; g.startView = viewRef.current; g.from = pts; g.drawId = null; return;
    }
    const navigate = tool === 'picker' ? false : (g.space || event.button === 1 || handTool || (penOnly && g.penSeen && event.pointerType === 'touch'));
    if (navigate) {g.mode = 'pan'; g.startView = viewRef.current; g.from = [local(event)]; setPanning(true); return;}
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const p = pagePoint(event);
    if (tool === 'picker') {const picked = eng.pick(p); chooseColor(picked, true); say(w(`${picked} 색을 골랐어요`, `Picked ${picked}`)); setTool(previousTool.current); return;}
    if (tool === 'fill') {
      if (!eng.canPaint()) {lockedMessage(); return;}
      setBusy(true);
      void eng.fill(p, color, current.opacity, {tolerance, gap: simple ? 3 : gap, spread: simple ? 2 : spread}).then(result => {
        if (result === 'boundary') say(w('선 위를 눌렀어요. 칸 안쪽을 눌러 주세요.', 'That is a line; tap inside an area.'));
        if (result === 'locked') lockedMessage();
        if (result === 'filled') setRecent(old => pushRecentColor(old, color));
      }).finally(() => setBusy(false));
      return;
    }
    const started = tool === 'shape' ? eng.beginShape(shape, p, brushSettings(), strokeOptions()) : strokeBrush ? eng.beginStroke(strokeBrush, p, brushSettings(), strokeOptions()) : false;
    if (!started) {lockedMessage(); return;}
    g.mode = 'draw'; g.drawId = event.pointerId;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current, eng = engineRef.current;
    if (event.pointerType !== 'touch') setHover(local(event));
    if (!eng || !g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, {...local(event), type: event.pointerType});
    if (g.mode === 'pinch') {
      const pts = [...g.pointers.values()].filter(p => p.type === 'touch').slice(0, 2);
      if (pts.length === 2) updateView(pinchView(g.startView, [g.from[0], g.from[1]], [pts[0], pts[1]]));
    } else if (g.mode === 'pan') {
      const p = local(event); updateView({...g.startView, x: g.startView.x + p.x - g.from[0].x, y: g.startView.y + p.y - g.from[0].y});
    } else if (g.mode === 'draw' && g.drawId === event.pointerId) {
      if (tool === 'shape') {eng.updateShape(pagePoint(event)); return;}
      const native = event.nativeEvent, events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
      eng.moveStroke((events.length ? events : [native]).map(pagePoint));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current, eng = engineRef.current;
    g.pointers.delete(event.pointerId);
    if (!eng) return;
    if (g.mode === 'draw' && g.drawId === event.pointerId) {
      g.mode = 'none'; g.drawId = null;
      if (tool === 'shape') eng.updateShape(pagePoint(event));
      void eng.endStroke(tool === 'shape' ? undefined : pagePoint(event)).then(changed => {if (changed && strokeBrush !== 'eraser' && strokeBrush !== 'smudge') setRecent(old => pushRecentColor(old, color));});
    } else if (g.mode === 'pinch' && [...g.pointers.values()].filter(p => p.type === 'touch').length < 2) {
      g.mode = 'none'; const box = stage.current!; updateView(settleRotation(viewRef.current, {x: box.clientWidth / 2, y: box.clientHeight / 2}));
    } else if (g.mode === 'pan' && !g.pointers.size) {g.mode = 'none'; setPanning(false);}
  };
  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current; g.pointers.delete(event.pointerId);
    if (g.mode === 'draw' && g.drawId === event.pointerId) engineRef.current?.cancelStroke();
    if (!g.pointers.size) {g.mode = 'none'; g.drawId = null; setPanning(false);}
  };


  // Wheel: scroll pans, Ctrl/⌘ + wheel (and trackpad pinch) zooms at the pointer.
  useEffect(() => {
    const box = stage.current; if (!box) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = box.getBoundingClientRect(), anchor = {x: event.clientX - rect.left, y: event.clientY - rect.top};
      if (event.ctrlKey || event.metaKey) updateView(zoomAt(viewRef.current, Math.exp(-event.deltaY * 0.0022), anchor));
      else updateView({...viewRef.current, x: viewRef.current.x - event.deltaX, y: viewRef.current.y - event.deltaY});
    };
    box.addEventListener('wheel', wheel, {passive: false});
    return () => box.removeEventListener('wheel', wheel);
  }, [updateView]);

  // Keyboard shortcuts while this sketchbook is on screen.
  useEffect(() => {
    const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    const down = (event: KeyboardEvent) => {
      const node = root.current; if (!node || !node.offsetParent || typing(event.target) || importFile) return;
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === 'Escape') {setDrawer(null); setMenuOpen(false); setImageMenu(false); return;}
      if (event.code === 'Space') {gesture.current.space = true; setPanning(true); event.preventDefault(); return;}
      if (mod && event.key.toLowerCase() === 'z') {event.preventDefault(); if (event.shiftKey) engineRef.current?.redo(); else engineRef.current?.undo(); return;}
      if (mod && event.key.toLowerCase() === 'y') {event.preventDefault(); engineRef.current?.redo(); return;}
      if (mod) return;
      if (event.key === '[' || event.key === ']') setSettings(old => {const s = old[tool]; return {...old, [tool]: {...s, size: Math.max(1, Math.min(200, Math.round(s.size * (event.key === ']' ? 1.2 : 1 / 1.2))))}};});
      if (event.key === '0') fit();
    };
    const up = (event: KeyboardEvent) => {if (event.code === 'Space') {gesture.current.space = false; if (gesture.current.mode !== 'pan') setPanning(false);}};
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => {window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);};
  }, [tool, fit, importFile]);

  // Paste an image from the clipboard.
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const node = root.current; if (!node?.offsetParent || importFile) return;
      const file = [...(event.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'));
      if (file) {event.preventDefault(); setImportFile(file);}
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [importFile]);

  // ---------- file actions ----------
  const openFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (file.type === 'application/json' || file.name.endsWith('.json')) {await openSketch(file); return;}
    if (!file.type.startsWith('image/')) {say(w('그림 파일만 불러올 수 있어요.', 'Only picture files can be opened.')); return;}
    setImportFile(file);
  };
  const place = (choice: ImportChoice) => {
    const eng = engineRef.current; setImportFile(null); if (!eng) return;
    if (choice.mode === 'photo') {
      const layer = eng.placePhoto(choice.canvas);
      eng.updateLayer(layer.id, {opacity: choice.faint ? 0.45 : 1, locked: true});
      if (autoLayer) {const id = autoLayerFor(groupOf(tool), eng.layers, eng.activeId); eng.setActive(id);}
      say(w('사진을 맨 아래에 깔고 잠갔어요.', 'Photo placed at the bottom and locked.'));
    } else {
      eng.placeLines(choice.canvas, choice.threshold, choice.blackLines ? [32, 34, 38] : undefined);
      setTool('fill');
      say(w('도안을 맨 위에 고정했어요. 칸을 눌러 칠해 보세요.', 'Lines fixed on top. Tap an area to fill it.'));
    }
  };
  const openSketch = async (file: Blob) => {
    const eng = engineRef.current; if (!eng) return;
    const saved = await decodeSketchFile(file);
    if (!saved) {say(w('스케치북 편집 파일이 아니에요.', 'Not a sketchbook file.')); return;}
    if (eng.layers.some(l => l.filled) && !confirm(w('지금 그림 대신 이 파일을 열까요? 지금 그림은 실행 취소로 되돌릴 수 없어요.', 'Replace the current drawing with this file?'))) return;
    eng.reset(saved.manifest.width, saved.manifest.height, saved.manifest.paper, saved.manifest.layers, saved.manifest.activeId);
    await eng.loadPixels(saved.images); fit(); void save();
  };
  const exportPng = async () => {const blob = await engineRef.current?.pagePng(); if (blob) download(blob, `${w('스케치북', 'sketchbook')}-${stamp()}.png`);};
  const exportSketch = async () => {
    const eng = engineRef.current; if (!eng) return;
    const images: Record<string, Blob | null> = {};
    for (const layer of eng.layers) images[layer.id] = await eng.layerPng(layer);
    download(await encodeSketchFile({manifest: eng.manifest(), images, savedAt: Date.now()}), `${w('스케치북', 'sketchbook')}-${stamp()}.sketchbook.json`);
  };
  const print = async () => {
    const blob = await engineRef.current?.pagePng(); if (!blob) return;
    const url = URL.createObjectURL(blob), frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(frame);
    const doc = frame.contentDocument!; doc.open();
    doc.write(`<!doctype html><title>${w('스케치북', 'Sketchbook')}</title><style>@page{margin:10mm}html,body{margin:0;height:100%}img{display:block;max-width:100%;max-height:100vh;margin:auto}</style><img src="${url}">`); doc.close();
    const img = doc.querySelector('img')!;
    img.onload = () => {frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => {frame.remove(); URL.revokeObjectURL(url);}, 1500);};
  };
  const startNew = (size: PaperSize, paper: PaperKind) => {
    const eng = engineRef.current; if (!eng) return;
    eng.reset(PAPER_SIZES[size].width, PAPER_SIZES[size].height, paper, defaultLayers(locale), 'paint');
    setNewOpen(false); fit(); void save();
  };
  const toggleFullscreen = () => {const node = root.current; if (!node) return; if (document.fullscreenElement) void document.exitFullscreen(); else void node.requestFullscreen?.().catch(() => say(w('이 브라우저는 전체 화면을 지원하지 않아요.', 'Full screen is not available.')));};

  const zoomBy = (factor: number) => {const box = stage.current; if (box) updateView(zoomAt(viewRef.current, factor, {x: box.clientWidth / 2, y: box.clientHeight / 2}));};
  const statusText = status === 'loading' ? w('불러오는 중', 'Loading') : status === 'saving' ? w('저장하는 중', 'Saving') : status === 'dirty' ? w('곧 저장해요', 'Saving soon') : status === 'error' ? w('이 기기에 저장하지 못했어요', 'Could not save on this device') : savedAt ? w(`이 기기에 저장됨 ${new Date(savedAt).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'})}`, `Saved on this device ${new Date(savedAt).toLocaleTimeString('en', {hour: '2-digit', minute: '2-digit'})}`) : w('이 기기에 저장돼요', 'Saved on this device');
  const cursorSize = strokeBrush || tool === 'shape' ? Math.max(4, current.size * view.scale) : 0;
  const ToolIcon = TOOLS[tool].icon;
  const referenceNote = engine?.hasLineReference() ? w('선 레이어를 경계로 칠해요', 'Stops at the line layer') : w('보이는 색을 경계로 칠해요', 'Stops at visible colour edges');

  return <div ref={root} className={`sb-root${simple ? ' is-simple' : ''}`} onDragOver={event => {if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();}} onDrop={event => {event.preventDefault(); void openFile(event.dataTransfer.files[0]);}}>
    <div className="sb-topbar">
      <div className="sb-title"><strong>{w('스케치북', 'Sketchbook')}</strong><small className={`sb-status is-${status}`} aria-live="polite">{statusText}</small></div>
      <div className="sb-top-actions">
        <button type="button" className="sb-icon" onClick={() => engine?.undo()} disabled={!engine?.history.canUndo} aria-label={w('실행 취소', 'Undo')} title={w('실행 취소 (Ctrl+Z)', 'Undo (Ctrl+Z)')}><Undo2 size={19}/></button>
        <button type="button" className="sb-icon" onClick={() => engine?.redo()} disabled={!engine?.history.canRedo} aria-label={w('다시 실행', 'Redo')} title={w('다시 실행 (Ctrl+Shift+Z)', 'Redo')}><Redo2 size={19}/></button>
        <span className="sb-sep"/>
        <div className="sb-pop-anchor">
          <button type="button" className="sb-pill" aria-expanded={imageMenu} onClick={() => {setImageMenu(v => !v); setMenuOpen(false);}}><ImagePlus size={18}/><span>{w('이미지 불러오기', 'Add a picture')}</span></button>
          {imageMenu && <div className="sb-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => {setImageMenu(false); fileInput.current?.click();}}><FileUp size={17}/>{w('파일에서 고르기', 'Choose a file')}</button>
            <button type="button" role="menuitem" onClick={() => {setImageMenu(false); cameraInput.current?.click();}}><Camera size={17}/>{w('카메라로 찍기', 'Take a photo')}</button>
            <p>{w('그림을 끌어다 놓거나 붙여넣어도 돼요.', 'You can also drop or paste a picture.')}</p>
          </div>}
        </div>
        {!simple && <button type="button" className="sb-pill" aria-pressed={layersOpen} onClick={() => setLayersOpen(v => !v)}><Layers size={18}/><span>{w('레이어', 'Layers')}</span></button>}
        <div className="sb-pop-anchor">
          <button type="button" className="sb-icon" aria-expanded={menuOpen} onClick={() => {setMenuOpen(v => !v); setImageMenu(false);}} aria-label={w('더 보기', 'More')}><Ellipsis size={20}/></button>
          {menuOpen && <div className="sb-menu sb-menu-end" role="menu">
            <button type="button" role="menuitem" onClick={() => {setMenuOpen(false); setNewOpen(true);}}><FilePlus size={17}/>{w('새 스케치북 · 종이', 'New page · paper')}</button>
            <button type="button" role="menuitem" onClick={() => {setMenuOpen(false); void exportPng();}}><Download size={17}/>{w('그림 파일(PNG)로 저장', 'Save as PNG')}</button>
            <button type="button" role="menuitem" onClick={() => {setMenuOpen(false); void print();}}><Printer size={17}/>{w('인쇄', 'Print')}</button>
            <button type="button" role="menuitem" onClick={() => {setMenuOpen(false); void exportSketch();}}><Save size={17}/>{w('편집 원본 내려받기', 'Download editable file')}</button>
            <button type="button" role="menuitem" onClick={() => {setMenuOpen(false); sketchInput.current?.click();}}><FileUp size={17}/>{w('편집 원본 열기', 'Open editable file')}</button>
            <hr/>
            <label className="sb-check"><input type="checkbox" checked={simple} onChange={event => {setSimple(event.target.checked); if (event.target.checked) {setAutoLayer(true); setLayersOpen(false);}}}/>{w('간단하게 보기 (레이어 자동)', 'Simple view (automatic layers)')}</label>
            <label className="sb-check"><input type="checkbox" checked={penOnly} onChange={event => setPenOnly(event.target.checked)}/>{w('펜으로만 그리기 (손가락은 화면 이동)', 'Draw with a pen only (fingers move)')}</label>
            <button type="button" role="menuitem" onClick={() => {setMenuOpen(false); toggleFullscreen();}}><Maximize size={17}/>{w('전체 화면', 'Full screen')}</button>
          </div>}
        </div>
      </div>
    </div>

    <div className="sb-body">
      <div ref={stage} className={`sb-stage${panning || handTool ? ' is-panning' : ''}${tool === 'picker' ? ' is-picking' : ''}${tool === 'fill' ? ' is-filling' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onPointerLeave={() => setHover(null)} onLostPointerCapture={onPointerCancel}>
        <div className="sb-page" style={{transform: `translate(${view.x}px,${view.y}px) rotate(${view.rotation}rad) scale(${view.scale})`, width: engine?.width ?? PAPER_SIZES.landscape.width, height: engine?.height ?? PAPER_SIZES.landscape.height}}>
          <canvas ref={canvasRef} aria-label={w('스케치북 종이', 'Sketchbook page')} role="img"/>
        </div>
        {hover && cursorSize > 0 && !panning && !handTool && <span className="sb-cursor" style={{left: hover.x, top: hover.y, width: cursorSize, height: cursorSize}}/>}
        {!ready && <div className="sb-loading"><LoaderCircle className="spin"/></div>}
        {busy && <div className="sb-busy" role="status"><LoaderCircle className="spin" size={16}/>{w('칠할 곳을 찾는 중', 'Finding the area')}</div>}
      </div>

      <nav className="sb-rail" aria-label={w('도구 묶음', 'Tool groups')}>
        {GROUPS.map(group => {const selected = groupOf(tool) === group.id, Icon = selected ? TOOLS[tool].icon : group.icon; return <button type="button" key={group.id} className={`sb-group sb-group-${group.id}`} aria-pressed={selected} aria-expanded={drawer === group.id} onClick={() => setDrawer(d => d === group.id ? null : group.id)}><Icon size={22}/><span>{w(group.ko, group.en)}</span></button>;})}
        <button type="button" className="sb-group sb-hand" aria-pressed={handTool} onClick={() => setHandTool(v => !v)} title={w('화면 옮기기 (스페이스바)', 'Move the view (Space)')}><Hand size={21}/><span>{w('옮기기', 'Move')}</span></button>
      </nav>

      {drawer && <div className={`sb-card sb-drawer sb-drawer-${drawer}`} role="menu" aria-label={w(GROUPS.find(g => g.id === drawer)!.ko, GROUPS.find(g => g.id === drawer)!.en)}>
        {GROUPS.find(g => g.id === drawer)!.tools.map(id => {const Icon = TOOLS[id].icon; return <button type="button" role="menuitemradio" aria-checked={tool === id} key={id} onClick={() => {chooseTool(id); setHandTool(false); setCardOpen(true);}}><Icon size={22}/><span><strong>{w(TOOLS[id].ko, TOOLS[id].en)}</strong><small>{w(...TOOLS[id].note)}</small></span></button>;})}
      </div>}

      {!drawer && <section className={`sb-card sb-props${cardOpen ? '' : ' is-folded'}`} aria-label={w('붓 설정', 'Brush settings')}>
        <button type="button" className="sb-props-head" aria-expanded={cardOpen} onClick={() => setCardOpen(v => !v)}>
          <span className="sb-props-icon" style={{'--sb-color': color} as CSSProperties}><ToolIcon size={18}/></span>
          <strong>{w(TOOLS[tool].ko, TOOLS[tool].en)}</strong>
          {engine && <small>{w(`${engine.active.name} 레이어`, `${engine.active.name} layer`)}</small>}
          <ChevronDown size={16} className="sb-fold"/>
        </button>
        {cardOpen && <div className="sb-props-body">
          {(strokeBrush || tool === 'shape') && <label className="sb-slider"><span>{w('굵기', 'Size')}<output>{current.size}px</output></span><input type="range" min={1} max={200} value={current.size} onChange={event => patchSettings({size: Number(event.target.value)})}/></label>}
          {tool !== 'picker' && <label className="sb-slider"><span>{tool === 'smudge' ? w('세기', 'Strength') : w('불투명도', 'Opacity')}<output>{Math.round(current.opacity * 100)}%</output></span><input type="range" min={5} max={100} value={Math.round(current.opacity * 100)} onChange={event => patchSettings({opacity: Number(event.target.value) / 100})}/></label>}
          {!simple && TEXTURED.includes(tool) && <label className="sb-slider"><span>{w('질감', 'Texture')}<output>{Math.round(current.texture * 100)}%</output></span><input type="range" min={0} max={100} value={Math.round(current.texture * 100)} onChange={event => patchSettings({texture: Number(event.target.value) / 100})}/></label>}
          {tool === 'shape' && <div className="sb-chips" role="radiogroup" aria-label={w('도형', 'Shape')}>{SHAPES.map(s => <button type="button" role="radio" aria-checked={shape === s.id} key={s.id} className="sb-chip" onClick={() => setShape(s.id)}>{w(s.ko, s.en)}</button>)}</div>}
          {tool === 'mirror' && <>
            <div className="sb-chips" role="radiogroup" aria-label={w('대칭', 'Symmetry')}>{([['mirror', '좌우', 'Left-right'], ['quad', '네 방향', 'Four ways'], ['radial', '꽃무늬', 'Mandala']] as const).map(([id, ko, en]) => <button type="button" role="radio" aria-checked={symmetry === id} key={id} className="sb-chip" onClick={() => setSymmetry(id)}>{w(ko, en)}</button>)}</div>
            {symmetry === 'radial' && <label className="sb-slider"><span>{w('조각 수', 'Slices')}<output>{slices}</output></span><input type="range" min={3} max={12} value={slices} onChange={event => setSlices(Number(event.target.value))}/></label>}
            <div className="sb-chips" role="radiogroup" aria-label={w('붓', 'Brush')}>{(['felt', 'colorPencil', 'crayon', 'watercolor'] as StrokeBrush[]).map(id => <button type="button" role="radio" aria-checked={mirrorBrush === id} key={id} className="sb-chip" onClick={() => setMirrorBrush(id)}>{w(TOOLS[id].ko, TOOLS[id].en)}</button>)}</div>
          </>}
          {tool === 'fill' && <>
            <p className="sb-hint">{referenceNote}</p>
            {!simple && <>
              <label className="sb-slider"><span>{w('비슷한 색까지', 'Tolerance')}<output>{tolerance}</output></span><input type="range" min={0} max={100} value={tolerance} onChange={event => setTolerance(Number(event.target.value))}/></label>
              <label className="sb-slider"><span>{w('틈 메우기', 'Close gaps')}<output>{gap}px</output></span><input type="range" min={0} max={8} value={gap} onChange={event => setGap(Number(event.target.value))}/></label>
              <label className="sb-slider"><span>{w('선 밑까지 칠하기', 'Spread under lines')}<output>{spread}px</output></span><input type="range" min={0} max={3} value={spread} onChange={event => setSpread(Number(event.target.value))}/></label>
            </>}
          </>}
          {CLIPPABLE.includes(tool) || (tool === 'mirror' && CLIPPABLE.includes(mirrorBrush)) ? <label className="sb-switch"><input type="checkbox" role="switch" checked={clip} onChange={event => setClip(event.target.checked)}/><span><strong>{w('선 안에만 칠하기', 'Stay inside the lines')}</strong><small>{w('처음 누른 칸 밖으로 나가지 않아요', 'Paint stays in the area you start in')}</small></span></label> : null}
          {tool === 'picker' && <p className="sb-hint">{w('그림이나 사진을 누르면 그 색을 가져와요.', 'Tap the drawing or photo to take its colour.')}</p>}
          {tool !== 'eraser' && tool !== 'smudge' && <ColorDish color={color} recent={recent} onColor={chooseColor} picking={tool === 'picker'} onPick={() => {if (tool === 'picker') setTool(previousTool.current); else setTool('picker');}} w={w}/>}
        </div>}
      </section>}

      {layersOpen && engine && !simple && <LayersPanel engine={engine} autoLayer={autoLayer} onAutoLayer={setAutoLayer} onClose={() => setLayersOpen(false)} onPicked={() => setAutoLayer(false)} w={w}/>}

      <div className="sb-viewbar" role="group" aria-label={w('보기', 'View')}>
        <button type="button" className="sb-icon" onClick={() => zoomBy(1 / 1.25)} aria-label={w('작게 보기', 'Zoom out')}><ZoomOut size={18}/></button>
        <button type="button" className="sb-zoom" onClick={fit} title={w('종이 전체 보기 (0)', 'Fit page (0)')}>{Math.round(view.scale * 100)}%</button>
        <button type="button" className="sb-icon" onClick={() => zoomBy(1.25)} aria-label={w('크게 보기', 'Zoom in')}><ZoomIn size={18}/></button>
        {view.rotation !== 0 && <button type="button" className="sb-icon" onClick={fit} aria-label={w('바로 세우기', 'Straighten')}><RotateCcw size={18}/></button>}
      </div>

      {toast && <div className="sb-toast" role="status">{toast}</div>}
    </div>

    {newOpen && <NewSketch w={w} paper={engine?.paper ?? 'white'} onPaper={paper => engine?.setPaper(paper)} onCreate={startNew} onClose={() => setNewOpen(false)}/>}
    {importFile && <ImageImport file={importFile} hasLines={!!engine?.hasLineReference()} onCancel={() => setImportFile(null)} onPlace={place} w={w}/>}
    <input ref={fileInput} hidden type="file" accept="image/*" onChange={event => {void openFile(event.target.files?.[0]); event.target.value = '';}}/>
    <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={event => {void openFile(event.target.files?.[0]); event.target.value = '';}}/>
    <input ref={sketchInput} hidden type="file" accept=".json,application/json" onChange={event => {const file = event.target.files?.[0]; if (file) void openSketch(file); event.target.value = '';}}/>
  </div>;
}

function NewSketch({w, paper, onPaper, onCreate, onClose}: {w: (ko: string, en: string) => string; paper: PaperKind; onPaper: (paper: PaperKind) => void; onCreate: (size: PaperSize, paper: PaperKind) => void; onClose: () => void}) {
  const [size, setSize] = useState<PaperSize>('landscape'), [kind, setKind] = useState<PaperKind>(paper);
  return <div className="sb-modal-backdrop" role="presentation" onPointerDown={event => {if (event.target === event.currentTarget) onClose();}}>
    <div className="sb-modal sb-new" role="dialog" aria-modal="true" aria-labelledby="sb-new-title">
      <header><h2 id="sb-new-title">{w('종이 고르기', 'Choose paper')}</h2><button type="button" className="sb-mini" onClick={onClose} aria-label={w('닫기', 'Close')}><X size={18}/></button></header>
      <div className="sb-papers" role="radiogroup" aria-label={w('종이 종류', 'Paper')}>{PAPERS.map(p => <button type="button" role="radio" aria-checked={kind === p.id} key={p.id} onClick={() => setKind(p.id)}><span className={`sb-paper-swatch sb-paper-${p.id}`}/>{w(p.ko, p.en)}</button>)}</div>
      <button type="button" className="sb-button" onClick={() => {onPaper(kind); onClose();}}>{w('지금 그림의 종이만 바꾸기', 'Change paper of this drawing')}</button>
      <h3>{w('새로 시작할 때 종이 모양', 'Shape for a new page')}</h3>
      <div className="sb-chips" role="radiogroup" aria-label={w('종이 모양', 'Page shape')}>{RATIOS.map(r => <button type="button" role="radio" aria-checked={size === r.id} key={r.id} className="sb-chip" onClick={() => setSize(r.id)}>{w(r.ko, r.en)}</button>)}</div>
      <p className="sb-hint">{w('새로 시작하면 지금 그림은 지워져요. 필요하면 먼저 그림 파일이나 편집 원본으로 저장해 두세요.', 'Starting over clears the current drawing; save it first if needed.')}</p>
      <footer><button type="button" className="sb-button" onClick={onClose}>{w('취소', 'Cancel')}</button><button type="button" className="sb-button primary" onClick={() => {if (confirm(w('지금 그림을 지우고 새로 시작할까요?', 'Clear the drawing and start over?'))) onCreate(size, kind);}}>{w('새로 시작', 'Start over')}</button></footer>
    </div>
  </div>;
}
