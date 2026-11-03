'use client';
import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from 'react';
import {Crop, Image as ImageIcon, LoaderCircle, PenLine, RotateCcw, RotateCw, X} from 'lucide-react';
import {extractLineArt, fitSize, SKETCH_LIMITS} from './raster';

export type ImportChoice = {mode: 'photo' | 'lines'; canvas: HTMLCanvasElement; threshold: number; blackLines: boolean; faint: boolean};
const MAX_SOURCE_PIXELS = 50_000_000;

/**
 * Decodes with EXIF orientation applied and redraws only the pixels, so location and
 * camera metadata never reach the sketch. The long edge is capped for device memory.
 */
export async function decodeImage(file: Blob) {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
  try {
    if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) throw new Error('too-large');
    const size = fitSize(bitmap.width, bitmap.height, SKETCH_LIMITS.importEdge), canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    return canvas;
  } finally {bitmap.close();}
}

function rotate(source: HTMLCanvasElement, clockwise: boolean) {
  const out = document.createElement('canvas'); out.width = source.height; out.height = source.width;
  const ctx = out.getContext('2d')!; ctx.translate(out.width / 2, out.height / 2); ctx.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2); ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

type Box = {x: number; y: number; w: number; h: number};

export default function ImageImport({file, onCancel, onPlace, hasLines, w}: {file: Blob; onCancel: () => void; onPlace: (choice: ImportChoice) => void; hasLines: boolean; w: (ko: string, en: string) => string}) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null), [error, setError] = useState('');
  const [mode, setMode] = useState<'photo' | 'lines'>(hasLines ? 'photo' : 'lines'), [threshold, setThreshold] = useState(170), [blackLines, setBlackLines] = useState(true), [faint, setFaint] = useState(false);
  const [crop, setCrop] = useState<Box | null>(null), [cropping, setCropping] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null), drag = useRef<{x: number; y: number} | null>(null);

  useEffect(() => {
    let alive = true;
    decodeImage(file).then(canvas => {if (alive) setSource(canvas);}).catch(e => {if (alive) setError(e instanceof Error && e.message === 'too-large' ? w('사진이 너무 커요. 더 작은 사진을 골라 주세요.', 'This picture is too large.') : w('이 파일은 그림으로 열 수 없어요.', 'This file cannot be opened as a picture.'));});
    return () => {alive = false;};
  }, [file, w]);

  // Preview at a small size so the threshold slider responds instantly.
  useEffect(() => {
    const canvas = preview.current; if (!canvas || !source) return;
    const size = fitSize(source.width, source.height, 560); canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d', {willReadFrequently: true})!; ctx.clearRect(0, 0, size.width, size.height); ctx.drawImage(source, 0, 0, size.width, size.height);
    if (mode === 'lines') {
      const image = ctx.getImageData(0, 0, size.width, size.height), lines = extractLineArt({width: size.width, height: size.height, data: image.data}, threshold, 24, blackLines ? [32, 34, 38] : undefined);
      ctx.fillStyle = '#fffefb'; ctx.fillRect(0, 0, size.width, size.height);
      const layer = document.createElement('canvas'); layer.width = size.width; layer.height = size.height;
      layer.getContext('2d')!.putImageData(new ImageData(lines.data, size.width, size.height), 0, 0); ctx.drawImage(layer, 0, 0);
    } else if (faint) {ctx.fillStyle = '#fffefbaa'; ctx.fillRect(0, 0, size.width, size.height);}
  }, [source, mode, threshold, blackLines, faint]);

  const point = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))};
  };
  const turn = (clockwise: boolean) => {if (source) {setSource(rotate(source, clockwise)); setCrop(null);}};
  const place = () => {
    if (!source) return;
    let canvas = source;
    if (crop && crop.w > 0.02 && crop.h > 0.02) {
      const sx = Math.round(crop.x * source.width), sy = Math.round(crop.y * source.height), sw = Math.max(1, Math.round(crop.w * source.width)), sh = Math.max(1, Math.round(crop.h * source.height));
      canvas = document.createElement('canvas'); canvas.width = sw; canvas.height = sh; canvas.getContext('2d')!.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    }
    onPlace({mode, canvas, threshold, blackLines, faint});
  };

  return <div className="sb-modal-backdrop" role="presentation" onPointerDown={event => {if (event.target === event.currentTarget) onCancel();}}>
    <div className="sb-modal sb-import" role="dialog" aria-modal="true" aria-labelledby="sb-import-title">
      <header><h2 id="sb-import-title">{w('이미지를 어떻게 쓸까요?', 'How should this picture be used?')}</h2><button type="button" className="sb-mini" onClick={onCancel} aria-label={w('닫기', 'Close')}><X size={18}/></button></header>
      <div className="sb-import-choice" role="radiogroup" aria-label={w('쓰는 방법', 'Use as')}>
        <button type="button" role="radio" aria-checked={mode === 'lines'} onClick={() => setMode('lines')}><PenLine size={20}/><span><strong>{w('도안으로 쓰기', 'Use as a colouring page')}</strong><small>{w('선만 남겨 맨 위에 고정해요. 채우기가 선을 넘지 않아요.', 'Keeps only the lines on top; fills stop at them.')}</small></span></button>
        <button type="button" role="radio" aria-checked={mode === 'photo'} onClick={() => setMode('photo')}><ImageIcon size={20}/><span><strong>{w('사진으로 깔기', 'Lay under as a photo')}</strong><small>{w('맨 아래 사진 칸에 깔고 그 위에 그려요.', 'Goes to the bottom photo layer to draw over.')}</small></span></button>
      </div>
      <div className={`sb-import-stage${cropping ? ' is-cropping' : ''}`}>
        {!source && !error && <LoaderCircle className="spin"/>}
        {error && <p className="sb-import-error" role="alert">{error}</p>}
        {source && <div className="sb-import-frame" onPointerDown={event => {if (!cropping) return; event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); drag.current = p; setCrop({x: p.x, y: p.y, w: 0, h: 0});}} onPointerMove={event => {if (!cropping || !drag.current) return; const p = point(event), s = drag.current; setCrop({x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y)});}} onPointerUp={() => {drag.current = null;}}>
          <canvas ref={preview} className={mode === 'lines' ? 'is-lines' : ''}/>
          {crop && crop.w > 0 && <span className="sb-crop" style={{left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`}}/>}
        </div>}
      </div>
      <div className="sb-import-tools">
        <button type="button" className="sb-chip" onClick={() => turn(false)} disabled={!source}><RotateCcw size={16}/>{w('왼쪽으로', 'Left')}</button>
        <button type="button" className="sb-chip" onClick={() => turn(true)} disabled={!source}><RotateCw size={16}/>{w('오른쪽으로', 'Right')}</button>
        <button type="button" className="sb-chip" aria-pressed={cropping} onClick={() => setCropping(v => !v)} disabled={!source}><Crop size={16}/>{cropping ? w('자를 곳을 끌어 주세요', 'Drag to crop') : w('자르기', 'Crop')}</button>
        {crop && <button type="button" className="sb-chip" onClick={() => setCrop(null)}>{w('자르기 취소', 'Undo crop')}</button>}
      </div>
      {mode === 'lines' ? <div className="sb-import-options">
        <label className="sb-slider"><span>{w('선으로 남길 진하기', 'Line darkness')}<output>{threshold}</output></span><input type="range" min={60} max={240} value={threshold} onChange={event => setThreshold(Number(event.target.value))}/></label>
        <p className="sb-hint">{w('종이 그림자까지 선으로 남으면 왼쪽으로, 선이 끊기면 오른쪽으로 옮겨 보세요.', 'Move left if paper shadows remain, right if lines break up.')}</p>
        <label className="sb-check"><input type="checkbox" checked={blackLines} onChange={event => setBlackLines(event.target.checked)}/>{w('선을 검은색으로 맞추기', 'Make all lines dark')}</label>
        {hasLines && <p className="sb-hint">{w('지금 있는 선은 새 도안으로 바뀌어요. 실행 취소로 되돌릴 수 있어요.', 'The current lines will be replaced (undo restores them).')}</p>}
      </div> : <div className="sb-import-options">
        <label className="sb-check"><input type="checkbox" checked={faint} onChange={event => setFaint(event.target.checked)}/>{w('흐리게 깔기 (따라 그리기용)', 'Faint, for tracing')}</label>
      </div>}
      <footer><button type="button" className="sb-button" onClick={onCancel}>{w('취소', 'Cancel')}</button><button type="button" className="sb-button primary" disabled={!source} onClick={place}>{mode === 'lines' ? w('도안 놓기', 'Place lines') : w('사진 깔기', 'Place photo')}</button></footer>
    </div>
  </div>;
}
