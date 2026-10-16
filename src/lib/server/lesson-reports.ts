import 'server-only';
import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db} from './admin';
import {assertOrigin,requireTeacher,type Context} from './auth';
import {ApiError,id,text} from './policy';
import {readBoundedJson} from './ai-policy';
import {generateTeacherDraft} from './ai';
import {reportPeriod,seoulDay,summarizeClassReport} from './lesson-report-policy';
import {toolIds} from '../tool-catalog';
import type {ClassReportSnapshot,LessonRecord} from '../lesson-report-types';
type Data=Record<string,any>;
const stamp=()=>new Date().toISOString();
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const rows=(s:FirebaseFirestore.QuerySnapshot)=>s.docs.map(d=>({...d.data(),id:d.id}));
const reportRef=(ctx:Context,key:string)=>db().doc(`teacherReports/${hash(ctx.uid+':'+id(key))}`);
async function ownClass(ctx:Context,classId:string){const s=await db().doc(`classes/${id(classId)}`).get();if(!s.exists||s.data()!.ownerUid!==ctx.uid)throw new ApiError(404,'학급을 찾을 수 없어요.','NOT_FOUND');return s;}
async function body(request:Request):Promise<Data>{const data=await readBoundedJson(request,90_000);if(!data||typeof data!=='object'||Array.isArray(data))throw new ApiError(400,'입력을 확인해 주세요.');return data as Data;}
function summary(row:Data){return {id:row.id,title:row.title,from:row.from,to:row.to,capturedAt:row.capturedAt,createdAt:row.createdAt,version:row.version};}
async function saved(ctx:Context,reportId:string){const s=await db().doc(`teacherReports/${id(reportId)}`).get();if(!s.exists||s.data()!.ownerUid!==ctx.uid)throw new ApiError(404,'보고서를 찾을 수 없어요.','NOT_FOUND');await ownClass(ctx,s.data()!.classId);return {...s.data(),id:s.id} as ClassReportSnapshot&{ownerUid:string};}
async function capture(ctx:Context,input:Data){const classId=id(input.classId),period=reportPeriod(input.from,input.to);await ownClass(ctx,classId);const ref=reportRef(ctx,input.requestId);const existing=await ref.get();if(existing.exists){if(existing.data()!.classId!==classId)throw new ApiError(409,'새 요청으로 다시 저장해 주세요.');return {...existing.data(),id:ref.id};}
  const title=text(input.title,'보고서 이름',120),teacherNotes=text(input.teacherNotes??'','교사 기록',8000,true);
  const result=await db().runTransaction(async tx=>{
    const cls=await tx.get(db().doc(`classes/${classId}`));if(!cls.exists||cls.data()!.ownerUid!==ctx.uid)throw new ApiError(404,'학급을 찾을 수 없어요.','NOT_FOUND');
    const queries=[db().collection(`classes/${classId}/students`).select('name','number','disabled','points'),
      db().collection('assignments').where('classId','==',classId).select('ownerUid','classId','title','createdAt','targetStudentIds'),
      db().collection('submissions').where('classId','==',classId).select('classId','assignmentId','studentId','status'),
      db().collection('cardClassSets').where('classId','==',classId).select('ownerUid','classId','title','createdAt','targetStudentIds'),
      db().collection('cardProgress').where('classId','==',classId).select('ownerUid','classId','distributionId','studentId','attempts','submittedAttempts','activeAttemptId','lastSubmittedAttemptId','latestScore'),
      db().collection('participationBoards').where('classId','==',classId).select('ownerUid','classId','title','createdAt','postCount'),
      db().collection('exhibitions').where('classId','==',classId).select('ownerUid','classId','title','createdAt','artworkCount'),
      db().collection('lessonRecords').where('classId','==',classId)];
    const snapshots=await Promise.all(queries.map(q=>tx.get(q.limit(5001))));
    if(snapshots.some(s=>s.size>5000))throw new ApiError(413,'학급 자료가 많아 보고서 집계 범위를 확장해야 해요. 관리자에게 알려 주세요.','REPORT_TOO_LARGE');
    const [roster,assignments,submissions,cards,progress,boards,exhibitions,lessons]=snapshots.map(rows);
    const selectedCards=new Map(cards.filter((c:Data)=>c.ownerUid===ctx.uid&&seoulDay(c.createdAt)>=period.from&&seoulDay(c.createdAt)<=period.to).map((c:Data)=>[c.id,c]));
    const selectedStates=progress.filter((p:Data)=>p.ownerUid===ctx.uid&&p.id===`${p.distributionId}_${p.studentId}`&&selectedCards.get(p.distributionId)?.targetStudentIds?.includes(p.studentId));
    // Count submitted test records, never infer completed tests from attempts started.
    for(let offset=0;offset<selectedStates.length;offset+=30){await Promise.all(selectedStates.slice(offset,offset+30).map(async(p:Data)=>{const tests=await tx.get(db().collection(`cardProgress/${p.id}/tests`).where('status','==','submitted').select('status').limit(501));if(tests.size>500)throw new ApiError(413,'테스트 기록이 많아 집계 범위를 확장해야 해요.','REPORT_TOO_LARGE');p.submittedAttempts=tests.size;}));}
    return summarizeClassReport({classId,className:cls.data()!.name,ownerUid:ctx.uid,...period,capturedAt:cls.readTime.toDate().toISOString(),roster,assignments,submissions,cards,progress,boards,exhibitions,lessons:lessons.filter((l:Data)=>l.ownerUid===ctx.uid).map(({ownerUid,...l}:Data)=>l as LessonRecord)});
  },{readOnly:true});
  const record={...result,title,teacherNotes,narrative:'',version:1,previousId:null,createdAt:stamp(),ownerUid:ctx.uid};
  if(Buffer.byteLength(JSON.stringify(record))>800_000)throw new ApiError(413,'보고서에 포함된 자료가 너무 많아요. 기간을 줄여 주세요.','REPORT_TOO_LARGE');
  await db().runTransaction(async tx=>{const existing=await tx.get(ref);if(existing.exists){if(existing.data()!.classId!==classId)throw new ApiError(409,'새 요청으로 다시 저장해 주세요.');return;}tx.create(ref,record);});return {...(await ref.get()).data(),id:ref.id};
}
export async function lessonReports(request:Request,segments:string[]=[]){try{if(request.method!=='GET')assertOrigin(request);const ctx=await requireTeacher(request);
  if(!segments.length&&request.method==='GET'){const classId=id(new URL(request.url).searchParams.get('classId'));await ownClass(ctx,classId);const result=await db().collection('teacherReports').where('classId','==',classId).select('ownerUid','title','from','to','capturedAt','createdAt','version').get();return json({reports:rows(result).filter((r:Data)=>r.ownerUid===ctx.uid).sort((a:Data,b:Data)=>b.createdAt.localeCompare(a.createdAt)).map(summary)});}
  if(!segments.length&&request.method==='POST')return json({report:await capture(ctx,await body(request))},201);
  if(segments.length===1&&request.method==='GET'){const {ownerUid,...report}=await saved(ctx,segments[0]);return json({report});}
  if(segments.length===2&&request.method==='POST'){const report=await saved(ctx,segments[0]),input=await body(request);
    if(segments[1]==='narrative'){const source=JSON.stringify({className:report.className,from:report.from,to:report.to,capturedAt:report.capturedAt,scope:report.scope,metrics:report.metrics,lessonGoals:report.lessons.map(l=>({date:l.date,title:l.title,objective:l.objective})),teacherNotes:report.teacherNotes});if(source.length>16000)throw new ApiError(413,'수업 기록을 줄여 AI 설명을 만들어 주세요.');return json(await generateTeacherDraft(ctx.uid,{tool:'report',source,grade:'',locale:input.locale==='en'?'en':'ko'}));}
    if(segments[1]==='version'){const ref=reportRef(ctx,input.requestId),{id:oldId,...original}=report;const record={...original,previousId:oldId,version:report.version+1,createdAt:stamp(),teacherNotes:text(input.teacherNotes??report.teacherNotes,'교사 기록',8000,true),narrative:text(input.narrative??report.narrative,'보고서 설명',20000,true)};await db().runTransaction(async tx=>{const previous=await tx.get(ref);if(previous.exists){if(previous.data()!.previousId!==oldId)throw new ApiError(409,'새 요청으로 저장해 주세요.');return;}tx.create(ref,record);});const {ownerUid,...value}=(await ref.get()).data()!;return json({report:{...value,id:ref.id}},201);}
  }
  throw new ApiError(404,'요청을 찾을 수 없어요.','NOT_FOUND');
}catch(e){return json({error:e instanceof ApiError?e.message:'보고서를 처리하지 못했어요.',code:e instanceof ApiError?e.code:'INTERNAL_ERROR'},e instanceof ApiError?e.status:500);}}
export async function lessons(request:Request){try{if(request.method!=='GET')assertOrigin(request);const ctx=await requireTeacher(request),input=request.method==='GET'?null:await body(request);const classId=id(input?.classId??new URL(request.url).searchParams.get('classId'));await ownClass(ctx,classId);
  if(request.method==='GET'){const result=await db().collection('lessonRecords').where('classId','==',classId).get();const kinds={assignment:'assignments',cards:'cardClassSets',board:'participationBoards',exhibition:'exhibitions'};const resources=(await Promise.all(Object.entries(kinds).map(async([kind,collection])=>{const s=await db().collection(collection).where('classId','==',classId).select('ownerUid','title').limit(1000).get();return rows(s).filter((r:Data)=>r.ownerUid===ctx.uid).map((r:Data)=>({kind,id:r.id,title:r.title}));}))).flat();return json({lessons:rows(result).filter((r:Data)=>r.ownerUid===ctx.uid).map(({ownerUid,...r}:Data)=>r).sort((a:Data,b:Data)=>b.date.localeCompare(a.date)),resources});}
  const date=reportPeriod(input!.date,input!.date).from,ref=db().doc(`lessonRecords/${hash(ctx.uid+':'+id(input!.requestId))}`);
  const selectedTools=Array.isArray(input!.toolIds)?[...new Set(input!.toolIds.filter((t:unknown)=>typeof t==='string'&&toolIds.includes(t)))].slice(0,34):[];
  const links:LessonRecord['links']=[];const collections={assignment:'assignments',cards:'cardClassSets',board:'participationBoards',exhibition:'exhibitions'};
  if(Array.isArray(input!.links)){if(input!.links.length>20)throw new ApiError(400,'연결 자료는 20개까지 선택해 주세요.');for(const link of input!.links){if(!link||typeof link.kind!=='string'||!Object.hasOwn(collections,link.kind))throw new ApiError(400,'연결 자료를 확인해 주세요.');const kind=link.kind as keyof typeof collections;const resource=await db().doc(`${collections[kind]}/${id(link.id)}`).get();if(!resource.exists||resource.data()!.ownerUid!==ctx.uid||resource.data()!.classId!==classId)throw new ApiError(403,'우리 반 자료만 연결할 수 있어요.');links.push({kind,id:resource.id,title:resource.data()!.title});}}
  const record={classId,ownerUid:ctx.uid,date,title:text(input!.title,'수업 이름',120),subject:text(input!.subject??'','교과',60,true),unit:text(input!.unit??'','단원',120,true),objective:text(input!.objective??'','수업 목표',1000,true),notes:text(input!.notes??'','수업 기록',6000,true),toolIds:selectedTools,links,createdAt:stamp()};
  await db().runTransaction(async tx=>{const current=await tx.get(ref);if(current.exists){if(current.data()!.classId!==classId)throw new ApiError(409,'새 요청으로 기록해 주세요.');return;}tx.create(ref,record);});const {ownerUid,...lesson}=(await ref.get()).data()!;return json({lesson:{...lesson,id:ref.id}},201);
}catch(e){return json({error:e instanceof ApiError?e.message:'수업 기록을 처리하지 못했어요.',code:e instanceof ApiError?e.code:'INTERNAL_ERROR'},e instanceof ApiError?e.status:500);}}
