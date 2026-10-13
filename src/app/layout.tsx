import type {Metadata} from 'next';
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

export const metadata:Metadata={title:'모두의 숙제 · Homework Friends',description:'동물 친구와 함께하는 쉬운 숙제 제출, 선생님을 위한 과제와 검사 도구.',robots:{index:false,follow:false}};
const preferenceScript=`try{const p=JSON.parse(localStorage.getItem('homework-preferences')||'{}');document.documentElement.dataset.mode=p.appearance==='dark'||((!p.appearance||p.appearance==='system')&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';if(['mint','coral','sky','lavender','apricot','rose'].includes(p.palette))document.documentElement.dataset.palette=p.palette;}catch(e){}`;
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:preferenceScript}}/></head><body><Providers><AppShell>{children}</AppShell></Providers></body></html>;}
