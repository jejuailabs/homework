'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {usePathname,useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {useEffect,useState,type ReactNode} from 'react';
import {Vote, BookOpen, Brain, Globe2, Images, Layers, LayoutDashboard, LogOut, Moon, PanelsTopLeft, Settings2, ShieldCheck, Sparkles, Sun, X, Shell} from 'lucide-react';
import {signOut} from 'firebase/auth';
import {clearClassMetadata} from '@/lib/class-metadata-cache';
import {auth} from '@/lib/firebase-client';
import {usePreferences,type Palette} from './providers';
import InstallShortcut from './install-shortcut';
import StudentCompanion from '@/modules/my-space/companion';
import LearningKingBeta from './learning-king-beta';
import {useVerifiedViewer} from './viewer-context';
import MyPageLink from '@/modules/teacher-notebook/my-page-link';
// Card Play is hidden from the top menu for now; its pages still work by direct link.
const cardsMenuVisible = false;
const RegionQuestBeta = dynamic(() => import('@/modules/region-quest/beta/launcher'), {ssr:false});

export default function AppShell({children,mySpaceEnabled=true,playgroundEnabled=true}:{children:ReactNode;mySpaceEnabled?:boolean;playgroundEnabled?:boolean}) {
  const t=useTranslations('common'), path=usePathname(), router=useRouter();
  const {locale,appearance,palette,setPreference}=usePreferences();
  const {viewer}=useVerifiedViewer();
  const [settings,setSettings]=useState(false), [busy,setBusy]=useState(false);
  const [systemDark,setSystemDark]=useState(false);
  useEffect(()=>{
    const nav=document.querySelector<HTMLElement>('.top-nav'),active=nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if(nav&&active&&nav.scrollWidth>nav.clientWidth){const offset=active.getBoundingClientRect().left-nav.getBoundingClientRect().left;nav.scrollLeft+=offset-(nav.clientWidth-active.clientWidth)/2;}
  },[path]);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const sync=()=>setSystemDark(media.matches);
    sync(); media.addEventListener('change',sync);
    return ()=>media.removeEventListener('change',sync);
  },[]);
  const resolvedAppearance=appearance==='system'?(systemDark?'dark':'light'):appearance;
  const nextAppearance=resolvedAppearance==='dark'?'light':'dark';
  const appearanceLabel=t('appearanceToggle',{current:t(appearance==='system'?(systemDark?'systemDark':'systemLight'):appearance),next:t(nextAppearance)});
  const isLogin=path==='/',isPublicGallery=path.startsWith('/gallery/')||path.startsWith('/board/'),isAdmin=path.startsWith('/admin'),isStudent=path.startsWith('/student');
  const workspacePath=isAdmin?'/admin':isStudent?'/student':'/teacher';
  const homeworkPath=isAdmin?'/admin':isStudent?'/student':'/teacher/homework';
  async function logout(){clearClassMetadata(true);window.dispatchEvent(new Event('homework-session-ended'));setBusy(true);try{await fetch('/api/auth/session',{method:'DELETE'});await signOut(auth);router.replace('/');router.refresh();}finally{setBusy(false);}}
  return <>
    <a href="#main" className="skip-link">{t('skip')}</a>
    <header className="app-header"><div className="header-inner">
      <Link href={isLogin||isPublicGallery?'/':isAdmin?'/admin':isStudent?'/student':'/teacher'} className="brand"><span className="brand-mark"><img src="/characters/otter-moa.webp" alt=""/></span><span>{t('brand')}<small>{t('tagline')}</small></span></Link>
      {!isLogin&&!isPublicGallery && <nav className={`top-nav ${isStudent?'student-nav':!isAdmin?'teacher-nav':''}`} aria-label={t('home')}>
        {!isStudent&&!isAdmin&&<Link href="/teacher" className={`nav-dashboard ${path==='/teacher'?'active':''}`} aria-current={path==='/teacher'?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><LayoutDashboard size={18}/></span>{locale==='en'?'Home':'홈'}</Link>}
        <Link className={`nav-homework ${path===homeworkPath?'active':''}`} aria-current={path===homeworkPath?'page':undefined} href={homeworkPath}><span className="nav-pictogram" aria-hidden="true">{isAdmin?<ShieldCheck size={18}/>:<BookOpen size={18}/>}</span>{isAdmin?t('admin'):t('homework')}</Link>
        {!isAdmin&&<Link href={`${workspacePath}/exhibitions`} className={`nav-gallery ${path.includes('/exhibitions')?'active':''}`} aria-current={path.includes('/exhibitions')?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Images size={18}/></span>{t('exhibitions')}</Link>}
        {isStudent&&<Link href="/student/my-exhibition" className={path==='/student/my-exhibition'?'active':''} aria-current={path==='/student/my-exhibition'?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Images size={18}/></span>{locale==='en'?'My gallery':'나의 전시실'}</Link>}
        {!isAdmin&&<Link href={`${workspacePath}/boards`} className={`nav-boards ${path.includes('/boards')?'active':''}`} aria-current={path.includes('/boards')?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><PanelsTopLeft size={18}/></span>{t('boards')}</Link>}
        {!isAdmin&&<Link href={`${workspacePath}/daily-quiz`} className={path.includes('/daily-quiz')?'active':''} aria-current={path.includes('/daily-quiz')?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><BookOpen size={18}/></span>Quiz</Link>}
        {!isAdmin&&<Link href={`${workspacePath}/lesson-review`} className={path.includes('/lesson-review')?'active':''} aria-current={path.includes('/lesson-review')?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Brain size={18}/></span>{locale==='en'?'Review':'복습하기'}</Link>}
        {!isAdmin&&playgroundEnabled&&<Link href={`${workspacePath}/playground`} className={path.includes('/playground')?'active':''} aria-current={path.includes('/playground')?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Sparkles size={18}/></span>{locale==='en'?'Word playground':'말놀이터'}</Link>}
        {!isAdmin&&cardsMenuVisible&&<Link href={`${workspacePath}/cards`} className={`nav-cards ${path.includes('/cards')?'active':''}`} aria-current={path.includes('/cards')?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Layers size={18}/></span>{t('cards')}</Link>}
        {isStudent&&mySpaceEnabled&&<Link href="/student/my-space" className={path==='/student/my-space'?'active':''} aria-current={path==='/student/my-space'?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Shell size={18}/></span>{locale==='en'?'My little world':'나의 작은 세상'}</Link>}{isStudent&&<Link href="/student/canvases" className={path==='/student/canvases'?'active':''} aria-current={path==='/student/canvases'?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><PanelsTopLeft size={18}/></span>{locale==='en'?'Together Canvas':'함께캔버스'}</Link>}
        {isStudent&&<Link href="/student/polls" className={path==='/student/polls'?'active':''} aria-current={path==='/student/polls'?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Vote size={18}/></span>{locale==='en'?'Class polls':'학급 투표'}</Link>}
        {!isStudent&&!isAdmin&&<Link href="/teacher/diary" className={path==='/teacher/diary'?'active':''} aria-current={path==='/teacher/diary'?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><BookOpen size={18}/></span>Kids Daily</Link>}
        {!isStudent&&!isAdmin&&<Link href="/teacher/tools" className={`nav-tools ${path.includes('tools')?'active':''}`} aria-current={path.includes('tools')?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Sparkles size={18}/></span>{t('tools')}</Link>}
        {!isStudent&&!isAdmin&&<Link href="/teacher/points" className={`nav-points ${path.includes('/points')?'active':''}`} aria-current={path.includes('/points')?'page':undefined}><span className="nav-pictogram" aria-hidden="true"><Shell size={18}/></span>{locale==='en'?'Points':'보말'}</Link>}
      </nav>}
      <div className="header-actions">
        <button className="icon-button" aria-label={t('language')} onClick={()=>setPreference({locale:locale==='ko'?'en':'ko'})}><Globe2 size={18}/><span>{locale==='ko'?'KO':'EN'}</span></button>
        <button className="icon-button" title={appearanceLabel} aria-label={appearanceLabel} onClick={()=>setPreference({appearance:nextAppearance})}>{resolvedAppearance==='dark'?<Moon size={19}/>:<Sun size={19}/>}</button>
        {path.startsWith('/teacher')&&<MyPageLink active={path.startsWith('/teacher/me')}/>}
        <button className="icon-button" aria-label={t('settings')} aria-expanded={settings} onClick={()=>setSettings(!settings)}><Settings2 size={20}/></button>
        {!isLogin&&!isPublicGallery&&<button className="icon-button logout-button" aria-label={t('signOut')} disabled={busy} onClick={logout}><LogOut size={18}/></button>}
      </div>
    </div></header>
    {settings&&<div className="settings-backdrop" onClick={()=>setSettings(false)}><section className="settings-panel" role="dialog" aria-modal="true" aria-label={t('settings')} onClick={e=>e.stopPropagation()}><div className="section-heading"><h2>{t('settings')}</h2><button className="icon-button" aria-label={t('close')} onClick={()=>setSettings(false)}><X size={20}/></button></div><label>{t('appearance')}</label><div className="segmented">{(['light','dark','system'] as const).map(value=><button key={value} className={appearance===value?'selected':''} onClick={()=>setPreference({appearance:value})}>{t(value)}</button>)}</div><label>{t('palette')}</label><div className="palette-grid">{(['mint','coral','sky','lavender','apricot','rose'] as Palette[]).map(value=><button key={value} className={palette===value?'selected':''} onClick={()=>setPreference({palette:value})} aria-pressed={palette===value}><span className={'swatch '+value}/>{t(value)}</button>)}</div><label htmlFor="locale-select">{t('language')}</label><select id="locale-select" value={locale} onChange={e=>setPreference({locale:e.target.value as 'ko'|'en'})}><option value="ko">{t('localeKorean')}</option><option value="en">{t('localeEnglish')}</option></select></section></div>}
    <main id="main" className={isLogin?'login-main':'app-main'}>{children}</main>
    <footer className="app-footer"><span>{t('brand')}</span><InstallShortcut/><span>{t('tagline')}</span></footer>
    {isStudent&&mySpaceEnabled&&<StudentCompanion/>}
    {viewer&&['teacher','admin','superadmin'].includes(viewer.role)&&/^\/(teacher|admin)(\/|$)/.test(path)&&<><RegionQuestBeta key={`region:${path}:${viewer.uid}`}/><LearningKingBeta key={`${path}:${viewer.uid}`}/></>}
  </>;
}
