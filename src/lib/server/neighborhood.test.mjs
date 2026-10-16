import fs from 'node:fs';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const compile=name=>ts.transpileModule(fs.readFileSync(new URL(name,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const policy=url(`export class ApiError extends Error{constructor(status,message,code='INVALID_REQUEST'){super(message);this.status=status;this.code=code;}} export function id(value){if(typeof value!=='string'||!value.length||value.length>200||!/^[A-Za-z0-9_-]+$/.test(value))throw new ApiError(400,'Invalid id');return value;}`);
const auth=url(`import {ApiError} from ${JSON.stringify(policy)};export function assertOrigin(request){if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'Origin');} export async function requireTeacher(request){const uid=request.headers.get('x-test-actor');if(!uid)throw new ApiError(401,'Session');if(uid==='student')throw new ApiError(403,'Teacher only');return {uid,role:'teacher'};}`);
const core=url(compile('../neighborhood.ts'));
const api=await import(url(compile('./neighborhood.ts').replace("import 'server-only';",'').replace("'next/server'",JSON.stringify(url('export const NextResponse={json:(body,init)=>Response.json(body,init)};'))).replace("'./admin'",JSON.stringify(url('export const db=()=>globalThis.__neighborhoodTestDb;'))).replace("'./auth'",JSON.stringify(auth)).replace("'./policy'",JSON.stringify(policy)).replace("'./ai-policy'",JSON.stringify(url('export const readBoundedJson=async request=>request.json();'))).replace("'../neighborhood'",JSON.stringify(core))));
function database() {
  const data = new Map();
  const doc = path => ({path, id: path.split('/').at(-1),
    async get() {return {id: this.id, exists: data.has(path), data: () => data.get(path)};},
    async set(value) {data.set(path, value);}
  });
  const database = {
    data, doc,
    collection(path) {
      const query = {limit() {return this;}, async get() {
        return {docs: [...data].filter(([key]) => key.startsWith(path + '/')).map(([key, value]) => ({id: key.split('/').at(-1), data: () => value}))};
      }};
      return {doc: key => doc(`${path}/${key}`), orderBy: () => query};
    },
    async runTransaction(callback) {
      return callback({get: ref => ref.get(), set: (ref, value) => data.set(ref.path, value),
        create: (ref, value) => {if (data.has(ref.path)) throw new Error('Already exists'); data.set(ref.path, value);},
        update: (ref, value) => data.set(ref.path, {...data.get(ref.path), ...value})});
    }
  };
  globalThis.__neighborhoodTestDb = database;
  return database;
}
const makeRequest=(path,body,actor='teacher-a')=>new Request(`https://class.test${path}`,{method:body?'POST':'GET',headers:{origin:'https://class.test','content-type':'application/json','x-test-actor':actor},body:body?JSON.stringify(body):undefined});
const pack=()=>({version:1,title:'우리동네 자료',region:'제주시',grade:'3학년',unit:'우리동네',classId:'',map:null,brief:'확인한 사실',teacherNotes:'수업 메모',sources:[],referenceDate:'2026-10-14'});
test('private pack saves are idempotent and conflicting payloads are rejected',async()=>{const db=database();const input={pack:pack(),requestId:'save-1'};const first=await api.neighborhoodPacksRoute(makeRequest('/api/neighborhood/packs',input));assert.equal(first.status,201);assert.equal((await api.neighborhoodPacksRoute(makeRequest('/api/neighborhood/packs',input))).status,201);assert.equal(db.data.size,1);const changed={...input,pack:{...input.pack,title:'changed'}};assert.equal((await api.neighborhoodPacksRoute(makeRequest('/api/neighborhood/packs',changed))).status,409);assert.equal(db.data.get('users/teacher-a/neighborhoodPacks/save-1').title,input.pack.title);});
test('pack ownership is derived from authenticated owner path, not a submitted user field',async()=>{database();await api.neighborhoodPacksRoute(makeRequest('/api/neighborhood/packs',{pack:pack(),requestId:'private'}));assert.equal((await api.neighborhoodPacksRoute(makeRequest('/api/neighborhood/packs?id=private',undefined,'teacher-b'))).status,404);assert.equal((await api.neighborhoodPacksRoute(makeRequest('/api/neighborhood/packs?id=private',undefined,'teacher-a'))).status,200);assert.equal((await api.neighborhoodPacksRoute(makeRequest('/api/neighborhood/packs',undefined,'student'))).status,403);});
test('foreign classes and cross-site writes are blocked',async()=>{const db=database();db.data.set('classes/foreign',{ownerUid:'teacher-b'});assert.equal((await api.neighborhoodPacksRoute(makeRequest('/api/neighborhood/packs',{pack:{...pack(),classId:'foreign'},requestId:'save'}))).status,403);const request=new Request('https://class.test/api/neighborhood/packs',{method:'POST',headers:{origin:'https://other.test','x-test-actor':'teacher-a'},body:'{}'});assert.equal((await api.neighborhoodPacksRoute(request)).status,403);});
test('map quota blocks external requests and failed fetch releases the lease',async()=>{const db=database(),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('offline');};try{const response=await api.neighborhoodMapRoute(makeRequest('/api/neighborhood/map',{lat:33.5,lon:126.53,radius:500}));assert.equal(response.status,503);assert.equal(calls,1);assert.equal(db.data.get('neighborhoodLimits/global').busyUntil,0);const global=db.data.get('neighborhoodLimits/global');global.count=100;global.lastStarted=0;const limited=await api.neighborhoodMapRoute(makeRequest('/api/neighborhood/map',{lat:33.5,lon:126.53,radius:500}));assert.equal(limited.status,429);assert.equal(calls,1);}finally{globalThis.fetch=original;}});
test('valid real-format maps are cached and served without another provider call',async()=>{database();const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({elements:[{type:'way',id:12,tags:{highway:'residential'},geometry:[{lat:33.499,lon:126.529},{lat:33.501,lon:126.531}]}],osm3s:{timestamp_osm_base:'2026-10-14'}});};try{const input={lat:33.5,lon:126.53,radius:500};const first=await api.neighborhoodMapRoute(makeRequest('/api/neighborhood/map',input));assert.equal(first.status,200);assert.equal((await first.json()).cached,false);const second=await api.neighborhoodMapRoute(makeRequest('/api/neighborhood/map',input));assert.equal(second.status,200);assert.equal((await second.json()).cached,true);assert.equal(calls,1);}finally{globalThis.fetch=original;}});
