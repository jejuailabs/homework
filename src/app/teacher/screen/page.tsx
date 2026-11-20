import type { Metadata } from 'next';
import AccessGate from '@/components/access-gate';
import ClassScreen from '@/modules/class-screen/screen';

/** 교실 화면. ?view=1 is the display-only window for the classroom board. */
export const metadata: Metadata = {title: '교실 화면', robots: {index: false, follow: false}};
export default async function ClassScreenPage({searchParams}: {searchParams: Promise<{view?: string | string[]}>}) {
  const {view} = await searchParams;
  return <AccessGate role="teacher"><ClassScreen view={(Array.isArray(view) ? view[0] : view) === '1'}/></AccessGate>;
}
