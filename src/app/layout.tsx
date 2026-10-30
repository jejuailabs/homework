import type {Metadata,Viewport} from 'next';
import Providers from '@/components/providers';
import AppShell from '@/components/app-shell';
import './globals.css';
import '@/styles/workspace.css';
import '@/styles/exhibitions.css';
import '@/styles/exhibition-scene.css';
import '@/styles/delight.css';
import '@/styles/teacher-delight.css';
import '@/styles/student-delight.css';
import '@/styles/teacher-dashboard.css';
import '@/styles/participation-integration.css';
import '@/styles/cards-integration.css';
import '@/styles/learning-king-beta.css';

export const metadata:Metadata={title:'모두의 교실 · Our Classroom',description:'숙제, 작품전시, 퀴즈와 수업 활동을 함께 나누는 우리 반 교실.',appleWebApp:{capable:true,title:'모두의 교실',statusBarStyle:'default'},robots:{index:false,follow:false}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#397960'};
const preferenceScript=`try{const p=JSON.parse(localStorage.getItem('homework-preferences')||'{}');document.documentElement.dataset.mode=p.appearance==='dark'||((!p.appearance||p.appearance==='system')&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';if(['mint','coral','sky','lavender','apricot','rose'].includes(p.palette))document.documentElement.dataset.palette=p.palette;}catch(e){}`;
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:preferenceScript}}/></head><body><Providers><AppShell mySpaceEnabled={process.env.MY_SPACE_DISABLED!=='true'} playgroundEnabled={process.env.PLAYGROUND_DISABLED!=='true'}>{children}</AppShell></Providers></body></html>;}
