import type {CanvasObject} from './canvas-document';
import {canvasTextAppearance,normalizeCanvasTextRuns,textStyleKey,type CanvasTextAppearance} from './canvas-text';

export type CanvasTextFragment={text:string;style:CanvasTextAppearance;x:number;width:number};
export type CanvasTextLine={fragments:CanvasTextFragment[];width:number;top:number;height:number;baseline:number};
type Glyph={text:string;style:CanvasTextAppearance;key:string};
/** Shared by SVG and PNG: measure styled runs together rather than assuming one font per box. */
export function layoutCanvasText(object:CanvasObject,measure:(text:string,style:CanvasTextAppearance)=>number) {
  const runs=normalizeCanvasTextRuns(object.text,object.textRuns),base=canvasTextAppearance(object),glyphs:Glyph[]=[];
  const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(object.text)].map(s=>({text:s.segment,index:s.index})):(()=>{let index=0;return Array.from(object.text,text=>{const value={text,index};index+=text.length;return value;});})();
  let runIndex=0,runEnd=runs[0]?.text.length||0;
  for(const segment of segments){while(segment.index>=runEnd&&runIndex<runs.length-1){runIndex++;runEnd+=runs[runIndex].text.length;}const style=canvasTextAppearance(base,runs[runIndex]?.style);glyphs.push({text:segment.text==='\t'?'    ':segment.text,style,key:textStyleKey(style)});}
  const available=Math.max(1,object.w-16),spacing=object.lineHeight||1.4,lines:CanvasTextLine[]=[];
  let fragments:CanvasTextFragment[]=[],width=0,top=8,emptyStyle=base;
  function measureGlyphs(items:Glyph[]) {let total=0,text='',style:CanvasTextAppearance|undefined,key='';for(const item of items){if(key&&key!==item.key){total+=measure(text,style!);text='';}text+=item.text;key=item.key;style=item.style;}return total+(style?measure(text,style):0);}
  function nextWidth(glyph:Glyph) {const last=fragments.at(-1);return last&&textStyleKey(last.style)===glyph.key?width-last.width+measure(last.text+glyph.text,glyph.style):width+measure(glyph.text,glyph.style);}
  function append(glyph:Glyph){const last=fragments.at(-1);if(last&&textStyleKey(last.style)===glyph.key){last.text+=glyph.text;const next=measure(last.text,last.style);width+=next-last.width;last.width=next;}else{const size=measure(glyph.text,glyph.style);fragments.push({text:glyph.text,style:glyph.style,x:width,width:size});width+=size;}}
  function finish(){const size=fragments.length?Math.max(...fragments.map(f=>f.style.fontSize)):emptyStyle.fontSize,height=size*spacing,offset=object.align==='right'?object.w-8-width:object.align==='center'?(object.w-width)/2:8;let x=offset;for(const fragment of fragments){fragment.x=x;x+=fragment.width;}lines.push({fragments,width,top,height,baseline:top+size*.9+(height-size)/2});top+=height;fragments=[];width=0;}
  for(let i=0;i<glyphs.length;){const glyph=glyphs[i];if(glyph.text==='\n'||glyph.text==='\r\n'){emptyStyle=glyph.style;finish();i++;continue;}
    const whitespace=/^\s+$/u.test(glyph.text),token:Glyph[]=[];while(i<glyphs.length&&!['\n','\r\n'].includes(glyphs[i].text)&&/^\s+$/u.test(glyphs[i].text)===whitespace)token.push(glyphs[i++]);
    const tokenWidth=measureGlyphs(token);if(!whitespace&&width&&tokenWidth<=available&&width+tokenWidth>available)finish();
    for(const item of token){if(width&&nextWidth(item)>available)finish();emptyStyle=item.style;append(item);}
  }
  finish();return {lines,height:Math.ceil(top+8)};
}
