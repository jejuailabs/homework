import {StudentCardsSpeaking} from '@/components/cards-speaking-student';

export default async function StudentCardsSpeakingPage({params}: {params: Promise<{distributionId: string}>}) {
  const {distributionId} = await params;
  return <StudentCardsSpeaking distributionId={distributionId}/>;
}
