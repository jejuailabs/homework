import type { Metadata } from 'next';
import AccessGate from '@/components/access-gate';
import OfficialDocuments from '@/modules/official-docs/documents';

export const metadata: Metadata = {title: '공문처리', robots: {index: false, follow: false}};
export default function OfficialDocumentsPage() {return <AccessGate role="teacher"><OfficialDocuments/></AccessGate>;}
