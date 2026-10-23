import type {CanvasObject} from './canvas-document';
import {CANVAS_HEIGHT, CANVAS_WIDTH} from './canvas-document';
import {CANVAS_FONTS, TEXT_PADDING, canvasFont, inkPath, textLayout} from './canvas-geometry';

let measurement:CanvasRenderingContext2D|null=null;
export function measureCanvasText(object:CanvasObject) {if(!measurement&&typeof document!=='undefined')measurement=document.createElement('canvas').getContext('2d');if(measurement){measurement.font=canvasFont(object);const ctx=measurement;return (text:string)=>ctx.measureText(text).width;}return (text:string)=>Array.from(text).reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?.57:1)*object.fontSize,0);}
export function measuredTextLayout(object:CanvasObject) {return textLayout(object,measureCanvasText(object));}
export function textBaseline(object:CanvasObject) {return TEXT_PADDING+object.fontSize*.9+(object.fontSize*(object.lineHeight||1.4)-object.fontSize)/2;}
export const fontFamily=(object:CanvasObject)=>CANVAS_FONTS[object.fontFamily||'sans'];

export function paintCanvasInk(ctx:CanvasRenderingContext2D,object:CanvasObject) {
  ctx.save();ctx.translate(object.x,object.y);ctx.globalAlpha=object.opacity??1;ctx.fillStyle=ctx.strokeStyle=object.color;
  if(object.brush&&object.brush!=='legacy'){ctx.fill(new Path2D(inkPath(object)));}
  else {ctx.lineWidth=object.width;ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();for(let i=0;i<object.points.length;i+=2){if(!i)ctx.moveTo(object.points[i],object.points[i+1]);else ctx.lineTo(object.points[i],object.points[i+1]);}if(object.points.length===2){ctx.arc(object.points[0],object.points[1],object.width/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
  ctx.restore();
}
export async function drawingBlob(objects:CanvasObject[],assets:Record<string,string>,grid:boolean,scale=2) {
  await document.fonts?.ready;
  const canvas=document.createElement('canvas');canvas.width=CANVAS_WIDTH*scale;canvas.height=CANVAS_HEIGHT*scale;const ctx=canvas.getContext('2d')!;ctx.scale(scale,scale);ctx.fillStyle='#fffdf8';ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
  if(grid){ctx.strokeStyle='#e9ece4';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<CANVAS_WIDTH;x+=40){ctx.moveTo(x,0);ctx.lineTo(x,CANVAS_HEIGHT);}for(let y=0;y<CANVAS_HEIGHT;y+=40){ctx.moveTo(0,y);ctx.lineTo(CANVAS_WIDTH,y);}ctx.stroke();}
  for(const object of objects){if(object.type==='stroke'){paintCanvasInk(ctx,object);continue;}ctx.save();ctx.translate(object.x,object.y);ctx.fillStyle=object.color;ctx.globalAlpha=object.opacity??1;
    if(object.type==='text'){ctx.font=canvasFont(object);ctx.textBaseline='alphabetic';ctx.textAlign=object.align||'left';const layout=textLayout(object,text=>ctx.measureText(text).width),x=object.align==='right'?object.w-TEXT_PADDING:object.align==='center'?object.w/2:TEXT_PADDING;layout.lines.forEach((line,i)=>ctx.fillText(line,x,textBaseline(object)+i*layout.lineHeight));}
    else{const src=object.src||assets[object.assetId];if(!src)throw Error('Missing image');const image=new Image();image.crossOrigin='anonymous';image.src=src;await image.decode();ctx.drawImage(image,0,0,object.w,object.h);}ctx.restore();}
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Export failed')),'image/png'));
}
