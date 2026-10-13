'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {useEffect,useState,type ReactNode} from 'react';
import {BookOpen, Globe2, Images, LogOut, Moon, Settings2, ShieldCheck, Sparkles, Sun, X} from 'lucide-react';
import {signOut} from 'firebase/auth';
import {auth} from '@/lib/firebase-client';
import {usePreferences,type Palette} from './providers';

export default function AppShell({children}:{children:ReactNode}) {
  const t=useTranslations('common'), path=usePathname(), router=useRouter();
  const {locale,appearance,palette,setPreference}=usePreferences();
  const [settings,setSettings]=useState(false), [busy,setBusy]=useState(false);
  const [systemDark,setSystemDark]=useState(false);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const sync=()=>setSystemDark(media.matches);
    sync(); media.addEventListener('change',sync);
    return ()=>media.removeEventListener('change',sync);
  },[]);
  const resolvedAppearance=appearance==='system'?(systemDark?'dark':'light'):appearance;
  const nextAppearance=resolvedAppearance==='dark'?'light':'dark';
  const appearanceLabel=t('appearanceToggle',{current:t(appearance==='system'?(systemDark?'systemDark':'systemLight'):appearance),next:t(nextAppearance)});
  const isLogin=path==='/',isAdmin=path.startsWith('/admin'),isStudent=path.startsWith('/student');
  const workspacePath=isAdmin?'/admin':isStudent?'/student':'/teacher';
  async function logout(){setBusy(true);try{await fetch('/api/auth/session',{method:'DELETE'});await signOut(auth);router.replace('/');router.refresh();}finally{setBusy(false);}}
  return <>
    <a href="#main" className="skip-link">{t('skip')}</a>
    <header className="app-header"><div className="header-inner">
      <Link href={isLogin?'/':isAdmin?'/admin':isStudent?'/student':'/teacher'} className="brand"><span className="brand-mark"><BookOpen size={22}/></span><span>{t('brand')}<small>{t('tagline')}</small></span></Link>
      {!isLogin && <nav className="top-nav" aria-label={t('home')}>
        <Link className={`nav-homework ${path===workspacePath?'active':''}`} aria-current={path===workspacePath?'page':undefined} href={workspacePath}><span className="nav-pictogram" aria-hidden="true">{isAdmin?<ShieldCheck size={18}/>:<BookOpen size={18}/>}</span>{isAdmin?t('admin'):t('homework')}</Link>
        {!isAdmin&&<Link href={`${workspacePath}/exhibitions`} className={`nav-gallery ${path.includes('/exhibitions')?'active':''}`} aria-current={path.includes('/exhibitions')?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Images size={18}/></span>{t('exhibitions')}</Link>}
        {!isStudent&&!isAdmin&&<Link href="/teacher/tools" className={`nav-tools ${path.includes('tools')?'active':''}`} aria-current={path.includes('tools')?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Sparkles size={18}/></span>{t('tools')}</Link>}
      </nav>}
      <div className="header-actions">
        <button className="icon-button" aria-label={t('language')} onClick={()=>setPreference({locale:locale==='ko'?'en':'ko'})}><Globe2 size={18}/><span>{locale==='ko'?'KO':'EN'}</span></button>
        <button className="icon-button" title={appearanceLabel} aria-label={appearanceLabel} onClick={()=>setPreference({appearance:nextAppearance})}>{resolvedAppearance==='dark'?<Moon size={19}/>:<Sun size={19}/>}</button>
        <button className="icon-button" aria-label={t('settings')} aria-expanded={settings} onClick={()=>setSettings(!settings)}><Settings2 size={20}/></button>
        {!isLogin&&<button className="icon-button logout-button" aria-label={t('signOut')} disabled={busy} onClick={logout}><LogOut size={18}/></button>}
      </div>
    </div></header>
    {settings&&<div className="settings-backdrop" onClick={()=>setSettings(false)}><section className="settings-panel" role="dialog" aria-modal="true" aria-label={t('settings')} onClick={e=>e.stopPropagation()}><div className="section-heading"><h2>{t('settings')}</h2><button className="icon-button" aria-label={t('close')} onClick={()=>setSettings(false)}><X size={20}/></button></div><label>{t('appearance')}</label><div className="segmented">{(['light','dark','system'] as const).map(value=><button key={value} className={appearance===value?'selected':''} onClick={()=>setPreference({appearance:value})}>{t(value)}</button>)}</div><label>{t('palette')}</label><div className="palette-grid">{(['mint','coral','sky','lavender','apricot','rose'] as Palette[]).map(value=><button key={value} className={palette===value?'selected':''} onClick={()=>setPreference({palette:value})} aria-pressed={palette===value}><span className={'swatch '+value}/>{t(value)}</button>)}</div><label htmlFor="locale-select">{t('language')}</label><select id="locale-select" value={locale} onChange={e=>setPreference({locale:e.target.value as 'ko'|'en'})}><option value="ko">{t('localeKorean')}</option><option value="en">{t('localeEnglish')}</option></select></section></div>}
    <main id="main" className={isLogin?'login-main':'app-main'}>{children}</main>
    <footer className="app-footer"><span>{t('brand')}</span><span>{t('tagline')}</span></footer>
  </>;
}
