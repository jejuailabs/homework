import {notFound} from 'next/navigation';
import CurriculumWorkspace from '@/modules/curriculum/workspace';
/** 로그인 없이 화면만 확인하는 로컬 전용 시안 페이지. 개발 서버(next dev)가 아니면 없는 주소다. */
export default function CurriculumPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <main style={{maxWidth: 1240, margin: '0 auto', padding: '24px 16px 80px'}}><CurriculumWorkspace preview/></main>;
}
