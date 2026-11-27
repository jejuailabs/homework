import type {Metadata} from 'next';
import InquiryForm from '@/modules/inquiry/form';

export const metadata: Metadata = {
  title: '모두의 교실 정식으로 쓰기 · 문의',
  description: '우리 반에서 바로 쓰는 방법과 학교·학년 단위 도입, 그 밖의 문의를 남겨 주세요.',
};
export default async function ContactPage({searchParams}: {searchParams: Promise<{from?: string | string[]}>}) {
  const {from} = await searchParams;
  return <InquiryForm from={Array.isArray(from) ? from[0] : from}/>;
}
