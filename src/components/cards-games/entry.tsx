'use client';

import Link from 'next/link';
import {ArrowRight} from 'lucide-react';
import {CardModeIcon} from '../cards-visuals';
import {useGameCopy} from './shared';

/** The 복습 게임 row under the study tools on a student's set page. */
export function CardGamesEntry({distributionId, closed}: {distributionId: string; closed: boolean}) {
  const {c} = useGameCopy(), body = <><span className="cg-entry-icons" aria-hidden="true"><CardModeIcon mode="pair" size={26}/><CardModeIcon mode="rain" size={26}/><CardModeIcon mode="puzzle" size={26}/></span><span><b>{c.games}</b><small>{closed ? c.entryClosed : c.entryBody}</small></span>{!closed && <ArrowRight size={18}/>}</>;
  return closed ? <div className="cg-entry is-disabled" aria-disabled="true">{body}</div> : <Link className="cg-entry" href={`/student/cards/${distributionId}/games`}>{body}</Link>;
}
