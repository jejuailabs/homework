import assert from 'node:assert/strict';
import test from 'node:test';
import {canvasTextSelectionStyle,cleanCanvasTextStyle,normalizeCanvasTextRuns,portableCanvasTextRuns,sliceCanvasTextRuns} from './canvas-text';
import {layoutCanvasText} from './canvas-text-layout';
import {CanvasModel,decodeCanvasUpdate,validCanvasObject} from './canvas-document';

test('rich ranges keep plain fallback, sanitize styles and merge adjacent equal runs',()=>{
  assert.deepEqual(cleanCanvasTextStyle({color:'url(evil)',fontFamily:'evil',fontSize:Infinity,fontWeight:'900',onclick:'evil'}),{});
  assert.deepEqual(cleanCanvasTextStyle({color:'#aabbcc',fontSize:900,fontStyle:'italic'}),{color:'#aabbcc',fontSize:120,fontStyle:'italic'});
  assert.deepEqual(normalizeCanvasTextRuns('keep',[{text:'replace',style:{fontWeight:'bold'}}]),[{text:'keep',style:{}}]);
  assert.deepEqual(portableCanvasTextRuns('plain',[]),[]);
  const runs=normalizeCanvasTextRuns('abc',[{text:'a',style:{fontWeight:'bold'}},{text:'b',style:{fontWeight:'bold'}},{text:'c',style:{}}]);
  assert.equal(runs.length,2);assert.deepEqual(sliceCanvasTextRuns(runs,1,3),[{text:'b',style:{fontWeight:'bold'}},{text:'c',style:{}}]);
  assert.deepEqual(canvasTextSelectionStyle({},runs,0,3).mixed,['fontWeight']);
});
test('partial formatting survives Yjs, JSON import, duplication and undo independently',()=>{
  const model=new CanvasModel(),id=model.add({type:'text',text:'앞 선택 뒤'});
  model.formatTextRange(id,2,4,{fontWeight:'bold',fontSize:50,color:'#e45c69'});
  const original=model.read()[0];assert.equal(original.text,'앞 선택 뒤');assert.deepEqual(original.textRuns,[{text:'앞 ',style:{}},{text:'선택',style:{color:'#e45c69',fontSize:50,fontWeight:'bold'}},{text:' 뒤',style:{}}]);
  const restored=new CanvasModel(decodeCanvasUpdate(model.serialize())),imported=new CanvasModel();
  imported.replace(JSON.parse(JSON.stringify([original])));assert.deepEqual(restored.read(),model.read());assert.deepEqual(imported.read()[0].textRuns,original.textRuns);
  const duplicate=model.add({...original});assert.deepEqual(model.read().find(o=>o.id===duplicate)?.textRuns,original.textRuns);model.undo.undo();model.undo.undo();assert.deepEqual(model.read()[0].textRuns,[]);model.undo.redo();assert.deepEqual(model.read()[0].textRuns,original.textRuns);
  model.formatTextBox(id,{color:'#498bca'});assert.equal(model.read()[0].color,'#498bca');assert.equal(model.read()[0].textRuns?.[1].style.fontWeight,'bold');assert(!model.read()[0].textRuns?.some(run=>'color'in run.style));
  model.destroy();restored.destroy();imported.destroy();
});
test('proportional resize scales mixed font sizes together and remains one undo step',()=>{
  const model=new CanvasModel(),id=model.add({type:'text',text:'small BIG',fontSize:20});model.formatTextRange(id,6,9,{fontSize:40,color:'#e45c69'});const original=model.read()[0];model.beginGesture();model.scaleText(id,original,1.5);model.scaleText(id,original,2);model.endGesture();assert.equal(model.read()[0].fontSize,40);assert.equal(model.read()[0].textRuns?.at(-1)?.style.fontSize,80);assert.equal(model.read()[0].textRuns?.at(-1)?.style.color,'#e45c69');model.undo.undo();assert.deepEqual(model.read()[0],original);model.destroy();
});
test('concurrent formatting and remote typing merge; local undo preserves remote text',()=>{
  const seed=new CanvasModel(),id=seed.add({type:'text',text:'Hello world'}),a=new CanvasModel(decodeCanvasUpdate(seed.serialize())),b=new CanvasModel(decodeCanvasUpdate(seed.serialize()));
  a.formatTextRange(id,6,11,{fontWeight:'bold'});b.replaceTextRange(id,0,0,[{text:'새 ',style:{color:'#498bca'}}]);
  const au=decodeCanvasUpdate(a.serialize()),bu=decodeCanvasUpdate(b.serialize());a.applyRemote(bu);b.applyRemote(au);assert.deepEqual(a.read(),b.read());assert.equal(a.read()[0].textRuns?.at(-1)?.text,'world');assert.equal(a.read()[0].textRuns?.at(-1)?.style.fontWeight,'bold');
  a.undo.undo();assert.equal(a.read()[0].text,'새 Hello world');assert(!a.read()[0].textRuns?.some(run=>run.style.fontWeight==='bold'));
  seed.destroy();a.destroy();b.destroy();
});
test('range replacement obeys text limit and preserves surrounding attributes',()=>{
  const model=new CanvasModel(),id=model.add({type:'text',text:'abc'});model.formatTextRange(id,1,2,{fontWeight:'bold'});model.replaceTextRange(id,1,2,[{text:'한글',style:{fontStyle:'italic'}}]);
  assert.deepEqual(model.read()[0].textRuns,[{text:'a',style:{}},{text:'한글',style:{fontStyle:'italic'}},{text:'c',style:{}}]);
  model.replaceTextRange(id,0,0,[{text:'x'.repeat(6000),style:{}}]);assert.equal(model.read()[0].text.length,5000);model.destroy();
});
test('mixed layout sizes lines by largest selected font and keeps grapheme clusters intact',()=>{
  const object=validCanvasObject({id:'rich',type:'text',w:100,text:'AB\nC',fontSize:20,textRuns:[{text:'A',style:{fontSize:40}},{text:'B\nC',style:{}}]})!;
  const result=layoutCanvasText(object,(text,style)=>Array.from(text).length*style.fontSize/2);assert.equal(result.lines.length,2);assert.equal(result.lines[0].height,56);assert.equal(result.lines[1].height,28);assert.equal(result.height,100);assert.equal(result.lines[0].fragments[1].x,28);
  const emoji=validCanvasObject({...object,w:40,text:'👨‍👩‍👧‍👦a',textRuns:[]})!;const wrapped=layoutCanvasText(emoji,(text)=>text==='👨‍👩‍👧‍👦'?30:text.length*10);assert.equal(wrapped.lines[0].fragments[0].text,'👨‍👩‍👧‍👦');assert.equal(wrapped.lines[1].fragments[0].text,'a');
});
