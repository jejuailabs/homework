import {StudentCardsDetail} from '@/components/cards-student';

export default async function StudentCardsSetPage({params}: {params: Promise<{distributionId: string}>}) {
  const {distributionId} = await params;
  return <StudentCardsDetail distributionId={distributionId}/>;
}
