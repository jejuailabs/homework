"use client";

import {useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode} from "react";
import Link from "next/link";
import {useLocale, useTranslations} from "next-intl";
import {sendUpload, discardUpload, type UploadTransfer} from "@/lib/upload-transfer";
import {ArrowRight, BookOpen, Camera, Check, CheckCircle2, Clock3, Cloud, Flower2, Heart, Images, LoaderCircle, MessageCircleHeart, Palette, PanelsTopLeft, Paperclip, PencilLine, RefreshCw, Send, Sparkles, Star, Video, X} from "lucide-react";
import {characterCatalog as friends, type Character} from "@/lib/characters";
import {acceptsSubmissionFile, assignmentSubmissionType, imageSubmissionMimeTypes, videoSubmissionMimeTypes, type AssignmentSubmissionType} from "@/lib/assignment-submission";
import type {PointSettings, WardrobeOutfit} from "@/lib/points-types";
import {usePointSync} from "@/lib/use-point-sync";
import CharacterAvatar from "./character-avatar";
import {petPersonality} from "@/modules/my-space/personality";
import {AssignmentMaterials} from "./assignment-materials";
import VideoSubmissionStatus from './video-submission-status';
import {videoSelectionError,type VideoJobView} from '@/lib/video-submission';
import {compressImage} from "@/lib/image-compression";
import {countUsage, countUsageOnce} from "@/lib/usage-beacon";
import {compressionCounter} from "@/lib/usage-events";
import type {AssignmentMaterial} from "@/lib/assignment-materials";

type Status = "pending" | "submitted" | "done" | "revision";
type Upload = {id: string; fileName: string; contentType: string; url?: string; thumbnailUrl?:string; size: number};
type Submission = {id: string; text: string; uploads: Upload[]; feedback?: string; status: Status};
type Assignment = {materials?: AssignmentMaterial[]; id: string; title: string; description: string; dueAt?: string | null; status: Status; submissionType?: AssignmentSubmissionType; submission?: Submission;videoJob?:VideoJobView|null};
type Home = {profile: {id: string; name: string; number: number; classId: string; className: string; character: Character; xp: number; points?: number; pointSettings?: PointSettings; wardrobeOutfit?: WardrobeOutfit; mySpaceEnabled?:boolean;spaceCompanion?:{pet:string;art:string;name:string;outfit:Partial<Record<'body'|'bag',string>>}}; assignments: Assignment[]};
const fileTypes: Record<string, string> = {jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", pdf: "application/pdf", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime"};
function contentType(file: File) {return file.type || fileTypes[file.name.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream";}

function SubmissionTypeBadge({type}: {type: AssignmentSubmissionType}) {
  const t = useTranslations("product");
  return <span className={`sd-submission-type sd-submission-type-${type}`} aria-label={`${t("student.typeLabel")}: ${t(`submissionTypes.${type}`)}`}>{type === "text" ? <PencilLine size={14}/> : type === "image" ? <Images size={14}/> : type === "video" ? <Video size={14}/> : <Paperclip size={14}/>}<span>{t(`submissionTypes.${type}`)}</span></span>;
}

function VideoPreview({url, name,poster,usageId}: {url: string; name: string;poster?:string;usageId?:string}) {
  const t = useTranslations("product");
  const [failed, setFailed] = useState(false);
  useEffect(() => {setFailed(false);}, [url]);
  return <div className="sd-video-preview"><video src={url} poster={poster} controls playsInline preload="metadata" aria-label={name} onPlay={() => {if (usageId) countUsageOnce("videoPlay", usageId);}} onError={() => setFailed(true)}/>{failed && <p className="ws-small" role="status">{t("student.videoPreviewUnavailable")}</p>}</div>;
}

function SubmittedImage({upload, onRefresh}: {upload: Upload; onRefresh: () => Promise<void>}) {
  const t = useTranslations("product");
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {setFailed(false);}, [upload.url]);
  async function retry() {
    setRefreshing(true);
    try {await onRefresh(); setFailed(false); setAttempt(value => value + 1);}
    finally {setRefreshing(false);}
  }
  return <>{upload.url && !failed && <a className="sd-submitted-image" href={upload.url} target="_blank" rel="noopener noreferrer" aria-label={t("common.openFile", {name: upload.fileName})}><img key={`${upload.url}-${attempt}`} src={upload.url} alt={upload.fileName} decoding="async" onLoad={() => countUsageOnce("imageView", upload.id)} onError={() => setFailed(true)}/><span><Images size={15}/>{t("student.enlargeImage")}<ArrowRight size={15}/></span></a>}{(!upload.url || failed) && <div className="sd-image-unavailable"><Images size={26}/><p>{t("student.imagePreviewUnavailable")}</p><button className="ws-button ws-button-light" type="button" disabled={refreshing} onClick={() => void retry()}>{refreshing ? <LoaderCircle size={16} className="ws-spin"/> : <RefreshCw size={16}/>} {t("student.reloadImage")}</button></div>}</>;
}

function SubmittedFiles({uploads, revision, onRefresh}: {uploads: Upload[]; revision: boolean; onRefresh: () => Promise<void>}) {
  const t = useTranslations("product");
  if (!uploads.length) return null;
  return <section className="ws-submitted-files sd-sent-files"><h3>{t(revision ? "student.previousFiles" : "student.submittedFiles", {count: uploads.length})}</h3>{uploads.map(upload => <div className="sd-submitted-attachment" key={upload.id}>
    {imageSubmissionMimeTypes.includes(upload.contentType as (typeof imageSubmissionMimeTypes)[number]) ? <SubmittedImage upload={upload} onRefresh={onRefresh}/> : upload.url && upload.contentType.startsWith("video/") ? <VideoPreview url={upload.url} name={upload.fileName} poster={upload.thumbnailUrl} usageId={upload.id}/> : null}
    {upload.url ? <a className="ws-file-link" href={upload.url} target="_blank" rel="noopener noreferrer"><Paperclip size={17}/><span>{upload.fileName}</span><ArrowRight size={16}/></a> : <div className="ws-file-link"><Paperclip size={17}/><span>{upload.fileName}</span></div>}
  </div>)}</section>;
}

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
  const common = useTranslations("common");
  const exhibition = useTranslations("exhibition");
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
  const [preparing, setPreparing] = useState<{current: number; total: number} | null>(null);
  const [videoHandoff,setVideoHandoff]=useState(false),[selectingVideo,setSelectingVideo]=useState(false);
  const [changingFriend, setChangingFriend] = useState(false);
  const [formError, setFormError] = useState("");
  // Shown right under the upload button: on a phone the form-level error sits below the fold.
  const [pickError, setPickError] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadCache = useRef<Map<File, string>>(new Map());
  // Keyed by the chosen original so a retry re-sends the same resized photo instead of re-encoding it.
  const resizedImages = useRef(new WeakMap<File, File>());
  const uploadKeys = useRef(new WeakMap<File,string>()), stagedUploads = useRef(new Set<string>()), transferAbort = useRef<AbortController|null>(null), sendingRef = useRef(false);
  useEffect(()=>()=>{transferAbort.current?.abort(); stagedUploads.current.forEach(uploadId=>{void discardUpload(`/api/uploads/${uploadId}`).catch(()=>{});});},[]);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    setError("");
    try {setHome(await request<Home>("/api/student/home"));}
    catch {setError(t("common.networkError"));}
    finally {setLoading(false);}
  }, [t]);
  useEffect(() => {void load(true);}, [load]);
  const processingVideos=home?.assignments.some(task=>task.videoJob&&(['queued','processing'].includes(task.videoJob.status)||(task.videoJob.status==='failed'&&task.videoJob.retryable)));
  const observedComplete=useRef(new Set<string>());
  useEffect(()=>{if(!processingVideos)return;let active=true;const poll=async()=>{if(document.visibilityState!=='visible')return;try{const result=await request<{videoJobs:VideoJobView[]}>('/api/video-submissions');if(!active)return;const jobs=new Map(result.videoJobs.map(job=>[job.assignmentId,job]));setHome(previous=>previous?{...previous,assignments:previous.assignments.map(task=>({...task,videoJob:jobs.get(task.id)||task.videoJob}))}:previous);if(result.videoJobs.some(job=>job.status==='complete'&&!observedComplete.current.has(job.id))){result.videoJobs.filter(job=>job.status==='complete').forEach(job=>observedComplete.current.add(job.id));void load();}}catch{/* Keep the last durable state; the next poll can reconnect. */}};const timer=setInterval(()=>void poll(),4000),resume=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',resume);return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',resume);};},[processingVideos,load]);
  usePointSync(value => setHome(current => current ? {...current, profile: {...current.profile, points: value.points, pointSettings: value.settings}} : current), !!home);
  useEffect(() => {
    const urls = files.map(file => ["image/jpeg", "image/png", "image/webp"].includes(contentType(file)) || contentType(file).startsWith("video/") ? URL.createObjectURL(file) : "");
    setPreviews(urls);
    return () => urls.forEach(url => {if (url) URL.revokeObjectURL(url);});
  }, [files]);
  useEffect(() => {
    if (!celebrate) return;
    const timer = setTimeout(() => setCelebrate(false), 1400);
    return () => clearTimeout(timer);
  }, [celebrate]);

  const selected = home?.assignments.find(assignment => assignment.id === selectedId);
  const submissionType = assignmentSubmissionType(selected?.submissionType);
  const imageAccept = [...imageSubmissionMimeTypes, ".heic", ".heif"].join(",");
  const videoAccept = [...videoSubmissionMimeTypes, ".mov"].join(",");
  const uploadAccept = submissionType === "video" ? videoAccept : submissionType === "image" ? imageAccept : `${imageAccept},application/pdf,${videoAccept}`;
  const character = friends.find(friend => friend.id === home?.profile.character) || friends[0];
  const companions = [1, 2].map(offset => friends[(friends.indexOf(character) + offset) % friends.length]);
  const nextTask = home?.assignments.find(assignment => assignment.status === "pending" || assignment.status === "revision");
  const xp = Math.max(0, home?.profile.xp || 0);
  const flowers = Math.floor(xp / 10);
  const videoBlocked=!!selected?.videoJob&&(['queued','processing'].includes(selected.videoJob.status)||(selected.videoJob.status==='failed'&&selected.videoJob.retryable));
  const canSubmit = (selected?.status === "pending" || selected?.status === "revision")&&!videoBlocked;
  const hasRequiredContent = submissionType === "text" ? Boolean(message.trim()) : submissionType === "image" || submissionType === "video" ? files.length > 0 : Boolean(message.trim() || files.length);
  const date = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? t("common.due", {date: new Intl.DateTimeFormat(locale, {month: "short", day: "numeric"}).format(new Date(value))}) : t("common.noDue");

  function openTask(assignment: Assignment) {
    setSelectedId(assignment.id); setMessage(assignment.status === "revision" ? assignment.submission?.text || "" : ""); setFiles([]); setFormError(""); setPickError(""); setProgress(0); uploadCache.current.clear();
  }
  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    if(submissionType==='video'){
      const chosen=Array.from(incoming);const reason=videoSelectionError([...files,...chosen].map(file=>({type:contentType(file),size:file.size})));
      if(reason){if(reason==='FILE_SIZE')countUsage('videoRejectSize');setPickError(t(reason==='VIDEO_COUNT'?'student.videoOneOnly':reason==='FILE_SIZE'?'student.fileTooLarge':'student.wrongSubmissionType'));return;}
      setSelectingVideo(true);setPickError('');setFormError('');
      const candidate=chosen[0],url=URL.createObjectURL(candidate),video=document.createElement('video');video.preload='metadata';
      let finished=false;
      const finish=(duration?:number)=>{if(finished)return;finished=true;clearTimeout(timer);video.onloadedmetadata=null;video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);setSelectingVideo(false);if(videoSelectionError([{type:contentType(candidate),size:candidate.size}],duration)==='VIDEO_DURATION'){countUsage('videoRejectDuration');setPickError(t('student.videoTooLong'));}else setFiles([candidate]);};
      const timer=setTimeout(()=>finish(),10000);video.onloadedmetadata=()=>finish(Number.isFinite(video.duration)?video.duration:undefined);video.onerror=()=>finish();video.src=url;return;
    }
    if (files.length + incoming.length > 10) {setPickError(t("student.tooManyFiles")); return;}
    const selectedFiles = Array.from(incoming);
    if (selectedFiles.some(file => !acceptsSubmissionFile(submissionType, contentType(file)))) {setPickError(t(submissionType === "legacy" ? "student.unsupportedFile" : "student.wrongSubmissionType")); return;}
    if (selectedFiles.some(file => file.size === 0)) {setPickError(t("student.emptyFile")); return;}
    if (selectedFiles.some(file => file.size > (contentType(file).startsWith("video/") ? 250 : 100) * 1024 * 1024)) {if (selectedFiles.some(file => contentType(file).startsWith("image/") && file.size > 100 * 1024 * 1024)) countUsage("imageRejectSize"); setPickError(t("student.fileTooLarge")); return;}
    setFiles(previous => [...previous, ...selectedFiles]); setPickError("");
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
    if (!selected || sendingRef.current) return;
    if (!hasRequiredContent) {setFormError(t(submissionType === "text" ? "student.requiredText" : submissionType === "image" ? "student.requiredImage" : submissionType === "video" ? "student.requiredVideo" : "student.emptySubmission")); return;}
    if (files.some(file => !acceptsSubmissionFile(submissionType, contentType(file)))) {setFormError(t("student.wrongSubmissionType")); return;}
    sendingRef.current=true;setSending(true);setVideoHandoff(false); setFormError(""); setPickError(""); setProgress(0);
    try {
      const uploadIds: string[] = [];
      const images = files.filter(file => contentType(file).startsWith("image/"));
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const cached = uploadCache.current.get(file);
        if (cached) {uploadIds.push(cached); setProgress(Math.round(((index + 1) / files.length) * 100)); continue;}
        // One photo at a time, just before its upload: a low-end phone never holds
        // more than one decoded photo, and a slow resize falls back to the original.
        let outgoing = resizedImages.current.get(file) ?? file;
        if (outgoing === file && contentType(file).startsWith("image/")) {
          setPreparing({current: images.indexOf(file) + 1, total: images.length});
          const result = await compressImage(file, contentType(file));
          outgoing = result.file; resizedImages.current.set(file, outgoing); setPreparing(null);
          countUsage(compressionCounter[result.reason]); countUsage("imageBytesIn", file.size); countUsage("imageBytesOut", outgoing.size);
          if (!["small", "unsupported", "too-large"].includes(result.reason)) countUsage("imageCompressMs", result.ms);
        }
        const requestId = uploadKeys.current.get(file) || crypto.randomUUID(); uploadKeys.current.set(file,requestId);
        const upload = await request<UploadTransfer>("/api/uploads/init", {method:"POST",body:JSON.stringify({requestId,assignmentId:selected.id,fileName:outgoing.name,contentType:contentType(outgoing),size:outgoing.size})});
        stagedUploads.current.add(upload.uploadId);
        const controller=new AbortController();transferAbort.current=controller;
        await sendUpload(upload,outgoing,fraction=>setProgress(Math.round((index+fraction)/files.length*100)),controller.signal);
        uploadCache.current.set(file, upload.uploadId); uploadIds.push(upload.uploadId);
      }
      if(submissionType==='video')setVideoHandoff(true);
      const result = await request<{submission: Submission;videoJob?:VideoJobView}>("/api/submissions/finalize", {method: "POST", body: JSON.stringify({assignmentId: selected.id, text: message.trim(), uploadIds})});
      if(result.videoJob){stagedUploads.current.clear();uploadCache.current.clear();setFiles([]);setMessage('');setHome(previous=>previous?{...previous,assignments:previous.assignments.map(task=>task.id===selected.id?{...task,videoJob:result.videoJob}:task)}:previous);void load();return;}
      setHome(previous => previous ? {...previous, assignments: previous.assignments.map(assignment => assignment.id === selected.id ? {...assignment, status: result.submission.status, submission: result.submission} : assignment)} : previous);
      stagedUploads.current.clear();setSelectedId(null); setFiles([]); setMessage(""); uploadCache.current.clear();
      setNotice(t("student.sendSuccess")); setCelebrate(true);
      void load();
    } catch (cause) {
      if(submissionType==='video'){try{const fresh=await request<Home>('/api/student/home');setHome(fresh);const job=fresh.assignments.find(task=>task.id===selected.id)?.videoJob;if(job&&['queued','processing','complete'].includes(job.status)){stagedUploads.current.clear();uploadCache.current.clear();setFiles([]);return;}}catch{}}
      await Promise.allSettled([...stagedUploads.current].map(uploadId=>discardUpload(`/api/uploads/${uploadId}`)));stagedUploads.current.clear();uploadCache.current.clear();
      const code = cause instanceof Error ? cause.message : "";
      if(code==='VIDEO_NOT_CONFIGURED'||code==='VIDEO_ALREADY_PROCESSING'||code==='VIDEO_COUNT'){setFormError(t(code==='VIDEO_COUNT'?'student.videoOneOnly':code==='VIDEO_NOT_CONFIGURED'?'student.videoUnavailable':'student.videoPreparing'));return;}
      if (["UPLOAD_INVALID", "UPLOAD_USED", "UPLOAD_MISMATCH"].includes(code)) {
        // Expired or consumed upload IDs cannot be finalized again. Keep the
        // selected files, but create fresh uploads on the next attempt.
        uploadCache.current.clear();
        setFormError(t("student.uploadRetry"));
      } else if (code === "SUBMISSION_CONTENT") {
        setFormError(t(submissionType === "text" ? "student.requiredText" : submissionType === "image" ? "student.requiredImage" : submissionType === "video" ? "student.requiredVideo" : "student.emptySubmission"));
      } else if (code === "SUBMISSION_FILE_TYPE") {
        setFormError(t("student.wrongSubmissionType"));
      } else {
        setFormError(t(["UPLOAD_NETWORK","UPLOAD_TIMEOUT"].includes(code) ? (submissionType==="video"?"student.videoTransferFailed":"student.uploadNetwork") : ["UNAUTHENTICATED","CODE_RESET"].includes(code) ? "student.uploadSignIn" : code === "not_configured" ? "student.notConfigured" : code === "FILE_SIZE" ? "student.fileTooLarge" : code === "FILE_TYPE" ? "student.unsupportedFile" : code === "UPLOAD_INCOMPLETE" ? "student.uploadIncomplete" : "common.error"));
      }
    } finally {sendingRef.current=false;transferAbort.current=null;setSending(false);setVideoHandoff(false);setPreparing(null);}
  }
  async function retryVideo(job:VideoJobView){const result=await request<{videoJob:VideoJobView}>(`/api/video-submissions/${job.id}`,{method:'POST',body:'{}'});setHome(previous=>previous?{...previous,assignments:previous.assignments.map(task=>task.id===job.assignmentId?{...task,videoJob:result.videoJob}:task)}:previous);void load();}

  if (loading) return <section className="ws-loading" role="status"><img src="/characters/cat-mochi.webp" alt=""/><LoaderCircle className="ws-spin" size={23}/><p>{t("common.loading")}</p></section>;
  if (!home) return <section className="ws-empty"><BookOpen size={34}/><p role="alert">{error || t("common.error")}</p><button className="ws-button" onClick={() => void load(true)}><RefreshCw size={17}/>{t("common.retry")}</button></section>;
  return <div className="ws ws-student">
    {error && <div className="ws-alert" role="alert">{error}<button onClick={() => void load()}>{t("common.retry")}</button></div>}
    <section className="ws-kids-hero">
      <div className="ws-hero-copy"><span className="ws-eyebrow"><Heart size={14}/>{t("student.greeting", {name: home.profile.name})}</span><h1>{t("student.heroTitle")}</h1><p>{t("student.heroSubtitle")}</p><div className="sd-hero-actions">{nextTask && <button className="ws-button ws-button-primary sd-next-task" onClick={() => openTask(nextTask)}><PencilLine size={19}/>{t("student.taskAction")}<ArrowRight size={17}/></button>}<span className="ws-class-pill"><BookOpen size={14}/>{home.profile.className || t("student.classroom")}</span></div></div>
      <div className={`ws-hero-friends ${celebrate ? "is-celebrating" : ""}`}><div className="sd-friend-hill" aria-hidden="true"/><Cloud className="sd-cloud sd-cloud-one" aria-hidden="true"/><Cloud className="sd-cloud sd-cloud-two" aria-hidden="true"/><Sparkles className="ws-hero-sparkle" size={32} aria-hidden="true"/><Star className="sd-star" size={22} aria-hidden="true"/><img className="ws-secondary-friend" src={`/characters/${companions[0].file}.webp`} alt=""/><img className="sd-third-friend" src={`/characters/${companions[1].file}.webp`} alt=""/><CharacterAvatar imageSrc={home.profile.spaceCompanion?.art} spaceOutfit={home.profile.spaceCompanion?.outfit} className="ws-primary-friend" character={character.id} outfit={home.profile.pointSettings?.enabled ? home.profile.wardrobeOutfit : {}} alt={t("common.characterAlt", {name: t(`characters.${character.id}`)})}/><Flower2 className="ws-hero-flower" size={38} aria-hidden="true"/><span className="ws-buddy-name"><Heart size={12}/>{t("student.buddyLabel")} · {home.profile.spaceCompanion?.name||t(`characters.${character.id}`)}</span></div>
    </section>
    <div className="ms-home-greeting"><img src={home.profile.spaceCompanion?.art||`/characters/${character.file}.webp`} alt=""/><p><strong>{home.profile.spaceCompanion?.name||t(`characters.${character.id}`)}{locale==='ko'?'의 한마디':' says'}</strong>{locale==='ko'?(celebrate?petPersonality(home.profile.spaceCompanion?.pet||'friend-'+character.id).cheer:nextTask?petPersonality(home.profile.spaceCompanion?.pet||'friend-'+character.id).hello[0]:petPersonality(home.profile.spaceCompanion?.pet||'friend-'+character.id).rest):'One little step at a time. I am here with you!'}</p></div><div className="ws-student-notice" role="status" aria-live="polite">{notice && <><CheckCircle2 size={18}/>{notice}</>}</div>
    {home.profile.pointSettings?.enabled && home.profile.mySpaceEnabled!==false && <Link href="/student/my-space" className="sd-gallery-entry points-shop-entry"><span className="sd-gallery-icon"><Sparkles size={26}/></span><span className="sd-gallery-copy"><strong>{locale === "ko" ? "나의 작은 세상" : "My little world"}</strong><span>{home.profile.points || 0} {home.profile.pointSettings.label === "보말" && locale !== "ko" ? "Bomal" : home.profile.pointSettings.label} · {locale === "ko" ? "내 방 · 동물 친구 · 다꾸 노트" : "My room · Friends · Journal"}</span></span><span className="sd-gallery-art"><CharacterAvatar character={character.id} outfit={home.profile.wardrobeOutfit}/></span><span className="sd-gallery-arrow"><ArrowRight size={20}/></span></Link>}
    <Link href="/student/boards" className="sd-gallery-entry sd-board-entry"><span className="sd-gallery-icon"><PanelsTopLeft size={26}/></span><span className="sd-gallery-copy"><strong>{common("boards")}<MessageCircleHeart size={17}/></strong><span>{locale === "ko" ? "내 생각을 올리고 친구들의 생각도 만나봐요" : "Share your ideas and discover your friends' thoughts"}</span></span><span className="sd-gallery-art" aria-hidden="true"><img src="/characters/rabbit-tori.webp" alt=""/></span><span className="sd-gallery-arrow"><ArrowRight size={20}/></span></Link>
    <Link href="/student/exhibitions" className="sd-gallery-entry"><span className="sd-gallery-icon"><Images size={26}/></span><span className="sd-gallery-copy"><strong>{common("exhibitions")}<Sparkles size={17}/></strong><span>{exhibition("subtitle")}</span></span><span className="sd-gallery-art" aria-hidden="true"><span className="sd-mini-frame"><Palette size={22}/></span><img src="/characters/otter-moa.webp" alt=""/></span><span className="sd-gallery-arrow"><ArrowRight size={20}/></span></Link>
    <section className="ws-tasks-section" aria-labelledby="tasks-heading"><div className="ws-section-heading"><div className="sd-section-label"><span className="sd-section-icon"><PencilLine size={24}/></span><div><span className="ws-eyebrow">{t("student.tasksSubtitle")}</span><h2 id="tasks-heading">{t("student.tasksTitle")}</h2></div></div><div className="ws-row"><span className="ws-count-pill">{t("student.tasksCount", {count: home.assignments.filter(assignment => assignment.status === "pending" || assignment.status === "revision").length})}</span><button className="ws-icon-btn" onClick={() => void load()} aria-label={t("common.refresh")}><RefreshCw size={17}/></button></div></div>
      {!home.assignments.length ? <div className="ws-empty ws-student-empty"><div className="sd-rest-scene" aria-hidden="true"><Cloud size={50}/><img src={`/characters/${character.file}.webp`} alt=""/><Star size={23}/></div><h3>{t("student.noTasksTitle")}</h3><p>{t("student.noTasksBody")}</p></div> : <div className="ws-task-grid">{home.assignments.map(assignment => <article className={`ws-task-card ws-task-${assignment.status}`} key={assignment.id}><div className="ws-task-top"><span className="sd-task-icon" aria-hidden="true">{assignment.status === "done" ? <CheckCircle2 size={26}/> : assignment.status === "submitted" ? <Send size={24}/> : assignment.status === "revision" ? <RefreshCw size={25}/> : <PencilLine size={26}/>}</span><span className={`ws-status ws-status-${assignment.status}`}>{assignment.status === "done" ? <CheckCircle2 size={14}/> : assignment.status === "submitted" ? <Clock3 size={14}/> : <BookOpen size={14}/>}{assignment.videoJob&&["queued","processing"].includes(assignment.videoJob.status)?t("student.videoPending"):t(`common.${assignment.status}`)}</span></div><h3>{assignment.title}</h3><SubmissionTypeBadge type={assignmentSubmissionType(assignment.submissionType)}/>{assignment.videoJob&&assignment.status!=="revision"&&<VideoSubmissionStatus compact job={assignment.videoJob} onRetry={()=>retryVideo(assignment.videoJob!)}/>}<p className="ws-task-description">{assignment.description}</p><span className="ws-small ws-task-due"><Clock3 size={13}/>{date(assignment.dueAt)}</span><button className="ws-task-button" onClick={() => openTask(assignment)}><span>{t(assignment.status === "done" ? "student.viewFeedback" : assignment.status === "submitted" ? "student.viewSent" : assignment.status === "revision" ? "student.revisionAction" : "student.taskAction")}</span><ArrowRight size={17}/></button></article>)}</div>}
    </section>
    <section className="ws-friends-section" aria-labelledby="friends-heading"><div className="ws-friends-copy"><span className="sd-section-icon"><Heart size={24}/></span><div><h2 id="friends-heading">{t("student.pickFriend")}</h2><p>{t("student.pickHint")}</p></div></div><div className="ws-friend-picker" aria-busy={changingFriend}>{friends.map(friend => <button key={friend.id} className="ws-friend" onClick={() => void chooseFriend(friend.id)} aria-pressed={character.id === friend.id} disabled={changingFriend} aria-label={`${t(`characters.${friend.id}`)} · ${t(`characters.${friend.id}Species`)}`}><span className="sd-friend-portrait"><img src={`/characters/${friend.file}.webp`} alt=""/></span><strong>{t(`characters.${friend.id}`)}</strong><span>{t(`characters.${friend.id}Species`)}</span>{character.id === friend.id && <Check className="ws-friend-check" size={13}/>}</button>)}</div></section>
    <section className="ws-growth-strip" aria-label={t("student.growth")}><div className="ws-growth-icon"><Flower2 size={27}/></div><div className="ws-growth-copy"><strong>{t("student.growth")}</strong><span>{t("student.growthHint")}</span></div><div className="ws-growth-right"><div className="ws-flower-stamps" aria-label={t("student.growthPoints", {points: xp})}>{[0,1,2,3,4].map(index => <Flower2 key={index} size={25} className={index < flowers % 5 || flowers >= 5 && flowers % 5 === 0 ? "is-earned" : ""}/>)}</div><span>{t("student.growthPoints", {points: xp})}</span></div></section>
    <div className="ws-kind-footer"><Heart size={14}/>{t("student.tasksSubtitle")}</div>
    {selected && <TaskDialog title={selected.title} onClose={() => {setSelectedId(null); setFiles([]); uploadCache.current.clear();}} busy={sending||selectingVideo}>
      <div className="ws-dialog-body"><div className="ws-task-detail-meta"><span className={`ws-status ws-status-${selected.status}`}>{selected.videoJob&&["queued","processing"].includes(selected.videoJob.status)?t("student.videoPending"):t(`common.${selected.status}`)}</span><span className="ws-small">{date(selected.dueAt)}</span></div><div className="sd-task-type-heading"><SubmissionTypeBadge type={submissionType}/>{submissionType !== "legacy" && <p>{t(`submissionTypes.${submissionType}Hint`)}</p>}</div><div className="ws-instructions"><h3>{t("student.taskDescription")}</h3><p>{selected.description}</p></div><AssignmentMaterials materials={selected.materials} onRefresh={()=>void load()}/>
        {selected.videoJob&&!(selected.videoJob.status==="complete"&&selected.status==="revision")&&<VideoSubmissionStatus job={selected.videoJob} onRetry={()=>retryVideo(selected.videoJob!)}/>}{selected.submission?.feedback && <div className="ws-feedback"><h3><MessageCircleHeart size={19}/>{t("student.teacherSays")}</h3><p>{selected.submission.feedback}</p></div>}
        {selected.submission && <SubmittedFiles uploads={selected.submission.uploads || []} revision={selected.status === "revision"} onRefresh={() => load()}/>}
        {!canSubmit ? <>{!videoBlocked&&<div className="ws-result-buddy"><img src={`/characters/${character.file}.webp`} alt=""/><p>{t(selected.status === "done" ? "student.doneMessage" : "student.waiting")}</p></div>}{selected.submission?.text && <div className="ws-submitted-note"><h3>{t("student.submittedText")}</h3><p>{selected.submission.text}</p></div>}</> : <form onSubmit={submit}>
          {selected.status === "revision" && <p className="ws-encouragement">{t("student.revisionMessage")}</p>}
          {submissionType !== "text" && <div className={`ws-upload-zone sd-upload-${submissionType}`}><span className="sd-camera-sticker" aria-hidden="true">{submissionType === "video" ? <Video size={30}/> : <Camera size={30}/>}<Star size={15}/></span><h3>{t(submissionType === "video" ? "student.videoHeading" : submissionType === "image" ? "student.imageHeading" : "student.attachHeading")}</h3><p>{t(submissionType === "video" ? "submissionTypes.videoHint" : submissionType === "image" ? "submissionTypes.imageHint" : "student.attachHint")}</p><small className="ws-upload-limits">{t(submissionType === "video" ? "student.videoUploadLimits" : submissionType === "image" ? "student.imageUploadLimits" : "student.uploadLimits")}</small><div className="ws-upload-actions">{submissionType !== "video" && <button type="button" className="ws-button ws-button-light" onClick={() => photoInput.current?.click()} disabled={sending||selectingVideo}><Camera size={20}/><span>{t("student.camera")}</span></button>}<button type="button" className="ws-button ws-button-light" onClick={() => fileInput.current?.click()} disabled={sending||selectingVideo}>{submissionType === "video" ? <Video size={19}/> : submissionType === "image" ? <Images size={19}/> : <Paperclip size={19}/>}<span>{t(submissionType === "video" ? "student.uploadVideo" : submissionType === "image" ? "student.chooseImages" : "student.chooseFiles")}</span></button></div><input ref={photoInput} type="file" accept={submissionType === "video" ? videoAccept : imageAccept} capture="environment" className="ws-visually-hidden" tabIndex={-1} disabled={sending||selectingVideo} onChange={event => {addFiles(event.target.files); event.target.value = "";}}/><input ref={fileInput} type="file" accept={uploadAccept} multiple={submissionType!=="video"} className="ws-visually-hidden" tabIndex={-1} disabled={sending||selectingVideo} onChange={event => {addFiles(event.target.files); event.target.value = "";}}/>{selectingVideo&&<p className="ws-pick-status" role="status"><LoaderCircle size={15} className="ws-spin"/>{t("student.videoChecking")}</p>}{pickError&&<p className="ws-form-error ws-pick-error" role="alert">{pickError}</p>}</div>}
          {files.length > 0 && <div className="ws-file-previews">{files.map((file, index) => <div className={`ws-file-preview ${contentType(file).startsWith("video/") ? "sd-file-video" : ""}`} key={`${file.name}-${index}`}>{previews[index] ? contentType(file).startsWith("video/") ? <VideoPreview url={previews[index]} name={file.name}/> : <img src={previews[index]} alt="" decoding="async"/> : <Paperclip size={23}/>}<span>{file.name}</span><button type="button" className="ws-icon-btn" aria-label={t("student.removeFile", {name: file.name})} disabled={sending||selectingVideo} onClick={() => {setFiles(previous => previous.filter((_, item) => item !== index)); setFormError(""); setPickError(""); uploadCache.current.delete(file);}}><X size={16}/></button></div>)}</div>}
          <label className={`ws-field ${submissionType === "text" ? "sd-text-answer" : ""}`}><span>{submissionType === "text" && <PencilLine size={17}/>} {t(submissionType === "text" ? "student.answerLabel" : submissionType === "legacy" ? "student.messageLabel" : "student.captionLabel")}</span><textarea value={message} onChange={event => {setMessage(event.target.value); setFormError("");}} placeholder={t(submissionType === "text" ? "student.answerPlaceholder" : submissionType === "legacy" ? "student.messagePlaceholder" : "student.captionPlaceholder")} rows={submissionType === "text" ? 7 : 3} maxLength={10000} required={submissionType === "text"} disabled={sending||selectingVideo}/></label>
          {formError && <p className="ws-form-error" role="alert">{formError}</p>}
          {sending && <div className="ws-upload-progress" role="status"><span>{preparing?t("student.preparingImage",preparing):submissionType==="video"?t(videoHandoff?"student.videoPreparing":"student.videoUploading",{progress}):files.length?t("student.uploading",{progress}):t("student.sending")}</span>{!videoHandoff&&<progress max="100" value={progress}/>}</div>}
          <button type="submit" className="ws-button ws-button-primary ws-send-button" disabled={sending || selectingVideo || !hasRequiredContent}>{sending ? <LoaderCircle size={21} className="ws-spin"/> : <Send size={21}/>} {t(sending ? "student.sending" : submissionType==="video"?"student.videoSubmitAction":"student.sendAction")}</button><p className="ws-upload-footnote">{t(sending ? (submissionType==="video"?"student.videoKeepOpen":"student.keepOpen") : "student.submissionSafe")}</p>
        </form>}
      </div>
    </TaskDialog>}
  </div>;
}
