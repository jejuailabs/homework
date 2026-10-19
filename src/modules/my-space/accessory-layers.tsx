'use client';
import {useId} from 'react';
import type {WardrobeOutfit} from '@/lib/points-types';
import {attachmentLayout,attachmentRules,headAttachmentRules,chinPath,characterRig,type AttachmentId} from './attachment-rig';
import {wornSprite,wearState,type SpaceOutfit,type WearablePet} from './appearance';

export default function AccessoryLayers({pet,outfit,body}: {pet:WearablePet;outfit:WardrobeOutfit;body:SpaceOutfit}) {
 const uid='att-'+useId().replace(/[^a-zA-Z0-9_-]/g,''),state=wearState(body),base=wornSprite(pet,body),r=characterRig(pet,state);
 const head=outfit.head?attachmentLayout(pet,outfit.head as AttachmentId,state):null,neck=outfit.neck?attachmentLayout(pet,outfit.neck as AttachmentId,state):null;
 if(!head?.asset&&!neck?.asset)return null;
 const image=(look:NonNullable<typeof head>,extra={})=>look.asset?<image href={look.asset.src} x={look.left} y={look.top} width={look.width} height={look.height} preserveAspectRatio="none" transform={`rotate(${look.rotate} ${look.left+look.width/2} ${look.top+look.height*.85})`} {...extra}/>:null;
 const bandWidth=r.neckWidth*.64;
 const bow=outfit.neck==='neck-bow',underBag=!!body.bag&&!!neck&&attachmentRules[outfit.neck as keyof typeof attachmentRules]?.underBag;
 return <svg className="avatar-attachments" viewBox="0 0 100 100" aria-hidden="true" data-fit-pet={pet}>
  <defs>
   <clipPath id={uid+'-chin'}><path d={chinPath(pet,state)}/></clipPath><clipPath id={uid+'-front'}><path d={chinPath(pet,state,true)}/></clipPath>
   <clipPath id={uid+'-ears'}><path d={r.ears} transform={r.earTransform}/></clipPath>
   <clipPath id={uid+'-ear-tips'}><rect width="100" height={Math.max(0,(head?.seat||0)-12)}/></clipPath>
   {head&&<clipPath id={uid+'-brim'}><rect x={0} y={head.top+head.height*.77} width={100} height={head.height*.5}/></clipPath>}
   {neck&&<clipPath id={uid+'-band'}><path d={`M${r.x-bandWidth/2} ${neck.neck-3} Q${r.x} ${neck.neck+4} ${r.x+bandWidth/2} ${neck.neck-3} L${r.x+bandWidth/2} ${neck.neck} Q${r.x} ${neck.neck+7} ${r.x-bandWidth/2} ${neck.neck}Z`}/></clipPath>}
   {neck&&<mask id={uid+'-bag'} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><path d={`M${r.x-21} ${neck.neck-7} Q${r.x-2} ${neck.neck+1} ${r.x+20} ${neck.neck+16}`} stroke="white" strokeWidth={3} fill="none"/></mask>}
   <filter id={uid+'-contact'} x="-15%" y="-15%" width="130%" height="140%"><feDropShadow dx="0" dy="0.45" stdDeviation="0.25" floodColor="#4d392e" floodOpacity=".22"/></filter>
  </defs>
  {neck?.asset&&<g className={'worn-neck worn-'+outfit.neck!.slice(5)} data-attachment={outfit.neck}>
   {bow?<g clipPath={`url(#${uid}-band)`}><svg x={r.x-bandWidth/2} y={neck.neck-9} width={bandWidth} height={17} viewBox={`${neck.asset.width*.46} ${neck.asset.height*.35} ${neck.asset.width*.10} ${neck.asset.height*.30}`} preserveAspectRatio="none"><image href={neck.asset.src} width={neck.asset.width} height={neck.asset.height}/></svg></g>:image(neck, {filter:`url(#${uid}-contact)`})}
   <image href={base} width="100" height="100" clipPath={`url(#${uid}-chin)`}/>
   {bow&&<g clipPath={`url(#${uid}-front)`}>{image(neck,{filter:`url(#${uid}-contact)`})}</g>}
   {underBag&&<image href={base} width="100" height="100" mask={`url(#${uid}-bag)`}/>}
  </g>}
  {head?.asset&&<g className={'worn-head worn-'+outfit.head!.slice(5)} data-attachment={outfit.head}>
   {image(head,{filter:`url(#${uid}-contact)`})}
   {headAttachmentRules[outfit.head as keyof typeof headAttachmentRules]?.restoreEarTips&&<><g clipPath={`url(#${uid}-ear-tips)`}><image href={base} width="100" height="100" clipPath={`url(#${uid}-ears)`}/></g><g clipPath={`url(#${uid}-brim)`}>{image(head)}</g></>}
  </g>}
 </svg>;
}
