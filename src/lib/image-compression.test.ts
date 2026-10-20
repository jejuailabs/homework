import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compressionPlan, jpegName, targetSize, IMAGE_SKIP_BYTES, IMAGE_MAX_SOURCE_BYTES} from './image-compression';

test('photos shrink to a 2000px long edge without upscaling or distortion',()=>{
  assert.deepEqual(targetSize(4032,3024),{width:2000,height:1500});
  assert.deepEqual(targetSize(3024,4032),{width:1500,height:2000});
  assert.deepEqual(targetSize(1200,800),{width:1200,height:800});
});
test('small, unsupported or oversized sources skip decoding on the phone',()=>{
  assert.equal(compressionPlan('image/jpeg',IMAGE_SKIP_BYTES),'small');
  assert.equal(compressionPlan('image/heic',5*1024**2),'unsupported');
  assert.equal(compressionPlan('image/png',IMAGE_MAX_SOURCE_BYTES+1),'too-large');
  assert.equal(compressionPlan('image/jpeg',4*1024**2),null);
});
test('resized photos keep a readable name with a jpg extension',()=>{
  assert.equal(jpegName('IMG_0001.PNG'),'IMG_0001.jpg');
  assert.equal(jpegName('숙제 사진.webp'),'숙제 사진.jpg');
  assert.equal(jpegName('.png'),'photo.jpg');
});
