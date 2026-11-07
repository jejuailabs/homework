'use client';
import {useMemo, useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, X} from 'lucide-react';
import type {CardDistributionSummary} from '@/lib/cards-types';
import {cardAddDays, cardReviewDate} from '@/lib/cards-logic';
import {plannerWeek} from '@/lib/cards-planner';
import {useCardsCopy} from '@/lib/cards-copy';
import {fillCopy} from '@/lib/cards-class-copy';
import {useCardsP2Copy} from '@/lib/cards-p2-copy';
import {cardsRequest, CardsDialog} from './cards-shared';
import '@/styles/cards-p2.css';

/** 학습 일정: the class's sets by date, a week at a time. A study day only places a set on the calendar; it never opens or closes study. */
export default function CardsClassPlanner({className, distributions, onClose, onChanged}: {className: string; distributions: CardDistributionSummary[]; onClose: () => void; onChanged: (notice: string) => void}) {
  const {t, locale} = useCardsCopy(), p = useCardsP2Copy(), today = cardReviewDate();
  const [anchor, setAnchor] = useState(today), [rows, setRows] = useState(distributions), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const week = useMemo(() => plannerWeek(rows, anchor, today), [rows, anchor, today]);
  const dayLabel = (date: string, index: number) => `${p.weekdays[index]} ${new Intl.DateTimeFormat(locale, {month: 'numeric', day: 'numeric', timeZone: 'UTC'}).format(new Date(`${date}T00:00:00Z`))}`;
  async function setPlan(item: CardDistributionSummary, planDate: string | null) {
    if (busy) return; setBusy(item.id); setError('');
    try {
      const result = await cardsRequest<{distribution: CardDistributionSummary}>(`/api/cards/distributions/${encodeURIComponent(item.id)}`, {method: 'PATCH', body: JSON.stringify({planDate})});
      setRows(current => current.map(row => row.id === item.id ? {...row, planDate: result.distribution.planDate ?? null} : row)); onChanged(p.planSaved);
    } catch (cause) {setError(locale === 'ko' && cause instanceof Error ? cause.message : t('error'));} finally {setBusy('');}
  }
  const dateInput = (item: CardDistributionSummary) => <label className="cards-planner-date"><span className="cards-sr-only">{p.planDate} · {item.title}</span><input type="date" value={item.planDate ?? ''} disabled={busy === item.id} onChange={e => void setPlan(item, e.target.value || null)}/></label>;
  return <CardsDialog title={fillCopy(p.plannerTitle, {name: className})} closeLabel={t('close')} onClose={onClose}>
    <div className="cards-planner">
      <p className="cards-muted">{p.plannerHint}</p>
      <div className="cards-planner-nav"><button type="button" className="icon-button" aria-label={p.prevWeek} onClick={() => setAnchor(cardAddDays(week.start, -7))}><ChevronLeft size={18}/></button><strong>{dayLabel(week.start, 0)} – {dayLabel(week.end, 6)}</strong><button type="button" className="icon-button" aria-label={p.nextWeek} onClick={() => setAnchor(cardAddDays(week.start, 7))}><ChevronRight size={18}/></button><button type="button" className="button" disabled={week.days.some(day => day.today)} onClick={() => setAnchor(today)}>{p.thisWeek}</button></div>
      {error && <p role="alert" className="cards-error">{error}</p>}
      <ol className="cards-planner-days">{week.days.map((day, index) => <li key={day.date} className={day.today ? 'is-today' : ''}><div className="cards-planner-day"><CalendarDays size={15}/>{dayLabel(day.date, index)}{day.today && <span className="cards-badge accent">{p.today}</span>}</div>
        {day.entries.length ? <ul>{day.entries.map(entry => <li key={`${entry.kind}:${entry.row.id}`} className={`cards-planner-entry is-${entry.kind}`}><span className="cards-badge">{entry.kind === 'plan' ? p.planKind : p.dueKind}</span><span className="cards-planner-title">{entry.row.title}</span>{entry.kind === 'plan' && <>{dateInput(entry.row)}<button type="button" className="icon-button" aria-label={`${p.clearPlan} · ${entry.row.title}`} disabled={busy === entry.row.id} onClick={() => void setPlan(entry.row, null)}><X size={16}/></button></>}</li>)}</ul> : <p className="cards-muted">{p.emptyDay}</p>}
      </li>)}</ol>
      <h3>{p.unscheduled} <small>{week.unscheduled.length}</small></h3>
      {week.unscheduled.length ? <ul className="cards-planner-unscheduled">{week.unscheduled.map(item => <li key={item.id}><span className="cards-planner-title">{item.title}</span>{dateInput(item)}</li>)}</ul> : <p className="cards-muted">{p.noUnscheduled}</p>}
    </div>
  </CardsDialog>;
}
