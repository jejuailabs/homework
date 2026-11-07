'use client';

import Link from 'next/link';
import {ArrowRight} from 'lucide-react';
import {CardModeIcon} from '../cards-visuals';
import {useGameCopy} from './shared';

/** The 복습 게임 row under the study tools on a student's set page. */
export function CardGamesEntry({distributionId, closed, testing = false}: {distributionId: string; closed: boolean; testing?: boolean}) {
  // A running test closes the games for a while; that is not the deadline, so it says so.
  const shut = closed || testing, {c} = useGameCopy(), body = <><span className="cg-entry-icons" aria-hidden="true"><CardModeIcon mode="pair" size={26}/><CardModeIcon mode="rain" size={26}/><CardModeIcon mode="puzzle" size={26}/></span><span><b>{c.games}</b><small>{closed ? c.entryClosed : testing ? c.entryTesting : c.entryBody}</small></span>{!shut && <ArrowRight size={18}/>}</>;
  return shut ? <div className="cg-entry is-disabled" aria-disabled="true">{body}</div> : <Link className="cg-entry" href={`/student/cards/${distributionId}/games`}>{body}</Link>;
}
