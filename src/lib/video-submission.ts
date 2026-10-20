export const VIDEO_MAX_SECONDS = 180;
export const VIDEO_MAX_BYTES = 250 * 1024 ** 2;
export type VideoJobView = {
  id:string; assignmentId:string; status:'queued'|'processing'|'failed'|'complete';
  stage:string; createdAt:string; startedAt?:string; updatedAt:string; finishedAt?:string;
  errorCode?:string; retryable:boolean; retryVersion:number;
};
export function videoSelectionError(files: {type:string;size:number}[], duration?:number) {
  if(files.length!==1)return 'VIDEO_COUNT';
  if(!['video/mp4','video/webm','video/quicktime'].includes(files[0].type))return 'FILE_TYPE';
  if(files[0].size<=0||files[0].size>VIDEO_MAX_BYTES)return 'FILE_SIZE';
  if(duration!==undefined&&(!Number.isFinite(duration)||duration<=0||duration>VIDEO_MAX_SECONDS))return 'VIDEO_DURATION';
  return null;
}
export function videoJobDelayed(job:VideoJobView,now=Date.now()) {
  return ['queued','processing'].includes(job.status)&&(now-Date.parse(job.updatedAt)>120000||now-Date.parse(job.createdAt)>5*60000);
}
