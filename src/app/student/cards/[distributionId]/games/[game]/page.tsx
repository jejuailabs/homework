import {notFound} from 'next/navigation';
import {StudentCardGame} from '@/components/cards-games/home';
import {isCardGame} from '@/lib/cards-games';

export default async function StudentCardGamePage({params}: {params: Promise<{distributionId: string; game: string}>}) {
  const {distributionId, game} = await params;
  if (!isCardGame(game)) notFound();
  return <StudentCardGame distributionId={distributionId} game={game}/>;
}
