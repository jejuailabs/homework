import {createWriteStream} from 'node:fs';import {readFile} from 'node:fs/promises';import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';
import {AwsClient} from 'aws4fetch';

export const R2_VIDEO_PREFIX='r2-videos/';
export const r2VideoPath=(uid,jobId)=>`${R2_VIDEO_PREFIX}${uid}/${jobId}/video.mp4`;

/** Cloudflare R2 over its S3 API, or null until the four R2 settings are present. */
export function r2Store(env=process.env,fetchImpl){
 const {R2_ACCOUNT_ID:account,R2_BUCKET:name,R2_ACCESS_KEY_ID:accessKeyId,R2_SECRET_ACCESS_KEY:secretAccessKey}=env;
 if(!account||!name||!accessKeyId||!secretAccessKey)return null;
 const client=new AwsClient({accessKeyId,secretAccessKey,service:'s3',region:'auto'});
 const url=path=>`https://${account}.r2.cloudflarestorage.com/${name}/${path.split('/').map(encodeURIComponent).join('/')}`;
 const send=async(path,init)=>{const request=await client.sign(url(path),init);return (fetchImpl||fetch)(request);};
 const ok=(response,action)=>{if(!response.ok)throw new Error(`R2_${action}_${response.status}`);return response;};
 return {
  async put(path,file,{contentType,cacheControl}){ok(await send(path,{method:'PUT',body:await readFile(file),headers:{'Content-Type':contentType,'Cache-Control':cacheControl}}),'PUT');},
  async head(path){const response=await send(path,{method:'HEAD'});if(response.status===404)return null;ok(response,'HEAD');return {size:Number(response.headers.get('content-length')),contentType:response.headers.get('content-type'),updated:response.headers.get('last-modified')};},
  async stream(path){return Readable.fromWeb(ok(await send(path,{method:'GET'}),'GET').body);},
  async download(path,destination){await pipeline(await this.stream(path),createWriteStream(destination));},
  async delete(path){const response=await send(path,{method:'DELETE'});if(response.status!==404)ok(response,'DELETE');},
 };
}
