'use client';
import {useEffect, useMemo, useState, type FormEvent, type ReactNode} from 'react';
import {FileDown, FileQuestion, FileText, KeyRound, LayoutGrid, LoaderCircle, RefreshCw} from 'lucide-react';
import type {CardSet} from '@/lib/cards-types';
import {useCardsCopy} from '@/lib/cards-copy';
import {clampPrintCounts, defaultCardPrintOptions, estimatePrintWidth, layoutCardPrint, printRange, restoreCardPrintOptions, type CardPrintCountKey, type CardPrintInput, type CardPrintKind, type CardPrintOptions} from '@/lib/cards-print';
import ko from '@/messages/cards-print-ko.json';
import en from '@/messages/cards-print-en.json';
import {CardsDialog, downloadCardsFile} from './cards-shared';
import '@/styles/cards-print.css';

const FONT_URL = '/cards/v1/fonts/NanumGothic-Regular.ttf', kinds: [CardPrintKind, keyof typeof ko, keyof typeof ko, typeof FileText][] = [['list', 'printList', 'printListHint', FileText], ['cards', 'printCards', 'printCardsHint', LayoutGrid], ['test', 'printTest', 'printTestHint', FileQuestion], ['key', 'printKey', 'printKeyHint', KeyRound]];
const countKeys: CardPrintCountKey[] = ['frontChoice', 'backChoice', 'frontWritten', 'backWritten'];
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
let font: Promise<Uint8Array> | null = null;
/** The font is only fetched for a teacher who presses the button. A failed fetch is forgotten so the next press retries. */
const printFont = () => font ||= fetch(FONT_URL, {signal: AbortSignal.timeout(30000)}).then(async response => {if (!response.ok) throw new Error('font'); return new Uint8Array(await response.arrayBuffer());}).catch(cause => {font = null; throw cause;});

function Choice<T extends string | number>({label, value, options, onChange}: {label: string; value: T; options: [T, string][]; onChange: (value: T) => void}) {
  return <label>{label}<select value={value} onChange={event => onChange(options.find(([item]) => String(item) === event.target.value)![0])}>{options.map(([item, name]) => <option key={item} value={item}>{name}</option>)}</select></label>;
}
export default function CardsPrint({set, onClose}: {set: CardSet; onClose: () => void}) {
  const {t, locale} = useCardsCopy(), copy = locale === 'ko' ? ko : en, count = set.cards.length, storage = `cards-print:${set.id}`;
  const [options, setOptions] = useState<CardPrintOptions>(() => {
    const fresh = defaultCardPrintOptions(set.type, count, newSeed());
    try {return restoreCardPrintOptions(JSON.parse(localStorage.getItem(storage) || 'null'), fresh, count);} catch {return fresh;}
  });
  const [ranged, setRanged] = useState(options.start !== 1 || options.end !== count), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notes, setNotes] = useState<string[]>([]);
  // Remembering the seed is what lets a teacher come back later and still make the key for a test they printed.
  useEffect(() => {try {localStorage.setItem(storage, JSON.stringify(options));} catch {}}, [options, storage]);
  const change = (patch: Partial<CardPrintOptions>) => {setOptions(current => ({...current, ...patch})); setNotes([]); setError('');};
  const {start, end} = printRange(options, count), available = end - start + 1, counts = clampPrintCounts(options.counts, available), total = countKeys.reduce((sum, key) => sum + counts[key], 0), asksTest = options.kind === 'test' || options.kind === 'key';
  const input = useMemo<CardPrintInput>(() => ({title: set.title, type: set.type, cards: set.cards, options, copy: key => copy[key]}), [copy, options, set]);
  const preview = useMemo(() => layoutCardPrint(input, estimatePrintWidth), [input]), blocked = asksTest && !total, kindName = copy[kinds.find(([kind]) => kind === options.kind)![1]];
  const fill = (key: keyof typeof ko, values: Record<string, string | number>) => Object.entries(values).reduce<string>((text, [name, value]) => text.replace(`{${name}}`, String(value)), copy[key]);
  const front = copy[set.type === 'word' ? 'printPromptFrontWord' : 'printPromptFrontSentence'], countLabels: Record<CardPrintCountKey, string> = {frontChoice: `${front} · ${copy.printChoice}`, backChoice: `${copy.printPromptBack} · ${copy.printChoice}`, frontWritten: `${front} · ${copy.printWritten}`, backWritten: `${copy.printPromptBack} · ${copy.printWritten}`};
  const warnings = [preview.shortChoices ? fill('printShortChoices', {n: preview.shortChoices}) : '', preview.truncated ? fill('printTruncated', {n: preview.truncated}) : ''].filter(Boolean);
  async function make(event: FormEvent) {
    event.preventDefault(); if (busy || blocked) return;
    setBusy(true); setError(''); setNotes([]);
    try {
      const [bytes, {renderCardPrintPdf}] = await Promise.all([printFont().catch(() => {throw new Error(copy.printFontError);}), import('@/lib/cards-print-pdf')]);
      const result = await renderCardPrintPdf(measure => layoutCardPrint(input, measure), bytes, {title: set.title, language: locale});
      downloadCardsFile(`${set.title} ${kindName}${result.layout.code ? ` ${result.layout.code}` : ''}.pdf`, result.bytes as BlobPart, 'application/pdf');
      setNotes([copy.printDone, ...(result.missing.length ? [fill('printMissing', {chars: result.missing.slice(0, 12).join(' ')})] : [])]);
    } catch (cause) {setError(cause instanceof Error && cause.message === copy.printFontError ? cause.message : copy.printError);} finally {setBusy(false);}
  }
  const field = (label: string, control: ReactNode) => <section className="cards-print-field"><h3>{label}</h3>{control}</section>;
  return <CardsDialog title={`${t('print')} · ${set.title}`} closeLabel={t('close')} onClose={() => {if (!busy) onClose();}}><form className="cards-print" onSubmit={make}>
    <p className="cards-muted">{copy.printHint}</p>
    <div className="cards-print-kinds" role="group" aria-label={copy.printKind}>{kinds.map(([kind, name, hint, Icon]) => <button type="button" key={kind} className={options.kind === kind ? 'is-active' : ''} aria-pressed={options.kind === kind} onClick={() => change({kind})}><Icon size={21}/><strong>{copy[name]}</strong><small>{copy[hint]}</small></button>)}</div>
    <div className="cards-print-layout"><fieldset className="cards-fieldset" disabled={busy}>
      {field(copy.printRange, <><div className="cards-print-pair"><label className="cards-check"><input type="radio" name="cards-print-range" checked={!ranged} onChange={() => {setRanged(false); change({start: 1, end: count});}}/>{copy.printRangeAll} ({count})</label><label className="cards-check"><input type="radio" name="cards-print-range" checked={ranged} onChange={() => setRanged(true)}/>{copy.printRangeSome}</label></div>
        {ranged && <div className="cards-form-grid"><label>{t('rangeStart')}<input type="number" min={1} max={count} value={options.start || ''} onChange={event => change({start: Number(event.target.value)})}/></label><label>{t('rangeEnd')}<input type="number" min={1} max={count} value={options.end || ''} onChange={event => change({end: Number(event.target.value)})}/></label></div>}</>)}
      {options.kind === 'list' && field(copy.printList, <><label className="cards-check"><input type="checkbox" checked={options.hideBack} onChange={event => change({hideBack: event.target.checked})}/>{copy.printHideBack}</label><div className="cards-form-grid"><Choice label={copy.printColumns} value={options.columns} options={[[1, copy.printOneColumn], [2, copy.printTwoColumns]]} onChange={columns => change({columns})}/></div></>)}
      {options.kind === 'cards' && field(copy.printCards, <div className="cards-form-grid"><Choice label={copy.printGrid} value={options.grid} options={[['2x4', copy.printGridLarge], ['3x6', copy.printGridSmall]]} onChange={grid => change({grid})}/><Choice label={copy.printSides} value={options.sides} options={[['duplex', copy.printDuplex], ['pairs', copy.printPairs]]} onChange={sides => change({sides})}/></div>)}
      {asksTest && <>{field(copy.printCounts, <><div className="cards-form-grid four">{countKeys.map(key => {const room = available - total + counts[key]; return <label key={key}>{countLabels[key]}<input type="number" min={0} max={room} value={counts[key]} onChange={event => change({counts: {...counts, [key]: Math.min(Math.max(Math.trunc(Number(event.target.value)) || 0, 0), room)}})}/></label>;})}</div><p className="cards-muted">{fill('printCountsTotal', {n: total, max: available})}</p></>)}
        {field(copy.printTest, <><label className="cards-check"><input type="checkbox" checked={options.shuffle} onChange={event => change({shuffle: event.target.checked})}/>{copy.printShuffle}</label><div className="cards-form-grid"><Choice label={copy.printChoiceCount} value={options.choiceCount} options={[[4, fill('printChoiceN', {n: 4})], [5, fill('printChoiceN', {n: 5})]]} onChange={choiceCount => change({choiceCount})}/>{options.kind === 'test' && <Choice label={copy.printColumns} value={options.columns} options={[[1, copy.printOneColumn], [2, copy.printTwoColumns]]} onChange={columns => change({columns})}/>}</div><button type="button" className="button" onClick={() => change({seed: newSeed()})}><RefreshCw size={15}/>{copy.printReshuffle}</button></>)}</>}
    </fieldset>
    <aside className="cards-print-summary" role="status"><h3>{copy.printSummary}</h3><strong>{kindName}</strong><p>{fill(asksTest ? 'printSummaryQuestions' : 'printSummaryCards', {n: asksTest ? preview.total : available})} · {fill('printPages', {n: preview.pages.length})}</p>{asksTest && <><p className="cards-print-code">{copy.printFormCode} <b>{preview.code}</b></p><p className="cards-muted">{copy.printSameCode}</p></>}{blocked && <p className="cards-error">{copy.printEmpty}</p>}{warnings.map(warning => <p key={warning} className="cards-muted">{warning}</p>)}{notes.map(note => <p key={note}>{note}</p>)}</aside></div>
    {error && <p role="alert" className="cards-error">{error}</p>}
    <div className="cards-dialog-footer cards-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>{t('close')}</button><button className="button primary" disabled={busy || blocked}>{busy ? <LoaderCircle className="spin" size={16}/> : <FileDown size={16}/>}{copy[busy ? 'printMaking' : 'printMake']}</button></div>
  </form></CardsDialog>;
}
