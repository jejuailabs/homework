import sharp from 'sharp';
import {ApiError} from './policy';
import {HANDWRITING_IMAGE_LIMIT} from './handwriting-policy';

/** Decode and normalize untrusted pixels; prefer lossless output within the existing limit. */
export async function handwritingImage(image:string){
  try{
    const buffer=Buffer.from(image.split(',')[1],'base64'),source=sharp(buffer,{limitInputPixels:16_000_000,failOn:'warning'}),metadata=await source.metadata();
    if(!['jpeg','png'].includes(metadata.format||'')||!image.startsWith(`data:image/${metadata.format};base64,`))throw Error('FORMAT_MISMATCH');
    const normalized=source.rotate().flatten({background:'#ffffff'}).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true});
    const encode=(buffer:Buffer,type:string)=>`data:image/${type};base64,${buffer.toString('base64')}`;
    const png=encode(await normalized.clone().png({compressionLevel:6}).toBuffer(),'png');
    if(png.length<=HANDWRITING_IMAGE_LIMIT)return png;
    for(const quality of[88,80,70,60]){const jpeg=encode(await normalized.clone().jpeg({quality}).toBuffer(),'jpeg');if(jpeg.length<=HANDWRITING_IMAGE_LIMIT)return jpeg;}
  }catch{throw new ApiError(400,'사진 파일을 읽지 못했어요. JPG·PNG·WebP 사진으로 다시 선택해 주세요.','HANDWRITING_INPUT_INVALID');}
  throw new ApiError(413,'사진의 글 부분만 가까이 찍어 다시 선택해 주세요.','BODY_TOO_LARGE');
}
