import type { Metadata } from 'next';
import AccessGate from '@/components/access-gate';
import FileLibrary from '@/modules/attachments/library';

export const metadata: Metadata = {title: '자료함', robots: {index: false, follow: false}};
export default function FileLibraryPage() {return <AccessGate role="teacher"><FileLibrary/></AccessGate>;}
