import assert from 'node:assert/strict';
import test from 'node:test';
import {cameraBox,cameraPoint,cleanCamera,fitCamera,panCamera,zoomCamera,CANVAS_WORLD_LIMIT,CANVAS_ZOOM_MIN,CANVAS_ZOOM_MAX} from './canvas-camera';
import {canvasActivityObjects} from './canvas-activities';
import {CanvasModel,decodeCanvasUpdate,validCanvasObject} from './canvas-document';

test('zooming preserves the world point under the pointer at very small and large scales',()=>{
  let camera={x:-8000,y:5400,z:.75};const anchor=cameraPoint(camera,317,209);
  for(const z of [.002,.05,4,32,128]){camera=zoomCamera(camera,z,317,209);const p=cameraPoint(camera,317,209);assert(Math.abs(p.x-anchor.x)<1e-8);assert(Math.abs(p.y-anchor.y)<1e-8);}
  assert.equal(cleanCamera({x:Infinity,y:NaN,z:Infinity}).z,1);assert.equal(cleanCamera({x:1e20,y:-1e20,z:1e20}).x,CANVAS_WORLD_LIMIT);assert.equal(cleanCamera({x:0,y:0,z:-3}).z,CANVAS_ZOOM_MIN);assert.equal(cleanCamera({x:0,y:0,z:1e20}).z,CANVAS_ZOOM_MAX);
});
test('panning and fitting use screen dimensions without moving or changing document objects',()=>{
  assert.deepEqual(panCamera({x:8000,y:-9000,z:2},60,-40),{x:7970,y:-8980,z:2});
  const box={x:-15000,y:12000,w:3000,h:2000},size={width:1300,height:800},camera=fitCamera(box,size),view=cameraBox(camera,size);
  assert(view.x<box.x&&view.y<box.y);assert(view.x+view.w>box.x+box.w&&view.y+view.h>box.y+box.h);
});
test('wide coordinates, textured pencils, markers, notes and activity areas survive collaboration and editable save',()=>{
  const one=new CanvasModel(),two=new CanvasModel();one.add({type:'stroke',x:-4000,y:9000,brush:'pencil',points:[-2000,5000,-1500,5200]});const stroke=one.read()[0];one.appendPoints(stroke.id,[-1200,5400]);one.add({type:'stroke',brush:'marker',points:[6000,-8000,6400,-8100]});one.add({type:'text',note:true,fill:'#fef0b5',text:'우리 모둠의 생각',x:14000,y:-9000});one.addMany(canvasActivityObjects('groups',-14000,12000));
  two.applyRemote(decodeCanvasUpdate(one.serialize()));assert.deepEqual(two.read(),one.read());assert.equal(two.read()[0].points.at(-2),-1200);assert.equal(two.read().filter(o=>o.shape==='frame').length,6);assert.equal(two.read().find(o=>o.note)?.text,'우리 모둠의 생각');
  const before=one.serialize();zoomCamera({x:0,y:0,z:1},12,400,300);assert.equal(one.serialize(),before);one.destroy();two.destroy();
});
test('activity templates are additive, bounded and leave capacity for students to contribute',()=>{
  for(const activity of ['groups','wonder','story','compare'] as const){const values=canvasActivityObjects(activity,7000,-4000);assert(values.length<=12);assert(values.every(o=>validCanvasObject({...o,id:'safe'})));const frames=values.filter(o=>o.type==='shape');assert(frames.every(o=>o.locked&&o.shape==='frame'));assert.equal(frames.length,values.length/2);}
  const invalid=validCanvasObject({id:'shape',type:'shape',x:1e30,y:-1e30,fill:'url(javascript:evil)',shape:'script'})!;assert.equal(invalid.x,CANVAS_WORLD_LIMIT);assert.equal(invalid.y,-CANVAS_WORLD_LIMIT);assert.equal(invalid.fill,undefined);assert.equal(invalid.shape,'rectangle');
});
