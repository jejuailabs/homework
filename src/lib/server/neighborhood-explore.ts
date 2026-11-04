import 'server-only';
import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {assertOrigin, requireTeacher} from './auth';
import {ApiError} from './policy';
import {completedAiText, providerFailure, readBoundedJson} from './ai-policy';
import {runMeteredAi} from './ai';
import {validateMapCenter} from '../neighborhood';
import {SPOT_KEYWORDS, spotAiPlaces, spotAiRequest, spotCandidates, vworldSearchItems, vworldSearchUrl} from '../neighborhood-spots';

const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const failure=(error:unknown)=>json({error:error instanceof ApiError?error.message:'지도 자료를 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',code:error instanceof ApiError?error.code:'NEIGHBORHOOD_ERROR'},error instanceof ApiError?error.status:400);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
// Shared with the map route: the key stays server-side; domain is the URL registered with the key.
function vworld(){const key=process.env.VWORLD_API_KEY?.trim();if(!key)throw new ApiError(503,'지도 서비스 연결 설정을 확인해 주세요.','MAP_NOT_CONFIGURED');return {key,domain:process.env.VWORLD_DOMAIN?.trim()??''};}
async function vworldJson(url:URL,timeout=10000){const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(timeout),redirect:'error'});if(!response.ok)throw new Error('VWORLD_HTTP');return readBoundedJson(response,2_000_000);}
const vworldError=(error:unknown)=>{const code=error instanceof Error?error.message:'';
  if(code==='VWORLD_INVALID_KEY'||code==='VWORLD_INCORRECT_KEY'||code==='VWORLD_UNAVAILABLE_KEY')return new ApiError(503,'지도 서비스 인증키 설정을 확인해 주세요.','MAP_NOT_CONFIGURED');
  if(code==='VWORLD_OVER_REQUEST_LIMIT')return new ApiError(429,'오늘 지도 서비스 사용량을 모두 썼어요. 내일 다시 시도해 주세요.','MAP_QUOTA');
  return new ApiError(503,'브이월드 지도 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.','MAP_UNAVAILABLE');};

/** School (or any place/road address) search that centres the lesson map. */
export async function neighborhoodSearchRoute(request:Request){
  try{
    await requireTeacher(request);const {key,domain}=vworld();
    const query=(new URL(request.url).searchParams.get('q')??'').trim();
    if(query.length<2||query.length>60)throw new ApiError(400,'학교 이름을 두 글자 이상 적어 주세요.','SEARCH_INPUT');
    let items;try{items=vworldSearchItems(await vworldJson(vworldSearchUrl(query,key,domain)));if(!items.length)items=vworldSearchItems(await vworldJson(vworldSearchUrl(query,key,domain,undefined,'address')));}catch(error){throw vworldError(error);}
    // Schools first; the same school often appears again as its library or gate.
    const seen=new Set<string>(),results=items.filter(item=>!/진출입시설/.test(item.category)).sort((a,b)=>Number(/학교$/.test(b.category)||/학교$/.test(b.name))-Number(/학교$/.test(a.category)||/학교$/.test(a.name))).filter(item=>{const key=`${item.name}|${item.address}`;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,10);
    return json({results:results.map(({name,category,address,lat,lon})=>({name,category,address,lat,lon}))});
  }catch(error){return failure(error);}
}

const TILE_LAYERS={base:'Base/{z}/{y}/{x}.png',white:'white/{z}/{y}/{x}.png',satellite:'Satellite/{z}/{y}/{x}.jpeg',hybrid:'Hybrid/{z}/{y}/{x}.png'} as const;
/** Proxies VWorld WMTS tiles so the key never reaches the browser. Signed-in teachers only. */
export async function neighborhoodTileRoute(request:Request,segments:string[]){
  try{
    await requireTeacher(request);const {key}=vworld();
    const [layer,zText,yText,xText]=segments,z=Number(zText),y=Number(yText),x=Number(xText?.replace(/\.(png|jpe?g)$/,''));
    if(segments.length!==4||!Object.hasOwn(TILE_LAYERS,layer)||!Number.isInteger(z)||z<6||z>19||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=2**z||y>=2**z)throw new ApiError(404,'지도 조각을 찾을 수 없어요.','TILE_NOT_FOUND');
    const path=TILE_LAYERS[layer as keyof typeof TILE_LAYERS].replace('{z}',String(z)).replace('{y}',String(y)).replace('{x}',String(x));
    const upstream=await fetch(`https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(key)}/${path}`,{cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'}).catch(()=>null);
    const type=upstream?.headers.get('content-type')??'';
    if(!upstream?.ok||!/^image\/(png|jpeg)/.test(type)){await upstream?.body?.cancel();throw new ApiError(502,'지도 조각을 불러오지 못했어요.','TILE_UNAVAILABLE');}
    return new Response(upstream.body,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=604800','X-Content-Type-Options':'nosniff'}});
  }catch(error){return failure(error);}
}

/** Real places near the school from VWorld search, narrowed by AI to a varied lesson set. Positions never come from AI. */
export async function neighborhoodSpotsRoute(request:Request){
  try{
    assertOrigin(request);const ctx=await requireTeacher(request);const {key,domain}=vworld();
    const raw=await readBoundedJson(request,4000) as Record<string,unknown>|null;
    let center;try{center=validateMapCenter(raw);}catch{throw new ApiError(400,'학교 위치를 다시 선택해 주세요.','NEIGHBORHOOD_INPUT');}
    const school=typeof raw?.school==='string'?raw.school.trim().slice(0,100):'',grade=typeof raw?.grade==='string'?raw.grade.trim().slice(0,40):'초등 3학년';
    if(!school)throw new ApiError(400,'학교를 먼저 검색해 선택해 주세요.','NEIGHBORHOOD_INPUT');
    const settled=await Promise.allSettled(SPOT_KEYWORDS.map(keyword=>vworldJson(vworldSearchUrl(keyword,key,domain,center))));
    const answered=settled.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
    if(!answered.length)throw vworldError(settled[0]?.status==='rejected'?settled[0].reason:null);
    let firstError:unknown=null;const valid=answered.filter(value=>{try{vworldSearchItems(value);return true;}catch(error){firstError??=error;return false;}});
    if(!valid.length)throw vworldError(firstError);
    const candidates=spotCandidates(valid,center,school);
    if(!candidates.length)throw new ApiError(404,'이 범위에서 찾은 장소가 없어요. 범위를 넓히거나 지도에서 직접 장소를 추가해 주세요.','SPOTS_EMPTY');
    const model=process.env.OPENAI_MODEL?.trim()||'gpt-6-luna',input={school,grade,candidates};
    const text=await runMeteredAi(ctx.uid,'neighborhood-spots',model,hash(JSON.stringify(input)),async observe=>{
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(spotAiRequest(input,model)),signal:AbortSignal.timeout(90_000),cache:'no-store'});
      if(!response.ok){await response.body?.cancel();throw providerFailure(response.status);}
      const payload=await readBoundedJson(response,512*1024);observe(payload);return completedAiText(payload);
    });
    let result;try{result=spotAiPlaces(text,candidates);}catch{throw new ApiError(502,'AI가 고른 장소를 읽지 못했어요. 다시 시도해 주세요.','SPOTS_FORMAT');}
    if(!result.places.length)throw new ApiError(502,'AI가 수업 장소를 고르지 못했어요. 다시 시도해 주세요.','SPOTS_EMPTY');
    return json({...result,candidates:candidates.length});
  }catch(error){return failure(error);}
}
