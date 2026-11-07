import {StudentCardGames} from '@/components/cards-games/home';

export default async function StudentCardGamesPage({params}: {params: Promise<{distributionId: string}>}) {
  const {distributionId} = await params;
  return <StudentCardGames distributionId={distributionId}/>;
}
