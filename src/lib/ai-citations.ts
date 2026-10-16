export type AiCitation = {url:string; title:string};
export function safeSourceUrl(value: unknown): string | null {
  if(typeof value!=='string'||value.length>2048)return null;
  try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
// Provider annotations, not model-invented URLs, supply the inline citation links.
export function citedAiOutput(payload: unknown, fallback: string): {text:string;sources:AiCitation[]} {
  const output=(payload as {output?:unknown[]})?.output;
  if(!Array.isArray(output))return {text:fallback,sources:[]};
  const sources:AiCitation[]=[],parts:string[]=[];
  for(const item of output as {type?:string;content?:{type?:string;text?:string;annotations?:{type?:string;url?:string;title?:string;start_index?:number;end_index?:number}[]}[]}[]) {
    if(item.type!=='message'||!Array.isArray(item.content))continue;
    for(const content of item.content) {
      if(content.type!=='output_text'||typeof content.text!=='string')continue;
      let text=content.text;
      const annotations=(content.annotations??[]).filter(a=>a.type==='url_citation'&&safeSourceUrl(a.url)).sort((a,b)=>(b.start_index??-1)-(a.start_index??-1));
      for(const a of annotations) {
        const url=safeSourceUrl(a.url)!;
        const title=String(a.title||new URL(url).hostname).replace(/[\[\]\r\n]/g,' ').slice(0,180);
        if(!sources.some(source=>source.url===url))sources.push({url,title});
        const start=a.start_index,end=a.end_index;
        if(Number.isInteger(start)&&Number.isInteger(end)&&start!>=0&&end!>=start!&&end!<=content.text.length) text=text.slice(0,start)+` [${title}](${url}) `+text.slice(end);
      }
      parts.push(text);
    }
  }
  return {text:parts.join('\n\n').trim()||fallback,sources};
}
