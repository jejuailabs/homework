'use client';
import {useEffect, useRef, useState} from 'react';
import {ChevronDown, History, RefreshCw} from 'lucide-react';
import type {PointStudent, TeacherPointHistory} from '@/lib/points-types';
import {pointError, pointsRequest, usePointCopy} from './points-shared';

export default function PointsTeacherHistory({classId, students, revision, label}: {classId: string; students: PointStudent[]; revision: number; label: string}) {
  const {ko, locale, copy} = usePointCopy();
  const [studentId, setStudentId] = useState(''), [history, setHistory] = useState<TeacherPointHistory | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const epoch = useRef(0);
  const url = `/api/points/classes/${classId}/history?studentId=${encodeURIComponent(studentId)}`;
  useEffect(() => {
    const controller = new AbortController(), generation = ++epoch.current;
    setLoading(true); setError(''); setHistory(null);
    pointsRequest<TeacherPointHistory>(url, {signal: controller.signal}).then(result => {if (generation === epoch.current) setHistory(result);}).catch(error => {if (!controller.signal.aborted && generation === epoch.current) setError(pointError(error, ko));}).finally(() => {if (generation === epoch.current) setLoading(false);});
    return () => {epoch.current++; controller.abort();};
  }, [url, revision, refresh, ko]);
  async function more() {
    if (!history?.nextCursor || loading) return;
    const generation = epoch.current;
    setLoading(true); setError('');
    try {
      const page = await pointsRequest<TeacherPointHistory>(`${url}&cursor=${encodeURIComponent(history.nextCursor)}`);
      if (generation === epoch.current) setHistory(current => current ? {ledger: [...current.ledger, ...page.ledger.filter(row => !current.ledger.some(old => old.studentId === row.studentId && old.id === row.id))], nextCursor: page.nextCursor} : current);
    } catch (error) {if (generation === epoch.current) setError(pointError(error, ko));}
    finally {if (generation === epoch.current) setLoading(false);}
  }
  return <section className="points-history points-teacher-history" aria-labelledby="points-history-title">
    <div className="points-toolbar"><h2 id="points-history-title"><History size={21}/>{copy('보말 수여·회수 로그', 'Point award & recovery log')}</h2><button className="button" disabled={loading} onClick={() => setRefresh(current => current + 1)}><RefreshCw size={16}/>{copy('새로고침', 'Refresh')}</button></div>
    <p className="points-muted">{copy('직접 수여와 숙제·퀴즈 보상, 회수·사용 내역을 최신순으로 확인해요. 회수해도 이전 수여 기록은 남아요.', 'View manual awards, homework and quiz rewards, recoveries and spending, newest first. Original award records remain after recovery.')}</p>
    <label className="points-history-filter">{copy('학생별 보기', 'Filter by student')}<select value={studentId} onChange={event => setStudentId(event.target.value)}><option value="">{copy('학급 전체', 'Entire class')}</option>{students.map(student => <option key={student.id} value={student.id}>{student.number}. {student.name}</option>)}</select></label>
    {error && <p className="points-error" role="alert">{error}</p>}
    {history && !history.ledger.length && <p className="points-empty">{copy('아직 보말 내역이 없어요.', 'No point activity yet.')}</p>}
    {!!history?.ledger.length && <div className="points-history-table" role="region" aria-label={copy('보말 내역 표', 'Point history table')} tabIndex={0}><table><thead><tr>{[copy('일시', 'Date'), copy('학생', 'Student'), copy('구분', 'Type'), copy('수량', 'Amount'), copy('사유', 'Reason'), copy('처리 후 잔액', 'Balance after')].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead><tbody>{history.ledger.map(entry => <tr key={`${entry.studentId}:${entry.id}`}>
      <td><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(locale, {timeZone: 'Asia/Seoul'})}</time></td><td>{entry.studentNumber}. {entry.studentName}</td>
      <td>{entry.kind === 'revoke' ? copy('회수', 'Recovered') : entry.source === 'homework' ? copy('숙제 보상', 'Homework reward') : entry.source === 'daily-quiz' ? copy('퀴즈 보상', 'Quiz reward') : entry.kind === 'earn' ? copy('직접 수여', 'Teacher award') : copy('사용', 'Spent')}</td>
      <td className={entry.amount > 0 ? 'points-earned' : entry.kind === 'revoke' ? 'points-revoked' : ''}>{entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString(locale)} {label}</td><td>{entry.reason}</td><td>{entry.balanceAfter.toLocaleString(locale)} {label}</td>
    </tr>)}</tbody></table></div>}
    {loading && <p className="points-muted" role="status">{copy('내역을 불러오고 있어요.', 'Loading history…')}</p>}
    {history?.nextCursor && <button className="button" disabled={loading} onClick={() => void more()}><ChevronDown size={17}/>{copy('더 보기', 'Load more')}</button>}
  </section>;
}
