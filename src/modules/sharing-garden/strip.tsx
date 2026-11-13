'use client';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import {MONTHLY_CAP, gardenStage} from './policy';
import './styles.css';

/** Under the student's own flowers: how far the whole class got this month. Hidden until it loads. */
export default function ClassGardenStrip() {
  const [credited, setCredited] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/sharing-garden', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(data => { if (active && data?.classes?.[0]) setCredited(data.classes[0].credited); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (credited === null) return null;
  const stage = gardenStage(credited), left = MONTHLY_CAP - credited;
  return <Link href="/sharing-garden" className="sg-strip" aria-label="우리 반이 이번 달 모은 나눔 꽃 보기">
    <span className="sg-strip-emoji" aria-hidden>{stage.emoji}</span>
    <span className="sg-strip-copy">
      <strong>우리 반이 이번 달 모은 나눔 꽃 · {credited.toLocaleString('ko-KR')}점</strong>
      <span className="sg-gauge" aria-hidden><i style={{width: `${stage.percent}%`}}/></span>
      <small>{left > 0 ? `${left.toLocaleString('ko-KR')}점 더 모으면 꽃밭 완성! 모은 꽃은 전국 친구들과 함께 기부돼요.` : '이번 달 꽃밭 완성! 전국 친구들과 함께 기부돼요 🎉'}</small>
    </span>
  </Link>;
}
