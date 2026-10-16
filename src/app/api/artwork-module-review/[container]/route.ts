import {NextResponse} from 'next/server';
import {requireTeacher} from '@/lib/server/auth';import {db} from '@/lib/server/admin';import {ApiError,id} from '@/lib/server/policy';
import {effectiveOptions} from '@/modules/artwork-extensions/exhibition-adapter';
import {pendingArtworkModules} from '@/modules/artwork-extensions/review-server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{container:string}>}){try{const ctx=await requireTeacher(request),container=id((await params).container),room=await db().doc('exhibitions/'+container).get();if(!room.exists||room.data()?.ownerUid!==ctx.uid)throw new ApiError(404,'전시실을 찾을 수 없어요.');const options=effectiveOptions(room.data()?.artworkModules),entries=await pendingArtworkModules('exhibition:'+container,{voice:options.voice.enabled,guestbook:options.guestbook.enabled});return NextResponse.json({entries},{headers:{'Cache-Control':'private,no-store'}});}catch(e){return NextResponse.json({error:e instanceof ApiError?e.message:'검토 목록을 열지 못했어요.'},{status:e instanceof ApiError?e.status:500,headers:{'Cache-Control':'private,no-store'}});}}
