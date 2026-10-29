// Exercise the real API with an in-memory database; no credentials or cloud calls.
import fs from 'node:fs';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
function load(path,imports={}) {
  const source=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};new Function('require','module','exports',source)(name=>imports[name]||{},module,module.exports);return module.exports;
}
const whiteknee=load('../../modules/my-space/whiteknee.ts');
const characters=load('../characters.ts');
const newPets=load('../../modules/my-space/new-pets.ts',{'./whiteknee':whiteknee});
const catalog=load('../../modules/my-space/catalog.ts',{'@/lib/characters':characters,'./new-pets':newPets,'./whiteknee':whiteknee,'./diary-stickers':load('../../modules/my-space/diary-stickers.ts')});
const spacePolicy=load('../../modules/my-space/policy.ts',{'./catalog':catalog,'./whiteknee':whiteknee});
const companion=load('../../modules/my-space/profile.ts',{'./catalog':catalog,'./policy':spacePolicy});
const policy=load('./policy.ts',{'../characters':characters,'../assignment-submission':load('../assignment-submission.ts')});
const points=load('./points-policy.ts',{'./policy':policy,'../points-types':load('../points-types.ts',{'../modules/my-space/whiteknee':whiteknee}),'../../modules/my-space/whiteknee':whiteknee,'node:crypto':crypto});
async function bootstrap(student,room) {
  const reads=[],prefix='classes/demo/students/student';
  const data=new Map([[prefix,{name:'샘플 학생',number:1,character:'cat',...student}],['classes/demo',{name:'샘플 교실'}],[prefix+'/mySpace/room',room]]);
  const query={where(){return this;},orderBy(){return this;},limit(){return this;},async get(){return {docs:[],size:0};}};
  const db={doc(path){return {async get(){reads.push(path);return {id:path.split('/').at(-1),data:()=>data.get(path),exists:data.has(path)};}};},collection(){return query;}};
  const api=load('./exhibitions.ts',{'node:crypto':crypto,'next/server':{NextResponse:{json:Response.json.bind(Response)}},'firebase-admin/firestore':{FieldPath:{documentId:()=> '__name__'}},'./admin':{db:()=>db},'./auth':{getContext:async()=>({role:'student',uid:'student-auth',classId:'demo',studentId:'student'})},'./policy':policy,'./points-policy':points,'@/modules/my-space/profile':companion,'./exhibition-policy':{EXHIBITION_LIST_LIMIT:20,exhibitionCursor:()=>null}});
  const response=await api.handleExhibitions(new Request('https://example.com/api/exhibitions?bootstrap=1'));
  assert.equal(response.status,200);return {body:await response.json(),reads};
}
test('an existing Whiteknee owner enters with the saved selected companion and only owned clothing',async()=>{
  const before=process.env.MY_SPACE_DISABLED;delete process.env.MY_SPACE_DISABLED;
  try{
    const {body,reads}=await bootstrap({spaceOwned:['animal-whiteknee','whiteknee-body-hero'],wardrobeOwned:['whiteknee-head-bow'],wardrobeOutfit:{head:'whiteknee-head-bow',face:'whiteknee-face-glasses'}},{pet:'animal-whiteknee',outfit:{body:'whiteknee-body-hero'},nicknames:{'animal-whiteknee':'내 화이트니'}});
    assert.equal(body.profile.companion.pet,'animal-whiteknee');assert.equal(body.profile.companion.outfit.body,'whiteknee-body-hero');
    assert.equal(body.profile.companion.wardrobe.head,'whiteknee-head-bow');assert.equal(body.profile.companion.wardrobe.face,undefined);
    assert.equal(reads.filter(path=>path.endsWith('/mySpace/room')).length,1);
  }finally{if(before===undefined)delete process.env.MY_SPACE_DISABLED;else process.env.MY_SPACE_DISABLED=before;}
});
test('a forged/unowned Whiteknee room cannot change the player and adds no room read',async()=>{
  const {body,reads}=await bootstrap({spaceOwned:[]},{pet:'animal-whiteknee',outfit:{}});
  assert.equal(body.profile.companion,null);assert.equal(reads.some(path=>path.endsWith('/mySpace/room')),false);
});
test('owning Whiteknee does not override another currently selected friend',async()=>{
  const {body}=await bootstrap({spaceOwned:['animal-whiteknee']},{pet:'friend-dog',outfit:{}});
  assert.equal(body.profile.companion,null);
});
