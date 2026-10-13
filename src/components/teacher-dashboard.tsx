"use client";

import Link from "next/link";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {ArrowRight, BookOpen, CalendarDays, CheckCheck, ChevronRight, ClipboardCheck, Clock3, Flower2, Heart, House, Images, LoaderCircle, Plus, RefreshCw, School, ShieldCheck, Sparkles, Star, Users} from "lucide-react";
import type {TeacherDashboardData} from "@/lib/teacher-dashboard-types";
import {assignmentInPeriod, schoolYearAt, type DashboardPeriod} from "@/lib/teacher-dashboard-period";

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
  const [classId, setClassId] = useState("");
  const [period, setPeriod] = useState<DashboardPeriod>("all");
  const [year, setYear] = useState(() => schoolYearAt(Date.now()));
  const [queueExpanded, setQueueExpanded] = useState(false);

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
  useEffect(() => {void load();}, [load]);

  const assignments = useMemo(() => (data?.assignments || []).filter(task => (!classId || task.classId === classId) && assignmentInPeriod(task.createdAt, period, year)), [data, classId, period, year]);
  const classes = (data?.classes || []).filter(classroom => !classId || classroom.id === classId);
  const exhibitions = (data?.exhibitions || []).filter(room => !classId || room.classId === classId);
  const queue = assignments.filter(task => task.submitted > 0).sort((a, b) => b.submitted - a.submitted || (a.dueAt || "9999").localeCompare(b.dueAt || "9999"));
  const totals = assignments.reduce((sum, task) => ({pending: sum.pending + task.pending, submitted: sum.submitted + task.submitted, done: sum.done + task.done, revision: sum.revision + task.revision, overdue: sum.overdue + task.overdue, target: sum.target + task.targetCount}), {pending: 0, submitted: 0, done: 0, revision: 0, overdue: 0, target: 0});
  const studentCount = classes.reduce((sum, classroom) => sum + classroom.studentCount, 0);
  const years = [...new Set([schoolYearAt(Date.now()), ...(data?.assignments || []).flatMap(task => task.createdAt && Number.isFinite(Date.parse(task.createdAt)) ? [schoolYearAt(Date.parse(task.createdAt))] : [])])].sort((a, b) => b - a);
  const date = (value: string) => new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {month: "short", day: "numeric", timeZone: "Asia/Seoul"}).format(new Date(value));

  if (!data) return <div className="ws thd"><section className="thd-initial" aria-live="polite"><img src="/characters/dog-dubu.webp" alt=""/>{loading ? <><LoaderCircle className="ws-spin" size={23}/><p>{t("loading")}</p></> : <><h1>{t("loadError")}</h1><button className="ws-button ws-button-primary" onClick={() => void load()}><RefreshCw size={17}/>{t("retry")}</button></>}</section></div>;

  return <div className="ws thd" aria-busy={loading}>
    <section className="thd-welcome" aria-labelledby="dashboard-title">
      <div className="thd-welcome-copy">
        <span className="thd-kicker"><House size={15}/>{t("eyebrow")}</span>
        <h1 id="dashboard-title">{t("title")}</h1>
        <p>{t("welcome")}</p>
        <div className="thd-welcome-actions"><Link className="ws-button ws-button-primary" href={homeworkHref(classId, undefined, undefined, data.classes.length ? "assignment" : "class")}><Plus size={18}/>{t(data.classes.length ? "createAssignment" : "createClass")}</Link>{["admin", "superadmin"].includes(data.viewer.role) && <Link className="thd-text-link" href="/admin"><ShieldCheck size={16}/>{t("admin")}<ChevronRight size={14}/></Link>}</div>
      </div>
      <div className="thd-friends" aria-hidden="true"><span className="thd-friend-sun"><Star size={21}/></span><span className="thd-friend-hill"/><span className="thd-friend-window"/><img className="thd-friend-dog" src="/characters/dog-dubu.webp" alt=""/><img className="thd-friend-cat" src="/characters/cat-mochi.webp" alt=""/><img className="thd-friend-hamster" src="/characters/hamster-kong.webp" alt=""/><span className="thd-friend-book"><BookOpen size={33}/></span><Flower2 className="thd-friend-flower" size={26}/><Heart className="thd-friend-heart" size={18}/></div>
    </section>

    <nav className="thd-shortcuts" aria-label={t("shortcuts")}>
      <Link className="thd-shortcut thd-mint" href={homeworkHref(classId)}><span className="thd-icon"><BookOpen size={24}/></span><span><strong>{t("homework")}</strong><small>{t("homeworkHint")}</small></span><ArrowRight size={20}/></Link>
      <Link className="thd-shortcut thd-peach" href="/teacher/exhibitions"><span className="thd-icon"><Images size={24}/></span><span><strong>{t("exhibitions")}</strong><small>{t("exhibitionsHint")}</small></span><img src="/characters/otter-moa.webp" alt=""/><ArrowRight size={20}/></Link>
      <Link className="thd-shortcut thd-lilac" href="/teacher/tools"><span className="thd-icon"><Sparkles size={24}/></span><span><strong>{t("tools")}</strong><small>{t("toolsHint")}</small></span><ArrowRight size={20}/></Link>
    </nav>

    <section className="thd-overview" aria-labelledby="dashboard-overview">
      <div className="thd-section-heading"><div className="thd-heading-label"><span className="thd-small-icon thd-yellow"><ClipboardCheck size={21}/></span><h2 id="dashboard-overview">{t("overview")}</h2></div><button className="ws-icon-btn ws-outlined" aria-label={t("refresh")} disabled={loading} onClick={() => void load()}><RefreshCw size={18} className={loading ? "ws-spin" : ""}/></button></div>
      <div className="thd-filters">
        <label><Users size={16}/><span className="ws-visually-hidden">{t("classFilter")}</span><select value={classId} onChange={event => {setClassId(event.target.value); setQueueExpanded(false);}}><option value="">{t("allClasses")}</option>{data.classes.map(classroom => <option value={classroom.id} key={classroom.id}>{classroom.name}</option>)}</select></label>
        <label><CalendarDays size={16}/><span className="ws-visually-hidden">{t("periodFilter")}</span><select value={period} onChange={event => {setPeriod(event.target.value as DashboardPeriod); setQueueExpanded(false);}}><option value="all">{t("allTime")}</option><option value="year">{t("schoolYear")}</option><option value="first">{t("firstSemester")}</option><option value="second">{t("secondSemester")}</option></select></label>
        {period !== "all" && <label><span className="ws-visually-hidden">{t("yearFilter")}</span><select value={year} onChange={event => {setYear(Number(event.target.value)); setQueueExpanded(false);}}>{years.map(value => <option value={value} key={value}>{t("yearLabel", {year: value})}</option>)}</select></label>}
        <p>{t(period === "all" ? "allTimeHint" : period === "year" ? "schoolYearHint" : period === "first" ? "firstSemesterHint" : "secondSemesterHint")}</p>
      </div>
      {error && <div className="ws-alert" role="alert"><span>{t("refreshError")}</span><button onClick={() => void load()}>{t("retry")}</button></div>}
      <div className="thd-metrics">
        <div className="thd-metric thd-sky"><span><Users size={18}/>{t("students")}</span><strong>{studentCount.toLocaleString(locale)}</strong><small>{t("classCount", {count: classes.length})}</small></div>
        <div className="thd-metric thd-yellow"><span><BookOpen size={18}/>{t("assignments")}</span><strong>{assignments.length.toLocaleString(locale)}</strong><small>{t("selectedPeriod")}</small></div>
        <a className="thd-metric thd-peach" href="#dashboard-review"><span><Clock3 size={18}/>{t("toReview")}</span><strong>{totals.submitted.toLocaleString(locale)}</strong><small>{t("submissionCount")}<ArrowRight size={15}/></small></a>
        <div className="thd-metric thd-mint"><span><CheckCheck size={18}/>{t("reviewed")}</span><strong>{totals.done.toLocaleString(locale)}</strong><small>{t("submissionCount")}</small></div>
        <div className="thd-metric thd-pink"><span><ClipboardCheck size={18}/>{t("notSubmitted")}</span><strong>{totals.pending.toLocaleString(locale)}</strong><small>{t("overdue", {count: totals.overdue})}</small></div>
        <div className="thd-metric thd-lilac"><span><Images size={18}/>{t("rooms")}</span><strong>{exhibitions.length.toLocaleString(locale)}</strong><small>{t("artworkCount", {count: exhibitions.reduce((sum, room) => sum + room.artworkCount, 0)})}</small></div>
      </div>
      {period !== "all" && <p className="thd-calendar-note">{t("calendarPreset")}</p>}
      <p className="thd-scope-note">{t("scopeHint")}<span>{t("revisionCount", {count: totals.revision})}</span></p>
    </section>

    <div className="thd-content-grid">
      <section className="thd-panel thd-review" id="dashboard-review" aria-labelledby="dashboard-review-title">
        <div className="thd-section-heading"><div className="thd-heading-label"><span className="thd-small-icon thd-peach"><Clock3 size={21}/></span><h2 id="dashboard-review-title">{t("reviewQueue")}</h2><span className="thd-count">{queue.length}</span></div><Link className="thd-text-link" href={homeworkHref(classId)}>{t("goHomework")}<ChevronRight size={15}/></Link></div>
        {queue.length ? <><ul className="thd-review-list">{(queueExpanded ? queue : queue.slice(0, 5)).map(task => <li key={task.id}><Link href={homeworkHref(task.classId, task.id, "submitted")}><span className="thd-task-icon"><BookOpen size={21}/></span><span className="thd-task-copy"><small>{task.className}</small><strong>{task.title}</strong><span>{task.dueAt ? t("due", {date: date(task.dueAt)}) : t("noDueDate")}</span></span><span className="thd-review-count"><strong>{task.submitted}</strong><small>{t("toReviewShort")}</small></span><ChevronRight size={17}/></Link></li>)}</ul>{queue.length > 5 && <button className="thd-show-more" onClick={() => setQueueExpanded(value => !value)}>{t(queueExpanded ? "showLess" : "showAll", {count: queue.length})}</button>}</> : <div className="thd-empty"><img src="/characters/hamster-kong.webp" alt=""/><h3>{t(assignments.length ? "reviewEmpty" : "assignmentsEmpty")}</h3><p>{t(assignments.length ? "reviewEmptyHint" : "assignmentsEmptyHint")}</p>{!assignments.length && <Link className="thd-text-link" href={homeworkHref(classId, undefined, undefined, data.classes.length ? "assignment" : "class")}><Plus size={16}/>{t(data.classes.length ? "createAssignment" : "createClass")}</Link>}</div>}
      </section>

      <section className="thd-panel thd-classes" aria-labelledby="dashboard-classes-title">
        <div className="thd-section-heading"><div className="thd-heading-label"><span className="thd-small-icon thd-sky"><School size={21}/></span><h2 id="dashboard-classes-title">{t("myClasses")}</h2></div><Link className="thd-text-link" href={homeworkHref(undefined, undefined, undefined, "class")}><Plus size={15}/>{t("addClass")}</Link></div>
        {classes.length ? <ul className="thd-class-list">{classes.map(classroom => {
          const tasks = assignments.filter(task => task.classId === classroom.id);
          const total = tasks.reduce((sum, task) => sum + task.targetCount, 0);
          const done = tasks.reduce((sum, task) => sum + task.done, 0);
          const submitted = tasks.reduce((sum, task) => sum + task.submitted, 0);
          const nextReview = queue.find(task => task.classId === classroom.id);
          const percent = total ? Math.min(100, Math.round(done / total * 100)) : 0;
          return <li key={classroom.id}><div className="thd-class-name"><Link href={homeworkHref(classroom.id)}><span><School size={18}/></span><strong>{classroom.name}</strong><ChevronRight size={15}/></Link><Link className="thd-class-roster" href={homeworkHref(classroom.id, undefined, undefined, "roster")}><Users size={13}/>{t("studentCount", {count: classroom.studentCount})}</Link></div><div className="thd-progress-label"><span>{t("classAssignmentCount", {count: tasks.length})}</span><strong>{total ? t("reviewProgress", {percent}) : t("noAssignments")}</strong></div><div className="thd-progress" role="progressbar" aria-label={t("classProgress", {name: classroom.name})} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width: `${percent}%`}}/></div>{submitted > 0 && nextReview && <Link className="thd-class-review" href={homeworkHref(classroom.id, nextReview.id, "submitted")}>{t("classReviewCount", {count: submitted})}<ArrowRight size={13}/></Link>}</li>;
        })}</ul> : <div className="thd-empty"><img src="/characters/rabbit-tori.webp" alt=""/><h3>{t("classesEmpty")}</h3><p>{t("classesEmptyHint")}</p><Link className="ws-button ws-button-light" href={homeworkHref(undefined, undefined, undefined, "class")}><Plus size={16}/>{t("createClass")}</Link></div>}
      </section>
    </div>

    <section className="thd-panel thd-gallery" aria-labelledby="dashboard-gallery-title">
      <div className="thd-section-heading"><div className="thd-heading-label"><span className="thd-small-icon thd-peach"><Images size={21}/></span><div><h2 id="dashboard-gallery-title">{t("galleryTitle")}</h2><p>{t("galleryHint")}</p></div></div><Link className="thd-text-link" href="/teacher/exhibitions">{t("goExhibitions")}<ChevronRight size={15}/></Link></div>
      {exhibitions.length ? <div className="thd-room-grid">{exhibitions.slice(0, 4).map((room, index) => <Link className={`thd-room ${["thd-peach", "thd-lilac", "thd-sky", "thd-yellow"][index % 4]}`} href={`/teacher/exhibitions?exhibition=${encodeURIComponent(room.id)}`} key={room.id}><div className="thd-room-top"><span className="thd-room-frame"><Images size={25}/></span><span className={`thd-room-status thd-room-${room.status}`}>{t(["draft", "open", "closed"].includes(room.status) ? `roomStatus.${room.status}` : "roomStatus.draft")}</span></div><small>{room.className}</small><h3>{room.title}</h3><span className="thd-room-bottom">{t("roomWorks", {total: room.artworkCount, approved: room.approvedCount})}<ArrowRight size={17}/></span></Link>)}</div> : <div className="thd-gallery-empty"><img src="/characters/otter-moa.webp" alt=""/><div><h3>{t("galleryEmpty")}</h3><p>{t("galleryEmptyHint")}</p><Link className="thd-text-link" href="/teacher/exhibitions">{t("startExhibition")}<ArrowRight size={15}/></Link></div></div>}
    </section>
    <p className="thd-footer"><Heart size={13}/>{t("footer")}<span>{t("updated", {time: new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul"}).format(new Date(data.generatedAt))})}</span></p>
  </div>;
}
