import {ApiError} from './policy';
import type {ClassReportSnapshot,LessonRecord,ReportStudent} from '../lesson-report-types';
type Row={id:string;[key:string]:unknown};
export function reportPeriod(from:unknown,to:unknown) {
  const valid=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
  if(!valid(from)||!valid(to)||String(from)>String(to))throw new ApiError(400,'보고서 시작일과 종료일을 확인해 주세요.','REPORT_PERIOD');
  return {from:String(from),to:String(to)};
}
export function seoulDay(value:unknown) {const time=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(time)?new Date(time+9*3_600_000).toISOString().slice(0,10):'';}
const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:0;
const label=(v:unknown)=>typeof v==='string'?v:'';
const ids=(v:unknown)=>Array.isArray(v)?[...new Set(v.filter((x):x is string=>typeof x==='string'))]:[];
export function summarizeClassReport(input:{classId:string;className:string;ownerUid:string;from:string;to:string;capturedAt:string;roster:Row[];assignments:Row[];submissions:Row[];cards:Row[];progress:Row[];boards:Row[];exhibitions:Row[];lessons:LessonRecord[]}) {
  const period=reportPeriod(input.from,input.to),within=(day:string)=>!!day&&day>=period.from&&day<=period.to;
  const scoped=(rows:Row[])=>rows.filter(r=>r.classId===input.classId&&r.ownerUid===input.ownerUid&&within(seoulDay(r.createdAt)));
  const students:ReportStudent[]=input.roster.map(r=>({id:r.id,name:label(r.name),number:count(r.number),active:!r.disabled,assignments:0,submitted:0,done:0,revision:0,cardSessions:0,cardAttempts:0,latestScores:[],points:count(r.points)})).sort((a,b)=>a.number-b.number);
  const studentById=new Map(students.map(s=>[s.id,s]));
  const assignmentRows=scoped(input.assignments),cardRows=scoped(input.cards);
  const submissions=new Map(input.submissions.filter(s=>s.classId===input.classId&&s.id===`${s.assignmentId}_${s.studentId}`).map(s=>[s.id,s]));
  const assignments=assignmentRows.map(a=>{const targets=ids(a.targetStudentIds);const out={id:a.id,title:label(a.title),targetCount:targets.length,pending:0,submitted:0,done:0,revision:0};for(const studentId of targets){const status=submissions.get(`${a.id}_${studentId}`)?.status;const key=status==='submitted'||status==='done'||status==='revision'?status:'pending';out[key]++;const student=studentById.get(studentId);if(student){student.assignments++;if(key!=='pending')student[key]++;}}return out;});
  const progress=new Map(input.progress.filter(p=>p.classId===input.classId&&p.ownerUid===input.ownerUid&&p.id===`${p.distributionId}_${p.studentId}`).map(p=>[p.id,p]));
  const cards=cardRows.map(c=>{const targets=ids(c.targetStudentIds);let attempts=0;for(const studentId of targets){const state=progress.get(`${c.id}_${studentId}`);if(!state)continue;const n=count(state.submittedAttempts);attempts+=n;const student=studentById.get(studentId);if(student){student.cardSessions++;student.cardAttempts+=n;if(typeof state.latestScore==='number'&&state.latestScore>=0&&state.latestScore<=100)student.latestScores.push(state.latestScore);}}return {id:c.id,title:label(c.title),targetCount:targets.length,attempts};});
  const boards=scoped(input.boards).map(b=>({id:b.id,title:label(b.title),postCount:count(b.postCount)}));
  const exhibitions=scoped(input.exhibitions).map(e=>({id:e.id,title:label(e.title),artworkCount:count(e.artworkCount)}));
  const lessons=input.lessons.filter(l=>l.classId===input.classId&&within(l.date)).sort((a,b)=>a.date.localeCompare(b.date));
  const sum=(key:'targetCount'|'pending'|'submitted'|'done'|'revision')=>assignments.reduce((n,a)=>n+a[key],0);
  return {classId:input.classId,className:input.className,...period,capturedAt:input.capturedAt,scope:'created-in-period-current-status' as const,assignments,students,cards,boards,exhibitions,lessons,metrics:{students:students.filter(s=>s.active).length,assignments:assignments.length,targets:sum('targetCount'),pending:sum('pending'),submitted:sum('submitted'),done:sum('done'),revision:sum('revision'),cardSets:cards.length,cardAttempts:cards.reduce((n,c)=>n+c.attempts,0),boards:boards.length,boardPosts:boards.reduce((n,b)=>n+b.postCount,0),exhibitions:exhibitions.length,artworks:exhibitions.reduce((n,e)=>n+e.artworkCount,0),lessons:lessons.length}} satisfies Omit<ClassReportSnapshot,'id'|'title'|'version'|'previousId'|'teacherNotes'|'narrative'|'createdAt'>;
}
