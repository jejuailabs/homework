import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import TryShell from '@/modules/try-demo/shell';
import {demoAssetsReady, isCorner} from '@/modules/try-demo/data';

/**
 * Login-free tour with a made-up class. Stage 1: reachable by address only, kept out of search
 * results, and switched off at once with TRY_DEMO_DISABLED=true.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '모두의 교실 체험 - 로그인 없이 둘러보기',
  description: '가상 학급으로 3D 작품 전시관, 보말과 캐릭터, 작품집을 로그인 없이 체험해 보세요.',
  robots: {index: false, follow: false},
};
export default async function TryPage({searchParams}: {searchParams: Promise<{go?: string | string[]}>}) {
  if (process.env.TRY_DEMO_DISABLED === 'true' || !demoAssetsReady) notFound();
  const {go} = await searchParams, corner = Array.isArray(go) ? go[0] : go;
  return <TryShell initial={isCorner(corner) ? corner : 'gallery'}/>;
}
