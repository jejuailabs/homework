import 'server-only';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {assertOrigin,requireTeacher} from './auth';
import {runMeteredAi} from './ai';
import {ApiError} from './policy';
import {AiError,completedAiText,providerFailure,readBoundedJson} from './ai-policy';
import {HANDWRITING_IMAGE_LIMIT,HANDWRITING_MODEL,handwritingInput,handwritingRequest,handwritingResult} from './handwriting-policy';

export async function organizeHandwriting(request:Request){
  assertOrigin(request);const context=await requireTeacher(request);
  // This feature's paid scope is enabled separately after the owner's informed approval.
  if(process.env.HANDWRITING_AI_ENABLED!=='true')throw new ApiError(503,'사진 글 정리 연결을 준비하고 있어요. 잠시 후 다시 확인해 주세요.','HANDWRITING_NOT_ENABLED');
  if(!process.env.OPENAI_API_KEY?.trim())throw new AiError(503,'AI 연결 설정을 확인해 주세요.','AI_NOT_CONFIGURED');
  const input=handwritingInput(await readBoundedJson(request,HANDWRITING_IMAGE_LIMIT+1000)),buffer=Buffer.from(input.image.split(',')[1],'base64');
  let image='';try{const source=sharp(buffer,{limitInputPixels:16_000_000}).rotate().flatten({background:'#ffffff'}).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true});for(const quality of [88,80,70,60]){image='data:image/jpeg;base64,'+(await source.clone().jpeg({quality}).toBuffer()).toString('base64');if(image.length<=HANDWRITING_IMAGE_LIMIT)break;}}catch{throw new ApiError(400,'사진 파일을 읽지 못했어요. JPG·PNG·WebP 사진으로 다시 선택해 주세요.','HANDWRITING_INPUT_INVALID');}
  if(image.length>HANDWRITING_IMAGE_LIMIT)throw new ApiError(413,'사진의 글 부분만 가까이 찍어 다시 선택해 주세요.','BODY_TOO_LARGE');
  const fingerprint=createHash('sha256').update(JSON.stringify(['handwriting-v1',input.locale,image])).digest('hex');
  return runMeteredAi(context.uid,'handwriting',HANDWRITING_MODEL,fingerprint,async()=>{
    const signal=AbortSignal.timeout(90_000);
    try{
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(handwritingRequest(image,input.locale)),signal,cache:'no-store'});
      if(!response.ok){await response.body?.cancel();throw providerFailure(response.status);}
      return{...handwritingResult(completedAiText(await readBoundedJson(response,256*1024))),model:HANDWRITING_MODEL};
    }catch(error){if(error instanceof ApiError)throw error;if(signal.aborted)throw new AiError(504,'사진 정리가 늦어지고 있어요. 잠시 뒤 다시 시도해 주세요.','AI_TIMEOUT');throw new AiError(503,'사진을 정리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.','AI_UNAVAILABLE');}
  });
}
