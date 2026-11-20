import type { Metadata } from 'next';
import AccessGate from '@/components/access-gate';
import ClassArtbookWizard from '@/modules/class-artbook/wizard';

export const metadata: Metadata = {title: '우리 반 작품집', robots: {index: false, follow: false}};
export default function ClassArtbookPage() {return <AccessGate role="teacher"><ClassArtbookWizard/></AccessGate>;}
