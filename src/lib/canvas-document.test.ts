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
  assert.equal(safe.x,0);assert.equal(safe.y,0);assert.equal(safe.w,1200);assert.equal(safe.text,'<script>plain text</script>');
  assert.equal(validCanvasObject({id:'../bad',type:'image'}),null);
});
