'use client';
import {useEffect, useState} from 'react';
import {MessageCircle, PencilLine, ShieldCheck, TriangleAlert} from 'lucide-react';
import AccessGate from '@/components/access-gate';
import {abilityGroups, type Ability} from './abilities';
import './styles.css';

/** Opens the Berry panel with this request (the panel listens for the event). */
const ask = (ability: Ability) => window.dispatchEvent(new CustomEvent<Ability>('berry:ask', {detail: ability}));

/** /teacher/berry: everything Berry can do, as buttons that start the request in the Berry panel. */
export default function BerryGuide() {
  const [off, setOff] = useState<string[]>(['notebook']);
  useEffect(() => {fetch('/api/berry/status', {cache: 'no-store'}).then(r => r.json()).then(data => {if (Array.isArray(data.off)) setOff(data.off);}).catch(() => {});}, []);
  return <AccessGate role="teacher"><main className="bg-page">
    <header className="bg-head">
      <img src="/berry/raspberry-160.webp" alt="" width="72" height="72"/>
      <div><h1>베리와 일하기</h1><p>버튼을 누르면 베리 채팅창에 바로 들어가요. [빈칸]만 채워서 보내세요.</p></div>
    </header>
    <ul className="bg-rules">
      <li><MessageCircle size={16}/><span><b>찾아보기</b>는 묻는 즉시 답해요.</span></li>
      <li><PencilLine size={16}/><span><b>시키기</b>는 확인 카드가 뜨고, [저장]을 눌러야 반영돼요.</span></li>
      <li><TriangleAlert size={16}/><span><b>위험한 일</b>(지우기·차감·코드 재발급)은 빨간 카드에서 두 번 눌러야 해요.</span></li>
      <li><ShieldCheck size={16}/><span>학생은 가명으로만 보고, 비밀 일기 본문·사진 원본·상담 기록은 보지 않아요.</span></li>
    </ul>
    <div className="bg-groups">{abilityGroups(off).map(group => <section key={group.key} className="bg-group">
      <h2><span aria-hidden="true">{group.emoji}</span>{group.label}</h2>
      <div className="bg-buttons">{group.abilities.map(ability => <button type="button" key={ability.label} className={ability.danger ? 'is-danger' : ability.write ? 'is-write' : ''} onClick={() => ask(ability)}>
        {ability.danger ? <TriangleAlert size={14}/> : ability.write ? <PencilLine size={14}/> : <MessageCircle size={14}/>}
        <span><b>{ability.label}</b><small>{ability.prompt}</small></span>
      </button>)}</div>
    </section>)}</div>
  </main></AccessGate>;
}
