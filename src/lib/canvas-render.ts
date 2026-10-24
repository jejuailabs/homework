import type {CanvasObject} from './canvas-document';
import {CANVAS_HEIGHT, CANVAS_WIDTH} from './canvas-document';
import {CANVAS_FONTS, TEXT_PADDING, canvasFont, inkPath} from './canvas-geometry';
import {canvasTextAppearance,canvasTextFont,normalizeCanvasTextRuns,textStyleKey} from './canvas-text';
import {renderCanvasEditable} from './canvas-text-dom';
import {layoutCanvasText,type CanvasTextLine} from './canvas-text-layout';
import {CANVAS_PENCIL_GRAIN} from './canvas-brush';
import type {Bounds} from './canvas-geometry';

let measurement:CanvasRenderingContext2D|null=null;
export function measureCanvasText(object:CanvasObject) {if(!measurement&&typeof document!=='undefined')measurement=document.createElement('canvas').getContext('2d');if(measurement){measurement.font=canvasFont(object);const ctx=measurement;return (text:string)=>ctx.measureText(text).width;}return (text:string)=>Array.from(text).reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?.57:1)*object.fontSize,0);}
let textLayouts=new WeakMap<CanvasObject,{lines:CanvasTextLine[];height:number}>(),watchingFonts=false;
const textLayoutSignatures=new Map<string,{key:string;layout:{lines:CanvasTextLine[];height:number}}>();
export function measuredTextLayout(object:CanvasObject) {
  if(typeof document==='undefined'||!document.body)return layoutCanvasText(object,(text,style)=>Array.from(text).reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?.57:1)*style.fontSize,0));
  if(!watchingFonts){watchingFonts=true;const clear=()=>{textLayouts=new WeakMap();textLayoutSignatures.clear();};void document.fonts?.ready.then(clear);document.fonts?.addEventListener('loadingdone',clear);}
  const cached=textLayouts.get(object);if(cached)return cached;
  const key=JSON.stringify([object.text,object.textRuns,object.w,object.fontSize,object.fontFamily,object.fontWeight,object.fontStyle,object.color,object.align,object.lineHeight]),previous=textLayoutSignatures.get(object.id);
  if(previous?.key===key){textLayouts.set(object,previous.layout);return previous.layout;}
  if(!measurement)measurement=document.createElement('canvas').getContext('2d');
  const box=document.createElement('div');
  // Use the browser's line breaking and font metrics so editing, SVG and PNG agree,
  // including punctuation next to Korean words and mixed sizes on one baseline.
  Object.assign(box.style,{position:'fixed',left:'-100000px',top:'0',visibility:'hidden',pointerEvents:'none',boxSizing:'border-box',width:object.w+'px',padding:'8px',border:'0',margin:'0',whiteSpace:'break-spaces',wordBreak:'keep-all',overflowWrap:'break-word',letterSpacing:'normal',tabSize:'4',lineHeight:'0',fontSize:object.fontSize+'px',fontFamily:fontFamily(object),textAlign:object.align||'left'});
  renderCanvasEditable(box,object);document.body.append(box);
  try{
    const origin=box.getBoundingClientRect(),lines:CanvasTextLine[]=[],runs=normalizeCanvasTextRuns(object.text,object.textRuns);
    let runIndex=0;
    for(const span of box.children){const node=span.firstChild;if(!node||node.nodeType!==3)continue;const run=runs[runIndex++],style=canvasTextAppearance(object,run.style),key=textStyleKey(style);measurement!.font=canvasTextFont(style);const metrics=measurement!.measureText('Mg'),ascent=metrics.fontBoundingBoxAscent||style.fontSize*.9;
      const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(run.text)]:(()=>{let index=0;return Array.from(run.text,segment=>{const glyph={segment,index};index+=segment.length;return glyph;});})(),range=document.createRange();
      const bounds=(start:number,end=start)=>{range.setStart(node,segments[start].index);range.setEnd(node,segments[end].index+segments[end].segment.length);return range.getBoundingClientRect();};
      for(let i=0;i<segments.length;){if(/^[\r\n\t]+$/.test(segments[i].segment)){i++;continue;}
        let blockEnd=i;while(blockEnd+1<segments.length&&!/^[\r\n\t]+$/.test(segments[blockEnd+1].segment))blockEnd++;
        while(i<=blockEnd){const first=bounds(i),baseline=first.top-origin.top+ascent;let low=i,high=blockEnd;
          // Locate each native line by binary search instead of measuring every character.
          while(low<high){const middle=Math.ceil((low+high)/2);if(Math.abs(bounds(middle).top-first.top)<1)low=middle;else high=middle-1;}
          const rect=bounds(i,low),x=rect.left-origin.left,content=run.text.slice(segments[i].index,segments[low].index+segments[low].segment.length);
        let line=lines.find(line=>Math.abs(line.baseline-baseline)<1);if(!line){line={fragments:[],width:0,top:rect.top-origin.top,height:style.fontSize*(object.lineHeight||1.4),baseline};lines.push(line);}
          const last=line.fragments.at(-1);if(last&&textStyleKey(last.style)===key&&Math.abs(last.x+last.width-x)<1){last.text+=content;last.width=rect.right-origin.left-last.x;}else line.fragments.push({text:content,style,x,width:rect.width});line.width+=rect.width;line.height=Math.max(line.height,style.fontSize*(object.lineHeight||1.4));i=low+1;
        }
      }
    }
    lines.sort((a,b)=>a.baseline-b.baseline);const result={lines,height:Math.ceil(origin.height)};textLayouts.set(object,result);textLayoutSignatures.set(object.id,{key,layout:result});if(textLayoutSignatures.size>512)textLayoutSignatures.delete(textLayoutSignatures.keys().next().value!);return result;
  }finally{box.remove();}
}
export function textBaseline(object:CanvasObject) {return TEXT_PADDING+object.fontSize*.9+(object.fontSize*(object.lineHeight||1.4)-object.fontSize)/2;}
export const fontFamily=(object:CanvasObject)=>CANVAS_FONTS[object.fontFamily||'sans'];

export function paintCanvasInk(ctx:CanvasRenderingContext2D,object:CanvasObject) {
  ctx.save();ctx.translate(object.x,object.y);ctx.globalAlpha=object.opacity??1;ctx.fillStyle=ctx.strokeStyle=object.color;
  if(object.brush==='pencil'){const tile=document.createElement('canvas');tile.width=tile.height=4;const ink=tile.getContext('2d')!;ink.fillStyle=object.color;for(const p of CANVAS_PENCIL_GRAIN){ink.globalAlpha=p.alpha;ink.fillRect(p.x,p.y,p.w,p.h);}ctx.fillStyle=ctx.createPattern(tile,'repeat')||object.color;}
  if(object.brush&&object.brush!=='legacy'){ctx.fill(new Path2D(inkPath(object)));}
  else {ctx.lineWidth=object.width;ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();for(let i=0;i<object.points.length;i+=2){if(!i)ctx.moveTo(object.points[i],object.points[i+1]);else ctx.lineTo(object.points[i],object.points[i+1]);}if(object.points.length===2){ctx.arc(object.points[0],object.points[1],object.width/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
  ctx.restore();
}
export async function drawingBlob(objects:CanvasObject[],assets:Record<string,string>,grid:boolean,scale=2,region:Bounds={x:0,y:0,w:CANVAS_WIDTH,h:CANVAS_HEIGHT}) {
  await document.fonts?.ready;
  const canvas=document.createElement('canvas');scale=Math.min(scale,8192/region.w,8192/region.h,Math.sqrt(16_000_000/(region.w*region.h)));canvas.width=Math.max(1,Math.ceil(region.w*scale));canvas.height=Math.max(1,Math.ceil(region.h*scale));const ctx=canvas.getContext('2d')!;ctx.scale(scale,scale);ctx.translate(-region.x,-region.y);ctx.fillStyle='#fffdf8';ctx.fillRect(region.x,region.y,region.w,region.h);
  if(grid){const step=40*Math.max(1,2**Math.ceil(Math.log2(.5/scale)));ctx.strokeStyle='#e9ece4';ctx.lineWidth=1/Math.max(1,scale);ctx.beginPath();for(let x=Math.floor(region.x/step)*step;x<region.x+region.w;x+=step){ctx.moveTo(x,region.y);ctx.lineTo(x,region.y+region.h);}for(let y=Math.floor(region.y/step)*step;y<region.y+region.h;y+=step){ctx.moveTo(region.x,y);ctx.lineTo(region.x+region.w,y);}ctx.stroke();}
  for(const object of objects){if(object.type==='stroke'){paintCanvasInk(ctx,object);continue;}ctx.save();ctx.translate(object.x,object.y);ctx.fillStyle=object.color;ctx.globalAlpha=object.opacity??1;
    if(object.type==='text'){if(object.note){ctx.fillStyle=object.fill||'#fef0b5';ctx.fillRect(0,0,object.w,object.h);}ctx.textBaseline='alphabetic';ctx.textAlign='left';const layout=measuredTextLayout(object);for(const line of layout.lines)for(const fragment of line.fragments){ctx.font=canvasTextFont(fragment.style);ctx.fillStyle=fragment.style.color;ctx.fillText(fragment.text,fragment.x,line.baseline);}}
    else if(object.type==='shape'){ctx.strokeStyle=object.color;ctx.lineWidth=object.width;ctx.fillStyle=object.fill||'#e0eee6';if(object.shape==='frame'){ctx.globalAlpha=(object.opacity??1)*.18;ctx.fillRect(0,0,object.w,object.h);ctx.globalAlpha=object.opacity??1;ctx.fillRect(0,0,object.w,52);ctx.setLineDash([8,5]);ctx.strokeRect(0,0,object.w,object.h);ctx.setLineDash([]);ctx.fillStyle=object.color;ctx.font='bold 24px Arial, "Noto Sans KR", sans-serif';ctx.fillText(object.text,20,35);}else if(object.shape==='arrow'){const head=Math.min(24,object.w/4,object.h/2);ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(0,object.h);ctx.lineTo(object.w,0);ctx.moveTo(object.w-head*1.5,0);ctx.lineTo(object.w,0);ctx.lineTo(object.w,head*1.5);ctx.stroke();}else{ctx.beginPath();if(object.shape==='ellipse')ctx.ellipse(object.w/2,object.h/2,object.w/2,object.h/2,0,0,Math.PI*2);else ctx.roundRect(0,0,object.w,object.h,8);ctx.fill();ctx.stroke();}}
    else{const src=object.src||assets[object.assetId];if(!src)throw Error('Missing image');const image=new Image();image.crossOrigin='anonymous';image.src=src;await image.decode();ctx.drawImage(image,0,0,object.w,object.h);}ctx.restore();}
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Export failed')),'image/png'));
}
