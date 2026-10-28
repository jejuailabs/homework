"use client";

import {useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode} from "react";
import {useLocale, useTranslations} from "next-intl";
import Link from "next/link";
import {useRouter, useSearchParams} from "next/navigation";
import {Archive, Eye, EyeOff, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, Clock3, FileText, Flower2, Heart, ImagePlus, ListChecks, LoaderCircle, MessageCircleHeart, Paperclip, Plus, RefreshCw, Send, Star, Users, Video, X} from "lucide-react";

import {AssignmentVisibilityList, type AssignmentVisibility, type VisibilityAssignment} from "./assignment-visibility-controls";
import type {Character} from "@/lib/characters";
import {classStudentsHref} from "@/lib/class-students-link";
import {assignmentSubmissionType, submissionTypes, videoSubmissionMimeTypes, type AssignmentSubmissionType, type SubmissionType} from "@/lib/assignment-submission";
import HomeworkBoardPublish from "./homework-board-publish";
import CharacterAvatar from "./character-avatar";
import HomeworkBulkReview, {type BulkReviewResult} from "./homework-bulk-review";
import type {WardrobeOutfit} from "@/lib/points-types";
import {AssignmentMaterials, AssignmentMaterialEditor} from "./assignment-materials";
import type {AssignmentMaterial} from "@/lib/assignment-materials";
import {classMetadataFetch} from '@/lib/class-metadata-cache';
import {countUsageOnce} from "@/lib/usage-beacon";
type Status = "pending" | "submitted" | "done" | "revision";
type Classroom = {id: string; name: string; grade: number; year: number; studentCount: number};
type Student = {id: string; name: string; number: number; character?: Character; xp?: number; accessCode?: string; wardrobeOutfit?: WardrobeOutfit; spaceCompanion?: {art: string; pose?: 'rest' | 'raised'; outfit: Partial<Record<"body" | "bag", string>>} | null};
type Assignment = VisibilityAssignment & {materials?: AssignmentMaterial[]; submissionType?: AssignmentSubmissionType; id: string; classId: string; title: string; description: string; dueAt?: string | null; targetCount: number; submittedCount: number; reviewedCount: number; targetStudentIds?: string[]};
type Submission = {id: string; studentId: string; text: string; attemptId: string; attemptNumber: number; status: Status; feedback?: string; uploads: {id: string; fileName: string; contentType: string; url?: string; thumbnailUrl?:string}[]};
type Detail = {assignment: Assignment; students: Student[]; submissions: Submission[]};
type VisibilityUpdate = Pick<VisibilityAssignment, "id" | "visibility" | "visibilityVersion" | "hiddenAt" | "hiddenBy">;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await classMetadataFetch(url, {...init, headers: {"Content-Type": "application/json", ...init?.headers}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.code || "request_failed"), {status: response.status});
  return body as T;
}

function Modal({title, children, onClose, busy = false, drawer = false}: {title: string; children: ReactNode; onClose: () => void; busy?: boolean; drawer?: boolean}) {
  const t = useTranslations("product");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {dialog.current?.showModal();}, []);
  return <dialog className={`ws-dialog ${drawer ? "ws-review-drawer" : ""}`} ref={dialog} aria-labelledby="teacher-modal-title" onCancel={event => {event.preventDefault(); if (!busy) onClose();}}><div className="ws-dialog-head"><h2 id="teacher-modal-title">{title}</h2><button className="ws-icon-btn" onClick={onClose} disabled={busy} aria-label={t("common.close")}><X size={21}/></button></div><div className="ws-dialog-body">{children}</div></dialog>;
}

const submissionIcons = {text: FileText, image: ImagePlus, video: Video, legacy: Paperclip};

function SubmissionTypeBadge({value}: {value?: AssignmentSubmissionType}) {
  const t = useTranslations("product.submissionTypes");
  const type = assignmentSubmissionType(value);
  const Icon = submissionIcons[type];
  return <span className={`td-submission-badge td-submission-${type}`}><Icon size={13} aria-hidden="true"/>{t(type)}</span>;
}

type WorkspaceEntry = {classId?: string; assignmentId?: string; studentId?: string; status?: Status | "all"; action?: "class" | "assignment"};

export default function TeacherWorkspaceEntry() {
  const params = useSearchParams();
  const validId = (value: string | null) => value && /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : undefined;
  const status = params.get("status"), action = params.get("action");
  if (action === "roster") return <LegacyStudentRedirect classId={validId(params.get("classId"))}/>;
  return <TeacherWorkspace key={params.toString()} entry={{classId: validId(params.get("classId")), assignmentId: validId(params.get("assignmentId")), studentId: validId(params.get("studentId")), status: ["all", "pending", "submitted", "done", "revision"].includes(status || "") ? status as WorkspaceEntry["status"] : undefined, action: ["class", "assignment"].includes(action || "") ? action as WorkspaceEntry["action"] : undefined}}/>;
}

function LegacyStudentRedirect({classId}: {classId?: string}) {
  const router = useRouter(), t = useTranslations("product");
  useEffect(() => {router.replace(classStudentsHref(classId));}, [router, classId]);
  return <section className="ws-loading" role="status"><LoaderCircle className="ws-spin"/>{t("common.loading")}</section>;
}

function TeacherWorkspace({entry}: {entry: WorkspaceEntry}) {
  const t = useTranslations("product");
  const common = useTranslations("common");
  const locale = useLocale();
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [visibilityView, setVisibilityView] = useState<AssignmentVisibility>("visible");
  const [visibilityRequest, setVisibilityRequest] = useState<{action: "hide" | "restore"; tasks: Assignment[]} | null>(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false), [visibilityError, setVisibilityError] = useState("");
  const [selectionEpoch, setSelectionEpoch] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [loadedClassId, setLoadedClassId] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [modal, setModal] = useState<"class" | "assignment" | null>(null);
  const [editingAssignment,setEditingAssignment]=useState<Assignment|null>(null);
  const [materials,setMaterials]=useState<AssignmentMaterial[]>([]),[materialsBusy,setMaterialsBusy]=useState(false);
  const [reviewStudent, setReviewStudent] = useState<Student | null>(null);
  const [bulkMode, setBulkMode] = useState(false), [bulkSelected, setBulkSelected] = useState<string[]>([]), [bulkOpen, setBulkOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [staleReview, setStaleReview] = useState(false);
  const [notice, setNotice] = useState("");
  const entryActionApplied = useRef(false);
  const entryAssignmentApplied = useRef(false);
  const entryFilterApplied = useRef(false);
  const entryStudentApplied = useRef(false);
  const filterAssignmentId = useRef("");
  const rosterRequest = useRef<AbortController | null>(null);
  const localVisibility = useRef(new Map<string, VisibilityUpdate>());
  const synchronizeAssignment = useCallback((assignment: Assignment): Assignment => {
    const change = localVisibility.current.get(assignment.id);
    return change && (change.visibilityVersion || 0) > (assignment.visibilityVersion || 0) ? {...assignment, ...change} : assignment;
  }, []);
  useEffect(() => () => rosterRequest.current?.abort(), []);

  const loadClasses = useCallback(async () => {
    try {const result = await request<{classes: Classroom[]}>("/api/classes"); setClasses(result.classes); setClassId(previous => result.classes.some(value => value.id === previous) ? previous : result.classes.find(value => value.id === entry.classId)?.id || result.classes[0]?.id || ""); setError("");}
    catch {setError(t("common.networkError"));} finally {setLoading(false);}
  }, [t, entry.classId]);
  useEffect(() => {void loadClasses();}, [loadClasses]);
  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();
    setLoadingList(true); setDetail(null);
    request<{assignments: Assignment[]}>(`/api/assignments?classId=${encodeURIComponent(classId)}&summary=1`, {signal: controller.signal}).then(tasks => {
      if (controller.signal.aborted) return;
      tasks.assignments = tasks.assignments.map(synchronizeAssignment);
      setAssignments(tasks.assignments);
      setLoadedClassId(classId);
      // Only an explicit dashboard task link opens a detail on entry; ordinary visits show the list.
      if (!entryAssignmentApplied.current) {
        entryAssignmentApplied.current = true;
        if (entry.assignmentId && entry.classId === classId) {setSelectedId(entry.assignmentId); setVisibilityView(tasks.assignments.find(task => task.id === entry.assignmentId)?.visibility === "hidden" ? "hidden" : "visible");}
      }
      setError("");
    }).catch(cause => {if (cause.name !== "AbortError") setError(t("common.networkError"));}).finally(() => {if (!controller.signal.aborted) setLoadingList(false);});
    return () => controller.abort();
  }, [classId, refresh, t, entry.assignmentId, entry.classId, synchronizeAssignment]);
  useEffect(() => {
    if (!selectedId || loadingList) return;
    const controller = new AbortController();
    setLoadingDetail(true); setDetail(null);
    if (filterAssignmentId.current !== selectedId) {filterAssignmentId.current = selectedId; setFilter("all");}
    request<Detail>(`/api/assignments/${encodeURIComponent(selectedId)}`, {signal: controller.signal}).then(result => {
      if (controller.signal.aborted) return;
      if (result.assignment.classId !== classId) throw new Error("class_mismatch");
      result.assignment = synchronizeAssignment(result.assignment);
      setDetail(result); setVisibilityView(result.assignment.visibility === "hidden" ? "hidden" : "visible"); setError("");
      setAssignments(previous => previous.some(task => task.id === result.assignment.id) ? previous.map(task => task.id === result.assignment.id ? {...task, ...result.assignment} : task) : [result.assignment, ...previous]);
      if (!entryFilterApplied.current && (!entry.assignmentId || entry.assignmentId === selectedId)) {entryFilterApplied.current = true; setFilter(entry.status || "all");}
      if (!entryStudentApplied.current && entry.assignmentId === selectedId && entry.classId === classId && entry.studentId) {
        entryStudentApplied.current = true;
        const student = result.students.find(value => value.id === entry.studentId && (!result.assignment.targetStudentIds || result.assignment.targetStudentIds.includes(value.id)));
        if (student) {setReviewStudent(student); setFeedback(result.submissions.find(value => value.studentId === student.id)?.feedback || ""); setFormError(""); setStaleReview(false);}
      }
    }).catch(cause => {if (cause.name !== "AbortError") setError(t("common.networkError"));}).finally(() => {if (!controller.signal.aborted) setLoadingDetail(false);});
    return () => controller.abort();
  }, [selectedId, loadingList, classId, t, entry.assignmentId, entry.status, entry.classId, entry.studentId, synchronizeAssignment]);
  useEffect(() => {
    if (!entry.action || entryActionApplied.current || loading || loadingList || error || (classId && loadedClassId !== classId)) return;
    entryActionApplied.current = true;
    void openModal(!classId ? "class" : entry.action);
  }, [entry.action, loading, loadingList, error, classId, loadedClassId, t]);

  const detailHidden = detail?.assignment.visibility === "hidden";
  useEffect(() => {if (detailHidden) {setBulkMode(false); setBulkSelected([]); setBulkOpen(false);}}, [detailHidden]);
  const submissionByStudent = useMemo(() => new Map(detail?.submissions.map(submission => [submission.studentId, submission]) || []), [detail]);
  const assignedStudents = useMemo(() => detail?.assignment.targetStudentIds ? detail.students.filter(student => detail.assignment.targetStudentIds?.includes(student.id)) : detail?.students || [], [detail]);
  const statusOf = (student: Student): Status => submissionByStudent.get(student.id)?.status || "pending";
  const stats = {submitted: assignedStudents.filter(student => statusOf(student) === "submitted").length, done: assignedStudents.filter(student => statusOf(student) === "done").length, pending: assignedStudents.filter(student => statusOf(student) === "pending").length, revision: assignedStudents.filter(student => statusOf(student) === "revision").length};
  const filteredStudents = assignedStudents.filter(student => filter === "all" || statusOf(student) === filter).sort((left, right) => left.number - right.number);
  const submission = reviewStudent ? submissionByStudent.get(reviewStudent.id) : null;
  const bulkCandidates = assignedStudents.filter(student => statusOf(student) === "submitted");
  const bulkRows = bulkCandidates.filter(student => bulkSelected.includes(student.id)).sort((left, right) => left.number - right.number);
  const toggleBulk = (studentId: string) => setBulkSelected(previous => previous.includes(studentId) ? previous.filter(value => value !== studentId) : [...previous, studentId]);
  function finishBulk(results: BulkReviewResult[]) {
    const failed = results.filter(result => !result.ok), done = results.length - failed.length;
    setBulkSelected(failed.map(result => result.studentId)); setBulkOpen(false); if (!failed.length) setBulkMode(false);
    setRefresh(previous => previous + 1);
    setNotice(failed.length ? t("teacher.bulkPartial", {done, failed: failed.length}) : t("teacher.bulkDone", {count: done}));
  }
  const date = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? t("common.due", {date: new Intl.DateTimeFormat(locale, {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}).format(new Date(value))}) : t("common.noDue");
  function closeModal() {rosterRequest.current?.abort(); setLoadingRoster(false); setModal(null);}
  async function openModal(next: typeof modal, assignment?: Assignment) {
    if (assignment?.visibility === "hidden" || visibilityBusy) return;
    setEditingAssignment(assignment||null); setMaterials(assignment?.materials||[]); setMaterialsBusy(false); setLoadingRoster(false);
    rosterRequest.current?.abort();
    setFormError("");
    setModal(next);
    if (next !== "assignment" || assignment) return;
    const controller = new AbortController(); rosterRequest.current = controller;
    setLoadingRoster(true); setRosterError(false);
    try {
      const result = await request<{students: Student[]}>(`/api/classes/${encodeURIComponent(classId)}/students`, {signal: controller.signal});
      if (controller.signal.aborted) return;
      setStudents(result.students);
    } catch (cause) {if (!controller.signal.aborted) setRosterError(true);}
    finally {if (!controller.signal.aborted) setLoadingRoster(false);}
  }
  function selectAssignment(id: string) {if (id === selectedId) return; setDetail(null); setReviewStudent(null); setBulkMode(false); setBulkSelected([]); setBulkOpen(false); setLoadingDetail(!!id); setSelectedId(id);}
  const rosterLoadingContent = loadingRoster ? <div className="ws-inline-loading" role="status"><LoaderCircle className="ws-spin" size={22}/>{t("common.loading")}</div> : rosterError ? <div className="ws-alert" role="alert">{t("common.networkError")}<button onClick={() => void openModal(modal)}>{t("common.retry")}</button></div> : null;

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
    event.preventDefault(); if (busy || materialsBusy || editingAssignment?.visibility === "hidden") return;
    const form = new FormData(event.currentTarget); const dueValue = String(form.get("dueAt") || "");
    const submissionType = String(form.get("submissionType") || editingAssignment?.submissionType || "");
    if (!editingAssignment && !submissionTypes.includes(submissionType as SubmissionType)) {setFormError(t("teacher.submissionTypeRequired")); return;}
    if (!String(form.get("title") || "").trim()) {setFormError(t("common.required")); return;}
    if (dueValue && Number.isNaN(Date.parse(dueValue))) {setFormError(t("teacher.dateInvalid")); return;}
    setBusy(true); setFormError("");
    try {
      const result = await request<{assignment: Assignment}>(editingAssignment ? `/api/assignments/${editingAssignment.id}` : "/api/assignments", {method: editingAssignment ? "PATCH" : "POST", body: JSON.stringify({classId, submissionType, materialIds: materials.map(value=>value.id), title: String(form.get("title")).trim(), description: String(form.get("description")).trim(), dueAt: dueValue ? new Date(dueValue).toISOString() : null})});
      setSelectedId(result.assignment.id); setVisibilityView("visible"); setRefresh(previous => previous + 1); setModal(null); setNotice(t("teacher.assignmentCreated"));
    } catch (cause) {setFormError(t(cause instanceof Error && cause.message === "SUBMISSION_TYPE" ? "teacher.submissionTypeRequired" : "common.error"));} finally {setBusy(false);}
  }
  async function review(status: "done" | "revision") {
    if (!reviewStudent || !submission || !detail || detailHidden || busy || staleReview) return;
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
      const result = await request<Detail>(`/api/assignments/${encodeURIComponent(selectedId)}`);
      result.assignment = synchronizeAssignment(result.assignment);
      setDetail(result); setVisibilityView(result.assignment.visibility === "hidden" ? "hidden" : "visible");
      setAssignments(old => old.map(task => task.id === result.assignment.id ? {...task, ...result.assignment} : task));
      setStaleReview(false); setFormError("");
    } catch {setFormError(t("common.error"));} finally {setBusy(false);}
  }

  function requestVisibility(action: "hide" | "restore", tasks: Assignment[]) {
    if (visibilityBusy || !tasks.length) return;
    setVisibilityError(""); setVisibilityRequest({action, tasks});
  }
  async function changeVisibility() {
    if (!visibilityRequest || visibilityBusy) return;
    const pending = visibilityRequest;
    setVisibilityBusy(true); setVisibilityError("");
    try {
      const result = await request<{assignments: VisibilityUpdate[]}>("/api/assignments/visibility", {method: "POST", body: JSON.stringify({classId, action: pending.action, items: pending.tasks.map(task => ({id: task.id, visibilityVersion: task.visibilityVersion || 0}))})});
      const changes = new Map(result.assignments.map(task => [task.id, task]));
      result.assignments.forEach(task => localVisibility.current.set(task.id, task));
      setAssignments(old => old.map(task => changes.has(task.id) ? {...task, ...changes.get(task.id)!} : task));
      setDetail(old => old && changes.has(old.assignment.id) ? {...old, assignment: {...old.assignment, ...changes.get(old.assignment.id)!}} : old);
      if (changes.has(selectedId)) {setVisibilityView(pending.action === "hide" ? "hidden" : "visible"); setReviewStudent(null); setBulkMode(false); setBulkSelected([]); setBulkOpen(false);}
      setSelectionEpoch(value => value + 1); setVisibilityRequest(null);
      setNotice(t(pending.action === "hide" ? "teacher.assignmentsHidden" : "teacher.assignmentsRestored", {count: result.assignments.length}));
    } catch (cause) {
      const conflict = cause instanceof Error && "status" in cause && cause.status === 409;
      setVisibilityError(t(conflict ? "teacher.visibilityChanged" : "common.error"));
      if (conflict) {setSelectionEpoch(value => value + 1); setRefresh(value => value + 1);}
    } finally {setVisibilityBusy(false);}
  }

  if (loading) return <section className="ws-loading" role="status"><LoaderCircle size={26} className="ws-spin"/><p>{t("common.loading")}</p></section>;
  return <div className="ws ws-teacher">
    <header id="teacher-homework" className="td-workspace-heading"><div><span className="td-heading-icon"><BookOpen size={22}/></span><h1>{common("homework")}</h1><span className="td-workspace-hint">{t(selectedId ? "teacher.reviewBoard" : "teacher.listFirstHint")}</span></div><img src="/characters/cat-mochi.webp" alt="" width={54} height={54}/></header>
    {error && <div className="ws-alert" role="alert">{error}<button onClick={() => {void loadClasses(); setRefresh(previous => previous + 1);}}>{t("common.retry")}</button></div>}
    <div className="ws-announcement" role="status" aria-live="polite">{notice && <><CheckCircle2 size={16}/>{notice}</>}</div>
    <div className="ws-class-toolbar"><div className="ws-row"><label className="ws-class-select"><Users size={18}/><span className="ws-visually-hidden">{t("teacher.classLabel")}</span><select aria-label={t("teacher.classLabel")} value={classId} onChange={event => {setClassId(event.target.value); setSelectedId(""); setAssignments([]); setStudents([]); setVisibilityView("visible"); setVisibilityRequest(null);}} disabled={!classes.length || visibilityBusy}>{!classes.length && <option value="">{t("teacher.classLabel")}</option>}{classes.map(classroom => <option value={classroom.id} key={classroom.id}>{classroom.name}</option>)}</select></label><button className="ws-icon-btn ws-outlined" onClick={() => openModal("class")} aria-label={t("teacher.newClass")}><Plus size={20}/></button></div><div className="ws-row"><button className="ws-button ws-button-primary" disabled={!classId || visibilityBusy} onClick={() => openModal("assignment")}><Plus size={18}/>{t("teacher.newAssignment")}</button></div></div>
    {!classes.length ? <section className="ws-empty ws-class-empty"><img src="/characters/alpaca-cloud.webp" alt=""/><h2>{t("teacher.emptyClassTitle")}</h2><p>{t("teacher.emptyClassBody")}</p><button className="ws-button ws-button-primary" onClick={() => openModal("class")}><Plus size={18}/>{t("teacher.newClass")}</button></section> : <>
      {loadingList ? <div className="ws-inline-loading" role="status"><LoaderCircle size={22} className="ws-spin"/>{t("common.loading")}</div> : <div className={`ws-teacher-grid${selectedId ? "" : " td-list-first"}`}>
        <AssignmentVisibilityList key={classId + ":" + selectionEpoch} assignments={assignments} selectedId={selectedId} view={visibilityView} busy={visibilityBusy} onViewChange={value => {setVisibilityView(value); selectAssignment("");}} onSelect={selectAssignment} onCreate={() => void openModal("assignment")} onRequest={requestVisibility} renderContents={assignment => <><span className="ws-assignment-item-icon">{(() => {const Icon = submissionIcons[assignmentSubmissionType(assignment.submissionType)]; return <Icon size={19}/>;})()}</span><span><strong>{assignment.title}</strong><SubmissionTypeBadge value={assignment.submissionType}/><small>{t("teacher.submittedSummary", {submitted: assignment.submittedCount || 0, total: assignment.targetCount || 0})}</small><small className="td-assignment-due">{date(assignment.dueAt)}</small></span></>}/>
        {selectedId && <section className="ws-review-panel"><button className="td-back-to-list" onClick={() => selectAssignment("")}><ArrowLeft size={16}/>{t("teacher.backToList")}</button>{loadingDetail ? <div className="ws-inline-loading" role="status"><LoaderCircle className="ws-spin" size={22}/>{t("common.loading")}</div> : !detail ? <div className="ws-empty td-empty-board"><div className="td-empty-illustration" aria-hidden="true"><span/><img src="/characters/rabbit-tori.webp" alt="" width={130} height={130}/><BookOpen size={39}/><Star size={18}/><Flower2 size={22}/></div><h2>{t(assignments.length ? "teacher.selectAssignment" : "teacher.emptyAssignmentsTitle")}</h2><p>{t("teacher.emptyAssignmentsBody")}</p><button className="ws-button ws-button-primary" onClick={() => openModal("assignment")}><Plus size={17}/>{t("teacher.newAssignment")}</button></div> : <>{detailHidden && <div className="av-readonly-note"><Archive size={18}/><span>{t("teacher.hiddenReadonly")}</span></div>}<div className="ws-review-heading"><div><span className="ws-eyebrow td-review-label"><CheckCircle2 size={16}/>{t("teacher.reviewBoard")}</span><h2>{detail.assignment.title}</h2><SubmissionTypeBadge value={detail.assignment.submissionType}/><p>{detail.assignment.description}</p><AssignmentMaterials materials={detail.assignment.materials} onRefresh={()=>setRefresh(value=>value+1)}/><div className="av-detail-actions"><button className="ws-button ws-button-light" disabled={detailHidden || visibilityBusy} onClick={()=>openModal("assignment",detail.assignment)}>{locale==="en"?"Edit homework & materials":"숙제·참고 자료 수정"}</button><button className="ws-button ws-button-light" disabled={visibilityBusy} onClick={() => requestVisibility(detailHidden ? "restore" : "hide", [detail.assignment])}>{detailHidden ? <Eye size={16}/> : <EyeOff size={16}/>} {t(detailHidden ? "teacher.restoreAssignment" : "teacher.hideFromStudents")}</button></div><span className="ws-small">{date(detail.assignment.dueAt)}</span></div><button className="ws-icon-btn ws-outlined" onClick={() => setRefresh(previous => previous + 1)} aria-label={t("common.refresh")}><RefreshCw size={17}/></button></div>{!detailHidden && <HomeworkBoardPublish key={detail.assignment.id} assignment={detail.assignment} students={detail.students} submissions={detail.submissions}/>}<div className="ws-filter-tabs" aria-label={t("teacher.filterLabel")}>{(["all", "submitted", "pending", "revision", "done"] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{t(`common.${status}`)}<span className="td-filter-count">{status === "all" ? assignedStudents.length : stats[status]}</span></button>)}<button type="button" className={`ws-button ${bulkMode ? "ws-button-primary" : "ws-button-light"} ws-bulk-toggle`} aria-pressed={bulkMode} disabled={detailHidden || (!bulkCandidates.length && !bulkMode)} onClick={() => {setBulkMode(value => !value); setBulkSelected([]);}}><ListChecks size={16}/>{t(bulkMode ? "teacher.bulkExit" : "teacher.bulkStart")}</button></div>{bulkMode && !detailHidden && <div className="ws-bulk-bar" role="region" aria-label={t("teacher.bulkStart")}><span>{t("teacher.bulkSelected", {count: bulkRows.length})}</span><button type="button" className="ws-button ws-button-light" disabled={!bulkCandidates.length} onClick={() => setBulkSelected(bulkRows.length === bulkCandidates.length ? [] : bulkCandidates.map(student => student.id))}>{t(bulkRows.length === bulkCandidates.length && bulkCandidates.length ? "teacher.bulkClear" : "teacher.bulkSelectAll", {count: bulkCandidates.length})}</button><button type="button" className="ws-button ws-button-primary" disabled={!bulkRows.length} onClick={() => setBulkOpen(true)}><CheckCircle2 size={16}/>{t("teacher.bulkOpen", {count: bulkRows.length})}</button></div>}
          {!assignedStudents.length ? <div className="ws-empty"><Users size={30}/><h3>{t("teacher.emptyStudentsTitle")}</h3><p>{t("teacher.emptyStudentsBody")}</p><Link className="ws-button ws-button-light" href={classStudentsHref(classId)}>{t("teacher.classRosterLink")}</Link></div> : !filteredStudents.length ? <div className="ws-empty"><CheckCircle2 size={31}/><p>{t("teacher.noFilterResults")}</p></div> : <div className="ws-student-boxes">{filteredStudents.map(student => {const status = statusOf(student), selectable = status === "submitted", picked = bulkSelected.includes(student.id); return <button className={`ws-student-box ws-box-${status}${bulkMode ? (selectable ? " is-bulk-selectable" : " is-bulk-disabled") : ""}${bulkMode && picked ? " is-bulk-picked" : ""}`} key={student.id} {...(bulkMode ? {"aria-pressed": picked, disabled: !selectable} : {})} onClick={() => {if (bulkMode) {if (selectable) toggleBulk(student.id); return;} setReviewStudent(student); setStaleReview(false); setFeedback(submissionByStudent.get(student.id)?.feedback || ""); setFormError("");}} aria-label={`${student.name} · ${t(`common.${status}`)} · ${t("teacher.review")}`}><div className="ws-student-box-top"><span>{bulkMode && selectable && <span className="ws-bulk-check" aria-hidden="true">{picked && <Check size={13}/>}</span>}{t("teacher.studentNumber", {number: student.number})}</span>{status === "done" ? <Flower2 size={19}/> : status === "submitted" ? <Clock3 size={17}/> : <span className="ws-student-dot"/>}</div><StudentAvatar student={student}/><strong>{student.name}</strong><span className={`ws-status ws-status-${status}`}>{t(`common.${status}`)}</span></button>;})}</div>}
        </>}</section>}
      </div>}
    </>}
    {modal === "class" && <Modal title={t("teacher.newClass")} onClose={() => setModal(null)} busy={busy}><form onSubmit={createClass}><label className="ws-field"><span>{t("teacher.className")}</span><input name="name" required maxLength={80} placeholder={t("teacher.classNamePlaceholder")} autoFocus/></label><div className="ws-form-pair"><label className="ws-field"><span>{t("teacher.grade")}</span><input type="number" name="grade" min={1} max={12} defaultValue={3} required/></label><label className="ws-field"><span>{t("teacher.year")}</span><input type="number" name="year" min={2020} max={2100} defaultValue={new Date().getFullYear()} required/></label></div>{formError && <p className="ws-form-error" role="alert">{formError}</p>}<div className="ws-form-actions"><button type="button" className="ws-button ws-button-light" onClick={() => setModal(null)} disabled={busy}>{t("common.cancel")}</button><button className="ws-button ws-button-primary" disabled={busy}>{busy ? <LoaderCircle className="ws-spin" size={17}/> : <Plus size={17}/>} {t(busy ? "common.saving" : "teacher.createClass")}</button></div></form></Modal>}
    {modal === "assignment" && <Modal title={editingAssignment ? (locale==="en"?"Edit homework":"숙제 수정") : t("teacher.newAssignment")} onClose={closeModal} busy={busy}>{rosterLoadingContent || (!students.length && !editingAssignment ? <div className="ws-empty"><Users size={30}/><h3>{t("teacher.rosterFirst")}</h3><Link className="ws-button ws-button-primary" href={classStudentsHref(classId)}><Users size={17}/>{t("teacher.classRosterLink")}</Link></div> : <form onSubmit={createAssignment}><label className="ws-field"><span>{t("teacher.titleLabel")}</span><input name="title" required maxLength={120} defaultValue={editingAssignment?.title} placeholder={t("teacher.titlePlaceholder")} autoFocus/></label>{!editingAssignment && <fieldset className="td-submission-field" aria-describedby="submission-type-hint" disabled={busy}>
      <legend>{t("teacher.submissionTypeLabel")}</legend>
      <p id="submission-type-hint">{t("teacher.submissionTypeHint")}</p>
      <div className="td-submission-options">{submissionTypes.map(type => {const Icon = submissionIcons[type]; return <label className={`td-submission-option td-submission-${type}`} key={type}>
        <input type="radio" name="submissionType" value={type} required aria-label={t(`submissionTypes.${type}`)}/>
        <span className="td-submission-option-icon"><Icon size={23} aria-hidden="true"/></span><strong>{t(`submissionTypes.${type}`)}</strong><small>{t(`submissionTypes.${type}Hint`)}</small>
      </label>;})}</div>
    </fieldset>}<label className="ws-field"><span>{t("teacher.descriptionLabel")}</span><textarea name="description" defaultValue={editingAssignment?.description} rows={5} maxLength={5000} placeholder={t("teacher.descriptionPlaceholder")}/></label><label className="ws-field"><span>{t("teacher.dueLabel")}</span><input name="dueAt" type="datetime-local" defaultValue={editingAssignment?.dueAt ? new Date(new Date(editingAssignment.dueAt).getTime()-new Date(editingAssignment.dueAt).getTimezoneOffset()*60000).toISOString().slice(0,16) : ""}/></label><AssignmentMaterialEditor key={`${classId}:${editingAssignment?.id||"new"}`} classId={classId} initial={editingAssignment?.materials} onChange={setMaterials} onBusy={setMaterialsBusy}/>{formError && <p className="ws-form-error" role="alert">{formError}</p>}<div className="ws-form-actions"><button type="button" className="ws-button ws-button-light" onClick={() => setModal(null)} disabled={busy}>{t("common.cancel")}</button><button className="ws-button ws-button-primary" disabled={busy||materialsBusy}>{busy ? <LoaderCircle className="ws-spin" size={17}/> : <Send size={17}/>} {editingAssignment ? (locale==="en"?"Save changes":"수정 저장") : t(busy ? "teacher.publishing" : "teacher.publish")}</button></div></form>)}</Modal>}
    {bulkOpen && detail && !detailHidden && <HomeworkBulkReview assignmentId={detail.assignment.id} Modal={Modal} rows={bulkRows.flatMap(student => {const value = submissionByStudent.get(student.id); return value ? [{studentId: student.id, name: student.name, number: student.number, attemptId: value.attemptId, text: value.text, uploads: value.uploads, avatar: <StudentAvatar student={student}/>}] : [];})} onRemove={studentId => setBulkSelected(previous => previous.filter(value => value !== studentId))} onClose={() => setBulkOpen(false)} onDone={finishBulk}/>}
    {reviewStudent && <Modal title={reviewStudent.name} drawer busy={busy} onClose={() => setReviewStudent(null)}><div className="ws-drawer-student"><StudentAvatar student={reviewStudent}/><div><span className="ws-small">{t("teacher.studentNumber", {number: reviewStudent.number})}</span><h3>{detail?.assignment.title}</h3><SubmissionTypeBadge value={detail?.assignment.submissionType}/><span className={`ws-status ws-status-${statusOf(reviewStudent)}`}>{t(`common.${statusOf(reviewStudent)}`)}</span></div></div>{!submission ? <div className="ws-empty"><BookOpen size={31}/><p>{t("teacher.noSubmission")}</p></div> : <><span className="ws-small">{t("teacher.attempt", {count: submission.attemptNumber || 1})}</span><section className="ws-submitted-note"><h3>{t("teacher.studentText")}</h3><p>{submission.text || t("teacher.noText")}</p></section>{submission.uploads?.length > 0 && <section className="ws-review-files"><h3>{t("teacher.attachments")}</h3>{submission.uploads.map(upload => <div key={upload.id} className="ws-review-attachment">{upload.url && ["image/jpeg", "image/png", "image/webp"].includes(upload.contentType) && <a href={upload.url} target="_blank" rel="noopener noreferrer" aria-label={t("common.openFile", {name: upload.fileName})}><img src={upload.thumbnailUrl || upload.url} alt={upload.fileName} loading="lazy" decoding="async" onLoad={() => countUsageOnce("imageView", upload.id)}/></a>}{upload.url && videoSubmissionMimeTypes.includes(upload.contentType as (typeof videoSubmissionMimeTypes)[number]) && <video className="td-review-video" src={upload.url} poster={upload.thumbnailUrl} controls playsInline preload="none" aria-label={upload.fileName} onPlay={() => countUsageOnce("videoPlay", upload.id)}>{t("teacher.videoPreviewUnavailable")}</video>}{upload.url ? <a className="ws-file-link" href={upload.url} target="_blank" rel="noopener noreferrer"><Paperclip size={17}/><span>{upload.fileName}</span><ArrowRight size={16}/></a> : <div className="ws-file-link"><Paperclip size={17}/><span>{upload.fileName}<small>{t("teacher.unavailableFile")}</small></span></div>}</div>)}</section>}<label className="ws-field"><span><MessageCircleHeart size={17}/>{t("teacher.feedbackLabel")}</span><textarea rows={5} value={feedback} maxLength={5000} onChange={event => setFeedback(event.target.value)} placeholder={t("teacher.feedbackPlaceholder")} disabled={busy || detailHidden}/></label>{formError && <p className="ws-form-error" role="alert">{formError}</p>}{staleReview && <button className="ws-button ws-button-light" onClick={() => void reloadSubmission()} disabled={busy}><RefreshCw size={16}/>{t("common.refresh")}</button>}{detailHidden && <p className="av-readonly-note">{t("teacher.hiddenReadonly")}</p>}<div className="ws-review-actions"><button className="ws-button ws-button-primary" onClick={() => void review("done")} disabled={busy || staleReview || detailHidden}>{busy ? <LoaderCircle className="ws-spin" size={18}/> : <CheckCircle2 size={18}/>} {t("teacher.approve")}</button><button className="ws-button ws-button-light" onClick={() => void review("revision")} disabled={busy || staleReview || detailHidden}><RefreshCw size={16}/>{t("teacher.requestRevision")}</button></div></>}</Modal>}
    {visibilityRequest && <Modal title={t(visibilityRequest.action === "hide" ? "teacher.hideConfirmTitle" : "teacher.restoreConfirmTitle", {count: visibilityRequest.tasks.length})} busy={visibilityBusy} onClose={() => setVisibilityRequest(null)}>
      <p className="av-confirm-description">{t(visibilityRequest.action === "hide" ? "teacher.hideConfirmDescription" : "teacher.restoreConfirmDescription")}</p>
      <ul className="av-confirm-tasks">{visibilityRequest.tasks.map(task => <li key={task.id}><strong>{task.title}</strong><small>{date(task.dueAt)}</small></li>)}</ul>
      {visibilityRequest.action === "hide" && visibilityRequest.tasks.some(task => task.targetCount > (task.submittedCount || 0)) && <p className="av-confirm-warning">{t("teacher.hideMissingWarning", {count: visibilityRequest.tasks.reduce((sum, task) => sum + Math.max(0, task.targetCount - (task.submittedCount || 0)), 0)})}</p>}
      {visibilityError && <p className="ws-form-error" role="alert">{visibilityError}</p>}
      <div className="ws-form-actions"><button type="button" className="ws-button ws-button-light" disabled={visibilityBusy} onClick={() => setVisibilityRequest(null)}>{t("common.cancel")}</button><button type="button" className="ws-button ws-button-primary" disabled={visibilityBusy || !!visibilityError} onClick={() => void changeVisibility()}>{visibilityBusy ? <LoaderCircle className="ws-spin" size={17}/> : visibilityRequest.action === "hide" ? <EyeOff size={17}/> : <Eye size={17}/>} {t(visibilityBusy ? "common.saving" : visibilityRequest.action === "hide" ? "teacher.hideAssignment" : "teacher.restoreAssignment")}</button></div>
    </Modal>}
    <div className="ws-kind-footer"><Heart size={14}/>{t("teacher.eyebrow")}</div>
  </div>;
}

function StudentAvatar({student}: {student: Student}) {
  return <CharacterAvatar className="ws-student-avatar" character={student.character} outfit={student.wardrobeOutfit} imageSrc={student.spaceCompanion?.art} spaceOutfit={student.spaceCompanion?.outfit} pose={student.spaceCompanion?.pose}/>;
}
