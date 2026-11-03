'use client';
import {useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {Archive, ArrowRight, CalendarDays, Check, Download, Hash, LoaderCircle, RotateCcw, Search, Tag, X} from 'lucide-react';
import {zipParts} from '@/lib/zip-store';
import {WORLD_WING_CAPACITY} from '@/lib/exhibition-world-layout';
import {artworkToday} from '@/lib/exhibition-metadata';
import {ARCHIVE_DOWNLOAD_LIMIT, EXHIBITION_TAG_LIMIT, filterArchive, normalizeTag, tagCounts, type ArchiveFilter, type ArchiveRow, type ArchiveSource} from '@/lib/exhibition-tags';
import type {ExhibitionClass} from '@/lib/exhibition-types';
import '@/styles/exhibition-archive.css';

type DialogProps = {title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean};
type ArchiveFiles = {zipName: string; index: string; sets: {id: string; folder: string; sheet: string; files: {name: string; url: string}[]}[]};

async function call<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/exhibitions/archive${path}`, {method: body ? 'POST' : 'GET', cache: 'no-store', headers: {'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '');
  return data as T;
}

/** Reads ?archive=1&q=…&tags=a,b&from=…&to=…&classId=…&source=… (Berry's "보관함에서 모두 보기" link). */
export function archiveFilterFromUrl(url: URL): ArchiveFilter | null {
  if (url.searchParams.get('archive') !== '1') return null;
  const source = url.searchParams.get('source');
  return {q: url.searchParams.get('q') ?? '', tags: (url.searchParams.get('tags') ?? '').split(',').map(normalizeTag).filter(Boolean), from: url.searchParams.get('from') ?? '', to: url.searchParams.get('to') ?? '', classId: url.searchParams.get('classId') ?? '', source: source === 'direct' || source === 'homework' ? source : ''};
}

/** Hashtag chips with an input: Enter, comma or space adds one; the × removes it. */
export function TagField({value, onChange, disabled, en, suggestions = []}: {value: string[]; onChange: (tags: string[]) => void; disabled?: boolean; en: boolean; suggestions?: string[]}) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {const tag = normalizeTag(raw); if (tag && !value.includes(tag) && value.length < EXHIBITION_TAG_LIMIT) onChange([...value, tag]); setDraft('');};
  const offered = suggestions.filter(tag => !value.includes(tag)).slice(0, 8);
  return <div className="ex-tag-field">
    <div className="ex-tag-box">
      {value.map(tag => <span key={tag} className="ex-tag is-removable">#{tag}<button type="button" disabled={disabled} aria-label={en ? `Remove #${tag}` : `#${tag} 빼기`} onClick={() => onChange(value.filter(item => item !== tag))}><X size={12}/></button></span>)}
      {value.length < EXHIBITION_TAG_LIMIT && <input value={draft} disabled={disabled} placeholder={value.length ? (en ? 'Add a tag' : '태그 더하기') : (en ? '#spring #drawing' : '#봄꽃 #미술')} aria-label={en ? 'Add a hashtag' : '해시태그 더하기'}
        onChange={event => {const text = event.target.value; if (/[,\s]$/.test(text)) add(text); else setDraft(text);}}
        onKeyDown={event => {if (event.key === 'Enter' && !event.nativeEvent.isComposing) {event.preventDefault(); add(draft);} else if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));}}
        onBlur={() => draft && add(draft)}/>}
    </div>
    {!!offered.length && <div className="ex-tag-suggest"><small>{en ? 'Often used' : '자주 쓴 태그'}</small>{offered.map(tag => <button type="button" key={tag} className="ex-tag" disabled={disabled} onClick={() => add(tag)}>#{tag}</button>)}</div>}
  </div>;
}

/** Fetches a few images at a time so a big set neither stalls nor floods the connection. */
async function collect(set: ArchiveFiles, onProgress: (done: number, total: number) => void) {
  const encoder = new TextEncoder(), jobs = set.sets.flatMap(room => room.files), total = jobs.length, entries: {name: string; data: Uint8Array}[] = [];
  let done = 0, next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const file = jobs[next++], response = await fetch(file.url);
      if (!response.ok) throw new Error('fetch_failed');
      entries.push({name: file.name, data: new Uint8Array(await response.arrayBuffer())});
      onProgress(++done, total);
    }
  };
  await Promise.all(Array.from({length: Math.min(6, jobs.length)}, worker));
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return [{name: '전시목록.csv', data: encoder.encode(set.index)}, ...set.sets.map(room => ({name: `${room.folder}/작품목록.csv`, data: encoder.encode(room.sheet)})), ...entries];
}

const EMPTY: ArchiveFilter = {q: '', tags: [], from: '', to: '', classId: '', source: ''};

export default function ExhibitionArchive({classes, initialFilter, DialogComponent: Dialog, onOpen, onClose, onChanged}: {classes: ExhibitionClass[]; initialFilter?: ArchiveFilter | null; DialogComponent: ComponentType<DialogProps>; onOpen: (id: string) => void; onClose: () => void; onChanged?: () => void}) {
  const en = useLocale() === 'en';
  const [rows, setRows] = useState<ArchiveRow[] | null>(null), [filter, setFilter] = useState<ArchiveFilter>({...EMPTY, ...initialFilter});
  const [selected, setSelected] = useState<Set<string>>(new Set()), [bulkTags, setBulkTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const failed = en ? 'Something went wrong. Please try again.' : '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  useEffect(() => {
    let live = true;
    call<{rows: ArchiveRow[]}>('').then(data => {if (live) setRows(data.rows);}).catch(cause => {if (live) {setRows([]); setError((cause as Error).message || failed);}});
    return () => {live = false;};
  }, [failed]);
  const patch = (next: Partial<ArchiveFilter>) => {setFilter(old => ({...old, ...next})); setNotice('');};
  const found = useMemo(() => filterArchive(rows ?? [], filter), [rows, filter]);
  // Chips count within the other filters so every chip leads somewhere.
  const chips = useMemo(() => tagCounts(filterArchive(rows ?? [], {...filter, tags: []}), 24), [rows, filter]);
  const usedTags = useMemo(() => tagCounts(rows ?? [], 40).map(item => item.tag), [rows]);
  const picked = found.filter(row => selected.has(row.id)), allPicked = !!found.length && found.every(row => selected.has(row.id));
  const filtered = JSON.stringify({...filter, tags: filter.tags ?? []}) !== JSON.stringify(EMPTY);
  const toggleTag = (tag: string) => patch({tags: filter.tags?.includes(tag) ? filter.tags.filter(item => item !== tag) : [...(filter.tags ?? []), tag]});
  const toggle = (id: string) => setSelected(old => {const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next;});
  const day = (iso: string) => artworkToday(new Date(iso)).replaceAll('-', '.');
  const className = (row: ArchiveRow) => classes.find(item => item.id === row.classId)?.name || row.className;

  async function addTags(event: FormEvent) {
    event.preventDefault();
    if (busy || !picked.length || !bulkTags.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await call<{rows: {id: string; tags: string[]}[]}>('/tags', {ids: picked.map(row => row.id), add: bulkTags});
      const tags = new Map(result.rows.map(row => [row.id, row.tags]));
      setRows(old => old?.map(row => tags.has(row.id) ? {...row, tags: tags.get(row.id)!} : row) ?? old);
      setNotice(en ? `Tagged ${picked.length} exhibitions.` : `전시 ${picked.length}개에 ${bulkTags.map(tag => `#${tag}`).join(' ')} 태그를 붙였어요.`);
      setBulkTags([]); onChanged?.();
    } catch (cause) {setError((cause as Error).message || failed);} finally {setBusy(false);}
  }
  async function download() {
    if (busy || !picked.length) return;
    if (picked.length > ARCHIVE_DOWNLOAD_LIMIT) {setError(en ? `Download up to ${ARCHIVE_DOWNLOAD_LIMIT} exhibitions at a time.` : `묶음 다운로드는 한 번에 전시 ${ARCHIVE_DOWNLOAD_LIMIT}개까지 할 수 있어요.`); return;}
    setBusy(true); setError(''); setNotice(''); setProgress(en ? 'Preparing the list…' : '목록을 준비하고 있어요…');
    try {
      const set = await call<ArchiveFiles>('/files', {ids: picked.map(row => row.id)});
      const entries = await collect(set, (done, total) => setProgress(en ? `Saving photos ${done}/${total}` : `사진 ${done}/${total}장 담는 중`));
      const blob = new Blob(zipParts(entries) as BlobPart[], {type: 'application/zip'}), href = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = href; link.download = set.zipName; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
      setNotice(en ? `Saved ${picked.length} exhibitions as ${set.zipName}.` : `전시 ${picked.length}개를 ${set.zipName} 파일로 저장했어요. 전시마다 폴더와 작품목록.csv가 들어 있어요.`);
    } catch (cause) {setError((cause as Error).message && (cause as Error).message !== 'fetch_failed' ? (cause as Error).message : en ? 'Some photos could not be fetched. Please try again.' : '사진 일부를 받지 못했어요. 다시 시도해 주세요.');}
    finally {setBusy(false); setProgress('');}
  }

  return <Dialog title={en ? 'Exhibition archive' : '전시 보관함'} onClose={onClose} busy={busy} wide>
    <div className="ex-archive">
      <p className="ex-form-hint">{en ? 'Every exhibition gets hashtags from its title automatically. Find rooms by topic, period, class or source, open them, or save several together.' : '전시마다 제목에서 해시태그가 자동으로 붙어요. 주제·기간·학급·들어온 길로 찾아서 바로 열거나, 여러 개를 골라 한 번에 내려받을 수 있어요.'}</p>
      <div className="ex-archive-search"><Search size={17}/><input type="search" value={filter.q} placeholder={en ? 'Search titles and hashtags' : '제목·해시태그로 찾기 (예: 봄꽃)'} aria-label={en ? 'Search exhibitions' : '전시 찾기'} onChange={event => patch({q: event.target.value})}/></div>
      <div className="ex-archive-filters">
        <label><span>{en ? 'Class' : '학급'}</span><select value={filter.classId} onChange={event => patch({classId: event.target.value})}><option value="">{en ? 'All classes' : '모든 학급'}</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span><CalendarDays size={13}/>{en ? 'From' : '기간'}</span><input type="month" value={(filter.from ?? '').slice(0, 7)} onChange={event => patch({from: event.target.value})}/></label>
        <label><span>{en ? 'To' : '까지'}</span><input type="month" value={(filter.to ?? '').slice(0, 7)} onChange={event => patch({to: event.target.value})}/></label>
        <div className="ex-archive-source" role="group" aria-label={en ? 'Source' : '들어온 길'}>{([['', en ? 'All' : '전체'], ['direct', en ? 'Uploaded' : '직접 올림'], ['homework', en ? 'From homework' : '숙제 연동']] as [ArchiveSource | '', string][]).map(([value, label]) => <button type="button" key={value || 'all'} aria-pressed={(filter.source ?? '') === value} onClick={() => patch({source: value})}>{label}</button>)}</div>
      </div>
      {!!chips.length && <div className="ex-archive-chips" aria-label={en ? 'Hashtags' : '해시태그'}><Hash size={15}/>{chips.map(item => <button type="button" key={item.tag} className="ex-tag" aria-pressed={!!filter.tags?.includes(item.tag)} onClick={() => toggleTag(item.tag)}>#{item.tag}<small>{item.count}</small></button>)}</div>}
      <div className="ex-archive-bar">
        <label className="ex-archive-all"><input type="checkbox" checked={allPicked} disabled={!found.length || busy} onChange={() => setSelected(old => {const next = new Set(old); found.forEach(row => allPicked ? next.delete(row.id) : next.add(row.id)); return next;})}/>{rows ? (en ? `${found.length} exhibitions` : `전시 ${found.length}개`) : (en ? 'Loading…' : '불러오는 중…')}</label>
        {filtered && <button type="button" className="ex-text-button" onClick={() => {setFilter(EMPTY); setNotice('');}}><RotateCcw size={13}/>{en ? 'Clear filters' : '조건 지우기'}</button>}
      </div>
      {error && <p className="ex-form-error" role="alert">{error}</p>}
      {notice && <p className="ex-inline-notice" role="status"><Check size={15}/>{notice}</p>}
      {!rows ? <div className="ex-list-loading" role="status"><LoaderCircle className="spin" size={22}/></div> : !found.length ? <div className="ex-archive-empty"><Archive size={30}/><p>{rows.length ? (en ? 'No exhibition matches. Try fewer conditions.' : '조건에 맞는 전시가 없어요. 조건을 줄여 보세요.') : (en ? 'No exhibitions yet.' : '아직 전시가 없어요.')}</p></div> :
        <ul className="ex-archive-list">{found.map(row => {const wings = Math.ceil(row.approvedCount / WORLD_WING_CAPACITY); return <li key={row.id} className={selected.has(row.id) ? 'is-picked' : ''}>
          <input type="checkbox" checked={selected.has(row.id)} disabled={busy} aria-label={en ? `Select ${row.title}` : `${row.title} 고르기`} onChange={() => toggle(row.id)}/>
          <div className="ex-archive-copy">
            <strong>{row.title}</strong>
            <span className="ex-archive-meta"><span className={`ex-status ex-status-${row.status}`}>{row.status === 'open' ? (en ? 'Open' : '열림') : row.status === 'closed' ? (en ? 'Closed' : '마감') : (en ? 'Draft' : '준비 중')}</span>{className(row)} · {day(row.createdAt)} · {en ? `${row.approvedCount} works` : `작품 ${row.approvedCount}점`}{wings > 1 ? (en ? ` · ${wings} wings` : ` · ${wings}관`) : ''} · {row.source === 'homework' ? (en ? 'From homework' : '숙제 연동') : (en ? 'Uploaded' : '직접 올림')}</span>
            {!!row.tags.length && <span className="ex-archive-tags">{row.tags.map(tag => <button type="button" key={tag} className="ex-tag" aria-pressed={!!filter.tags?.includes(tag)} onClick={() => toggleTag(tag)}>#{tag}</button>)}</span>}
          </div>
          <button type="button" className="ex-button" onClick={() => onOpen(row.id)}>{en ? 'Open' : '열기'}<ArrowRight size={15}/></button>
        </li>;})}</ul>}
      {!!picked.length && <div className="ex-archive-actions">
        <strong>{en ? `${picked.length} selected` : `${picked.length}개 골랐어요`}</strong>
        <form onSubmit={event => void addTags(event)}><Tag size={15}/><TagField value={bulkTags} onChange={setBulkTags} disabled={busy} en={en} suggestions={usedTags}/><button className="ex-button" disabled={busy || !bulkTags.length}>{en ? 'Add tags' : '태그 붙이기'}</button></form>
        <button type="button" className="ex-button ex-primary" disabled={busy} onClick={() => void download()}>{busy && progress ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>}{progress || (en ? 'Download ZIP' : '묶음 다운로드')}</button>
      </div>}
    </div>
  </Dialog>;
}
