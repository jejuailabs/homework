// Exercise the real API with an in-memory database; no credentials or cloud calls.
import fs from 'node:fs';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
function load(path,imports={}) {
  const source=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};new Function('require','module','exports',source)(name=>imports[name]||(name.endsWith('/seahorse')?seahorse:name.endsWith('/marine')?marine:name.endsWith('/berry')?berry:name.endsWith('/complete-outfits')?completeOutfits:name.endsWith('/wardrobe-compatibility')?compatibility:{}),module,module.exports);return module.exports;
}
const whiteknee=load('../../modules/my-space/whiteknee.ts');
const seahorse=load('../../modules/my-space/seahorse.ts');
const marine=load('../../modules/my-space/marine.ts');
const berry=load('../../modules/my-space/berry.ts');
const completeOutfits=load('../../modules/my-space/complete-outfits.ts');
const compatibility=load('../../modules/my-space/wardrobe-compatibility.ts',{'./seahorse':seahorse});
const characters=load('../characters.ts');
const newPets=load('../../modules/my-space/new-pets.ts',{'./whiteknee':whiteknee});
const catalog=load('../../modules/my-space/catalog.ts',{'@/lib/characters':characters,'./new-pets':newPets,'./whiteknee':whiteknee,'./diary-stickers':load('../../modules/my-space/diary-stickers.ts')});
const spacePolicy=load('../../modules/my-space/policy.ts',{'./catalog':catalog,'./whiteknee':whiteknee});
const companion=load('../../modules/my-space/profile.ts',{'./catalog':catalog,'./policy':spacePolicy});
const walker=load('../exhibition-walker.ts',{'./characters':characters,'@/data/exhibition-walker-storage.json':{ready:false,bucket:'',prefix:'',downloadToken:''}});
const policy=load('./policy.ts',{'../characters':characters,'../assignment-submission':load('../assignment-submission.ts')});
const points=load('./points-policy.ts',{'./policy':policy,'../points-types':load('../points-types.ts',{'../modules/my-space/whiteknee':whiteknee}),'../../modules/my-space/whiteknee':whiteknee,'node:crypto':crypto});
async function bootstrap(student,room) {
  const reads=[],prefix='classes/demo/students/student';
  const data=new Map([[prefix,{name:'샘플 학생',number:1,character:'cat',...student}],['classes/demo',{name:'샘플 교실'}],[prefix+'/mySpace/room',room]]);
  const query={where(){return this;},orderBy(){return this;},limit(){return this;},async get(){return {docs:[],size:0};}};
  const db={doc(path){return {async get(){reads.push(path);return {id:path.split('/').at(-1),data:()=>data.get(path),exists:data.has(path)};}};},collection(){return query;}};
  const api=load('./exhibitions.ts',{'node:crypto':crypto,'next/server':{NextResponse:{json:Response.json.bind(Response)}},'firebase-admin/firestore':{FieldPath:{documentId:()=> '__name__'}},'./admin':{db:()=>db},'./auth':{getContext:async()=>({role:'student',uid:'student-auth',classId:'demo',studentId:'student'})},'./policy':policy,'./points-policy':points,'@/modules/my-space/profile':companion,'../exhibition-walker':walker,'./exhibition-policy':{EXHIBITION_LIST_LIMIT:20,exhibitionCursor:()=>null}});
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
test('a forged/unowned Whiteknee room cannot change the player: the pupil walks as their basic friend',async()=>{
  const {body,reads}=await bootstrap({spaceOwned:[],character:'otter'},{pet:'animal-whiteknee',outfit:{}});
  assert.deepEqual(body.profile.companion,{pet:'friend-otter'});
  assert.equal(reads.filter(path=>path.endsWith('/mySpace/room')).length,1);
});
test('owning Whiteknee does not override another currently selected friend',async()=>{
  const {body}=await bootstrap({spaceOwned:['animal-whiteknee']},{pet:'friend-dog',outfit:{}});
  assert.deepEqual(body.profile.companion,{pet:'friend-dog'});
});
test('any owned pet chosen in My Space walks through the exhibition, without clothing details',async()=>{
  const {body}=await bootstrap({spaceOwned:['dog-corgi']},{pet:'dog-corgi',outfit:{body:'junior-body-knit'}});
  assert.deepEqual(body.profile.companion,{pet:'dog-corgi'});
});
test('a pupil who never opened My Space walks as the friend picked at sign-up',async()=>{
  const {body}=await bootstrap({character:'rabbit'},undefined);
  assert.deepEqual(body.profile.companion,{pet:'friend-rabbit'});
});
test('with My Space switched off no room is read and the basic friend walks',async()=>{
  const before=process.env.MY_SPACE_DISABLED;process.env.MY_SPACE_DISABLED='true';
  try{
    const {body,reads}=await bootstrap({spaceOwned:['dog-corgi']},{pet:'dog-corgi',outfit:{}});
    assert.deepEqual(body.profile.companion,{pet:'friend-cat'});assert.equal(reads.some(path=>path.endsWith('/mySpace/room')),false);
  }finally{if(before===undefined)delete process.env.MY_SPACE_DISABLED;else process.env.MY_SPACE_DISABLED=before;}
});

test('every pet sold or given in My Space has a 3D walker file name',()=>{
  const pets=catalog.spaceCatalog.filter(item=>item.kind==='pet').map(item=>item.id);
  assert.equal(pets.length,33);for(const id of pets)assert(walker.walkerPetIds.includes(id),id);
});
