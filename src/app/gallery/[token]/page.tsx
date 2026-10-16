import type {Metadata} from 'next';
import PublicExhibition from '@/components/public-exhibition';
export const metadata: Metadata = {title: '우리 반 작품 전시', robots: {index: false, follow: false}, referrer: 'no-referrer'};
export default async function Page({params}: {params: Promise<{token: string}>}) {return <PublicExhibition token={(await params).token}/>;}
