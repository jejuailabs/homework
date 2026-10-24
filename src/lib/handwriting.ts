export const HANDWRITING_TEXT_LIMIT=3000;
export type HandwritingStatus='ok'|'no_text'|'unreadable'|'too_much_text';
export type HandwritingResult={status:HandwritingStatus;original:string;corrected:string;uncertainties:string[]};
export type HandwritingDiff={type:'equal'|'remove'|'add';text:string};

/** Compare actual strings locally; correction markup never comes from model-generated HTML. */
export function handwritingDiff(original:string,corrected:string):HandwritingDiff[]{
  const graphemes=(text:string)=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(part=>part.segment):Array.from(text);
  const a=graphemes(original),b=graphemes(corrected);let prefix=0,suffix=0;
  while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
  while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
  const left=a.slice(prefix,a.length-suffix),right=b.slice(prefix,b.length-suffix),result:HandwritingDiff[]=[];
  const emit=(type:HandwritingDiff['type'],text:string)=>{if(!text)return;const last=result.at(-1);if(last?.type===type)last.text+=text;else result.push({type,text});};
  emit('equal',a.slice(0,prefix).join(''));
  if((left.length+1)*(right.length+1)>1_000_000){emit('remove',left.join(''));emit('add',right.join(''));}
  else{
    const columns=right.length+1,table=new Uint16Array((left.length+1)*columns);
    for(let i=left.length-1;i>=0;i--)for(let j=right.length-1;j>=0;j--)table[i*columns+j]=left[i]===right[j]?1+table[(i+1)*columns+j+1]:Math.max(table[(i+1)*columns+j],table[i*columns+j+1]);
    let i=0,j=0;while(i<left.length||j<right.length){if(i<left.length&&j<right.length&&left[i]===right[j]){emit('equal',left[i++]);j++;}else if(i<left.length&&(j===right.length||table[(i+1)*columns+j]>=table[i*columns+j+1]))emit('remove',left[i++]);else emit('add',right[j++]);}
  }
  emit('equal',suffix?a.slice(a.length-suffix).join(''):'');return result;
}

export function handwritingDownload(result:Pick<HandwritingResult,'original'|'corrected'|'uncertainties'>){
  return ['교정본',result.corrected,'','읽어낸 원문',result.original,...(result.uncertainties.length?['','확인이 필요한 부분',...result.uncertainties.map((text,index)=>`${index+1}. ${text}`)]:[])].join('\n');
}
