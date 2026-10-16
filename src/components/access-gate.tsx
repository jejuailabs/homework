'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {LoaderCircle,ShieldAlert} from 'lucide-react';
import {clearClassMetadata,setClassMetadataViewer} from '@/lib/class-metadata-cache';

export default function AccessGate({role,children}:{role:'teacher'|'student'|'admin';children:ReactNode}){
  const [state,setState]=useState<'loading'|'allowed'|'denied'|'error'>('loading');const router=useRouter(),t=useTranslations('common');
  useEffect(()=>{let cancelled=false;fetch('/api/me',{cache:'no-store'}).then(async r=>{if([401,403].includes(r.status)){clearClassMetadata(true);window.dispatchEvent(new Event('homework-session-ended'));}if(r.status===401){router.replace(`/?next=${encodeURIComponent(location.pathname+location.search)}`);return null;}if(r.status===403){if(!cancelled)setState('denied');return null;}if(!r.ok)throw Error();return r.json();}).then(user=>{if(!user||cancelled)return;const permitted=role==='admin'?['admin','superadmin'].includes(user.role):role==='teacher'?['teacher','admin','superadmin'].includes(user.role):user.role==='student';if(permitted)setClassMetadataViewer(user.uid);else clearClassMetadata(true);setState(permitted?'allowed':'denied');}).catch(()=>!cancelled&&setState('error'));return()=>{cancelled=true;};},[role,router]);
  if(state==='loading')return <div className="center-state"><LoaderCircle className="spin" size={28}/><p>{t('loading')}</p></div>;
  if(state!=='allowed')return <div className="center-state"><ShieldAlert size={32}/><p>{t(state==='denied'?'forbidden':'networkError')}</p><button className="button" onClick={()=>router.replace('/')}>{t('back')}</button></div>;
  return children;
}
