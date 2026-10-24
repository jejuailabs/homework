import assert from 'node:assert/strict';
import test from 'node:test';
import {aiProviderUsage,aiUsagePeriod,summarizeAiUsage} from './ai-usage';
test('AI usage retains only metering metadata and prices cached input plus actual search calls',()=>{
  const usage=aiProviderUsage({usage:{input_tokens:10000,output_tokens:1000,total_tokens:11000,input_tokens_details:{cached_tokens:2000}},service_tier:'default',output:[{type:'web_search_call'},{type:'web_search_call'},{type:'message',content:'PRIVATE TEXT'}],image:'PRIVATE PHOTO'},'gpt-6-luna');
  assert.equal(usage.inputTokens,10000);assert.equal(usage.cachedInputTokens,2000);assert.equal(usage.webSearchCalls,2);assert(Math.abs(usage.estimatedUsd!-.02132)<1e-10);assert(!JSON.stringify(usage).includes('PRIVATE'));
});
test('missing usage and unregistered pricing are unknown, never false zero costs',()=>{
  for(const payload of [{},{usage:{input_tokens:-1,output_tokens:4}},{usage:{input_tokens:10,output_tokens:20},service_tier:'unrecognized'}])assert.equal(aiProviderUsage(payload,'gpt-6-luna').estimatedUsd,null);
  assert.equal(aiProviderUsage({usage:{input_tokens:1,output_tokens:2},service_tier:'default'},'unknown-model').estimatedUsd,null);
  const voice=aiProviderUsage({text:'PRIVATE CAPTION'},'gpt-transcribe',{audioSeconds:60});assert.equal(voice.estimatedUsd,.0045);assert.equal(voice.inputTokens,null);assert(!JSON.stringify(voice).includes('PRIVATE'));
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
