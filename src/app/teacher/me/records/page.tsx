import type { Metadata } from 'next';
import AccessGate from '@/components/access-gate';
import StudentRecordsView from '@/modules/student-records/records';

export const metadata: Metadata = {title: '학생별 모아 보기', robots: {index: false, follow: false}};
export default function StudentRecordsPage() {return <AccessGate role="teacher"><StudentRecordsView/></AccessGate>;}
