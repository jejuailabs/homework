'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {LoaderCircle,ShieldAlert} from 'lucide-react';

export default function AccessGate({role,children}:{role:'teacher'|'student'|'admin';children:ReactNode}){
  const [state,setState]=useState<'loading'|'allowed'|'denied'|'error'>('loading');const router=useRouter(),t=useTranslations('common');
  useEffect(()=>{let cancelled=false;fetch('/api/me',{cache:'no-store'}).then(async r=>{if(r.status===401){router.replace('/');return null;}if(!r.ok)throw Error();return r.json();}).then(user=>{if(!user||cancelled)return;const permitted=role==='admin'?['admin','superadmin'].includes(user.role):role==='teacher'?['teacher','admin','superadmin'].includes(user.role):user.role==='student';setState(permitted?'allowed':'denied');}).catch(()=>!cancelled&&setState('error'));return()=>{cancelled=true;};},[role,router]);
  if(state==='loading')return <div className="center-state"><LoaderCircle className="spin" size={28}/><p>{t('loading')}</p></div>;
  if(state!=='allowed')return <div className="center-state"><ShieldAlert size={32}/><p>{t(state==='denied'?'forbidden':'networkError')}</p><button className="button" onClick={()=>router.replace('/')}>{t('back')}</button></div>;
  return children;
}
