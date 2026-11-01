'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {BookUser, BriefcaseBusiness, GraduationCap, LoaderCircle, PlugZap, ShieldCheck} from 'lucide-react';
import type {NotebookStatus} from './types';
import './styles.css';

export default function TeacherMyPage() {
  const [status, setStatus] = useState<NotebookStatus | null>(null), [failed, setFailed] = useState(false), [connector, setConnector] = useState(false), [workspace, setWorkspace] = useState(false);
  useEffect(() => {fetch('/api/teacher-notebook/status', {cache: 'no-store'}).then(r => r.ok ? r.json() : Promise.reject()).then(setStatus).catch(() => setFailed(true));}, []);
  useEffect(() => {fetch('/api/oauth/status', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(data => setConnector(!!data?.available)).catch(() => {});}, []);
  useEffect(() => {fetch('/api/workspace/status', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(data => setWorkspace(!!data?.available)).catch(() => {});}, []);
  return <section className="mp-shell nb-shell">
    <div className="nb-heading"><div><h2>마이페이지</h2><p>선생님 본인만 보는 공간이에요. 학급 운영 기록과 앞으로 열릴 학습 커리어·AI 연결을 여기에서 관리해요.</p></div></div>
    <div className="mp-grid">
      {!status && !failed ? <div className="mp-card"><LoaderCircle className="spin" size={22}/></div> : status?.available ?
        <Link href="/teacher/me/notebook" className="mp-card"><h3><BookUser size={20}/>교무수첩</h3><p>하루 기록과 @학생 관찰을 날짜별로 모으고, 언제든 종합 리포트로 뽑아요.</p><span className="mp-badge"><ShieldCheck size={12}/> 열 때마다 계정 확인</span></Link> :
        <div className="mp-card is-soon"><h3><BookUser size={20}/>교무수첩</h3><p>하루 기록과 @학생 관찰을 날짜별로 모으는 기능이에요. 시범 운영 중이라 곧 열려요.</p><span className="mp-badge">준비 중</span></div>}
      {workspace && <Link href="/teacher/me/workspace" className="mp-card"><h3><BriefcaseBusiness size={20}/>업무 공간</h3><p>일정·시간표·수업 일지·업무 폴더를 한곳에서 관리해요. 학교 캘린더(ICS)를 가져오고 숙제 마감이 함께 보여요.</p><span className="mp-badge"><ShieldCheck size={12}/> 본인만 · 내보내기 가능</span></Link>}
      <div className="mp-card is-soon"><h3><GraduationCap size={20}/>학습 커리어 · 인계카드</h3><p>학년이 바뀌어도 이어지는 학생 기록과, 선생님이 골라서 넘기는 인계카드예요.</p><span className="mp-badge">준비 중</span></div>
      {connector ?
        <Link href="/teacher/me/connections" className="mp-card"><h3><PlugZap size={20}/>외부 연결 (MCP)</h3><p>베리 앱, Claude, ChatGPT에서 “이번 주 마감 숙제”, “어제 미제출 학생”처럼 우리 반 일을 바로 물어봐요. 범위와 기간을 정해 연결하고 언제든 끊어요.</p><span className="mp-badge"><ShieldCheck size={12}/> 읽기 전용 · 가명 기본</span></Link> :
        <div className="mp-card is-soon"><h3><PlugZap size={20}/>외부 연결 (MCP)</h3><p>Claude·ChatGPT에서 “어제 숙제 안 낸 학생과 안내문”처럼 우리 반 일을 바로 처리해요.</p><span className="mp-badge">준비 중</span></div>}
    </div>
  </section>;
}
