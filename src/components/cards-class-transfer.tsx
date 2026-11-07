'use client';
import {useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import type {CardSetType} from '@/lib/cards-types';
import type {CardTransferLink, CardTransferStudent} from '@/lib/cards-transfer';
import {useCardsCopy} from '@/lib/cards-copy';
import {fillCopy} from '@/lib/cards-class-copy';
import {useCardsP2Copy} from '@/lib/cards-p2-copy';
import {cardsRequest, CardsDialog, CardsLoading} from './cards-shared';
import '@/styles/cards-p2.css';

type Classroom = {id: string; name: string; year: number};
type Row = {id: string; title: string; type: CardSetType; cardCount: number; active: boolean; dueAt: string | null};
type Preview = {distributions: Row[]; from: CardTransferStudent[]; to: CardTransferStudent[]; links: CardTransferLink[]};
type Result = {distributions: number; students: number; seeded: number; settings: boolean; toClassId: string; toClassName: string};

/** 다른 반으로 옮기기: sets, class defaults and (학기말 이월) each linked student's card mastery, into another class this teacher owns. */
export default function CardsClassTransfer({classId, className, classes, onClose, onDone}: {classId: string; className: string; classes: Classroom[]; onClose: () => void; onDone: (notice: string) => void}) {
  const {t, locale} = useCardsCopy(), p = useCardsP2Copy();
  const others = classes.filter(room => room.id !== classId);
  const [toClassId, setToClassId] = useState(others[0]?.id ?? ''), [preview, setPreview] = useState<Preview | null>(null), [chosen, setChosen] = useState<string[]>([]);
  const [settings, setSettings] = useState(true), [keepDue, setKeepDue] = useState(false), [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!toClassId) return;
    let alive = true; setPreview(null); setError('');
    cardsRequest<Preview>(`/api/cards/classes/${encodeURIComponent(classId)}/transfer?toClassId=${encodeURIComponent(toClassId)}`).then(data => {
      if (!alive) return; setPreview(data); setChosen(current => current.length ? current.filter(item => data.distributions.some(row => row.id === item)) : data.distributions.filter(row => row.active).map(row => row.id));
      setLinks(Object.fromEntries(data.links.map(link => [link.to, link.from])));
    }).catch(cause => {if (alive) setError(locale === 'ko' && cause instanceof Error ? cause.message : t('error'));});
    return () => {alive = false;};
  }, [classId, toClassId]);
  const linked = useMemo(() => Object.entries(links).filter(([, from]) => from).map(([to, from]) => ({from, to})), [links]);
  const usedFrom = new Set(linked.map(link => link.from));
  async function run(event: FormEvent) {
    event.preventDefault(); if (busy || !preview) return; setBusy(true); setError('');
    try {
      const {result} = await cardsRequest<{result: Result}>(`/api/cards/classes/${encodeURIComponent(classId)}/transfer`, {method: 'POST', body: JSON.stringify({toClassId, distributionIds: chosen, settings, keepDue, links: linked, requestId: requestId.current})});
      requestId.current = crypto.randomUUID();
      onDone(fillCopy(p.transferDone, {to: result.toClassName, n: result.distributions}) + (result.students ? fillCopy(p.transferDoneStudents, {m: result.students}) : '') + (result.settings ? p.transferDoneSettings : ''));
    } catch (cause) {setError(locale === 'ko' && cause instanceof Error ? cause.message : t('error'));} finally {setBusy(false);}
  }
  return <CardsDialog title={fillCopy(p.transferTitle, {from: className})} closeLabel={t('close')} onClose={() => {if (!busy) onClose();}}>
    <form className="cards-transfer" onSubmit={run}>
      <p className="cards-muted">{p.transferHint}</p>
      {!others.length ? <p className="cards-error" role="alert">{p.noOtherClass}</p> : <>
        <label className="cards-transfer-target">{p.toClass}<select value={toClassId} disabled={busy} onChange={e => {setToClassId(e.target.value); setLinks({});}}>{others.map(room => <option key={room.id} value={room.id}>{room.name} · {room.year}</option>)}</select></label>
        {!preview ? error ? null : <CardsLoading label={t('loading')}/> : <fieldset className="cards-fieldset" disabled={busy}>
          <div className="cards-transfer-head"><h3>{p.setsToMove} <small>{chosen.length}/{preview.distributions.length}</small></h3>{preview.distributions.length > 0 && <label className="cards-check"><input type="checkbox" checked={chosen.length === preview.distributions.length} onChange={e => setChosen(e.target.checked ? preview.distributions.map(row => row.id) : [])}/>{p.selectAllSets}</label>}</div>
          {preview.distributions.length ? <ul className="cards-transfer-sets">{preview.distributions.map(row => <li key={row.id}><label className="cards-check"><input type="checkbox" checked={chosen.includes(row.id)} onChange={e => setChosen(current => e.target.checked ? [...current, row.id] : current.filter(item => item !== row.id))}/><span><strong>{row.title}</strong><small>{t(row.type)} · {row.cardCount} {t('cards')} · {row.active ? p.activeSet : p.stoppedSet}{row.dueAt ? ` · ${new Date(row.dueAt).toLocaleDateString(locale)}` : ''}</small></span></label></li>)}</ul> : <p className="cards-muted">{p.noSetsToMove}</p>}
          <label className="cards-check"><input type="checkbox" checked={settings} onChange={e => setSettings(e.target.checked)}/>{p.copySettings}</label><p className="cards-muted cards-transfer-sub">{p.copySettingsHint}</p>
          <label className="cards-check"><input type="checkbox" checked={keepDue} onChange={e => setKeepDue(e.target.checked)}/>{p.keepDue}</label><p className="cards-muted cards-transfer-sub">{p.keepDueHint}</p>
          <h3>{p.carryTitle} <small>{fillCopy(p.carryCount, {n: linked.length})}</small></h3>
          <p className="cards-muted">{p.carryHint}</p>
          <ul className="cards-transfer-notes"><li>{p.carryMoves}</li><li>{p.carryStays}</li></ul>
          {preview.to.filter(row => !row.disabled).length ? <ul className="cards-transfer-links">{preview.to.filter(row => !row.disabled).map(row => <li key={row.id}><span>{row.number}. {row.name}</span><select aria-label={`${row.number}. ${row.name}`} value={links[row.id] ?? ''} onChange={e => setLinks(current => ({...current, [row.id]: e.target.value}))}><option value="">{p.carryNone}</option>{preview.from.map(source => <option key={source.id} value={source.id} disabled={usedFrom.has(source.id) && links[row.id] !== source.id}>{source.number}. {source.name}{source.disabled ? ' ·' : ''}</option>)}</select></li>)}</ul> : <p className="cards-muted">{p.carryEmpty}</p>}
        </fieldset>}
      </>}
      {error && <p role="alert" className="cards-error">{error}</p>}
      <div className="cards-actions cards-dialog-footer"><button className="button primary" disabled={busy || !preview || (!chosen.length && !settings)}>{busy ? p.transferring : p.transferRun}</button></div>
    </form>
  </CardsDialog>;
}
