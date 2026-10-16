'use client';

import {useEffect, useRef, useState, type ChangeEvent, type FormEvent} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {BookOpen, Check, Copy, Download, FileText, HeartHandshake, Languages, LoaderCircle, MessageCircle, NotebookPen, Sparkles, Upload} from 'lucide-react';

const tools = [
  ['resource', BookOpen], ['adapt', Languages], ['feedback', NotebookPen],
  ['notice', MessageCircle], ['conference', HeartHandshake], ['notes', FileText]
] as const;
type Tool = typeof tools[number][0];
type Result = {text: string; model: string; cached: boolean; tool: Tool; inputKey: string};
const MAX_SOURCE = 16000;
const REQUEST_TIMEOUT = 60000;
const errorKeys: Record<string, string> = {
  INPUT_INVALID: 'invalidInput', BODY_TOO_LARGE: 'sourceTooLong', AI_NOT_CONFIGURED: 'notConfigured',
  AI_RATE_LIMIT: 'rateLimit', AI_IN_PROGRESS: 'inProgress', AI_TIMEOUT: 'timeout',
  AI_UNAVAILABLE: 'unavailable', AI_INVALID_RESPONSE: 'invalidResponse', AI_INCOMPLETE: 'incomplete', AI_REFUSED: 'refused',
  UNAUTHENTICATED: 'sessionExpired', FORBIDDEN: 'forbidden'
};

export default function AiToolbox({initialTool = 'resource'}: {initialTool?: Tool}) {
  const t = useTranslations('common.toolbox');
  const locale = useLocale();
  const [tool, setTool] = useState<Tool>(initialTool);
  const [source, setSource] = useState('');
  const [grade, setGrade] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLTextAreaElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = pending || importing;
  const inputKey = JSON.stringify({tool, source: source.trim(), grade: grade.trim(), locale: locale === 'en' ? 'en' : 'ko'});
  const resultStale = result !== null && result.inputKey !== inputKey;

  useEffect(() => () => {
    requestRef.current?.abort();
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  async function importText(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busyRef.current) return;
    setError(''); setNotice('');
    if (!/\.(txt|md)$/i.test(file.name)) { setError(t('errors.fileType')); return; }
    if (file.size > 128 * 1024) { setError(t('errors.sourceTooLong')); return; }
    busyRef.current = true; setImporting(true);
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      if (text.includes('\u0000')) throw new Error('fileType');
      if (text.length > MAX_SOURCE) throw new Error('sourceTooLong');
      if (text.trim().length < 10) throw new Error('sourceTooShort');
      setSource(text);
      setNotice(t('imported', {name: file.name}));
    } catch (err) {
      const key = err instanceof Error && ['fileType', 'sourceTooLong', 'sourceTooShort'].includes(err.message) ? err.message : 'fileRead';
      setError(t('errors.' + key));
    } finally { busyRef.current = false; setImporting(false); }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    setError(''); setNotice(''); setCopied(false);
    const content = source.trim();
    if (content.length < 10) { setError(t('errors.sourceTooShort')); return; }
    if (content.length > MAX_SOURCE) { setError(t('errors.sourceTooLong')); return; }
    busyRef.current = true; setPending(true);
    const controller = new AbortController();
    requestRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT);
    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, signal: controller.signal,
        body: JSON.stringify({tool, source: content, ...(grade.trim() ? {grade: grade.trim()} : {}), locale: locale === 'en' ? 'en' : 'ko'})
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const code = data?.code || (response.status === 401 ? 'UNAUTHENTICATED' : response.status === 403 ? 'FORBIDDEN' : '');
        setError(t('errors.' + (errorKeys[code] || 'unavailable')));
        return;
      }
      if (typeof data?.text !== 'string' || !data.text.trim() || typeof data.model !== 'string') {
        setError(t('errors.invalidResponse')); return;
      }
      setResult({text: data.text, model: data.model, cached: data.cached === true, tool, inputKey});
      setNotice(t('generated'));
      requestAnimationFrame(() => resultRef.current?.focus({preventScroll: false}));
    } catch {
      if (!controller.signal.aborted || timedOut) setError(t(timedOut ? 'errors.timeout' : 'errors.network'));
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
      busyRef.current = false; setPending(false);
    }
  }

  async function copyResult() {
    if (!result?.text.trim()) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true); setNotice(t('copied'));
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      resultRef.current?.focus(); resultRef.current?.select();
      setNotice(t('copyFallback'));
    }
  }

  function downloadResult() {
    if (!result?.text.trim()) return;
    const url = URL.createObjectURL(new Blob(['\uFEFF', result.text], {type: 'text/plain;charset=utf-8'}));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${t('items.' + result.tool + '.title')}.txt`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(t('downloaded'));
  }

  return <div className="ai-toolbox">
    <header className="ai-heading">
      <div><p className="page-kicker">{t('kicker')}</p><h1 className="page-title">{t('title')}</h1><p className="page-description">{t('description')}</p></div>
      <div className="ai-heading-friend" aria-hidden="true"><Sparkles size={20}/><img src="/characters/hamster-kong.webp" alt="" width="108" height="108"/></div>
    </header>

    <section aria-labelledby="ai-tool-heading" className="ai-selection">
      <h2 id="ai-tool-heading" className="ai-step-heading"><span aria-hidden="true">1</span>{t('chooseTool')}</h2>
      <div className="ai-tool-grid">
        {tools.map(([key, Icon]) => <button type="button" key={key} className={'ai-tool-choice' + (tool === key ? ' selected' : '')} aria-pressed={tool === key} disabled={busy} onClick={() => { setTool(key); setError(''); setNotice(''); }}>
          <span className="ai-tool-icon"><Icon size={21}/></span>
          <span><strong>{t('items.' + key + '.title')}</strong><small>{t('items.' + key + '.description')}</small></span>
          {tool === key && <Check className="ai-choice-check" size={16} aria-hidden="true"/>}
        </button>)}
      </div>
    </section>

    <div className="ai-work-grid">
      <form className="ai-panel ai-source-panel" onSubmit={generate}>
        <h2 className="ai-step-heading"><span aria-hidden="true">2</span>{t('addSource')}</h2>
        <label htmlFor="ai-source">{t('sourceLabel')}</label>
        <textarea id="ai-source" value={source} onChange={event => { setSource(event.target.value); setNotice(''); }} placeholder={t('items.' + tool + '.placeholder')} maxLength={MAX_SOURCE} minLength={10} required disabled={busy} aria-describedby="ai-source-hint ai-source-count" rows={9}/>
        <div className="ai-source-meta"><span id="ai-source-count">{t('characterCount', {count: source.length.toLocaleString(locale), max: MAX_SOURCE.toLocaleString(locale)})}</span><button type="button" className="ai-file-button" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={15}/>{t(importing ? 'importing' : 'importFile')}</button></div>
        <input ref={fileRef} className="ai-file-input" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={importText} tabIndex={-1} aria-hidden="true"/>
        <p className="ai-field-hint" id="ai-source-hint">{t('sourceHint')}</p>
        <label htmlFor="ai-grade">{t('gradeLabel')} <span className="ai-optional">{t('optional')}</span></label>
        <input id="ai-grade" value={grade} onChange={event => setGrade(event.target.value)} maxLength={40} placeholder={t('gradePlaceholder')} disabled={busy}/>
        <button className="button primary ai-generate" type="submit" disabled={busy || source.trim().length < 10}>{pending ? <LoaderCircle size={18} className="spin"/> : <Sparkles size={18}/>} {t(pending ? 'generating' : 'generate')}</button>
        {pending && <p className="ai-pending-note" role="status">{t('pendingHint')}</p>}
        {error && <p className="ai-error" role="alert">{error}</p>}
      </form>

      <section className={'ai-panel ai-result-panel' + (result ? ' has-result' : '')} aria-labelledby="ai-result-heading" aria-busy={pending}>
        <h2 id="ai-result-heading" className="ai-step-heading"><span aria-hidden="true">3</span>{t('reviewResult')}</h2>
        {result ? <>
          <div className="ai-result-info"><strong>{t('items.' + result.tool + '.title')}</strong><span>{t('draft')}</span></div>
          {resultStale && <p className="ai-stale-hint" role="status">{t('staleResult')}</p>}
          <label htmlFor="ai-result" className="ai-result-label">{t('editableResult')}</label>
          <textarea ref={resultRef} id="ai-result" value={result.text} onChange={event => { setResult({...result, text: event.target.value}); setCopied(false); }} readOnly={pending} rows={18} aria-describedby="ai-review-hint"/>
          <p className="ai-review-hint" id="ai-review-hint"><Check size={16}/>{t('reviewHint')}</p>
          <div className="ai-result-actions"><button type="button" className="button soft" onClick={copyResult} disabled={pending || !result.text.trim()}>{copied ? <Check size={17}/> : <Copy size={17}/>} {t(copied ? 'copiedButton' : 'copy')}</button><button type="button" className="button" onClick={downloadResult} disabled={pending || !result.text.trim()}><Download size={17}/>{t('download')}</button></div>
          <p className="ai-result-model">{t('model', {model: result.model})}{result.cached ? ` · ${t('cached')}` : ''}</p>
        </> : <div className="ai-result-empty"><img src="/characters/cat-mochi.webp" alt="" width="130" height="130"/><h3>{t('emptyTitle')}</h3><p>{t('emptyDescription')}</p><small>{t('reviewHint')}</small></div>}
      </section>
    </div>
    <p className="ai-notice" role="status" aria-live="polite">{notice}</p>
  </div>;
}
