import assert from 'node:assert/strict';
import test from 'node:test';
import {aiProviderUsage,aiUsageHour,aiUsageHourRows,aiUsagePeriod,aiUsageTeacher,summarizeAiUsage,summarizeAiUsageHours,summarizeTeacherTokens} from './ai-usage';
test('AI usage retains only metering metadata and prices cached input plus actual search calls',()=>{
  const usage=aiProviderUsage({usage:{input_tokens:10000,output_tokens:1000,total_tokens:11000,input_tokens_details:{cached_tokens:2000}},service_tier:'default',output:[{type:'web_search_call'},{type:'web_search_call'},{type:'message',content:'PRIVATE TEXT'}],image:'PRIVATE PHOTO'},'gpt-6-luna');
  assert.equal(usage.inputTokens,10000);assert.equal(usage.cachedInputTokens,2000);assert.equal(usage.webSearchCalls,2);assert(Math.abs(usage.estimatedUsd!-.02132)<1e-10);assert(!JSON.stringify(usage).includes('PRIVATE'));
});
test('missing usage and unregistered pricing are unknown, never false zero costs',()=>{
  for(const payload of [{},{usage:{input_tokens:-1,output_tokens:4}},{usage:{input_tokens:10,output_tokens:20},service_tier:'unrecognized'}])assert.equal(aiProviderUsage(payload,'gpt-6-luna').estimatedUsd,null);
  assert.equal(aiProviderUsage({usage:{input_tokens:1,output_tokens:2},service_tier:'default'},'unknown-model').estimatedUsd,null);
  const voice=aiProviderUsage({text:'PRIVATE CAPTION'},'gpt-transcribe',{audioSeconds:60});assert.equal(voice.estimatedUsd,.0045);assert.equal(voice.inputTokens,null);assert(!JSON.stringify(voice).includes('PRIVATE'));
  assert.equal(aiProviderUsage({text:'x',duration:30},'whisper-1').estimatedUsd,.003);
});
test('pricing honors actual processing tier and separates incomplete requests from zero-token requests',()=>{
  const payload={usage:{input_tokens:1000,output_tokens:1000},service_tier:'default'},standard=aiProviderUsage(payload,'gpt-6-luna').estimatedUsd!;assert.equal(aiProviderUsage({...payload,service_tier:'priority'},'gpt-6-luna').estimatedUsd,standard*2);assert.equal(aiProviderUsage({...payload,service_tier:'flex'},'gpt-6-luna').estimatedUsd,standard*.5);
  const zero=aiProviderUsage({usage:{input_tokens:0,output_tokens:0},service_tier:'default'},'gpt-6-luna');assert.equal(zero.estimatedUsd,0);
});
test('whole-site and per-teacher/class summaries include failed paid calls and preserve unknown legacy usage',()=>{
  const usage=aiProviderUsage({usage:{input_tokens:1000,output_tokens:1000},service_tier:'default'},'gpt-6-luna'),jobs=[{actorUid:'teacherA',classId:'class1',tool:'handwriting',status:'done',createdAt:'2026-10-24',usage},{actorUid:'teacherA',classId:'class2',tool:'resource',status:'failed',createdAt:'2026-10-24',usage},{actorUid:'teacherA',status:'done',createdAt:'2026-10-24'},{actorUid:'teacherB',status:'running',createdAt:'2026-10-24'}];
  const result=summarizeAiUsage(jobs);assert.equal(result.total.requests,4);assert.equal(result.total.pricedCalls,2);assert.equal(result.total.failed,1);assert.equal(result.total.running,1);assert.equal(result.total.inputTokens,2000);assert.equal(result.total.estimatedUsd,usage.estimatedUsd!*2);assert.equal(result.teachers[0].requests,3);assert.equal(result.classes.filter(row=>row.classId==='').length,2);assert.equal(result.classes.find(row=>row.classId==='class1')?.requests,1);assert.equal(result.tools.find(row=>row.tool==='handwriting')?.requests,1);
});
test('usage dates use inclusive Korean calendar days and reject invalid or unbounded periods',()=>{
  assert.deepEqual(aiUsagePeriod(null,null,new Date('2026-10-23T16:00:00Z')),{from:'2026-10-24',to:'2026-10-24',start:'2026-10-23T15:00:00.000Z',end:'2026-10-24T15:00:00.000Z'});
  assert.equal(aiUsagePeriod('2026-10-01','2026-10-31').to,'2026-10-31');for(const dates of [['2026-10-01','2026-11-01'],['2026-10-31','2026-10-01'],['2026-02-30','2026-03-01'],['bad','2026-10-24']])assert.throws(()=>aiUsagePeriod(dates[0],dates[1]));
});
test('teacher token view splits each teacher by feature and token kind',()=>{
  const gpt=aiProviderUsage({usage:{input_tokens:5000,output_tokens:800,total_tokens:5800,input_tokens_details:{cached_tokens:1000}},service_tier:'default'},'gpt-6-luna'),audio=aiProviderUsage({duration:90},'gpt-transcribe');
  const rows=summarizeTeacherTokens([{actorUid:'a',tool:'resource',status:'done',createdAt:'2026-11-04',usage:gpt},{actorUid:'a',tool:'resource',status:'done',createdAt:'2026-11-04',usage:gpt},{actorUid:'a',tool:'speech-transcribe',status:'done',createdAt:'2026-11-04',usage:audio},{actorUid:'b',tool:'speech-voice',status:'done',createdAt:'2026-11-04'}]);
  assert.deepEqual(rows.map(row=>row.uid),['a','b']);
  assert.equal(rows[0].inputTokens,10000);assert.equal(rows[0].cachedInputTokens,2000);assert.equal(rows[0].outputTokens,1600);assert.equal(rows[0].audioSeconds,90);
  assert.deepEqual(rows[0].tools.map(row=>row.tool),['resource','speech-transcribe']);
  assert.equal(rows[0].tools[0].requests,2);
  // Calls the provider does not meter still count as requests.
  assert.equal(rows[1].requests,1);assert.equal(rows[1].measuredCalls,0);
});

test('a student call counts for the class teacher; classless and unknown classes stay with the caller',()=>{
  const owners=new Map([['class1','teacherA']]);
  assert.equal(aiUsageTeacher('student1','class1',owners),'teacherA');
  assert.equal(aiUsageTeacher('teacherB','',owners),'teacherB');
  assert.equal(aiUsageTeacher('student2','gone',owners),'student2');
});
test('free dictionary APIs are a known zero cost',()=>{
  assert.equal(aiProviderUsage({},'krdict-search').estimatedUsd,0);assert.equal(aiProviderUsage({},'stdict-view').estimatedUsd,0);assert.equal(aiProviderUsage({},'some-other-api').estimatedUsd,null);
});
test('voice characters and free reuse are totalled per teacher, class, feature and Korean-time hour',()=>{
  const usage=aiProviderUsage({},'google-tts-neural2',{characters:1000}),jobs=[{actorUid:'teacherA',classId:'class1',tool:'tts-cards',model:'google-tts-neural2',status:'done',createdAt:'2026-11-09T01:30:00.000Z',usage}];
  const hits=[{uid:'teacherA',classId:'class1',tool:'tts-cards',model:'google-tts-neural2',hour:'2026-11-09T10',hits:3,characters:300},{uid:'teacherA',classId:'',tool:'tts-speech',model:'google-tts-neural2',hour:'2026-11-09T11',hits:1,characters:50}];
  assert.equal(aiUsageHour('2026-11-09T15:30:00.000Z'),'2026-11-10T00');
  const summary=summarizeAiUsage(jobs,hits);
  assert.equal(summary.total.requests,1,'a free reuse is not an outside call');assert.equal(summary.total.characters,1000);assert.equal(summary.total.reusedRequests,4);assert.equal(summary.total.reusedCharacters,350);assert.equal(summary.teachers[0].reusedCharacters,350);
  assert.equal(summary.tools.find(row=>row.tool==='tts-speech')?.reusedRequests,1);assert.equal(summary.classes.find(row=>row.classId==='class1')?.characters,1000);
  const hours=summarizeAiUsageHours(jobs,hits);
  assert.deepEqual(hours.map(row=>row.hour),['2026-11-09T11','2026-11-09T10']);assert.equal(hours[1].requests,1);assert.equal(hours[1].characters,1000);assert.equal(hours[1].reusedRequests,3);assert.ok(Math.abs(hours[1].estimatedUsd-.016)<1e-9);
  const rows=aiUsageHourRows(jobs,hits);
  assert.equal(rows.length,2);assert.equal(rows[1].uid,'teacherA');assert.equal(rows[1].tool,'tts-cards');assert.equal(rows[1].model,'google-tts-neural2');assert.equal(rows[1].reusedCharacters,300);
});
