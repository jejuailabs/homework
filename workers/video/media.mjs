import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';

export class MediaError extends Error {constructor(code,retryable=false){super(code);this.code=code;this.retryable=retryable;}}
export function command(binary,args,timeout=900000){
 return new Promise((resolve,reject)=>{const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']}),chunks=[];let bytes=0,errBytes=0,stderr='';
 const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new MediaError('VIDEO_PROCESSING_TIMEOUT',true));},timeout);
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes<2*1024*1024)chunks.push(chunk);});
 child.stderr.on('data',chunk=>{errBytes+=chunk.length;if(errBytes<65536)stderr+=chunk;});
 child.once('error',()=>{clearTimeout(timer);reject(new MediaError('VIDEO_PROCESSOR_UNAVAILABLE',true));});
 child.once('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(chunks).toString()):reject(new MediaError('VIDEO_ENCODE_FAILED',true));});
 });
}
const rate=value=>{const parts=String(value||'0').split('/').map(Number);return parts.length===2&&parts[1]?parts[0]/parts[1]:parts[0];};
export function mediaPlan(info){
 const video=info.streams?.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic),audio=info.streams?.find(s=>s.codec_type==='audio');
 const duration=Math.max(Number(info.format?.duration||0),Number(video?.duration||0),Number(audio?.duration||0));
 if(!video||!Number.isFinite(duration)||duration<=0)throw new MediaError('VIDEO_INVALID');
 if(duration>180)throw new MediaError('VIDEO_DURATION');
 if(!/^(mov|mp4|m4a|3gp|3g2|mj2|matroska|webm)(,|$)/.test(info.format?.format_name||''))throw new MediaError('VIDEO_INVALID');
 if(!(video.width>0&&video.height>0)||video.width*video.height>40000000)throw new MediaError('VIDEO_RESOLUTION');
 const sar=rate(String(video.sample_aspect_ratio||'1:1').replace(':','/'))||1;
 let width=video.width*sar,height=video.height;
 const rotation=Number(video.side_data_list?.find(s=>s.rotation!==undefined)?.rotation||video.tags?.rotate||0);
 if(Math.abs(rotation)%180===90)[width,height]=[height,width];
 const scale=Math.min(1,(width>=height?1280:720)/width,(width>=height?720:1280)/height);
 const fps=rate(video.avg_frame_rate)>0?rate(video.avg_frame_rate):rate(video.r_frame_rate);
 if(!Number.isFinite(fps)||fps<=0||fps>1000)throw new MediaError('VIDEO_INVALID');
 return {width:Math.max(2,Math.floor(width*scale/2)*2),height:Math.max(2,Math.floor(height*scale/2)*2),duration,fps:Math.min(30,fps),reduceFps:fps>30||rate(video.r_frame_rate)>30,audio:!!audio,videoIndex:video.index||0,...(audio?{audioIndex:audio.index??1}: {})};
}
export async function probe(path){try{const info=JSON.parse(await command(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',path],45000));if(!Number.isFinite(Number(info.format?.duration))||Number(info.format?.duration)<=0){const csv=await command(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-protocol_whitelist','file,pipe','-read_intervals','%+181','-show_entries','packet=pts_time,duration_time','-of','csv=p=0',path],45000);let start=Infinity,end=-Infinity;for(const row of csv.trim().split('\n')){const [pts,length]=row.split(',').map(Number);if(Number.isFinite(pts)){start=Math.min(start,pts);end=Math.max(end,pts+(Number.isFinite(length)?length:0));}}info.format={...info.format,duration:end-start};}return info;}catch(e){if(e.code==='VIDEO_PROCESSOR_UNAVAILABLE')throw e;throw new MediaError('VIDEO_INVALID');}}
export function encodingArgs(input,output,plan){
 const filter=`scale=${plan.width}:${plan.height}:flags=lanczos,setsar=1${plan.reduceFps?`,fps=${plan.fps}`:''}`;
 return ['-hide_banner','-loglevel','error','-nostdin','-y','-xerror','-protocol_whitelist','file,pipe','-i',input,'-map',`0:${plan.videoIndex}`,...(plan.audio?['-map',`0:${plan.audioIndex}`]:[]),'-map_metadata','-1','-map_chapters','-1','-sn','-dn','-vf',filter,'-c:v','libx264','-preset','veryfast','-b:v','1000k','-maxrate','1100k','-bufsize','2200k','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','64k','-ac','2','-movflags','+faststart',output];
}
export function validateOutput(info,plan){
 const v=info.streams?.find(s=>s.codec_type==='video'),a=info.streams?.find(s=>s.codec_type==='audio');
 if(v?.codec_name!=='h264'||(plan.audio&&a?.codec_name!=='aac')||v.width!==plan.width||v.height!==plan.height||Math.max(rate(v.avg_frame_rate),rate(v.r_frame_rate))>30.01||Number(info.format?.duration)>180.1||Math.abs(Number(info.format?.duration)-plan.duration)>.3)throw new MediaError('VIDEO_VERIFY_FAILED',true);
}
export async function hashFile(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
export async function encode(input,output,thumbnail,stage=async()=>{}){
 await stage('inspect');const plan=mediaPlan(await probe(input));
 await stage('encode');await command(process.env.FFMPEG_PATH||'ffmpeg',encodingArgs(input,output,plan));
 await stage('verify');validateOutput(await probe(output),plan);
 await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-nostdin','-xerror','-protocol_whitelist','file,pipe','-i',output,'-f','null','-']);
 await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-nostdin','-y','-protocol_whitelist','file,pipe','-i',output,'-frames:v','1','-vf','scale=360:360:force_original_aspect_ratio=decrease','-q:v','3',thumbnail],45000);
 return plan;
}
