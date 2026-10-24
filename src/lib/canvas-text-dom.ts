import type {CanvasObject} from './canvas-document';
import {CANVAS_TEXT_FONTS,canvasTextAppearance,normalizeCanvasTextRuns,type CanvasTextStyle} from './canvas-text';

/** Sanitized DOM shared by editing and measuring; never inserts HTML from a document. */
export function renderCanvasEditable(root:HTMLElement,object:CanvasObject,emptyStyle:CanvasTextStyle={}) {
  root.dataset.empty=String(!object.text);
  const fragment=document.createDocumentFragment(),runs=normalizeCanvasTextRuns(object.text,object.textRuns);
  for(const run of runs){
    const span=document.createElement('span'),style=canvasTextAppearance(object,run.style);
    span.dataset.canvasStyle=JSON.stringify(run.style);
    Object.assign(span.style,{color:style.color,fontSize:style.fontSize+'px',fontFamily:CANVAS_TEXT_FONTS[style.fontFamily],fontWeight:style.fontWeight,fontStyle:style.fontStyle,lineHeight:String(object.lineHeight||1.4)});
    span.append(document.createTextNode(run.text));fragment.append(span);
  }
  if(!object.text||object.text.endsWith('\n')){
    const span=document.createElement('span'),style=canvasTextAppearance(object,runs.at(-1)?.style||emptyStyle),br=document.createElement('br');
    br.dataset.canvasTail='true';span.dataset.canvasStyle=JSON.stringify(runs.at(-1)?.style||emptyStyle);
    Object.assign(span.style,{fontSize:style.fontSize+'px',fontFamily:CANVAS_TEXT_FONTS[style.fontFamily],lineHeight:String(object.lineHeight||1.4)});
    span.append(br);fragment.append(span);
  }
  root.replaceChildren(fragment);
}
