'use client';

import {useCallback, useEffect, useState} from 'react';
import {Download, LoaderCircle, Mic, Trash2} from 'lucide-react';
import {SPEAKING_REQUIRED_MAX, SPEAKING_STEPS, emptySpeakingRequired, speakingCards, speakingZipName, type SpeakingFile, type SpeakingRequired, type SpeakingStep, type SpeakingStudentRow, type SpeakingTakes} from '@/lib/cards-speaking';
import stepsKo from '@/messages/cards-speaking-steps-ko.json';
import stepsEn from '@/messages/cards-speaking-steps-en.json';
import type {CardDistribution} from '@/lib/cards-types';
import {cardsRequest} from './cards-shared';
import {saveSpeakingZip, useSpeakingCopy} from './cards-speaking-copy';
import '@/styles/cards-speaking.css';

type Summary = {enabled: boolean; required?: SpeakingRequired; total: number; students: SpeakingStudentRow[]};

/** The report screen's speaking section: open it to students, listen by student, download everything. */
export function CardsSpeakingPanel({distribution}: {distribution: CardDistribution}) {
  const {c, fill, locale} = useSpeakingCopy(), steps = locale === 'ko' ? stepsKo : stepsEn, base = `/api/cards/distributions/${encodeURIComponent(distribution.id)}/speaking`;
  const [summary, setSummary] = useState<Summary | null>(null), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{id: string; takes: SpeakingTakes} | null>(null), [progress, setProgress] = useState<{done: number; total: number} | null>(null);
  const load = useCallback(async () => {
    try {setSummary(await cardsRequest<Summary>(base)); setFailed(false);} catch {setFailed(true);}
  }, [base]);
  useEffect(() => {void load();}, [load]);
  async function attempt(work: () => Promise<void>) {
    setBusy(true); setFailed(false);
    try {await work();} catch {setFailed(true);} finally {setBusy(false); setProgress(null);}
  }
  const toggle = (enabled: boolean) => attempt(async () => {await cardsRequest(base, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({enabled})}); setSummary(value => value && {...value, enabled});});
  // 단계별 필수 횟수 (0 = 자율). Students see "필수 n회" on each step and the progress counts only those steps.
  const setRequired = (step: SpeakingStep, value: number) => attempt(async () => {const next = {...(summary?.required ?? emptySpeakingRequired()), [step]: value}; const result = await cardsRequest<{required: SpeakingRequired}>(base, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({required: next})}); setSummary(current => current && {...current, required: result.required}); await load();});
  const listen = (student: SpeakingStudentRow) => {
    if (open?.id === student.id) {setOpen(null); return;}
    void attempt(async () => {const {takes} = await cardsRequest<{takes: SpeakingTakes}>(`${base}?student=${encodeURIComponent(student.id)}`); setOpen({id: student.id, takes});});
  };
  const save = (query: string, zipName: (name: string) => string) => attempt(async () => {
    const {files, name} = await cardsRequest<{files: SpeakingFile[]; name?: string}>(`${base}?${query}`);
    setProgress({done: 0, total: files.length});
    await saveSpeakingZip(files, zipName(name ?? ''), done => setProgress({done, total: files.length}));
  });
  const removeAll = () => {
    if (!window.confirm(c.teacherDeleteConfirm)) return;
    void attempt(async () => {await cardsRequest(base, {method: 'DELETE'}); setOpen(null); await load();});
  };
  if (!summary) return failed ? <section className="csp-panel"><h2><Mic size={18}/>{c.teacherTitle}</h2><p className="csp-status is-error" role="alert">{c.teacherFailed}</p></section> : null;
  const recorded = summary.students.filter(student => student.recorded > 0).length, cards = speakingCards(distribution.snapshot.cards);
  return <section className="csp-panel" aria-labelledby="csp-panel-title">
    <h2 id="csp-panel-title"><Mic size={18}/>{c.teacherTitle}</h2>
    <p className="csp-panel-hint">{c.teacherHint}</p>
    <label className="csp-switch"><input type="checkbox" checked={summary.enabled} disabled={busy} onChange={event => void toggle(event.target.checked)}/>{c.teacherSwitch}</label>
    {summary.enabled && <div className="csp-required"><b>{locale === 'ko' ? '단계별 필수 횟수' : 'Required rounds per step'}</b><div>{SPEAKING_STEPS.map(step => <label key={step}>{steps[step]}<select value={summary.required?.[step] ?? 0} disabled={busy} onChange={event => void setRequired(step, Number(event.target.value))}>{Array.from({length: SPEAKING_REQUIRED_MAX + 1}, (_, n) => <option key={n} value={n}>{n === 0 ? steps.free : fill(steps.requiredTimes, {n})}</option>)}</select></label>)}</div></div>}
    {failed && <p className="csp-status is-error" role="alert">{c.teacherFailed}</p>}
    {(summary.enabled || recorded > 0) && <>
      <div className="csp-tools"><span>{fill(c.teacherCount, {done: recorded, total: summary.students.length})}</span><div>
        <button type="button" className="button" disabled={busy || !recorded} onClick={() => void save('all=1', () => speakingZipName(distribution.title))}>{progress ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>}{progress ? fill('{done} / {total}', progress) : c.teacherDownloadAll}</button>
        <button type="button" className="button csp-danger" disabled={busy || !recorded} onClick={removeAll}><Trash2 size={16}/>{c.teacherDelete}</button>
      </div></div>
      {recorded === 0 ? <p className="cg-muted">{c.teacherNone}</p> : <ul className="csp-rows">{summary.students.map(student => <li key={student.id}>
        <div className="csp-row"><span>{student.number ? `${student.number}. ` : ''}{student.name}</span><b>{typeof student.percent === 'number' ? `${student.percent}% · ` : ''}{student.recorded} / {summary.total}</b><div>
          <button type="button" className="button" disabled={busy || !student.recorded} onClick={() => listen(student)}>{open?.id === student.id ? c.teacherClose : c.teacherListen}</button>
          <button type="button" className="button" disabled={busy || !student.recorded} aria-label={`${student.name} ${c.teacherDownloadOne}`} onClick={() => void save(`student=${encodeURIComponent(student.id)}&all=1`, name => speakingZipName(distribution.title, name))}><Download size={16}/></button>
        </div></div>
        {open?.id === student.id && <div className="csp-takes">{cards.filter(card => open.takes[card.id]?.url).map(card => <div className="csp-take" key={card.id}><span>{card.front}</span><audio controls preload="none" src={open.takes[card.id].url}/></div>)}</div>}
      </li>)}</ul>}
    </>}
  </section>;
}
