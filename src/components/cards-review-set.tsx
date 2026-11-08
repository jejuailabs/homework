'use client';
import Link from 'next/link';
import {useMemo, useState} from 'react';
import {Sparkles} from 'lucide-react';
import ko from '@/messages/cards-review-set-ko.json';
import en from '@/messages/cards-review-set-en.json';
import importKo from '@/messages/cards-import-ko.json';
import importEn from '@/messages/cards-import-en.json';
import {CARD_AI_LEVELS, CARD_AI_REVIEW_MAX, type CardAiDraft, type CardAiLevel} from '@/lib/cards-ai-draft';
import {CARD_EXAMPLE_LIMIT} from '@/lib/cards-logic';
import {cardReviewCandidates} from '@/lib/cards-summary';
import type {CardDistribution, CardReportStudent, CardSet} from '@/lib/cards-types';
import {useCardsCopy} from '@/lib/cards-copy';
import {cardsRequest, CardsDialog} from './cards-shared';
import '@/styles/cards-import.css';

const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
const DEFAULT_PICKED = 10;

/** 복습 세트 (§39): the class's missed cards become a new set; AI may rewrite only the examples. Nothing is assigned here. */
export default function CardsReviewSetDialog({distribution, students, onClose}: {distribution: CardDistribution; students: CardReportStudent[]; onClose: () => void}) {
  const {t, locale} = useCardsCopy(), copy = locale === 'ko' ? ko : en, levels = locale === 'ko' ? importKo : importEn;
  const candidates = useMemo(() => cardReviewCandidates(students, distribution.snapshot.cards, CARD_AI_REVIEW_MAX), [students, distribution]);
  const words = distribution.snapshot.type === 'word';
  const [picked, setPicked] = useState(() => new Set(candidates.slice(0, DEFAULT_PICKED).map(row => row.card.id)));
  const [title, setTitle] = useState(() => `${distribution.snapshot.title} ${copy.suffix}`.slice(0, 120)), [rewrite, setRewrite] = useState(words), [level, setLevel] = useState<CardAiLevel>('elementary');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [aiFailed, setAiFailed] = useState(false), [saved, setSaved] = useState<CardSet | null>(null);
  const toggle = (id: string, on: boolean) => setPicked(current => {const next = new Set(current); if (on) next.add(id); else next.delete(id); return next;});

  async function create(useAi = rewrite && words) {
    const rows = candidates.filter(row => picked.has(row.card.id)).map(row => row.card);
    if (!rows.length) {setError(copy.none); return;}
    if (!title.trim()) {setError(copy.noTitle); return;}
    setBusy(true); setError(''); setAiFailed(false);
    let examples = rows.map(card => card.example);
    if (useAi) {
      try {
        const {cards} = await cardsRequest<{cards: CardAiDraft[]}>('/api/cards/ai-draft', {method: 'POST', body: JSON.stringify({mode: 'review', level, cards: rows.map(({front, back, example}) => ({front, back, example}))})});
        examples = rows.map((card, index) => (cards[index]?.example || card.example).slice(0, CARD_EXAMPLE_LIMIT));
      } catch {setAiFailed(true); setError(copy.aiFailed); setBusy(false); return;}
    }
    try {
      const cards = rows.map((card, index) => ({...card, id: crypto.randomUUID(), example: examples[index]}));
      const result = await cardsRequest<{set: CardSet}>('/api/cards/sets', {method: 'POST', body: JSON.stringify({requestId: crypto.randomUUID(), title: title.trim(), description: fill(copy.description, {title: distribution.snapshot.title}).slice(0, 500), type: distribution.snapshot.type, folderId: null, cards})});
      setSaved(result.set);
    } catch (cause) {setError(locale === 'ko' && cause instanceof Error && cause.message ? cause.message : copy.saveFailed);} finally {setBusy(false);}
  }

  return <CardsDialog title={copy.title} closeLabel={t('close')} onClose={() => {if (!busy) onClose();}}>
    {saved ? <section className="cards-import"><p>{copy.done}</p><div className="cards-actions"><Link className="button primary" href={`/teacher/cards/${encodeURIComponent(saved.id)}`}>{copy.openSet}</Link></div></section> : <section className="cards-import">
      <p>{copy.intro}</p>
      <label className="cards-import-topic">{copy.setTitle}<input maxLength={120} value={title} disabled={busy} onChange={e => setTitle(e.target.value)}/></label>
      <div className="cards-actions secondary"><button type="button" className="button" disabled={busy} onClick={() => setPicked(new Set(candidates.slice(0, DEFAULT_PICKED).map(row => row.card.id)))}>{copy.pickTop}</button><button type="button" className="button" disabled={busy} onClick={() => setPicked(new Set(candidates.map(row => row.card.id)))}>{copy.pickAll}</button></div>
      <fieldset className="cards-fieldset" disabled={busy}><ul className="cards-review-pick">{candidates.map(({card, students: count, total}, index) => <li key={card.id}><label><input type="checkbox" checked={picked.has(card.id)} onChange={e => toggle(card.id, e.target.checked)} aria-label={`${index + 1}. ${card.front}`}/><strong>{card.front}</strong><span>{card.back}</span><small>{fill(copy.students, {count})} · {fill(copy.times, {count: total})}</small></label></li>)}</ul></fieldset>
      {words ? <><label className="cards-review-toggle"><input type="checkbox" checked={rewrite} disabled={busy} onChange={e => setRewrite(e.target.checked)}/><Sparkles size={15}/>{copy.rewrite}</label><p className="cards-muted">{copy.rewriteHint}</p></> : <p className="cards-muted">{copy.rewriteWordsOnly}</p>}
      <div className="cards-actions">{words && rewrite && <label className="cards-import-level">{copy.level}<select value={level} disabled={busy} onChange={e => setLevel(e.target.value as CardAiLevel)}>{CARD_AI_LEVELS.map(item => <option key={item} value={item}>{levels[item]}</option>)}</select></label>}
        <strong className="cards-import-count">{fill(copy.picked, {count: picked.size})}</strong>
        <button type="button" className="button primary" disabled={busy || !picked.size} onClick={() => void create()}>{busy ? copy.creating : copy.create}</button></div>
      {error && <div role="alert" className="cards-error"><span>{error}</span>{aiFailed && <button type="button" className="button" onClick={() => void create(false)}>{copy.keepExamples}</button>}</div>}
    </section>}
  </CardsDialog>;
}
