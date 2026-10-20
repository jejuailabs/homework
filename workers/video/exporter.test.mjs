import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {zipWriter} from './exporter.mjs';

test('streamed STORE zip opens with standard tools and keeps Korean names and bytes',async()=>{
  const chunks=[],zip=zipWriter(async buffer=>{chunks.push(Buffer.from(buffer));});
  const video=Buffer.alloc(300000,7),photo=Buffer.from('사진 데이터');
  await zip.add('숙제/3학년 1반/받아쓰기/01_김하늘_영상.mp4',(async function*(){yield video.subarray(0,100000);yield video.subarray(100000);})());
  await zip.add('전시실/봄 전시/하늘_꽃.jpg',[photo]);
  const size=await zip.finish(),bytes=Buffer.concat(chunks);
  assert.equal(size,bytes.length);
  const dir=mkdtempSync(join(tmpdir(),'zip-test-')),file=join(dir,'part.zip');
  try{
    writeFileSync(file,bytes);
    const script="import sys,zipfile,json\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps({i.filename:i.file_size for i in z.infolist()}, ensure_ascii=False))";
    const listing=JSON.parse(execFileSync('python',['-c',script,file],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}}));
    assert.deepEqual(listing,{'숙제/3학년 1반/받아쓰기/01_김하늘_영상.mp4':300000,'전시실/봄 전시/하늘_꽃.jpg':photo.length});
  }finally{rmSync(dir,{recursive:true,force:true});}
});
