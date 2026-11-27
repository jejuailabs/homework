'use client';
import Link from 'next/link';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {CheckCircle2, LoaderCircle, MessageCircle, Send} from 'lucide-react';
import {inquiryConsentText, inquiryLimits, sourceOf, validateInquiry, type InquiryTopic} from './policy';
import './styles.css';

/** People land here after the tour: a few fields, then "사용 요청하기" or "문의하기". */
export default function InquiryForm({from}: {from?: string}) {
  const source = sourceOf(from);
  const [error, setError] = useState(''), [busy, setBusy] = useState<InquiryTopic | ''>(''), [done, setDone] = useState<InquiryTopic | ''>('');
  const counted = useRef(false);

  // Count the press that brought the visitor here, once per tab, without blocking the page.
  useEffect(() => {
    if (counted.current) return; counted.current = true;
    const key = 'inquiry:viewed:' + source;
    try {if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1');} catch {}
    void fetch('/api/inquiry/view', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({source}), keepalive: true}).catch(() => {});
  }, [source]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const topic: InquiryTopic = submitter?.value === 'other' ? 'other' : 'start';
    const form = new FormData(event.currentTarget);
    const input = {name: form.get('name'), email: form.get('email'), phone: form.get('phone'), school: form.get('school'), message: form.get('message'), topic, consent: form.get('consent') === 'on', website: form.get('website'), source};
    const checked = validateInquiry(input);
    if (!checked.ok) {setError(checked.error); return;}
    setBusy(topic); setError('');
    try {
      const response = await fetch('/api/inquiry', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '보내지 못했어요.');
      setDone(topic);
      window.scrollTo({top: 0, behavior: 'smooth'});
    } catch (e) {setError(e instanceof Error ? e.message : '보내지 못했어요.');}
    finally {setBusy('');}
  }

  if (done) return <div className="iq-page"><section className="iq-card iq-done" role="status">
    <CheckCircle2 size={48}/><h1>{done === 'start' ? '사용 요청을 받았어요' : '문의를 받았어요'}</h1>
    <p>적어 주신 이메일로 연락드릴게요.</p>
    <Link className="iq-back" href="/try">체험으로 돌아가기</Link>
  </section></div>;

  return <div className="iq-page">
    <form className="iq-card iq-form" onSubmit={submit} noValidate>
      <header className="iq-head">
        <p className="iq-kicker">모두의 교실</p>
        <h1>우리 반에서 써 보고 싶으신가요?</h1>
        <p>이름과 이메일만 남겨 주시면 연락드릴게요.</p>
      </header>
      <div className="iq-grid">
        <Field label="이름" need><input name="name" autoComplete="name" maxLength={inquiryLimits.name} required/></Field>
        <Field label="이메일" need><input name="email" type="email" autoComplete="email" inputMode="email" maxLength={inquiryLimits.email} required/></Field>
        <Field label="학교"><input name="school" autoComplete="organization" maxLength={inquiryLimits.school}/></Field>
        <Field label="전화번호"><input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={inquiryLimits.phone} placeholder="010-0000-0000"/></Field>
      </div>
      <Field label="하고 싶은 말"><textarea name="message" rows={3} maxLength={inquiryLimits.message}/></Field>
      {/* Hidden from people; bots that fill every field get dropped quietly. */}
      <label className="iq-trap" aria-hidden="true">웹사이트<input name="website" tabIndex={-1} autoComplete="off"/></label>
      <label className="iq-consent"><input type="checkbox" name="consent"/><span><strong>개인정보 수집·이용 동의 (필수)</strong>{inquiryConsentText}</span></label>
      {error && <p className="iq-error" role="alert">{error}</p>}
      <div className="iq-buttons">
        <button className="iq-btn iq-btn-main" type="submit" value="start" disabled={Boolean(busy)}>{busy === 'start' ? <LoaderCircle className="spin" size={20}/> : <Send size={20}/>}사용 요청하기</button>
        <button className="iq-btn iq-btn-sub" type="submit" value="other" disabled={Boolean(busy)}>{busy === 'other' ? <LoaderCircle className="spin" size={18}/> : <MessageCircle size={18}/>}문의하기</button>
      </div>
    </form>
  </div>;
}

function Field({label, need, children}: {label: string; need?: boolean; children: React.ReactNode}) {
  return <label className="iq-field"><span className="iq-label">{label}{need ? <b>필수</b> : <i>선택</i>}</span>{children}</label>;
}
