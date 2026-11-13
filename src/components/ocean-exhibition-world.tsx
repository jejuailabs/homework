"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {ArrowLeft, ChevronLeft, ChevronRight, DoorOpen, Images, RotateCcw, Undo2, Redo2, X} from "lucide-react";
import WorldJoystick from "./world-joystick";
import {spaceCatUrl} from "@/lib/space-exhibition/themes";
import {OCEAN_THEME_TEXT, oceanAssetUrl, type OceanTheme} from "@/lib/ocean-exhibition/themes";
import oceanData from "@/lib/ocean-exhibition/data.json";
import catRects from "@/lib/space-exhibition/cat-rects.json";
import type {WorldArtwork} from "./exhibition-world";
import "@/styles/space-exhibition.css";

type Runtime = {
  enterGallery: () => void; back: () => void; reset: () => void; setPage: (delta: number) => void;
  activateNearby: () => void; turn: (direction: number) => void; setStick: (x: number, y: number) => void;
  refresh: () => void; dispose: () => void;
};
type RuntimeState = {
  stage: "exterior" | "gallery"; page: number; pageCount: number; loading: boolean; failed: boolean;
  nearby: {kind: string; title?: string; id?: string} | null; hero: {index: number; total: number} | null;
};

export type OceanExhibitionWorldProps = {
  theme: OceanTheme;
  roomTitle?: string;
  artworks: WorldArtwork[];
  locale?: string;
  paused?: boolean;
  onSelectArtwork: (id: string) => void;
  onExit: () => void;
};

/** Ocean-mode exhibition: the 3D runtime and Three.js load only when an ocean room opens. Same controls as the space mode. */
export default function OceanExhibitionWorld(props: OceanExhibitionWorldProps) {
  const {theme, roomTitle, artworks, locale = "ko", paused = false} = props;
  const english = locale.startsWith("en");
  const hostRef = useRef<HTMLDivElement>(null), rootRef = useRef<HTMLElement>(null);
  const runtime = useRef<Runtime | null>(null), callbacks = useRef(props), pausedRef = useRef(paused);
  const [state, setState] = useState<RuntimeState | null>(null), [error, setError] = useState(false), [listOpen, setListOpen] = useState(false);
  const works = artworks.filter(work => work.url || work.thumbnailUrl);
  const worksKey = JSON.stringify(works.map(work => [work.id, work.title, work.url, work.thumbnailUrl, work.width, work.height, work.artistName || work.studentName || ""]));
  const text = OCEAN_THEME_TEXT[theme];

  useEffect(() => { callbacks.current = props; });
  useEffect(() => { pausedRef.current = paused || listOpen; runtime.current?.refresh(); }, [paused, listOpen]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    setError(false); setState(null);
    const list = JSON.parse(worksKey) as [string, string, string | undefined, string | undefined, number | undefined, number | undefined, string][];
    void Promise.all([import("three"), import("@/lib/ocean-exhibition/runtime.js")]).then(([T, module]) => {
      if (cancelled) return;
      runtime.current = module.createOceanRuntime({
        T, host, theme, english, roomTitle,
        data: oceanData, assetUrl: oceanAssetUrl,
        cat: {url: spaceCatUrl(), rects: catRects},
        artworks: list.map(([id, title, url, thumbnailUrl, width, height, artist]) => ({id, title, artist, image: thumbnailUrl || url || "", hero: url || thumbnailUrl || "", width, height})),
        isActive: () => {
          if (pausedRef.current) return false;
          const root = rootRef.current, open = document.querySelector("dialog[open],[role=dialog][aria-modal=true]");
          return !open || !!root && (open.contains(root) || root.contains(open));
        },
        onState: (next: RuntimeState) => { if (!cancelled) setState(next); },
        onSelect: (id: string) => callbacks.current.onSelectArtwork(id),
        onExit: () => callbacks.current.onExit(),
      }) as Runtime;
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; runtime.current?.dispose(); runtime.current = null; };
  }, [theme, english, worksKey, roomTitle]);

  const moveStick = useCallback((x: number, y: number) => runtime.current?.setStick(x, y), []);
  const stage = state?.stage || "exterior";
  const failed = error || state?.failed;
  // The artwork you stand by: its title and artist, large enough to read at a glance.
  const nearbyArt = state?.nearby?.kind === "art" ? artworks.find(work => work.id === state.nearby?.id) || {title: state.nearby.title || "", artistName: "", studentName: ""} : null;
  const nearbyArtist = nearbyArt ? nearbyArt.artistName || nearbyArt.studentName || "" : "";
  const nearbyText = state?.nearby ? state.nearby.kind === "art" ? (english ? `View · ${state.nearby.title}` : `작품 감상 · ${state.nearby.title}`) : state.nearby.kind === "back" ? (english ? "Back to entrance" : "입구로") : null : null;

  return <section ref={rootRef} className={`sx-world sx-theme-${theme}${paused ? " sx-world--paused" : ""}`} aria-label={english ? `${text.en} 3D gallery` : `${text.ko} 3D 전시`}>
    <div ref={hostRef} className="sx-canvas"/>
    <div className="sx-upper">
      <button type="button" className="sx-glass" onClick={() => stage === "gallery" ? runtime.current?.back() : props.onExit()}><ArrowLeft size={16}/>{stage === "gallery" ? (english ? "Entrance" : "입구로") : (english ? "Leave" : "나가기")}</button>
      <div className="sx-glass sx-location"><span>{english ? text.en : text.ko}</span><strong>{roomTitle || (english ? "Exhibition" : "전시")}</strong></div>
      <div className="sx-upper-right">{stage === "gallery" && !!works.length && <button type="button" className="sx-glass" onClick={() => setListOpen(true)}><Images size={16}/>{english ? "Works" : "작품 목록"}</button>}</div>
    </div>
    <WorldJoystick disabled={paused || !state || !!failed} english={english} onMove={moveStick}/>
    <div className="sx-lower">
      {stage === "exterior" && state && !failed && <button type="button" className="sx-action" onClick={() => runtime.current?.enterGallery()}><DoorOpen size={17}/>{english ? "Enter the gallery" : "전시실 들어가기"}</button>}
      {stage === "gallery" && nearbyArt ? <button type="button" className="sx-glass sx-nearby sx-nearby-art" onClick={() => runtime.current?.activateNearby()}><strong>{nearbyArt.title}</strong>{nearbyArtist && nearbyArtist !== nearbyArt.title && <span>{nearbyArtist}</span>}<em>{english ? "Tap to view large" : "눌러서 크게 보기"}</em></button>
        : stage === "gallery" && nearbyText && <button type="button" className="sx-glass sx-nearby" onClick={() => runtime.current?.activateNearby()}>{nearbyText}</button>}
      {stage === "gallery" && state && state.pageCount > 1 && <nav className="sx-glass sx-pages" aria-label={english ? "Gallery rooms" : "전시실 이동"}>
        <button type="button" disabled={state.page === 0} onClick={() => runtime.current?.setPage(-1)} aria-label={english ? "Previous room" : "이전 전시실"}><ChevronLeft size={17}/></button>
        <span>{english ? `Room ${state.page + 1} / ${state.pageCount}` : `${state.page + 1} / ${state.pageCount}실`}</span>
        <button type="button" disabled={state.page >= state.pageCount - 1} onClick={() => runtime.current?.setPage(1)} aria-label={english ? "Next room" : "다음 전시실"}><ChevronRight size={17}/></button>
      </nav>}
    </div>
    <div className="sx-glass sx-view">
      <button type="button" onClick={() => runtime.current?.turn(-1)} aria-label={english ? "Look left" : "왼쪽 보기"}><Undo2 size={16}/></button>
      <button type="button" onClick={() => runtime.current?.turn(1)} aria-label={english ? "Look right" : "오른쪽 보기"}><Redo2 size={16}/></button>
      <button type="button" onClick={() => runtime.current?.reset()} aria-label={english ? "Back to start" : "처음 위치로"}><RotateCcw size={16}/></button>
    </div>
    {(!state || state.loading) && !failed && <p className="sx-glass sx-status" role="status">{english ? "Opening the ocean gallery…" : "바닷속 전시실을 여는 중…"}</p>}
    {failed && <p className="sx-glass sx-status" role="alert">{english ? "This device cannot show the 3D gallery. Use the grid view instead." : "이 기기에서는 3D 전시를 열 수 없어요. 목록 보기로 감상해 주세요."}</p>}
    {stage === "gallery" && !works.length && state && <p className="sx-glass sx-status">{english ? "No works are on display yet." : "아직 전시된 작품이 없어요."}</p>}
    {listOpen && <div className="sx-list" role="dialog" aria-modal="true" aria-label={english ? "Works" : "작품 목록"} onKeyDown={event => {if (event.key === "Escape") setListOpen(false);}}>
      <div className="sx-list-head"><h2>{english ? `Works · ${works.length}` : `작품 목록 · ${works.length}점`}</h2><button type="button" autoFocus onClick={() => setListOpen(false)} aria-label={english ? "Close" : "닫기"}><X size={18}/></button></div>
      <div className="sx-list-items">{works.map(work => <button type="button" key={work.id} onClick={() => {setListOpen(false); props.onSelectArtwork(work.id);}}><img src={work.thumbnailUrl || work.url} alt="" loading="lazy"/><span>{work.title}</span><small>{work.artistName || work.studentName || ""}</small></button>)}</div>
    </div>}
  </section>;
}
