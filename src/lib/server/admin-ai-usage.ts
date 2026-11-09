import 'server-only';
import {db} from './admin';
import {ApiError,id} from './policy';
import {aiUsageHourRows,aiUsagePeriod,aiUsageTeacher,summarizeAiUsage,summarizeAiUsageHours,summarizeTeacherTokens,type AiUsageHit,type AiUsageJob} from '../ai-usage';
const cache=new Map<string,{expires:number;jobs:AiUsageJob[];hits:AiUsageHit[];partial:boolean;checkedAt:string}>();
const LIMIT=50_000;
const teacherLabel=(uid:string,names:Map<string,string>)=>uid==='tts-pregenerate'?'사전 생성(관리자)':uid==='unknown'?'교사 미확인':names.get(uid)||'계정 확인 필요';
async function classOwners(ids:(string|undefined)[]){const unique=[...new Set(ids.filter((value):value is string=>Boolean(value)))],owners=new Map<string,string>();for(let offset=0;offset<unique.length;offset+=100){const docs=await db().getAll(...unique.slice(offset,offset+100).map(key=>db().doc('classes/'+id(key))),{fieldMask:['ownerUid']});for(const doc of docs)if(doc.data()?.ownerUid)owners.set(doc.id,doc.data()!.ownerUid);}return owners;}
async function labels(ids:string[],collection:string){const unique=[...new Set(ids.filter(Boolean))],result=new Map<string,string>();for(let offset=0;offset<unique.length;offset+=100){const docs=await db().getAll(...unique.slice(offset,offset+100).map(key=>db().doc(collection+'/'+id(key))));for(const doc of docs)result.set(doc.id,doc.data()?.displayName||doc.data()?.name||doc.data()?.email||'삭제된 항목');}return result;}
function usagePeriod(params:URLSearchParams){try{return aiUsagePeriod(params.get('from'),params.get('to'));}catch{throw new ApiError(400,'조회 기간은 올바른 날짜로 최대 31일을 선택해 주세요.','AI_USAGE_PERIOD');}}
async function periodJobs(period:ReturnType<typeof aiUsagePeriod>){
  const key=period.start+':'+period.end;let saved=cache.get(key);
  if(!saved||saved.expires<Date.now()){
    const snapshot=await db().collection('aiJobs').where('createdAt','>=',period.start).where('createdAt','<',period.end).orderBy('createdAt','desc').select('actorUid','classId','tool','model','status','createdAt','usage','durationMs').limit(LIMIT+1).get();
    const reuse=await db().collection('aiUsageHits').where('hour','>=',period.from+'T00').where('hour','<=',period.to+'T23').orderBy('hour','desc').limit(LIMIT+1).get();
    const jobs=snapshot.docs.slice(0,LIMIT).map(doc=>doc.data() as AiUsageJob),hits=reuse.docs.slice(0,LIMIT).map(doc=>doc.data() as AiUsageHit),owners=await classOwners([...jobs,...hits].map(row=>row.classId));
    // Every report reads these rows, so a student's use counts toward their teacher everywhere.
    saved={expires:Date.now()+30_000,jobs:jobs.map(job=>({...job,actorUid:aiUsageTeacher(job.actorUid,job.classId,owners)})),hits:hits.map(hit=>({...hit,uid:aiUsageTeacher(hit.uid,hit.classId,owners)})),partial:snapshot.size>LIMIT||reuse.size>LIMIT,checkedAt:new Date().toISOString()};if(cache.size>=2)cache.delete(cache.keys().next().value!);cache.set(key,saved);
  }
  return saved;
}
/** Teachers' token use by kind (input, cached input, output, audio, web search), each split by feature. */
export async function adminAiTokens(params:URLSearchParams){
  const period=usagePeriod(params),saved=await periodJobs(period),rows=summarizeTeacherTokens(saved.jobs),names=await labels(rows.map(row=>row.uid),'users');
  return{...period,checkedAt:saved.checkedAt,partial:saved.partial,total:summarizeAiUsage(saved.jobs).total,teachers:rows.map(row=>({...row,name:teacherLabel(row.uid,names)})),meteringSince:'2026-10-24',limitsNote:process.env.AI_REQUEST_LIMITS==='on'?'교사별·전체 요청 한도가 켜져 있어요.':'교사별·전체 요청 한도 없음(무제한). 사용량만 집계합니다.'};
}
async function usageSelection(params:URLSearchParams){
  const period=usagePeriod(params);
  const teacher=params.get('teacher')||'',classId=params.get('classId')||'';if(teacher)id(teacher);if(classId)id(classId);
  if(classId){const cls=await db().doc('classes/'+classId).get();if(!cls.exists||teacher&&cls.data()?.ownerUid!==teacher)throw new ApiError(400,'교사와 학급 선택을 확인해 주세요.');}
  const saved=await periodJobs(period);
  const selected=saved.jobs.filter(job=>(!teacher||job.actorUid===teacher)&&(!classId||job.classId===classId)),selectedHits=saved.hits.filter(hit=>(!teacher||hit.uid===teacher)&&(!classId||hit.classId===classId));
  return{period,saved,teacher,classId,selected,selectedHits};
}
/** Hour × teacher × feature × model, for the cost CSV. */
export async function adminAiUsageHourly(params:URLSearchParams){
  const{period,saved,selected,selectedHits}=await usageSelection(params),rows=aiUsageHourRows(selected,selectedHits),names=await labels(rows.map(row=>row.uid),'users');
  return{...period,partial:saved.partial,rows:rows.map(row=>({...row,name:teacherLabel(row.uid,names)}))};
}
export async function adminAiUsage(params:URLSearchParams){
  const{period,saved,teacher,classId,selected,selectedHits}=await usageSelection(params),global=summarizeAiUsage(saved.jobs,saved.hits),summary=summarizeAiUsage(selected,selectedHits),[teachers,classes]=await Promise.all([labels(summary.teachers.map(row=>row.uid),'users'),labels(summary.classes.map(row=>row.classId),'classes')]);
  return{...period,checkedAt:saved.checkedAt,partial:saved.partial,global:global.total,total:summary.total,teachers:summary.teachers.map(row=>({...row,name:teacherLabel(row.uid,teachers)})),classes:summary.classes.map(row=>({...row,name:row.classId?classes.get(row.classId)||'삭제된 학급':'학급 미지정',teacherName:teacherLabel(row.teacherUid,teachers)})),tools:summary.tools,hours:summarizeAiUsageHours(selected,selectedHits),scope:{teacher,classId},meteringSince:'2026-10-24',limitsNote:(process.env.AI_REQUEST_LIMITS==='on'?'기존 AI 일일 호출 한도를 공유합니다.':'AI 요청 한도 없음(무제한).')+' 캐시 재사용은 외부 API 호출에 포함하지 않습니다. 재사용 음성은 이번 배포 이후부터 따로 세며, 같은 기기에 보관된 음성을 다시 트는 경우는 세지 않습니다.',costNote:'OpenAI 응답, Google 음성 글자 수와 확인된 단가에 따른 USD 추정액입니다. 실제 청구액이 아니며 세금·환율·Firebase·Vercel은 포함하지 않습니다. 단가 또는 사용량이 없는 요청은 미집계로 표시합니다.'};
}
