"use client";

import {useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode} from "react";
import {useLocale, useTranslations} from "next-intl";
import {uploadBytesResumable, ref as storageRef} from "firebase/storage";
import {ArrowRight, BookOpen, Camera, Check, CheckCircle2, Clock3, Flower2, Heart, LoaderCircle, MessageCircleHeart, Paperclip, RefreshCw, Send, Sparkles, X} from "lucide-react";
import {storage} from "@/lib/firebase-client";

type Character = "cat" | "dog" | "hamster" | "alpaca" | "rabbit";
type Status = "pending" | "submitted" | "done" | "revision";
type Upload = {id: string; fileName: string; contentType: string; url?: string; size: number};
type Submission = {id: string; text: string; uploads: Upload[]; feedback?: string; status: Status};
type Assignment = {id: string; title: string; description: string; dueAt?: string | null; status: Status; submission?: Submission};
type Home = {profile: {id: string; name: string; number: number; classId: string; className: string; character: Character; xp: number}; assignments: Assignment[]};
const friends: {id: Character; file: string}[] = [
  {id: "cat", file: "cat-mochi"}, {id: "dog", file: "dog-dubu"}, {id: "hamster", file: "hamster-kong"}, {id: "alpaca", file: "alpaca-cloud"}, {id: "rabbit", file: "rabbit-tori"}
];
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf", "video/mp4", "video/webm", "video/quicktime"]);
const fileTypes: Record<string, string> = {jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", pdf: "application/pdf", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime"};
function contentType(file: File) {return file.type || fileTypes[file.name.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream";}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {...init, headers: {"Content-Type": "application/json", ...init?.headers}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code || "request_failed");
  return body as T;
}

function TaskDialog({title, children, onClose, busy}: {title: string; children: ReactNode; onClose: () => void; busy: boolean}) {
  const t = useTranslations("product");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {dialog.current?.showModal();}, []);
  return <dialog className="ws-dialog ws-student-dialog" ref={dialog} aria-labelledby="student-dialog-title" onCancel={event => {event.preventDefault(); if (!busy) onClose();}}>
    <div className="ws-dialog-head"><h2 id="student-dialog-title">{title}</h2><button className="ws-icon-btn" aria-label={t("common.close")} onClick={onClose} disabled={busy}><X size={21}/></button></div>{children}
  </dialog>;
}

export default function StudentWorkspace() {
  const t = useTranslations("product");
  const locale = useLocale();
  const [home, setHome] = useState<Home | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [changingFriend, setChangingFriend] = useState(false);
  const [formError, setFormError] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadCache = useRef<Map<File, string>>(new Map());

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    setError("");
    try {setHome(await request<Home>("/api/student/home"));}
    catch {setError(t("common.networkError"));}
    finally {setLoading(false);}
  }, [t]);
  useEffect(() => {void load(true);}, [load]);
  useEffect(() => {
    const urls = files.map(file => ["image/jpeg", "image/png", "image/webp"].includes(contentType(file)) ? URL.createObjectURL(file) : "");
    setPreviews(urls);
    return () => urls.forEach(url => {if (url) URL.revokeObjectURL(url);});
  }, [files]);
  useEffect(() => {
    if (!celebrate) return;
    const timer = setTimeout(() => setCelebrate(false), 1400);
    return () => clearTimeout(timer);
  }, [celebrate]);

  const selected = home?.assignments.find(assignment => assignment.id === selectedId);
  const character = friends.find(friend => friend.id === home?.profile.character) || friends[0];
  const xp = Math.max(0, home?.profile.xp || 0);
  const flowers = Math.floor(xp / 10);
  const canSubmit = selected?.status === "pending" || selected?.status === "revision";
  const date = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? t("common.due", {date: new Intl.DateTimeFormat(locale, {month: "short", day: "numeric"}).format(new Date(value))}) : t("common.noDue");

  function openTask(assignment: Assignment) {
    setSelectedId(assignment.id); setMessage(""); setFiles([]); setFormError(""); setProgress(0); uploadCache.current.clear();
  }
  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    if (files.length + incoming.length > 10) {setFormError(t("student.tooManyFiles")); return;}
    const selectedFiles = Array.from(incoming);
    if (selectedFiles.some(file => !allowedTypes.has(contentType(file)))) {setFormError(t("student.unsupportedFile")); return;}
    if (selectedFiles.some(file => file.size === 0)) {setFormError(t("student.emptyFile")); return;}
    if (selectedFiles.some(file => file.size > (contentType(file).startsWith("video/") ? 250 : 100) * 1024 * 1024)) {setFormError(t("student.fileTooLarge")); return;}
    setFiles(previous => [...previous, ...selectedFiles]); setFormError("");
  }
  async function chooseFriend(id: Character) {
    if (!home || changingFriend || home.profile.character === id) return;
    setChangingFriend(true); setError("");
    try {
      const response = await request<{profile: Home["profile"]}>("/api/student/character", {method: "POST", body: JSON.stringify({character: id})});
      setHome(previous => previous ? {...previous, profile: {...previous.profile, ...response.profile, character: id}} : previous);
      setNotice(t("student.friendSelected", {name: t(`characters.${id}`)}));
    } catch {setError(t("common.error"));} finally {setChangingFriend(false);}
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || sending) return;
    if (!message.trim() && !files.length) {setFormError(t("student.emptySubmission")); return;}
    setSending(true); setFormError(""); setProgress(0);
    try {
      const uploadIds: string[] = [];
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const cached = uploadCache.current.get(file);
        if (cached) {uploadIds.push(cached); setProgress(Math.round(((index + 1) / files.length) * 100)); continue;}
        if (!storage) throw new Error("not_configured");
        const upload = await request<{uploadId: string; path: string}>("/api/uploads/init", {method: "POST", body: JSON.stringify({assignmentId: selected.id, fileName: file.name, contentType: contentType(file), size: file.size})});
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(storageRef(storage, upload.path), file, {contentType: contentType(file)});
          task.on("state_changed", snapshot => setProgress(Math.round(((index + snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes)) / files.length) * 100)), reject, () => resolve());
        });
        uploadCache.current.set(file, upload.uploadId); uploadIds.push(upload.uploadId);
      }
      const result = await request<{submission: Submission}>("/api/submissions/finalize", {method: "POST", body: JSON.stringify({assignmentId: selected.id, text: message.trim(), uploadIds})});
      setHome(previous => previous ? {...previous, assignments: previous.assignments.map(assignment => assignment.id === selected.id ? {...assignment, status: result.submission.status, submission: result.submission} : assignment)} : previous);
      setSelectedId(null); setFiles([]); setMessage(""); uploadCache.current.clear();
      setNotice(t("student.sendSuccess")); setCelebrate(true);
      void load();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (["UPLOAD_INVALID", "UPLOAD_USED", "UPLOAD_MISMATCH"].includes(code)) {
        // Expired or consumed upload IDs cannot be finalized again. Keep the
        // selected files, but create fresh uploads on the next attempt.
        uploadCache.current.clear();
        setFormError(t("student.uploadRetry"));
      } else {
        setFormError(t(code === "not_configured" ? "student.notConfigured" : code === "FILE_SIZE" ? "student.fileTooLarge" : code === "FILE_TYPE" ? "student.unsupportedFile" : code === "UPLOAD_INCOMPLETE" ? "student.uploadIncomplete" : "common.error"));
      }
    } finally {setSending(false);}
  }

  if (loading) return <section className="ws-loading" role="status"><img src="/characters/cat-mochi.webp" alt=""/><LoaderCircle className="ws-spin" size={23}/><p>{t("common.loading")}</p></section>;
  if (!home) return <section className="ws-empty"><BookOpen size={34}/><p role="alert">{error || t("common.error")}</p><button className="ws-button" onClick={() => void load(true)}><RefreshCw size={17}/>{t("common.retry")}</button></section>;
  return <div className="ws ws-student">
    {error && <div className="ws-alert" role="alert">{error}<button onClick={() => void load()}>{t("common.retry")}</button></div>}
    <section className="ws-kids-hero">
      <div className="ws-hero-copy"><span className="ws-eyebrow"><Heart size={14}/>{t("student.greeting", {name: home.profile.name})}</span><h1>{t("student.heroTitle")}</h1><p>{t("student.heroSubtitle")}</p><span className="ws-class-pill"><BookOpen size={14}/>{home.profile.className || t("student.classroom")}</span></div>
      <div className={`ws-hero-friends ${celebrate ? "is-celebrating" : ""}`}><Sparkles className="ws-hero-sparkle" size={32}/><img className="ws-secondary-friend" src={`/characters/${friends[(friends.indexOf(character) + 1) % friends.length].file}.webp`} alt=""/><img className="ws-primary-friend" src={`/characters/${character.file}.webp`} alt={t("common.characterAlt", {name: t(`characters.${character.id}`)})}/><Flower2 className="ws-hero-flower" size={38}/><span className="ws-buddy-name">{t("student.buddyLabel")} · {t(`characters.${character.id}`)}</span></div>
    </section>
    <div className="ws-student-notice" role="status" aria-live="polite">{notice && <><CheckCircle2 size={18}/>{notice}</>}</div>
    <section className="ws-tasks-section" aria-labelledby="tasks-heading"><div className="ws-section-heading"><div><span className="ws-eyebrow">{t("student.tasksSubtitle")}</span><h2 id="tasks-heading">{t("student.tasksTitle")}</h2></div><div className="ws-row"><span className="ws-count-pill">{t("student.tasksCount", {count: home.assignments.filter(assignment => assignment.status === "pending" || assignment.status === "revision").length})}</span><button className="ws-icon-btn" onClick={() => void load()} aria-label={t("common.refresh")}><RefreshCw size={17}/></button></div></div>
      {!home.assignments.length ? <div className="ws-empty ws-student-empty"><img src={`/characters/${character.file}.webp`} alt=""/><h3>{t("student.noTasksTitle")}</h3><p>{t("student.noTasksBody")}</p></div> : <div className="ws-task-grid">{home.assignments.map(assignment => <article className={`ws-task-card ws-task-${assignment.status}`} key={assignment.id}><div className="ws-task-top"><span className={`ws-status ws-status-${assignment.status}`}>{assignment.status === "done" ? <CheckCircle2 size={14}/> : assignment.status === "submitted" ? <Clock3 size={14}/> : <BookOpen size={14}/>}{t(`common.${assignment.status}`)}</span><span className="ws-task-flower"><Flower2 size={21}/></span></div><h3>{assignment.title}</h3><p className="ws-task-description">{assignment.description}</p><span className="ws-small ws-task-due">{date(assignment.dueAt)}</span><button className="ws-task-button" onClick={() => openTask(assignment)}>{t(assignment.status === "done" ? "student.viewFeedback" : assignment.status === "submitted" ? "student.viewSent" : assignment.status === "revision" ? "student.revisionAction" : "student.taskAction")}<ArrowRight size={17}/></button></article>)}</div>}
    </section>
    <section className="ws-friends-section" aria-labelledby="friends-heading"><div className="ws-friends-copy"><h2 id="friends-heading">{t("student.pickFriend")}</h2><p>{t("student.pickHint")}</p></div><div className="ws-friend-picker" aria-busy={changingFriend}>{friends.map(friend => <button key={friend.id} className="ws-friend" onClick={() => void chooseFriend(friend.id)} aria-pressed={character.id === friend.id} disabled={changingFriend} aria-label={`${t(`characters.${friend.id}`)} · ${t(`characters.${friend.id}Species`)}`}><img src={`/characters/${friend.file}.webp`} alt=""/><strong>{t(`characters.${friend.id}`)}</strong><span>{t(`characters.${friend.id}Species`)}</span>{character.id === friend.id && <Check className="ws-friend-check" size={13}/>}</button>)}</div></section>
    <section className="ws-growth-strip" aria-label={t("student.growth")}><div className="ws-growth-icon"><Flower2 size={27}/></div><div className="ws-growth-copy"><strong>{t("student.growth")}</strong><span>{t("student.growthHint")}</span></div><div className="ws-growth-right"><div className="ws-flower-stamps" aria-label={t("student.growthPoints", {points: xp})}>{[0,1,2,3,4].map(index => <Flower2 key={index} size={25} className={index < flowers % 5 || flowers >= 5 && flowers % 5 === 0 ? "is-earned" : ""}/>)}</div><span>{t("student.growthPoints", {points: xp})}</span></div></section>
    <div className="ws-kind-footer"><Heart size={14}/>{t("student.tasksSubtitle")}</div>
    {selected && <TaskDialog title={selected.title} onClose={() => setSelectedId(null)} busy={sending}>
      <div className="ws-dialog-body"><div className="ws-task-detail-meta"><span className={`ws-status ws-status-${selected.status}`}>{t(`common.${selected.status}`)}</span><span className="ws-small">{date(selected.dueAt)}</span></div><div className="ws-instructions"><h3>{t("student.taskDescription")}</h3><p>{selected.description}</p></div>
        {selected.submission?.feedback && <div className="ws-feedback"><h3><MessageCircleHeart size={19}/>{t("student.teacherSays")}</h3><p>{selected.submission.feedback}</p></div>}
        {!canSubmit ? <><div className="ws-result-buddy"><img src={`/characters/${character.file}.webp`} alt=""/><p>{t(selected.status === "done" ? "student.doneMessage" : "student.waiting")}</p></div>{selected.submission?.text && <div className="ws-submitted-note"><h3>{t("student.submittedText")}</h3><p>{selected.submission.text}</p></div>}{Boolean(selected.submission?.uploads?.length) && <div className="ws-submitted-files"><h3>{t("student.submittedFiles")}</h3>{selected.submission?.uploads.map(upload => upload.url ? <a className="ws-file-link" href={upload.url} target="_blank" rel="noopener noreferrer" key={upload.id}><Paperclip size={17}/><span>{upload.fileName}</span><ArrowRight size={16}/></a> : <div className="ws-file-link" key={upload.id}><Paperclip size={17}/><span>{upload.fileName}</span></div>)}</div>}</> : <form onSubmit={submit}>
          {selected.status === "revision" && <p className="ws-encouragement">{t("student.revisionMessage")}</p>}
          <div className="ws-upload-zone"><h3>{t("student.attachHeading")}</h3><p>{t("student.attachHint")}</p><small className="ws-upload-limits">{t("student.uploadLimits")}</small><div className="ws-upload-actions"><button type="button" className="ws-button ws-button-light" onClick={() => photoInput.current?.click()} disabled={sending}><Camera size={20}/>{t("student.camera")}</button><button type="button" className="ws-button ws-button-light" onClick={() => fileInput.current?.click()} disabled={sending}><Paperclip size={19}/>{t("student.chooseFiles")}</button></div><input ref={photoInput} type="file" accept="image/*" capture="environment" className="ws-visually-hidden" tabIndex={-1} onChange={event => {addFiles(event.target.files); event.target.value = "";}}/><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,video/mp4,video/webm,video/quicktime,.heic,.heif,.mov" multiple className="ws-visually-hidden" tabIndex={-1} onChange={event => {addFiles(event.target.files); event.target.value = "";}}/></div>
          {files.length > 0 && <div className="ws-file-previews">{files.map((file, index) => <div className="ws-file-preview" key={`${file.name}-${index}`}>{previews[index] ? <img src={previews[index]} alt=""/> : <Paperclip size={23}/>}<span>{file.name}</span><button type="button" className="ws-icon-btn" aria-label={t("student.removeFile", {name: file.name})} disabled={sending} onClick={() => setFiles(previous => previous.filter((_, item) => item !== index))}><X size={16}/></button></div>)}</div>}
          <label className="ws-field"><span>{t("student.messageLabel")}</span><textarea value={message} onChange={event => setMessage(event.target.value)} placeholder={t("student.messagePlaceholder")} rows={3} maxLength={10000} disabled={sending}/></label>
          {formError && <p className="ws-form-error" role="alert">{formError}</p>}
          {sending && <div className="ws-upload-progress" role="status"><span>{files.length ? t("student.uploading", {progress}) : t("student.sending")}</span><progress max="100" value={progress}/></div>}
          <button type="submit" className="ws-button ws-button-primary ws-send-button" disabled={sending}>{sending ? <LoaderCircle size={21} className="ws-spin"/> : <Send size={21}/>} {t(sending ? "student.sending" : "student.sendAction")}</button><p className="ws-upload-footnote">{t(sending ? "student.keepOpen" : "student.submissionSafe")}</p>
        </form>}
      </div>
    </TaskDialog>}
  </div>;
}
