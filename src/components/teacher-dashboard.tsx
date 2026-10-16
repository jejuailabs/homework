"use client";

import Link from "next/link";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {ArrowRight, BookOpen, CalendarDays, CheckCheck, ChevronRight, ClipboardCheck, Clock3, Flower2, Heart, House, Images, Layers, LoaderCircle, PanelsTopLeft, Plus, RefreshCw, School, ShieldCheck, Sparkles, Star, Users} from "lucide-react";
import type {DashboardDetailKind, TeacherDashboardData} from "@/lib/teacher-dashboard-types";
import {assignmentInPeriod, schoolYearAt, type DashboardPeriod} from "@/lib/teacher-dashboard-period";
import BoardDashboardSummary from './board-dashboard-summary';
import TeacherDashboardDetails from './teacher-dashboard-details';

function homeworkHref(classId?: string, assignmentId?: string, status?: string, action?: string) {
  const query = new URLSearchParams();
  if (classId) query.set("classId", classId);
  if (assignmentId) query.set("assignmentId", assignmentId);
  if (status) query.set("status", status);
  if (action) query.set("action", action);
  return `/teacher/homework${query.size ? `?${query}` : ""}`;
}

export default function TeacherDashboard() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [classInfoOpen, setClassInfoOpen] = useState(false);
  const [period, setPeriod] = useState<DashboardPeriod>("all");
  const [year, setYear] = useState(() => schoolYearAt(Date.now()));
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [detailKind, setDetailKind] = useState<DashboardDetailKind | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/teacher/dashboard", {cache: "no-store"});
      if (!response.ok) throw new Error("dashboard_unavailable");
      setData(await response.json() as TeacherDashboardData);
    } catch {setError(true);}
    finally {setLoading(false);}
  }, []);
  useEffect(() => {
    const query = new URL(window.location.href).searchParams;
    let linkedClass = query.get('classId');
    if (!linkedClass) {try {linkedClass = sessionStorage.getItem('homework-current-class');} catch {}}
    if (linkedClass && /^[A-Za-z0-9_-]{1,200}$/.test(linkedClass)) setSelectedClassId(linkedClass);
    if (query.get('view') === 'students') setDetailKind('students');
    void load();
  }, [load]);
  function closeDetails() {
    setDetailKind(null);
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') === 'students') {url.searchParams.delete('view'); window.history.replaceState(window.history.state, '', url);}
  }

  // The dashboard always describes one class, including its very first render.
  // The API orders the newest school year first; existing older classes remain accessible.
  const classroom = data?.classes.find(item => item.id === selectedClassId) || data?.classes[0];
  const classId = classroom?.id || "";
  useEffect(() => {if (classId) {try {sessionStorage.setItem('homework-current-class', classId);} catch {}}}, [classId]);
  const assignments = useMemo(() => (data?.assignments || []).filter(task => task.classId === classId && assignmentInPeriod(task.createdAt, period, year)), [data, classId, period, year]);
  const exhibitions = (data?.exhibitions || []).filter(room => room.classId === classId);
  const exhibitionHref = `/teacher/exhibitions${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`;
  const queue = assignments.filter(task => task.submitted > 0).sort((a, b) => b.submitted - a.submitted || (a.dueAt || "9999").localeCompare(b.dueAt || "9999"));
  const totals = assignments.reduce((sum, task) => ({pending: sum.pending + task.pending, submitted: sum.submitted + task.submitted, done: sum.done + task.done, revision: sum.revision + task.revision, overdue: sum.overdue + task.overdue, target: sum.target + task.targetCount}), {pending: 0, submitted: 0, done: 0, revision: 0, overdue: 0, target: 0});
  const studentCount = classroom?.studentCount || 0;
  const years = [...new Set([schoolYearAt(Date.now()), ...(data?.assignments || []).flatMap(task => task.createdAt && Number.isFinite(Date.parse(task.createdAt)) ? [schoolYearAt(Date.parse(task.createdAt))] : [])])].sort((a, b) => b - a);
  const date = (value: string) => new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {month: "short", day: "numeric", timeZone: "Asia/Seoul"}).format(new Date(value));

  if (!data) return <div className="ws thd"><section className="thd-initial" aria-live="polite"><img src="/characters/dog-dubu.webp" alt=""/>{loading ? <><LoaderCircle className="ws-spin" size={23}/><p>{t("loading")}</p></> : <><h1>{t("loadError")}</h1><button className="ws-button ws-button-primary" onClick={() => void load()}><RefreshCw size={17}/>{t("retry")}</button></>}</section></div>;

  return <div className="ws thd" aria-busy={loading}>
    <section className="thd-welcome" aria-labelledby="dashboard-title">
      <div className="thd-welcome-copy">
        <span className="thd-kicker"><House size={15}/>{t("classHome")}</span>
        <h1 id="dashboard-title">{classroom?.name || t("classesEmpty")}</h1>
        {classroom && <div className="thd-class-meta"><span><CalendarDays size={14}/>{t("yearLabel", {year: classroom.year})}</span>{classroom.grade && <span><School size={14}/>{/^\d+$/.test(classroom.grade) ? t("gradeLabel", {grade: classroom.grade}) : classroom.grade}</span>}<span><Users size={14}/>{t("studentCount", {count: studentCount})}</span></div>}
        <p>{t(classroom ? "welcome" : "classesEmptyHint")}</p>
        <div className="thd-welcome-actions">
          {classroom ? <>
            <a className="ws-button ws-button-primary" href="#dashboard-overview"><ClipboardCheck size={18}/>{t("overview")}</a>
            <button className="ws-button ws-button-light" type="button" aria-haspopup="dialog" onClick={() => setDetailKind('students')}><Users size={18}/>{t("manageStudents")}</button>
            <button className="ws-button ws-button-light" type="button" aria-expanded={classInfoOpen} aria-controls="dashboard-class-info" onClick={() => setClassInfoOpen(value => !value)}><School size={18}/>{t("classInfo")}</button>
          </> : <Link className="ws-button ws-button-primary" href={homeworkHref(undefined, undefined, undefined, "class")}><Plus size={18}/>{t("createClass")}</Link>}
        </div>
        {classroom && <div id="dashboard-class-info" className="thd-class-info" hidden={!classInfoOpen}>
          <dl><div><dt>{t("className")}</dt><dd>{classroom.name}</dd></div><div><dt>{t("classTeacher")}</dt><dd>{data.viewer.displayName || t("teacherFallback")}</dd></div><div><dt>{t("schoolYear")}</dt><dd>{t("yearLabel", {year: classroom.year})}</dd></div><div><dt>{t("students")}</dt><dd>{t("studentCount", {count: studentCount})}</dd></div></dl>
          {data.classes.length > 1 && <label className="thd-class-switch"><span>{t("switchClass")}</span><select value={classId} onChange={event => {setSelectedClassId(event.target.value); setQueueExpanded(false);}}>{data.classes.map(item => <option value={item.id} key={item.id}>{item.name} · {t("yearLabel", {year: item.year})}</option>)}</select></label>}
        </div>}
      </div>
      <div className="thd-friends" aria-hidden="true"><span className="thd-friend-sun"><Star size={21}/></span><span className="thd-friend-hill"/><span className="thd-friend-window"/><img className="thd-friend-dog" src="/characters/dog-dubu.webp" alt=""/><img className="thd-friend-cat" src="/characters/cat-mochi.webp" alt=""/><img className="thd-friend-hamster" src="/characters/hamster-kong.webp" alt=""/><span className="thd-friend-book"><BookOpen size={33}/></span><Flower2 className="thd-friend-flower" size={26}/><Heart className="thd-friend-heart" size={18}/></div>
    </section>

    <nav className="thd-shortcuts" aria-label={t("shortcuts")}>
      <Link className="thd-shortcut thd-mint" href={homeworkHref(classId)}><span className="thd-icon"><BookOpen size={24}/></span><span><strong>{t("homework")}</strong><small>{t("homeworkHint")}</small></span><ArrowRight size={20}/></Link>
      <Link className="thd-shortcut thd-peach" href={exhibitionHref}><span className="thd-icon"><Images size={24}/></span><span><strong>{t("exhibitions")}</strong><small>{t("exhibitionsHint")}</small></span><img src="/characters/otter-moa.webp" alt=""/><ArrowRight size={20}/></Link>
      <Link className="thd-shortcut thd-sky" href={`/teacher/boards${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`}><span className="thd-icon"><PanelsTopLeft size={24}/></span><span><strong>{t("boards")}</strong><small>{t("boardsHint")}</small></span><img src="/characters/rabbit-tori.webp" alt=""/><ArrowRight size={20}/></Link>
      <Link className="thd-shortcut thd-lilac" href="/teacher/tools"><span className="thd-icon"><Sparkles size={24}/></span><span><strong>{t("tools")}</strong><small>{t("toolsHint")}</small></span><ArrowRight size={20}/></Link>
      <Link className="thd-shortcut thd-peach" href={`/teacher/cards${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`}><span className="thd-icon"><Layers size={24}/></span><span><strong>{locale === 'ko' ? '카드놀이' : 'Card Play'}</strong><small>{locale === 'ko' ? '세트 만들기 · 학습 · 테스트' : 'Create sets · learn · test'}</small></span><ArrowRight size={20}/></Link>
    </nav>

    <section className="thd-overview" aria-labelledby="dashboard-overview">
      <div className="thd-section-heading"><div className="thd-heading-label"><span className="thd-small-icon thd-yellow"><ClipboardCheck size={21}/></span><h2 id="dashboard-overview">{t("overview")}</h2></div><button className="ws-icon-btn ws-outlined" aria-label={t("refresh")} disabled={loading} onClick={() => void load()}><RefreshCw size={18} className={loading ? "ws-spin" : ""}/></button></div>
      <div className="thd-filters">
        <label><CalendarDays size={16}/><span className="ws-visually-hidden">{t("periodFilter")}</span><select value={period} onChange={event => {setPeriod(event.target.value as DashboardPeriod); setQueueExpanded(false);}}><option value="all">{t("allTime")}</option><option value="year">{t("schoolYear")}</option><option value="first">{t("firstSemester")}</option><option value="second">{t("secondSemester")}</option></select></label>
        {period !== "all" && <label><span className="ws-visually-hidden">{t("yearFilter")}</span><select value={year} onChange={event => {setYear(Number(event.target.value)); setQueueExpanded(false);}}>{years.map(value => <option value={value} key={value}>{t("yearLabel", {year: value})}</option>)}</select></label>}
        <p>{t(period === "all" ? "allTimeHint" : period === "year" ? "schoolYearHint" : period === "first" ? "firstSemesterHint" : "secondSemesterHint")}</p>
      </div>
      {error && <div className="ws-alert" role="alert"><span>{t("refreshError")}</span><button onClick={() => void load()}>{t("retry")}</button></div>}
      <div className="thd-metrics">
        <button type="button" className="thd-metric thd-sky" aria-haspopup="dialog" onClick={() => setDetailKind('students')}><span><Users size={18}/>{t("students")}</span><strong>{studentCount.toLocaleString(locale)}</strong><small>{classroom?.name || t("createClass")}<ArrowRight size={15}/></small></button>
        <button type="button" className="thd-metric thd-yellow" aria-haspopup="dialog" onClick={() => setDetailKind('assignments')}><span><BookOpen size={18}/>{t("assignments")}</span><strong>{assignments.length.toLocaleString(locale)}</strong><small>{t("selectedPeriod")}<ArrowRight size={15}/></small></button>
        <button type="button" className="thd-metric thd-peach" aria-haspopup="dialog" onClick={() => setDetailKind('submitted')}><span><Clock3 size={18}/>{t("toReview")}</span><strong>{totals.submitted.toLocaleString(locale)}</strong><small>{t("submissionCount")}<ArrowRight size={15}/></small></button>
        <button type="button" className="thd-metric thd-mint" aria-haspopup="dialog" onClick={() => setDetailKind('done')}><span><CheckCheck size={18}/>{t("reviewed")}</span><strong>{totals.done.toLocaleString(locale)}</strong><small>{t("submissionCount")}<ArrowRight size={15}/></small></button>
        <button type="button" className="thd-metric thd-pink" aria-haspopup="dialog" onClick={() => setDetailKind('pending')}><span><ClipboardCheck size={18}/>{t("notSubmitted")}</span><strong>{totals.pending.toLocaleString(locale)}</strong><small>{t("overdue", {count: totals.overdue})}<ArrowRight size={15}/></small></button>
        <button type="button" className="thd-metric thd-lilac" aria-haspopup="dialog" onClick={() => setDetailKind('rooms')}><span><Images size={18}/>{t("rooms")}</span><strong>{exhibitions.length.toLocaleString(locale)}</strong><small>{t("artworkCount", {count: exhibitions.reduce((sum, room) => sum + room.artworkCount, 0)})}<ArrowRight size={15}/></small></button>
      </div>
      {period !== "all" && <p className="thd-calendar-note">{t("calendarPreset")}</p>}
      <p className="thd-scope-note">{t("scopeHint")}<button type="button" aria-haspopup="dialog" onClick={() => setDetailKind('revision')}>{t("revisionCount", {count: totals.revision})}<ArrowRight size={13}/></button></p>
    </section>

      <section className="thd-panel thd-review" id="dashboard-review" aria-labelledby="dashboard-review-title">
        <div className="thd-section-heading"><div className="thd-heading-label"><span className="thd-small-icon thd-peach"><Clock3 size={21}/></span><h2 id="dashboard-review-title">{t("reviewQueue")}</h2><span className="thd-count">{queue.length}</span></div><Link className="thd-text-link" href={homeworkHref(classId)}>{t("goHomework")}<ChevronRight size={15}/></Link></div>
        {queue.length ? <><ul className="thd-review-list">{(queueExpanded ? queue : queue.slice(0, 5)).map(task => <li key={task.id}><Link href={homeworkHref(task.classId, task.id, "submitted")}><span className="thd-task-icon"><BookOpen size={21}/></span><span className="thd-task-copy"><small>{task.className}</small><strong>{task.title}</strong><span>{task.dueAt ? t("due", {date: date(task.dueAt)}) : t("noDueDate")}</span></span><span className="thd-review-count"><strong>{task.submitted}</strong><small>{t("toReviewShort")}</small></span><ChevronRight size={17}/></Link></li>)}</ul>{queue.length > 5 && <button className="thd-show-more" onClick={() => setQueueExpanded(value => !value)}>{t(queueExpanded ? "showLess" : "showAll", {count: queue.length})}</button>}</> : <div className="thd-empty"><img src="/characters/hamster-kong.webp" alt=""/><h3>{t(assignments.length ? "reviewEmpty" : "assignmentsEmpty")}</h3><p>{t(assignments.length ? "reviewEmptyHint" : "assignmentsEmptyHint")}</p>{!assignments.length && <Link className="thd-text-link" href={homeworkHref(classId, undefined, undefined, data.classes.length ? "assignment" : "class")}><Plus size={16}/>{t(data.classes.length ? "createAssignment" : "createClass")}</Link>}</div>}
      </section>

    {classId && <BoardDashboardSummary key={classId} classId={classId}/>}
    <section className="thd-panel thd-gallery" aria-labelledby="dashboard-gallery-title">
      <div className="thd-section-heading"><div className="thd-heading-label"><span className="thd-small-icon thd-peach"><Images size={21}/></span><div><h2 id="dashboard-gallery-title">{t("galleryTitle")}</h2><p>{t("galleryHint")}</p></div></div><Link className="thd-text-link" href={exhibitionHref}>{t("goExhibitions")}<ChevronRight size={15}/></Link></div>
      {exhibitions.length ? <div className="thd-room-grid">{exhibitions.slice(0, 4).map((room, index) => <Link className={`thd-room ${["thd-peach", "thd-lilac", "thd-sky", "thd-yellow"][index % 4]}`} href={`/teacher/exhibitions?exhibition=${encodeURIComponent(room.id)}`} key={room.id}><div className="thd-room-top"><span className="thd-room-frame"><Images size={25}/></span><span className={`thd-room-status thd-room-${room.status}`}>{t(["draft", "open", "closed"].includes(room.status) ? `roomStatus.${room.status}` : "roomStatus.draft")}</span></div><small>{room.className}</small><h3>{room.title}</h3><span className="thd-room-bottom">{t("roomWorks", {total: room.artworkCount, approved: room.approvedCount})}<ArrowRight size={17}/></span></Link>)}</div> : <div className="thd-gallery-empty"><img src="/characters/otter-moa.webp" alt=""/><div><h3>{t("galleryEmpty")}</h3><p>{t("galleryEmptyHint")}</p><Link className="thd-text-link" href={exhibitionHref}>{t("startExhibition")}<ArrowRight size={15}/></Link></div></div>}
    </section>
    <p className="thd-footer"><Heart size={13}/>{t("footer")}<span>{t("updated", {time: new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul"}).format(new Date(data.generatedAt))})}</span>{["admin", "superadmin"].includes(data.viewer.role) && <Link className="thd-text-link" href="/admin"><ShieldCheck size={14}/>{t("admin")}</Link>}</p>
    {detailKind && <TeacherDashboardDetails key={`${detailKind}:${classId}:${period}:${year}`} kind={detailKind} classId={classId} className={classroom?.name || ''} period={period} year={year} assignments={assignments} exhibitions={exhibitions} onClose={closeDetails} onRosterChanged={() => void load()}/>}
  </div>;
}
