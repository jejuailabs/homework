'use client';
import {useEffect, useMemo, useRef, useState, type ChangeEvent} from 'react';
import {ArrowLeft, BookOpen, ChevronLeft, ChevronRight, FileText, LoaderCircle, Mic, Pause, Pencil, Play, Plus, ScanText, SkipForward, Trash2, Upload, X} from 'lucide-react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {BOOK_PDF_MAX, bookLevel, bookLicenses, isBookLicense, pageSentences, pagesFromText, sampleBooks, type Book, type BookLicense, type BookPage} from './books';
import {deleteBook, listBooks, loadPdf, saveBook} from './store';
import {openPdf, pdfPageImage, pdfPageTexts, renderPdfPage} from './pdf';
import {deviceVoiceAvailable, readModeName, useReadAloud, type ReadMode, type VoiceSource} from './read-aloud';
import type {ReaderVoice} from './policy';

export const levelName = (level: number) => `${level}단계`;
const voiceName: Record<ReaderVoice, string> = {bright: '밝은 목소리', calm: '차분한 목소리', warm: '따뜻한 목소리'};

export default function Reader({scope, classId, ai, books, setBooks, onPractice}: {
  scope: string; classId: string; ai: boolean; books: Book[]; setBooks: (books: Book[]) => void;
  onPractice: (book: Book, page: number) => void;
}) {
  const [open, setOpen] = useState<Book | null>(null), [adding, setAdding] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    listBooks(scope).then(list => {if (alive) setBooks([...list, ...sampleBooks]);}).catch(() => {if (alive) {setBooks(sampleBooks); setError('이 브라우저에서는 책을 저장할 수 없어요. 기본 책만 볼 수 있어요.');}});
    return () => {alive = false;};
  }, [scope, setBooks]);
  async function update(book: Book) {
    if (!book.builtIn) await saveBook(scope, book);
    setBooks(books.map(b => b.id === book.id ? book : b));
    setOpen(book);
  }
  async function remove(book: Book) {
    if (book.builtIn || !confirm(`"${book.title}"을(를) 이 기기에서 지울까요?`)) return;
    await deleteBook(scope, book.id).catch(() => undefined);
    setBooks(books.filter(b => b.id !== book.id)); setOpen(null);
  }
  if (open) return <BookView key={open.id} book={open} scope={scope} classId={classId} ai={ai} onBack={() => setOpen(null)} onChange={update} onDelete={() => void remove(open)} onPractice={page => onPractice(open, page)}/>;
  return <div className="ss-library">
    <div className="ss-library-head">
      <div><h3>동화 서재</h3><p>책은 이 기기에만 저장돼요. 다른 곳에 공개되지 않아요.</p></div>
      <button type="button" className="ss-primary" onClick={() => setAdding(true)}><Plus size={16}/>책 추가</button>
    </div>
    {error && <p className="ss-error" role="alert">{error}</p>}
    <ul className="ss-books">
      {books.map(book => <li key={book.id}>
        <button type="button" className="ss-book" onClick={() => setOpen(book)}>
          <span className="ss-book-cover" data-level={book.level}><BookOpen size={22}/></span>
          <strong>{book.title}</strong>
          <small>{book.author || '작가 미상'}</small>
          <span className="ss-book-meta"><span className="ss-chip">{levelName(book.level)}</span><span>{book.pages.length}쪽</span>{book.hasPdf && <span>PDF</span>}{book.builtIn && <span>기본</span>}</span>
        </button>
      </li>)}
    </ul>
    {adding && <AddBook scope={scope} onClose={() => setAdding(false)} onAdded={book => {setBooks([book, ...books]); setAdding(false); setOpen(book);}}/>}
  </div>;
}

function AddBook({scope, onClose, onAdded}: {scope: string; onClose: () => void; onAdded: (book: Book) => void}) {
  const [title, setTitle] = useState(''), [author, setAuthor] = useState(''), [translator, setTranslator] = useState(''), [source, setSource] = useState('');
  const [license, setLicense] = useState<BookLicense | ''>(''), [confirmed, setConfirmed] = useState(false), [text, setText] = useState('');
  const [pdf, setPdf] = useState<{file: File; pages: string[]} | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {dialog.current?.showModal();}, []);
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > BOOK_PDF_MAX) {setError('80MB 이하의 PDF 파일을 골라 주세요.'); return;}
    setBusy(true); setError('');
    try {
      const doc = await openPdf(file), pages = await pdfPageTexts(doc);
      await doc.loadingTask.destroy();
      setPdf({file, pages});
      if (!title) setTitle(file.name.replace(/\.pdf$/i, '').slice(0, 80));
    } catch {setError('PDF를 열지 못했어요. 암호가 걸려 있거나 손상된 파일일 수 있어요.');}
    finally {setBusy(false);}
  }
  const empty = pdf ? pdf.pages.filter(p => !p).length : 0;
  const ready = title.trim() && source.trim() && isBookLicense(license) && confirmed && (pdf || text.trim());
  async function save() {
    if (!ready || busy) return;
    const pages: BookPage[] = pdf ? pdf.pages.map(text => ({text})) : pagesFromText(text);
    const book: Book = {id: crypto.randomUUID(), title: title.trim().slice(0, 80), author: author.trim().slice(0, 80), translator: translator.trim().slice(0, 80), source: source.trim().slice(0, 200), license: license as BookLicense, level: bookLevel(pages.filter(p => p.text)), pages, createdAt: new Date().toISOString(), hasPdf: Boolean(pdf)};
    setBusy(true);
    try {await saveBook(scope, book, pdf?.file); onAdded(book);}
    catch {setError('이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.'); setBusy(false);}
  }
  return <dialog ref={dialog} className="ss-dialog" onCancel={onClose} aria-labelledby="ss-add-title">
    <div className="ss-dialog-head"><h3 id="ss-add-title">책 추가</h3><button type="button" className="ss-icon" aria-label="닫기" onClick={onClose}><X size={18}/></button></div>
    <div className="ss-dialog-body">
      <div className="ss-upload">
        <label className="ss-secondary"><Upload size={16}/>PDF 고르기<input type="file" accept="application/pdf" onChange={choose} hidden/></label>
        <span>{busy ? '페이지 글을 꺼내는 중…' : pdf ? `${pdf.file.name} · ${pdf.pages.length}쪽` : '또는 아래에 글을 붙여 넣어도 돼요.'}</span>
      </div>
      {pdf && empty > 0 && <p className="ss-note">그림으로만 된 페이지가 {empty}쪽 있어요. 책을 연 뒤 그 페이지 글을 직접 입력하거나 AI로 읽게 할 수 있어요.</p>}
      {!pdf && <label className="ss-field">글 붙여 넣기 <small>빈 줄로 페이지를 나눠요</small><textarea rows={6} value={text} maxLength={200000} onChange={e => setText(e.target.value)}/></label>}
      <div className="ss-grid2">
        <label className="ss-field">제목<input value={title} maxLength={80} onChange={e => setTitle(e.target.value)}/></label>
        <label className="ss-field">지은이<input value={author} maxLength={80} onChange={e => setAuthor(e.target.value)}/></label>
        <label className="ss-field">옮긴이·그린이<input value={translator} maxLength={80} onChange={e => setTranslator(e.target.value)}/></label>
        <label className="ss-field">이용 조건<select value={license} onChange={e => setLicense(e.target.value as BookLicense)}><option value="">고르기</option>{Object.entries(bookLicenses).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      </div>
      <label className="ss-field">출처<input value={source} maxLength={200} placeholder="예) 공유마당 만료 저작물, 직접 쓴 글" onChange={e => setSource(e.target.value)}/></label>
      <p className="ss-note">원작의 저작권이 끝났어도 번역본과 그림에는 따로 저작권이 있어요. 시중 동화책을 스캔한 파일은 올리지 마세요.</p>
      <label className="ss-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>이 책을 수업에 써도 되는지 확인했어요.</label>
      {error && <p className="ss-error" role="alert">{error}</p>}
    </div>
    <div className="ss-dialog-foot"><button type="button" className="ss-secondary" onClick={onClose}>취소</button><button type="button" className="ss-primary" disabled={!ready || busy} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>}서재에 넣기</button></div>
  </dialog>;
}

function BookView({book, scope, classId, ai, onBack, onChange, onDelete, onPractice}: {
  book: Book; scope: string; classId: string; ai: boolean; onBack: () => void; onChange: (book: Book) => Promise<void>; onDelete: () => void; onPractice: (page: number) => void;
}) {
  const [page, setPage] = useState(0), [doc, setDoc] = useState<PDFDocumentProxy | null>(null), [pdfError, setPdfError] = useState('');
  const [mode, setMode] = useState<ReadMode>('listen'), [source, setSource] = useState<VoiceSource>(deviceVoiceAvailable() ? 'device' : 'ai');
  const [voice, setVoice] = useState<ReaderVoice>('bright'), [speed, setSpeed] = useState(0.9), [editing, setEditing] = useState(false), [draft, setDraft] = useState('');
  const [ocr, setOcr] = useState(false), [notice, setNotice] = useState(''), [showPdf, setShowPdf] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null), frame = useRef<HTMLDivElement>(null);
  const reader = useReadAloud({scope, bookId: book.id, classId, source, voice, speed, mode});
  const sentences = useMemo(() => pageSentences(book.pages[page]), [book.pages, page]);
  const total = book.pages.length;

  useEffect(() => {
    if (!book.hasPdf) return;
    let alive = true, opened: PDFDocumentProxy | null = null;
    loadPdf(scope, book.id).then(async blob => {
      if (!blob) throw new Error('missing');
      opened = await openPdf(blob);
      if (alive) setDoc(opened); else void opened.loadingTask.destroy();
    }).catch(() => {if (alive) setPdfError('이 기기에서 PDF 원본을 찾지 못했어요. 페이지 글로 계속 읽을 수 있어요.');});
    return () => {alive = false; void opened?.loadingTask.destroy();};
  }, [book.hasPdf, book.id, scope]);
  useEffect(() => {
    if (!doc || !canvas.current || !frame.current || !showPdf) return;
    let task: Awaited<ReturnType<typeof renderPdfPage>> | null = null, cancelled = false;
    const width = Math.min(frame.current.clientWidth - 4, 900);
    renderPdfPage(doc, page + 1, canvas.current, width).then(t => {task = t; if (cancelled) t.cancel(); return t.promise;}).catch(error => {if (!cancelled) console.warn('PDF page render failed', error);});
    return () => {cancelled = true; task?.cancel();};
  }, [doc, page, showPdf]);
  useEffect(() => {reader.stop(); setEditing(false); setNotice('');}, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: number) => setPage(Math.max(0, Math.min(total - 1, to)));
  async function saveText(text: string) {
    const pages = book.pages.map((p, i) => i === page ? {text: text.trim().slice(0, 1200)} : p);
    await onChange({...book, pages, level: bookLevel(pages.filter(p => p.text))});
    setEditing(false);
  }
  async function readPageWithAi() {
    if (!doc || ocr) return;
    setOcr(true); setNotice('');
    try {
      const image = await pdfPageImage(doc, page + 1);
      const response = await fetch('/api/speech-studio/page-text', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({image, ...(classId ? {classId} : {})})});
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || '페이지 글을 읽지 못했어요.');
      setDraft(String(data.text || '')); setEditing(true);
      setNotice(data.text ? 'AI가 읽은 글이에요. 그림과 비교해 고친 뒤 저장해 주세요.' : '이 페이지에서 이야기 글을 찾지 못했어요.');
    } catch (reason) {setNotice(reason instanceof Error ? reason.message : '페이지 글을 읽지 못했어요.');}
    finally {setOcr(false);}
  }

  return <div className="ss-bookview">
    <div className="ss-bookbar">
      <button type="button" className="ss-icon" aria-label="서재로" onClick={() => {reader.stop(); onBack();}}><ArrowLeft size={18}/></button>
      <div className="ss-booktitle"><strong>{book.title}</strong><small>{[book.author, book.translator].filter(Boolean).join(' · ')}{book.source ? ` · 출처: ${book.source}` : ''}</small></div>
      <label className="ss-inline">수준<select value={book.level} onChange={e => void onChange({...book, level: +e.target.value})}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{levelName(n)}</option>)}</select></label>
      {!book.builtIn && <button type="button" className="ss-icon" aria-label="책 지우기" onClick={onDelete}><Trash2 size={17}/></button>}
    </div>
    <div className={'ss-reading' + (doc && showPdf ? ' has-pdf' : '')}>
      {doc && showPdf && <div className="ss-pdf" ref={frame}><canvas ref={canvas} aria-label={`${page + 1}쪽 그림`}/></div>}
      <div className="ss-pagetext">
        {pdfError && <p className="ss-note">{pdfError}</p>}
        {editing ? <div className="ss-edit">
          <textarea rows={8} value={draft} maxLength={1200} onChange={e => setDraft(e.target.value)} aria-label="페이지 글"/>
          <div className="ss-row"><button type="button" className="ss-secondary" onClick={() => setEditing(false)}>취소</button><button type="button" className="ss-primary" onClick={() => void saveText(draft)}>저장</button></div>
        </div> : sentences.length ? <p className="ss-sentences">{sentences.map((s, i) => <span key={i} className={i === reader.active ? 'is-reading' : i === reader.waiting ? 'is-yours' : ''}>{s} </span>)}</p>
          : <p className="ss-empty">이 페이지에는 글이 없어요.{book.builtIn ? '' : ' 글을 입력하면 읽어 줄 수 있어요.'}</p>}
        {reader.waiting >= 0 && <div className="ss-turn" role="status"><Mic size={16}/>{mode === 'turns' ? '이번 문장은 친구가 읽어요.' : '방금 들은 문장을 따라 읽어 보세요.'}<button type="button" className="ss-primary" onClick={reader.next}><SkipForward size={15}/>다음</button></div>}
        {notice && <p className="ss-note" role="status">{notice}</p>}
        {reader.error && <p className="ss-error" role="alert">{reader.error}</p>}
        {!book.builtIn && !editing && <div className="ss-row ss-tools">
          <button type="button" className="ss-text-btn" onClick={() => {setDraft(book.pages[page]?.text || ''); setEditing(true);}}><Pencil size={14}/>글 고치기</button>
          {doc && ai && <button type="button" className="ss-text-btn" disabled={ocr} onClick={() => void readPageWithAi()}>{ocr ? <LoaderCircle className="spin" size={14}/> : <ScanText size={14}/>}AI로 페이지 글 읽기 · 별도 비용</button>}
          {doc && <button type="button" className="ss-text-btn" onClick={() => setShowPdf(v => !v)}><FileText size={14}/>{showPdf ? '글만 크게 보기' : '그림 함께 보기'}</button>}
        </div>}
      </div>
    </div>
    <div className="ss-controls">
      <div className="ss-pager">
        <button type="button" className="ss-icon" aria-label="이전 쪽" disabled={page === 0} onClick={() => go(page - 1)}><ChevronLeft size={18}/></button>
        <span>{page + 1} / {total}</span>
        <button type="button" className="ss-icon" aria-label="다음 쪽" disabled={page >= total - 1} onClick={() => go(page + 1)}><ChevronRight size={18}/></button>
      </div>
      {reader.playing || reader.loading
        ? <button type="button" className="ss-primary" onClick={reader.stop}>{reader.loading ? <LoaderCircle className="spin" size={16}/> : <Pause size={16}/>}멈추기</button>
        : <button type="button" className="ss-primary" disabled={!sentences.length} onClick={() => reader.play(sentences, reader.waiting >= 0 ? reader.waiting + 1 : 0)}><Play size={16}/>읽어 주기</button>}
      <label className="ss-inline">방법<select value={mode} onChange={e => {reader.stop(); setMode(e.target.value as ReadMode);}}>{Object.entries(readModeName).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="ss-inline">목소리<select value={source === 'ai' ? voice : 'device'} onChange={e => {reader.stop(); if (e.target.value === 'device') setSource('device'); else {setSource('ai'); setVoice(e.target.value as ReaderVoice);}}}>
        {deviceVoiceAvailable() && <option value="device">기기 목소리 (무료)</option>}
        {ai && Object.entries(voiceName).map(([k, v]) => <option key={k} value={k}>AI {v}</option>)}
      </select></label>
      <label className="ss-inline">빠르기<input type="range" min={0.7} max={1.2} step={0.1} value={speed} onChange={e => {reader.stop(); setSpeed(+e.target.value);}} aria-valuetext={`${speed}배`}/><span>{speed.toFixed(1)}배</span></label>
      <button type="button" className="ss-secondary ss-push" disabled={!sentences.length} onClick={() => {reader.stop(); onPractice(page);}}><Mic size={16}/>이 쪽 따라 읽기 녹음</button>
    </div>
    {source === 'ai' && <p className="ss-foot">AI 목소리는 문장마다 한 번 만들어 이 기기에 저장해 두고 다시 써요. 처음 만들 때만 비용이 들어요.</p>}
  </div>;
}
