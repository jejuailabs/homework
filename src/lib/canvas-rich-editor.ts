import * as Y from 'yjs';
import {renderCanvasEditable} from './canvas-text-dom';
import {textDifference,type CanvasModel,type CanvasObject} from './canvas-document';
import {canvasTextAppearance,canvasTextSelectionStyle,canvasTextStyleAt,cleanCanvasTextStyle,normalizeCanvasTextRuns,sliceCanvasTextRuns,type CanvasTextAppearance,type CanvasTextRun,type CanvasTextStyle} from './canvas-text';

export type CanvasTextSelection={id:string;start:number;end:number;style:CanvasTextAppearance;mixed:(keyof CanvasTextStyle)[]};
export type CanvasRichEditor={id:string;format:(style:CanvasTextStyle)=>void;selection:()=>CanvasTextSelection;refresh:()=>void;focus:()=>void;destroy:()=>void};
type DomSelection={anchor:number;focus:number;style:CanvasTextStyle};
const MIME='application/x-homework-rich-text';
const CLIPBOARD_LIMIT=1_000_000;

/** Only plain text is read from browser mutations. HTML, URLs and event attributes never enter Yjs. */
export function readCanvasEditableText(root:Node):string {
  let result='';
  function walk(node:Node){if(node.nodeType===3){result+=node.nodeValue||'';return;}if(node instanceof Element&&node.hasAttribute('data-canvas-tail'))return;
    if(node instanceof HTMLBRElement){result+='\n';return;}
    const block=node instanceof Element&&['DIV','P','LI'].includes(node.tagName)&&node!==root;
    if(block&&result&&!result.endsWith('\n'))result+='\n';for(const child of node.childNodes)walk(child);
    if(block&&node.nextSibling&&result&&!result.endsWith('\n'))result+='\n';
  }
  walk(root);return result==='\n'&&!root.textContent?'':result.replace(/\r\n?/g,'\n');
}
function domSelection(root:HTMLElement):DomSelection|null {
  const selection=window.getSelection();if(!selection?.anchorNode||!selection.focusNode||!root.contains(selection.anchorNode)||!root.contains(selection.focusNode))return null;
  function offset(node:Node,index:number){const range=document.createRange();range.selectNodeContents(root);range.setEnd(node,index);return readCanvasEditableText(range.cloneContents()).length;}
  const element=selection.anchorNode instanceof Element?selection.anchorNode:selection.anchorNode.parentElement;
  let style:CanvasTextStyle={};try{style=cleanCanvasTextStyle(JSON.parse(element?.closest('[data-canvas-style]')?.getAttribute('data-canvas-style')||'{}'));}catch{}
  return {anchor:offset(selection.anchorNode,selection.anchorOffset),focus:offset(selection.focusNode,selection.focusOffset),style};
}
function restoreDomSelection(root:HTMLElement,anchor:number,focus:number,focusEditor=false) {
  const nodes:Text[]=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))nodes.push(node as Text);
  function at(index:number):[Node,number]{for(const text of nodes){if(index<=text.length)return[text,Math.max(0,index)];index-=text.length;}return nodes.length?[nodes[nodes.length-1],nodes[nodes.length-1].length]:[root,0];}
  const [a,ai]=at(anchor),[f,fi]=at(focus);if(focusEditor)root.focus({preventScroll:true});window.getSelection()?.setBaseAndExtent(a,ai,f,fi);
}
/** A small Y.Text rich binding: relative selections survive concurrent edits and toolbar focus. */
export function bindCanvasRichEditor(model:CanvasModel,root:HTMLElement,id:string,onSelection:(selection:CanvasTextSelection)=>void):CanvasRichEditor {
  const text=model.textType(id);if(!text)throw Error('Missing canvas text');
  model.undo.stopCapturing();
  let anchor=Y.createRelativePositionFromTypeIndex(text,text.length),focus=Y.createRelativePositionFromTypeIndex(text,text.length),cursorStyle:CanvasTextStyle={},typingStyle:CanvasTextStyle={},composing=false,writing=false,closing=false,compositionFrame=0,lastSelection='',lastView='',lastAnchor=text.length,lastFocus=text.length;
  const object=()=>{const value=model.read().find(o=>o.id===id);return value?{...value,text:text.toString(),textRuns:model.textRuns(id)}:null;};
  function numeric(){const a=Y.createAbsolutePositionFromRelativePosition(anchor,model.doc)?.index??lastAnchor,f=Y.createAbsolutePositionFromRelativePosition(focus,model.doc)?.index??lastFocus;return {anchor:Math.max(0,Math.min(text!.length,a)),focus:Math.max(0,Math.min(text!.length,f))};}
  function save(a:number,f:number){lastAnchor=Math.max(0,Math.min(text!.length,a));lastFocus=Math.max(0,Math.min(text!.length,f));anchor=Y.createRelativePositionFromTypeIndex(text!,lastAnchor);focus=Y.createRelativePositionFromTypeIndex(text!,lastFocus);}
  function capture(){const range=domSelection(root);if(!range)return;const current=numeric();if(range.anchor!==current.anchor||range.focus!==current.focus)typingStyle={};cursorStyle=range.style;save(range.anchor,range.focus);}
  function selection():CanvasTextSelection {const value=object(),range=numeric(),start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus),state=canvasTextSelectionStyle(value||{},model.textRuns(id),start,end);return {id,start,end,style:start===end?canvasTextAppearance(value||{},{...cursorStyle,...typingStyle}):state.style,mixed:start===end?[]:state.mixed};}
  function publish(){if(closing)return;const state=selection(),signature=JSON.stringify(state);if(signature!==lastSelection){lastSelection=signature;onSelection(state);}}
  function render(forceFocus=false){if(closing||composing)return;const value=object();if(!value)return;const signature=JSON.stringify([value.text,value.textRuns,value.color,value.fontSize,value.fontFamily,value.fontWeight,value.fontStyle,value.lineHeight]),active=document.activeElement===root,range=numeric();if(signature!==lastView){renderCanvasEditable(root,value,typingStyle);lastView=signature;if(active||forceFocus)restoreDomSelection(root,range.anchor,range.focus,forceFocus);}else if(forceFocus)restoreDomSelection(root,range.anchor,range.focus,true);publish();}
  function syncInput(){if(closing||model.doc.isDestroyed)return;const value=readCanvasEditableText(root).slice(0,5000),range=domSelection(root),before=text!.toString(),difference=textDifference(before,value);if(difference.remove||difference.insert){const previous=model.textRuns(id),style={...canvasTextStyleAt(previous,Math.max(0,difference.remove?difference.start:difference.start-1)),...cursorStyle,...typingStyle};writing=true;try{model.replaceTextRange(id,difference.start,difference.start+difference.remove,difference.insert?[{text:difference.insert,style}]:[]);}finally{writing=false;}}if(range)save(range.anchor,range.focus);if(!composing)render();publish();}
  function flush(){if(model.doc.isDestroyed)return;syncInput();if(composing){composing=false;model.endTextComposition();}render();}
  function replace(runs:CanvasTextRun[]){capture();const range=selection();writing=true;let next:number|undefined;try{next=model.replaceTextRange(id,range.start,range.end,runs);}finally{writing=false;}save(next??range.start,next??range.start);cursorStyle={...runs.at(-1)?.style};render(true);}
  function insertPlain(value:string){const range=selection(),runs=model.textRuns(id),inherited=range.end>range.start?canvasTextStyleAt(runs,range.start):cursorStyle;replace([{text:value.replace(/\r\n?/g,'\n'),style:{...inherited,...typingStyle}}]);}
  function format(style:CanvasTextStyle){if(closing)return;if(composing){syncInput();const savedAnchor=anchor,savedFocus=focus;root.blur();cancelAnimationFrame(compositionFrame);compositionFrame=requestAnimationFrame(()=>{flush();anchor=savedAnchor;focus=savedFocus;render(true);format(style);});return;}capture();const range=selection(),attributes=cleanCanvasTextStyle(style);if(range.start<range.end){model.formatTextRange(id,range.start,range.end,attributes);}else{typingStyle={...typingStyle,...attributes};if(!text!.length){lastView='';render();}publish();}}
  function selected(){capture();const value=object(),range=selection(),runs=sliceCanvasTextRuns(model.textRuns(id),range.start,range.end).map(run=>({...run,style:canvasTextAppearance(value||{},run.style)}));return {range,runs};}
  function toggle(key:'fontWeight'|'fontStyle'){capture();const state=selection(),on=key==='fontWeight'?'bold':'italic';format({[key]:!state.mixed.includes(key)&&state.style[key]===on?'normal':on});}
  const input=()=>syncInput();
  const selectionChange=()=>{if(closing||composing)return;capture();publish();};
  const beforeInput=(event:InputEvent)=>{if(event.isComposing||composing)return;if(['insertParagraph','insertLineBreak'].includes(event.inputType)){event.preventDefault();insertPlain('\n');}else if(event.inputType==='historyUndo'||event.inputType==='historyRedo'){event.preventDefault();event.inputType==='historyUndo'?model.undo.undo():model.undo.redo();}else if(event.inputType==='formatBold'||event.inputType==='formatItalic'){event.preventDefault();toggle(event.inputType==='formatBold'?'fontWeight':'fontStyle');}};
  const keydown=(event:KeyboardEvent)=>{if(event.isComposing||composing||!(event.ctrlKey||event.metaKey))return;const key=event.key.toLowerCase();if(key==='b'||key==='i'){event.preventDefault();toggle(key==='b'?'fontWeight':'fontStyle');}else if(key==='z'||key==='y'){event.preventDefault();if(key==='y'||event.shiftKey)model.undo.redo();else model.undo.undo();}};
  const paste=(event:ClipboardEvent)=>{event.preventDefault();const raw=event.clipboardData?.getData(MIME);if(raw&&raw.length<CLIPBOARD_LIMIT){try{const value=JSON.parse(raw);if(typeof value.text==='string'&&value.text.length<=5000){replace(normalizeCanvasTextRuns(value.text,value.runs));return;}}catch{}}insertPlain(event.clipboardData?.getData('text/plain')||'');};
  const copy=(event:ClipboardEvent)=>{const {range,runs}=selected();if(range.start===range.end||!event.clipboardData)return;event.preventDefault();const value=runs.map(run=>run.text).join('');event.clipboardData.setData('text/plain',value);event.clipboardData.setData(MIME,JSON.stringify({text:value,runs}));};
  const cut=(event:ClipboardEvent)=>{copy(event);if(event.defaultPrevented)replace([]);};
  let dragged:{start:Y.RelativePosition;end:Y.RelativePosition}|null=null;
  const dragStart=(event:DragEvent)=>{const {range,runs}=selected();if(range.start===range.end||!event.dataTransfer)return;dragged={start:Y.createRelativePositionFromTypeIndex(text!,range.start),end:Y.createRelativePositionFromTypeIndex(text!,range.end)};event.dataTransfer.setData('text/plain',runs.map(run=>run.text).join(''));event.dataTransfer.setData(MIME,JSON.stringify({text:runs.map(run=>run.text).join(''),runs}));};
  const dragEnd=()=>{dragged=null;};
  const dragOver=(event:DragEvent)=>event.preventDefault();
  const drop=(event:DragEvent)=>{
    event.preventDefault();if(composing)return;
    const caret=document.caretRangeFromPoint?.(event.clientX,event.clientY);if(!caret||!root.contains(caret.startContainer))return;
    const before=document.createRange();before.selectNodeContents(root);before.setEnd(caret.startContainer,caret.startOffset);const target=readCanvasEditableText(before.cloneContents()).length;
    let runs:CanvasTextRun[]=[{text:event.dataTransfer?.getData('text/plain')||'',style:canvasTextStyleAt(model.textRuns(id),Math.max(0,target-1))}];
    const raw=event.dataTransfer?.getData(MIME);if(raw&&raw.length<CLIPBOARD_LIMIT)try{const value=JSON.parse(raw);if(typeof value.text==='string'&&value.text.length<=5000)runs=normalizeCanvasTextRuns(value.text,value.runs);}catch{}
    if(!runs.some(run=>run.text))return;
    const source=dragged?{start:Y.createAbsolutePositionFromRelativePosition(dragged.start,model.doc)?.index,end:Y.createAbsolutePositionFromRelativePosition(dragged.end,model.doc)?.index}:null;
    const moving=source?.start!==undefined&&source.end!==undefined&&!event.ctrlKey&&!event.altKey;
    if(moving&&target>=source!.start!&&target<=source!.end!)return;
    const destination=Y.createRelativePositionFromTypeIndex(text!,target);let next=target;writing=true;
    try{model.batch(()=>{if(moving)model.replaceTextRange(id,source!.start!,source!.end!,[]);const index=Y.createAbsolutePositionFromRelativePosition(destination,model.doc)?.index??target;next=model.replaceTextRange(id,index,index,runs)??index;});}finally{writing=false;}
    dragged=null;save(next,next);cursorStyle={...runs.at(-1)?.style};render(true);
  };
  const compositionStart=()=>{composing=true;model.startTextComposition();};
  const compositionEnd=()=>{cancelAnimationFrame(compositionFrame);compositionFrame=requestAnimationFrame(()=>{syncInput();composing=false;model.endTextComposition();render();});};
  const afterTransaction=()=>{if(!writing&&!composing&&!closing){render();publish();}};
  root.addEventListener('input',input);root.addEventListener('beforeinput',beforeInput as EventListener);root.addEventListener('keydown',keydown);root.addEventListener('paste',paste);root.addEventListener('copy',copy);root.addEventListener('cut',cut);root.addEventListener('compositionstart',compositionStart);root.addEventListener('compositionend',compositionEnd);document.addEventListener('selectionchange',selectionChange);model.doc.on('afterTransaction',afterTransaction);const unregister=model.registerTextEditor(flush);
  root.addEventListener('dragstart',dragStart);root.addEventListener('dragend',dragEnd);root.addEventListener('dragover',dragOver);root.addEventListener('drop',drop);
  render(true);capture();publish();
  return {id,format,selection:()=>{capture();return selection();},refresh:()=>render(),focus:()=>render(true),destroy:()=>{cancelAnimationFrame(compositionFrame);flush();closing=true;unregister();root.removeEventListener('input',input);root.removeEventListener('beforeinput',beforeInput as EventListener);root.removeEventListener('keydown',keydown);root.removeEventListener('paste',paste);root.removeEventListener('copy',copy);root.removeEventListener('cut',cut);root.removeEventListener('compositionstart',compositionStart);root.removeEventListener('compositionend',compositionEnd);root.removeEventListener('dragstart',dragStart);root.removeEventListener('dragend',dragEnd);root.removeEventListener('dragover',dragOver);root.removeEventListener('drop',drop);document.removeEventListener('selectionchange',selectionChange);model.doc.off('afterTransaction',afterTransaction);}};
}
