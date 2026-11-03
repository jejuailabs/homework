'use client';
import {ChevronDown, ChevronUp, Eye, EyeOff, Lock, LockOpen, Plus, Trash2, X} from 'lucide-react';
import type {SketchEngine} from './engine';
import {SKETCH_LIMITS} from './raster';

const kindLabel = {photo: ['사진', 'Photo'], paint: ['칠', 'Colour'], draw: ['그림', 'Drawing'], line: ['선', 'Lines']} as const;

/** Top of the list is the top of the page. Pixels are undoable; layer structure changes are not. */
export default function LayersPanel({engine, autoLayer, onAutoLayer, onClose, onPicked, w}: {engine: SketchEngine; autoLayer: boolean; onAutoLayer: (value: boolean) => void; onClose: () => void; onPicked: () => void; w: (ko: string, en: string) => string}) {
  const layers = [...engine.layers].reverse();
  return <section className="sb-card sb-layers" aria-label={w('레이어', 'Layers')}>
    <header><strong>{w('레이어', 'Layers')}</strong><small>{engine.layers.length}/{SKETCH_LIMITS.maxLayers}</small><button type="button" className="sb-mini" onClick={onClose} aria-label={w('닫기', 'Close')}><X size={16}/></button></header>
    <label className="sb-check"><input type="checkbox" checked={autoLayer} onChange={event => onAutoLayer(event.target.checked)}/>{w('도구에 맞춰 자동으로 고르기', 'Pick the layer for each tool')}</label>
    <ol>{layers.map((layer, index) => <li key={layer.id} className={layer.id === engine.activeId ? 'is-active' : ''}>
      <button type="button" className="sb-layer-name" aria-pressed={layer.id === engine.activeId} onClick={() => {engine.setActive(layer.id); onPicked();}}>
        <span className={`sb-layer-kind sb-kind-${layer.kind}`}>{w(kindLabel[layer.kind][0], kindLabel[layer.kind][1])}</span>{layer.name}
      </button>
      <div className="sb-layer-actions">
        <button type="button" className="sb-mini" aria-pressed={!layer.visible} onClick={() => engine.updateLayer(layer.id, {visible: !layer.visible})} aria-label={layer.visible ? w(`${layer.name} 숨기기`, `Hide ${layer.name}`) : w(`${layer.name} 보이기`, `Show ${layer.name}`)}>{layer.visible ? <Eye size={15}/> : <EyeOff size={15}/>}</button>
        <button type="button" className="sb-mini" aria-pressed={layer.locked} onClick={() => engine.updateLayer(layer.id, {locked: !layer.locked})} aria-label={layer.locked ? w(`${layer.name} 잠금 풀기`, `Unlock ${layer.name}`) : w(`${layer.name} 잠그기`, `Lock ${layer.name}`)}>{layer.locked ? <Lock size={15}/> : <LockOpen size={15}/>}</button>
        <button type="button" className="sb-mini" disabled={index === 0} onClick={() => engine.moveLayer(layer.id, 1)} aria-label={w('위로', 'Move up')}><ChevronUp size={15}/></button>
        <button type="button" className="sb-mini" disabled={index === layers.length - 1} onClick={() => engine.moveLayer(layer.id, -1)} aria-label={w('아래로', 'Move down')}><ChevronDown size={15}/></button>
        <button type="button" className="sb-mini" disabled={engine.layers.length <= 1} onClick={() => {if (!layer.filled || confirm(w(`'${layer.name}' 레이어를 지울까요? 되돌릴 수 없어요.`, `Delete '${layer.name}'? This cannot be undone.`))) engine.removeLayer(layer.id);}} aria-label={w(`${layer.name} 지우기`, `Delete ${layer.name}`)}><Trash2 size={15}/></button>
      </div>
      <label className="sb-layer-opacity"><span>{w('불투명도', 'Opacity')} {Math.round(layer.opacity * 100)}%</span><input type="range" min={0} max={100} value={Math.round(layer.opacity * 100)} onChange={event => engine.updateLayer(layer.id, {opacity: Number(event.target.value) / 100})}/></label>
    </li>)}</ol>
    <div className="sb-layers-add">
      <button type="button" className="sb-chip" disabled={engine.layers.length >= SKETCH_LIMITS.maxLayers} onClick={() => engine.addLayer('draw', w('새 그림', 'New drawing'))}><Plus size={15}/>{w('그림 레이어 추가', 'Add a drawing layer')}</button>
      <button type="button" className="sb-chip" disabled={!engine.active.filled || engine.active.locked} onClick={() => {if (confirm(w(`'${engine.active.name}'의 그림을 모두 지울까요? 실행 취소로 되돌릴 수 있어요.`, `Clear '${engine.active.name}'? Undo restores it.`))) engine.clearLayer(engine.activeId);}}>{w('이 레이어 비우기', 'Clear this layer')}</button>
    </div>
  </section>;
}
