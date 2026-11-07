import {StudentCardsReview} from '@/components/cards-student';

export default async function StudentCardsReviewPage({searchParams}: {searchParams: Promise<{[key: string]: string | string[] | undefined}>}) {
  const {distributionId, week} = await searchParams;
  return <StudentCardsReview distributionId={typeof distributionId === 'string' ? distributionId : undefined} week={typeof week === 'string' ? week : undefined}/>;
}
