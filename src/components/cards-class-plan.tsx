'use client';
import {useEffect, useState} from 'react';
import {ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Layers, Plus, StickyNote, Star, Trash2} from 'lucide-react';
import type {CardDistributionSummary} from '@/lib/cards-types';
import {CARD_PLAN_MEMOS, CARD_PLAN_MEMO_CHARS, classSettingsPath, moveRow, orderWithPlan, planFromRows, type CardClassSettings, type CardPlanRow} from '@/lib/cards-class-plan';
import {useCardsCopy} from '@/lib/cards-copy';
import {fillCopy, useCardsClassCopy} from '@/lib/cards-class-copy';
import {cardsRequest, CardsDialog, CardsLoading} from './cards-shared';
import '@/styles/cards-class.css';

type Row = CardPlanRow<CardDistributionSummary>;
/** 차시 메모·순서: the class's list as students will see it. Drag on a desktop, arrow buttons on a phone or keyboard. */
export default function CardsClassPlan({classId, className, distributions, onClose, onSaved}: {classId: string; className: string; distributions: CardDistributionSummary[]; onClose: () => void; onSaved: (notice: string) => void}) {
  const {t, locale} = useCardsCopy(), c = useCardsClassCopy();
  const [settings, setSettings] = useState<CardClassSettings | null>(null), [rows, setRows] = useState<Row[] | null>(null), [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dragging, setDragging] = useState<number | null>(null), [revision, setRevision] = useState(0), [status, setStatus] = useState('');
  const mine = distributions.filter(item => item.classId === classId);
  useEffect(() => {let alive = true; setError(''); cardsRequest<{settings: CardClassSettings}>(classSettingsPath(classId)).then(data => {if (!alive) return; const ordered = orderWithPlan(mine, data.settings.plan); setSettings(data.settings); setRows(ordered); setSaved(JSON.stringify(planFromRows(ordered)));}).catch(() => {if (alive) setError(t('error'));}); return () => {alive = false;};}, [classId, revision]);
  const fresh = new Set(settings ? mine.filter(item => !settings.plan.some(entry => entry.kind === 'set' && entry.id === item.id)).map(item => item.id) : []);
  const dirty = !!rows && JSON.stringify(planFromRows(rows)) !== saved, memoCount = rows?.filter(row => row.kind === 'memo').length ?? 0;
  const edit = (change: (current: Row[]) => Row[]) => {setError(''); setRows(current => current && change(current));};
  const move = (from: number, to: number) => {edit(current => moveRow(current, from, to)); setStatus(`${from + 1} → ${to + 1}`);};
  const patch = (index: number, next: Partial<Row>) => edit(current => current.map((row, at) => at === index ? {...row, ...next} as Row : row));
  const addMemo = (at: number) => {if (memoCount >= CARD_PLAN_MEMOS) {setError(fillCopy(c.memoLimit, {n: CARD_PLAN_MEMOS})); return;} edit(current => [...current.slice(0, at), {kind: 'memo', id: crypto.randomUUID(), text: '', highlight: false, hidden: false}, ...current.slice(at)]);};
  async function save() {
    if (!rows || !settings || busy) return;
    if (rows.some(row => row.kind === 'memo' && !row.text.trim())) {setError(c.emptyMemo); return;}
    setBusy(true); setError('');
    try {const result = await cardsRequest<{settings: CardClassSettings}>(classSettingsPath(classId), {method: 'PATCH', body: JSON.stringify({plan: planFromRows(rows), expectedRevision: settings.revision})}); const ordered = orderWithPlan(mine, result.settings.plan); setSettings(result.settings); setRows(ordered); setSaved(JSON.stringify(planFromRows(ordered))); onSaved(t('saved'));}
    catch (cause) {setError(locale === 'ko' && cause instanceof Error ? cause.message : t('error'));} finally {setBusy(false);}
  }
  const close = () => {if (!busy && (!dirty || window.confirm(c.unsaved))) onClose();};
  return <CardsDialog title={`${c.plan} · ${className}`} closeLabel={t('close')} onClose={close}>
    {!rows ? error ? <><p role="alert" className="cards-error">{error}</p><button type="button" className="button" onClick={() => setRevision(v => v + 1)}>{t('retry')}</button></> : <CardsLoading label={t('loading')}/> : <div className="cards-class-plan">
      <p className="cards-muted">{c.planHint}</p>
      <button type="button" className="button cards-plan-add" disabled={busy} onClick={() => addMemo(0)}><Plus size={15}/>{c.addMemo}</button>
      {!rows.length && <p className="cards-muted">{c.noRows}</p>}
      <ol className="cards-plan-list">{rows.map((row, index) => <li key={`${row.kind}:${row.id}`} className={`cards-plan-row ${row.kind}${row.highlight ? ' is-highlight' : ''}${row.hidden ? ' is-hidden' : ''}${dragging === index ? ' is-dragging' : ''}`} onDragOver={event => {if (dragging !== null) event.preventDefault();}} onDrop={event => {event.preventDefault(); if (dragging !== null) move(dragging, index); setDragging(null);}} >
        <span className="cards-plan-grip" title={c.drag} aria-hidden="true" draggable={!busy} onDragStart={event => {setDragging(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); const row = event.currentTarget.closest('li'); if (row) event.dataTransfer.setDragImage(row, 16, 16);}} onDragEnd={() => setDragging(null)}><GripVertical size={17}/></span>
        <div className="cards-plan-body">{row.kind === 'memo' ? <label className="cards-plan-memo"><StickyNote size={16} aria-hidden="true"/><span className="cards-sr-only">{c.memoLabel}</span><input value={row.text} maxLength={CARD_PLAN_MEMO_CHARS} placeholder={c.memoPlaceholder} disabled={busy} autoFocus={!row.text} onChange={e => patch(index, {text: e.target.value})}/></label> : <><span className={`cards-set-icon ${row.distribution.type}`}><Layers size={18}/></span><span className="cards-plan-copy"><strong>{row.distribution.title}</strong><small>{t(row.distribution.type)} · {row.distribution.cardCount} {t('cards')} · {new Date(row.distribution.createdAt).toLocaleDateString(locale)}{fresh.has(row.id) && <span className="cards-badge accent">{c.newTag}</span>}{!row.distribution.active && <span className="cards-badge">{c.inactiveTag}</span>}</small></span></>}
          {row.hidden && <span className="cards-badge">{c.hiddenTag}</span>}</div>
        <div className="cards-plan-tools"><button type="button" className="icon-button" aria-label={`${c.moveUp} · ${index + 1}`} disabled={busy || index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={16}/></button><button type="button" className="icon-button" aria-label={`${c.moveDown} · ${index + 1}`} disabled={busy || index === rows.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={16}/></button><button type="button" className="icon-button" aria-pressed={row.highlight} aria-label={row.highlight ? c.unhighlight : c.highlight} disabled={busy} onClick={() => patch(index, {highlight: !row.highlight})}><Star size={16} fill={row.highlight ? 'currentColor' : 'none'}/></button><button type="button" className="icon-button" aria-pressed={row.hidden} aria-label={row.hidden ? c.show : c.hide} disabled={busy} onClick={() => patch(index, {hidden: !row.hidden})}>{row.hidden ? <EyeOff size={16}/> : <Eye size={16}/>}</button>{row.kind === 'memo' ? <button type="button" className="icon-button" aria-label={c.removeMemo} disabled={busy} onClick={() => edit(current => current.filter((_, at) => at !== index))}><Trash2 size={16}/></button> : <button type="button" className="icon-button" aria-label={`${c.addMemo} · ${index + 1}`} title={c.addMemo} disabled={busy} onClick={() => addMemo(index + 1)}><Plus size={16}/></button>}</div>
      </li>)}</ol>
      <p className="cards-sr-only" role="status">{status}</p>
      {error && <p role="alert" className="cards-error">{error}</p>}
      <div className="cards-dialog-footer cards-actions"><span className="cards-muted">{memoCount}/{CARD_PLAN_MEMOS}</span><button type="button" className="button" disabled={busy} onClick={close}>{t('close')}</button><button type="button" className="button primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? t('saving') : c.savePlan}</button></div>
    </div>}
  </CardsDialog>;
}
