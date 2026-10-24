import test from 'node:test';
import assert from 'node:assert/strict';
import {initialToolWindow,toolWindowLayout} from './tool-window-layout';
import {toolCatalog} from './tool-catalog';

test('photo review, classroom work and small controls get different working spaces',()=>{
  assert(toolWindowLayout('handwriting').width>toolWindowLayout('seats').width);
  assert(toolWindowLayout('seats').width>toolWindowLayout('clock').width);
  assert.equal(toolWindowLayout('ai-feedback').kind,'document');
  assert.equal(toolWindowLayout('board').maximized,true);
  assert.equal(toolWindowLayout('canvas').maximized,true);
});
test('a document fills small screens while a large screen keeps a spacious movable window',()=>{
  assert.equal(initialToolWindow('handwriting',{width:1366,height:720}).maximized,true);
  assert.equal(initialToolWindow('matching',{width:1366,height:768}).maximized,true);
  assert.equal(initialToolWindow('timer',{width:1024,height:600}).maximized,true);
  assert.equal(initialToolWindow('handwriting',{width:1024,height:900}).maximized,true);
  assert.equal(initialToolWindow('handwriting',{width:1920,height:1080}).maximized,false);
  assert.equal(initialToolWindow('dice',{width:390,height:844}).maximized,true);
});
test('every catalog tool starts within the viewport, even when another window adds an offset',()=>{
  for(const tool of toolCatalog)for(const viewport of[{width:390,height:844},{width:1024,height:600},{width:1366,height:768},{width:1920,height:1080}])for(const offset of[0,96]){
    const win=initialToolWindow(tool.id,viewport,offset),layout=toolWindowLayout(tool.id);if(win.maximized)continue;
    assert(win.x>=0&&win.y>=0,tool.id);
    assert(win.x+Math.min(layout.width,viewport.width-24)<=viewport.width,tool.id);
    assert(win.y+Math.min(layout.height,viewport.height-80)<=viewport.height,tool.id);
  }
});
