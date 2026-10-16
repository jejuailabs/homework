import AccessGate from '@/components/access-gate';
import AdminWorkspace from '@/components/admin-workspace';
import {Suspense} from 'react';
export default function AdminPage(){return <AccessGate role="admin"><Suspense fallback={<p>관리 화면을 불러오는 중</p>}><AdminWorkspace/></Suspense></AccessGate>;}
