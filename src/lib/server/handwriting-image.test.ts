import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {handwritingImage} from './handwriting-image';
const data=(buffer:Buffer,type='png')=>`data:image/${type};base64,${buffer.toString('base64')}`;
const decode=(image:string)=>Buffer.from(image.split(',')[1],'base64');
test('lossless normalization preserves opaque writing pixels and does not enlarge a thumbnail',async()=>{
  const pixels=Buffer.alloc(283*321*3,255);for(let y=30;y<280;y+=13)for(let x=20;x<263;x++)if(x%9<3){const i=(y*283+x)*3;pixels[i]=28;pixels[i+1]=40;pixels[i+2]=35;}
  const input=await sharp(pixels,{raw:{width:283,height:321,channels:3}}).png().toBuffer(),out=decode(await handwritingImage(data(input))),metadata=await sharp(out).metadata();
  assert.equal(metadata.format,'png');assert.equal(metadata.width,283);assert.equal(metadata.height,321);
  assert.deepEqual(await sharp(out).removeAlpha().raw().toBuffer(),pixels);
});
test('valid JPEG inputs keep their decoded pixels through lossless server normalization',async()=>{
  const input=await sharp({create:{width:1000,height:1400,channels:3,background:'#e9e7dc'}}).jpeg({quality:90}).toBuffer(),out=decode(await handwritingImage(data(input,'jpeg')));
  assert.deepEqual(await sharp(out).removeAlpha().raw().toBuffer(),await sharp(input).removeAlpha().raw().toBuffer());
});
test('normalization retains the existing image dimensions and removes metadata',async()=>{
  const input=await sharp({create:{width:2400,height:3200,channels:3,background:'#fafaf5'}}).withMetadata().png().toBuffer(),out=decode(await handwritingImage(data(input))),m=await sharp(out).metadata();
  assert.equal(m.width,1536);assert.equal(m.height,2048);assert.equal(m.exif,undefined);assert.equal(m.icc,undefined);
});
test('invalid pixels, mismatched content types and excessive pixel dimensions fail before provider use',async()=>{
  const png=await sharp({create:{width:20,height:20,channels:3,background:'#fff'}}).png().toBuffer();
  await assert.rejects(()=>handwritingImage(data(png,'jpeg')));
  await assert.rejects(()=>handwritingImage('data:image/png;base64,AAAA'));
  const oversized=await sharp({create:{width:4100,height:4100,channels:3,background:'#fff'}}).png().toBuffer();await assert.rejects(()=>handwritingImage(data(oversized)));
});
test('a complex photo uses bounded JPEG only when lossless output would exceed the existing size limit',async()=>{
  const pixels=Buffer.alloc(1000*1400*3);let state=17;for(let i=0;i<pixels.length;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;pixels[i]=state>>>24;}
  const input=await sharp(pixels,{raw:{width:1000,height:1400,channels:3}}).jpeg({quality:60}).toBuffer(),out=await handwritingImage(data(input,'jpeg'));
  assert(out.length<=1_800_000);assert(out.startsWith('data:image/jpeg;base64,'));assert.equal((await sharp(decode(out)).metadata()).width,1000);
});
