import * as Y from 'yjs';

export type CanvasObject = {id: string; type: 'stroke'|'text'|'image'; x: number; y: number; w: number; h: number; color: string; width: number; fontSize: number; text: string; points: number[]; src: string; assetId: string; locked: boolean};
export const CANVAS_WIDTH = 1200, CANVAS_HEIGHT = 720, CANVAS_OBJECT_LIMIT = 400;
const numeric = (value: unknown, fallback: number, min = 0, max = 10000) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export function validCanvasObject(raw: unknown): CanvasObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id) || !['stroke','text','image'].includes(String(value.type))) return null;
  const src = typeof value.src === 'string' && value.src.length <= 500_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.src) ? value.src : '';
  return {id: value.id, type: value.type as CanvasObject['type'], x: numeric(value.x,0,0,CANVAS_WIDTH), y: numeric(value.y,0,0,CANVAS_HEIGHT), w: numeric(value.w,320,20,CANVAS_WIDTH), h: numeric(value.h,160,20,CANVAS_HEIGHT), color: typeof value.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.color) ? value.color : '#344e45', width: numeric(value.width,4,1,60), fontSize: numeric(value.fontSize,32,12,120), text: typeof value.text === 'string' ? value.text.slice(0,5000) : '', points: Array.isArray(value.points) ? value.points.slice(0,Math.min(4000,Math.floor(value.points.length/2)*2)).map(point=>Math.round(numeric(point,0,0,CANVAS_WIDTH))) : [], src, assetId: typeof value.assetId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.assetId) ? value.assetId : '', locked: value.locked === true};
}
export function encodeCanvasUpdate(update: Uint8Array) {let raw='';for(let i=0;i<update.length;i+=8192)raw+=String.fromCharCode(...update.subarray(i,i+8192));return btoa(raw);}
export function decodeCanvasUpdate(value: string) {if(value.length>4_500_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Invalid canvas data');const raw=atob(value);return Uint8Array.from(raw,char=>char.charCodeAt(0));}
export function textDifference(before: string, after: string) {let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;let end=0;while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;return {start,remove:before.length-start-end,insert:after.slice(start,after.length-end)};}

/** Object properties merge independently; text and pen points use Yjs shared types. */
export class CanvasModel {
  readonly doc: Y.Doc;
  readonly origin = {};
  readonly objects: Y.Map<Y.Map<unknown>>;
  readonly order: Y.Array<string>;
  readonly undo: Y.UndoManager;
  private composing = false;
  private waiting: Uint8Array[] = [];
  private finishBoundInput: (()=>void) | null = null;
  private closed = false;
  constructor(update?: Uint8Array) {
    this.doc=new Y.Doc(); if(update)Y.applyUpdate(this.doc,update,'initial');
    this.objects=this.doc.getMap('objects');this.order=this.doc.getArray('order');
    this.undo=new Y.UndoManager([this.objects,this.order],{trackedOrigins:new Set([this.origin]),captureTimeout:350});
  }
  read(): CanvasObject[] {
    const ids=[...new Set([...this.order.toArray()].reverse())].reverse();
    for(const id of this.objects.keys())if(!ids.includes(id))ids.push(id);
    return ids.slice(0,CANVAS_OBJECT_LIMIT).flatMap(id=>{const raw=this.objects.get(id);if(!(raw instanceof Y.Map))return [];const value=validCanvasObject({id,...raw.toJSON()});return value?[value]:[];});
  }
  add(input: Partial<CanvasObject> & {type: CanvasObject['type']}) {
    if(this.objects.size>=CANVAS_OBJECT_LIMIT)throw Error('이 화면에는 객체를 400개까지 담을 수 있어요.');
    const value=validCanvasObject({...input,id:crypto.randomUUID()})!;
    this.undo.stopCapturing();this.doc.transact(()=>this.insert(value),this.origin);return value.id;
  }
  private insert(value: CanvasObject) {
    const map=new Y.Map<unknown>();for(const [key,field]of Object.entries(value))if(!['id','text','points'].includes(key))map.set(key,field);
    const text=new Y.Text();text.insert(0,value.text);map.set('text',text);
    const points=new Y.Array<number>();points.push(value.points);map.set('points',points);
    this.objects.set(value.id,map);this.order.push([value.id]);
  }
  patch(id: string, patch: Partial<CanvasObject>) {const map=this.objects.get(id);if(!(map instanceof Y.Map))return;const current=validCanvasObject({id,...map.toJSON(),...patch});if(!current)return;this.doc.transact(()=>{for(const key of ['x','y','w','h','color','width','fontSize','locked'] as const)if(key in patch)map.set(key,current[key]);},this.origin);}
  appendPoints(id: string, points: number[]) {const array=this.objects.get(id)?.get('points');if(!(array instanceof Y.Array)||array.length>=4000)return;this.doc.transact(()=>array.push(points.slice(0,4000-array.length).map(point=>Math.round(numeric(point,0,0,CANVAS_WIDTH)))),this.origin);}
  remove(id: string) {this.undo.stopCapturing();this.doc.transact(()=>{this.objects.delete(id);for(let i=this.order.length-1;i>=0;i--)if(this.order.get(i)===id)this.order.delete(i,1);},this.origin);}
  front(id: string) {this.doc.transact(()=>{for(let i=this.order.length-1;i>=0;i--)if(this.order.get(i)===id)this.order.delete(i,1);this.order.push([id]);},this.origin);}
  back(id: string) {this.doc.transact(()=>{for(let i=this.order.length-1;i>=0;i--)if(this.order.get(i)===id)this.order.delete(i,1);this.order.insert(0,[id]);},this.origin);}
  replace(input: unknown[]) {const values=input.slice(0,CANVAS_OBJECT_LIMIT).map(validCanvasObject).filter((value):value is CanvasObject=>!!value);this.undo.stopCapturing();this.doc.transact(()=>{this.objects.clear();this.order.delete(0,this.order.length);for(const value of values)this.insert({...value,id:crypto.randomUUID()});},this.origin);}
  setText(id: string, value: string) {const text=this.objects.get(id)?.get('text');if(!(text instanceof Y.Text))return;const difference=textDifference(text.toString(),value.slice(0,5000));this.doc.transact(()=>{if(difference.remove)text.delete(difference.start,difference.remove);if(difference.insert)text.insert(difference.start,difference.insert);},this.origin);}
  applyRemote(update: Uint8Array) {if(this.composing)this.waiting.push(update);else Y.applyUpdate(this.doc,update,'remote');}
  serialize() {return encodeCanvasUpdate(Y.encodeStateAsUpdate(this.doc));}
  /** Uncontrolled textarea binding preserves selections; defer remote changes during Korean IME composition. */
  bindText(element: HTMLTextAreaElement, id: string) {
    const text=this.objects.get(id)?.get('text');if(!(text instanceof Y.Text))return()=>{};
    element.value=text.toString();let frame=0;
    const input=()=>{if(this.closed)return;if(element.value.length>5000)element.value=element.value.slice(0,5000);this.setText(id,element.value);};
    const observe=(event:Y.YTextEvent,transaction:Y.Transaction)=>{if(transaction.origin===this.origin)return;let pos=0;for(const delta of event.delta){if(delta.retain)pos+=delta.retain;if(delta.delete)element.setRangeText('',pos,pos+delta.delete,'preserve');if(typeof delta.insert==='string'){element.setRangeText(delta.insert,pos,pos,'preserve');pos+=delta.insert.length;}}};
    const start=()=>{this.composing=true;};
    const flush=()=>{input();this.composing=false;const pending=this.waiting;this.waiting=[];for(const update of pending)this.applyRemote(update);};
    const end=()=>{frame=requestAnimationFrame(flush);};
    this.finishBoundInput=flush;
    text.observe(observe);element.addEventListener('input',input);element.addEventListener('compositionstart',start);element.addEventListener('compositionend',end);
    return()=>{cancelAnimationFrame(frame);if(this.composing&&!this.closed)flush();if(this.finishBoundInput===flush)this.finishBoundInput=null;text.unobserve(observe);element.removeEventListener('input',input);element.removeEventListener('compositionstart',start);element.removeEventListener('compositionend',end);};
  }
  finishEditing() {if(!this.closed)this.finishBoundInput?.();}
  destroy() {if(this.closed)return;this.finishEditing();this.closed=true;this.finishBoundInput=null;this.undo.destroy();this.doc.destroy();}
}
