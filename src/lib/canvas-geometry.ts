import {getStroke} from 'perfect-freehand';
import type {CanvasObject} from './canvas-document';

export type Point = {x:number;y:number};
export type InkPoint = [number,number,number];
export type Bounds = {x:number;y:number;w:number;h:number};
export const TEXT_PADDING = 8;
export const CANVAS_FONTS = {sans:'Arial, "Noto Sans KR", sans-serif',serif:'Georgia, "Noto Serif KR", serif',mono:'"Courier New", monospace'};
export function canvasFont(object:CanvasObject) {return `${object.fontStyle||'normal'} ${object.fontWeight||'normal'} ${object.fontSize}px ${CANVAS_FONTS[object.fontFamily||'sans']}`;}
export function inkPoints(object:CanvasObject):InkPoint[] {const result:InkPoint[]=[];for(let i=0;i<object.points.length;i+=2)result.push([object.points[i],object.points[i+1],object.pressure?.[i/2]??.5]);return result;}

export function inkPath(object:CanvasObject, complete=true) {
  if(!object.points.length)return '';
  const points=inkPoints(object);
  const outline=getStroke(points,{size:object.width,thinning:object.brush==='pen'?(object.thinning??.5):0,smoothing:object.smoothing??.5,streamline:(object.smoothing??.5)*.55,simulatePressure:object.brush==='pen'&&!object.pressure?.length,last:complete,start:{cap:true},end:{cap:true}});
  if(!outline.length)return '';
  const n=(v:number)=>Math.round(v*100)/100;
  let path=`M${n(outline[0][0])},${n(outline[0][1])}Q`;
  for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length];path+=`${n(a[0])},${n(a[1])} ${n((a[0]+b[0])/2)},${n((a[1]+b[1])/2)} `;}
  return path+'Z';
}

/** Keep pressure changes even on a straight stroke, and preserve fractional samples. */
export function appendInkSample(points:InkPoint[], sample:InkPoint) {
  const last=points.at(-1);if(last&&Math.hypot(last[0]-sample[0],last[1]-sample[1])<.35&&Math.abs(last[2]-sample[2])<.025)return;
  if(points.length>=3){const a=points[points.length-2],b=points[points.length-1],length=Math.hypot(sample[0]-a[0],sample[1]-a[1]);const distance=length?Math.abs((sample[1]-a[1])*b[0]-(sample[0]-a[0])*b[1]+sample[0]*a[1]-sample[1]*a[0])/length:Infinity;
    const expected=(a[2]+sample[2])/2;if(distance<.12&&length<5&&Math.abs(b[2]-expected)<.015){points[points.length-1]=sample;return;}}
  points.push(sample);
}
export function inkChunks(points:InkPoint[], maxPoints=2000) {
  const chunks:{points:number[];pressure:number[]}[]=[];
  if(maxPoints<2)throw Error('A stroke chunk needs at least two points');
  for(let i=0;i<points.length;){const slice=points.slice(i,i+maxPoints);chunks.push({points:slice.flatMap(p=>[p[0],p[1]]),pressure:slice.map(p=>p[2])});if(i+maxPoints>=points.length)break;i+=maxPoints-1;}
  return chunks;
}
/** Match perfect-freehand's default linear pressure-to-radius mapping. */
const inkRadius=(object:CanvasObject,pressure=.5)=>Math.max(.01,object.width*(object.brush==='pen'?.5+(object.thinning??.5)*(pressure-.5):.5));
const widestRadius=(object:CanvasObject)=>inkRadius(object,object.pressure?.length?Math.max(...object.pressure):1);
export function objectBounds(object:CanvasObject):Bounds {
  if(object.type!=='stroke'||!object.points.length)return {x:object.x,y:object.y,w:object.w,h:object.h};
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(let i=0;i<object.points.length;i+=2){left=Math.min(left,object.points[i]);right=Math.max(right,object.points[i]);top=Math.min(top,object.points[i+1]);bottom=Math.max(bottom,object.points[i+1]);}
  const pad=widestRadius(object);
  return {x:object.x+left-pad,y:object.y+top-pad,w:Math.max(1,right-left+pad*2),h:Math.max(1,bottom-top+pad*2)};
}
export function groupBounds(objects:CanvasObject[]):Bounds|null {if(!objects.length)return null;const boxes=objects.map(objectBounds),x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};}
export function containsPoint(box:Bounds,p:Point,pad=0) {return p.x>=box.x-pad&&p.x<=box.x+box.w+pad&&p.y>=box.y-pad&&p.y<=box.y+box.h+pad;}
export function segmentDistance(p:Point,a:Point,b:Point) {const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
export function strokeHit(object:CanvasObject,p:Point,radius:number) {if(object.type!=='stroke'||!containsPoint(objectBounds(object),p,radius))return false;const q={x:p.x-object.x,y:p.y-object.y},r=radius+widestRadius(object);for(let i=0;i<object.points.length;i+=2){const a={x:object.points[i],y:object.points[i+1]},b=i?{x:object.points[i-2],y:object.points[i-1]}:a;if(segmentDistance(q,a,b)<=r)return true;}return false;}

/** Cut at circle intersections, so a fast eraser cannot leave a bridge across a sparse line. */
export function eraseStroke(object:CanvasObject,world:Point,radius:number) {
  const p={x:world.x-object.x,y:world.y-object.y},source=inkPoints(object),pieces:InkPoint[][]=[];let current:InkPoint[]=[];
  const push=()=>{if(current.length)pieces.push(current);current=[];};
  const inside=(a:InkPoint)=>Math.hypot(a[0]-p.x,a[1]-p.y)<=radius+inkRadius(object,a[2]);
  if(source.length===1)return inside(source[0])?[]:inkChunks(source);
  for(let i=1;i<source.length;i++){
    const a=source[i-1],b=source[i],dx=b[0]-a[0],dy=b[1]-a[1],ox=a[0]-p.x,oy=a[1]-p.y,r=radius+inkRadius(object,a[2]),dr=inkRadius(object,b[2])-inkRadius(object,a[2]),A=dx*dx+dy*dy-dr*dr,B=2*(ox*dx+oy*dy-r*dr),C=ox*ox+oy*oy-r*r,discriminant=B*B-4*A*C;
    const cuts=[0,1],roots=Math.abs(A)<1e-10?(B?[-C/B]:[]):discriminant>0?[(-B-Math.sqrt(discriminant))/(2*A),(-B+Math.sqrt(discriminant))/(2*A)]:[];for(const t of roots)if(t>0&&t<1)cuts.push(t);cuts.sort((x,y)=>x-y);
    const at=(t:number):InkPoint=>[a[0]+dx*t,a[1]+dy*t,a[2]+(b[2]-a[2])*t];
    for(let j=1;j<cuts.length;j++){const lo=cuts[j-1],hi=cuts[j];if(inside(at((lo+hi)/2))){push();continue;}const first=at(lo),last=at(hi);if(!current.length)current.push(first);current.push(last);}
  }
  push();return pieces.flatMap(piece=>inkChunks(piece)).map(piece=>({...piece,pressure:object.pressure?.length?piece.pressure:[]}));
}
export function polygonContains(points:Point[],p:Point) {let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function lassoHits(points:Point[],box:Bounds) {return polygonContains(points,{x:box.x+box.w/2,y:box.y+box.h/2})||[{x:box.x,y:box.y},{x:box.x+box.w,y:box.y},{x:box.x,y:box.y+box.h},{x:box.x+box.w,y:box.y+box.h}].some(p=>polygonContains(points,p))||points.some(p=>containsPoint(box,p));}

const graphemes=(text:string)=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(v=>v.segment):Array.from(text);
export function wrapCanvasText(text:string,width:number,measure:(text:string)=>number) {
  const lines:string[]=[];
  for(const paragraph of text.replace(/\t/g,'    ').split('\n')){
    let line='';const tokens=paragraph.match(/\s+|\S+/gu)||[];
    for(const token of tokens){if(line&&measure(line+token)>width&&measure(token)<=width&&!/^\s+$/u.test(token)){lines.push(line);line='';}
      for(const char of graphemes(token)){if(line&&measure(line+char)>width){lines.push(line);line='';}line+=char;}}
    lines.push(line);
  }
  return lines;
}
export function textLayout(object:CanvasObject,measure:(text:string)=>number) {const lines=wrapCanvasText(object.text,Math.max(1,object.w-TEXT_PADDING*2),measure),lineHeight=object.fontSize*(object.lineHeight||1.4);return {lines,lineHeight,height:Math.ceil(lines.length*lineHeight+TEXT_PADDING*2)};}
