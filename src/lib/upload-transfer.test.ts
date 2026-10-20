import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendUpload, UploadTransferError} from './upload-transfer';

const transfer={uploadId:'one',path:'private/one',uploadUrl:'https://storage.example/one-session',uploadHeaders:{'Content-Type':'image/png'}};
test('an interrupted upload queries and resumes the same session from its accepted offset',async()=>{
  const originalXHR=globalThis.XMLHttpRequest,originalFetch=globalThis.fetch,requests:{headers:Record<string,string>;bytes:number}[]=[];
  class XHR {
    headers:Record<string,string>={};upload={onprogress:null as null|((event:any)=>void)};status=200;timeout=0;
    onload=()=>{};onerror=()=>{};ontimeout=()=>{};onabort=()=>{};
    open(_method:string,url:string){assert.equal(url,transfer.uploadUrl);}setRequestHeader(key:string,value:string){this.headers[key]=value;}
    send(body:Blob){requests.push({headers:this.headers,bytes:body.size});queueMicrotask(()=>requests.length===1?this.onerror():this.onload());}abort(){this.onabort();}
  }
  globalThis.XMLHttpRequest=XHR as any;
  globalThis.fetch=(async(url,init)=>{assert.equal(url,transfer.uploadUrl);assert.equal(new Headers(init?.headers).get('Content-Range'),'bytes */10');return new Response(null,{status:308,headers:{Range:'bytes=0-3'}});}) as typeof fetch;
  try {await sendUpload(transfer,new File(['0123456789'],'test.png'),()=>{});assert.equal(requests.length,2);assert.equal(requests[1].bytes,6);assert.equal(requests[1].headers['Content-Range'],'bytes 4-9/10');}
  finally{globalThis.XMLHttpRequest=originalXHR;globalThis.fetch=originalFetch;}
});
test('a lost completion response recovers without retransferring the successful object',async()=>{
  const originalXHR=globalThis.XMLHttpRequest,originalFetch=globalThis.fetch;let sends=0;
  class XHR {upload={};timeout=0;onerror=()=>{};open(){}setRequestHeader(){}send(){sends++;queueMicrotask(()=>this.onerror());}}
  globalThis.XMLHttpRequest=XHR as any;globalThis.fetch=(async()=>new Response('{}',{status:200})) as typeof fetch;
  try{await sendUpload(transfer,new File(['file'],'test.png'),()=>{});assert.equal(sends,1);}finally{globalThis.XMLHttpRequest=originalXHR;globalThis.fetch=originalFetch;}
});
test('permission and size failures are surfaced without automatic repeat uploads',async()=>{
  const originalXHR=globalThis.XMLHttpRequest;let sends=0;
  class XHR {upload={};timeout=0;status=403;onload=()=>{};open(){}setRequestHeader(){}send(){sends++;queueMicrotask(()=>this.onload());}}
  globalThis.XMLHttpRequest=XHR as any;
  try{await assert.rejects(sendUpload(transfer,new File(['file'],'test.png'),()=>{}),(error:any)=>error instanceof UploadTransferError&&error.code==='UPLOAD_HTTP_403');assert.equal(sends,1);}finally{globalThis.XMLHttpRequest=originalXHR;}
});
test('a slow transfer that keeps making progress is never cut off, a stalled one resumes',async()=>{
  const originalXHR=globalThis.XMLHttpRequest,originalFetch=globalThis.fetch,originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
  const timers=new Map<number,()=>void>();let next=0,sends=0;
  globalThis.setTimeout=((fn:()=>void)=>{timers.set(++next,fn);return next;}) as any;globalThis.clearTimeout=((handle:number)=>{timers.delete(handle);}) as any;
  const fire=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());};
  class XHR {upload={onprogress:null as null|((event:any)=>void)};status=200;onload=()=>{};onerror=()=>{};ontimeout=()=>{};onabort=()=>{};open(){}setRequestHeader(){}
    send(){sends++;if(sends===1){this.upload.onprogress?.({lengthComputable:true,loaded:2});queueMicrotask(()=>{this.upload.onprogress?.({lengthComputable:true,loaded:4});fire();});}else queueMicrotask(()=>this.onload());}
    abort(){this.onabort();}}
  globalThis.XMLHttpRequest=XHR as any;
  globalThis.fetch=(async()=>new Response(null,{status:308,headers:{Range:'bytes=0-3'}})) as typeof fetch;
  try{await sendUpload(transfer,new File(['0123456789'],'test.png'),()=>{});assert.equal(sends,2);}
  finally{globalThis.XMLHttpRequest=originalXHR;globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;}
});
