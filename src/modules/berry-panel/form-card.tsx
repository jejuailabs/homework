'use client';
import {useState, type FormEvent} from 'react';
import {Check, Send} from 'lucide-react';
import './form-card.css';

/**
 * Berry's "ask with a form" (brain event 'form'): inputs and choices instead of a list of questions. Sending turns the
 * answers into the next chat message; the form itself saves nothing. Used by the teacher panel and the login-free tour.
 */
export type BerryFormField = {key: string; label: string; type: 'text' | 'textarea' | 'choice' | 'date' | 'toggle'; options?: string[]; value?: string | boolean; required?: boolean; placeholder?: string};
export type BerryForm = {title: string; submit: string; fields: BerryFormField[]};

export function readBerryForm(data: Record<string, unknown>): BerryForm | null {
  if (typeof data.title !== 'string' || !Array.isArray(data.fields)) return null;
  const fields = (data.fields as BerryFormField[]).filter(f => f && typeof f.key === 'string' && typeof f.label === 'string' && ['text', 'textarea', 'choice', 'date', 'toggle'].includes(f.type)).slice(0, 8);
  return fields.length ? {title: data.title.slice(0, 40), submit: typeof data.submit === 'string' && data.submit ? data.submit.slice(0, 20) : '이대로 진행', fields} : null;
}

/** "숙제 내기\n제목: …\n제출 방식: 사진" — what Berry receives as the teacher's answer. */
export function formAnswer(form: BerryForm, values: Record<string, string | boolean>) {
  const lines = form.fields.map(f => {
    const v = values[f.key];
    if (f.type === 'toggle') return `${f.label}: ${v ? '켬' : '끔'}`;
    const text = typeof v === 'string' ? v.trim() : '';
    return text ? `${f.label}: ${text}` : '';
  }).filter(Boolean);
  return [`[${form.title}]`, ...lines].join('\n');
}

export function BerryFormCard({form, disabled, sent, onSubmit}: {form: BerryForm; disabled?: boolean; sent?: boolean; onSubmit: (text: string) => void}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(form.fields.map(f => [f.key, f.type === 'toggle' ? f.value === true : typeof f.value === 'string' ? f.value : ''])));
  const set = (key: string, value: string | boolean) => setValues(old => ({...old, [key]: value}));
  const missing = form.fields.some(f => f.required && f.type !== 'toggle' && !String(values[f.key] ?? '').trim());
  const submit = (event: FormEvent) => {event.preventDefault(); if (!missing && !disabled && !sent) onSubmit(formAnswer(form, values));};
  return <form className={`bf-card${sent ? ' is-sent' : ''}`} onSubmit={submit}>
    <strong className="bf-title">{form.title}</strong>
    {form.fields.map(f => <div key={f.key} className="bf-field">
      <span className="bf-label">{f.label}{f.required && <b>필수</b>}</span>
      {f.type === 'choice' ? <div className="bf-choices" role="radiogroup" aria-label={f.label}>{f.options?.map(option => <button key={option} type="button" role="radio" aria-checked={values[f.key] === option} className={values[f.key] === option ? 'on' : ''} disabled={sent} onClick={() => set(f.key, option)}>{option}</button>)}</div>
        : f.type === 'toggle' ? <button type="button" role="switch" aria-checked={values[f.key] === true} aria-label={f.label} className={`bf-toggle${values[f.key] ? ' on' : ''}`} disabled={sent} onClick={() => set(f.key, !values[f.key])}><i/>{values[f.key] ? '켬' : '끔'}</button>
        : f.type === 'textarea' ? <textarea rows={3} value={String(values[f.key] ?? '')} placeholder={f.placeholder} aria-label={f.label} maxLength={300} disabled={sent} onChange={e => set(f.key, e.target.value)}/>
        : <input type={f.type === 'date' ? 'text' : 'text'} value={String(values[f.key] ?? '')} placeholder={f.placeholder ?? (f.type === 'date' ? '예: 이번 주 금요일 오후 6시' : '')} aria-label={f.label} maxLength={300} disabled={sent} onChange={e => set(f.key, e.target.value)}/>}
    </div>)}
    {sent ? <p className="bf-sent"><Check size={14}/>보냈어요</p> : <button type="submit" className="bf-submit" disabled={disabled || missing}><Send size={15}/>{form.submit}</button>}
  </form>;
}
