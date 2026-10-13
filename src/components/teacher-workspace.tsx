"use client";

import {useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode} from "react";
import {useLocale, useTranslations} from "next-intl";
import {ArrowDownToLine, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock3, FileText, Flower2, Heart, LoaderCircle, MessageCircleHeart, Paperclip, Plus, RefreshCw, Send, Star, Upload, Users, X} from "lucide-react";

import {characterFiles as friendFiles, type Character} from "@/lib/characters";
import {parseRoster} from "@/lib/roster";
type Status = "pending" | "submitted" | "done" | "revision";
type Classroom = {id: string; name: string; grade: number; year: number; studentCount: number};
type Student = {id: string; name: string; number: number; character?: Character; xp?: number; accessCode?: string};
type Assignment = {id: string; classId: string; title: string; description: string; dueAt?: string | null; targetCount: number; submittedCount: number; reviewedCount: number; targetStudentIds?: string[]};
type Submission = {id: string; studentId: string; text: string; attemptId: string; attemptNumber: number; status: Status; feedback?: string; uploads: {id: string; fileName: string; contentType: string; url?: string}[]};
type Detail = {assignment: Assignment; students: Student[]; submissions: Submission[]};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {...init, headers: {"Content-Type": "application/json", ...init?.headers}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code || "request_failed");
  return body as T;
}

function Modal({title, children, onClose, busy = false, drawer = false}: {title: string; children: ReactNode; onClose: () => void; busy?: boolean; drawer?: boolean}) {
  const t = useTranslations("product");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {dialog.current?.showModal();}, []);
  return <dialog className={`ws-dialog ${drawer ? "ws-review-drawer" : ""}`} ref={dialog} aria-labelledby="teacher-modal-title" onCancel={event => {event.preventDefault(); if (!busy) onClose();}}><div className="ws-dialog-head"><h2 id="teacher-modal-title">{title}</h2><button className="ws-icon-btn" onClick={onClose} disabled={busy} aria-label={t("common.close")}><X size={21}/></button></div><div className="ws-dialog-body">{children}</div></dialog>;
}

export default function TeacherWorkspace() {
  const t = useTranslations("product");
  const common = useTranslations("common");
  const locale = useLocale();
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [modal, setModal] = useState<"class" | "assignment" | "roster" | "codes" | null>(null);
  const [reviewStudent, setReviewStudent] = useState<Student | null>(null);
  const [feedback, setFeedback] = useState("");
  const [roster, setRoster] = useState("");
  const [codes, setCodes] = useState<Student[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [staleReview, setStaleReview] = useState(false);
  const [notice, setNotice] = useState("");
  const csvInput = useRef<HTMLInputElement>(null);

  const loadClasses = useCallback(async () => {
    try {const result = await request<{classes: Classroom[]}>("/api/classes"); setClasses(result.classes); setClassId(previous => previous || result.classes[0]?.id || ""); setError("");}
    catch {setError(t("common.networkError"));} finally {setLoading(false);}
  }, [t]);
  useEffect(() => {void loadClasses();}, [loadClasses]);
  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();
    setLoadingList(true); setDetail(null); setFilter("all");
    Promise.all([
      request<{assignments: Assignment[]}>(`/api/assignments?classId=${encodeURIComponent(classId)}`, {signal: controller.signal}),
      request<{students: Student[]}>(`/api/classes/${encodeURIComponent(classId)}/students`, {signal: controller.signal})
    ]).then(([tasks, rosterResult]) => {
      setAssignments(tasks.assignments); setStudents(rosterResult.students);
      setSelectedId(previous => tasks.assignments.some(assignment => assignment.id === previous) ? previous : tasks.assignments[0]?.id || "");
      setError("");
    }).catch(cause => {if (cause.name !== "AbortError") setError(t("common.networkError"));}).finally(() => {if (!controller.signal.aborted) setLoadingList(false);});
    return () => controller.abort();
  }, [classId, refresh, t]);
  useEffect(() => {
    if (!selectedId || loadingList) return;
    const controller = new AbortController();
    setLoadingDetail(true); setDetail(null); setFilter("all");
    request<Detail>(`/api/assignments/${encodeURIComponent(selectedId)}`, {signal: controller.signal}).then(result => {setDetail(result); setError("");}).catch(cause => {if (cause.name !== "AbortError") setError(t("common.networkError"));}).finally(() => {if (!controller.signal.aborted) setLoadingDetail(false);});
    return () => controller.abort();
  }, [selectedId, loadingList, refresh, t]);

  const submissionByStudent = useMemo(() => new Map(detail?.submissions.map(submission => [submission.studentId, submission]) || []), [detail]);
  const assignedStudents = useMemo(() => detail?.assignment.targetStudentIds ? detail.students.filter(student => detail.assignment.targetStudentIds?.includes(student.id)) : detail?.students || [], [detail]);
  const statusOf = (student: Student): Status => submissionByStudent.get(student.id)?.status || "pending";
  const stats = {submitted: assignedStudents.filter(student => statusOf(student) === "submitted").length, done: assignedStudents.filter(student => statusOf(student) === "done").length, pending: assignedStudents.filter(student => statusOf(student) === "pending").length, revision: assignedStudents.filter(student => statusOf(student) === "revision").length};
  const filteredStudents = assignedStudents.filter(student => filter === "all" || statusOf(student) === filter).sort((left, right) => left.number - right.number);
  const submission = reviewStudent ? submissionByStudent.get(reviewStudent.id) : null;
  const rosterResult = useMemo(() => parseRoster(roster), [roster]);
  const parsedRoster = rosterResult.ok ? rosterResult.students : null;
  const date = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? t("common.due", {date: new Intl.DateTimeFormat(locale, {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}).format(new Date(value))}) : t("common.noDue");
  const openModal = (next: typeof modal) => {
    setFormError("");
    if (next === "assignment" && !students.length) {setNotice(t("teacher.rosterFirst")); setModal("roster"); return;}
    setModal(next);
  };

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    if (!String(form.get("name") || "").trim()) {setFormError(t("common.required")); return;}
    setBusy(true); setFormError("");
    try {
      const result = await request<{class: Classroom}>("/api/classes", {method: "POST", body: JSON.stringify({name: String(form.get("name")).trim(), grade: Number(form.get("grade")), year: Number(form.get("year"))})});
      setClasses(previous => [...previous, result.class]); setClassId(result.class.id); setSelectedId(""); setModal(null); setNotice(t("teacher.classCreated"));
    } catch {setFormError(t("common.error"));} finally {setBusy(false);}
  }
  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); const dueValue = String(form.get("dueAt") || "");
    if (!String(form.get("title") || "").trim()) {setFormError(t("common.required")); return;}
    if (dueValue && Number.isNaN(Date.parse(dueValue))) {setFormError(t("teacher.dateInvalid")); return;}
    setBusy(true); setFormError("");
    try {
      const result = await request<{assignment: Assignment}>("/api/assignments", {method: "POST", body: JSON.stringify({classId, title: String(form.get("title")).trim(), description: String(form.get("description")).trim(), dueAt: dueValue ? new Date(dueValue).toISOString() : null})});
      setSelectedId(result.assignment.id); setRefresh(previous => previous + 1); setModal(null); setNotice(t("teacher.assignmentCreated"));
    } catch {setFormError(t("common.error"));} finally {setBusy(false);}
  }
  async function addStudents(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (!rosterResult.ok) {setFormError(t(`teacher.rosterError.${rosterResult.issue.kind}`, {line: rosterResult.issue.line})); return;}
    const parsedRoster = rosterResult.students;
    if (parsedRoster.length > 100) {setFormError(t("teacher.rosterBatchLimit")); return;}
    if (students.length + parsedRoster.length > 300) {setFormError(t("teacher.rosterClassLimit")); return;}
    if (parsedRoster.some(candidate => students.some(student => student.number === candidate.number))) {setFormError(t("teacher.rosterDuplicate")); return;}
    setBusy(true); setFormError("");
    try {
      const result = await request<{students: Student[]}>(`/api/classes/${encodeURIComponent(classId)}/students`, {method: "POST", body: JSON.stringify({students: parsedRoster})});
      setCodes(result.students); setRoster(""); setModal("codes"); setRefresh(previous => previous + 1); setNotice(t("teacher.rosterAdded")); void loadClasses();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "DUPLICATE_NUMBER") {setFormError(t("teacher.rosterDuplicate")); setRefresh(previous => previous + 1);}
      else setFormError(t("common.error"));
    } finally {setBusy(false);}
  }
  function downloadCodes() {
    const cell = (value: string | number) => {const text = String(value); return `"${(/^[=+@\-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;};
    const csv = "\uFEFF" + [[t("teacher.number"), t("teacher.name"), t("teacher.code")], ...codes.map(student => [student.number, student.name, student.accessCode || ""])].map(row => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8;"}));
    const link = document.createElement("a"); link.href = url; link.download = t("teacher.codeFilename"); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function resetCode(student: Student) {
    if (busy || !window.confirm(t("teacher.resetCodeConfirm", {name: student.name}))) return;
    setBusy(true); setFormError("");
    try {
      const result = await request<{accessCode: string}>(`/api/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(student.id)}/reset-code`, {method: "POST", body: "{}"});
      setCodes([{...student, accessCode: result.accessCode}]); setModal("codes");
    } catch {setFormError(t("common.error"));} finally {setBusy(false);}
  }
  async function review(status: "done" | "revision") {
    if (!reviewStudent || !submission || !detail || busy || staleReview) return;
    if (status === "revision" && !feedback.trim()) {setFormError(t("teacher.feedbackRequired")); return;}
    setBusy(true); setFormError("");
    try {
      await request(`/api/assignments/${encodeURIComponent(detail.assignment.id)}/review`, {method: "POST", body: JSON.stringify({studentId: reviewStudent.id, attemptId: submission.attemptId, status, feedback: feedback.trim()})});
      setReviewStudent(null); setRefresh(previous => previous + 1); setNotice(t("teacher.reviewSaved"));
    } catch (cause) {
      const changed = cause instanceof Error && cause.message === "STALE_ATTEMPT";
      setStaleReview(changed); setFormError(t(changed ? "teacher.reviewChanged" : "common.error"));
    } finally {setBusy(false);}
  }
  async function reloadSubmission() {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      setDetail(await request<Detail>(`/api/assignments/${encodeURIComponent(selectedId)}`));
      setStaleReview(false); setFormError("");
    } catch {setFormError(t("common.error"));} finally {setBusy(false);}
  }

  if (loading) return <section className="ws-loading" role="status"><LoaderCircle size={26} className="ws-spin"/><p>{t("common.loading")}</p></section>;
  return <div className="ws ws-teacher">
    <header id="teacher-homework" className="td-workspace-heading"><div><span className="td-heading-icon"><BookOpen size={22}/></span><h1>{common("homework")}</h1><span className="td-workspace-hint">{t("teacher.reviewBoard")}</span></div><img src="/characters/cat-mochi.webp" alt="" width={54} height={54}/></header>
    {error && <div className="ws-alert" role="alert">{error}<button onClick={() => {void loadClasses(); setRefresh(previous => previous + 1);}}>{t("common.retry")}</button></div>}
    <div className="ws-announcement" role="status" aria-live="polite">{notice && <><CheckCircle2 size={16}/>{notice}</>}</div>
    <div className="ws-class-toolbar"><div className="ws-row"><label className="ws-class-select"><Users size={18}/><span className="ws-visually-hidden">{t("teacher.classLabel")}</span><select aria-label={t("teacher.classLabel")} value={classId} onChange={event => {setClassId(event.target.value); setSelectedId(""); setAssignments([]); setStudents([]);}} disabled={!classes.length}>{!classes.length && <option value="">{t("teacher.classLabel")}</option>}{classes.map(classroom => <option value={classroom.id} key={classroom.id}>{classroom.name}</option>)}</select></label><button className="ws-icon-btn ws-outlined" onClick={() => openModal("class")} aria-label={t("teacher.newClass")}><Plus size={20}/></button></div><div className="ws-row"><button className="ws-button ws-button-light" disabled={!classId} onClick={() => openModal("roster")}><Users size={17}/>{t("teacher.manageStudents")}</button><button className="ws-button ws-button-primary" disabled={!classId} onClick={() => openModal("assignment")}><Plus size={18}/>{t("teacher.newAssignment")}</button></div></div>
    {!classes.length ? <section className="ws-empty ws-class-empty"><img src="/characters/alpaca-cloud.webp" alt=""/><h2>{t("teacher.emptyClassTitle")}</h2><p>{t("teacher.emptyClassBody")}</p><button className="ws-button ws-button-primary" onClick={() => openModal("class")}><Plus size={18}/>{t("teacher.newClass")}</button></section> : <>
      {loadingList ? <div className="ws-inline-loading" role="status"><LoaderCircle size={22} className="ws-spin"/>{t("common.loading")}</div> : <div className="ws-teacher-grid">
        <aside className="ws-assignment-panel" aria-label={t("teacher.assignmentList")}><div className="ws-panel-title"><h2><BookOpen size={18}/>{t("teacher.assignments")}</h2><span className="ws-count-pill">{assignments.length}</span></div><div className="ws-assignment-list">{!assignments.length && <div className="td-list-empty"><FileText size={28}/><p>{t("teacher.emptyAssignmentsTitle")}</p></div>}{assignments.map(assignment => <button key={assignment.id} className="ws-assignment-item" aria-pressed={selectedId === assignment.id} onClick={() => setSelectedId(assignment.id)}><span className="ws-assignment-item-icon"><FileText size={19}/></span><span><strong>{assignment.title}</strong><small>{t("teacher.submittedSummary", {submitted: assignment.submittedCount || 0, total: assignment.targetCount || 0})}</small></span><ChevronRight size={16}/></button>)}</div><button className="ws-add-assignment" onClick={() => openModal("assignment")}><Plus size={16}/>{t("teacher.newAssignment")}</button></aside>
        <section className="ws-review-panel">{loadingDetail ? <div className="ws-inline-loading" role="status"><LoaderCircle className="ws-spin" size={22}/>{t("common.loading")}</div> : !detail ? <div className="ws-empty td-empty-board"><div className="td-empty-illustration" aria-hidden="true"><span/><img src="/characters/rabbit-tori.webp" alt="" width={130} height={130}/><BookOpen size={39}/><Star size={18}/><Flower2 size={22}/></div><h2>{t(assignments.length ? "teacher.selectAssignment" : "teacher.emptyAssignmentsTitle")}</h2><p>{t("teacher.emptyAssignmentsBody")}</p><button className="ws-button ws-button-primary" onClick={() => openModal("assignment")}><Plus size={17}/>{t("teacher.newAssignment")}</button></div> : <><div className="ws-review-heading"><div><span className="ws-eyebrow td-review-label"><CheckCircle2 size={16}/>{t("teacher.reviewBoard")}</span><h2>{detail.assignment.title}</h2><p>{detail.assignment.description}</p><span className="ws-small">{date(detail.assignment.dueAt)}</span></div><button className="ws-icon-btn ws-outlined" onClick={() => setRefresh(previous => previous + 1)} aria-label={t("common.refresh")}><RefreshCw size={17}/></button></div><div className="ws-filter-tabs" aria-label={t("teacher.filterLabel")}>{(["all", "submitted", "pending", "revision", "done"] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{t(`common.${status}`)}<span className="td-filter-count">{status === "all" ? assignedStudents.length : stats[status]}</span></button>)}</div>
          {!assignedStudents.length ? <div className="ws-empty"><Users size={30}/><h3>{t("teacher.emptyStudentsTitle")}</h3><p>{t("teacher.emptyStudentsBody")}</p><button className="ws-button ws-button-light" onClick={() => openModal("roster")}>{t("teacher.manageStudents")}</button></div> : !filteredStudents.length ? <div className="ws-empty"><CheckCircle2 size={31}/><p>{t("teacher.noFilterResults")}</p></div> : <div className="ws-student-boxes">{filteredStudents.map(student => {const status = statusOf(student); return <button className={`ws-student-box ws-box-${status}`} key={student.id} onClick={() => {setReviewStudent(student); setStaleReview(false); setFeedback(submissionByStudent.get(student.id)?.feedback || ""); setFormError("");}} aria-label={`${student.name} · ${t(`common.${status}`)} · ${t("teacher.review")}`}><div className="ws-student-box-top"><span>{t("teacher.studentNumber", {number: student.number})}</span>{status === "done" ? <Flower2 size={19}/> : status === "submitted" ? <Clock3 size={17}/> : <span className="ws-student-dot"/>}</div><img src={`/characters/${friendFiles[student.character || "cat"]}.webp`} alt=""/><strong>{student.name}</strong><span className={`ws-status ws-status-${status}`}>{t(`common.${status}`)}</span></button>;})}</div>}
        </>}</section>
      </div>}
    </>}
    {modal === "class" && <Modal title={t("teacher.newClass")} onClose={() => setModal(null)} busy={busy}><form onSubmit={createClass}><label className="ws-field"><span>{t("teacher.className")}</span><input name="name" required maxLength={80} placeholder={t("teacher.classNamePlaceholder")} autoFocus/></label><div className="ws-form-pair"><label className="ws-field"><span>{t("teacher.grade")}</span><input type="number" name="grade" min={1} max={12} defaultValue={3} required/></label><label className="ws-field"><span>{t("teacher.year")}</span><input type="number" name="year" min={2020} max={2100} defaultValue={new Date().getFullYear()} required/></label></div>{formError && <p className="ws-form-error" role="alert">{formError}</p>}<div className="ws-form-actions"><button type="button" className="ws-button ws-button-light" onClick={() => setModal(null)} disabled={busy}>{t("common.cancel")}</button><button className="ws-button ws-button-primary" disabled={busy}>{busy ? <LoaderCircle className="ws-spin" size={17}/> : <Plus size={17}/>} {t(busy ? "common.saving" : "teacher.createClass")}</button></div></form></Modal>}
    {modal === "assignment" && <Modal title={t("teacher.newAssignment")} onClose={() => setModal(null)} busy={busy}><form onSubmit={createAssignment}><label className="ws-field"><span>{t("teacher.titleLabel")}</span><input name="title" required maxLength={120} placeholder={t("teacher.titlePlaceholder")} autoFocus/></label><label className="ws-field"><span>{t("teacher.descriptionLabel")}</span><textarea name="description" rows={5} maxLength={5000} placeholder={t("teacher.descriptionPlaceholder")}/></label><label className="ws-field"><span>{t("teacher.dueLabel")}</span><input name="dueAt" type="datetime-local"/></label>{formError && <p className="ws-form-error" role="alert">{formError}</p>}<div className="ws-form-actions"><button type="button" className="ws-button ws-button-light" onClick={() => setModal(null)} disabled={busy}>{t("common.cancel")}</button><button className="ws-button ws-button-primary" disabled={busy}>{busy ? <LoaderCircle className="ws-spin" size={17}/> : <Send size={17}/>} {t(busy ? "teacher.publishing" : "teacher.publish")}</button></div></form></Modal>}
    {modal === "roster" && <Modal title={t("teacher.rosterTitle")} onClose={() => setModal(null)} busy={busy}><p className="ws-modal-description">{t("teacher.rosterDescription")}</p>{students.length > 0 && <div className="ws-roster-existing">{students.map(student => <span className="ws-roster-entry" key={student.id}><span>{student.number}. {student.name}</span><button type="button" className="ws-icon-btn" disabled={busy} onClick={() => void resetCode(student)} aria-label={`${student.name} · ${t("teacher.resetCode")}`} title={t("teacher.resetCode")}><RefreshCw size={13}/></button></span>)}</div>}<p className="ws-roster-note">{t("teacher.newStudentsNote")}</p><form onSubmit={addStudents}><label className="ws-field"><span>{t("teacher.rosterLabel")}</span><textarea rows={8} value={roster} onChange={event => {setRoster(event.target.value); setFormError("");}} placeholder={t("teacher.rosterPlaceholder")} autoFocus/></label><div className="ws-roster-tools"><button type="button" className="ws-button ws-button-light" onClick={() => csvInput.current?.click()} disabled={busy}><Upload size={16}/>{t("teacher.chooseCsv")}</button>{parsedRoster && <span className="ws-small">{t("teacher.rosterPreview", {count: parsedRoster.length})}</span>}</div><input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" ref={csvInput} className="ws-visually-hidden" tabIndex={-1} onChange={async event => {const file = event.target.files?.[0]; try {if (file) {setRoster(await file.text()); setFormError("");}} catch {setFormError(t("teacher.fileReadError"));} event.target.value = "";}}/>{formError && <p className="ws-form-error" role="alert">{formError}</p>}<div className="ws-form-actions"><button type="button" className="ws-button ws-button-light" onClick={() => setModal(null)} disabled={busy}>{t("common.cancel")}</button><button className="ws-button ws-button-primary" disabled={busy || !roster.trim()}>{busy ? <LoaderCircle className="ws-spin" size={17}/> : <Users size={17}/>} {t(busy ? "common.saving" : "teacher.addStudents")}</button></div></form></Modal>}
    {modal === "codes" && <Modal title={t("teacher.codeTitle")} onClose={() => {setModal(null); setCodes([]);}}><p className="ws-modal-description">{t("teacher.codeDescription")}</p><div className="ws-codes-table"><table><thead><tr><th>{t("teacher.number")}</th><th>{t("teacher.name")}</th><th>{t("teacher.code")}</th></tr></thead><tbody>{codes.map(student => <tr key={student.id}><td>{student.number}</td><td>{student.name}</td><td><code>{student.accessCode}</code></td></tr>)}</tbody></table></div><div className="ws-form-actions"><button className="ws-button ws-button-primary" onClick={downloadCodes}><ArrowDownToLine size={17}/>{t("teacher.downloadCodes")}</button></div></Modal>}
    {reviewStudent && <Modal title={reviewStudent.name} drawer busy={busy} onClose={() => setReviewStudent(null)}><div className="ws-drawer-student"><img src={`/characters/${friendFiles[reviewStudent.character || "cat"]}.webp`} alt=""/><div><span className="ws-small">{t("teacher.studentNumber", {number: reviewStudent.number})}</span><h3>{detail?.assignment.title}</h3><span className={`ws-status ws-status-${statusOf(reviewStudent)}`}>{t(`common.${statusOf(reviewStudent)}`)}</span></div></div>{!submission ? <div className="ws-empty"><BookOpen size={31}/><p>{t("teacher.noSubmission")}</p></div> : <><span className="ws-small">{t("teacher.attempt", {count: submission.attemptNumber || 1})}</span><section className="ws-submitted-note"><h3>{t("teacher.studentText")}</h3><p>{submission.text || t("teacher.noText")}</p></section>{submission.uploads?.length > 0 && <section className="ws-review-files"><h3>{t("teacher.attachments")}</h3>{submission.uploads.map(upload => <div key={upload.id} className="ws-review-attachment">{upload.url && ["image/jpeg", "image/png", "image/webp"].includes(upload.contentType) && <a href={upload.url} target="_blank" rel="noopener noreferrer" aria-label={t("common.openFile", {name: upload.fileName})}><img src={upload.url} alt={upload.fileName} loading="lazy"/></a>}{upload.url ? <a className="ws-file-link" href={upload.url} target="_blank" rel="noopener noreferrer"><Paperclip size={17}/><span>{upload.fileName}</span><ArrowRight size={16}/></a> : <div className="ws-file-link"><Paperclip size={17}/><span>{upload.fileName}<small>{t("teacher.unavailableFile")}</small></span></div>}</div>)}</section>}<label className="ws-field"><span><MessageCircleHeart size={17}/>{t("teacher.feedbackLabel")}</span><textarea rows={5} value={feedback} maxLength={5000} onChange={event => setFeedback(event.target.value)} placeholder={t("teacher.feedbackPlaceholder")} disabled={busy}/></label>{formError && <p className="ws-form-error" role="alert">{formError}</p>}{staleReview && <button className="ws-button ws-button-light" onClick={() => void reloadSubmission()} disabled={busy}><RefreshCw size={16}/>{t("common.refresh")}</button>}<div className="ws-review-actions"><button className="ws-button ws-button-primary" onClick={() => void review("done")} disabled={busy || staleReview}>{busy ? <LoaderCircle className="ws-spin" size={18}/> : <CheckCircle2 size={18}/>} {t("teacher.approve")}</button><button className="ws-button ws-button-light" onClick={() => void review("revision")} disabled={busy || staleReview}><RefreshCw size={16}/>{t("teacher.requestRevision")}</button></div></>}</Modal>}
    <div className="ws-kind-footer"><Heart size={14}/>{t("teacher.eyebrow")}</div>
  </div>;
}
