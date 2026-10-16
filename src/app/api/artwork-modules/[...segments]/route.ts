import {NextResponse} from 'next/server';
import {ApiError} from '@/lib/server/policy';
import {exhibitionModuleTarget,moduleInstalled} from '@/modules/artwork-extensions/exhibition-adapter';
import {consumeModuleRate,digest,moduleOrigin} from '@/modules/artwork-extensions/server-utils';
export const runtime='nodejs',dynamic='force-dynamic',maxDuration=60;
const features={voice:()=>import('@/modules/voice-caption/server').then(m=>m.voiceCaption),guestbook:()=>import('@/modules/warm-guestbook/server').then(m=>m.guestbook)};
async function handle(request:Request,{params}:{params:Promise<{segments:string[]}>}){
 try{const [kind,container,targetId,module,...rest]=(await params).segments;if(kind!=='exhibition'||!container||!targetId||!Object.hasOwn(features,module)||!moduleInstalled(module))throw new ApiError(404,'이 기능을 찾을 수 없어요.');if(request.method!=='GET')moduleOrigin(request);
  const {target,cookie}=await exhibitionModuleTarget(request,container,targetId);
  if(target.publicView&&request.method!=='GET')await consumeModuleRate([{key:'visitor-ip:'+digest(request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown'),limit:30,windowMs:3600000}]);
  const handler=await features[module as keyof typeof features](),result=await handler(request,target,rest),response=result instanceof Response?result:NextResponse.json(result);response.headers.set('Cache-Control','private,no-store');if(cookie&&request.method!=='GET')response.headers.append('Set-Cookie',cookie);return response;
 }catch(error){return NextResponse.json({error:error instanceof ApiError?error.message:'잠시 후 다시 시도해 주세요.',code:error instanceof ApiError?error.code:'MODULE_FAILED'},{status:error instanceof ApiError?error.status:500,headers:{'Cache-Control':'private,no-store'}});}
}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
