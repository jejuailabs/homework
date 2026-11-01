'use client';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {Download, Folder, FolderPlus, Link as LinkIcon, ListChecks, LoaderCircle, Paperclip, Pencil, Plus, Search, StickyNote, Trash2, X} from 'lucide-react';
import {sendUpload} from '@/lib/upload-transfer';
import {BerryPending, call, message} from './api';
import {WORKSPACE_FILE_BYTES, workspaceFileMime} from './shared';
import {FOLDER_KINDS, FOLDER_KIND_LABELS, ITEM_TYPES, ITEM_TYPE_LABELS, type ChecklistItem, type FolderKind, type ItemType, type WorkFolder, type WorkItem, type WorkItemSummary} from './types';

type ItemDraft = {id: string | null; folderId: string; type: ItemType; title: string; body: string; url: string; checklist: ChecklistItem[]; dueAt: string; tags: string; sensitive: boolean};
const TYPE_ICONS = {note: StickyNote, file: Paperclip, checklist: ListChecks, link: LinkIcon};
const emptyItem = (folderId: string): ItemDraft => ({id: null, folderId, type: 'note', title: '', body: '', url: '', checklist: [], dueAt: '', tags: '', sensitive: false});

function Tree({folders, counts, parentId, selected, onSelect, depth}: {folders: WorkFolder[]; counts: Record<string, number>; parentId: string | null; selected: string | null; onSelect: (id: string) => void; depth: number}) {
  const children = folders.filter(folder => folder.parentId === parentId);
  if (!children.length) return null;
  return <ul className="wsp-tree" style={{paddingLeft: depth ? 14 : 0}}>{children.map(folder => <li key={folder.id}>
    <button type="button" className={folder.id === selected ? 'is-selected' : ''} onClick={() => onSelect(folder.id)}><Folder size={15}/><span>{folder.name}</span><small>{counts[folder.id] ?? 0}</small></button>
    <Tree folders={folders} counts={counts} parentId={folder.id} selected={selected} onSelect={onSelect} depth={depth + 1}/>
  </li>)}</ul>;
}

function ItemEditor({draft, setDraft, folders, onClose, onSaved}: {draft: ItemDraft; setDraft: (d: ItemDraft) => void; folders: WorkFolder[]; onClose: () => void; onSaved: (item: WorkItem) => void}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    const body = {folderId: draft.folderId, type: draft.type, title: draft.title, body: draft.body, url: draft.type === 'link' ? draft.url : undefined, checklist: draft.type === 'checklist' ? draft.checklist.filter(row => row.text.trim()) : undefined, dueAt: draft.dueAt || null, tags: draft.tags.split(/[,\s]+/).filter(Boolean), sensitivity: draft.sensitive ? 'sensitive' : 'normal'};
    try {const data = await call<{item: WorkItem}>(draft.id ? `items/${draft.id}` : 'items', {body}); onSaved(data.item);} catch (e) {setError(message(e));} finally {setBusy(false);}
  }
  return <div className="wsp-dialog" role="dialog" aria-modal="true" aria-label="업무 항목"><div className="wsp-dialog-card">
    <div className="wsp-row"><h3>{draft.id ? '항목 고치기' : '새 항목'}</h3><button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={18}/></button></div>
    <div className="wsp-form">
      <div className="segmented wsp-seg">{ITEM_TYPES.map(type => <button type="button" key={type} className={draft.type === type ? 'selected' : ''} onClick={() => setDraft({...draft, type})}>{ITEM_TYPE_LABELS[type]}</button>)}</div>
      <label>제목<input value={draft.title} maxLength={120} onChange={e => setDraft({...draft, title: e.target.value})} autoFocus/></label>
      <label>폴더<select value={draft.folderId} onChange={e => setDraft({...draft, folderId: e.target.value})}>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      {draft.type === 'link' && <label>링크<input type="url" value={draft.url} placeholder="https://" onChange={e => setDraft({...draft, url: e.target.value})}/></label>}
      {draft.type === 'checklist' && <div className="wsp-checklist">
        {draft.checklist.map((row, index) => <div key={index} className="wsp-check-row"><input type="checkbox" checked={row.done} aria-label="완료" onChange={e => setDraft({...draft, checklist: draft.checklist.map((r, i) => i === index ? {...r, done: e.target.checked} : r)})}/><input value={row.text} maxLength={200} aria-label="체크리스트 항목" onChange={e => setDraft({...draft, checklist: draft.checklist.map((r, i) => i === index ? {...r, text: e.target.value} : r)})}/><button type="button" className="icon-button" aria-label="줄 지우기" onClick={() => setDraft({...draft, checklist: draft.checklist.filter((_, i) => i !== index)})}><X size={14}/></button></div>)}
        <button type="button" className="button soft" onClick={() => setDraft({...draft, checklist: [...draft.checklist, {text: '', done: false}]})} disabled={draft.checklist.length >= 50}><Plus size={14}/>줄 추가</button>
      </div>}
      <label>내용<textarea value={draft.body} maxLength={8000} rows={5} onChange={e => setDraft({...draft, body: e.target.value})}/></label>
      <div className="wsp-pair"><label>기한<input type="date" value={draft.dueAt} onChange={e => setDraft({...draft, dueAt: e.target.value})}/></label><label>태그<input value={draft.tags} placeholder="쉼표로 구분" onChange={e => setDraft({...draft, tags: e.target.value})}/></label></div>
      <label className="wsp-check"><input type="checkbox" checked={draft.sensitive} onChange={e => setDraft({...draft, sensitive: e.target.checked})}/>민감 항목 <small>외부 연결·알림·내보내기 기본값에서 빠져요.</small></label>
      {draft.type === 'file' && !draft.id && <p className="wsp-muted">저장한 뒤 목록에서 파일을 올려요.</p>}
    </div>
    {error && <p className="wsp-error" role="alert">{error}</p>}
    <div className="wsp-actions"><button type="button" className="button primary" disabled={busy || !draft.title.trim()} onClick={() => void save()}>{busy && <LoaderCircle className="spin" size={16}/>}저장</button></div>
  </div></div>;
}

export function FoldersTab() {
  const [folders, setFolders] = useState<WorkFolder[] | null>(null), [counts, setCounts] = useState<Record<string, number>>({}), [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<WorkItemSummary[] | null>(null), [query, setQuery] = useState(''), [dueBefore, setDueBefore] = useState(''), [error, setError] = useState('');
  const [newFolder, setNewFolder] = useState<{name: string; kind: FolderKind; nested: boolean} | null>(null), [draft, setDraft] = useState<ItemDraft | null>(null), [open, setOpen] = useState<WorkItem | null>(null), [uploading, setUploading] = useState<string | null>(null);
  const loadFolders = useCallback(async () => {
    try {const data = await call<{folders: WorkFolder[]; counts: Record<string, number>}>('folders'); setFolders(data.folders); setCounts(data.counts); setSelected(current => current && data.folders.some(f => f.id === current) ? current : data.folders[0]?.id ?? null);} catch (e) {setError(message(e));}
  }, []);
  const loadItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim() || dueBefore) {if (query.trim()) params.set('q', query.trim()); if (dueBefore) params.set('dueBefore', dueBefore);} else if (selected) params.set('folderId', selected); else {setItems([]); return;}
    try {setItems((await call<{items: WorkItemSummary[]}>(`items?${params}`)).items);} catch (e) {setError(message(e));}
  }, [query, dueBefore, selected]);
  useEffect(() => {void loadFolders();}, [loadFolders]);
  useEffect(() => {const timer = setTimeout(() => void loadItems(), 250); return () => clearTimeout(timer);}, [loadItems]);
  const folderNames = useMemo(() => new Map((folders ?? []).map(f => [f.id, f.name])), [folders]);
  const current = folders?.find(folder => folder.id === selected) ?? null;
  async function addFolder() {
    if (!newFolder) return;
    try {const data = await call<{folder: WorkFolder}>('folders', {body: {name: newFolder.name, kind: newFolder.kind, parentId: newFolder.nested ? selected : null}}); setNewFolder(null); await loadFolders(); setSelected(data.folder.id);} catch (e) {setError(message(e));}
  }
  async function renameFolder() {
    if (!current) return;
    const name = prompt('폴더 이름', current.name);
    if (!name?.trim()) return;
    try {await call(`folders/${current.id}`, {body: {name}}); await loadFolders();} catch (e) {setError(message(e));}
  }
  async function removeFolder() {
    if (!current || !confirm(`"${current.name}" 폴더를 지울까요?`)) return;
    try {await call(`folders/${current.id}`, {method: 'DELETE'}); setSelected(null); await loadFolders();} catch (e) {setError(message(e));}
  }
  async function openItem(id: string) {
    try {setOpen((await call<{item: WorkItem}>(`items/${id}`)).item);} catch (e) {setError(message(e));}
  }
  async function removeItem(item: WorkItem) {
    if (!confirm(`"${item.title}" 항목을 지울까요?`)) return;
    try {await call(`items/${item.id}`, {method: 'DELETE'}); setOpen(null); await Promise.all([loadItems(), loadFolders()]);} catch (e) {setError(message(e));}
  }
  async function upload(item: WorkItem, file: File | undefined) {
    if (!file) return;
    const contentType = workspaceFileMime(file);
    if (file.size > WORKSPACE_FILE_BYTES) {setError('파일은 50MB까지 올릴 수 있어요.'); return;}
    setUploading(item.id); setError('');
    let fileId: string | undefined;
    try {
      const transfer = await call<{fileId: string; uploadUrl: string; uploadHeaders: Record<string, string>}>(`items/${item.id}/file`, {body: {fileName: file.name, contentType, size: file.size}});
      fileId = transfer.fileId;
      await sendUpload({...transfer, uploadId: transfer.fileId, path: ''}, file, () => {});
      setOpen((await call<{item: WorkItem}>(`items/${item.id}/file/${transfer.fileId}`, {body: {}})).item); await loadItems();
    } catch (e) {
      setError(message(e));
      if (fileId) void call(`items/${item.id}/file/${fileId}`, {method: 'DELETE'}).catch(() => {});
    } finally {setUploading(null);}
  }
  async function download(item: WorkItem) {
    try {const data = await call<{url: string}>(`items/${item.id}/file`); window.open(data.url, '_blank', 'noopener');} catch (e) {setError(message(e));}
  }
  const edit = (item: WorkItem) => {setOpen(null); setDraft({id: item.id, folderId: item.folderId, type: item.type, title: item.title, body: item.body, url: item.url ?? '', checklist: item.checklist, dueAt: item.dueAt ?? '', tags: item.tags.join(', '), sensitive: item.sensitivity === 'sensitive'});};
  if (!folders) return <section className="wsp-panel">{error ? <p className="wsp-error">{error}</p> : <p className="wsp-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p>}</section>;
  return <section className="wsp-panel wsp-folders">
    <aside className="wsp-card wsp-tree-card">
      <div className="wsp-row"><h3>업무 폴더</h3><button type="button" className="icon-button" onClick={() => setNewFolder({name: '', kind: 'class', nested: false})} aria-label="폴더 추가"><FolderPlus size={17}/></button></div>
      {newFolder && <div className="wsp-form wsp-new-folder">
        <input value={newFolder.name} maxLength={80} placeholder="폴더 이름" aria-label="폴더 이름" onChange={e => setNewFolder({...newFolder, name: e.target.value})} autoFocus/>
        <select value={newFolder.kind} aria-label="폴더 종류" onChange={e => setNewFolder({...newFolder, kind: e.target.value as FolderKind})}>{FOLDER_KINDS.map(kind => <option key={kind} value={kind}>{FOLDER_KIND_LABELS[kind]}</option>)}</select>
        {current && <label className="wsp-check"><input type="checkbox" checked={newFolder.nested} onChange={e => setNewFolder({...newFolder, nested: e.target.checked})}/>“{current.name}” 안에 만들기</label>}
        <div className="wsp-actions"><button type="button" className="button soft" onClick={() => setNewFolder(null)}>취소</button><button type="button" className="button primary" disabled={!newFolder.name.trim()} onClick={() => void addFolder()}>만들기</button></div>
      </div>}
      {!folders.length && !newFolder ? <p className="wsp-muted">폴더를 만들어 학급·평가·행사 자료를 모아 보세요.</p> : <Tree folders={folders} counts={counts} parentId={null} selected={selected} onSelect={id => {setSelected(id); setQuery(''); setDueBefore('');}} depth={0}/>}
    </aside>
    <div className="wsp-card wsp-items">
      <div className="wsp-row wsp-items-head">
        <h3>{query.trim() || dueBefore ? '검색 결과' : current ? <>{current.name} <small>{FOLDER_KIND_LABELS[current.kind]}</small></> : '항목'}</h3>
        {current && !query.trim() && !dueBefore && <div className="wsp-row-actions"><button type="button" className="icon-button" onClick={() => void renameFolder()} aria-label="폴더 이름 바꾸기"><Pencil size={15}/></button><button type="button" className="icon-button" onClick={() => void removeFolder()} aria-label="폴더 지우기"><Trash2 size={15}/></button></div>}
      </div>
      <div className="wsp-search"><Search size={15}/><input value={query} placeholder="제목·태그 검색" aria-label="제목·태그 검색" onChange={e => setQuery(e.target.value)}/><input type="date" value={dueBefore} aria-label="이 날짜까지 기한" title="이 날짜까지 기한" onChange={e => setDueBefore(e.target.value)}/></div>
      {error && <p className="wsp-error" role="alert">{error}</p>}
      <button type="button" className="button primary wsp-add" disabled={!folders.length} onClick={() => setDraft(emptyItem(selected ?? folders[0].id))}><Plus size={15}/>항목 추가</button>
      {!items ? <p className="wsp-muted"><LoaderCircle className="spin" size={16}/></p> : !items.length ? <p className="wsp-muted">항목이 없어요.</p> : <ul className="wsp-list">{items.map(item => {const Icon = TYPE_ICONS[item.type]; return <li key={item.id} className={`${item.pending ? 'is-pending' : ''}${item.sensitivity === 'sensitive' ? ' is-sensitive' : ''}`}>
        <button type="button" className="wsp-item-open" onClick={() => void openItem(item.id)}><Icon size={16}/><span><strong>{item.title}</strong><small>{[query.trim() || dueBefore ? folderNames.get(item.folderId) : '', item.dueAt ? `기한 ${item.dueAt}` : '', item.tags.map(t => `#${t}`).join(' '), item.hasFile ? '파일' : '', item.sensitivity === 'sensitive' ? '민감' : ''].filter(Boolean).join(' · ')}</small></span></button>
        {item.pending && <BerryPending onConfirm={() => call(`items/${item.id}/confirm`, {body: {}}).then(loadItems)}/>}
      </li>;})}</ul>}
    </div>
    {open && <div className="wsp-dialog" role="dialog" aria-modal="true" aria-label={open.title}><div className="wsp-dialog-card">
      <div className="wsp-row"><h3>{open.title}</h3><button type="button" className="icon-button" onClick={() => setOpen(null)} aria-label="닫기"><X size={18}/></button></div>
      <p className="wsp-muted">{[ITEM_TYPE_LABELS[open.type], folderNames.get(open.folderId), open.dueAt ? `기한 ${open.dueAt}` : '', open.tags.map(t => `#${t}`).join(' ')].filter(Boolean).join(' · ')}</p>
      {open.pending && <BerryPending onConfirm={() => call(`items/${open.id}/confirm`, {body: {}}).then(() => {setOpen({...open, pending: false}); return loadItems();})}/>}
      {open.url && <p><a className="wsp-link" href={open.url} target="_blank" rel="noopener noreferrer">{open.url}</a></p>}
      {open.checklist.length > 0 && <ul className="wsp-checks">{open.checklist.map((row, i) => <li key={i} className={row.done ? 'is-done' : ''}>{row.done ? '☑' : '☐'} {row.text}</li>)}</ul>}
      {open.body && <p className="wsp-body">{open.body}</p>}
      <div className="wsp-file">
        {open.file ? <button type="button" className="button soft" onClick={() => void download(open)}><Download size={15}/>{open.file.fileName}</button> : <span className="wsp-muted">첨부 파일 없음</span>}
        <label className="button soft wsp-upload">{uploading === open.id ? <LoaderCircle className="spin" size={15}/> : <Paperclip size={15}/>}{open.file ? '파일 바꾸기' : '파일 올리기'}<input type="file" hidden disabled={!!uploading} onChange={e => void upload(open, e.target.files?.[0])}/></label>
      </div>
      <div className="wsp-actions"><button type="button" className="button danger" onClick={() => void removeItem(open)}><Trash2 size={15}/>지우기</button><button type="button" className="button soft" onClick={() => edit(open)}><Pencil size={15}/>고치기</button></div>
    </div></div>}
    {draft && <ItemEditor draft={draft} setDraft={setDraft} folders={folders} onClose={() => setDraft(null)} onSaved={item => {setDraft(null); void loadItems(); void loadFolders(); setOpen(item);}}/>}
  </section>;
}
