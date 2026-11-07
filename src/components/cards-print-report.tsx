'use client';
import {useMemo, useState, type FormEvent, type ReactNode} from 'react';
import {ClipboardList, FileDown, LoaderCircle, NotebookPen} from 'lucide-react';
import type {CardDistribution, CardReportStudent} from '@/lib/cards-types';
import {useCardsCopy} from '@/lib/cards-copy';
import {estimatePrintWidth} from '@/lib/cards-print';
import {defaultCardReportPrintOptions, layoutCardReportPrint, type CardReportPrintCopyKey, type CardReportPrintInput, type CardReportPrintOptions} from '@/lib/cards-print-report';
import ko from '@/messages/cards-print-ko.json';
import en from '@/messages/cards-print-en.json';
import {CardsDialog, downloadCardsFile} from './cards-shared';
import {printFont} from './cards-print-font';
import '@/styles/cards-print.css';

type CopyKey = keyof typeof ko;
const MODE_KEYS = new Set(['memorize', 'recall', 'spell']);
/** 오답노트 and 성적표 from the report already on screen. Everything stays on this device: the PDF is drawn here and downloaded. */
export default function CardsReportPrint({report, onClose}: {report: {distribution: CardDistribution; students: CardReportStudent[]}; onClose: () => void}) {
  const {t, locale} = useCardsCopy(), copy = locale === 'ko' ? ko : en, {distribution, students} = report;
  const [options, setOptions] = useState<CardReportPrintOptions>(defaultCardReportPrintOptions), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notes, setNotes] = useState<string[]>([]);
  const change = (patch: Partial<CardReportPrintOptions>) => {setOptions(current => ({...current, ...patch})); setNotes([]); setError('');};
  const fill = (key: CopyKey, values: Record<string, string | number>) => Object.entries(values).reduce<string>((text, [name, value]) => text.replace(`{${name}}`, String(value)), copy[key]);
  const input = useMemo<CardReportPrintInput>(() => ({title: distribution.title, className: distribution.className, date: new Date().toLocaleDateString(locale), type: distribution.type, cards: distribution.snapshot.cards, requiredModes: distribution.requiredModes, students, options, copy: (key: CardReportPrintCopyKey) => MODE_KEYS.has(key) ? t(key as 'memorize') : copy[key as CopyKey]}), [distribution, students, options, locale, copy, t]);
  const preview = useMemo(() => layoutCardReportPrint(input, estimatePrintWidth), [input]), blocked = !preview.pages.length, notesKind = options.kind === 'notes';
  const kindName = copy[notesKind ? (options.scope === 'class' ? 'printNotesClass' : 'printNotesTitle') : 'printGradesTitle'];
  async function make(event: FormEvent) {
    event.preventDefault(); if (busy || blocked) return;
    setBusy(true); setError(''); setNotes([]);
    try {
      const [bytes, {renderCardPrintPdf}] = await Promise.all([printFont().catch(() => {throw new Error(copy.printFontError);}), import('@/lib/cards-print-pdf')]);
      const result = await renderCardPrintPdf(measure => layoutCardReportPrint(input, measure), bytes, {title: `${distribution.title} ${kindName}`, language: locale});
      downloadCardsFile(`${distribution.title} ${kindName}.pdf`, result.bytes as BlobPart, 'application/pdf');
      setNotes([copy.printDone, ...(result.missing.length ? [fill('printMissing', {chars: result.missing.slice(0, 12).join(' ')})] : [])]);
    } catch (cause) {setError(cause instanceof Error && cause.message === copy.printFontError ? cause.message : copy.printError);} finally {setBusy(false);}
  }
  const field = (label: string, control: ReactNode) => <section className="cards-print-field"><h3>{label}</h3>{control}</section>;
  const kinds: [CardReportPrintOptions['kind'], CopyKey, CopyKey, typeof NotebookPen][] = [['notes', 'printNotes', 'printNotesHint', NotebookPen], ['grades', 'printGrades', 'printGradesHint', ClipboardList]];
  const sorted = [...students].sort((a, b) => a.number - b.number);
  return <CardsDialog title={`${t('print')} · ${distribution.title}`} closeLabel={t('close')} onClose={() => {if (!busy) onClose();}}><form className="cards-print" onSubmit={make}>
    <p className="cards-muted">{copy.printReportHint}</p>
    <div className="cards-print-kinds two" role="group" aria-label={copy.printKind}>{kinds.map(([kind, name, hint, Icon]) => <button type="button" key={kind} className={options.kind === kind ? 'is-active' : ''} aria-pressed={options.kind === kind} onClick={() => change({kind})}><Icon size={21}/><strong>{copy[name]}</strong><small>{copy[hint]}</small></button>)}</div>
    <div className="cards-print-layout"><fieldset className="cards-fieldset" disabled={busy}>
      {notesKind && <>{field(copy.printScope, <div className="cards-print-pair"><label className="cards-check"><input type="radio" name="cards-report-scope" checked={options.scope === 'students'} onChange={() => change({scope: 'students'})}/>{copy.printScopeStudents}</label><label className="cards-check"><input type="radio" name="cards-report-scope" checked={options.scope === 'class'} onChange={() => change({scope: 'class'})}/>{copy.printScopeClass}</label></div>)}
        {field(copy.printNotes, <><div className="cards-form-grid">{options.scope === 'students' && <label>{copy.printStudent}<select value={options.studentId} onChange={event => change({studentId: event.target.value})}><option value="">{copy.printAllStudents}</option>{sorted.map(student => <option key={student.id} value={student.id}>{student.number}. {student.name}</option>)}</select></label>}<label>{copy.printLimit}<select value={options.limit} onChange={event => change({limit: Number(event.target.value) as 5 | 10 | 20})}>{[5, 10, 20].map(n => <option key={n} value={n}>{fill('printLimitN', {n})}</option>)}</select></label></div>
          {options.scope === 'students' && !options.studentId && <label className="cards-check"><input type="checkbox" checked={options.perPage} onChange={event => change({perPage: event.target.checked})}/>{copy.printPerPage}</label>}</>)}</>}
      {!notesKind && field(copy.printGradesLayout, <div className="cards-print-pair"><label className="cards-check"><input type="radio" name="cards-report-grades" checked={options.grades === 'table'} onChange={() => change({grades: 'table'})}/>{copy.printGradesTable}</label><label className="cards-check"><input type="radio" name="cards-report-grades" checked={options.grades === 'slips'} onChange={() => change({grades: 'slips'})}/>{copy.printGradesSlips}</label></div>)}
    </fieldset>
    <aside className="cards-print-summary" role="status"><h3>{copy.printSummary}</h3><strong>{kindName}</strong><p>{notesKind && options.scope === 'class' ? fill('printSummaryCards', {n: preview.total}) : fill('printSummaryStudents', {n: preview.total})} · {fill('printPages', {n: preview.pages.length})}</p>{blocked && <p className="cards-error">{notesKind ? copy.printNothing : t('noActivity')}</p>}{notes.map(note => <p key={note}>{note}</p>)}</aside></div>
    {error && <p role="alert" className="cards-error">{error}</p>}
    <div className="cards-dialog-footer cards-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>{t('close')}</button><button className="button primary" disabled={busy || blocked}>{busy ? <LoaderCircle className="spin" size={16}/> : <FileDown size={16}/>}{copy[busy ? 'printMaking' : 'printMake']}</button></div>
  </form></CardsDialog>;
}
