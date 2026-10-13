'use client';
import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import {NextIntlClientProvider} from 'next-intl';
import commonKo from '@/messages/common-ko.json';
import commonEn from '@/messages/common-en.json';
import adminKo from '@/messages/admin-ko.json';
import adminEn from '@/messages/admin-en.json';
import productKo from '@/messages/product-ko.json';
import productEn from '@/messages/product-en.json';
import exhibitionKo from '@/messages/exhibition-ko.json';
import exhibitionEn from '@/messages/exhibition-en.json';
import dashboardKo from '@/messages/dashboard-ko.json';
import dashboardEn from '@/messages/dashboard-en.json';
import participationKo from '@/messages/participation-ko.json';
import participationEn from '@/messages/participation-en.json';

export type Locale = 'ko' | 'en';
export type Palette = 'mint' | 'coral' | 'sky' | 'lavender' | 'apricot' | 'rose';
export type Appearance = 'light' | 'dark' | 'system';
type Preferences = {locale:Locale; palette:Palette; appearance:Appearance};
const defaults: Preferences = {locale:'ko',palette:'mint',appearance:'system'};
const PreferencesContext = createContext({ ...defaults, setPreference: (_: Partial<Preferences>) => {} });
export const usePreferences = () => useContext(PreferencesContext);

export default function Providers({children}:{children:ReactNode}) {
  const [prefs,setPrefs]=useState(defaults);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    try {
      const saved=JSON.parse(localStorage.getItem('homework-preferences')||'{}');
      setPrefs({locale:['ko','en'].includes(saved.locale)?saved.locale:'ko',palette:['mint','coral','sky','lavender','apricot','rose'].includes(saved.palette)?saved.palette:'mint',appearance:['light','dark','system'].includes(saved.appearance)?saved.appearance:'system'});
    } catch {}
    setReady(true);
  },[]);
  useEffect(()=>{
    if(!ready) return;
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.mode=prefs.appearance==='system'?(media.matches?'dark':'light'):prefs.appearance;};
    apply(); media.addEventListener('change',apply);
    document.documentElement.dataset.palette=prefs.palette;
    document.documentElement.lang=prefs.locale;
    localStorage.setItem('homework-preferences',JSON.stringify(prefs));
    return ()=>media.removeEventListener('change',apply);
  },[prefs,ready]);
  return <PreferencesContext.Provider value={{...prefs,setPreference:(value)=>setPrefs(p=>({...p,...value}))}}>
    <NextIntlClientProvider locale={prefs.locale} timeZone="Asia/Seoul" messages={{common:prefs.locale==='ko'?commonKo:commonEn,admin:prefs.locale==='ko'?adminKo:adminEn,product:prefs.locale==='ko'?productKo:productEn,exhibition:prefs.locale==='ko'?exhibitionKo:exhibitionEn,dashboard:prefs.locale==='ko'?dashboardKo:dashboardEn,participation:prefs.locale==='ko'?participationKo:participationEn}}>{children}</NextIntlClientProvider>
  </PreferencesContext.Provider>;
}
