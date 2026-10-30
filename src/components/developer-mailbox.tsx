'use client';

import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {useLocale} from 'next-intl';
import {Check, LoaderCircle, Send, X} from 'lucide-react';
import {lockBodyScroll} from '@/lib/body-scroll-lock';
import {mailboxLimits} from '@/lib/developer-mailbox';
import {useVerifiedViewer} from './viewer-context';
import '@/styles/developer-mailbox.css';

function RedMailbox() {
  return <svg className="developer-mailbox-art" viewBox="0 0 72 88" fill="none" aria-hidden="true">
    <ellipse cx="37" cy="83" rx="25" ry="4" fill="#743524" opacity=".14"/>
    <path d="M24 64h26v16H24z" fill="#A93332"/><path d="M20 78h34v5H20z" fill="#822E2C"/>
    <path d="M12 28C12 11 23 5 36 5s24 6 24 23v42H12V28Z" fill="#D94A43"/>
    <path d="M36 5c13 0 24 6 24 23v42H46V24c0-8-3-14-10-19Z" fill="#BB3937"/>
    <path d="M19 28c0-11 7-16 17-16" stroke="#F78B78" strokeWidth="4" strokeLinecap="round"/>
    <rect x="18" y="29" width="36" height="7" rx="3.5" fill="#762E2A"/>
    <path d="m26 22 23 3-2 15-23-3 2-15Z" fill="#FFF5D8"/>
    <path d="m26 23 10 9 13-6" stroke="#D6A787" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M19 35h34" stroke="#F16D5A" strokeWidth="3" strokeLinecap="round"/>
    <rect x="23" y="45" width="26" height="16" rx="3" fill="#FFF3DB"/>
    <path d="M29 50h14M36 50v7" stroke="#BB3937" strokeWidth="2.2" strokeLinecap="round"/>
    <path d="M12 68h48v4H12z" fill="#A93332"/>
  </svg>;
}

export default function DeveloperMailbox({audience, authorName, className = ''}: {audience: 'teacher' | 'student'; authorName: string; className?: string}) {
  const en = useLocale() === 'en';
  const w = (ko: string, english: string) => en ? english : ko;
  const {viewer} = useVerifiedViewer();
  const [open, setOpen] = useState(false), [title, setTitle] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef(false), controller = useRef<AbortController | null>(null);
  const attempt = useRef<{title: string; message: string; requestId: string} | null>(null);
  const formId = useId();
  const close = () => {if (!pending.current) setOpen(false);};

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const release = lockBodyScroll();
    element.showModal();
    element.querySelector<HTMLInputElement>('input')?.focus();
    return () => {element.close(); release(); trigger.current?.focus();};
  }, [open]);
  useEffect(() => {
    if (sent) dialog.current?.querySelector<HTMLButtonElement>('.developer-letter-success button')?.focus();
  }, [sent]);
  useEffect(() => {
    setOpen(false); setTitle(''); setMessage(''); setSent(false); setError(''); attempt.current = null;
    return () => {controller.current?.abort();};
  }, [viewer?.uid]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !viewer || !title.trim() || !message.trim()) return;
    pending.current = true; setBusy(true); setError('');
    if (!attempt.current || attempt.current.title !== title.trim() || attempt.current.message !== message.trim()) attempt.current = {title: title.trim(), message: message.trim(), requestId: crypto.randomUUID()};
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 20_000);
    try {
      const response = await fetch('/api/developer-mailbox', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(attempt.current), signal: abort.signal});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || w('편지를 보내지 못했어요. 다시 시도해 주세요.', 'Please try sending your letter again.'));
      if (result.ok !== true || typeof result.id !== 'string') throw new Error(w('접수 여부를 확인하지 못했어요. 다시 시도해 주세요.', 'Please retry to confirm your letter was received.'));
      setSent(true); setTitle(''); setMessage(''); attempt.current = null;
    } catch (cause) {
      if (abort.signal.aborted) setError(w('응답이 늦어지고 있어요. 내용은 그대로예요. 다시 보내기를 눌러주세요.', 'The response timed out. Your draft is safe; please retry.'));
      else setError(cause instanceof Error ? cause.message : w('연결을 확인하고 다시 보내주세요.', 'Check your connection and try again.'));
    } finally {clearTimeout(timer); pending.current = false; setBusy(false);}
  }

  return <>
    <button ref={trigger} type="button" className={`developer-mailbox developer-mailbox-${audience}`} aria-label={w('개발자에게 편지 쓰기', 'Write to the developer')} aria-haspopup="dialog" aria-expanded={open} onClick={() => {setSent(false); setError(''); setOpen(true);}}>
      <RedMailbox/><span>{w('개발자에게 편지', 'Write to us')}</span>
    </button>
    {open && createPortal(<dialog ref={dialog} className="developer-letter-dialog" aria-labelledby={`${formId}-heading`} aria-describedby={`${formId}-intro`} onCancel={event => {event.preventDefault(); close();}} onClose={close}>
      <header><div><span className="developer-letter-kicker">A LITTLE LETTER</span><h2 id={`${formId}-heading`}>{w('개발자님, 이거 해주세요!', 'Dear developer, could you…?')}</h2></div><button className="icon-button" type="button" disabled={busy} onClick={close} aria-label={w('편지 닫기', 'Close letter')}><X size={21}/></button></header>
      {sent ? <div className="developer-letter-success" role="status"><span><Check size={30}/></span><h3>{w('우체통에 편지를 넣었어요!', 'Your letter is in the mailbox!')}</h3><p id={`${formId}-intro`}>{w('보내주신 의견은 개발자가 차근차근 살펴볼게요.', 'The developer will read your suggestion.')}</p><button className="button primary" type="button" onClick={close} autoFocus>{w('좋아요', 'Done')}</button></div>
        : <form onSubmit={submit}>
          <p id={`${formId}-intro`}>{w('필요한 기능이나 불편했던 점을 편하게 알려주세요.', 'Tell us about an idea or something that could work better.')}</p>
          <div className="developer-letter-author"><span>{w('보내는 사람', 'From')}</span><strong>{authorName || w(audience === 'student' ? '학생' : '선생님', audience === 'student' ? 'Student' : 'Teacher')}{className && <small> · {className}</small>}</strong><small>{w('로그인 계정으로 자동 기록돼요', 'Recorded from your signed-in account')}</small></div>
          <label htmlFor={`${formId}-title`}>{w('제목', 'Subject')}<small>{title.length}/{mailboxLimits.title}</small></label>
          <input id={`${formId}-title`} value={title} onChange={event => setTitle(event.target.value)} required maxLength={mailboxLimits.title} disabled={busy} placeholder={w('어떤 기능이 있으면 좋을까요?', 'What would you like us to add?')} autoFocus/>
          <label htmlFor={`${formId}-message`}>{w('메시지', 'Message')}<small>{message.length}/{mailboxLimits.message}</small></label>
          <textarea id={`${formId}-message`} value={message} onChange={event => setMessage(event.target.value)} required maxLength={mailboxLimits.message} disabled={busy} rows={5} placeholder={w('언제 불편했는지, 어떻게 바뀌면 좋을지 적어주세요.', 'Tell us what happened and what would help.')}/>
          <p className="developer-letter-hint">{w('편지는 운영자만 볼 수 있어요.', 'Only service administrators can read your letter.')}</p>
          {error && <p className="error-message" role="alert">{error}</p>}
          <footer><button type="button" className="button" disabled={busy} onClick={close}>{w('닫기', 'Close')}</button><button className="button developer-letter-send" disabled={busy || !title.trim() || !message.trim()}>{busy ? <LoaderCircle size={17} className="spin"/> : <Send size={17}/>} {w(busy ? '보내는 중…' : '편지 보내기', busy ? 'Sending…' : 'Send letter')}</button></footer>
        </form>}
    </dialog>, document.body)}
  </>;
}
