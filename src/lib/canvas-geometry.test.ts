import test from 'node:test';
import assert from 'node:assert/strict';
import {validCanvasObject} from './canvas-document';
import {appendInkSample,eraseStroke,inkChunks,inkPath,objectBounds,strokeHit,textLayout,wrapCanvasText,type InkPoint} from './canvas-geometry';

test('long strokes split with a shared endpoint and lose no fractional or pressure sample',()=>{
  const points:InkPoint[]=Array.from({length:5501},(_,i)=>[i/10,(i%200)/10,i%100/100]);const chunks=inkChunks(points);
  assert.equal(chunks.length,3);assert(chunks.every(c=>c.points.length<=4000));
  const restored=chunks.flatMap((c,index)=>c.pressure.map((p,i)=>[c.points[i*2],c.points[i*2+1],p] as InkPoint).slice(index?1:0));assert.deepEqual(restored,points);
});
test('sample filtering preserves pressure changes and pen curves produce finite closed outlines',()=>{
  const points:InkPoint[]=[[1.12,2.25,.1]];appendInkSample(points,[1.12,2.25,.8]);assert.equal(points.length,2);appendInkSample(points,[1.13,2.26,.8]);assert.equal(points.length,2);
  const object=validCanvasObject({id:'ink',type:'stroke',...inkChunks(points)[0],brush:'pen',width:12})!;const path=inkPath(object);assert(path.startsWith('M'));assert(path.endsWith('Z'));assert(!/NaN|Infinity/.test(path));
  const thin=inkPath({...object,points:[10,10,20,20,30,30],pressure:[.1,.1,.1]}),heavy=inkPath({...object,points:[10,10,20,20,30,30],pressure:[.9,.9,.9]});assert.notEqual(thin,heavy);
});
test('sample reduction never changes an ink prefix already streamed to collaborators',()=>{
  const points:InkPoint[]=[[0,0,.5],[1,0,.5],[2,0,.5]],sent=structuredClone(points);appendInkSample(points,[3,0,.5],sent.length);appendInkSample(points,[4,0,.5],sent.length);assert.deepEqual(points.slice(0,sent.length),sent);assert.equal(points.at(-1)![0],4);
});
test('partial eraser cuts sparse segments at intersections and interpolates pressure',()=>{
  const object=validCanvasObject({id:'ink',type:'stroke',x:20,y:30,points:[0,10,100,10],pressure:[.2,.8],brush:'ballpoint',width:2})!;
  const parts=eraseStroke(object,{x:70,y:40},9);assert.equal(parts.length,2);assert.deepEqual(parts[0].points,[0,10,40,10]);assert.deepEqual(parts[1].points,[60,10,100,10]);assert(Math.abs(parts[0].pressure[1]-.44)<1e-8);assert(Math.abs(parts[1].pressure[0]-.56)<1e-8);
  assert.deepEqual(eraseStroke(object,{x:70,y:300},9)[0].points,object.points);assert(strokeHit(object,{x:70,y:45},9));assert(!strokeHit(object,{x:70,y:100},9));
  const dot={...object,points:[50,50],pressure:[.7]};assert.equal(eraseStroke(dot,{x:70,y:80},9).length,0);
  assert(eraseStroke({...object,pressure:[]},{x:70,y:40},9).every(part=>part.pressure.length===0));
});
test('ink bounds use actual coordinates and nib size rather than default rectangle dimensions',()=>{
  const object=validCanvasObject({id:'ink',type:'stroke',x:20,y:30,points:[100,80,200,160],width:10})!;assert.deepEqual(objectBounds(object),{x:115,y:105,w:110,h:90});
});
test('pressure-expanded ink bounds include the thick nib, and erasing uses interpolated nib radius',()=>{
  const object=validCanvasObject({id:'ink',type:'stroke',points:[0,10,100,10],pressure:[.2,.8],brush:'pen',width:20,thinning:1})!;
  assert.equal(objectBounds(object).h,32);const pieces=eraseStroke(object,{x:50,y:10},10);assert.equal(pieces.length,2);
  for(const end of [0,1]){const piece=pieces[end],i=end?0:piece.pressure.length-1;const x=piece.points[i*2],pressure=piece.pressure[i];assert(Math.abs(Math.abs(x-50)-(10+20*pressure))<1e-7);}
});
test('text layout keeps Korean, emoji graphemes, explicit empty lines and styled spacing',()=>{
  const measure=(s:string)=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(s)].length*10;
  assert.deepEqual(wrapCanvasText('한글설명\n\n끝',20,measure),['한글','설명','','끝']);assert.deepEqual(wrapCanvasText('👨‍👩‍👧‍👦🙂🙂',20,measure),['👨‍👩‍👧‍👦🙂','🙂']);
  const object=validCanvasObject({id:'text',type:'text',w:56,fontSize:20,lineHeight:1.6,text:'one two'})!;const layout=textLayout(object,measure);assert.deepEqual(layout.lines,['one ','two']);assert.equal(layout.height,80);
});
