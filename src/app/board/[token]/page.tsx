import type {Metadata} from 'next';
import PublicBoard from '@/components/public-board';
export const metadata: Metadata = {title: '우리 반 참여보드', robots: {index: false, follow: false}, referrer: 'no-referrer'};
export default async function Page({params}: {params: Promise<{token: string}>}) {return <PublicBoard token={(await params).token}/>;}
