'use client';
import {useMemo, useState} from 'react';
import {AlertTriangle, BookOpen, ChevronDown, TrendingDown, TrendingUp, Trash2} from 'lucide-react';
import type {ClassroomRosterEntry} from '@/components/classroom-shared';
import {readingProfile} from './scoring';
import {speechModeName, type SpeechRecord} from './policy';
import {FeedbackCard} from './practice';
import {levelName} from './reader';
import type {Book} from './books';

const errorName = {missed: '빠뜨리기', changed: '바꿔 읽기', inserted: '덧붙이기'} as const;
const adviceName = {up: '한 단계 위 책에 도전해요', stay: '같은 수준을 더 읽어요', down: '한 단계 쉬운 책으로 자신감을 쌓아요'} as const;
const day = (iso: string) => new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric'}).format(new Date(iso));

export default function Records({records, roster, books, loading, error, truncated, onDelete}: {
  records: SpeechRecord[]; roster: ClassroomRosterEntry[]; books: Book[]; loading: boolean; error: string; truncated: boolean; onDelete: (record: SpeechRecord) => void;
}) {
  const [student, setStudent] = useState(''), [open, setOpen] = useState('');
  const names = useMemo(() => new Map(roster.map(s => [s.id, `${s.number ? `${s.number}. ` : ''}${s.name}`])), [roster]);
  const people = useMemo(() => roster.map(s => {
    const own = records.filter(r => r.studentId === s.id);
    return {student: s, count: own.length, profile: readingProfile(own.filter(r => r.mode === 'reading').map(r => ({accuracy: r.accuracy ?? undefined, cspm: r.metrics.cspm, level: r.level ?? undefined, createdAt: r.createdAt, counts: r.counts ?? undefined}))), last: own[0]};
  }).filter(p => p.count), [records, roster]);
  const aiChecked = records.filter(r => r.source === 'ai' && typeof r.metrics.corrections === 'number');
  const aiError = aiChecked.length ? Math.round(aiChecked.reduce((sum, r) => sum + r.metrics.corrections!, 0) / aiChecked.length) : null;
  const readings = records.filter(r => r.mode === 'reading' && r.accuracy != null);
  const average = readings.length ? Math.round(readings.reduce((sum, r) => sum + r.accuracy!, 0) / readings.length * 10) / 10 : null;
  const help = people.filter(p => p.profile.needsHelp);
  const shown = student ? records.filter(r => r.studentId === student) : records;

  if (loading) return <p className="ss-note">기록을 불러오는 중…</p>;
  return <div className="ss-records">
    {error && <p className="ss-error" role="alert">{error}</p>}
    <ul className="ss-cards ss-summary">
      <li><small>저장한 연습</small><strong>{records.length}번</strong><span>{people.length}명 참여{truncated ? ' · 최근 2,000건' : ''}</span></li>
      <li><small>평균 읽기 정확도</small><strong>{average != null ? `${average}%` : '-'}</strong><span>따라 읽기 {readings.length}번</span></li>
      <li><small>AI가 잘못 들은 비율</small><strong>{aiError != null ? `${aiError}%` : '-'}</strong><span>{aiError != null ? (aiError >= 15 ? '높아요 · 정확도는 참고로만' : '선생님이 고친 양으로 계산') : 'AI 전사 기록 없음'}</span></li>
    </ul>
    {help.length > 0 && <div className="ss-help" role="status"><AlertTriangle size={17}/><div><strong>살펴볼 학생</strong><p>{help.map(p => names.get(p.student.id)).join(', ')} · 정확도가 계속 내려가거나 80% 아래예요.</p></div></div>}
    {!people.length ? <p className="ss-empty">아직 학생 기록이 없어요. 말하기 연습에서 학생을 고르고 저장하면 여기에 모여요.</p> : <>
      <h3 className="ss-h">학생별 읽기 수준</h3>
      <ul className="ss-levels">{people.map(({student: s, profile, count}) => {
        const next = profile.nextLevel, picks = next ? books.filter(b => b.level === next).slice(0, 2) : [];
        return <li key={s.id} className={student === s.id ? 'is-picked' : ''}>
          <button type="button" className="ss-level-head" onClick={() => setStudent(student === s.id ? '' : s.id)} aria-pressed={student === s.id}>
            <strong>{names.get(s.id)}</strong><span>{count}번</span>
            {profile.recentAccuracy != null && <span className="ss-chip">{profile.recentAccuracy}%</span>}
            {profile.trend === 'up' && <TrendingUp size={15} aria-label="오르는 중"/>}{profile.trend === 'down' && <TrendingDown size={15} aria-label="내려가는 중"/>}
          </button>
          {profile.advice && <p>{adviceName[profile.advice]}{profile.commonError ? ` · 자주: ${errorName[profile.commonError]}` : ''}</p>}
          {picks.length > 0 && <p className="ss-picks"><BookOpen size={13}/>다음 책: {picks.map(b => `${b.title}(${levelName(b.level)})`).join(', ')}</p>}
        </li>;
      })}</ul>
    </>}
    <h3 className="ss-h">{student ? `${names.get(student)} 기록` : '최근 기록'}</h3>
    <ul className="ss-history">{shown.slice(0, 200).map(r => <li key={r.id}>
      <button type="button" className="ss-history-head" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? '' : r.id)}>
        <span>{day(r.createdAt)}</span><strong>{r.studentId ? names.get(r.studentId) ?? '지난 학생' : '연습'}</strong>
        <span>{speechModeName[r.mode]}{r.bookTitle ? ` · ${r.bookTitle}${r.page != null ? ` ${r.page + 1}쪽` : ''}` : r.topic ? ` · ${r.topic}` : ''}</span>
        {r.accuracy != null && <span className="ss-chip">{r.accuracy}%</span>}<ChevronDown size={15}/>
      </button>
      {open === r.id && <div className="ss-history-body">
        <p>{r.transcript || '(글 없음)'}</p>
        <p className="ss-foot">말 빠르기 분당 {r.metrics.rate ?? '-'}음절 · 쉼 {r.metrics.pauses ?? '-'}번{r.metrics.cspm != null ? ` · 분당 바르게 읽은 음절 ${r.metrics.cspm}` : ''}{r.metrics.fillers ? ` · 군말 ${r.metrics.fillers}번` : ''}</p>
        {r.feedback && <FeedbackCard feedback={r.feedback}/>}
        <button type="button" className="ss-text-btn" onClick={() => {if (confirm('이 기록을 지울까요?')) onDelete(r);}}><Trash2 size={14}/>기록 지우기</button>
      </div>}
    </li>)}</ul>
  </div>;
}
