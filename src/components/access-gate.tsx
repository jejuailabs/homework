'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {LoaderCircle,ShieldAlert} from 'lucide-react';
import {clearClassMetadata,setClassMetadataViewer} from '@/lib/class-metadata-cache';
import {useVerifiedViewer, type VerifiedViewer} from './viewer-context';

export default function AccessGate({role,children}:{role:'teacher'|'student'|'admin';children:ReactNode}){
  const router=useRouter(),path=usePathname(),t=useTranslations('common');
  const {setVerifiedViewer,clearViewer}=useVerifiedViewer();
  const [checked,setChecked]=useState<{path:string;state:'loading'|'allowed'|'denied'|'error'}>({path,state:'loading'});
  const state=checked.path===path?checked.state:'loading';
  useEffect(()=>{
    let cancelled=false;
    const controller=new AbortController();
    const setState=(next:'loading'|'allowed'|'denied'|'error')=>setChecked({path,state:next});
    const ended=()=>{cancelled=true;controller.abort();clearViewer();setState('denied');};
    clearViewer();setState('loading');
    window.addEventListener('homework-session-ended',ended);
    fetch('/api/me',{cache:'no-store',signal:controller.signal}).then(async r=>{
      if(cancelled)return null;
      if([401,403].includes(r.status)){clearClassMetadata(true);window.dispatchEvent(new Event('homework-session-ended'));}
      if(r.status===401){router.replace(`/?next=${encodeURIComponent(location.pathname+location.search)}`);return null;}
      if(r.status===403)return null;
      if(!r.ok)throw Error();
      return r.json();
    }).then((user:VerifiedViewer|null)=>{
      if(!user||cancelled)return;
      const valid=typeof user.uid==='string'&&!!user.uid&&['teacher','student','admin','superadmin'].includes(user.role);
      const permitted=valid&&(role==='admin'?['admin','superadmin'].includes(user.role):role==='teacher'?['teacher','admin','superadmin'].includes(user.role):user.role==='student');
      if(permitted){setClassMetadataViewer(user.uid);setVerifiedViewer({uid:user.uid,role:user.role},path);}
      else{clearClassMetadata(true);clearViewer();}
      setState(permitted?'allowed':'denied');
    }).catch(()=>{if(!cancelled){clearViewer();setState('error');}});
    return()=>{cancelled=true;controller.abort();window.removeEventListener('homework-session-ended',ended);clearViewer();};
  },[role,router,path,setVerifiedViewer,clearViewer]);
  if(state==='loading')return <div className="center-state"><LoaderCircle className="spin" size={28}/><p>{t('loading')}</p></div>;
  if(state!=='allowed')return <div className="center-state"><ShieldAlert size={32}/><p>{t(state==='denied'?'forbidden':'networkError')}</p><button className="button" onClick={()=>router.replace('/')}>{t('back')}</button></div>;
  return children;
}
