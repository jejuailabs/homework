import {FieldValue} from 'firebase-admin/firestore';
import {db} from '@/lib/server/admin';
import {assertOrigin, getContext} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {cleanUsageCounters} from '@/lib/usage-events';
export const runtime='nodejs',dynamic='force-dynamic';

/** Pilot usage counters: one merged write per page flush, keyed by day and class (students) or teacher. */
export async function POST(request:Request){
  try{
    assertOrigin(request);
    const ctx=await getContext(request);
    const counters=cleanUsageCounters((await request.json().catch(()=>null))?.counters);
    const entries=Object.entries(counters);
    if(!entries.length)return new Response(null,{status:204});
    const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
    const scope=ctx.role==='student'&&ctx.classId?{kind:'class',id:ctx.classId}:{kind:'teacher',id:ctx.uid};
    await db().doc(`usageDaily/${date}_${scope.kind}_${scope.id}`).set({date,scope:scope.kind,scopeId:scope.id,updatedAt:new Date().toISOString(),counters:Object.fromEntries(entries.map(([key,value])=>[key,FieldValue.increment(value!)]))},{merge:true});
    return new Response(null,{status:204});
  }catch(error){return new Response(null,{status:error instanceof ApiError?error.status:503});}
}
