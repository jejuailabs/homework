import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../continuous/beta-bridge.js',import.meta.url),'utf8');
const key='region-quest-aewol-continuous-v1';
const sample=()=>({v:1,phase:'bend',position:{x:1200,y:1700},facing:'left',resume:{x:900,y:1700},travelMode:'car'});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function boot(){
  const messages=[], listeners=new Map(), timers=new Map();let id=0,modal=false;
  const parent={postMessage(message){messages.push(JSON.parse(JSON.stringify(message)));}};
  const window={parent,addEventListener(type,fn){listeners.set(type,fn);}};
  const globals={window,document:{querySelector:()=>modal?{}:null},setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(source,globals);
  return {storage:globals.RQ_STORAGE,messages,timers,parent,setModal(value){modal=value;},
    deliver(data,from=parent){listeners.get('message')({source:from,origin:'https://ourclass.test',data});},
    expire(){const all=[...timers.values()];timers.clear();for(const fn of all)fn();},
    escape(){let prevented=false;listeners.get('keydown')({key:'Escape',defaultPrevented:false,preventDefault(){prevented=true;}});return prevented;}
  };
}
test('opaque bridge restores parent progress and serializes acknowledged saves',async()=>{
  const app=boot(), loaded=app.storage.getItem(key);
  assert.deepEqual(app.messages[0],{type:'region-quest-load',requestId:1});
  app.deliver({type:'region-quest-state',requestId:1,state:sample(),available:true},{});
  assert.equal(app.timers.size,1,'a non-parent cannot complete the load');
  app.deliver({type:'region-quest-state',requestId:1,state:sample(),available:true});
  assert.deepEqual(JSON.parse(await loaded),sample());
  const first=app.storage.setItem(key,JSON.stringify({...sample(),phase:'coast'}));
  const second=app.storage.setItem(key,JSON.stringify({...sample(),phase:'done'}));
  await tick();assert.equal(app.messages.length,2,'second write waits for first acknowledgement');
  app.deliver({type:'region-quest-saved',requestId:2,ok:true});await first;await tick();
  assert.equal(app.messages[2].state.phase,'done');
  app.deliver({type:'region-quest-saved',requestId:3,ok:true});await second;
  assert.equal(JSON.parse(await app.storage.getItem(key)).phase,'done');
  assert.equal(app.messages.filter(m=>m.type==='region-quest-load').length,1);
});
test('load timeout uses memory and ignores a late response instead of replacing current progress',async()=>{
  const app=boot(), loaded=app.storage.getItem(key);app.expire();assert.equal(await loaded,null);
  await assert.rejects(app.storage.setItem(key,JSON.stringify(sample())),/unavailable/);
  app.deliver({type:'region-quest-state',requestId:1,state:{...sample(),phase:'meet'},available:true});
  assert.equal(JSON.parse(await app.storage.getItem(key)).phase,'bend');
  assert.equal(app.messages.length,1,'memory fallback cannot silently write stale data later');
});
test('a rejected host save stops further remote writes and malformed saves never leave the frame',async()=>{
  const app=boot(),loaded=app.storage.getItem(key);
  app.deliver({type:'region-quest-state',requestId:1,state:sample(),available:true});await loaded;
  await assert.rejects(app.storage.setItem('unrelated-key',JSON.stringify(sample())),/value/);
  await assert.rejects(app.storage.setItem(key,JSON.stringify({...sample(),uid:'other'})),/value/);
  const saved=app.storage.setItem(key,JSON.stringify(sample()));const rejected=assert.rejects(saved,/conflict/);
  await tick();app.deliver({type:'region-quest-saved',requestId:2,ok:false});await rejected;
  await assert.rejects(app.storage.setItem(key,JSON.stringify({...sample(),phase:'done'})),/unavailable/);
  assert.equal(app.messages.length,2);
});
test('Escape closes the host preview only when no inner game dialog is open',()=>{
  const app=boot();app.setModal(true);assert.equal(app.escape(),false);assert.equal(app.messages.length,0);
  app.setModal(false);assert.equal(app.escape(),true);assert.deepEqual(app.messages[0],{type:'region-quest-close'});
});
