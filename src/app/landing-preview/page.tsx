import type {Metadata} from 'next';
import LoginScreen from '@/components/login-screen';
import LandingSections from '@/modules/public-site/landing-sections';

// Review copy of the future home page: the real sign-in screen on top, the
// public introduction below. Never indexed; it is replaced by / once approved.
export const metadata: Metadata = {
  title: '랜딩 미리보기 · 모두의 교실',
  robots: {index: false, follow: false},
};

export default function LandingPreviewPage() {
  return (
    <>
      <div className="ps-preview-banner">검토용 미리보기 화면입니다. 위는 지금의 첫 화면(실제 로그인), 아래는 새로 붙일 소개 내용입니다.</div>
      <LoginScreen autoRedirect={false}/>
      <LandingSections/>
    </>
  );
}
