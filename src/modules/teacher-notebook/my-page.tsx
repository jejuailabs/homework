'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {BookUser, GraduationCap, LoaderCircle, PlugZap, ShieldCheck} from 'lucide-react';
import type {NotebookStatus} from './types';
import './styles.css';

export default function TeacherMyPage() {
  const [status, setStatus] = useState<NotebookStatus | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {fetch('/api/teacher-notebook/status', {cache: 'no-store'}).then(r => r.ok ? r.json() : Promise.reject()).then(setStatus).catch(() => setFailed(true));}, []);
  return <section className="mp-shell nb-shell">
    <div className="nb-heading"><div><h2>마이페이지</h2><p>선생님 본인만 보는 공간이에요. 학급 운영 기록과 앞으로 열릴 학습 커리어·AI 연결을 여기에서 관리해요.</p></div></div>
    <div className="mp-grid">
      {!status && !failed ? <div className="mp-card"><LoaderCircle className="spin" size={22}/></div> : status?.available ?
        <Link href="/teacher/me/notebook" className="mp-card"><h3><BookUser size={20}/>교무수첩</h3><p>하루 기록과 @학생 관찰을 날짜별로 모으고, 언제든 종합 리포트로 뽑아요.</p><span className="mp-badge"><ShieldCheck size={12}/> 열 때마다 계정 확인</span></Link> :
        <div className="mp-card is-soon"><h3><BookUser size={20}/>교무수첩</h3><p>하루 기록과 @학생 관찰을 날짜별로 모으는 기능이에요. 시범 운영 중이라 곧 열려요.</p><span className="mp-badge">준비 중</span></div>}
      <div className="mp-card is-soon"><h3><GraduationCap size={20}/>학습 커리어 · 인계카드</h3><p>학년이 바뀌어도 이어지는 학생 기록과, 선생님이 골라서 넘기는 인계카드예요.</p><span className="mp-badge">준비 중</span></div>
      <div className="mp-card is-soon"><h3><PlugZap size={20}/>AI 도구 연결 (MCP)</h3><p>Claude·ChatGPT에서 “어제 숙제 안 낸 학생과 안내문”처럼 우리 반 일을 바로 처리해요.</p><span className="mp-badge">준비 중</span></div>
    </div>
  </section>;
}
