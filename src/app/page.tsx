import {LINK_PREVIEW} from '@/lib/berry-brand';
import type {Metadata} from 'next';
import LoginScreen from '@/components/login-screen';
import LandingSections from '@/modules/public-site/landing-sections';
import {SITE_NAME, SITE_ONE_LINER, SITE_URL} from '@/modules/public-site/site';

// Home: the sign-in screen first (signed-in users go straight to their
// classroom), then the public introduction that search engines read.
const title = '모두의 교실 (ourclass · 교실.com) - 숙제·작품 전시·AI 비서 베리가 있는 우리 반 교실';

export const metadata: Metadata = {
  title,
  description: SITE_ONE_LINER,
  keywords: ['모두의 교실', '모두의교실', '교실.com', 'ourclass', '온라인 숙제', '학급 작품 전시', 'AI 교실', '교사용 AI 비서', '참여보드', '학급 운영'],
  alternates: {canonical: '/'},
  openGraph: {title, description: SITE_ONE_LINER, url: SITE_URL, siteName: SITE_NAME, locale: 'ko_KR', type: 'website', images: [LINK_PREVIEW]},
  robots: {index: true, follow: true},
};

// ?start=teacher (the tour's "바로 내 교실 써 보기") opens on the teacher tab, one Google button away from a classroom.
export default async function LoginPage({searchParams}: {searchParams: Promise<{start?: string | string[]}>}) {
  const {start} = await searchParams;
  return <><LoginScreen defaultTab={start === 'teacher' ? 'teacher' : 'student'}/><LandingSections/></>;
}
