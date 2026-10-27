'use client';

import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent} from 'react';
import {spaceItem, type DiaryLayer} from './catalog';
import {appendDiaryPoint, diaryInkPath, diaryPoint, DIARY_HEIGHT, DIARY_POINT_LIMIT, DIARY_STROKE_LIMIT, DIARY_WIDTH, type DiaryInkPoint} from './diary-ink';

export type DiaryTool = 'select' | 'text' | 'pen' | 'pencil' | 'marker' | 'eraser';
export type InkSettings = {color: string; width: number; penOnly: boolean};
type CanvasProps = {
  layers: DiaryLayer[]; paper: string; selected: string; tool: DiaryTool; ink: InkSettings; zoom: number; disabled?: boolean;
  onChange: (layers: DiaryLayer[]) => void; onSelect: (id: string) => void; onTool: (tool: DiaryTool) => void;
  onText: (x: number, y: number) => void; onSticker: (itemId: string, x: number, y: number) => void;
  onBegin: () => void; onEnd: () => void; onNotice: (notice: string) => void;
  commitRef?: MutableRefObject<(() => void) | null>;
  assetBase?: string;
  onTextOverflow?: (overflowing: boolean) => void;
};

function DiaryText({layer, editing, disabled, onChange}: {layer: DiaryLayer; editing: boolean; disabled: boolean; onChange: (text: string) => void}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const style: CSSProperties = {fontSize: layer.fontSize || 24, color: layer.color || '#3f5048', textAlign: layer.align || 'left'};
  useLayoutEffect(() => {
    if (!area.current) return;
    area.current.style.height = '0px';
    area.current.style.height = `${area.current.scrollHeight}px`;
  }, [layer.text, layer.fontSize, layer.size, editing]);
  useEffect(() => {if (editing) area.current?.focus({preventScroll: true});}, [editing]);
  if (!editing) return <div className="sd-written-text" style={style}>{layer.text ? layer.text + (layer.text.endsWith('\n') ? '\u200b' : '') : <span className="sd-text-placeholder">여기에 내 이야기를 적어요</span>}</div>;
  return <textarea ref={area} className="sd-written-text sd-inline-text" rows={1} style={style} aria-label="일기 글 쓰기" maxLength={6000} value={layer.text || ''} disabled={disabled} onChange={event => onChange(event.target.value)} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} placeholder="여기에 내 이야기를 적어요" spellCheck={false}/>;
}

function Picture({layer, assetBase}: {layer: DiaryLayer; assetBase: string}) {
  const [failed, setFailed] = useState(false);
  const item = spaceItem(layer.itemId);
  const src = layer.kind === 'photo' ? `${assetBase}/photo/${layer.assetId}` : layer.kind === 'art' ? `${assetBase}/art/${layer.assetId}` : item?.art;
  useEffect(() => setFailed(false), [src]);
  if (failed) return <span className="sd-picture-missing">사진을 불러오지 못했어요</span>;
  if (src) return <img src={src} alt={item?.name || '내 사진'} draggable={false} onError={() => setFailed(true)}/>;
  if (item?.motif === 'tape') return <span className="sd-legacy-tape"/>;
  return <span className="sd-legacy-sticker">{item?.motif || '✦'}</span>;
}

export default function DiaryCanvas({layers, paper, selected, tool, ink, zoom, disabled = false, onChange, onSelect, onTool, onText, onSticker, onBegin, onEnd, onNotice, commitRef, assetBase = '/api/secret-diary/assets', onTextOverflow}: CanvasProps) {
  const page = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(DIARY_WIDTH), [pending, setPending] = useState<DiaryLayer[]>([]);
  const layersRef = useRef(layers), toolRef = useRef(tool);
  layersRef.current = layers; toolRef.current = tool;
  const action = useRef<{
    pointer: number; type: 'ink' | 'move' | 'erase'; id?: string; start?: DiaryInkPoint; x?: number; y?: number;
    points?: DiaryInkPoint[]; chunks?: DiaryInkPoint[][]; brush?: 'pen' | 'pencil' | 'marker'; color?: string; width?: number;
    maxPoints?: number; used?: number; lastPressure?: number;
  } | null>(null);

  useEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const resize = () => setAvailableWidth(Math.max(220, container.clientWidth - 32));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => {action.current = null;}, []);
  const scale = Math.min(1, availableWidth / DIARY_WIDTH) * zoom;
  useLayoutEffect(() => {
    if (!page.current || !onTextOverflow) return;
    const paperBounds = page.current.getBoundingClientRect();
    const nodes = page.current.querySelectorAll<HTMLElement>('.sd-paper-layer.is-text');
    const overflowing = [...nodes].some(node => {
      const layer = layers.find(value => value.id === node.dataset.diaryLayer);
      if (!layer?.text?.trim()) return false;
      const bounds = node.getBoundingClientRect();
      return bounds.left < paperBounds.left - 1 || bounds.right > paperBounds.right + 1 || bounds.top < paperBounds.top - 1 || bounds.bottom > paperBounds.bottom + 1;
    });
    onTextOverflow(overflowing);
  }, [layers, selected, tool, scale, onTextOverflow]);

  function point(event: {clientX: number; clientY: number; pressure?: number; pointerType?: string}) {
    return diaryPoint(event.clientX, event.clientY, page.current!.getBoundingClientRect(), event.pointerType === 'pen' ? event.pressure : .5);
  }
  function inkLayer(points: DiaryInkPoint[], id: string): DiaryLayer {
    const drawing = action.current!;
    return {id, itemId: '', kind: 'ink', x: 50, y: 50, size: 100, rotation: 0, flip: false, points,
      brush: drawing.brush, width: drawing.width, color: drawing.color, opacity: drawing.brush === 'marker' ? .3 : drawing.brush === 'pencil' ? .8 : 1};
  }
  function preview() {
    const drawing = action.current;
    if (drawing?.type !== 'ink') return;
    setPending([...drawing.chunks!, drawing.points!].map((points, index) => inkLayer(points, `pending-${index}`)));
  }
  function collect(event: PointerEvent | ReactPointerEvent) {
    const drawing = action.current;
    if (drawing?.type !== 'ink') return;
    const native = 'nativeEvent' in event ? event.nativeEvent : event;
    const samples = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    for (const sample of samples.length ? samples : [native]) {
      if (drawing.used! >= drawing.maxPoints!) break;
      const next = point(sample);
      if (sample.pointerType === 'pen' && sample.pressure === 0) next[2] = drawing.lastPressure || .5;
      drawing.lastPressure = next[2];
      const last = drawing.points!.at(-1);
      if (last && Math.hypot(next[0] - last[0], next[1] - last[1]) < .3 && Math.abs(next[2] - last[2]) < .02) continue;
      if (drawing.points!.length === DIARY_STROKE_LIMIT) {
        if (drawing.used! + 2 > drawing.maxPoints!) break;
        drawing.chunks!.push(drawing.points!);
        drawing.points = [drawing.points!.at(-1)!];
        drawing.used = drawing.used! + 1;
      }
      if (appendDiaryPoint(drawing.points!, next)) drawing.used = drawing.used! + 1;
    }
    preview();
  }
  function eraseAt(event: ReactPointerEvent) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-diary-ink]');
    const id = target?.dataset.diaryInk;
    if (id && layersRef.current.some(layer => layer.id === id)) {
      const next = layersRef.current.filter(layer => layer.id !== id);
      layersRef.current = next;
      onChange(next);
      if (selected === id) onSelect('');
    }
  }
  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || action.current) return;
    if (tool === 'select') {onSelect(''); return;}
    if (tool === 'text') {
      const p = point(event);
      onText(Math.max(10, Math.min(90, p[0] / DIARY_WIDTH * 100)), Math.max(8, Math.min(92, p[1] / DIARY_HEIGHT * 100)));
      return;
    }
    if (ink.penOnly && event.pointerType !== 'pen') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onBegin();
    if (tool === 'eraser') {
      action.current = {pointer: event.pointerId, type: 'erase'};
      eraseAt(event);
      return;
    }
    const used = layers.reduce((total, layer) => total + (layer.points?.length || 0), 0);
    if (layers.length >= 500 || used >= DIARY_POINT_LIMIT) {
      onEnd();
      onNotice('이 페이지가 가득 찼어요. 달력에서 같은 날짜의 새 페이지에 이어 써 주세요.');
      return;
    }
    const maxByLayers = (500 - layers.length) * (DIARY_STROKE_LIMIT - 1);
    action.current = {pointer: event.pointerId, type: 'ink', points: [], chunks: [], brush: tool, width: ink.width,
      color: ink.color, maxPoints: Math.min(DIARY_POINT_LIMIT - used, maxByLayers), used: 0};
    onSelect('');
    collect(event);
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const current = action.current;
    if (!current || current.pointer !== event.pointerId) return;
    event.preventDefault();
    if (current.type === 'ink') collect(event);
    else if (current.type === 'erase') eraseAt(event);
    else {
      const p = point(event);
      onChange(layersRef.current.map(layer => layer.id === current.id ? {...layer,
        x: Math.round(Math.max(0, Math.min(100, current.x! + (p[0] - current.start![0]) / DIARY_WIDTH * 100)) * 100) / 100,
        y: Math.round(Math.max(0, Math.min(100, current.y! + (p[1] - current.start![1]) / DIARY_HEIGHT * 100)) * 100) / 100} : layer));
    }
  }
  function commitPending() {
    const current = action.current;
    if (!current) return;
    if (current.type === 'ink') {
      const strokes = [...current.chunks!, current.points!].filter(points => points.length).map(points => inkLayer(points, crypto.randomUUID()));
      if (strokes.length) onChange([...layersRef.current, ...strokes]);
      if (current.used! >= current.maxPoints!) onNotice('이 페이지의 필기 공간을 다 썼어요. 새 페이지에 이어 써 주세요.');
    }
    action.current = null;
    setPending([]);
    onEnd();
  }
  useLayoutEffect(() => {if (commitRef) commitRef.current = commitPending; return () => {if (commitRef) commitRef.current = null;};});
  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const current = action.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (current.type === 'ink' && event.type === 'pointerup') collect(event);
    commitPending();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function objectDown(event: ReactPointerEvent<HTMLElement | SVGSVGElement>, layer: DiaryLayer) {
    if (disabled || event.button !== 0 || action.current) return;
    if (tool !== 'select' && tool !== 'text') return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(layer.id);
    if (tool === 'text' && layer.kind === 'text') return;
    page.current?.setPointerCapture(event.pointerId);
    onBegin();
    action.current = {type: 'move', pointer: event.pointerId, id: layer.id, start: point(event), x: layer.x, y: layer.y};
  }
  function keys(event: React.KeyboardEvent, layer: DiaryLayer) {
    if (disabled) return;
    if (event.key === 'Enter') {onSelect(layer.id); if (layer.kind === 'text') onTool('text'); return;}
    const multiplier = event.shiftKey ? 5 : 1;
    const dx = event.key === 'ArrowLeft' ? -multiplier : event.key === 'ArrowRight' ? multiplier : 0;
    const dy = event.key === 'ArrowUp' ? -multiplier : event.key === 'ArrowDown' ? multiplier : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    onSelect(layer.id);
    onChange(layers.map(item => item.id === layer.id ? {...item, x: Math.max(0, Math.min(100, item.x + dx)), y: Math.max(0, Math.min(100, item.y + dy))} : item));
  }
  function renderLayer(layer: DiaryLayer, index: number, previewOnly = false) {
    const isSelected = selected === layer.id && !previewOnly;
    const style: CSSProperties = {left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.size}%`, transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scaleX(${layer.flip ? -1 : 1})`, zIndex: index + 1};
    if (layer.kind === 'ink') return <svg key={layer.id} className={`sd-ink-layer ${isSelected ? 'is-selected' : ''}`} viewBox={`0 0 ${DIARY_WIDTH} ${DIARY_HEIGHT}`} style={{...style, height: `${layer.size}%`}} aria-label="손글씨 획" role={previewOnly ? undefined : 'button'} tabIndex={previewOnly || disabled ? -1 : 0} onPointerDown={event => objectDown(event, layer)} onKeyDown={event => keys(event, layer)}>
      <path d={diaryInkPath(layer, !previewOnly)} fill={layer.color || '#3f5048'} opacity={layer.opacity ?? 1} data-diary-ink={layer.id} style={{pointerEvents: previewOnly || ['pen', 'pencil', 'marker'].includes(tool) ? 'none' : 'visiblePainted'}}/>
    </svg>;
    return <div key={layer.id} className={`sd-paper-layer ${isSelected ? 'is-selected' : ''} ${layer.kind === 'text' ? 'is-text' : ''}`} data-diary-layer={layer.id} style={style} tabIndex={disabled ? -1 : 0} role="group" aria-label={layer.kind === 'text' ? '내 글 조각' : spaceItem(layer.itemId)?.name || '내 사진'} onPointerDown={event => objectDown(event, layer)} onKeyDown={event => keys(event, layer)} onDoubleClick={event => {if (layer.kind === 'text' && !disabled) {event.stopPropagation(); onSelect(layer.id); onTool('text');}}}>
      {layer.kind === 'text' ? <DiaryText layer={layer} editing={isSelected && tool === 'text'} disabled={disabled} onChange={text => onChange(layersRef.current.map(value => value.id === layer.id ? {...value, text} : value))}/> : <Picture layer={layer} assetBase={assetBase}/>}
    </div>;
  }

  return <div ref={viewport} className="sd-canvas-viewport" aria-label="일기장 종이 스크롤 영역">
    <div className="sd-canvas-sized" style={{width: DIARY_WIDTH * scale, height: DIARY_HEIGHT * scale}}>
      <div ref={page} className={`sd-paper ${paper} tool-${tool} ${ink.penOnly ? 'pen-only' : ''}`} data-diary-paper="true" style={{width: DIARY_WIDTH, height: DIARY_HEIGHT, transform: `scale(${scale})`, backgroundColor: spaceItem(paper)?.color || '#fffbee'}} onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onDragOver={event => {if (event.dataTransfer.types.includes('application/x-diary-sticker')) {event.preventDefault(); event.dataTransfer.dropEffect = 'copy';}}} onDrop={event => {
        event.preventDefault();
        if (disabled) return;
        const id = event.dataTransfer.getData('application/x-diary-sticker');
        if (!id) return;
        const p = point(event);
        onSticker(id, p[0] / DIARY_WIDTH * 100, p[1] / DIARY_HEIGHT * 100);
      }}>
        <span className="sd-paper-top" aria-hidden="true">MY LITTLE DIARY <span>✦</span></span>
        <span className="sd-paper-bottom" aria-hidden="true">오늘의 마음을 소중히</span>
        {!layers.length && !pending.length && <div className="sd-paper-welcome" aria-hidden="true"><span>✿</span><p>어떤 하루였나요?</p><small>글로, 그림으로, 스티커로<br/>나의 마음을 남겨 보세요.</small></div>}
        {layers.map((layer, index) => renderLayer(layer, index))}
        {pending.map((layer, index) => renderLayer(layer, layers.length + index, true))}
      </div>
    </div>
  </div>;
}
