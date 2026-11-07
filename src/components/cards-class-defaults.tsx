'use client';
import {useEffect, useState, type FormEvent} from 'react';
import type {CardAfterDue, CardDirection, CardDistributionSummary, CardSetType, CardTestFormat, CardTestSettings} from '@/lib/cards-types';
import {CARD_CLASS_MODES, CARD_CLASS_TYPES, CARD_PERCENTS, CARD_SPEECH_RATES, classSettingsPath, patchFromDefaults, type CardClassDefaults, type CardClassDefaultsByType, type CardClassSettings} from '@/lib/cards-class-plan';
import {useCardsCopy} from '@/lib/cards-copy';
import {fillCopy, useCardsClassCopy} from '@/lib/cards-class-copy';
import {cardsRequest, CardsDialog, CardsLoading} from './cards-shared';
import {CardsRewardToggle} from './cards-rewards';
import '@/styles/cards-class.css';

/** 우리 반 학습 기본값: per set type, what a new distribution starts from. Saving never touches distributions already given out. */
export default function CardsClassDefaults({classId, className, distributions, onClose, onChanged}: {classId: string; className: string; distributions: CardDistributionSummary[]; onClose: () => void; onChanged: (notice: string) => void}) {
  const {t, locale} = useCardsCopy(), c = useCardsClassCopy();
  const [settings, setSettings] = useState<CardClassSettings | null>(null), [draft, setDraft] = useState<CardClassDefaultsByType | null>(null), [type, setType] = useState<CardSetType>('word');
  const [allClasses, setAllClasses] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirming, setConfirming] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {let alive = true; setError(''); cardsRequest<{settings: CardClassSettings}>(classSettingsPath(classId)).then(data => {if (alive) {setSettings(data.settings); setDraft(data.settings.defaults);}}).catch(() => {if (alive) setError(t('error'));}); return () => {alive = false;};}, [classId, revision]);
  const failure = (cause: unknown) => setError(locale === 'ko' && cause instanceof Error ? cause.message : t('error'));
  const dirty = !!settings && !!draft && JSON.stringify(settings.defaults) !== JSON.stringify(draft);
  const value = draft?.[type], typeLabel = t(type), active = distributions.filter(item => item.active && item.type === type && item.classId === classId);
  const update = (change: (current: CardClassDefaults) => CardClassDefaults) => {setNotice(''); setConfirming(false); setDraft(current => current && {...current, [type]: change(current[type])});};
  const setTest = <K extends keyof CardClassDefaults['test']>(key: K, next: CardClassDefaults['test'][K]) => update(current => ({...current, test: {...current.test, [key]: next}}));
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !draft || !settings) return; setBusy(true); setError('');
    try {const result = await cardsRequest<{settings: CardClassSettings; classes: number}>(classSettingsPath(classId), {method: 'PATCH', body: JSON.stringify({defaults: draft, expectedRevision: settings.revision, ...(allClasses ? {allClasses: true} : {})})}); setSettings(result.settings); setDraft(result.settings.defaults); const message = result.classes > 1 ? fillCopy(c.savedAll, {n: result.classes}) : c.savedDefaults; setNotice(message); onChanged(message);}
    catch (cause) {failure(cause);} finally {setBusy(false);}
  }
  /** Runs the same PATCH as [설정 수정], one distribution at a time, and says how many did not change. */
  async function applyExisting() {
    if (busy || !settings || dirty) return; setBusy(true); setError(''); let done = 0, failed = 0;
    for (const item of active) {try {await cardsRequest(`/api/cards/distributions/${encodeURIComponent(item.id)}`, {method: 'PATCH', body: JSON.stringify(patchFromDefaults(settings.defaults[type], item))}); done++;} catch {failed++;}}
    setBusy(false); setConfirming(false); const message = fillCopy(c.applyDone, {n: done}); setNotice(message); if (failed) setError(fillCopy(c.applyFailed, {n: failed})); if (done) onChanged(message);
  }
  const directionSelect = (current: CardDirection, onChange: (next: CardDirection) => void, label: string) => <label>{label}<select value={current} onChange={e => onChange(e.target.value as CardDirection)}><option value="front-back">{t('frontBack')}</option><option value="back-front">{t('backFront')}</option></select></label>;
  return <CardsDialog title={`${c.defaults} · ${className}`} closeLabel={t('close')} onClose={() => {if (!busy && (!dirty || window.confirm(c.unsaved))) onClose();}}>
    {!draft || !value ? error ? <><p role="alert" className="cards-error">{error}</p><button type="button" className="button" onClick={() => setRevision(v => v + 1)}>{t('retry')}</button></> : <CardsLoading label={t('loading')}/> : <form className="cards-class-defaults" onSubmit={save}>
      <p className="cards-muted">{c.defaultsHint}</p>
      <div className="cards-class-tabs" role="tablist" aria-label={t('type')}>{CARD_CLASS_TYPES.map(item => <button key={item} type="button" role="tab" aria-selected={type === item} onClick={() => {setType(item); setConfirming(false); setNotice('');}}>{t(item)}</button>)}</div>
      <fieldset className="cards-fieldset" disabled={busy}>
        <h3>{t('requiredStudy')}</h3><p className="cards-muted">{c.percentHint}</p>
        <div className="cards-class-modes">{CARD_CLASS_MODES.map(mode => {const rule = value.modes[mode], set = (next: Partial<typeof rule>) => update(current => ({...current, modes: {...current.modes, [mode]: {...current.modes[mode], ...next}}})); return <section className={`cards-class-mode${rule.on ? '' : ' is-off'}`} key={mode}><label className="cards-check"><input type="checkbox" checked={rule.on} onChange={e => set({on: e.target.checked})}/><strong>{t(mode)}</strong> <span className="cards-muted">{c.required}</span></label><div className="cards-form-grid"><label>{c.amount}<select disabled={!rule.on} value={rule.percent} onChange={e => set({percent: Number(e.target.value)})}>{CARD_PERCENTS.map(percent => <option key={percent} value={percent}>{percent}%</option>)}</select></label>{directionSelect(rule.direction, direction => set({direction}), t('direction'))}</div></section>;})}</div>
        <div className="cards-form-grid"><label>{c.speechRate}<select value={value.speechRate} onChange={e => update(current => ({...current, speechRate: Number(e.target.value)}))}>{CARD_SPEECH_RATES.map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select><small className="cards-muted">{c.speechHint}</small></label></div>
        <h3>{t('testSettings')}</h3>
        <div className="cards-form-grid four"><label>{t('testFormat')}<select value={value.test.format} onChange={e => setTest('format', e.target.value as CardTestFormat)}><option value="written">{t('formatWritten')}</option><option value="choice">{t('formatChoice')}</option></select></label><label>{t('questionCount')}<input type="number" min={1} max={200} required value={value.test.questionCount} onChange={e => setTest('questionCount', Number(e.target.value))}/></label><label>{t('goal')}<input type="number" min={0} max={100} required value={value.test.goalScore} onChange={e => setTest('goalScore', Number(e.target.value))}/></label><label>{t('maxAttempts')}<input type="number" min={1} max={20} required value={value.test.maxAttempts} onChange={e => setTest('maxAttempts', Number(e.target.value))}/></label><label>{t('timeLimitMinutes')}<input type="number" min={1} max={120} step={1} placeholder={t('noTimeLimit')} value={value.test.timeLimitMinutes ?? ''} onChange={e => setTest('timeLimitMinutes', e.target.value ? Number(e.target.value) : null)}/></label>{directionSelect(value.test.direction, direction => setTest('direction', direction), t('direction'))}<label>{t('answerRelease')}<select value={value.test.answerRelease} onChange={e => setTest('answerRelease', e.target.value as CardTestSettings['answerRelease'])}><option value="immediate">{t('immediate')}</option><option value="after-due">{t('afterDue')}</option><option value="never">{t('never')}</option></select></label><label>{t('afterDueRule')}<select value={value.afterDue} onChange={e => update(current => ({...current, afterDue: e.target.value as CardAfterDue}))}><option value="open">{t('afterDueOpen')}</option><option value="late">{t('afterDueLate')}</option><option value="lock">{t('afterDueLock')}</option></select><small className="cards-muted">{c.afterDueHint}</small></label></div>
        <label className="cards-check"><input type="checkbox" checked={value.test.requireStudy} onChange={e => setTest('requireStudy', e.target.checked)}/>{t('prerequisite')}</label>
        <label className="cards-check"><input type="checkbox" checked={allClasses} onChange={e => setAllClasses(e.target.checked)}/>{c.allClasses}<span className="cards-muted">{c.allClassesHint}</span></label>
      </fieldset>
      <CardsRewardToggle classId={classId}/>
      <section className="cards-class-apply" aria-live="polite"><h3>{c.applyExisting}</h3>{!active.length ? <p className="cards-muted">{fillCopy(c.noExisting, {type: typeLabel})}</p> : dirty ? <p className="cards-muted">{c.saveFirst}</p> : !confirming ? <button type="button" className="button" disabled={busy} onClick={() => setConfirming(true)}>{c.applyExisting} ({active.length})</button> : <div className="cards-class-confirm" role="alertdialog" aria-label={c.applyExisting}><p>{fillCopy(c.applyExistingHint, {type: typeLabel, n: active.length})}</p><div className="cards-actions"><button type="button" className="button" disabled={busy} onClick={() => setConfirming(false)}>{t('cancel')}</button><button type="button" className="button primary" disabled={busy} onClick={() => void applyExisting()}>{busy ? c.applying : fillCopy(c.applyConfirm, {n: active.length})}</button></div></div>}</section>
      {notice && <p role="status" className="cards-notice">{notice}</p>}{error && <p role="alert" className="cards-error">{error}</p>}
      <div className="cards-dialog-footer cards-actions"><button type="button" className="button" disabled={busy} onClick={() => {if (!dirty || window.confirm(c.unsaved)) onClose();}}>{t('close')}</button><button className="button primary" disabled={busy || !dirty && !allClasses}>{t(busy ? 'saving' : 'save')}</button></div>
    </form>}
  </CardsDialog>;
}
