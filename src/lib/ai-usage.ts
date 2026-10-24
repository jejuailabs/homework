export const AI_USAGE_PRICING_DATE='2026-10-24';
export type AiProviderUsage={inputTokens:number|null;cachedInputTokens:number|null;outputTokens:number|null;totalTokens:number|null;audioSeconds:number|null;webSearchCalls:number;serviceTier:string|null;estimatedUsd:number|null;pricingDate:string};
export type AiUsageHints={audioSeconds?:number;serviceTier?:string};
export type AiUsageObserver=(payload:unknown,hints?:AiUsageHints)=>void;
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const amount=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1_000_000_000?value:null;
/** Only usage metadata is retained. Never copy provider messages, image/audio data or user text. */
export function aiProviderUsage(payload:unknown,model:string,hints:AiUsageHints={}):AiProviderUsage{
  const response=record(payload),usage=record(response.usage),details=record(usage.input_tokens_details??usage.prompt_tokens_details);
  const inputTokens=amount(usage.input_tokens??usage.prompt_tokens),outputTokens=amount(usage.output_tokens??usage.completion_tokens),totalTokens=amount(usage.total_tokens)??(inputTokens!==null&&outputTokens!==null?inputTokens+outputTokens:null),cachedInputTokens=amount(details.cached_tokens);
  const audioSeconds=amount(usage.seconds??response.duration??hints.audioSeconds),webSearchCalls=Array.isArray(response.output)?response.output.filter(item=>record(item).type==='web_search_call').length:0,serviceTier=typeof response.service_tier==='string'?response.service_tier:typeof hints.serviceTier==='string'?hints.serviceTier:null;
  let estimatedUsd:number|null=null;
  if(model==='gpt-6-luna'&&inputTokens!==null&&outputTokens!==null){const multiplier=serviceTier==='default'?1:serviceTier==='flex'?.5:serviceTier==='priority'||serviceTier==='fast'?2:null;if(multiplier!==null){const cached=Math.min(inputTokens,cachedInputTokens??0);estimatedUsd=((inputTokens-cached)*.1+cached*.01+outputTokens*.5)/1_000_000*multiplier+webSearchCalls*.01;}}
  if(model==='gpt-transcribe'&&audioSeconds!==null)estimatedUsd=audioSeconds/60*.0045;
  return{inputTokens,cachedInputTokens,outputTokens,totalTokens,audioSeconds,webSearchCalls,serviceTier,estimatedUsd,pricingDate:AI_USAGE_PRICING_DATE};
}
export type AiUsageJob={actorUid:string;classId?:string;tool?:string;model?:string;status:string;createdAt:string;usage?:AiProviderUsage;durationMs?:number|null};
export type AiUsageMetrics={requests:number;done:number;failed:number;running:number;measuredCalls:number;pricedCalls:number;inputTokens:number;outputTokens:number;totalTokens:number;audioSeconds:number;webSearchCalls:number;estimatedUsd:number};
export const emptyAiUsage=():AiUsageMetrics=>({requests:0,done:0,failed:0,running:0,measuredCalls:0,pricedCalls:0,inputTokens:0,outputTokens:0,totalTokens:0,audioSeconds:0,webSearchCalls:0,estimatedUsd:0});
export function summarizeAiUsage(jobs:AiUsageJob[]){
  const total=emptyAiUsage(),teachers=new Map<string,AiUsageMetrics>(),classes=new Map<string,AiUsageMetrics&{teacherUid:string}>(),tools=new Map<string,AiUsageMetrics>();
  const add=(metrics:AiUsageMetrics,job:AiUsageJob)=>{metrics.requests++;if(job.status==='done')metrics.done++;else if(job.status==='failed')metrics.failed++;else metrics.running++;const usage=job.usage;if(!usage)return;if(amount(usage.inputTokens)!==null&&amount(usage.outputTokens)!==null)metrics.measuredCalls++;metrics.inputTokens+=amount(usage.inputTokens)??0;metrics.outputTokens+=amount(usage.outputTokens)??0;metrics.totalTokens+=amount(usage.totalTokens)??0;metrics.audioSeconds+=amount(usage.audioSeconds)??0;metrics.webSearchCalls+=amount(usage.webSearchCalls)??0;if(amount(usage.estimatedUsd)!==null){metrics.pricedCalls++;metrics.estimatedUsd+=usage.estimatedUsd!;}};
  for(const job of jobs){add(total,job);const uid=job.actorUid||'unknown',teacher=teachers.get(uid)||emptyAiUsage();add(teacher,job);teachers.set(uid,teacher);const key=uid+':'+(job.classId||''),cls=classes.get(key)||{...emptyAiUsage(),teacherUid:uid};add(cls,job);classes.set(key,cls);const tool=job.tool||'unknown',feature=tools.get(tool)||emptyAiUsage();add(feature,job);tools.set(tool,feature);}
  const sort=(a:{requests:number},b:{requests:number})=>b.requests-a.requests;
  return{total,teachers:[...teachers].map(([uid,metrics])=>({uid,...metrics})).sort(sort),classes:[...classes].map(([key,metrics])=>({classId:key.slice(key.indexOf(':')+1),...metrics})).sort(sort),tools:[...tools].map(([tool,metrics])=>({tool,...metrics})).sort(sort)};
}
export function aiUsagePeriod(from:string|null,to:string|null,now=new Date()){
  const today=new Date(now.getTime()+9*3600_000).toISOString().slice(0,10),start=from||today,end=to||today;
  const parse=(day:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('INVALID_DATE');const time=Date.parse(day+'T00:00:00+09:00');if(!Number.isFinite(time)||new Date(time+9*3600_000).toISOString().slice(0,10)!==day)throw Error('INVALID_DATE');return time;};
  const begin=parse(start),finish=parse(end)+86_400_000;if(finish<=begin||finish-begin>31*86_400_000)throw Error('INVALID_DATE_RANGE');return{from:start,to:end,start:new Date(begin).toISOString(),end:new Date(finish).toISOString()};
}
export const aiFeatureName=(tool:string)=>({handwriting:'사진 글 정리',resource:'수업자료',adapt:'수준 맞추기',feedback:'피드백',notice:'안내문',conference:'상담 준비',notes:'관찰·회의 기록','tool-plan':'도구 AI 보조',report:'수업 리포트',neighborhood:'우리 동네 탐험','artwork-author':'작가명 읽기','voice-caption':'음성 설명 텍스트 변환'} as Record<string,string>)[tool]||tool;
