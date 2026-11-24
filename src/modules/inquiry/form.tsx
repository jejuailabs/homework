'use client';
import Link from 'next/link';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {CheckCircle2, LoaderCircle, Mail, Send} from 'lucide-react';
import {inquiryConsentText, inquiryLimits, inquiryTopicLabels, inquiryTopics, sourceOf, validateInquiry, type InquiryTopic} from './policy';
import './styles.css';

const steps = [
  ['Google 계정으로 시작', '모두의 교실 첫 화면에서 Google로 로그인하면 바로 선생님 화면이 열려요.'],
  ['학생 명단 붙여넣기', '"1. 김민서"처럼 붙여넣으면 우리 반이 만들어지고, 학생마다 6자리 입장 코드가 생겨요.'],
  ['첫 숙제 내기', '제출한 작품은 검사와 함께 전시관·보드에 걸려요. 지금은 모든 기능을 무료로 쓸 수 있어요.'],
];

export default function InquiryForm({from}: {from?: string}) {
  const source = sourceOf(from);
  const [topic, setTopic] = useState<InquiryTopic>('start');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
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
    const form = new FormData(event.currentTarget);
    const input = {name: form.get('name'), email: form.get('email'), phone: form.get('phone'), school: form.get('school'), message: form.get('message'), topic, consent: form.get('consent') === 'on', website: form.get('website'), source};
    const checked = validateInquiry(input);
    if (!checked.ok) {setError(checked.error); return;}
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/inquiry', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '문의를 보내지 못했어요.');
      setDone(true);
      window.scrollTo({top: 0, behavior: 'smooth'});
    } catch (e) {setError(e instanceof Error ? e.message : '문의를 보내지 못했어요.');}
    finally {setBusy(false);}
  }

  if (done) return <div className="iq-page"><section className="iq-card iq-done" role="status">
    <CheckCircle2 size={44}/><h1>문의를 잘 받았어요</h1>
    <p>적어 주신 이메일로 답장을 드릴게요. 기다리시는 동안 바로 시작해 보셔도 돼요.</p>
    <div className="iq-actions"><Link className="button primary" href="/">Google로 바로 시작하기</Link><Link className="button soft" href="/try">체험으로 돌아가기</Link></div>
  </section></div>;

  return <div className="iq-page">
    <section className="iq-card iq-intro">
      <p className="iq-kicker">모두의 교실 정식으로 쓰기</p>
      <h1>우리 반에서 바로 쓰려면 어떻게 하나요?</h1>
      <ol className="iq-steps">{steps.map(([title, text], i) => <li key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ol>
      <Link className="button primary iq-start" href="/">지금 Google로 시작하기</Link>
    </section>

    <form className="iq-card iq-form" onSubmit={submit} noValidate>
      <h2><Mail size={20}/>궁금한 점이 있으면 남겨 주세요</h2>
      <p className="iq-note">학교·학년 단위 도입, 사용 방법, 그 밖의 문의 모두 좋아요. 이메일로 답장드려요.</p>
      <fieldset className="iq-topics"><legend>문의 종류</legend>
        {inquiryTopics.map(t => <label key={t} className={topic === t ? 'on' : ''}><input type="radio" name="topic" value={t} checked={topic === t} onChange={() => setTopic(t)}/>{inquiryTopicLabels[t]}</label>)}
      </fieldset>
      <div className="iq-grid">
        <label>이름 <b>필수</b><input name="name" autoComplete="name" maxLength={inquiryLimits.name} required/></label>
        <label>이메일 <b>필수</b><input name="email" type="email" autoComplete="email" inputMode="email" maxLength={inquiryLimits.email} required/></label>
        <label>전화번호 <i>선택</i><input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={inquiryLimits.phone} placeholder="010-0000-0000"/></label>
        <label>학교 <i>선택</i><input name="school" autoComplete="organization" maxLength={inquiryLimits.school} placeholder="예: 바다초등학교"/></label>
      </div>
      <label>문의 내용 <i>{topic === 'other' ? '필수' : '선택'}</i><textarea name="message" rows={5} maxLength={inquiryLimits.message} placeholder="예: 학년 전체가 같이 쓸 수 있나요?"/></label>
      {/* Hidden from people; bots that fill every field get dropped quietly. */}
      <label className="iq-trap" aria-hidden="true">웹사이트<input name="website" tabIndex={-1} autoComplete="off"/></label>
      <label className="iq-consent"><input type="checkbox" name="consent"/><span><strong>개인정보 수집·이용 동의 (필수)</strong>{inquiryConsentText}</span></label>
      {error && <p className="iq-error" role="alert">{error}</p>}
      <button className="button primary iq-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <Send size={18}/>}문의 보내기</button>
    </form>
  </div>;
}
