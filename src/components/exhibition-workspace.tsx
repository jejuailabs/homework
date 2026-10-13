"use client";

import {useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode} from "react";
import dynamic from "next/dynamic";

import {useLocale, useTranslations} from "next-intl";
import {uploadBytesResumable, ref as storageRef} from "firebase/storage";
import {ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, ChevronDown, Clock3, Cloud, Flower2, Heart, ImagePlus, Images, LayoutGrid, Leaf, LoaderCircle, LockKeyhole, Mail, Palette, Plus, RefreshCw, Send, Settings2, Sparkles, Stamp, Trash2, Upload, Users, Waves, X} from "lucide-react";
import {storage} from "@/lib/firebase-client";
import type {ArtReaction, ArtworkStatus, Exhibition, ExhibitionArtwork, ExhibitionClass, ExhibitionComment, ExhibitionDetailResponse, ExhibitionListResponse, ExhibitionStatus, ExhibitionStudent} from "@/lib/exhibition-types";

const ExhibitionScene = dynamic(() => import("./exhibition-scene"), {ssr: false, loading: () => <div className="ex-scene-loading" role="status"><LoaderCircle className="spin" size={28}/></div>});
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const reactionIcons = {colors: Palette, idea: Sparkles, story: Heart};
const roomThemeIcons = {cozy: Palette, forest: Leaf, sky: Cloud, ocean: Waves};
function RoomThemeIcon({theme, size = 16}: {theme?: Exhibition["theme"]; size?: number}) {const Icon = roomThemeIcons[theme || "cozy"] || Palette; return <Icon size={size}/>;}
type Role = "teacher" | "student";
type QueuedPhoto = {id: string; file: File; preview: string; title: string; description: string; studentId: string; uploadId?: string};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {...init, cache: "no-store", headers: {"Content-Type": "application/json", ...init?.headers}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code || "REQUEST_FAILED");
  return body as T;
}

function Dialog({title, children, onClose, busy = false, wide = false}: {title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean}) {
  const t = useTranslations("exhibition"), id = useId(), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {dialog.current?.showModal();}, []);
  return <dialog ref={dialog} className={`ex-dialog ${wide ? "ex-dialog-wide" : ""}`} aria-labelledby={id} onCancel={event => {event.preventDefault(); if (!busy) onClose();}}>
    <header className="ex-dialog-head"><h2 id={id}>{title}</h2><button className="ex-icon-btn" onClick={onClose} disabled={busy} aria-label={t("close")}><X size={21}/></button></header>{children}
  </dialog>;
}

function ArtworkImage({artwork, full = false}: {artwork: ExhibitionArtwork; full?: boolean}) {
  const [failed, setFailed] = useState(false), t = useTranslations("exhibition");
  const url = full ? artwork.url : artwork.thumbnailUrl || artwork.url;
  useEffect(() => {setFailed(false);}, [url]);
  return failed || !url ? <span className="ex-image-fallback"><Images size={32}/><small>{t("fileUnavailable")}</small></span> : <img src={url} alt={artwork.title} loading={full ? "eager" : "lazy"} onError={() => setFailed(true)}/>;
}

function GalleryBuilding() {
  return <div className="ex-building" aria-hidden="true"><span className="ex-building-cloud"/><span className="ex-building-cloud second"/><span className="ex-building-sun"/><div className="ex-building-ground"/><div className="ex-building-house"><div className="ex-building-roof"/><div className="ex-building-sign"><Palette size={17}/><span>ART</span></div><span className="ex-building-window left"/><span className="ex-building-window right"/><span className="ex-building-door"/></div><span className="ex-building-tree left"/><span className="ex-building-tree right"/><Flower2 className="ex-building-flower" size={29}/></div>;
}

export default function ExhibitionWorkspace({role}: {role: Role}) {
  const t = useTranslations("exhibition"), locale = useLocale(), teacher = role === "teacher";
  const [home, setHome] = useState<ExhibitionListResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<ExhibitionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"create" | "upload" | "settings" | "building" | null>(null);
  const [artworkId, setArtworkId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ArtworkStatus | "all">("all");
  const [view, setView] = useState<"grid" | "room">("grid");
  const [showBuilding, setShowBuilding] = useState(false), [buildingId, setBuildingId] = useState("");
  const [rooms, setRooms] = useState<Exhibition[]>([]), [roomsLoading, setRoomsLoading] = useState(false), [moreLoading, setMoreLoading] = useState(false);
  const [hasMoreRooms, setHasMoreRooms] = useState(false);
  const [busy, setBusy] = useState(false);
  const activeId = useRef("");
  const activeBuilding = useRef(""), nextCursor = useRef<string | null>(null);
  const listRequest = useRef(0), homeRequest = useRef(0), pageBusy = useRef(false);
  const loadRooms = useCallback(async (classId: string, append = false) => {
    if (teacher && !classId || append && (!nextCursor.current || pageBusy.current)) return;
    const cursor = append ? nextCursor.current : null;
    const sequence = ++listRequest.current;
    pageBusy.current = true;
    if (append) setMoreLoading(true);
    else {setRoomsLoading(true); setMoreLoading(false); setRooms([]); setHasMoreRooms(false); nextCursor.current = null;}
    const query = new URLSearchParams();
    if (teacher) query.set("classId", classId);
    if (cursor) query.set("cursor", cursor);
    try {
      const data = await request<ExhibitionListResponse>(`/api/exhibitions${query.size ? `?${query}` : ""}`);
      if (sequence !== listRequest.current || teacher && classId !== activeBuilding.current) return;
      setRooms(previous => append ? [...new Map([...previous, ...data.exhibitions].map(show => [show.id, show])).values()] : data.exhibitions);
      setHasMoreRooms(data.hasMore && !!data.nextCursor); nextCursor.current = data.nextCursor || null;
      setHome(previous => previous ? {...previous, classes: data.classes || previous.classes, profile: data.profile || previous.profile, storageUsage: data.storageUsage || previous.storageUsage} : data);
      setError("");
    } catch {if (sequence === listRequest.current && (!teacher || classId === activeBuilding.current)) setError(t("error"));}
    finally {if (sequence === listRequest.current) {setRoomsLoading(false); setMoreLoading(false); pageBusy.current = false;}}
  }, [teacher, t]);
  const loadHome = useCallback(async () => {
    const sequence = ++homeRequest.current;
    const roomSequence = ++listRequest.current;
    pageBusy.current = true; setRoomsLoading(true); setMoreLoading(false);
    const query = new URLSearchParams({bootstrap: "1"});
    if (teacher && activeBuilding.current) query.set("classId", activeBuilding.current);
    try {
      const data = await request<ExhibitionListResponse>(`/api/exhibitions?${query}`);
      if (sequence !== homeRequest.current || roomSequence !== listRequest.current) return;
      setHome(data); setError("");
      const classId = teacher ? data.selectedClassId || "" : "";
      activeBuilding.current = classId; setBuildingId(classId);
      setRooms(data.exhibitions); setHasMoreRooms(data.hasMore && !!data.nextCursor); nextCursor.current = data.nextCursor || null;
    } catch {if (sequence === homeRequest.current && roomSequence === listRequest.current) setError(t("error"));}
    finally {
      if (sequence === homeRequest.current) setLoading(false);
      if (roomSequence === listRequest.current) {setRoomsLoading(false); pageBusy.current = false;}
    }
  }, [teacher, t]);
  const selectBuilding = (id: string) => {activeBuilding.current = id; setBuildingId(id); void loadRooms(id);};
  const loadDetail = useCallback(async (id: string, showLoading = false) => {
    if (!id) return;
    if (showLoading) setDetailLoading(true);
    try {
      const data = await request<ExhibitionDetailResponse>(`/api/exhibitions/${id}`);
      if (activeId.current === id) {setDetail(data); activeBuilding.current = data.exhibition.classId; setBuildingId(data.exhibition.classId); setError("");}
    } catch {if (activeId.current === id) setError(t("error"));}
    finally {if (activeId.current === id) setDetailLoading(false);}
  }, [t]);
  useEffect(() => {void loadHome();}, [loadHome]);
  useEffect(() => {
    const sync = (refreshRooms: boolean) => {const id = new URL(window.location.href).searchParams.get("exhibition") || ""; activeId.current = id; setSelectedId(id); setDetail(null); setArtworkId(null); if (refreshRooms && !id && (activeBuilding.current || !teacher)) void loadRooms(activeBuilding.current);};
    const onPopState = () => sync(true);
    sync(false); window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState);
  }, [loadRooms, teacher]);
  useEffect(() => {if (selectedId) void loadDetail(selectedId, true);}, [selectedId, loadDetail]);
  useEffect(() => {
    if (!selectedId) return;
    const refresh = () => {if (document.visibilityState === "visible") void loadDetail(selectedId);};
    const timer = window.setInterval(refresh, 10 * 60 * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh);};
  }, [selectedId, loadDetail]);

  const selectShow = (id: string) => {
    activeId.current = id; setSelectedId(id); setDetail(null); setArtworkId(null); setError(""); setNotice(""); setView("grid"); setFilter("all");
    const url = new URL(window.location.href); if (id) url.searchParams.set("exhibition", id); else url.searchParams.delete("exhibition"); window.history.pushState({}, "", url);
    window.scrollTo({top: 0, behavior: "smooth"});
    if (!id) void loadRooms(activeBuilding.current);
  };
  const refreshShow = useCallback(async () => {await Promise.all([loadDetail(activeId.current), loadRooms(activeBuilding.current)]);}, [loadDetail, loadRooms]);
  const changeStatus = async (status: ExhibitionStatus) => {
    if (!detail || busy) return;
    setBusy(true); setError("");
    try {await request(`/api/exhibitions/${detail.exhibition.id}`, {method: "PATCH", body: JSON.stringify({status})}); await refreshShow(); setNotice(t(status === "open" ? "opened" : "closedNotice"));}
    catch {setError(t("error"));} finally {setBusy(false);}
  };
  const currentBuilding = home?.classes?.find(item => item.id === buildingId) || home?.classes?.[0];
  const visibleShows = rooms.filter(show => !teacher || !currentBuilding || show.classId === currentBuilding.id);
  const artworks = detail?.artworks || [];
  const approved = artworks.filter(artwork => artwork.status === "approved");
  const filtered = artworks.filter(artwork => filter === "all" || artwork.status === filter);
  const selectedArtwork = artworks.find(artwork => artwork.id === artworkId);
  const stats = useMemo(() => {
    const submitted = new Set(artworks.map(artwork => artwork.studentId).filter(Boolean));
    return {galleryTotal: artworks.length, linkedArtists: submitted.size, submitted: submitted.size, missing: (detail?.students || []).filter(student => !submitted.has(student.id)).length, pending: artworks.filter(artwork => artwork.status === "pending").length, approved: approved.length};
  }, [artworks, approved.length, detail?.students]);

  if (loading) return <div className="ex-loading" role="status"><img src="/characters/otter-moa.webp" alt=""/><LoaderCircle className="spin" size={24}/><p>{t("loading")}</p></div>;
  if (!home) return <div className="ex-empty"><Palette size={38}/><p role="alert">{error}</p><button className="ex-button" onClick={() => void loadHome()}><RefreshCw size={17}/>{t("retry")}</button></div>;

  return <div className="ex-workspace">
    {error && <div className="ex-alert" role="alert"><span>{error}</span><button onClick={() => void (selectedId ? loadDetail(selectedId, true) : loadHome())}>{t("retry")}</button></div>}
    {notice && <div className="ex-notice" role="status"><CheckCircle2 size={18}/><span>{notice}</span><button className="ex-icon-btn" onClick={() => setNotice("")} aria-label={t("close")}><X size={16}/></button></div>}
    {!selectedId ? <>
      <section className="ex-hero"><div className="ex-hero-copy"><span className="ex-eyebrow"><Flower2 size={16}/>{t("eyebrow")}</span><h1>{t("title")}</h1><p>{t(teacher ? "teacherSubtitle" : "subtitle")}</p><div className="ex-hero-actions">{teacher && (home.classes?.length ? <button className="ex-button ex-primary" onClick={() => setModal("create")}><Plus size={20}/>{t("create")}</button> : <button className="ex-button ex-primary" onClick={() => setModal("building")}><Users size={19}/>{t("createBuilding")}</button>)}<span className="ex-private"><LockKeyhole size={13}/>{t("private")}</span></div></div><div className={`ex-hero-illustration ${showBuilding ? "ex-building-live" : ""}`}>{showBuilding ? <ExhibitionScene mode="building" buildingName={currentBuilding?.name || home.profile?.className} artworks={[]} onSelect={() => {}} locale={locale}/> : <GalleryBuilding/>}<button className="ex-building-toggle" onClick={() => setShowBuilding(value => !value)} aria-pressed={showBuilding}>{t(showBuilding ? "buildingClose" : "buildingOpen")}</button><img className="ex-hero-moa" src="/characters/otter-moa.webp" alt={t("characterAlt")}/><span className="ex-moa-bubble">{t("moaHello")}</span></div></section>
      {teacher && !!home.classes?.length && <section className="ex-buildings"><div className="ex-buildings-heading"><h2>{t("ourBuildings")}</h2><button className="ex-text-button" onClick={() => setModal("building")}><Plus size={14}/>{t("createBuilding")}</button></div><div className="ex-building-list">{home.classes.map(item => <button key={item.id} aria-pressed={currentBuilding?.id === item.id} onClick={() => selectBuilding(item.id)}><span className="ex-building-glyph"><Images size={23}/></span><span><small>{t("yearLabel", {year: item.year || new Date().getFullYear()})}{/^[0-9]+$/.test(item.grade) ? ` · ${t("gradeLabel", {grade: item.grade})}` : ""}</small><strong>{item.name}</strong><em>{t("viewRooms")}</em></span>{currentBuilding?.id === item.id && <CheckCircle2 size={16}/>}</button>)}</div></section>}
      <div className="ex-section-heading"><div><span className="ex-eyebrow">{teacher && currentBuilding ? currentBuilding.name : t("exhibitionCount", {count: visibleShows.length})}</span><h2>{t("exhibitions")}</h2></div><div className="ex-heading-actions">{teacher && !!home.classes?.length && <button className="ex-button" onClick={() => setModal("create")}><Plus size={16}/>{t("create")}</button>}<button className="ex-icon-btn" onClick={() => void loadHome()} aria-label={t("refresh")}><RefreshCw size={19}/></button></div></div>
      {roomsLoading ? <div className="ex-list-loading" role="status"><LoaderCircle size={22} className="spin"/><p>{t("loadingRooms")}</p></div> : !visibleShows.length ? <section className="ex-empty ex-home-empty"><div className="ex-empty-frame"><Images size={36}/><Flower2 size={20}/></div><h3>{t("emptyTitle")}</h3><p>{t(teacher ? home.classes?.length ? "emptyTeacher" : "noClasses" : "emptyStudent")}</p>{teacher && home.classes?.length ? <button className="ex-button" onClick={() => setModal("create")}><Plus size={18}/>{t("create")}</button> : null}</section> : <div className="ex-show-grid">{visibleShows.map((show, index) => <button className={`ex-show-card ex-show-theme-${show.theme || "cozy"}`} key={show.id} onClick={() => selectShow(show.id)}><div className="ex-show-cover"><div className="ex-card-mini-frame"><RoomThemeIcon theme={show.theme} size={31}/><span/><span/></div><Flower2 className="ex-cover-flower" size={30}/><span className={`ex-status ex-status-${show.status}`}>{t(show.status)}</span><img src={`/characters/${index % 3 === 0 ? "otter-moa" : index % 3 === 1 ? "cat-mochi" : "hamster-kong"}.webp`} alt=""/></div><div className="ex-show-copy"><div className="ex-show-labels"><span className="ex-show-class"><Users size={13}/>{show.className}</span><span className="ex-show-theme-label"><RoomThemeIcon theme={show.theme} size={12}/>{t(`themes.${show.theme || "cozy"}`)}</span></div><h3>{show.title}</h3><p>{show.description || t("subtitle")}</p><div className="ex-show-bottom"><span>{t("artworkCount", {count: show.approvedCount})}</span><strong>{t(teacher && show.status === "draft" ? "prepare" : "view")}<ArrowRight size={16}/></strong></div></div></button>)}</div>}
      {hasMoreRooms && <div className="ex-more-rooms"><button className="ex-button" disabled={roomsLoading || moreLoading} onClick={() => void loadRooms(activeBuilding.current, true)}>{moreLoading ? <LoaderCircle className="spin" size={17}/> : <ChevronDown size={17}/>} {t(moreLoading ? "loadingMore" : "loadMoreRooms")}</button></div>}
      <div className="ex-footer-note"><Heart size={15}/>{t("noRanking")}</div>
    </> : <>
      <button className="ex-back" onClick={() => selectShow("")}><ArrowLeft size={17}/>{t("back")}</button>
      {detailLoading && !detail ? <div className="ex-loading" role="status"><LoaderCircle className="spin" size={25}/><p>{t("loading")}</p></div> : detail && <>
        <section className="ex-show-heading"><div><div className="ex-heading-meta"><span className={`ex-status ex-status-${detail.exhibition.status}`}>{t(detail.exhibition.status)}</span><span><Users size={14}/>{detail.exhibition.className}</span><span><LockKeyhole size={13}/>{t("classOnly")}</span></div><h1>{detail.exhibition.title}</h1><p>{detail.exhibition.description || t("subtitle")}</p></div><div className="ex-heading-actions">{teacher && <button className="ex-button ex-primary" onClick={() => setModal("upload")} disabled={busy || artworks.length >= detail.artworkLimit}><ImagePlus size={19}/>{t("upload")}</button>}{teacher && <button className="ex-icon-btn ex-settings-btn" onClick={() => setModal("settings")} aria-label={t("settings")}><Settings2 size={20}/></button>}<button className="ex-icon-btn" onClick={() => void refreshShow()} aria-label={t("refresh")}><RefreshCw size={18}/></button></div></section>
        {detail.exhibition.status !== "open" && <div className="ex-status-note"><img src="/characters/otter-moa.webp" alt=""/><p>{t(detail.exhibition.status === "draft" ? "draftHint" : "closedHint")}</p>{teacher && <button className="ex-button ex-primary" disabled={busy} onClick={() => void changeStatus("open")}>{busy ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>} {t(detail.exhibition.status === "draft" ? "openAction" : "reopenAction")}</button>}</div>}
        {teacher && <section className="ex-studio"><div className="ex-studio-title"><div><span className="ex-eyebrow">{t("preparationHint")}</span><h2>{t("preparation")}</h2></div><img src="/characters/otter-moa.webp" alt=""/></div><div className="ex-stats">{(["galleryTotal", "linkedArtists", "approved"] as const).map((key, index) => <div className={`ex-stat ex-stat-${key}`} key={key}><span>{index === 0 ? <Images size={16}/> : index === 1 ? <Clock3 size={16}/> : index === 2 ? <Palette size={16}/> : <CheckCircle2 size={16}/>} {t(key)}</span><strong>{stats[key]}</strong></div>)}</div>{!!detail.students?.length && <details className="ex-roster"><summary>{t("roster")}<span>{t("receivedCount", {count: stats.submitted})}</span><ChevronDown size={16}/></summary><div className="ex-roster-grid">{detail.students?.map(student => {const own = artworks.filter(artwork => artwork.studentId === student.id); const status = own.some(artwork => artwork.status === "approved") ? "approved" : own.some(artwork => artwork.status === "pending") ? "pending" : own.length ? "revision" : "missing"; return <div className={`ex-roster-student ex-roster-${status}`} key={student.id} aria-label={t("rosterStatus", {name: student.name, status: t(status)})}><span>{student.number}</span><strong>{student.name}</strong><small>{t(status)}</small></div>;})}</div></details>}</section>}
        {!teacher && detail.passport && <section className="ex-passport"><div className="ex-passport-copy"><Stamp size={23}/><div><h2>{t("passport")}</h2><p>{t("passportHint")}</p></div></div><div className="ex-stamps">{(["artist", "thoughtfulComment"] as const).map(key => <div className={`ex-stamp ${detail.passport?.[key] ? "earned" : ""}`} key={key} title={t(detail.passport?.[key] ? "stampEarned" : "stampWaiting")}><Flower2 size={26}/><span>{t(key === "artist" ? "artistStamp" : "commentStamp")}</span>{detail.passport?.[key] && <Check size={12}/>}</div>)}</div></section>}
        <section className="ex-art-section"><div className="ex-section-heading"><div><span className="ex-eyebrow">{t("artworkCount", {count: approved.length})}</span><h2>{t("artworks")}</h2></div><div className="ex-view-switch" aria-label={t("artworks")}><button aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={17}/>{t("grid")}</button><button aria-pressed={view === "room"} onClick={() => setView("room")}><Images size={17}/>{t("room")}</button></div></div>
          {view === "grid" && <>{teacher && <div className="ex-filters">{(["all", "pending", "approved", "revision"] as const).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{t(status)}<span>{status === "all" ? artworks.length : artworks.filter(artwork => artwork.status === status).length}</span></button>)}</div>}{!filtered.length ? <div className="ex-empty"><div className="ex-empty-frame"><Images size={36}/></div><h3>{t(artworks.length ? "noMatchingArtworks" : "noArtworks")}</h3>{!artworks.length && <p>{t("noArtworksHint")}</p>}</div> : <div className="ex-art-grid">{filtered.map(artwork => <button className="ex-art-card" key={artwork.id} onClick={() => setArtworkId(artwork.id)}><div className="ex-art-frame"><ArtworkImage artwork={artwork}/>{artwork.status !== "approved" && <span className={`ex-status ex-status-${artwork.status}`}>{t(artwork.status)}</span>}</div><div className="ex-art-caption"><h3>{artwork.title}</h3><span>{artwork.studentName || t("unnamedArtist")}</span>{!teacher && artwork.studentId === home.profile?.id && <small>{t("ownWorks")}</small>}</div></button>)}</div>}</>}
          {view === "room" && <div className="ex-room-wrap"><p className="ex-room-hint"><Sparkles size={16}/>{t(approved.length ? "roomHint" : "roomEmpty")}</p><ExhibitionScene artworks={approved.map(artwork => ({id: artwork.id, title: artwork.title, url: artwork.url, thumbnailUrl: artwork.thumbnailUrl}))} onSelect={setArtworkId} locale={locale} theme={detail.exhibition.theme}/></div>}
        </section><div className="ex-footer-note"><Heart size={15}/>{t("noRanking")}</div>
      </>}
    </>}
    {modal === "building" && <BuildingForm onClose={() => setModal(null)} onSaved={async id => {activeBuilding.current = id; setBuildingId(id); await loadHome(); setModal("create");}}/>}
    {modal === "create" && <ExhibitionForm classes={home.classes || []} initialClassId={currentBuilding?.id} onClose={() => setModal(null)} onSaved={async show => {setModal(null); await loadHome(); selectShow(show.id); setNotice(t("created"));}}/>}
    {modal === "settings" && detail && <ExhibitionForm classes={home.classes || []} exhibition={detail.exhibition} onClose={() => setModal(null)} onSaved={async () => {setModal(null); await refreshShow(); setNotice(t("saved"));}}/>}
    {modal === "upload" && detail && <UploadDialog storageUsage={home.storageUsage} teacher={teacher} exhibitionId={detail.exhibition.id} students={detail.students || []} onClose={() => {setModal(null); void refreshShow();}} onSaved={async () => {setModal(null); await refreshShow(); setNotice(t(teacher ? "teacherUploadSuccess" : "uploadSuccess"));}}/>}
    {selectedArtwork && detail && <ArtworkDialog key={selectedArtwork.id} artwork={selectedArtwork} exhibition={detail.exhibition} teacher={teacher} studentId={home.profile?.id} students={detail.students || []} onClose={() => setArtworkId(null)} onChange={refreshShow}/>}
  </div>;
}

function BuildingForm({onClose, onSaved}: {onClose: () => void; onSaved: (id: string) => Promise<void>}) {
  const t = useTranslations("exhibition"), locale = useLocale();
  const [year, setYear] = useState(new Date().getFullYear()), [grade, setGrade] = useState("3"), [name, setName] = useState(locale === "ko" ? "3학년 1반" : "Grade 3, Class 1");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !name.trim()) return; setBusy(true); setError("");
    try {const result = await request<{class: {id: string}}>("/api/classes", {method: "POST", body: JSON.stringify({name: name.trim(), grade, year})}); await onSaved(result.class.id);}
    catch {setError(t("error"));} finally {setBusy(false);}
  };
  return <Dialog title={t("buildingTitle")} onClose={onClose} busy={busy}><form className="ex-form" onSubmit={submit}><p className="ex-form-hint">{t("buildingHint")}</p><div className="ex-form-pair"><label>{t("year")}<input type="number" min={2020} max={2100} value={year} required disabled={busy} onChange={event => setYear(Number(event.target.value))}/></label><label>{t("grade")}<select value={grade} disabled={busy} onChange={event => {setGrade(event.target.value); setName(locale === "ko" ? `${event.target.value}학년 1반` : `Grade ${event.target.value}, Class 1`);}}>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>{t("gradeLabel", {grade: value})}</option>)}</select></label></div><label>{t("buildingName")}<input autoFocus required value={name} maxLength={80} placeholder={t("buildingNamePlaceholder")} disabled={busy} onChange={event => setName(event.target.value)}/></label>{error && <p className="ex-form-error" role="alert">{error}</p>}<div className="ex-form-actions"><button type="button" className="ex-button" onClick={onClose} disabled={busy}>{t("cancel")}</button><button className="ex-button ex-primary" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>} {t("createBuilding")}</button></div></form></Dialog>;
}

function ExhibitionForm({classes, exhibition, initialClassId, onClose, onSaved}: {classes: ExhibitionClass[]; exhibition?: Exhibition; initialClassId?: string; onClose: () => void; onSaved: (show: Exhibition) => Promise<void>}) {
  const t = useTranslations("exhibition");
  const [title, setTitle] = useState(exhibition?.title || ""), [description, setDescription] = useState(exhibition?.description || ""), [classId, setClassId] = useState(exhibition?.classId || initialClassId || classes[0]?.id || "");
  const [commentsEnabled, setCommentsEnabled] = useState(exhibition?.commentsEnabled ?? true), [status, setStatus] = useState<ExhibitionStatus>(exhibition?.status || "draft");
  const [theme, setTheme] = useState<"cozy" | "forest" | "sky" | "ocean">(exhibition?.theme || "cozy");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !title.trim() || !classId) return; setBusy(true); setError("");
    try {const result = await request<{exhibition: Exhibition}>(`/api/exhibitions${exhibition ? `/${exhibition.id}` : ""}`, {method: exhibition ? "PATCH" : "POST", body: JSON.stringify(exhibition ? {title: title.trim(), description: description.trim(), commentsEnabled, status, theme} : {title: title.trim(), description: description.trim(), classId, theme})}); await onSaved(result.exhibition || exhibition!);}
    catch {setError(t("error"));} finally {setBusy(false);}
  };
  return <Dialog title={t(exhibition ? "settings" : "createTitle")} onClose={onClose} busy={busy}><form className="ex-form" onSubmit={submit}><p className="ex-form-hint">{t(exhibition ? "classOnly" : "createHint")}</p><label>{t("exhibitionTitle")}<input required autoFocus value={title} maxLength={120} placeholder={t("titlePlaceholder")} onChange={event => setTitle(event.target.value)} disabled={busy}/></label><label>{t("classroom")}<select value={classId} required onChange={event => setClassId(event.target.value)} disabled={busy || !!exhibition}><option value="">{t("selectClass")}</option>{classes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>{t("description")}<textarea rows={3} maxLength={2000} value={description} placeholder={t("descriptionPlaceholder")} onChange={event => setDescription(event.target.value)} disabled={busy}/></label><fieldset className="ex-theme-field"><legend>{t("roomTheme")}</legend><div>{(["cozy", "forest", "sky", "ocean"] as const).map(value => <button type="button" key={value} className={`ex-theme-tile ex-theme-${value}`} aria-pressed={theme === value} disabled={busy} onClick={() => setTheme(value)}><span><Palette size={22}/></span>{t(`themes.${value}`)}{theme === value && <Check size={13}/>}</button>)}</div></fieldset>{exhibition && <><label>{t("statusLabel")}<select value={status} onChange={event => setStatus(event.target.value as ExhibitionStatus)} disabled={busy}>{(["draft", "open", "closed"] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label><label className="ex-checkbox"><input type="checkbox" checked={commentsEnabled} onChange={event => setCommentsEnabled(event.target.checked)} disabled={busy}/><span>{t("commentsEnabled")}<small>{t("commentsHint")}</small></span></label></>}{error && <p className="ex-form-error" role="alert">{error}</p>}<div className="ex-form-actions"><button type="button" className="ex-button" onClick={onClose} disabled={busy}>{t("cancel")}</button><button className="ex-button ex-primary" disabled={busy || !classId || !title.trim()}>{busy ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>} {t(busy ? "saving" : exhibition ? "save" : "createSubmit")}</button></div></form></Dialog>;
}

function StorageUsage({usage}: {usage: NonNullable<ExhibitionListResponse["storageUsage"]>}) {
  const t = useTranslations("exhibition"), locale = useLocale();
  const occupied = Math.max(0, usage.usedBytes) + Math.max(0, usage.reservedBytes);
  const format = (bytes: number) => {
    const unit = bytes >= 1024 ** 3 ? "GB" : "MB", divisor = unit === "GB" ? 1024 ** 3 : 1024 ** 2;
    return `${(Math.max(0, bytes) / divisor).toLocaleString(locale, {maximumFractionDigits: 1})} ${unit}`;
  };
  return <div className="ex-storage-usage"><div><span>{t("storageTitle")}</span><strong>{t("storageAvailable", {remaining: format(Math.max(0, usage.limitBytes - occupied)), total: format(usage.limitBytes)})}</strong></div><progress aria-label={t("storageUsed", {used: format(occupied)})} max={Math.max(1, usage.limitBytes)} value={Math.min(occupied, usage.limitBytes)}/>{usage.reservedBytes > 0 && <small>{t("storageUploading", {amount: format(usage.reservedBytes)})}</small>}</div>;
}

function UploadDialog({teacher, exhibitionId, students, storageUsage, onClose, onSaved}: {storageUsage?: ExhibitionListResponse["storageUsage"]; teacher: boolean; exhibitionId: string; students: ExhibitionStudent[]; onClose: () => void; onSaved: () => Promise<void>}) {
  const t = useTranslations("exhibition"), photoInput = useRef<HTMLInputElement>(null), cameraInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [processing, setProcessing] = useState(false), [error, setError] = useState("");
  const previews = useRef(new Set<string>()), uploaded = useRef(new Map<string, string>());
  useEffect(() => {const urls = previews.current; return () => urls.forEach(url => URL.revokeObjectURL(url));}, []);
  const addPhotos = (files: FileList | null) => {
    if (!files || busy) return; setError("");
    if (photos.length + files.length > 20) {setError(t("uploadLimit")); return;}
    const added: QueuedPhoto[] = [];
    for (const file of Array.from(files)) {
      if (!imageTypes.has(file.type)) {setError(t("fileType")); continue;}
      if (!file.size || file.size > 100 * 1024 * 1024) {setError(t("fileSize")); continue;}
      const preview = URL.createObjectURL(file); previews.current.add(preview);
      added.push({id: crypto.randomUUID(), file, preview, title: file.name.replace(/\.[^.]+$/, "").slice(0, 120), description: "", studentId: ""});
    }
    setPhotos(previous => [...previous, ...added]);
  };
  const update = (id: string, change: Partial<QueuedPhoto>) => setPhotos(previous => previous.map(photo => photo.id === id ? {...photo, ...change} : photo));
  const remove = (photo: QueuedPhoto) => {URL.revokeObjectURL(photo.preview); previews.current.delete(photo.preview); setPhotos(previous => previous.filter(item => item.id !== photo.id));};
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !photos.length) return;
    if (photos.some(photo => !photo.title.trim())) {setError(t("chooseArtistError")); return;}
    setBusy(true); setError(""); setProgress(0); let completed = 0;
    try {
      for (let index = 0; index < photos.length; index++) {
        const photo = photos[index]; let uploadId = uploaded.current.get(photo.id);
        setProcessing(false);
        if (!uploadId) {
          const upload = await request<{uploadId: string; path: string}>(`/api/exhibitions/${exhibitionId}/uploads`, {method: "POST", body: JSON.stringify({fileName: photo.file.name, contentType: photo.file.type, size: photo.file.size})});
          await new Promise<void>((resolve, reject) => {const task = uploadBytesResumable(storageRef(storage, upload.path), photo.file, {contentType: photo.file.type}); task.on("state_changed", snapshot => setProgress(Math.round(((index + snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes)) / photos.length) * 100)), reject, () => resolve());});
          uploadId = upload.uploadId; uploaded.current.set(photo.id, uploadId);
        }
        setProcessing(true);
        await request(`/api/exhibitions/${exhibitionId}/artworks`, {method: "POST", body: JSON.stringify({uploadId, title: photo.title.trim(), description: photo.description.trim(), ...(teacher ? {studentId: photo.studentId} : {})})});
        completed++; uploaded.current.delete(photo.id); remove(photo);
      }
      await onSaved();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (["UPLOAD_INVALID", "UPLOAD_USED", "UPLOAD_EXPIRED", "UPLOAD_MISMATCH", "FILE_INVALID", "IMAGE_INVALID", "IMAGE_PIXELS", "IMAGE_ANIMATED"].includes(code)) uploaded.current.clear();
      const key = code === "UPLOAD_EXPIRED" || code === "UPLOAD_USED" ? "uploadExpiredRetry" : code === "UPLOAD_PROCESSING" ? "uploadProcessingRetry" : code === "ARTWORK_LIMIT" ? "roomFull" : code === "UPLOAD_RATE_LIMIT" ? "uploadRateLimit" : code === "FILE_SIZE" ? "fileSize" : code === "FILE_TYPE" ? "fileType" : code.includes("PIXEL") ? "filePixels" : code.includes("IMAGE") || code === "FILE_INVALID" ? "fileInvalid" : code.includes("QUOTA") || code === "STORAGE_LIMIT" ? "quotaError" : code === "UNAUTHORIZED" || code.startsWith("storage/unauthorized") || code.startsWith("auth/") ? "sessionError" : "error";
      setError(`${completed ? `${t("partialUpload")} ` : ""}${t(key)}`);
    } finally {setBusy(false); setProcessing(false);}
  };
  return <Dialog title={t("uploadTitle")} onClose={onClose} busy={busy} wide={teacher}><form className="ex-form" onSubmit={submit}><p className="ex-form-hint">{t(teacher ? "uploadTeacherHint" : "uploadHint")}</p>{storageUsage && <StorageUsage usage={storageUsage}/>}<div className="ex-upload-zone"><ImagePlus size={31}/><div><button type="button" className="ex-button" disabled={busy} onClick={() => photoInput.current?.click()}><Upload size={18}/>{t("choosePhotos")}</button>{<button type="button" className="ex-button" disabled={busy} onClick={() => cameraInput.current?.click()}><Camera size={18}/>{t("takePhoto")}</button>}</div><small>{t("uploadLimits")}</small><input className="ex-visually-hidden" ref={photoInput} type="file" multiple accept="image/jpeg,image/png,image/webp" tabIndex={-1} onChange={event => {addPhotos(event.target.files); event.target.value = "";}}/><input className="ex-visually-hidden" ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" tabIndex={-1} onChange={event => {addPhotos(event.target.files); event.target.value = "";}}/></div><div className="ex-upload-queue">{photos.map(photo => <div className="ex-upload-item" key={photo.id}><div className="ex-upload-preview"><img src={photo.preview} alt={photo.file.name}/><button type="button" className="ex-icon-btn" disabled={busy} aria-label={t("removePhoto", {name: photo.file.name})} onClick={() => remove(photo)}><Trash2 size={17}/></button></div><div className="ex-upload-fields">{teacher && <label>{t("artist")}<select value={photo.studentId} onChange={event => update(photo.id, {studentId: event.target.value})} disabled={busy}><option value="">{t("chooseArtist")}</option>{students.map(student => <option key={student.id} value={student.id}>{t("studentNumber", {number: student.number, name: student.name})}</option>)}</select></label>}<label>{t("artworkTitle")}<input value={photo.title} maxLength={120} required placeholder={t("artworkTitlePlaceholder")} disabled={busy} onChange={event => update(photo.id, {title: event.target.value})}/></label><label>{t("artistWords")}<textarea rows={2} value={photo.description} maxLength={2000} placeholder={t("artistWordsPlaceholder")} disabled={busy} onChange={event => update(photo.id, {description: event.target.value})}/></label></div></div>)}</div>{error && <p className="ex-form-error" role="alert">{error}</p>}{busy && <div className="ex-progress" role="status"><span>{t(processing ? "processing" : "uploading", {progress})}</span><progress value={progress} max={100}/><small>{t("keepOpen")}</small></div>}<div className="ex-form-actions"><button type="button" className="ex-button" onClick={onClose} disabled={busy}>{t("cancel")}</button><button className="ex-button ex-primary" disabled={busy || !photos.length}>{busy ? <LoaderCircle className="spin" size={18}/> : <ImagePlus size={18}/>} {t("submitArtworks", {count: photos.length})}</button></div></form></Dialog>;
}

function ArtworkDialog({artwork, exhibition, teacher, studentId, students, onClose, onChange}: {artwork: ExhibitionArtwork; exhibition: Exhibition; teacher: boolean; studentId?: string; students: ExhibitionStudent[]; onClose: () => void; onChange: () => Promise<void>}) {
  const t = useTranslations("exhibition"), locale = useLocale();
  const [comments, setComments] = useState<ExhibitionComment[]>([]), [commentLoading, setCommentLoading] = useState(true);
  const [text, setText] = useState(""), [feedback, setFeedback] = useState(artwork.feedback || ""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [editTitle, setEditTitle] = useState(artwork.title), [editDescription, setEditDescription] = useState(artwork.description), [editStudentId, setEditStudentId] = useState(artwork.studentId || "");
  const base = `/api/exhibitions/${exhibition.id}/artworks/${artwork.id}`;
  const canInteract = exhibition.status === "open" && artwork.status === "approved";
  const reloadComments = useCallback(async () => {setCommentLoading(true); try {const result = await request<{comments: ExhibitionComment[]}>(`${base}/comments`); setComments(result.comments);} catch {setError(t("error"));} finally {setCommentLoading(false);}}, [base, t]);
  useEffect(() => {void reloadComments();}, [reloadComments]);
  const action = async (perform: () => Promise<unknown>, message: string) => {if (busy) return; setBusy(true); setError(""); setNotice(""); try {await perform(); await onChange(); setNotice(message);} catch {setError(t("error"));} finally {setBusy(false);}};
  const review = (status: "approved" | "revision") => {void action(() => request(base, {method: "PATCH", body: JSON.stringify({status, feedback: feedback.trim()})}), t(status === "approved" ? "approvedNotice" : "revisionNotice"));};
  const react = (kind: ArtReaction) => void action(() => request(`${base}/reaction`, {method: "POST", body: JSON.stringify({kind})}), t("reacted"));
  const comment = async (event: FormEvent) => {event.preventDefault(); if (!text.trim() || busy) return; await action(async () => {await request(`${base}/comments`, {method: "POST", body: JSON.stringify({text: text.trim()})}); setText(""); await reloadComments();}, t(teacher ? "teacherCommentSent" : "commentSent"));};
  const moderate = (id: string, status: "approved" | "hidden") => void action(async () => {await request(`${base}/comments/${id}`, {method: "PATCH", body: JSON.stringify({status})}); await reloadComments();}, t("saved"));
  return <Dialog title={artwork.title} onClose={onClose} busy={busy} wide><div className="ex-art-detail"><div className="ex-detail-image"><ArtworkImage artwork={artwork} full/></div><div className="ex-detail-info"><div className="ex-artist-line"><span><Palette size={17}/>{artwork.studentName || t("unnamedArtist")}</span><span className={`ex-status ex-status-${artwork.status}`}>{t(artwork.status)}</span></div>{artwork.description && <div className="ex-artist-words"><h3>{t("artistWords")}</h3><p>{artwork.description}</p></div>}{artwork.feedback && <div className="ex-feedback"><h3><Mail size={16}/>{t("teacherFeedback")}</h3><p>{artwork.feedback}</p></div>}{teacher && <details className="ex-edit-artwork"><summary>{t("editArtwork")}<ChevronDown size={16}/></summary><form onSubmit={event => {event.preventDefault(); void action(() => request(base, {method: "PATCH", body: JSON.stringify({title: editTitle.trim(), description: editDescription.trim(), studentId: editStudentId})}), t("saved"));}}><label>{t("artworkTitle")}<input required maxLength={120} value={editTitle} onChange={event => setEditTitle(event.target.value)} disabled={busy}/></label><label>{t("artistWords")}<textarea rows={3} maxLength={2000} value={editDescription} onChange={event => setEditDescription(event.target.value)} disabled={busy}/></label><label>{t("artist")}<select value={editStudentId} onChange={event => setEditStudentId(event.target.value)} disabled={busy}><option value="">{t("chooseArtist")}</option>{students.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><button className="ex-button" disabled={busy || !editTitle.trim()}>{t("save")}</button></form></details>}{teacher && <div className="ex-review"><h3>{t("review")}</h3><p>{t("reviewHint")}</p><label className="ex-visually-hidden" htmlFor="ex-review-feedback">{t("teacherFeedback")}</label><textarea id="ex-review-feedback" rows={3} maxLength={1000} value={feedback} placeholder={t("feedbackPlaceholder")} onChange={event => setFeedback(event.target.value)} disabled={busy}/><div><button className="ex-button ex-primary" onClick={() => review("approved")} disabled={busy}><CheckCircle2 size={17}/>{t("approve")}</button><button className="ex-button" onClick={() => review("revision")} disabled={busy}>{t("requestRevision")}</button></div></div>}{artwork.reactionCounts && <div className="ex-private-reactions"><h3><Heart size={15}/>{t("receivedReactions")}</h3><p>{t("privateReactionsHint")}</p><div>{(["colors", "idea", "story"] as const).map(kind => <span key={kind}>{t(kind)} <strong>{artwork.reactionCounts?.[kind] || 0}</strong></span>)}</div></div>}{canInteract && !teacher && artwork.studentId !== studentId && <div className="ex-reactions"><h3>{t("reactionTitle")}</h3><div>{(["colors", "idea", "story"] as const).map(kind => {const Icon = reactionIcons[kind]; return <button key={kind} aria-pressed={artwork.ownReaction === kind} disabled={busy} onClick={() => react(kind)}><Icon size={19}/>{t(kind)}</button>;})}</div></div>}{notice && <p className="ex-inline-notice" role="status"><CheckCircle2 size={16}/>{notice}</p>}{error && <p className="ex-form-error" role="alert">{error}</p>}<section className="ex-comments"><h3><Mail size={17}/>{t("comments")}</h3>{!exhibition.commentsEnabled ? <p className="ex-form-hint">{t("commentsOff")}</p> : <>{commentLoading ? <div className="ex-comment-loading" role="status"><LoaderCircle className="spin" size={18}/></div> : !comments.length ? <p className="ex-form-hint">{t("noComments")}</p> : <div className="ex-comment-list">{comments.map(item => <article className={`ex-comment ex-comment-${item.status}`} key={item.id}><div><strong>{item.authorRole === "teacher" ? t("teacher") : item.authorName}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {timeZone: "Asia/Seoul", month: "short", day: "numeric"})}</time></div><p>{item.text}</p>{item.status !== "approved" && <small>{t(item.status === "pending" ? "commentPending" : "commentHidden")}</small>}{teacher && <footer>{item.status !== "approved" && <button disabled={busy} onClick={() => moderate(item.id, "approved")}><Check size={14}/>{t("approveComment")}</button>}{item.status !== "hidden" && <button disabled={busy} onClick={() => moderate(item.id, "hidden")}>{t("hideComment")}</button>}</footer>}</article>)}</div>}{canInteract && <form onSubmit={comment}><label className="ex-visually-hidden" htmlFor="ex-comment-text">{t("comments")}</label><textarea id="ex-comment-text" value={text} rows={3} maxLength={500} placeholder={t("commentPlaceholder")} disabled={busy} onChange={event => setText(event.target.value)}/><div className="ex-comment-actions"><button type="button" className="ex-text-button" disabled={busy} onClick={() => setText(t("commentStarter"))}>{t("commentHelp")}</button><button className="ex-button ex-primary" disabled={busy || !text.trim()}><Send size={16}/>{t("sendComment")}</button></div></form>}</>}</section></div></div></Dialog>;
}
