import test from 'node:test';
import assert from 'node:assert/strict';
import type {RegionQuestState} from '../beta/storage';
const {validateRegionQuestState, regionQuestStorageKey, createRegionQuestStorageSession, isRegionQuestFrameMessage} = await import(new URL('../beta/storage.ts', import.meta.url).href);
const sample = (): RegionQuestState => ({v:1,phase:'bend',position:{x:936.168,y:1727.682},facing:'right',resume:null,travelMode:'car'});
class MemoryStore {
  data = new Map<string,string>();
  getItem(key: string) {return this.data.get(key) ?? null;}
  setItem(key: string,value: string) {this.data.set(key,value);}
  removeItem(key: string) {this.data.delete(key);}
}
test('beta state sanitizer copies valid progress and rejects malformed or expanded schemas', () => {
  const source=sample(), clean=validateRegionQuestState(source);
  assert.deepEqual(clean,source);source.position.x=0;assert.notEqual(clean.position.x,0);
  for(const bad of [
    {...sample(),v:2},{...sample(),phase:'unknown'},{...sample(),facing:'diagonal'},
    {...sample(),travelMode:'plane'},{...sample(),position:{x:Infinity,y:0}},
    {...sample(),position:{x:0,y:-1}},{...sample(),position:{x:10001,y:0}},
    {...sample(),position:{x:'3',y:0}},{...sample(),position:{x:1,y:2,extra:0}},
    {...sample(),resume:{x:NaN,y:0}},{...sample(),uid:'another-account'},
    JSON.parse('{"__proto__":{},"v":1,"phase":"meet","position":{"x":0,"y":0},"facing":"up","resume":null,"travelMode":"walk"}'),
    Object.assign(Object.create({inherited:true}),sample()),
    {...sample(),position:Object.defineProperty({y:0},'x',{enumerable:true,get(){return 1;}})},
  ]) assert.equal(validateRegionQuestState(bad),null);
  assert.equal(regionQuestStorageKey(''),null);
  assert.equal(regionQuestStorageKey('x'.repeat(129)),null);
});
test('beta storage isolates UIDs, requires load, and rejects stale sessions', () => {
  const storage=new MemoryStore(), first=createRegionQuestStorageSession(storage,'teacher-a'), stale=createRegionQuestStorageSession(storage,'teacher-a'), other=createRegionQuestStorageSession(storage,'teacher-b');
  assert.equal(first.save(sample()),false);
  assert.deepEqual(first.load(),{state:null,available:true});stale.load();other.load();
  assert.equal(first.save(sample()),true);
  assert.equal(stale.save({...sample(),phase:'coast'}),false);
  assert.equal(other.save({...sample(),phase:'meet'}),true);
  assert.equal(createRegionQuestStorageSession(storage,'teacher-a').load().state.phase,'bend');
  assert.equal(createRegionQuestStorageSession(storage,'teacher-b').load().state.phase,'meet');
  assert.deepEqual([...storage.data.keys()].sort(),[regionQuestStorageKey('teacher-a'),regionQuestStorageKey('teacher-b')].sort());
  assert.equal(first.save({...sample(),extra:1}),false);
});
test('beta storage restores read-only progress and never saves after failed initial reads', () => {
  const raw=JSON.stringify(sample());
  const readOnly={getItem:()=>raw,setItem:()=>{throw Error('quota');},removeItem:()=>{}};
  const session=createRegionQuestStorageSession(readOnly,'teacher');
  assert.deepEqual(session.load(),{state:sample(),available:false});assert.equal(session.save(sample()),false);
  const denied={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('unexpected write');},removeItem:()=>{}};
  const unavailable=createRegionQuestStorageSession(denied,'teacher');
  assert.deepEqual(unavailable.load(),{state:null,available:false});assert.equal(unavailable.save(sample()),false);
  const oversized=new MemoryStore();oversized.setItem(regionQuestStorageKey('teacher')!,'x'.repeat(4097));
  assert.equal(createRegionQuestStorageSession(oversized,'teacher').load().state,null);
});
test('only the active opaque frame may send bounded, typed storage requests', () => {
  const frame={} as Window, data={type:'region-quest-save',requestId:1,state:sample()};
  const event={source:frame,origin:'null',data};
  assert.equal(isRegionQuestFrameMessage(event,frame),true);
  assert.equal(isRegionQuestFrameMessage(event,null),false);
  assert.equal(isRegionQuestFrameMessage({...event,source:{} as Window},frame),false);
  assert.equal(isRegionQuestFrameMessage({...event,origin:'https://untrusted.test'},frame),false);
  for(const bad of [{...data,requestId:Infinity},{...data,requestId:0},{...data,uid:'other'},{...data,state:{...sample(),extra:true}},{type:'region-quest-load',requestId:1,extra:0},{type:'region-quest-close',requestId:1},{type:'unrecognized',requestId:1}]) {
    assert.equal(isRegionQuestFrameMessage({...event,data:bad},frame),false);
  }
  assert.equal(isRegionQuestFrameMessage({...event,data:{type:'region-quest-load',requestId:2}},frame),true);
  assert.equal(isRegionQuestFrameMessage({...event,data:{type:'region-quest-close'}},frame),true);
});
