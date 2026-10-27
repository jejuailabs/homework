'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, Copy, Download, Eraser, Hand, Highlighter, LockKeyhole, Mic, MicOff, PenLine, Pencil, Redo2, RotateCcw, Save, Share2, Smile, Sparkles, Trash2, Type, Undo2, ZoomIn, ZoomOut} from 'lucide-react';
import {spaceCatalog, spaceItem, type DiaryLayer, type DiaryPage} from './catalog';
import {moodStickers} from './diary-stickers';
import DiaryCanvas, {type DiaryTool} from './diary-canvas';
import {useDiaryDraft} from './diary-editor-draft';
import './diary-editor.css';

type Props = {
  page: DiaryPage; owned: string[]; onSave: (page: DiaryPage) => Promise<DiaryPage>; onBack: () => void;
  onLock?: () => void | Promise<void | boolean>; onExport?: (page: DiaryPage) => Promise<void>;
  onShare?: (page: DiaryPage) => Promise<void>;
  onContinue?: (page: DiaryPage) => Promise<void> | void;
  registerBeforeLeave?: (flush: (() => Promise<boolean>) | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  locked?: boolean;
};
type LocalRecognition = {
  processLocally: boolean; lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((event: {resultIndex: number; results: {length: number; [index: number]: {isFinal: boolean; 0: {transcript: string}}}}) => void) | null;
  onend: (() => void) | null; onerror: ((event: {error: string}) => void) | null;
};
type LocalRecognitionConstructor = {new(): LocalRecognition; available?: (options: {langs: string[]; processLocally: boolean}) => Promise<string>};
const palette = ['#3f5048', '#a8626b', '#b7804b', '#588e91', '#7a70a4', '#88a36b'];
const toolOptions: {id: DiaryTool; label: string; Icon: typeof Hand}[] = [
  {id: 'select', label: '옮기기', Icon: Hand}, {id: 'text', label: '글 쓰기', Icon: Type},
  {id: 'pen', label: '펜', Icon: PenLine}, {id: 'pencil', label: '연필', Icon: Pencil},
  {id: 'marker', label: '형광펜', Icon: Highlighter}, {id: 'eraser', label: '획 지우기', Icon: Eraser},
];
const titleForLayer = (layer: DiaryLayer | undefined) => !layer ? '' : layer.kind === 'text' ? '내 글 조각' : layer.kind === 'ink' ? '내 손글씨' : spaceItem(layer.itemId)?.name || '내 사진';

export default function DiaryEditor({page, owned, onSave, onBack, onLock, onExport, onShare, onContinue, registerBeforeLeave, onDirtyChange, locked = false}: Props) {
  const editor = useDiaryDraft(page, onSave), d = editor.draft;
  const [selected, setSelected] = useState(''), [tool, setTool] = useState<DiaryTool>('text');
  const [color, setColor] = useState('#3f5048'), [width, setWidth] = useState(4), [penOnly, setPenOnly] = useState(false), [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState(''), [leaving, setLeaving] = useState(false), [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [continuing, setContinuing] = useState(false), [textOverflow, setTextOverflow] = useState(false);
  const [fullTextOpen, setFullTextOpen] = useState(false);
  const [speechState, setSpeechState] = useState<'idle' | 'checking' | 'listening'>('idle'), [speechHint, setSpeechHint] = useState('');
  const recognizer = useRef<LocalRecognition | null>(null), speechAlive = useRef(true), pendingSpeech = useRef(false), commitCanvas = useRef<(() => void) | null>(null);
  const speechEpoch = useRef(0);
  const stoppingSpeech = useRef<Promise<void> | null>(null), editorRoot = useRef<HTMLElement>(null);
  const currentRef = useRef(editor.current); currentRef.current = editor.current;
  const speechTarget = useRef('');
  const active = d.layers.find(layer => layer.id === selected);
  const editable = !leaving && !exporting && !sharing && !continuing;
  const ownedSet = new Set(owned);
  const stickers = spaceCatalog.filter(item => item.kind === 'sticker' && ownedSet.has(item.id) && !moodStickers.some(mood => mood.id === item.id));
  const papers = spaceCatalog.filter(item => item.kind === 'paper' && (ownedSet.has(item.id) || item.id === d.paper));
  const stopSpeech = useCallback(async () => {
    speechEpoch.current++;
    if (stoppingSpeech.current) return stoppingSpeech.current;
    const current = recognizer.current;
    if (!current) {if (speechAlive.current) setSpeechState('idle'); return;}
    stoppingSpeech.current = new Promise<void>(resolve => {
      const finish = () => {if (speechAlive.current) setSpeechState('idle'); recognizer.current = null; resolve();};
      const timeout = setTimeout(() => {
        current.onresult = null; current.onend = null; current.onerror = null;
        try {current.abort();} catch {}
        finish();
      }, 2000);
      current.onend = () => {clearTimeout(timeout); finish();};
      try {current.stop();} catch {clearTimeout(timeout); finish();}
    });
    await stoppingSpeech.current;
    stoppingSpeech.current = null;
  }, []);
  const flush = useCallback(async () => {commitCanvas.current?.(); await stopSpeech(); return editor.flush();}, [editor.flush, stopSpeech]);

  useEffect(() => {registerBeforeLeave?.(flush); return () => registerBeforeLeave?.(null);}, [registerBeforeLeave, flush]);
  useEffect(() => {onDirtyChange?.(editor.dirty);}, [editor.dirty, onDirtyChange]);
  useEffect(() => {editorRoot.current?.scrollIntoView({block: 'start', behavior: 'instant'});}, [page.id]);
  useEffect(() => {if (locked) void stopSpeech();}, [locked, stopSpeech]);
  useEffect(() => {if (textOverflow) setFullTextOpen(true);}, [textOverflow, selected]);
  useEffect(() => {
    speechAlive.current = true;
    return () => {speechAlive.current = false; const current = recognizer.current; if (current) {current.onresult = null; current.onend = null; current.onerror = null; current.abort();} recognizer.current = null;};
  }, []);

  function changeLayers(layers: DiaryLayer[]) {editor.edit({...editor.current(), schemaVersion: 2, layers});}
  function updateActive(patch: Partial<DiaryLayer>) {
    const current = editor.current();
    changeLayers(current.layers.map(layer => layer.id === selected ? {...layer, ...patch} : layer));
  }
  function addText(x = 50, y = 24) {
    const current = editor.current();
    if (current.layers.length >= 500) {setNotice('새 페이지에 이야기를 이어 써 주세요.'); return '';}
    const id = crypto.randomUUID();
    changeLayers([...current.layers, {id, kind: 'text', itemId: '', text: '', x, y, size: 76, rotation: 0, flip: false, color, fontSize: 24, align: 'left'}]);
    setSelected(id); setTool('text');
    return id;
  }
  function addSticker(itemId: string, x = 68, y = 30) {
    if (!editable || !ownedSet.has(itemId) || spaceItem(itemId)?.kind !== 'sticker') return;
    const current = editor.current();
    if (current.layers.length >= 500) {setNotice('새 페이지에 스티커를 이어 붙여 주세요.'); return;}
    const id = crypto.randomUUID();
    const mood = moodStickers.find(item => item.id === itemId);
    editor.edit({...current, schemaVersion: 2, ...(mood ? {mood: mood.mood} : {}), layers: [...current.layers, {id, kind: 'sticker', itemId, x, y, size: 19, rotation: 0, flip: false}]});
    setSelected(id); setTool('select'); setNotice('');
  }
  function moveLayer(direction: number) {
    const layers = [...editor.current().layers], index = layers.findIndex(layer => layer.id === selected), destination = index + direction;
    if (index < 0 || destination < 0 || destination >= layers.length) return;
    [layers[index], layers[destination]] = [layers[destination], layers[index]];
    changeLayers(layers);
  }
  function duplicate() {
    if (!active || d.layers.length >= 500) return;
    const id = crypto.randomUUID();
    changeLayers([...editor.current().layers, {...active, id, x: Math.min(95, active.x + 3), y: Math.min(95, active.y + 3)}]);
    setSelected(id);
  }
  function removeSelected() {changeLayers(editor.current().layers.filter(layer => layer.id !== selected)); setSelected('');}
  async function leave(action: () => void | Promise<void | boolean>) {
    if (leaving) return;
    setLeaving(true);
    try {if (await flush()) await action();}
    catch (reason) {setNotice(reason instanceof Error ? reason.message : '다시 시도해 주세요.');}
    finally {setLeaving(false);}
  }
  async function exportPage() {
    if (!onExport || exporting) return;
    setExporting(true);
    try {if (await flush()) await onExport(editor.current());}
    catch (reason) {setNotice(reason instanceof Error ? reason.message : '파일을 만들지 못했어요. 다시 시도해 주세요.');}
    finally {setExporting(false);}
  }
  async function sharePage() {
    if (!onShare || sharing) return;
    setSharing(true);
    try {if (await flush()) await onShare(editor.current());}
    catch (reason) {setNotice(reason instanceof Error ? reason.message : '공유본을 준비하지 못했어요. 다시 시도해 주세요.');}
    finally {setSharing(false);}
  }
  async function continuePage() {
    if (!onContinue || continuing) return;
    setContinuing(true);
    try {if (await flush()) await onContinue(editor.current());}
    catch (reason) {setNotice(reason instanceof Error ? reason.message : '다음 페이지를 열지 못했어요. 다시 시도해 주세요.');}
    finally {setContinuing(false);}
  }
  async function voice() {
    if (speechState === 'listening') {recognizer.current?.stop(); return;}
    if (pendingSpeech.current || !editable) return;
    const epoch = ++speechEpoch.current;
    pendingSpeech.current = true; setSpeechState('checking'); setSpeechHint('이 기기의 한국어 음성 입력을 확인하고 있어요…');
    try {
      const ctor = (window as unknown as {SpeechRecognition?: LocalRecognitionConstructor}).SpeechRecognition;
      if (!ctor?.available) throw new Error('이 브라우저에서는 기기 안에서 처리하는 음성 입력을 사용할 수 없어요. 글이나 손글씨로 남겨 주세요.');
      const status = await ctor.available({langs: ['ko-KR'], processLocally: true});
      if (!speechAlive.current || speechEpoch.current !== epoch) return;
      if (status !== 'available') throw new Error('이 기기에 한국어 음성 입력이 준비되어 있지 않아요. 자동으로 다운로드하거나 외부 음성 서비스에 연결하지 않아요.');
      const recognition = new ctor();
      if (!('processLocally' in recognition)) throw new Error('기기 내부 음성 처리를 확인할 수 없어요. 글이나 손글씨로 남겨 주세요.');
      recognition.processLocally = true; recognition.lang = 'ko-KR'; recognition.continuous = true; recognition.interimResults = false;
      const target = editor.current().layers.find(layer => layer.id === selected && layer.kind === 'text');
      speechTarget.current = target?.id || addText();
      if (!speechTarget.current) throw new Error('새 페이지에 이야기를 이어 써 주세요.');
      recognition.onresult = event => {
        if (!speechAlive.current) return;
        let transcript = '';
        for (let index = event.resultIndex; index < event.results.length; index++) if (event.results[index].isFinal) transcript += event.results[index][0].transcript + ' ';
        if (!transcript) return;
        const current = currentRef.current();
        const layer = current.layers.find(value => value.id === speechTarget.current && value.kind === 'text');
        if (!layer) {recognition.stop(); return;}
        const text = ((layer.text ? layer.text + ' ' : '') + transcript.trim());
        if (text.length > 6000) {recognition.stop(); setSpeechHint('글 조각이 가득 찼어요. 새 글 조각에 이어 말해 주세요.'); return;}
        changeLayers(current.layers.map(value => value.id === layer.id ? {...value, text} : value));
      };
      recognition.onerror = event => {
        if (!speechAlive.current) return;
        setSpeechState('idle');
        setSpeechHint(event.error === 'not-allowed' ? '마이크 사용을 허용하면 말로 적을 수 있어요.' : '음성 입력이 멈췄어요. 적힌 글은 그대로 남아요. 다시 시도하거나 직접 고쳐 주세요.');
      };
      recognition.onend = () => {if (speechAlive.current) setSpeechState('idle'); recognizer.current = null;};
      recognizer.current = recognition; recognition.start(); setSpeechState('listening');
      setSpeechHint('기기 안에서 듣고 있어요. 다 말하면 마이크를 눌러 멈추고, 적힌 글을 확인해 주세요.');
    } catch (reason) {
      if (speechAlive.current) {setSpeechState('idle'); setSpeechHint(reason instanceof Error ? reason.message : '음성 입력을 시작하지 못했어요.');}
    } finally {pendingSpeech.current = false;}
  }

  if (locked) return <div aria-label="잠긴 일기 초안"/>;
  return <section ref={editorRoot} className="sd-editor" aria-label="나의 비밀일기 쓰기" onKeyDown={event => {
    if (!editable || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {event.preventDefault(); if (event.shiftKey) editor.redo(); else editor.undo();}
    if (event.key === 'Escape') {setSelected(''); setTool('select');}
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {event.preventDefault(); removeSelected();}
  }}>
    <header className="sd-editor-top">
      <button className="sd-back" type="button" disabled={!editable} onClick={() => void leave(onBack)}><ArrowLeft size={17}/> 마음 달력</button>
      <span className="sd-private-label"><LockKeyhole size={13}/> 나만의 페이지</span>
      {onLock && <button className="sd-lock-button" type="button" disabled={!editable} onClick={() => void leave(onLock)}><LockKeyhole size={15}/> 잠그기</button>}
    </header>
    <div className="sd-editor-heading"><div><span className="sd-eyebrow">A LITTLE PAGE OF ME</span><h2>오늘의 마음을 펼쳐요 <span aria-hidden="true">✿</span></h2><p>잘 쓰지 않아도 괜찮아요. 내 마음이 담기면 충분해요.</p></div><span className="sd-date-badge"><strong>{Number(d.date.slice(8, 10))}</strong><small>{Number(d.date.slice(5, 7))}월의 이야기</small></span></div>
    <fieldset className="sd-page-meta" disabled={!editable}>
      <label className="sd-title-input"><span>오늘의 제목</span><input value={d.title} maxLength={60} onChange={event => editor.edit({...editor.current(), title: event.target.value})} placeholder="오늘을 뭐라고 부를까요?"/></label>
      <label><span>기록한 날짜</span><input type="date" value={d.date} onChange={event => {if (event.target.value) editor.edit({...editor.current(), date: event.target.value});}}/></label>
      <label><span>종이 고르기</span><select value={d.paper} onChange={event => editor.edit({...editor.current(), paper: event.target.value})}>{papers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </fieldset>
    <div className="sd-editing-layout">
      <div className="sd-writing-side">
        <div className="sd-toolbox">
          <div className="sd-tool-row" role="toolbar" aria-label="일기 쓰기 도구">{toolOptions.map(({id, label, Icon}) => <button key={id} className="sd-tool" type="button" aria-pressed={tool === id} disabled={!editable} onClick={() => {commitCanvas.current?.(); setTool(id); if (id === 'marker') setWidth(18); else if (id === 'pen' || id === 'pencil') setWidth(4);}}><Icon size={19}/><span>{label}</span></button>)}<span className="sd-tool-divider"/><button type="button" className={`sd-tool sd-mic ${speechState === 'listening' ? 'is-listening' : ''}`} aria-pressed={speechState === 'listening'} disabled={!editable || speechState === 'checking'} onClick={() => void voice()}>{speechState === 'listening' ? <MicOff size={19}/> : <Mic size={19}/>}<span>{speechState === 'listening' ? '그만 듣기' : '말로 쓰기'}</span></button></div>
          <div className="sd-tool-options"><div className="sd-colors" role="group" aria-label="글씨 색">{palette.map(value => <button key={value} className="sd-color" type="button" style={{backgroundColor: value}} aria-label={`${value} 색 선택`} aria-pressed={color === value} disabled={!editable} onClick={() => {setColor(value); if (active?.kind === 'text') updateActive({color: value});}}>{color === value && <Check size={13}/>}</button>)}<label className="sd-custom-color" title="다른 색 고르기"><input type="color" value={color} aria-label="다른 글씨 색" disabled={!editable} onChange={event => {setColor(event.target.value); if (active?.kind === 'text') updateActive({color: event.target.value});}}/><span>＋</span></label></div>
            {['pen', 'pencil', 'marker'].includes(tool) && <label className="sd-pen-width">굵기 <input type="range" min="1" max={tool === 'marker' ? 36 : 16} step="1" value={width} disabled={!editable} onChange={event => setWidth(Number(event.target.value))}/><span>{width}</span></label>}
            {['pen', 'pencil', 'marker', 'eraser'].includes(tool) && <label className="sd-pen-only"><input type="checkbox" checked={penOnly} onChange={event => setPenOnly(event.target.checked)}/>펜으로만 쓰기</label>}
            {tool === 'text' && <span className="sd-tool-tip">종이를 톡 누르면 글을 쓸 수 있어요.</span>}
            {tool === 'select' && <span className="sd-tool-tip">조각을 끌어서 옮겨 보세요.</span>}
            {tool === 'eraser' && <span className="sd-tool-tip">손글씨 획을 쓸어 지워요.</span>}
          </div>
          {speechHint && <p className={`sd-speech-hint ${speechState === 'listening' ? 'is-listening' : ''}`} role="status"><Mic size={14}/>{speechHint}</p>}
        </div>
        <div className="sd-paper-controls"><div><button type="button" aria-label="실행 취소" title="실행 취소" disabled={!editable || !editor.canUndo} onClick={editor.undo}><Undo2 size={17}/></button><button type="button" aria-label="다시 실행" title="다시 실행" disabled={!editable || !editor.canRedo} onClick={editor.redo}><Redo2 size={17}/></button></div><span>{tool === 'pen' || tool === 'pencil' ? '천천히, 내 손글씨로' : '이 페이지는 나의 작은 세상'}</span><div><button type="button" aria-label="종이 축소" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .25))}><ZoomOut size={16}/></button><output aria-label="종이 확대 비율">{Math.round(zoom * 100)}%</output><button type="button" aria-label="종이 확대" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .25))}><ZoomIn size={16}/></button></div></div>
        <DiaryCanvas layers={d.layers} paper={d.paper} selected={selected} tool={tool} ink={{color, width, penOnly}} zoom={zoom} disabled={!editable} onChange={changeLayers} onSelect={setSelected} onTool={setTool} onText={addText} onSticker={addSticker} onBegin={editor.begin} onEnd={editor.end} onNotice={setNotice} commitRef={commitCanvas} onTextOverflow={setTextOverflow}/>
        {textOverflow && <p className="sd-editor-notice sd-text-overflow" role="status">종이 밖으로 나간 글이 있어요. 글은 모두 저장돼요. 글씨 크기와 위치를 조절해 주세요. 글 조각을 고르면 ‘글 전체 편집’에서 나누어 다음 장에 이어 쓸 수 있어요.</p>}
        {active && <fieldset className="sd-selection" disabled={!editable}><legend>{titleForLayer(active)} 꾸미기</legend><div className="sd-selection-controls"><label>크기<input type="range" min={active.kind === 'ink' ? 10 : 5} max="100" value={active.size} onPointerDown={editor.begin} onPointerUp={editor.end} onPointerCancel={editor.end} onChange={event => updateActive({size: Number(event.target.value)})}/></label><label>회전<input type="range" min="-180" max="180" step="5" value={active.rotation} onPointerDown={editor.begin} onPointerUp={editor.end} onPointerCancel={editor.end} onChange={event => updateActive({rotation: Number(event.target.value)})}/></label>{active.kind === 'text' && <label>글씨 크기<input type="range" min="14" max="44" value={active.fontSize || 24} onChange={event => updateActive({fontSize: Number(event.target.value)})}/></label>}</div><div className="sd-selection-buttons"><button type="button" onClick={() => updateActive({rotation: 0})} aria-label="회전 되돌리기"><RotateCcw size={16}/></button><button type="button" onClick={() => moveLayer(-1)} disabled={d.layers[0]?.id === selected} aria-label="뒤로 보내기"><ArrowDown size={16}/></button><button type="button" onClick={() => moveLayer(1)} disabled={d.layers.at(-1)?.id === selected} aria-label="앞으로 가져오기"><ArrowUp size={16}/></button><button type="button" onClick={duplicate} disabled={d.layers.length >= 500} aria-label="조각 복제"><Copy size={16}/></button>{active.kind === 'text' && <button type="button" onClick={() => setTool('text')}><Type size={15}/>글 고치기</button>}<button type="button" className="sd-remove" onClick={removeSelected}><Trash2 size={15}/>조각 지우기</button></div></fieldset>}
        {active?.kind === 'text' && <details key={active.id} className="sd-full-text" open={fullTextOpen} onToggle={event => setFullTextOpen(event.currentTarget.open)}><summary><Type size={15}/>글 전체 편집 <span>{(active.text || '').length} / 6000자</span><ChevronDown size={15}/></summary><label>종이에서 보이지 않는 글도 여기서 고칠 수 있어요.<textarea aria-label="선택한 글 전체 편집" rows={7} value={active.text || ''} disabled={!editable} maxLength={6000} onChange={event => updateActive({text: event.target.value})}/></label></details>}
        <div className="sd-save-footer"><span className={editor.error ? 'has-error' : ''} role="status">{editor.saving ? <><span className="sd-saving-dot"/>소중히 보관하는 중…</> : editor.error ? '아직 저장되지 않았어요' : editor.dirty ? '조금 뒤 자동으로 저장해요' : <><Check size={15}/>내 이야기가 저장됐어요</>}</span><div><button type="button" disabled={leaving || editor.saving || (!editor.dirty && !editor.error)} onClick={() => void flush()}><Save size={15}/>{editor.error ? '다시 저장' : '저장'}</button>{onExport && <button type="button" disabled={!editable} onClick={() => void exportPage()}><Download size={15}/>{exporting ? 'PDF 만드는 중…' : '이 페이지 PDF'}</button>}{onShare && <button type="button" disabled={!editable} onClick={() => void sharePage()}><Share2 size={15}/>{sharing ? '공유본 준비 중…' : '선생님께 보여주기'}</button>}</div></div>
        {onContinue && <button type="button" className="sd-continue" disabled={!editable} onClick={() => void continuePage()}>{continuing ? '다음 장을 펼치는 중…' : '다음 장에 이어쓰기'}<ArrowRight size={16}/></button>}
        {editor.error && <p className="sd-editor-error" role="alert">{editor.error} 이 화면을 닫기 전에 다시 저장해 주세요.</p>}
        {notice && <p className="sd-editor-notice" role="status">{notice}<button type="button" aria-label="안내 닫기" onClick={() => setNotice('')}>×</button></p>}
      </div>
      <aside className="sd-sticker-side" aria-label="마음과 꾸미기 스티커">
        <section className="sd-mood-tray"><div className="sd-tray-heading"><span className="sd-tray-icon"><Smile size={20}/></span><div><h3>지금 내 마음은</h3><p>어떤 마음이든 괜찮아요.</p></div></div><div className="sd-moods">{moodStickers.map(item => <button key={item.id} type="button" className={d.mood === item.mood ? 'is-chosen' : ''} disabled={!editable} draggable onDragStart={event => {event.dataTransfer.setData('application/x-diary-sticker', item.id); event.dataTransfer.effectAllowed = 'copy';}} onClick={() => addSticker(item.id)} aria-label={`${item.name} 마음 스티커 붙이기`} aria-pressed={d.mood === item.mood}><img src={item.art} alt="" draggable={false}/><span>{item.name}</span></button>)}</div>{d.mood && <button type="button" className="sd-clear-mood" onClick={() => editor.edit({...editor.current(), mood: ''})}>달력의 기분 표시 지우기</button>}<p className="sd-tray-note">여러 마음을 함께 붙여도 좋아요.<br/>마지막으로 고른 마음이 달력에 보여요.</p></section>
        <section className="sd-decor-tray"><div className="sd-tray-heading"><span className="sd-tray-icon pink"><Sparkles size={19}/></span><div><h3>나의 스티커 상자</h3><p>끌어 놓거나 톡 눌러 붙여요.</p></div></div><div className="sd-decor-grid">{stickers.map(item => <button key={item.id} type="button" title={item.name} disabled={!editable} draggable onDragStart={event => {event.dataTransfer.setData('application/x-diary-sticker', item.id); event.dataTransfer.effectAllowed = 'copy';}} onClick={() => addSticker(item.id)} aria-label={`${item.name} 붙이기`}>{item.art ? <img src={item.art} alt="" draggable={false}/> : item.motif === 'tape' ? <span className="sd-legacy-tape"/> : <span className="sd-legacy-sticker">{item.motif}</span>}<span className="sd-sticker-name">{item.name.replace(' 스티커', '')}</span></button>)}</div><p className="sd-tray-note">한 번 가진 스티커는 몇 번이든 붙여요.<br/>작은 상점에서 새 스티커도 만날 수 있어요.</p></section>
        <details className="sd-layer-list"><summary>페이지에 붙인 조각 <span>{d.layers.length}</span><ChevronDown size={15}/></summary><div>{[...d.layers].reverse().map((layer, index) => <button key={layer.id} type="button" aria-pressed={selected === layer.id} onClick={() => {setSelected(layer.id); setTool('select');}}><span>{d.layers.length - index}</span>{titleForLayer(layer)}</button>)}</div></details>
        <div className="sd-gentle-note"><span aria-hidden="true">✦</span><p>한 줄만 써도,<br/>스티커 하나만 붙여도<br/><strong>나만의 소중한 하루.</strong></p></div>
      </aside>
    </div>
  </section>;
}
