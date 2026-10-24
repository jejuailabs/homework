import assert from 'node:assert/strict';
import test from 'node:test';
import {CanvasModel,decodeCanvasUpdate,validCanvasObject} from './canvas-document';
test('concurrent text edits merge and undo removes only the local contribution', () => {
  const seed=new CanvasModel(),id=seed.add({type:'text',text:'Hello '});
  const left=new CanvasModel(decodeCanvasUpdate(seed.serialize())),right=new CanvasModel(decodeCanvasUpdate(seed.serialize()));
  left.setText(id,'Hello A');right.setText(id,'Hello B');
  const leftUpdate=decodeCanvasUpdate(left.serialize()),rightUpdate=decodeCanvasUpdate(right.serialize());
  left.applyRemote(rightUpdate);right.applyRemote(leftUpdate);
  assert.equal(left.read()[0].text,right.read()[0].text);assert(left.read()[0].text.includes('A'));assert(left.read()[0].text.includes('B'));
  left.undo.undo();right.applyRemote(decodeCanvasUpdate(left.serialize()));
  assert.equal(left.read()[0].text,'Hello B');assert.equal(right.read()[0].text,'Hello B');
  seed.destroy();left.destroy();right.destroy();
});
test('concurrent pen and image additions survive reconnection and editable serialization', () => {
  const left=new CanvasModel(),right=new CanvasModel();const stroke=left.add({type:'stroke',points:[10,20]});left.appendPoints(stroke,[30,40]);right.add({type:'image',assetId:'safe-asset',w:300,h:400});
  left.applyRemote(decodeCanvasUpdate(right.serialize()));right.applyRemote(decodeCanvasUpdate(left.serialize()));
  assert.equal(left.read().length,2);assert.deepEqual(left.read(),right.read());
  const restored=new CanvasModel(decodeCanvasUpdate(left.serialize()));assert.deepEqual(restored.read(),left.read());
  left.undo.undo();assert.equal(left.read().filter(object=>object.type==='image').length,1);
  left.destroy();right.destroy();restored.destroy();
});
test('canvas objects reject executable image sources and bound untrusted geometry', () => {
  for(const src of ['javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','https://evil.example/image'])assert.equal(validCanvasObject({id:'safe',type:'image',src})?.src,'');
  const safe=validCanvasObject({id:'safe',type:'text',x:-1,y:Infinity,w:90000,text:'<script>plain text</script>'})!;
  assert.equal(safe.x,-1);assert.equal(safe.y,0);assert.equal(safe.w,90000);assert.equal(safe.text,'<script>plain text</script>');
  assert.equal(validCanvasObject({id:'../bad',type:'image'}),null);
});

test('fractional ink, real pressure and text styling round-trip and sanitize unsafe input',()=>{
  const model=new CanvasModel();
  const id=model.add({type:'stroke',x:-5,y:-8,points:[10.123,20.567,40.55,60.11],pressure:[.12,.94],brush:'pen',smoothing:.8,thinning:.75});
  assert.equal(model.appendPoints(id,[50.25,80.75],[.45]),1);
  model.add({type:'text',text:'아이의 설명\n두 번째 줄',fontFamily:'serif',fontWeight:'bold',fontStyle:'italic',align:'center',lineHeight:1.6,autoHeight:true});
  const restored=new CanvasModel(decodeCanvasUpdate(model.serialize()));assert.deepEqual(restored.read(),model.read());
  assert.deepEqual(restored.read()[0].points,[10.12,20.57,40.55,60.11,50.25,80.75]);assert.deepEqual(restored.read()[0].pressure,[.12,.94,.45]);
  const unsafe=validCanvasObject({id:'safe',type:'stroke',points:[1,2,3,4,5],pressure:[-2,Infinity,4],brush:'script',fontFamily:'url(evil)',opacity:0})!;
  assert.deepEqual(unsafe.points,[1,2,3,4]);assert.deepEqual(unsafe.pressure,[0,.5]);assert.equal(unsafe.brush,'legacy');assert.equal(unsafe.fontFamily,'sans');assert.equal(unsafe.opacity,.05);
  model.destroy();restored.destroy();
});

test('unchanged shapes keep their identity while deep local and remote edits invalidate only the changed shape',()=>{
  const model=new CanvasModel(),first=model.add({type:'text',text:'원본'}),second=model.add({type:'stroke',points:[1,2]});
  const before=model.read();assert.equal(model.read()[0],before[0]);model.undo.clear();model.setText(first,'변경');const after=model.read();assert.notEqual(after[0],before[0]);assert.equal(after[1],before[1]);
  const remote=new CanvasModel(decodeCanvasUpdate(model.serialize()));remote.patch(second,{color:'#ff0000'});model.applyRemote(decodeCanvasUpdate(remote.serialize()));const synced=model.read();assert.equal(synced[0],after[0]);assert.notEqual(synced[1],after[1]);assert.equal(synced[1].color,'#ff0000');
  model.undo.undo();assert.equal(model.read()[0].text,'원본');assert.equal(model.read()[1].color,'#ff0000');model.destroy();remote.destroy();
});

test('long gestures and multi-object changes undo as one action without undoing remote contributions',()=>{
  const model=new CanvasModel(),id=model.add({type:'text',x:10,text:'start'});model.undo.clear();
  model.beginGesture();model.patch(id,{x:20});model.undo.lastChange=Date.now()-1000;model.patch(id,{x:50});model.endGesture();
  assert.equal(model.undo.undoStack.length,1);model.undo.undo();assert.equal(model.read()[0].x,10);model.undo.redo();assert.equal(model.read()[0].x,50);
  const other=new CanvasModel(decodeCanvasUpdate(model.serialize()));other.setText(id,'remote');model.applyRemote(decodeCanvasUpdate(other.serialize()));model.undo.undo();assert.equal(model.read()[0].x,10);assert.equal(model.read()[0].text,'remote');
  const added=model.addMany([{type:'stroke',points:[1,2]},{type:'stroke',points:[3,4]}]);assert.equal(added.length,2);model.undo.undo();assert.equal(model.read().length,1);model.destroy();other.destroy();
});

test('stroke splitting preserves layer, pressure and style, respects locks and can be undone in one action',()=>{
  const model=new CanvasModel();model.add({type:'text',text:'behind'});const stroke=model.add({type:'stroke',points:[0,10,100,10],pressure:[.2,.8],brush:'pen',opacity:.7});model.add({type:'text',text:'front'});const before=model.read();model.undo.clear();
  model.batch(()=>model.splitStroke(stroke,[{points:[0,10,40,10],pressure:[.2,.44]},{points:[60,10,100,10],pressure:[.56,.8]}]));
  assert.deepEqual(model.read().map(o=>o.type),['text','stroke','stroke','text']);assert.equal(model.read()[2].opacity,.7);assert.deepEqual(model.read()[2].pressure,[.56,.8]);model.undo.undo();assert.deepEqual(model.read(),before);
  model.patch(stroke,{locked:true});model.splitStroke(stroke,[]);assert.equal(model.read().length,3);model.destroy();
});

test('multi-shape addition fails atomically at the document limit',()=>{
  const model=new CanvasModel();model.addMany(Array.from({length:399},()=>({type:'text' as const})));assert.throws(()=>model.addMany([{type:'text'},{type:'stroke'}]));assert.equal(model.read().length,399);model.destroy();
});
