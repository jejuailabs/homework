export type CanvasTextStyle = {
  color?: string;
  fontSize?: number;
  fontFamily?: 'sans'|'serif'|'mono';
  fontWeight?: 'normal'|'bold';
  fontStyle?: 'normal'|'italic';
};
export type CanvasTextRun = {text:string;style:CanvasTextStyle};
export type CanvasTextAppearance = Required<CanvasTextStyle>;
export const CANVAS_TEXT_STYLE_KEYS = ['color','fontSize','fontFamily','fontWeight','fontStyle'] as const;
export const CANVAS_TEXT_LIMIT = 5000;
export const CANVAS_TEXT_FONTS = {sans:'Arial, "Noto Sans KR", sans-serif',serif:'Georgia, "Noto Serif KR", serif',mono:'"Courier New", monospace'};

export function cleanCanvasTextStyle(raw:unknown):CanvasTextStyle {
  if(!raw||typeof raw!=='object')return {};
  const value=raw as Record<string,unknown>,style:CanvasTextStyle={};
  if(typeof value.color==='string'&&/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value.color))style.color=value.color;
  if(typeof value.fontSize==='number'&&Number.isFinite(value.fontSize))style.fontSize=Math.max(12,Math.min(120,value.fontSize));
  if(value.fontFamily==='sans'||value.fontFamily==='serif'||value.fontFamily==='mono')style.fontFamily=value.fontFamily;
  if(value.fontWeight==='normal'||value.fontWeight==='bold')style.fontWeight=value.fontWeight;
  if(value.fontStyle==='normal'||value.fontStyle==='italic')style.fontStyle=value.fontStyle;
  return style;
}
export function textStyleKey(style:CanvasTextStyle) {return CANVAS_TEXT_STYLE_KEYS.map(key=>style[key]??'').join('|');}
/** Invalid/mismatching portable runs never replace the plain text fallback. */
export function normalizeCanvasTextRuns(text:string,raw:unknown):CanvasTextRun[] {
  if(!Array.isArray(raw)||raw.length>CANVAS_TEXT_LIMIT)return text?[{text,style:{}}]:[];
  const result:CanvasTextRun[]=[];let length=0;
  for(const item of raw){if(!item||typeof item!=='object'||typeof item.text!=='string')return text?[{text,style:{}}]:[];
    if(!item.text)continue;length+=item.text.length;if(length>CANVAS_TEXT_LIMIT)return text?[{text,style:{}}]:[];
    const style=cleanCanvasTextStyle(item.style),last=result.at(-1);
    if(last&&textStyleKey(last.style)===textStyleKey(style))last.text+=item.text;else result.push({text:item.text,style});
  }
  return result.map(run=>run.text).join('')===text?result:text?[{text,style:{}}]:[];
}
export function portableCanvasTextRuns(text:string,raw:unknown) {const runs=normalizeCanvasTextRuns(text,raw);return runs.some(run=>Object.keys(run.style).length)?runs:[];}
export function canvasTextAppearance(base:CanvasTextStyle,overrides:CanvasTextStyle={}):CanvasTextAppearance {
  return {color:'#344e45',fontSize:32,fontFamily:'sans',fontWeight:'normal',fontStyle:'normal',...cleanCanvasTextStyle(base),...cleanCanvasTextStyle(overrides)};
}
export function canvasTextFont(style:CanvasTextAppearance) {return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${CANVAS_TEXT_FONTS[style.fontFamily]}`;}
export function canvasTextStyleAt(runs:CanvasTextRun[],index:number):CanvasTextStyle {
  let offset=0;for(const run of runs){if(index<offset+run.text.length)return {...run.style};offset+=run.text.length;}return {...runs.at(-1)?.style};
}
export function sliceCanvasTextRuns(runs:CanvasTextRun[],start:number,end:number) {
  const result:CanvasTextRun[]=[];let offset=0;
  for(const run of runs){const text=run.text.slice(Math.max(0,start-offset),Math.max(0,end-offset));if(text)result.push({text,style:{...run.style}});offset+=run.text.length;if(offset>=end)break;}return result;
}
export function canvasTextSelectionStyle(base:CanvasTextStyle,runs:CanvasTextRun[],start:number,end:number) {
  const selected=end>start?sliceCanvasTextRuns(runs,start,end):[{text:'',style:canvasTextStyleAt(runs,Math.max(0,start-1))}];
  const styles=selected.map(run=>canvasTextAppearance(base,run.style)),style=styles[0]||canvasTextAppearance(base);
  return {style,mixed:CANVAS_TEXT_STYLE_KEYS.filter(key=>styles.some(other=>other[key]!==style[key]))};
}
