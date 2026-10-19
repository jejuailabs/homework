import {attachmentAssets} from './attachment-assets';

export const attachmentIds = ['head-sprout','head-crown','head-beret','head-party','head-flower','neck-bow','neck-scarf','neck-medal','neck-bandana'] as const;
export type AttachmentId = typeof attachmentIds[number];
type Fit = {width: number; dx: number; dy: number; rotate: number; stretchY?: number};
type Rig = {style: 'ink-watercolor' | 'soft-fur'; x: number; seat: number; neck: number; neckWidth: number; ears: string; earTransform?: string; fits: Record<AttachmentId, Fit>; neckByBody: Record<string, number>};
const fit = (width: number, dx=0, dy=0, rotate=0): Fit => ({width,dx,dy,rotate});
function rig(x:number,seat:number,neck:number,width:number,ears:string,bodyNecks:number[],style:Rig['style'],patch:Partial<Record<AttachmentId,Partial<Fit>>>={}): Rig {
  const defaults: Record<AttachmentId,Fit> = {'head-sprout':fit(21,0,0,-3),'head-crown':fit(33,0,1,-2),'head-beret':fit(39,-1,1,-9),'head-party':fit(23,1,0,-4),'head-flower':fit(17,20,4,12),'neck-bow':fit(style==='soft-fur'?28:30,0,3),'neck-scarf':fit(width,0,-8),'neck-medal':fit(width*.82,0,-7),'neck-bandana':fit(width*.88,0,-8)};
  for(const id of attachmentIds) defaults[id]={...defaults[id],...patch[id]};
  return {style,x,seat,neck,neckWidth:width,ears,fits:defaults,neckByBody:Object.fromEntries(['bare','knit','sailor','apron','raincoat','hoodie','overalls','dino','pajamas'].map((id,n)=>[id,bodyNecks[n]]))};
}
// Coordinates are percentages of the full registered 512px body, including alpha.
// Fits are per character AND item. Clothes override the neck/collar landmark.
export const characterRigs: Record<string,Rig> = {
 'friend-cat':rig(48,24,60,47,'M24 27 L28 20 L39 25 L37 33Z M60 25 L75 20 L79 33 L66 34Z',[60,58,58,57,62,63,61,63,62],'ink-watercolor'),
 'friend-dog':rig(48,21,55,48,'M15 24 Q20 13 34 22 L30 36 L17 40Z M62 21 Q76 16 84 32 L74 42 L65 34Z',[55,53,54,54,59,60,58,60,59],'ink-watercolor',{'head-crown':{width:31},'neck-bow':{width:28}}),
 'friend-hamster':rig(48,24,56,46,'M24 28 Q20 17 30 17 Q39 18 37 30Z M62 27 Q60 16 70 17 Q80 18 75 30Z',[56,54,54,55,59,60,57,59,58],'ink-watercolor',{'head-beret':{width:35},'neck-bow':{width:28}}),
 'friend-alpaca':rig(49,28,63,43,'M29 32 Q20 14 30 12 Q38 13 42 32Z M57 32 Q61 12 71 12 Q78 17 69 34Z',[63,60,61,61,65,66,65,66,65],'ink-watercolor',{'head-beret':{width:34},'head-crown':{width:29},'neck-bow':{width:27}}),
 'friend-rabbit':rig(49,35,68,42,'M30 36 Q20 6 33 7 Q46 7 46 35Z M51 34 Q51 5 65 7 Q79 8 66 39Z',[68,66,66,65,68,68,68,69,68],'ink-watercolor',{'head-crown':{width:27},'head-beret':{width:33},'head-party':{width:20},'head-flower':{dx:19,dy:9},'neck-bow':{width:27}}),
 'friend-otter':rig(48,24,54,39,'M29 27 Q25 19 32 18 Q40 18 39 27Z M63 27 Q63 18 70 20 Q77 23 71 30Z',[54,52,52,53,57,58,57,58,57],'ink-watercolor',{'head-beret':{width:33},'head-crown':{width:29},'neck-bow':{width:25}}),
 'cat-american':rig(48,23,61,46,'M26 27 L29 9 Q35 12 42 24Z M57 24 Q65 10 75 10 L75 31Z',[61,58,59,60,64,65,61,64,63],'soft-fur'),
 'cat-british':rig(48,24,61,47,'M29 28 L31 11 Q38 12 43 26Z M58 25 Q65 14 76 15 L74 31Z',[61,59,59,60,65,66,62,65,64],'soft-fur',{'head-beret':{width:38}}),
 'cat-siamese':rig(48,25,59,42,'M25 29 L25 8 Q35 10 43 26Z M54 25 Q65 9 76 9 L72 32Z',[59,57,57,58,63,65,61,64,62],'soft-fur',{'neck-bow':{width:26},'head-crown':{width:30}}),
 'cat-persian':rig(48,25,66,46,'M29 29 L29 11 Q37 12 43 27Z M57 26 Q65 12 75 14 L74 32Z',[66,64,64,65,67,68,66,68,67],'soft-fur',{'neck-bow':{width:27},'head-beret':{width:36}}),
 'cat-ragdoll':rig(48,24,63,46,'M27 29 L28 10 Q37 11 44 25Z M56 25 Q64 10 76 13 L75 32Z',[63,62,61,62,65,66,63,66,65],'soft-fur'),
 'cat-maine':rig(48,27,66,43,'M25 32 L26 9 Q36 11 43 28Z M56 28 Q65 11 78 9 L75 34Z',[66,64,63,65,67,68,65,68,66],'soft-fur',{'head-beret':{width:35},'head-crown':{width:30},'neck-bow':{width:26}}),
};
// Some existing bag sprites raise the whole face. Register that pose explicitly;
// stripping "-bag" would put hats over the eyes and collars below the chest.
type Pose = {x?:number; seat:number; neck:number};
export const characterPoseOverrides: Record<string,Record<string,Pose>> = {
 'friend-otter': {
  'raincoat-bag':{x:51,seat:14,neck:48},'hoodie-bag':{x:53,seat:13,neck:47},
  'overalls-bag':{x:51,seat:14,neck:47},'dino-bag':{x:51,seat:14,neck:47},'pajamas-bag':{x:51,seat:14,neck:47},
 },
 'friend-hamster': {
  'raincoat-bag':{x:49,seat:18,neck:51},'hoodie-bag':{x:49,seat:16,neck:49},
  'overalls-bag':{x:49,seat:16,neck:49},'dino-bag':{x:49,seat:17,neck:50},'pajamas-bag':{x:49,seat:17,neck:50},
 },
 'friend-alpaca': {
  'raincoat-bag':{seat:25,neck:61},'hoodie-bag':{seat:23,neck:60},
  'overalls-bag':{seat:24,neck:61},'dino-bag':{seat:24,neck:61},'pajamas-bag':{seat:24,neck:61},
 },
};
export function characterRig(pet:string,body='bare'): Rig {
 const base=characterRigs[pet]||characterRigs['friend-cat'],garment=body.replace('-bag',''),pose=characterPoseOverrides[pet]?.[body];
 const seat=pose?.seat??base.seat+(['raincoat','hoodie','overalls','dino','pajamas'].includes(garment)?1:0),x=pose?.x??base.x;
 return {...base,x,seat,neck:pose?.neck??base.neckByBody[garment]??base.neck,earTransform:`translate(${x-base.x} ${seat-base.seat})`};
}
export const headAttachmentRules = {
 'head-sprout':{restoreEarTips:false},'head-crown':{restoreEarTips:true},
 'head-beret':{restoreEarTips:false},'head-party':{restoreEarTips:true},'head-flower':{restoreEarTips:false},
} as const;
export const attachmentRules = {
 'neck-bow':{rear:'fabric-band',front:'knot-and-wings',underBag:false},
 'neck-scarf':{rear:'collar-wrap',front:'draped-end',underBag:false},
 'neck-medal':{rear:'ribbon',front:'pendant',underBag:true},
 'neck-bandana':{rear:'neck-ties',front:'triangle',underBag:true},
} as const;
export function attachmentLayout(pet:string,id:AttachmentId,body='bare') {
 const rig=characterRig(pet,body),asset=attachmentAssets[pet+'/'+id],f=rig.fits[id]||rig.fits['neck-bow'],neck=rig.neck;
 const head=id.startsWith('head-'),seat=rig.seat;
 const ratio=asset?.ratio||1,width=head&&id!=='head-flower'?Math.min(f.width,(seat+f.dy)*ratio/.88):f.width,height=width/ratio*(f.stretchY||1);
 const top=id==='head-flower'?seat+f.dy:head?Math.max(0,seat-height*.88+f.dy):id==='neck-bow'?neck+f.dy-height/2:neck+f.dy;
 return {left:rig.x+f.dx-width/2,top,width,height,rotate:f.rotate,neck,seat,rig,asset};
}
export function chinPath(pet:string,body='bare',lower=false) {
 const r=characterRig(pet,body),neck=r.neck,x=r.x,w=r.neckWidth/2+3,y=neck-9,control=neck+3;
 return lower?`M0 ${y} H${x-w} Q${x} ${control} ${x+w} ${y} H100 V100 H0Z`:`M0 0 H100 V${y} H${x+w} Q${x} ${control} ${x-w} ${y} H0Z`;
}
