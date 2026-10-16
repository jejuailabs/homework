import 'server-only';
import {NextResponse} from 'next/server';
import {db} from './admin';
import {assertOrigin, requireTeacher} from './auth';
import {ApiError} from './policy';
import {readBoundedJson} from './ai-policy';
import {normalizeToolPreferences, toolIds} from '../tool-catalog';

export async function toolPreferences(request: Request) {
  try {
    if(request.method!=='GET') assertOrigin(request);
    const ctx=await requireTeacher(request), ref=db().doc(`toolPreferences/${ctx.uid}`);
    if(request.method==='PUT') {
      const input=await readBoundedJson(request,12_000);
      if(!input || typeof input!=='object' || Array.isArray(input)) throw new ApiError(400,'설정을 확인해 주세요.');
      const preferences=normalizeToolPreferences(input);
      await ref.set({...preferences,updatedAt:new Date().toISOString()});
      return NextResponse.json({preferences},{headers:{'Cache-Control':'private, no-store'}});
    }
    const disabled=(process.env.TOOLS_DISABLED??'').split(',').map(id=>id.trim()).filter(id=>toolIds.includes(id));
    return NextResponse.json({uid:ctx.uid,preferences:normalizeToolPreferences((await ref.get()).data()),disabled},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    return NextResponse.json({error:error instanceof ApiError?error.message:'도구 설정을 저장하지 못했어요.',code:error instanceof ApiError?error.code:'INTERNAL_ERROR'},{status:error instanceof ApiError?error.status:500,headers:{'Cache-Control':'no-store'}});
  }
}
