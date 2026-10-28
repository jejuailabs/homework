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

/** Keep within the saved -180..180 range; settle near upright and diagonal angles, or every 15° with Shift. */
export function snapRotation(degrees: number, coarse = false): number {
  let value = ((degrees + 180) % 360 + 360) % 360 - 180;
  if (coarse) value = Math.round(value / 15) * 15;
  else {
    const nearest = Math.round(value / 45) * 45;
    value = Math.abs(value - nearest) <= 4 ? nearest : Math.round(value);
  }
  return value === -180 ? 180 : value;
}

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
  const layersRef = useRef(layers), toolRef = useRef(tool), lastTap = useRef<{id: string; time: number} | null>(null);
  layersRef.current = layers; toolRef.current = tool;
  const action = useRef<{
    pointer: number; type: 'ink' | 'move' | 'erase' | 'resize' | 'rotate'; id?: string; start?: DiaryInkPoint; x?: number; y?: number;
    points?: DiaryInkPoint[]; chunks?: DiaryInkPoint[][]; brush?: 'pen' | 'pencil' | 'marker'; color?: string; width?: number;
    maxPoints?: number; used?: number; lastPressure?: number;
    distance?: number; size?: number; minSize?: number; angle?: number; rotation?: number;
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
    // A stray tap while a text box is open only finishes that box; it never stacks new empty boxes.
    if (tool === 'text' && layers.find(layer => layer.id === selected)?.kind === 'text') {onSelect(''); onTool('select'); return;}
    if (tool === 'text') {
      // Keep the browser's default press from pulling focus off the new text box before the child can type.
      event.preventDefault();
      const p = point(event);
      // New boxes are 76% wide: start the line at the tap and keep the whole box on the paper.
      onText(Math.max(38, Math.min(62, p[0] / DIARY_WIDTH * 100 + 38)), Math.max(8, Math.min(92, p[1] / DIARY_HEIGHT * 100)));
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
    else if (current.type === 'resize' || current.type === 'rotate') {
      const p = point(event), dx = p[0] - current.x!, dy = p[1] - current.y!;
      const patch = current.type === 'resize'
        ? {size: Math.round(Math.max(current.minSize!, Math.min(100, current.size! * Math.hypot(dx, dy) / current.distance!)) * 10) / 10}
        : {rotation: snapRotation(current.rotation! + Math.atan2(dy, dx) * 180 / Math.PI - current.angle!, event.shiftKey)};
      onChange(layersRef.current.map(layer => layer.id === current.id ? {...layer, ...patch} : layer));
    }
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
    // The box being typed in keeps its caret; any other tap selects so the piece can move and resize.
    if (tool === 'text' && layer.kind === 'text' && layer.id === selected) return;
    // Pointer capture swallows dblclick, so detect a quick second tap on the same text box here.
    const now = event.timeStamp, previous = lastTap.current;
    lastTap.current = {id: layer.id, time: now};
    if (layer.kind === 'text' && previous?.id === layer.id && now - previous.time < 400) {onSelect(layer.id); onTool('text'); return;}
    onSelect(layer.id);
    if (tool === 'text') onTool('select');
    page.current?.setPointerCapture(event.pointerId);
    onBegin();
    action.current = {type: 'move', pointer: event.pointerId, id: layer.id, start: point(event), x: layer.x, y: layer.y};
  }
  function handleDown(event: ReactPointerEvent<HTMLElement>, layer: DiaryLayer, type: 'resize' | 'rotate') {
    if (disabled || event.button !== 0 || action.current) return;
    event.preventDefault();
    event.stopPropagation();
    page.current?.setPointerCapture(event.pointerId);
    onBegin();
    const p = point(event), x = layer.x / 100 * DIARY_WIDTH, y = layer.y / 100 * DIARY_HEIGHT;
    action.current = {type, pointer: event.pointerId, id: layer.id, x, y, size: layer.size, minSize: layer.kind === 'text' ? 20 : 5,
      distance: Math.max(1, Math.hypot(p[0] - x, p[1] - y)), angle: Math.atan2(p[1] - y, p[0] - x) * 180 / Math.PI, rotation: layer.rotation};
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
    const handles = isSelected && tool === 'select' && !disabled;
    return <div key={layer.id} className={`sd-paper-layer ${isSelected ? 'is-selected' : ''} ${handles ? 'has-handles' : ''} ${layer.kind === 'text' ? 'is-text' : ''}`} data-diary-layer={layer.id} style={style} tabIndex={disabled ? -1 : 0} role="group" aria-label={layer.kind === 'text' ? '내 글 조각' : spaceItem(layer.itemId)?.name || '내 사진'} onPointerDown={event => objectDown(event, layer)} onKeyDown={event => keys(event, layer)} onDoubleClick={event => {if (layer.kind === 'text' && !disabled) {event.stopPropagation(); onSelect(layer.id); onTool('text');}}}>
      {layer.kind === 'text' ? <DiaryText layer={layer} editing={isSelected && tool === 'text'} disabled={disabled} onChange={text => onChange(layersRef.current.map(value => value.id === layer.id ? {...value, text} : value))}/> : <Picture layer={layer} assetBase={assetBase}/>}
      {handles && <span className="sd-transform" aria-hidden="true">
        {(['nw', 'ne', 'sw', 'se'] as const).map(corner => <span key={corner} className={`sd-handle sd-resize ${corner}`} title="끌어서 크기 바꾸기" onPointerDown={event => handleDown(event, layer, 'resize')}/>)}
        <span className="sd-rotate-stem"/>
        <span className="sd-handle sd-rotate" title="끌어서 돌리기" onPointerDown={event => handleDown(event, layer, 'rotate')}/>
      </span>}
    </div>;
  }

  return <div ref={viewport} className="sd-canvas-viewport" aria-label="일기장 종이 스크롤 영역">
    <div className="sd-canvas-sized" style={{width: DIARY_WIDTH * scale, height: DIARY_HEIGHT * scale}}>
      <div ref={page} className={`sd-paper ${paper} tool-${tool} ${ink.penOnly ? 'pen-only' : ''}`} data-diary-paper="true" style={{width: DIARY_WIDTH, height: DIARY_HEIGHT, transform: `scale(${scale})`, ['--sd-ui' as string]: String(1 / scale), backgroundColor: spaceItem(paper)?.color || '#fffbee'}} onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onDragOver={event => {if (event.dataTransfer.types.includes('application/x-diary-sticker')) {event.preventDefault(); event.dataTransfer.dropEffect = 'copy';}}} onDrop={event => {
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
