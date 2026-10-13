"use client";

import Link from 'next/link';
import {useEffect, useId, useRef, useState} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {ArrowRight, BookOpen, CalendarDays, ChevronRight, Images, LoaderCircle, RefreshCw, Users, X} from 'lucide-react';
import {characterFiles} from '@/lib/characters';
import type {DashboardDetailKind, TeacherDashboardAssignment, TeacherDashboardDetailsResponse, TeacherDashboardExhibition} from '@/lib/teacher-dashboard-types';
import type {DashboardPeriod} from '@/lib/teacher-dashboard-period';
import ClassStudentManager from './class-student-manager';

const titleKeys = {students: 'manageStudents', assignments: 'assignments', submitted: 'toReview', done: 'reviewed', pending: 'notSubmitted', revision: 'revisionTitle', rooms: 'rooms'} as const;

export default function TeacherDashboardDetails({kind, classId, className, period, year, assignments, exhibitions, onClose, onRosterChanged}: {
  kind: DashboardDetailKind; classId: string; className: string; period: DashboardPeriod; year: number;
  assignments: TeacherDashboardAssignment[]; exhibitions: TeacherDashboardExhibition[]; onClose: () => void; onRosterChanged: () => void;
}) {
  const t = useTranslations('dashboard'), common = useTranslations('product.common'), locale = useLocale();
  const headingId = useId(), dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<TeacherDashboardDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [reload, setReload] = useState(0), [offset, setOffset] = useState(0);
  const [rosterCount, setRosterCount] = useState<number | null>(null), [studentBusy, setStudentBusy] = useState(false);
  const remote = !['students', 'assignments', 'rooms'].includes(kind) && !!classId;
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; node?.showModal();
    return () => {node?.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({preventScroll: true});};
  }, []);
  useEffect(() => {
    if (!remote) return;
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    const query = new URLSearchParams({classId, kind, period, year: String(year), offset: String(offset)});
    fetch(`/api/teacher/dashboard/details?${query}`, {cache: 'no-store', signal: controller.signal})
      .then(async response => {if (!response.ok) throw new Error('details_unavailable'); return await response.json() as TeacherDashboardDetailsResponse;})
      .then(result => {if (!controller.signal.aborted) setData(previous => offset && previous ? {...result, submissions: [...previous.submissions, ...result.submissions]} : result);})
      .catch(() => {if (!controller.signal.aborted) setFailed(true);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [remote, classId, kind, period, year, offset, reload]);

  const count = kind === 'students' ? rosterCount ?? undefined : kind === 'assignments' ? assignments.length : kind === 'rooms' ? exhibitions.length : data?.total;
  const countLabel = count === undefined ? '' : t(kind === 'students' ? 'studentCount' : ['assignments', 'rooms'].includes(kind) ? 'detailCount' : 'detailSubmissionCount', {count});
  const empty = !classId || (kind === 'assignments' ? !assignments.length : kind === 'rooms' ? !exhibitions.length : data !== null && !data.total);
  const href = `/teacher/homework${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`;
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul'}).format(new Date(value)) : t('noDueDate');
  const scope = ['students', 'rooms'].includes(kind) ? t('currentScope') : period === 'all' ? t('allTime') : `${t('yearLabel', {year})} · ${t(period === 'year' ? 'schoolYear' : period === 'first' ? 'firstSemester' : 'secondSemester')}`;
  return <dialog ref={dialog} className={`ws-dialog thd-detail-dialog thd-detail-${kind === 'students' ? 'student-management' : kind}`} aria-labelledby={headingId} onCancel={event => {event.preventDefault(); if (!studentBusy) onClose();}}>
    <header className="ws-dialog-head"><div><h2 id={headingId}>{t(titleKeys[kind])}{count !== undefined && <span className="thd-detail-count">{countLabel}</span>}</h2><p>{className || t('createClass')} · {scope}</p></div><button className="ws-icon-btn" type="button" aria-label={common('close')} disabled={studentBusy} onClick={onClose}><X size={21}/></button></header>
    <div className="ws-dialog-body thd-detail-body">
      {loading && !data && <div className="thd-detail-state" role="status"><LoaderCircle size={24} className="ws-spin"/><p>{t('detailLoading')}</p></div>}
      {failed && <div className="ws-alert" role="alert"><span>{t('detailError')}</span><button type="button" onClick={() => setReload(value => value + 1)}><RefreshCw size={15}/>{t('retry')}</button></div>}
      {empty && <div className="thd-detail-state"><img src="/characters/hamster-kong.webp" alt=""/><h3>{t('detailEmpty')}</h3><p>{t(!classId ? 'classesEmptyHint' : kind === 'students' ? 'studentsEmptyHint' : 'detailEmptyHint')}</p></div>}
      {kind === 'students' && classId && <ClassStudentManager classId={classId} onCount={setRosterCount} onChanged={onRosterChanged} onBusyChange={setStudentBusy}/>}
      {kind === 'assignments' && !empty && <ul className="thd-detail-list">{assignments.map(task => <li key={task.id}><Link href={`${href}&assignmentId=${encodeURIComponent(task.id)}`}><span className="thd-detail-icon"><BookOpen size={22}/></span><span className="thd-detail-copy"><strong>{task.title}</strong><span><CalendarDays size={13}/>{task.dueAt ? t('due', {date: date(task.dueAt)}) : t('noDueDate')}</span><small>{t('taskStatusSummary', {submitted: task.submitted, done: task.done, pending: task.pending, revision: task.revision})}</small></span><ChevronRight size={18}/></Link></li>)}</ul>}
      {kind === 'rooms' && !empty && <ul className="thd-detail-list">{exhibitions.map(room => <li key={room.id}><Link href={`/teacher/exhibitions?classId=${encodeURIComponent(classId)}&exhibition=${encodeURIComponent(room.id)}`}><span className="thd-detail-icon"><Images size={22}/></span><span className="thd-detail-copy"><strong>{room.title}</strong><span>{t(`roomStatus.${room.status}`)}</span><small>{t('roomWorks', {total: room.artworkCount, approved: room.approvedCount})}</small></span><ChevronRight size={18}/></Link></li>)}</ul>}
      {!['students', 'assignments', 'rooms'].includes(kind) && data && <>
        {data.submissions.length > 0 && <ul className="thd-detail-list thd-detail-submissions">{data.submissions.map(row => <li key={row.id}><Link href={`${href}&assignmentId=${encodeURIComponent(row.assignmentId)}&status=${row.status}&studentId=${encodeURIComponent(row.student.id)}`}><img className="thd-detail-avatar" src={`/characters/${characterFiles[row.student.character] || characterFiles.cat}.webp`} alt=""/><span className="thd-detail-copy"><strong>{row.student.number === null ? '' : `${t('studentNumber', {number: row.student.number})} · `}{row.student.name || t('unknownStudent')}</strong><span>{row.assignmentTitle}</span><small>{row.status === 'pending' ? (row.dueAt ? t('due', {date: date(row.dueAt)}) : t('noDueDate')) : row.status === 'submitted' ? t('submittedAt', {date: row.submittedAt ? date(row.submittedAt) : t('unknownDate')}) : t('reviewedAt', {date: row.reviewedAt ? date(row.reviewedAt) : t('unknownDate')})}</small></span><span className={`ws-status ws-status-${row.status}`}>{row.overdue ? t('overdueBadge') : common(row.status)}</span><ChevronRight size={18}/></Link></li>)}</ul>}
        {data.unavailableCount > 0 && <p className="thd-detail-note">{t('unavailableRows', {count: data.unavailableCount})}</p>}
        {data.nextOffset !== null && <button className="ws-button ws-button-light thd-detail-more" type="button" disabled={loading} onClick={() => setOffset(data.nextOffset!)}>{loading ? <LoaderCircle className="ws-spin" size={16}/> : <Users size={16}/>} {t('loadMoreRows', {shown: data.submissions.length, total: data.total})}</button>}
      </>}
      <footer className="thd-detail-footer">{kind === 'students' ? !classId && <Link className="ws-button ws-button-primary" href="/teacher/homework?action=class"><Users size={17}/>{t('createClass')}</Link> : kind === 'rooms' ? <Link className="ws-button ws-button-primary" href={`/teacher/exhibitions${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`}><Images size={17}/>{t('goExhibitions')}</Link> : <Link className="ws-button ws-button-primary" href={href}><BookOpen size={17}/>{t('goHomework')}<ArrowRight size={15}/></Link>}<button className="ws-button ws-button-light" type="button" disabled={studentBusy} onClick={onClose}>{common('close')}</button></footer>
    </div>
  </dialog>;
}
