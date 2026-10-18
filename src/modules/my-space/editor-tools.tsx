'use client';
import { ArrowDown, ArrowUp, Copy, FlipHorizontal, RotateCcw, Trash2, Undo2, Redo2, Save } from 'lucide-react';
import type { Placement } from './catalog';
export function SaveStatus({ editor, onReload }: {
    editor: {
        saved: boolean;
        saving: boolean;
        error: string;
        undo: () => void;
        redo: () => void;
        canUndo: boolean;
        canRedo: boolean;
        retry: () => void;
        flush: () => Promise<unknown>;
    };
    onReload: () => void;
}) { return <div className="ms-save-bar"><div className="ms-actions"><button disabled={!editor.canUndo} onClick={editor.undo} aria-label="실행 취소"><Undo2 size={17}/></button><button disabled={!editor.canRedo} onClick={editor.redo} aria-label="다시 실행"><Redo2 size={17}/></button><button disabled={editor.saved || editor.saving} onClick={() => void editor.flush()}><Save size={15}/>저장</button></div><small role="status">{editor.saving ? '친구가 소중히 보관하는 중…' : editor.error ? '저장하지 못했어요' : editor.saved ? '자동 저장됐어요' : '꾸민 내용을 저장할게요…'}</small>{editor.error && <p role="alert">{editor.error} <button onClick={editor.retry}>다시 저장하기</button> <button onClick={onReload}>새로 불러오기</button></p>}</div>; }
export function LayerTools<T extends Placement>({ layers, selected, onChange, disabled = false }: {
    layers: T[];
    selected: string;
    onChange: (value: T[]) => void;
    disabled?: boolean;
}) { const index = layers.findIndex(l => l.id === selected), layer = layers[index]; if (!layer)
    return <p className="ms-hint">물건을 톡 누르면 크기와 방향을 바꿀 수 있어요. 방향키로도 옮길 수 있어요.</p>; const update = (p: Partial<T>) => onChange(layers.map(l => l.id === selected ? { ...l, ...p } : l)); function move(delta: number) { const a = [...layers], n = index + delta; if (n < 0 || n >= a.length)
    return; [a[index], a[n]] = [a[n], a[index]]; onChange(a); } return <fieldset className="ms-layer-tools" disabled={disabled}><legend>선택한 조각 꾸미기</legend><label>크기<input type="range" min="5" max="80" value={layer.size} onChange={e => update({ size: Number(e.target.value) } as Partial<T>)}/></label><label>회전<input type="range" min="-180" max="180" step="5" value={layer.rotation} onChange={e => update({ rotation: Number(e.target.value) } as Partial<T>)}/></label><div className="ms-actions"><button type="button" onClick={() => update({ rotation: 0 } as Partial<T>)} aria-label="회전 초기화"><RotateCcw size={16}/></button><button type="button" onClick={() => update({ flip: !layer.flip } as Partial<T>)} aria-label="좌우 뒤집기"><FlipHorizontal size={16}/></button><button type="button" disabled={index === 0} onClick={() => move(-1)} aria-label="뒤로 보내기"><ArrowDown size={16}/></button><button type="button" disabled={index === layers.length - 1} onClick={() => move(1)} aria-label="앞으로 가져오기"><ArrowUp size={16}/></button><button type="button" disabled={layers.length >= 40} onClick={() => onChange([...layers, { ...layer, id: crypto.randomUUID(), x: Math.min(95, layer.x + 4), y: Math.min(95, layer.y + 4) }])} aria-label="복제"><Copy size={16}/></button><button type="button" onClick={() => onChange(layers.filter(l => l.id !== selected))} aria-label="보관함으로 돌려놓기"><Trash2 size={16}/></button></div></fieldset>; }
