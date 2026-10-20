import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeSegment, splitExportParts, uniqueNames} from './storage-export';

test('archive names stay valid on every OS and keep Korean text',()=>{
  assert.equal(safeSegment('3학년 1반: 받아쓰기/1차?'),'3학년 1반 받아쓰기 1차');
  assert.equal(safeSegment('...'),'이름 없음');
  assert.equal(safeSegment(undefined,'학급'),'학급');
});
test('duplicate names in one archive get numbered instead of overwriting',()=>{
  const files=uniqueNames([{paths:['a'],size:1,name:'숙제/A/01_민지_photo.jpg'},{paths:['b'],size:1,name:'숙제/A/01_민지_photo.jpg'},{paths:['c'],size:1,name:'전시실/봄/민지_꽃',appendExtension:true},{paths:['d'],size:1,name:'전시실/봄/민지_꽃',appendExtension:true}]);
  assert.deepEqual(files.map(file=>file.name),['숙제/A/01_민지_photo.jpg','숙제/A/01_민지_photo (2).jpg','전시실/봄/민지_꽃','전시실/봄/민지_꽃 (2)']);
});
test('parts split by size and file count and never leave a file behind',()=>{
  const files=Array.from({length:7},(_,index)=>({paths:[String(index)],size:400,name:`f${index}`}));
  const parts=splitExportParts(files,1000,2);
  assert.deepEqual(parts.map(part=>part.map(file=>file.name)),[['f0','f1'],['f2','f3'],['f4','f5'],['f6']]);
  assert.deepEqual(splitExportParts([{paths:['big'],size:5000,name:'big'}],1000).length,1);
});
