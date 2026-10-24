import {NextResponse} from 'next/server';
import {organizeHandwriting} from '@/lib/server/handwriting';
import {ApiError} from '@/lib/server/policy';
import {AiError} from '@/lib/server/ai-policy';
export const runtime='nodejs',dynamic='force-dynamic',maxDuration=120;
export async function POST(request:Request){
  const headers:Record<string,string>={'Cache-Control':'no-store'};
  try{return NextResponse.json(await organizeHandwriting(request),{headers});}
  catch(error){if(error instanceof AiError&&error.retryAfter)headers['Retry-After']=String(error.retryAfter);if(error instanceof ApiError)return NextResponse.json({error:error.message,code:error.code},{status:error.status,headers});console.error('Handwriting processing failed','INTERNAL_ERROR');return NextResponse.json({error:'사진을 정리하지 못했어요. 다시 시도해 주세요.',code:'INTERNAL_ERROR'},{status:500,headers});}
}
