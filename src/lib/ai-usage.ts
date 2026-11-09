export const AI_USAGE_PRICING_DATE='2026-10-24';
export type AiProviderUsage={inputTokens:number|null;cachedInputTokens:number|null;outputTokens:number|null;totalTokens:number|null;audioSeconds:number|null;characters?:number|null;webSearchCalls:number;serviceTier:string|null;estimatedUsd:number|null;pricingDate:string};
export type AiUsageHints={audioSeconds?:number;serviceTier?:string;characters?:number};
/** Google Cloud Text-to-Speech, USD per 1M input characters (list price checked 2026-11-08). Cache hits are never metered. */
export const TTS_USD_PER_MILLION_CHARS:Record<string,number>={'google-tts-chirp3-hd':30,'google-tts-neural2':16};
/** National Institute of Korean Language APIs have no per-call charge; a known zero, not an unknown cost. */
export const FREE_API_MODELS=new Set(['krdict-search','krdict-view','stdict-search','stdict-view']);
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
  if(model==='whisper-1'&&audioSeconds!==null)estimatedUsd=audioSeconds/60*.006;
  if(FREE_API_MODELS.has(model))estimatedUsd=0;
  const characters=amount(hints.characters);
  if(Object.hasOwn(TTS_USD_PER_MILLION_CHARS,model)&&characters!==null)estimatedUsd=characters/1_000_000*TTS_USD_PER_MILLION_CHARS[model];
  return{inputTokens,cachedInputTokens,outputTokens,totalTokens,audioSeconds,...(characters!==null?{characters}:{}),webSearchCalls,serviceTier,estimatedUsd,pricingDate:AI_USAGE_PRICING_DATE};
}
export type AiUsageJob={actorUid:string;classId?:string;tool?:string;model?:string;status:string;createdAt:string;usage?:AiProviderUsage;durationMs?:number|null};
/** Free replays of stored audio, counted per person and Korean-time hour (`aiUsageHits`). */
export type AiUsageHit={uid:string;classId?:string;tool?:string;model?:string;hour:string;hits:number;characters:number};
export type AiUsageMetrics={requests:number;done:number;failed:number;running:number;measuredCalls:number;pricedCalls:number;inputTokens:number;cachedInputTokens:number;outputTokens:number;totalTokens:number;audioSeconds:number;characters:number;reusedRequests:number;reusedCharacters:number;webSearchCalls:number;estimatedUsd:number};
export const emptyAiUsage=():AiUsageMetrics=>({requests:0,done:0,failed:0,running:0,measuredCalls:0,pricedCalls:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,totalTokens:0,audioSeconds:0,characters:0,reusedRequests:0,reusedCharacters:0,webSearchCalls:0,estimatedUsd:0});
const add=(metrics:AiUsageMetrics,job:AiUsageJob)=>{metrics.requests++;if(job.status==='done')metrics.done++;else if(job.status==='failed')metrics.failed++;else metrics.running++;const usage=job.usage;if(!usage)return;if(amount(usage.inputTokens)!==null&&amount(usage.outputTokens)!==null)metrics.measuredCalls++;metrics.inputTokens+=amount(usage.inputTokens)??0;metrics.cachedInputTokens+=amount(usage.cachedInputTokens)??0;metrics.outputTokens+=amount(usage.outputTokens)??0;metrics.totalTokens+=amount(usage.totalTokens)??0;metrics.characters+=amount(usage.characters)??0;metrics.audioSeconds+=amount(usage.audioSeconds)??0;metrics.webSearchCalls+=amount(usage.webSearchCalls)??0;if(amount(usage.estimatedUsd)!==null){metrics.pricedCalls++;metrics.estimatedUsd+=usage.estimatedUsd!;}};
const addReuse=(metrics:AiUsageMetrics,hit:AiUsageHit)=>{metrics.reusedRequests+=amount(hit.hits)??0;metrics.reusedCharacters+=amount(hit.characters)??0;};
/** Usage with a class belongs to that class's teacher, so a student's calls land on the teacher who pays for them. */
export const aiUsageTeacher=(actor:string,classId:string|undefined,owners:ReadonlyMap<string,string>)=>(classId&&owners.get(classId))||actor;
/** Korean-time hour, `YYYY-MM-DDTHH`. */
export const aiUsageHour=(value:Date|string)=>new Date(new Date(value).getTime()+9*3600_000).toISOString().slice(0,13);
export function summarizeAiUsage(jobs:AiUsageJob[],hits:AiUsageHit[]=[]){
  const total=emptyAiUsage(),teachers=new Map<string,AiUsageMetrics>(),classes=new Map<string,AiUsageMetrics&{teacherUid:string}>(),tools=new Map<string,AiUsageMetrics>();
  const scopes=(actor:string,classId:string|undefined,toolId:string|undefined)=>{const uid=actor||'unknown',teacher=teachers.get(uid)||emptyAiUsage(),key=uid+':'+(classId||''),cls=classes.get(key)||{...emptyAiUsage(),teacherUid:uid},tool=toolId||'unknown',feature=tools.get(tool)||emptyAiUsage();teachers.set(uid,teacher);classes.set(key,cls);tools.set(tool,feature);return[total,teacher,cls,feature];};
  for(const job of jobs)for(const metrics of scopes(job.actorUid,job.classId,job.tool))add(metrics,job);
  for(const hit of hits)for(const metrics of scopes(hit.uid,hit.classId,hit.tool))addReuse(metrics,hit);
  const sort=(a:{requests:number},b:{requests:number})=>b.requests-a.requests;
  return{total,teachers:[...teachers].map(([uid,metrics])=>({uid,...metrics})).sort(sort),classes:[...classes].map(([key,metrics])=>({classId:key.slice(key.indexOf(':')+1),...metrics})).sort(sort),tools:[...tools].map(([tool,metrics])=>({tool,...metrics})).sort(sort)};
}
/** Totals per Korean-time hour that had any use, newest first. */
export function summarizeAiUsageHours(jobs:AiUsageJob[],hits:AiUsageHit[]=[]){
  const hours=new Map<string,AiUsageMetrics>(),row=(hour:string)=>{const metrics=hours.get(hour)||emptyAiUsage();hours.set(hour,metrics);return metrics;};
  for(const job of jobs)add(row(aiUsageHour(job.createdAt)),job);
  for(const hit of hits)addReuse(row(hit.hour),hit);
  return[...hours].map(([hour,metrics])=>({hour,...metrics})).sort((a,b)=>b.hour.localeCompare(a.hour));
}
/** One row per hour, teacher, feature and model: the raw table for working out cost elsewhere. */
export function aiUsageHourRows(jobs:AiUsageJob[],hits:AiUsageHit[]=[]){
  const rows=new Map<string,AiUsageMetrics&{hour:string;uid:string;tool:string;model:string}>(),row=(hour:string,actor:string,toolId:string|undefined,modelId:string|undefined)=>{const uid=actor||'unknown',tool=toolId||'unknown',model=modelId||'',key=[hour,uid,tool,model].join('|'),found=rows.get(key)||{...emptyAiUsage(),hour,uid,tool,model};rows.set(key,found);return found;};
  for(const job of jobs)add(row(aiUsageHour(job.createdAt),job.actorUid,job.tool,job.model),job);
  for(const hit of hits)addReuse(row(hit.hour,hit.uid,hit.tool,hit.model),hit);
  return[...rows.values()].sort((a,b)=>b.hour.localeCompare(a.hour)||a.uid.localeCompare(b.uid)||a.tool.localeCompare(b.tool));
}
export function aiUsagePeriod(from:string|null,to:string|null,now=new Date()){
  const today=new Date(now.getTime()+9*3600_000).toISOString().slice(0,10),start=from||today,end=to||today;
  const parse=(day:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('INVALID_DATE');const time=Date.parse(day+'T00:00:00+09:00');if(!Number.isFinite(time)||new Date(time+9*3600_000).toISOString().slice(0,10)!==day)throw Error('INVALID_DATE');return time;};
  const begin=parse(start),finish=parse(end)+86_400_000;if(finish<=begin||finish-begin>31*86_400_000)throw Error('INVALID_DATE_RANGE');return{from:start,to:end,start:new Date(begin).toISOString(),end:new Date(finish).toISOString()};
}
export const aiFeatureName=(tool:string)=>({handwriting:'사진 글 정리',resource:'수업자료',adapt:'수준 맞추기',feedback:'피드백',notice:'안내문',conference:'상담 준비',notes:'관찰·회의 기록','tool-plan':'도구 AI 보조',report:'수업 리포트',neighborhood:'우리 동네 탐험','artwork-author':'작가명 읽기','voice-caption':'음성 설명 텍스트 변환','speech-transcribe':'말하기 전사','speech-feedback':'말하기 피드백','speech-voice':'동화 읽어주기 음성','speech-page-text':'동화 페이지 글 읽기','tts':'원어민 읽어주기 음성','tts-cards':'클래스카드 읽어주기','tts-speech':'말하기·동화 읽어주기','tts-dictionary':'국어사전 읽어주기','dictionary-search':'국어사전 검색','dictionary-explain':'국어사전 해설 조회','dictionary-easy':'국어사전 쉬운 해설'} as Record<string,string>)[tool]||tool;
/** Per-teacher token totals with the same totals split by feature, largest token use first. */
export function summarizeTeacherTokens(jobs:AiUsageJob[]){
  const teachers=new Map<string,{total:AiUsageJob[];tools:Map<string,AiUsageJob[]>}>();
  for(const job of jobs){const uid=job.actorUid||'unknown',entry=teachers.get(uid)||{total:[] as AiUsageJob[],tools:new Map<string,AiUsageJob[]>()};entry.total.push(job);const tool=job.tool||'unknown';entry.tools.set(tool,[...(entry.tools.get(tool)||[]),job]);teachers.set(uid,entry);}
  const weight=(row:AiUsageMetrics)=>row.totalTokens||row.audioSeconds||row.characters||row.requests/1e6;
  return [...teachers].map(([uid,entry])=>({uid,...summarizeAiUsage(entry.total).total,tools:[...entry.tools].map(([tool,list])=>({tool,...summarizeAiUsage(list).total})).sort((a,b)=>weight(b)-weight(a))})).sort((a,b)=>weight(b)-weight(a));
}
