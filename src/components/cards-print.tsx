'use client';
import {useEffect, useMemo, useState, type FormEvent, type ReactNode} from 'react';
import {FileDown, FileQuestion, FileText, KeyRound, KeySquare, LayoutGrid, LoaderCircle, PencilLine, Plus, RefreshCw, Rows3, TextCursorInput, X} from 'lucide-react';
import type {CardSet, CardSetSummary} from '@/lib/cards-types';
import {useCardsCopy} from '@/lib/cards-copy';
import {clampPrintCounts, combineCardSets, defaultCardPrintOptions, estimatePrintWidth, generateCardBlankTest, layoutCardPrintJob, printRange, restoreCardPrintOptions, type CardPrintCountKey, type CardPrintInput, type CardPrintKind, type CardPrintOptions} from '@/lib/cards-print';
import ko from '@/messages/cards-print-ko.json';
import en from '@/messages/cards-print-en.json';
import {cardsRequest, CardsDialog, downloadCardsFile} from './cards-shared';
import {printFont} from './cards-print-font';
import '@/styles/cards-print.css';

type CopyKey = keyof typeof ko;
const kinds: [CardPrintKind, CopyKey, CopyKey, typeof FileText][] = [['list', 'printList', 'printListHint', FileText], ['cards', 'printCards', 'printCardsHint', LayoutGrid], ['test', 'printTest', 'printTestHint', FileQuestion], ['key', 'printKey', 'printKeyHint', KeyRound], ['blank', 'printBlank', 'printBlankHint', TextCursorInput], ['blankKey', 'printBlankKey', 'printBlankKeyHint', KeySquare], ['practice', 'printPractice', 'printPracticeHint', PencilLine], ['lines', 'printLines', 'printLinesHint', Rows3]];
const countKeys: CardPrintCountKey[] = ['frontChoice', 'backChoice', 'frontWritten', 'backWritten'];
const MAX_SETS = 10;
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
/** Sets the teacher could add: their own, not archived, not empty. */
async function loadSets(): Promise<CardSetSummary[]> {
  type Page = {sets: CardSetSummary[]; nextCursor: string | null};
  const sets: CardSetSummary[] = [];
  let page = await cardsRequest<Page>('/api/cards/library');
  for (;;) {sets.push(...page.sets); if (!page.nextCursor) break; page = await cardsRequest<Page>(`/api/cards/library?cursor=${encodeURIComponent(page.nextCursor)}`);}
  return sets.filter(item => !item.archived && item.cardCount > 0);
}

function Choice<T extends string | number>({label, value, options, onChange}: {label: string; value: T; options: [T, string][]; onChange: (value: T) => void}) {
  return <label>{label}<select value={value} onChange={event => onChange(options.find(([item]) => String(item) === event.target.value)![0])}>{options.map(([item, name]) => <option key={item} value={item}>{name}</option>)}</select></label>;
}
export default function CardsPrint({set, onClose}: {set: CardSet; onClose: () => void}) {
  const {t, locale} = useCardsCopy(), copy = locale === 'ko' ? ko : en, storage = `cards-print:${set.id}`;
  const [options, setOptions] = useState<CardPrintOptions>(() => {
    const fresh = defaultCardPrintOptions(set.type, set.cards.length, newSeed());
    try {return restoreCardPrintOptions(JSON.parse(localStorage.getItem(storage) || 'null'), fresh, set.cards.length);} catch {return fresh;}
  });
  const [ranged, setRanged] = useState(options.start !== 1 || options.end !== set.cards.length), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notes, setNotes] = useState<string[]>([]);
  const [extra, setExtra] = useState<CardSet[]>([]), [library, setLibrary] = useState<CardSetSummary[] | null>(null), [adding, setAdding] = useState(''), [loadingSet, setLoadingSet] = useState(false);
  // Remembering the seed is what lets a teacher come back later and still make the key for a test they printed.
  useEffect(() => {try {localStorage.setItem(storage, JSON.stringify(options));} catch {}}, [options, storage]);
  const change = (patch: Partial<CardPrintOptions>) => {setOptions(current => ({...current, ...patch})); setNotes([]); setError('');};
  const fill = (key: CopyKey, values: Record<string, string | number>) => Object.entries(values).reduce<string>((text, [name, value]) => text.replace(`{${name}}`, String(value)), copy[key]);

  const sources = useMemo(() => [set, ...extra], [set, extra]), multi = sources.length > 1, eachSet = multi && options.combine === 'pages';
  const combined = useMemo(() => combineCardSets(sources, options.dedupe), [sources, options.dedupe]), count = combined.cards.length;
  const effective = useMemo(() => ranged && !eachSet ? options : {...options, start: 1, end: count}, [ranged, eachSet, options, count]);
  const title = multi ? fill('printMergedTitle', {title: set.title, n: extra.length}) : set.title;
  const inputs = useMemo<CardPrintInput[]>(() => {
    const base = {options: effective, copy: (key: CopyKey) => copy[key], types: combined.types};
    if (!eachSet) return [{...base, title, type: combined.type, cards: combined.cards}];
    const groups = options.kind === 'lines' && options.linesMode === 'blank' ? combined.groups.slice(0, 1) : combined.groups;
    return groups.map(group => ({...base, title: group.title, type: group.type, cards: group.cards, options: {...effective, start: 1, end: group.cards.length}}));
  }, [effective, copy, combined, eachSet, title, options.kind, options.linesMode]);
  const {start, end} = printRange(effective, count), available = eachSet ? Math.max(...combined.groups.map(group => group.cards.length)) : end - start + 1;
  const counts = clampPrintCounts(options.counts, available), total = countKeys.reduce((sum, key) => sum + counts[key], 0), asksTest = options.kind === 'test' || options.kind === 'key', asksBlank = options.kind === 'blank' || options.kind === 'blankKey';
  const blankRoom = useMemo(() => asksBlank ? Math.max(0, ...inputs.map(input => {const all = {...input.options, blankCount: input.cards.length}; return generateCardBlankTest(input.cards, input.type, all, input.types).total;})) : 0, [asksBlank, inputs]);
  const preview = useMemo(() => layoutCardPrintJob(inputs, estimatePrintWidth), [inputs]), kindName = copy[kinds.find(([kind]) => kind === options.kind)![1]];
  const blocked = (asksTest && !total) || (asksBlank && !preview.total), hasSentences = sources.some(item => item.type === 'sentence');
  const front = copy[set.type === 'word' ? 'printPromptFrontWord' : 'printPromptFrontSentence'], countLabels: Record<CardPrintCountKey, string> = {frontChoice: `${front} · ${copy.printChoice}`, backChoice: `${copy.printPromptBack} · ${copy.printChoice}`, frontWritten: `${front} · ${copy.printWritten}`, backWritten: `${copy.printPromptBack} · ${copy.printWritten}`};
  const warnings = [preview.shortChoices ? fill('printShortChoices', {n: preview.shortChoices}) : '', preview.truncated ? fill('printTruncated', {n: preview.truncated}) : '', asksBlank && preview.skipped ? fill('printBlankSkipped', {n: preview.skipped}) : '', multi && combined.removed ? fill('printRemoved', {n: combined.removed}) : ''].filter(Boolean);

  async function openLibrary() {
    setLoadingSet(true); setError('');
    try {setLibrary(await loadSets());} catch {setError(copy.printSetsError);} finally {setLoadingSet(false);}
  }
  async function addSet() {
    if (!adding || loadingSet) return;
    setLoadingSet(true); setError('');
    try {const result = await cardsRequest<{set: CardSet}>(`/api/cards/sets/${encodeURIComponent(adding)}`); setExtra(current => current.some(item => item.id === result.set.id) ? current : [...current, result.set]); setAdding(''); setNotes([]);} catch {setError(copy.printSetsError);} finally {setLoadingSet(false);}
  }
  async function make(event: FormEvent) {
    event.preventDefault(); if (busy || blocked) return;
    setBusy(true); setError(''); setNotes([]);
    try {
      const [bytes, {renderCardPrintPdf}] = await Promise.all([printFont().catch(() => {throw new Error(copy.printFontError);}), import('@/lib/cards-print-pdf')]);
      const result = await renderCardPrintPdf(measure => layoutCardPrintJob(inputs, measure), bytes, {title: inputs[0].title, language: locale});
      downloadCardsFile(`${inputs[0].title} ${kindName}${result.layout.code ? ` ${result.layout.code.replace(/ · /g, '-')}` : ''}.pdf`, result.bytes as BlobPart, 'application/pdf');
      setNotes([copy.printDone, ...(result.missing.length ? [fill('printMissing', {chars: result.missing.slice(0, 12).join(' ')})] : [])]);
    } catch (cause) {setError(cause instanceof Error && cause.message === copy.printFontError ? cause.message : copy.printError);} finally {setBusy(false);}
  }
  const field = (label: string, control: ReactNode) => <section className="cards-print-field"><h3>{label}</h3>{control}</section>;
  const addable = (library ?? []).filter(item => !sources.some(source => source.id === item.id));
  const seedButton = <button type="button" className="button" onClick={() => change({seed: newSeed()})}><RefreshCw size={15}/>{copy.printReshuffle}</button>;
  const writeLines = <Choice label={copy.printWriteLines} value={options.writeLines} options={[1, 2, 3].map(n => [n as 1 | 2 | 3, fill('printLinesN', {n})])} onChange={writeLines => change({writeLines})}/>;
  const trace = <label className="cards-check"><input type="checkbox" checked={options.trace} onChange={event => change({trace: event.target.checked})}/>{copy.printTrace}</label>;
  return <CardsDialog title={`${t('print')} · ${set.title}`} closeLabel={t('close')} onClose={() => {if (!busy) onClose();}}><form className="cards-print" onSubmit={make}>
    <p className="cards-muted">{copy.printHint}</p>
    <div className="cards-print-kinds" role="group" aria-label={copy.printKind}>{kinds.map(([kind, name, hint, Icon]) => <button type="button" key={kind} className={options.kind === kind ? 'is-active' : ''} aria-pressed={options.kind === kind} onClick={() => change({kind})}><Icon size={21}/><strong>{copy[name]}</strong><small>{copy[hint]}</small></button>)}</div>
    <div className="cards-print-layout"><fieldset className="cards-fieldset" disabled={busy}>
      {field(copy.printSets, <><ul className="cards-print-sets">{sources.map((item, index) => <li key={item.id}><span>{item.title}</span><small>{item.cards.length}</small>{index > 0 && <button type="button" className="button" aria-label={`${copy.printRemoveSet} · ${item.title}`} onClick={() => {setExtra(current => current.filter(other => other.id !== item.id)); setNotes([]);}}><X size={14}/></button>}</li>)}</ul>
        {library === null ? <button type="button" className="button" disabled={loadingSet || sources.length >= MAX_SETS} onClick={() => void openLibrary()}>{loadingSet ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>}{copy.printAddSet}</button>
          : <div className="cards-print-add"><label>{copy.printChooseSet}<select value={adding} onChange={event => setAdding(event.target.value)}><option value="">—</option>{addable.map(item => <option key={item.id} value={item.id}>{item.title} ({item.cardCount})</option>)}</select></label><button type="button" className="button" disabled={!adding || loadingSet || sources.length >= MAX_SETS} onClick={() => void addSet()}>{loadingSet ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>}{copy.printAddSet}</button></div>}
        {multi && <><div className="cards-print-pair"><label className="cards-check"><input type="radio" name="cards-print-combine" checked={options.combine === 'merge'} onChange={() => change({combine: 'merge'})}/>{copy.printMerge}</label><label className="cards-check"><input type="radio" name="cards-print-combine" checked={eachSet} onChange={() => change({combine: 'pages'})}/>{copy.printPagesEach}</label></div><label className="cards-check"><input type="checkbox" checked={options.dedupe} onChange={event => change({dedupe: event.target.checked})}/>{copy.printDedupe}</label></>}</>)}
      {!eachSet && !(options.kind === 'lines' && options.linesMode === 'blank') && field(copy.printRange, <><div className="cards-print-pair"><label className="cards-check"><input type="radio" name="cards-print-range" checked={!ranged} onChange={() => setRanged(false)}/>{copy.printRangeAll} ({count})</label><label className="cards-check"><input type="radio" name="cards-print-range" checked={ranged} onChange={() => {setRanged(true); change({start, end});}}/>{copy.printRangeSome}</label></div>
        {ranged && <div className="cards-form-grid"><label>{t('rangeStart')}<input type="number" min={1} max={count} value={options.start || ''} onChange={event => change({start: Number(event.target.value)})}/></label><label>{t('rangeEnd')}<input type="number" min={1} max={count} value={options.end || ''} onChange={event => change({end: Number(event.target.value)})}/></label></div>}</>)}
      {options.kind === 'list' && field(copy.printList, <><label className="cards-check"><input type="checkbox" checked={options.hideBack} onChange={event => change({hideBack: event.target.checked})}/>{copy.printHideBack}</label><div className="cards-form-grid"><Choice label={copy.printColumns} value={options.columns} options={[[1, copy.printOneColumn], [2, copy.printTwoColumns]]} onChange={columns => change({columns})}/></div></>)}
      {options.kind === 'cards' && field(copy.printCards, <div className="cards-form-grid"><Choice label={copy.printGrid} value={options.grid} options={[['2x4', copy.printGridLarge], ['3x6', copy.printGridSmall]]} onChange={grid => change({grid})}/><Choice label={copy.printSides} value={options.sides} options={[['duplex', copy.printDuplex], ['pairs', copy.printPairs]]} onChange={sides => change({sides})}/></div>)}
      {asksTest && <>{field(copy.printCounts, <><div className="cards-form-grid four">{countKeys.map(key => {const room = available - total + counts[key]; return <label key={key}>{countLabels[key]}<input type="number" min={0} max={room} value={counts[key]} onChange={event => change({counts: {...counts, [key]: Math.min(Math.max(Math.trunc(Number(event.target.value)) || 0, 0), room)}})}/></label>;})}</div><p className="cards-muted">{fill('printCountsTotal', {n: total, max: available})}</p></>)}
        {field(copy.printTest, <><label className="cards-check"><input type="checkbox" checked={options.shuffle} onChange={event => change({shuffle: event.target.checked})}/>{copy.printShuffle}</label><div className="cards-form-grid"><Choice label={copy.printChoiceCount} value={options.choiceCount} options={[[4, fill('printChoiceN', {n: 4})], [5, fill('printChoiceN', {n: 5})]]} onChange={choiceCount => change({choiceCount})}/>{options.kind === 'test' && <Choice label={copy.printColumns} value={options.columns} options={[[1, copy.printOneColumn], [2, copy.printTwoColumns]]} onChange={columns => change({columns})}/>}</div>{seedButton}</>)}</>}
      {asksBlank && field(copy.printBlank, <><div className="cards-form-grid"><label>{copy.printBlankCount}<input type="number" min={1} max={blankRoom || 1} value={Math.min(options.blankCount, blankRoom) || ''} onChange={event => change({blankCount: Math.min(Math.max(Math.trunc(Number(event.target.value)) || 0, 0), blankRoom)})}/></label><Choice label={copy.printBlankHintLabel} value={options.blankHint} options={[['back', copy.printHintBack], ['initial', copy.printHintInitial], ['none', copy.printHintNone]]} onChange={blankHint => change({blankHint})}/>{hasSentences && <Choice label={copy.printBlankPick} value={options.blankPick} options={[['longest', copy.printPickLongest], ['random', copy.printPickRandom]]} onChange={blankPick => change({blankPick})}/>}</div><p className="cards-muted">{blankRoom ? fill('printBlankAvailable', {n: blankRoom}) : copy.printBlankNone}</p><label className="cards-check"><input type="checkbox" checked={options.shuffle} onChange={event => change({shuffle: event.target.checked})}/>{copy.printShuffle}</label>{seedButton}</>)}
      {options.kind === 'practice' && field(copy.printPractice, <><div className="cards-form-grid">{writeLines}</div>{trace}</>)}
      {options.kind === 'lines' && field(copy.printLines, <><div className="cards-form-grid"><Choice label={copy.printLinesMode} value={options.linesMode} options={[['words', copy.printLinesWords], ['blank', copy.printLinesBlank]]} onChange={linesMode => change({linesMode})}/>{options.linesMode === 'words' && writeLines}</div>{options.linesMode === 'words' && trace}</>)}
    </fieldset>
    <aside className="cards-print-summary" role="status"><h3>{copy.printSummary}</h3><strong>{kindName}</strong><p>{fill(asksTest || asksBlank ? 'printSummaryQuestions' : 'printSummaryCards', {n: asksTest || asksBlank ? preview.total : eachSet ? combined.cards.length : available})} · {fill('printPages', {n: preview.pages.length})}</p>{(asksTest || asksBlank) && preview.code && <><p className="cards-print-code">{copy.printFormCode} <b>{preview.code}</b></p><p className="cards-muted">{copy.printSameCode}</p></>}{blocked && <p className="cards-error">{asksBlank ? copy.printBlankNone : copy.printEmpty}</p>}{warnings.map(warning => <p key={warning} className="cards-muted">{warning}</p>)}{notes.map(note => <p key={note}>{note}</p>)}</aside></div>
    {error && <p role="alert" className="cards-error">{error}</p>}
    <div className="cards-dialog-footer cards-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>{t('close')}</button><button className="button primary" disabled={busy || blocked}>{busy ? <LoaderCircle className="spin" size={16}/> : <FileDown size={16}/>}{copy[busy ? 'printMaking' : 'printMake']}</button></div>
  </form></CardsDialog>;
}
