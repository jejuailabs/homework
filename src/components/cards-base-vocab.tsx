'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {BookA, Search} from 'lucide-react';
import {CardIllustration, CardIllustrationToggle} from './card-illustration';

import ko from '@/messages/cards-vocab-ko.json';
import en from '@/messages/cards-vocab-en.json';
import {BASE_VOCAB_CHUNKS, BASE_VOCAB_LETTERS, BASE_VOCAB_QUERY_LENGTH, BASE_VOCAB_SET_MAX, baseVocabCards, baseVocabSetTitle, chunkBaseVocab, filterBaseVocab, type BaseVocabData, type BaseVocabScope, type BaseVocabWord} from '@/lib/cards-base-vocab';
import {dedupeByFront} from '@/lib/cards-ai-draft';
import type {CardFolder} from '@/lib/cards-types';
import type {ImportedCard} from '@/lib/cards-import';
import {useCardsCopy} from '@/lib/cards-copy';
import {fillCopy} from '@/lib/cards-class-copy';
import {cardsRequest, CardsDialog, CardsLoading, CardsRequestError} from './cards-shared';
import '@/styles/cards-vocab.css';

/** 기본 어휘 (CARDS_SPEC §37). The list comes from the API once per page load, never from the bundle. */
let cache: Promise<BaseVocabData> | null = null;
function useBaseVocab() {
  const [data, setData] = useState<BaseVocabData | null>(null), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    (cache ??= cardsRequest<BaseVocabData>('/api/cards/base-vocab')).then(value => {if (alive) setData(value);}).catch(() => {cache = null; if (alive) setFailed(true);});
    return () => {alive = false;};
  }, [attempt]);
  return {data, failed, retry: () => {setFailed(false); setAttempt(value => value + 1);}};
}
function useVocabCopy() {const {locale} = useCardsCopy(); return locale === 'ko' ? ko : en;}
type Copy = typeof ko;
const scopeLabel = (copy: Copy, scope: BaseVocabScope) => copy[scope];
const prefixOf = (copy: Copy, scope: BaseVocabScope) => scope === 'elementary' ? copy.prefixElementary : scope === 'secondary' ? copy.prefixSecondary : copy.prefixAll;

type Filter = {scope: BaseVocabScope; from: string; to: string; query: string; size: number};
function useFilter() {
  const [filter, setFilter] = useState<Filter>({scope: 'elementary', from: 'a', to: 'z', query: '', size: 20});
  return [filter, (patch: Partial<Filter>) => setFilter(current => ({...current, ...patch}))] as const;
}
function Filters({copy, filter, update, disabled}: {copy: Copy; filter: Filter; update: (patch: Partial<Filter>) => void; disabled?: boolean}) {
  const letters = (value: string, key: 'from' | 'to', label: string) => <select aria-label={label} value={value} disabled={disabled} onChange={e => update({[key]: e.target.value})}>{BASE_VOCAB_LETTERS.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select>;
  return <div className="cards-vocab-filters">
    <label>{copy.scope}<select value={filter.scope} disabled={disabled} onChange={e => update({scope: e.target.value as BaseVocabScope})}>{(['elementary', 'secondary', 'all'] as const).map(item => <option key={item} value={item}>{scopeLabel(copy, item)}</option>)}</select></label>
    <div className="cards-vocab-letters" role="group" aria-label={copy.from}><span>{copy.from}</span>{letters(filter.from, 'from', copy.fromLabel)}<span>{copy.to}</span>{letters(filter.to, 'to', copy.toLabel)}{copy.toSuffix && <span>{copy.toSuffix}</span>}</div>
    <label>{copy.size}<select value={filter.size} disabled={disabled} onChange={e => update({size: Number(e.target.value)})}>{BASE_VOCAB_CHUNKS.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
    <label className="cards-search cards-vocab-search"><Search size={17}/><input aria-label={copy.search} placeholder={copy.searchPlaceholder} maxLength={BASE_VOCAB_QUERY_LENGTH} value={filter.query} disabled={disabled} onChange={e => update({query: e.target.value})}/></label>
  </div>;
}
function SourceNote({copy, data}: {copy: Copy; data: BaseVocabData}) {
  return <div className="cards-vocab-source"><p className="cards-vocab-ai" role="note"><strong>{data.meaningNote}</strong> · {copy.aiNoteLong}</p><p className="cards-muted">{copy.source}: <a className="cards-text-link" href={data.source.url} target="_blank" rel="noreferrer">{data.source.title}</a> ({data.source.notice})</p></div>;
}
function WordPreview({words}: {words: BaseVocabWord[]}) {
  return <ul className="ci-vocab-preview">{words.map(entry => <li key={entry.word}><CardIllustration card={{front: entry.word, back: entry.meaning}} variant="thumb"/><span><b lang="en">{entry.word}</b><small>{entry.meaning}</small></span></li>)}</ul>;
}

/** Makes ordinary owned sets, one POST /api/cards/sets per group, with a stable request ID per group so a retry never doubles one. */
export default function CardsBaseVocab({folders, onClose, onCreated}: {folders: CardFolder[]; onClose: () => void; onCreated: (count: number, folderId: string | null) => void}) {
  const copy = useVocabCopy(), {t} = useCardsCopy(), {data, failed, retry} = useBaseVocab();
  const [filter, update] = useFilter(), [skipped, setSkipped] = useState<Set<number>>(new Set()), [folderChoice, setFolderChoice] = useState('new'), [folderName, setFolderName] = useState('');
  const [progress, setProgress] = useState<{done: number; total: number} | null>(null), [error, setError] = useState('');
  const requestIds = useRef<Record<string, string>>({}), made = useRef<{folderId: string | null; done: Set<string>}>({folderId: null, done: new Set()});
  const words = useMemo(() => data ? filterBaseVocab(data.words, filter) : [], [data, filter]);
  const chunks = useMemo(() => chunkBaseVocab(words, filter.size), [words, filter.size]);
  const signature = `${filter.scope}:${filter.from}:${filter.to}:${filter.query.trim().toLowerCase()}:${filter.size}`;
  useEffect(() => {setSkipped(new Set()); setError('');}, [signature]);
  const chosen = chunks.map((chunk, index) => ({chunk, index})).filter(item => !skipped.has(item.index));
  const defaultFolder = `${prefixOf(copy, filter.scope)} ${filter.from.toUpperCase()}–${filter.to.toUpperCase()}${filter.query.trim() ? ` '${filter.query.trim()}'` : ''}`.slice(0, 80);
  const running = !!progress, tooMany = chosen.length > BASE_VOCAB_SET_MAX;
  function close() {if (running && !window.confirm(copy.discard)) return; onClose();}
  async function create() {
    if (!chosen.length || tooMany || running) return;
    setError(''); setProgress({done: 0, total: chosen.length});
    try {
      let folderId = folderChoice === 'none' ? null : folderChoice === 'new' ? made.current.folderId : folderChoice;
      if (folderChoice === 'new' && !folderId) {
        const {folder} = await cardsRequest<{folder: CardFolder}>('/api/cards/folders', {method: 'POST', body: JSON.stringify({name: (folderName.trim() || defaultFolder).slice(0, 80)})});
        folderId = made.current.folderId = folder.id;
      }
      const description = fillCopy(copy.description, {scope: scopeLabel(copy, filter.scope)});
      for (const [position, {chunk, index}] of chosen.entries()) {
        const key = `${signature}:${index}:${folderId ?? ''}`;
        if (!made.current.done.has(key)) {
          const requestId = requestIds.current[key] ||= crypto.randomUUID();
          await cardsRequest('/api/cards/sets', {method: 'POST', body: JSON.stringify({requestId, title: baseVocabSetTitle(prefixOf(copy, filter.scope), index, chunks.length, chunk), description, type: 'word', folderId, cards: baseVocabCards(chunk)})});
          made.current.done.add(key);
        }
        setProgress({done: position + 1, total: chosen.length});
      }
      onCreated(chosen.length, folderId);
    } catch (cause) {
      setError(cause instanceof CardsRequestError && cause.message ? `${copy.createFailed} (${cause.message})` : copy.createFailed);
    } finally {setProgress(null);}
  }
  return <CardsDialog title={copy.title} closeLabel={t('close')} onClose={close}>
    <p className="cards-muted">{copy.intro}</p>
    {failed ? <div role="alert" className="cards-error">{copy.loadFailed}<button type="button" className="button" onClick={retry}>{copy.retry}</button></div> : !data ? <CardsLoading label={copy.loading}/> : <>
      <SourceNote copy={copy} data={data}/>
      <fieldset className="cards-fieldset" disabled={running}>
        <Filters copy={copy} filter={filter} update={update}/>
        <div className="cards-vocab-summary" role="status"><span>{copy.matched} <strong>{words.length.toLocaleString()}</strong>{copy.wordUnit}</span><span>{copy.picked} <strong>{chosen.length}</strong>/{chunks.length}{copy.setUnit}</span>
          {!!chunks.length && <span className="cards-actions"><button type="button" className="button" onClick={() => setSkipped(new Set())}>{copy.pickAll}</button><button type="button" className="button" onClick={() => setSkipped(new Set(chunks.map((_, index) => index)))}>{copy.pickNone}</button></span>}</div>
        {!chunks.length ? <p className="cards-empty">{copy.none}</p> : <ol className="cards-vocab-groups">{chunks.map((chunk, index) => <li key={`${signature}:${index}`}>
          <input type="checkbox" aria-label={`${copy.group} ${index + 1}`} checked={!skipped.has(index)} onChange={e => setSkipped(current => {const next = new Set(current); if (e.target.checked) next.delete(index); else next.add(index); return next;})}/>
          <details><summary><strong>{baseVocabSetTitle(prefixOf(copy, filter.scope), index, chunks.length, chunk)}</strong> <small>{chunk.length}{copy.wordUnit}</small></summary><WordPreview words={chunk}/></details>
        </li>)}</ol>}
        {tooMany && <p role="alert" className="cards-error">{copy.tooMany}</p>}
        <div className="cards-vocab-folder"><label>{copy.folder}<select value={folderChoice} onChange={e => setFolderChoice(e.target.value)}><option value="new">{copy.newFolder}</option><option value="none">{copy.noFolder}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          {folderChoice === 'new' && <label>{copy.folderName}<input maxLength={80} value={folderName} placeholder={defaultFolder} onChange={e => setFolderName(e.target.value)}/></label>}</div>
      </fieldset>
      {progress && <div className="cards-import-progress" role="status"><p>{copy.creating} {progress.done}/{progress.total}</p><progress max={progress.total} value={progress.done}/></div>}
      {error && <div role="alert" className="cards-error">{error}</div>}
      <div className="cards-dialog-footer cards-actions"><button type="button" className="button" onClick={close}>{t('close')}</button><button type="button" className="button primary" disabled={running || !chosen.length || tooMany} onClick={() => void create()}><BookA size={17}/>{fillCopy(copy.create, {count: chosen.length})}</button></div>
    </>}
  </CardsDialog>;
}

/** The 기본 어휘 tab of 가져오기: pick one group and append its words to the editor rows (nothing saves here). */
export function BaseVocabImportTab({fronts, limit, onAppend}: {fronts: string[]; limit: number; onAppend: (cards: ImportedCard[]) => void}) {
  const copy = useVocabCopy(), {t} = useCardsCopy(), {data, failed, retry} = useBaseVocab();
  const [filter, update] = useFilter(), [group, setGroup] = useState(0), [error, setError] = useState('');
  const chunks = useMemo(() => data ? chunkBaseVocab(filterBaseVocab(data.words, filter), filter.size) : [], [data, filter]);
  const chunk = chunks[Math.min(group, Math.max(0, chunks.length - 1))] ?? [];
  const {fresh, duplicates} = dedupeByFront(chunk, fronts, entry => entry.word);
  useEffect(() => {setGroup(0); setError('');}, [filter]);
  function append() {
    if (!fresh.length) return;
    if (fronts.length + fresh.length > limit) {setError(t('limit')); return;}
    onAppend(baseVocabCards(fresh));
  }
  if (failed) return <section className="cards-import" role="tabpanel"><div role="alert" className="cards-error">{copy.loadFailed}<button type="button" className="button" onClick={retry}>{copy.retry}</button></div></section>;
  if (!data) return <section className="cards-import" role="tabpanel"><CardsLoading label={copy.loading}/></section>;
  return <section className="cards-import" role="tabpanel"><p>{copy.appendHint}</p><SourceNote copy={copy} data={data}/>
    <Filters copy={copy} filter={filter} update={update}/>
    {!chunks.length ? <p className="cards-muted">{copy.none}</p> : <>
      <label className="cards-import-merge">{copy.pickGroup}<select value={Math.min(group, chunks.length - 1)} onChange={e => setGroup(Number(e.target.value))}>{chunks.map((item, index) => <option key={index} value={index}>{baseVocabSetTitle(prefixOf(copy, filter.scope), index, chunks.length, item)} · {item.length}</option>)}</select></label>
      <CardIllustrationToggle/><WordPreview words={chunk}/>
      <div className="cards-actions"><span className="cards-import-count">{copy.append} {fresh.length}{t('cards')}</span><button type="button" className="button primary" disabled={!fresh.length} onClick={append}>{copy.append}</button></div>
      {!!duplicates.length && <p className="cards-import-note">{copy.duplicates} {duplicates.join(', ')}</p>}
    </>}
    {error && <div role="alert" className="cards-error">{error}</div>}
  </section>;
}
