import 'server-only';
import {db} from './admin';
import {ApiError,id} from './policy';
import {aiUsagePeriod,summarizeAiUsage,type AiUsageJob} from '../ai-usage';
const cache=new Map<string,{expires:number;jobs:AiUsageJob[];partial:boolean;checkedAt:string}>();
async function labels(ids:string[],collection:string){const unique=[...new Set(ids.filter(Boolean))],result=new Map<string,string>();for(let offset=0;offset<unique.length;offset+=100){const docs=await db().getAll(...unique.slice(offset,offset+100).map(key=>db().doc(collection+'/'+id(key))));for(const doc of docs)result.set(doc.id,doc.data()?.displayName||doc.data()?.name||doc.data()?.email||'삭제된 항목');}return result;}
export async function adminAiUsage(params:URLSearchParams){
  let period:ReturnType<typeof aiUsagePeriod>;try{period=aiUsagePeriod(params.get('from'),params.get('to'));}catch{throw new ApiError(400,'조회 기간은 올바른 날짜로 최대 31일을 선택해 주세요.','AI_USAGE_PERIOD');}
  const teacher=params.get('teacher')||'',classId=params.get('classId')||'';if(teacher)id(teacher);if(classId)id(classId);
  if(classId){const cls=await db().doc('classes/'+classId).get();if(!cls.exists||teacher&&cls.data()?.ownerUid!==teacher)throw new ApiError(400,'교사와 학급 선택을 확인해 주세요.');}
  const key=period.start+':'+period.end;let saved=cache.get(key);
  if(!saved||saved.expires<Date.now()){
    const snapshot=await db().collection('aiJobs').where('createdAt','>=',period.start).where('createdAt','<',period.end).orderBy('createdAt','desc').select('actorUid','classId','tool','model','status','createdAt','usage','durationMs').limit(50_001).get();
    saved={expires:Date.now()+30_000,jobs:snapshot.docs.slice(0,50_000).map(doc=>doc.data() as AiUsageJob),partial:snapshot.size>50_000,checkedAt:new Date().toISOString()};if(cache.size>=2)cache.delete(cache.keys().next().value!);cache.set(key,saved);
  }
  const selected=saved.jobs.filter(job=>(!teacher||job.actorUid===teacher)&&(!classId||job.classId===classId)),global=summarizeAiUsage(saved.jobs),summary=summarizeAiUsage(selected),[teachers,classes]=await Promise.all([labels(summary.teachers.map(row=>row.uid),'users'),labels(summary.classes.map(row=>row.classId),'classes')]);
  return{...period,checkedAt:saved.checkedAt,partial:saved.partial,global:global.total,total:summary.total,teachers:summary.teachers.map(row=>({...row,name:teachers.get(row.uid)||'계정 확인 필요'})),classes:summary.classes.map(row=>({...row,name:row.classId?classes.get(row.classId)||'삭제된 학급':'학급 미지정',teacherName:teachers.get(row.teacherUid)||'계정 확인 필요'})),tools:summary.tools,scope:{teacher,classId},meteringSince:'2026-10-24',limitsNote:'기존 AI 일일 호출 한도를 공유합니다. 캐시 재사용은 외부 API 호출에 포함하지 않습니다.',costNote:'OpenAI 응답과 확인된 단가에 따른 USD 추정액입니다. 실제 청구액이 아니며 세금·환율·Firebase·Vercel은 포함하지 않습니다. 단가 또는 사용량이 없는 요청은 미집계로 표시합니다.'};
}
