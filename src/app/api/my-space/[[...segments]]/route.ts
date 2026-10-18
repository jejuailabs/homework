import {NextResponse} from 'next/server';
import {assertOrigin} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {readBoundedJson} from '@/lib/server/ai-policy';
import {SpaceError} from '@/modules/my-space/policy';
import {boundedBytes} from '@/modules/artwork-extensions/server-utils';
import * as space from '@/modules/my-space/server';
export const runtime='nodejs',dynamic='force-dynamic',maxDuration=120;
const headers={'Cache-Control':'private,no-store'};
async function input(request:Request,max:number){const value=await readBoundedJson(request,max);if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError(400,'입력 내용을 확인해 주세요.');return value as Record<string,any>;}
async function handle(request:Request,{params}:{params:Promise<{segments?:string[]}>}){try{const s=(await params).segments||[],u=new URL(request.url),isImage=s[0]==='images'&&s.length===2&&request.method==='POST';if(request.method!=='GET'){if(isImage){if(request.headers.get('origin')!==u.origin||request.headers.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'이 화면에서 다시 올려 주세요.');}else assertOrigin(request);}const ctx=await space.spaceContext(request);let result:unknown;
 if(request.method==='GET'&&!s.length)result=await space.bootstrap(ctx);
 else if(s[0]==='purchase'&&s.length===1&&request.method==='POST')result=await space.buy(ctx,await input(request,4000));
 else if(s[0]==='room'&&s.length===1&&request.method==='PUT')result=await space.saveRoom(ctx,await input(request,30000));
 else if(s[0]==='diary'&&s.length===1&&request.method==='GET')result=await space.listDiaries(ctx,u.searchParams.get('cursor')||'');
 else if(s[0]==='diary'&&s.length===2&&request.method==='PUT')result=await space.saveDiary(ctx,s[1],await input(request,80000));
 else if(s[0]==='diary'&&s.length===2&&request.method==='DELETE')result=await space.removeDiary(ctx,s[1],Number(u.searchParams.get('version')));
 else if(s[0]==='images'&&s.length===1&&request.method==='GET')result=await space.listPhotos(ctx);
 else if(isImage)result=await space.uploadPhoto(ctx,s[1],await boundedBytes(request,4*1024*1024));
 else if(s[0]==='images'&&s.length===2&&request.method==='GET')return new Response(new Uint8Array(await space.readPhoto(ctx,s[1])),{headers:{...headers,'Content-Type':'image/webp'}});
 else if(s[0]==='images'&&s.length===2&&request.method==='DELETE')result=await space.deletePhoto(ctx,s[1]);
 else if(s[0]==='art'&&s.length===1&&request.method==='GET')result=await space.listArt(ctx,u.searchParams.get('cursor')||'');
 else if(s[0]==='art'&&s.length===2&&request.method==='GET')return new Response(new Uint8Array(await space.ownArt(ctx,s[1])),{headers:{...headers,'Content-Type':'image/webp'}});
 else throw new ApiError(404,'꾸미기 기능을 찾을 수 없어요.');return NextResponse.json(result,{headers});
 }catch(e){const known=e instanceof ApiError||e instanceof SpaceError;if(!known)console.error('[my-space]',e instanceof Error?e.message:'Unknown');return NextResponse.json({error:known?e.message:'잠시 후 다시 시도해 주세요.',code:e instanceof ApiError?e.code:'SPACE_ERROR'},{status:known?e.status:500,headers});}}
export const GET=handle,POST=handle,PUT=handle,DELETE=handle;
