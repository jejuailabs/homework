import Link from 'next/link';
import {ArrowRight, MonitorPlay} from 'lucide-react';

/** One-line way in from the Tools page. */
export default function ClassScreenEntry() {
  return <Link href="/teacher/screen" style={{display: 'flex', alignItems: 'center', gap: 12, maxWidth: 1180, margin: '0 auto 14px', padding: '14px 18px', borderRadius: 18, border: '1px solid var(--border)', background: 'var(--accent-soft)', color: 'var(--accent-strong)', textDecoration: 'none'}}>
    <MonitorPlay size={22}/>
    <span style={{display: 'grid', flex: 1, minWidth: 0}}><strong>교실 화면</strong><small style={{color: 'var(--muted)'}}>수업 시간에 전자칠판에 띄워 두는 화면 · 지금 교시, 시간표, 알림, 타이머를 원하는 대로 배치해요</small></span>
    <ArrowRight size={18}/>
  </Link>;
}
