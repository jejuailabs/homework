import * as Y from 'yjs';

export type CanvasBrush = 'legacy'|'pen'|'ballpoint'|'highlighter';
export type CanvasObject = {id: string; type: 'stroke'|'text'|'image'; x: number; y: number; w: number; h: number; color: string; width: number; fontSize: number; text: string; points: number[]; src: string; assetId: string; locked: boolean;
  pressure?: number[]; brush?: CanvasBrush; smoothing?: number; thinning?: number; opacity?: number;
  fontFamily?: 'sans'|'serif'|'mono'; fontWeight?: 'normal'|'bold'; fontStyle?: 'normal'|'italic'; align?: 'left'|'center'|'right'; lineHeight?: number; autoHeight?: boolean;
};
export const CANVAS_WIDTH = 1200, CANVAS_HEIGHT = 720, CANVAS_OBJECT_LIMIT = 400;
export const CANVAS_STROKE_VALUES = 4000;
const numeric = (value: unknown, fallback: number, min = 0, max = 10000) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export function validCanvasObject(raw: unknown): CanvasObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id) || !['stroke','text','image'].includes(String(value.type))) return null;
  const src = typeof value.src === 'string' && value.src.length <= 500_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.src) ? value.src : '';
  const points = Array.isArray(value.points) ? value.points.slice(0,Math.min(CANVAS_STROKE_VALUES,Math.floor(value.points.length/2)*2)).map(point=>Math.round(numeric(point,0,0,CANVAS_WIDTH)*100)/100) : [];
  return {id: value.id, type: value.type as CanvasObject['type'], x: numeric(value.x,0,value.type==='stroke'?-CANVAS_WIDTH:0,CANVAS_WIDTH), y: numeric(value.y,0,value.type==='stroke'?-CANVAS_HEIGHT:0,CANVAS_HEIGHT), w: numeric(value.w,320,20,CANVAS_WIDTH), h: numeric(value.h,160,20,CANVAS_HEIGHT), color: typeof value.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.color) ? value.color : '#344e45', width: numeric(value.width,4,1,60), fontSize: numeric(value.fontSize,32,12,120), text: typeof value.text === 'string' ? value.text.slice(0,5000) : '', points,
    pressure: Array.isArray(value.pressure) ? value.pressure.slice(0,points.length/2).map(p=>numeric(p,.5,0,1)) : [],
    brush: ['pen','ballpoint','highlighter'].includes(String(value.brush)) ? value.brush as CanvasBrush : 'legacy', smoothing: numeric(value.smoothing,.5,0,1), thinning: numeric(value.thinning,.5,0,1), opacity: numeric(value.opacity,1,.05,1),
    fontFamily: ['sans','serif','mono'].includes(String(value.fontFamily)) ? value.fontFamily as 'sans'|'serif'|'mono' : 'sans', fontWeight: value.fontWeight==='bold'?'bold':'normal', fontStyle: value.fontStyle==='italic'?'italic':'normal', align: value.align==='center'||value.align==='right'?value.align:'left', lineHeight:numeric(value.lineHeight,1.4,1,2.5), autoHeight:value.autoHeight===true,
    src, assetId: typeof value.assetId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.assetId) ? value.assetId : '', locked: value.locked === true};
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
  private cache = new Map<string, CanvasObject>();
  private dirty = new Set<string>();
  private gestureDepth = 0;
  constructor(update?: Uint8Array) {
    this.doc=new Y.Doc(); if(update)Y.applyUpdate(this.doc,update,'initial');
    this.objects=this.doc.getMap('objects');this.order=this.doc.getArray('order');
    this.undo=new Y.UndoManager([this.objects,this.order],{trackedOrigins:new Set([this.origin]),captureTimeout:350});
    this.objects.observeDeep(events=>{for(const event of events){if(event.path.length)this.dirty.add(String(event.path[0]));else if(event instanceof Y.YMapEvent)for(const key of event.keysChanged){this.cache.delete(String(key));this.dirty.add(String(key));}}});
  }
  read(): CanvasObject[] {
    const ids=[...new Set([...this.order.toArray()].reverse())].reverse();
    for(const id of this.objects.keys())if(!ids.includes(id))ids.push(id);
    return ids.slice(0,CANVAS_OBJECT_LIMIT).flatMap(id=>{const raw=this.objects.get(id);if(!(raw instanceof Y.Map))return [];if(this.dirty.has(id)||!this.cache.has(id)){const value=validCanvasObject({id,...raw.toJSON()});this.dirty.delete(id);if(value)this.cache.set(id,value);else this.cache.delete(id);}const value=this.cache.get(id);return value?[value]:[];});
  }
  add(input: Partial<CanvasObject> & {type: CanvasObject['type']}) {
    if(this.objects.size>=CANVAS_OBJECT_LIMIT)throw Error('이 화면에는 객체를 400개까지 담을 수 있어요.');
    const value=validCanvasObject({...input,id:crypto.randomUUID()})!;
    if(!this.gestureDepth)this.undo.stopCapturing();this.doc.transact(()=>this.insert(value),this.origin);return value.id;
  }
  private insert(value: CanvasObject) {
    const map=new Y.Map<unknown>();for(const [key,field]of Object.entries(value))if(!['id','text','points','pressure'].includes(key))map.set(key,field);
    const text=new Y.Text();text.insert(0,value.text);map.set('text',text);
    const points=new Y.Array<number>();points.push(value.points);map.set('points',points);
    const pressure=new Y.Array<number>();pressure.push(value.pressure||[]);map.set('pressure',pressure);
    this.objects.set(value.id,map);this.order.push([value.id]);
  }
  patch(id: string, patch: Partial<CanvasObject>) {const map=this.objects.get(id);if(!(map instanceof Y.Map))return;const current=validCanvasObject({id,...map.toJSON(),...patch});if(!current)return;this.doc.transact(()=>{for(const key of ['x','y','w','h','color','width','fontSize','locked','brush','opacity','smoothing','thinning','fontFamily','fontWeight','fontStyle','align','lineHeight','autoHeight'] as const)if(key in patch)map.set(key,current[key]);for(const key of ['points','pressure'] as const)if(key in patch){let array=map.get(key);if(!(array instanceof Y.Array)){array=new Y.Array<number>();map.set(key,array);}const values=array as Y.Array<number>;values.delete(0,values.length);values.push(current[key]||[]);}},this.origin);}
  appendPoints(id: string, points: number[], pressure: number[] = []) {const map=this.objects.get(id),array=map?.get('points');if(!(array instanceof Y.Array)||array.length>=CANVAS_STROKE_VALUES)return 0;const count=Math.min(points.length-points.length%2,CANVAS_STROKE_VALUES-array.length);this.doc.transact(()=>{if(pressure.length){let values=map!.get('pressure');if(!(values instanceof Y.Array)){values=new Y.Array<number>();map!.set('pressure',values);}const p=values as Y.Array<number>;if(p.length<array.length/2)p.push(Array(array.length/2-p.length).fill(.5));p.push(Array.from({length:count/2},(_,i)=>numeric(pressure[i],.5,0,1)));}array.push(points.slice(0,count).map(point=>Math.round(numeric(point,0,0,CANVAS_WIDTH)*100)/100));},this.origin);return count/2;}
  beginGesture() {if(!this.gestureDepth++){this.undo.stopCapturing();this.undo.captureTimeout=3600000;}}
  endGesture() {if(this.gestureDepth&&!--this.gestureDepth){this.undo.captureTimeout=350;this.undo.stopCapturing();}}
  batch(run:()=>void) {this.beginGesture();try{this.doc.transact(run,this.origin);}finally{this.endGesture();}}
  addMany(input:(Partial<CanvasObject>&{type:CanvasObject['type']})[]) {if(this.objects.size+input.length>CANVAS_OBJECT_LIMIT)throw Error('이 화면에는 객체를 400개까지 담을 수 있어요. 편집 원본을 저장하고 새 화면을 열어 주세요.');const ids:string[]=[];this.batch(()=>input.forEach(value=>ids.push(this.add(value))));return ids;}
  remove(id: string) {if(!this.gestureDepth)this.undo.stopCapturing();this.doc.transact(()=>{this.objects.delete(id);for(let i=this.order.length-1;i>=0;i--)if(this.order.get(i)===id)this.order.delete(i,1);},this.origin);}
  splitStroke(id:string, segments:{points:number[];pressure:number[]}[]) {const old=this.read().find(value=>value.id===id);if(!old||old.type!=='stroke'||old.locked)return;if(this.objects.size-1+segments.length>CANVAS_OBJECT_LIMIT)throw Error('지우개 조각이 많아요. 획 지우기를 사용해 주세요.');const index=this.order.toArray().indexOf(id);this.doc.transact(()=>{this.remove(id);const ids=segments.map(segment=>this.add({...old,...segment}));for(const key of ids){const at=this.order.toArray().indexOf(key);if(at>=0)this.order.delete(at,1);}this.order.insert(Math.max(0,index),ids);},this.origin);}
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
