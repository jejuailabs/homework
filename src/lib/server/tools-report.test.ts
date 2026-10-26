import assert from 'node:assert/strict';
import test from 'node:test';
import {reportPeriod,seoulDay,summarizeClassReport} from './lesson-report-policy';
import {normalizeToolPreferences,toolCatalog} from '../tool-catalog';
import {citedAiOutput,safeSourceUrl} from '../ai-citations';

test('module registry has unique IDs and preferences cannot inject routes',()=>{
 assert.equal(new Set(toolCatalog.map(t=>t.id)).size,toolCatalog.length);
 const value=normalizeToolPreferences({favorites:['timer','timer','../../admin','matching'],hidden:['clock','unknown'],recent:Array(20).fill('draw')});
 assert.deepEqual(value,{favorites:['timer','matching'],hidden:['clock'],recent:['draw']});
 assert.deepEqual(normalizeToolPreferences({favorites:[]}).favorites,[]);
});
test('report validates calendar dates and uses Seoul calendar boundaries',()=>{
 for(const dates of [['2026-02-30','2026-03-01'],['no','2026-03-01'],['2026-13-01','2026-12-01'],['2026-10-02','2026-10-01']])assert.throws(()=>reportPeriod(...dates as [string,string]));
 assert.equal(seoulDay('2026-10-13T15:00:00.000Z'),'2026-10-14');
 assert.equal(seoulDay('2026-10-13T14:59:59.000Z'),'2026-10-13');
 assert.deepEqual(reportPeriod('2024-02-29','2024-03-01'),{from:'2024-02-29',to:'2024-03-01'});
});
const base=()=>({classId:'class-a',className:'우리 반',ownerUid:'teacher-a',from:'2026-10-14',to:'2026-10-14',capturedAt:'2026-10-14T10:00:00Z',roster:[{id:'one',name:'하나',number:1},{id:'new',name:'전입',number:2},{id:'old',name:'전출',number:3,disabled:true}],assignments:[],submissions:[],cards:[],progress:[],boards:[],exhibitions:[],lessons:[]});
test('snapshot honors original target roster, period and exact deterministic submission IDs',()=>{
 const task={id:'task',classId:'class-a',ownerUid:'teacher-a',title:'탐구',createdAt:'2026-10-13T15:00:00Z',targetStudentIds:['one','old','old']};
 const result=summarizeClassReport({...base(),assignments:[task,{...task,id:'other-owner',ownerUid:'teacher-b'},{...task,id:'before',createdAt:'2026-10-13T14:59:59Z'}],submissions:[{id:'task_one',classId:'class-a',assignmentId:'task',studentId:'one',status:'done'},{id:'wrong',classId:'class-a',assignmentId:'task',studentId:'old',status:'done'},{id:'task_new',classId:'class-a',assignmentId:'task',studentId:'new',status:'done'}]});
 assert.equal(result.metrics.assignments,1);assert.equal(result.metrics.targets,2);assert.equal(result.metrics.done,1);assert.equal(result.metrics.pending,1);assert.equal(result.metrics.students,2);assert.equal(result.students.find(s=>s.id==='new')!.assignments,0);
});

test('historical reports and student point totals are unchanged when an assignment is hidden or restored',()=>{
 const assignment={id:'task',classId:'class-a',ownerUid:'teacher-a',title:'지난 숙제',createdAt:'2026-10-14T00:00:00Z',targetStudentIds:['one']};
 const input={...base(),roster:[{id:'one',name:'하나',number:1,points:35}],assignments:[assignment],submissions:[{id:'task_one',classId:'class-a',assignmentId:'task',studentId:'one',status:'done'}]};
 const original=summarizeClassReport(input);
 for(const visibility of ['hidden','visible'])assert.deepEqual(summarizeClassReport({...input,assignments:[{...assignment,visibility}]}),original);
 assert.equal(original.metrics.done,1);assert.equal(original.students[0].points,35);
});
test('completed tests count server-measured submissions, not started attempts or outsider states',()=>{
 const result=summarizeClassReport({...base(),cards:[{id:'deck',classId:'class-a',ownerUid:'teacher-a',title:'카드',createdAt:'2026-10-14T00:00:00Z',targetStudentIds:['one']}],progress:[{id:'deck_one',classId:'class-a',ownerUid:'teacher-a',distributionId:'deck',studentId:'one',attempts:7,submittedAttempts:2,latestScore:80},{id:'deck_new',classId:'class-a',ownerUid:'teacher-a',distributionId:'deck',studentId:'new',submittedAttempts:5,latestScore:100}]});
 assert.equal(result.metrics.cardAttempts,2);assert.deepEqual(result.students[0].latestScores,[80]);assert.equal(result.students[1].cardAttempts,0);assert.equal(result.scope,'created-in-period-current-status');
});
test('source citation URLs reject script/data URLs and preserve actual provider source links',()=>{
 assert.equal(safeSourceUrl('javascript:alert(1)'),null);assert.equal(safeSourceUrl('https://user:pass@example.test'),null);
 const text='A verified fact. [source]';const value=citedAiOutput({output:[{type:'message',content:[{type:'output_text',text,annotations:[{type:'url_citation',start_index:17,end_index:25,url:'https://www.jeju.go.kr/page',title:'Jeju'}]}]}]},text);
 assert.match(value.text,/\[Jeju\]\(https:\/\/www.jeju.go.kr\/page\)/);assert.equal(value.sources.length,1);
 assert.deepEqual(citedAiOutput({output:[{type:'reasoning',content:[{type:'output_text',text:'secret'}]}]},'visible'),{text:'visible',sources:[]});
});
