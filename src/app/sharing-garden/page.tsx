import type {Metadata} from 'next';
import SharingGardenDashboard from '@/modules/sharing-garden/dashboard';
export const metadata: Metadata = {title: '나눔 꽃밭 · 모두의 교실', description: '아이들이 함께 모은 성장 꽃이 전국에서 모여 의미 있는 곳에 쓰여요.', robots: {index: false, follow: false}};
export default function SharingGardenPage() {return <SharingGardenDashboard/>;}
