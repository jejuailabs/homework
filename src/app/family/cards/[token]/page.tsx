import type {Metadata} from 'next';
import CardsParentReport from '@/components/cards-parent-report';
export const metadata: Metadata = {title: '카드놀이 학습 소식', robots: {index: false, follow: false, nocache: true}, referrer: 'no-referrer'};
export default async function Page({params}: {params: Promise<{token: string}>}) {return <CardsParentReport token={(await params).token}/>;}
