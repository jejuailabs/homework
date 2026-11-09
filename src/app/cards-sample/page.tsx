import type {Metadata} from 'next';
import CardsSample from './cards-sample';

export const metadata: Metadata = {title: '그림 카드 시험', robots: {index: false, follow: false}};

export default function Page() {
  return <CardsSample/>;
}
