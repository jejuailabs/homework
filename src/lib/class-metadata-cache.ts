// Same-tab, short-lived UI metadata only. Authentication and private detail responses
// always go to the server. Nothing is written to local/session storage.
let viewer = '', generation = 0;
const entries = new Map<string, {expires: number; response: Response}>();
const flights = new Map<string, Promise<Response>>();
export function clearClassMetadata(resetViewer = false) { generation++; entries.clear(); flights.clear(); if (resetViewer) viewer = ''; }
export function setClassMetadataViewer(uid: string) { if (viewer !== uid) { clearClassMetadata(); viewer = uid; } }
function eligible(url: string) { return url === '/api/classes' || /^\/api\/classes\/[A-Za-z0-9_-]+\/students$/.test(url); }
function withSignal<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve,reject)=>{ const abort=()=>reject(new DOMException('Aborted','AbortError')); if(signal.aborted){abort();return;} signal.addEventListener('abort',abort,{once:true}); promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort)); });
}
export async function classMetadataFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET' || !viewer || !eligible(url)) {
    const response = await fetch(url, {...init, cache:'no-store'});
    if (response.ok && method !== 'GET' && url.startsWith('/api/classes')) clearClassMetadata();
    if ([401,403].includes(response.status)) clearClassMetadata(true);
    return response;
  }
  const key = viewer + ':' + url, cached = entries.get(key);
  if (cached && cached.expires > Date.now()) { if(init?.signal?.aborted)throw new DOMException('Aborted','AbortError');return cached.response.clone(); }
  if (cached) entries.delete(key);
  let flight = flights.get(key);
  if (!flight) {
    const currentGeneration = generation;
    flight = fetch(url, {...init, signal:undefined, cache:'no-store'}).then(response=>{
      if ([401,403].includes(response.status)) clearClassMetadata(true);
      if (response.ok && currentGeneration === generation) {
        if(entries.size>=64)entries.delete(entries.keys().next().value!);
        entries.set(key,{expires:Date.now()+30_000,response:response.clone()});
      }
      return response;
    }).finally(()=>{if(flights.get(key)===flight)flights.delete(key);});
    flights.set(key,flight);
  }
  return (await withSignal(flight,init?.signal)).clone();
}
