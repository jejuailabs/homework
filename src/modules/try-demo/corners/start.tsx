'use client';
import Link from 'next/link';
import {ArrowRight, ClipboardList, KeyRound, LogIn, Send} from 'lucide-react';

const steps = [
  {icon: LogIn, title: 'Google로 시작', text: '선생님은 Google 계정으로 로그인해요. 따로 쓰는 가입 양식이 없어요.'},
  {icon: ClipboardList, title: '학생 명단 붙여넣기', text: '"1. 김민서"처럼 붙여넣으면 우리 반이 만들어져요.'},
  {icon: KeyRound, title: '6자리 코드 나눠 주기', text: '학생은 이메일도 비밀번호도 없이 숫자 6자리로 들어와요.'},
  {icon: Send, title: '첫 숙제나 전시 열기', text: '제출한 작품이 전시관에 걸리고, 학기말에는 작품집으로 묶여요.'},
];
export default function StartCorner() {
  return <div className="try-start">
    <h2>방금 본 것을 우리 반으로</h2>
    <p className="try-note">체험에서 본 전시관, 보말, 작품집은 모두 실제 기능이에요. 준비는 10분이면 됩니다.</p>
    <ol>{steps.map((s, i) => <li key={s.title}><span><s.icon size={20}/></span><div><strong>{i + 1}. {s.title}</strong><p>{s.text}</p></div></li>)}</ol>
    <div className="try-start-actions"><Link className="button primary" href="/">선생님으로 시작하기<ArrowRight size={16}/></Link><Link className="button soft" href="/blog/manual">사용 설명서 보기</Link></div>
    <p className="try-note">보호자는 가입하지 않아요. 선생님이 켠 전시실 QR로만 관람하고, 링크는 언제든 끌 수 있어요.</p>
  </div>;
}
