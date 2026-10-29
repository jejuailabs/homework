'use client';
import {useCallback, useEffect, useState, type ComponentType, type ReactNode} from "react";
import {useLocale, useTranslations} from "next-intl";
import {Archive, CheckCircle2, Download, LoaderCircle, RotateCcw, Trash2} from "lucide-react";
import {formatStorage} from "@/lib/storage-plan";
import {HOMEWORK_ARCHIVE_MAX_BYTES, HOMEWORK_TRASH_KEEP_DAYS} from "@/lib/homework-archive";
import {zipParts} from "@/lib/zip-store";
import "@/styles/homework-archive.css";

type ModalProps = {title: string; children: ReactNode; onClose: () => void; busy?: boolean; drawer?: boolean};
export type ArchiveStatus = {id: string; title: string; fileCount: number; bytes: number; downloadedAt: string | null; readyToClear: boolean; newSinceDownload: number;
  cleanup: {state: "trashed" | "purged"; fileCount: number; bytes: number; trashedAt: string | null; purgeAt: string} | null};
type ArchiveFiles = {id: string; title: string; zipName: string; files: {uploadId: string; name: string; size: number; contentType: string; url: string}[]};

async function archiveRequest<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/assignments/files", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "request_failed");
  return data as T;
}

function useDay() {
  const locale = useLocale();
  return (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, {month: "long", day: "numeric"}).format(new Date(value)) : "";
}

/** Fetches every file, stores them in one ZIP and hands it to the browser's download. Returns the saved upload IDs. */
async function saveZip(set: ArchiveFiles, onProgress: (done: number) => void) {
  if (set.files.reduce((total, file) => total + file.size, 0) > HOMEWORK_ARCHIVE_MAX_BYTES) throw new Error("too_large");
  const entries = [];
  for (const [index, file] of set.files.entries()) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error("fetch_failed");
    entries.push({name: file.name, data: new Uint8Array(await response.arrayBuffer())});
    onProgress(index + 1);
  }
  const blob = new Blob(zipParts(entries) as BlobPart[], {type: "application/zip"}), href = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = href; link.download = set.zipName; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
  return set.files.map(file => file.uploadId);
}

export function HomeworkArchiveDialog({assignments, Modal, onClose, onChanged}: {assignments: {id: string; title: string}[]; Modal: ComponentType<ModalProps>; onClose: () => void; onChanged?: (statuses: ArchiveStatus[]) => void}) {
  const t = useTranslations("product"), day = useDay();
  const [rows, setRows] = useState<ArchiveStatus[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [progress, setProgress] = useState(""), [saved, setSaved] = useState<string[]>([]), [confirming, setConfirming] = useState(false);
  const ids = assignments.map(task => task.id).join(",");
  const update = useCallback((next: ArchiveStatus[]) => {setRows(next); onChanged?.(next);}, [onChanged]);
  useEffect(() => {
    let live = true;
    archiveRequest<{assignments: ArchiveStatus[]}>({action: "status", assignmentIds: ids.split(",")}).then(result => {if (live) setRows(result.assignments);}).catch(reason => {if (live) setError(reason.message);});
    return () => {live = false;};
  }, [ids]);
  const downloadable = rows?.filter(row => row.fileCount > 0) ?? [], clearable = rows?.filter(row => row.readyToClear && !row.cleanup) ?? [];
  const clearFiles = clearable.reduce((total, row) => total + row.fileCount, 0), clearBytes = clearable.reduce((total, row) => total + row.bytes, 0);
  const purgeDay = day(new Date(Date.now() + HOMEWORK_TRASH_KEEP_DAYS * 86_400_000).toISOString());

  async function download(targets: ArchiveStatus[]) {
    setBusy(true); setError(""); setConfirming(false);
    const uploadIds: Record<string, string[]> = {};
    try {
      for (const row of targets) {
        // One homework at a time keeps signed links fresh and memory to a single ZIP.
        const [set] = (await archiveRequest<{assignments: ArchiveFiles[]}>({action: "files", assignmentIds: [row.id]})).assignments;
        setProgress(t("homeworkArchive.preparing", {title: set.title, done: 0, total: set.files.length}));
        uploadIds[row.id] = await saveZip(set, done => setProgress(t("homeworkArchive.preparing", {title: set.title, done, total: set.files.length})));
        setSaved(old => [...old, row.id]);
      }
    } catch (reason) {
      const message = (reason as Error).message;
      setError(message === "too_large" ? t("homeworkArchive.tooLarge") : message === "fetch_failed" ? t("homeworkArchive.fetchFailed") : message);
    } finally {
      if (Object.keys(uploadIds).length) await archiveRequest<{assignments: ArchiveStatus[]}>({action: "downloaded", assignmentIds: Object.keys(uploadIds), uploadIds}).then(result => update(rows!.map(row => result.assignments.find(next => next.id === row.id) ?? row))).catch(reason => setError((reason as Error).message));
      setProgress(""); setBusy(false);
    }
  }
  async function change(action: "trash" | "restore", targets: ArchiveStatus[]) {
    setBusy(true); setError(""); setConfirming(false);
    try {const result = await archiveRequest<{assignments: ArchiveStatus[]}>({action, assignmentIds: targets.map(row => row.id)}); update(rows!.map(row => result.assignments.find(next => next.id === row.id) ?? row));}
    catch (reason) {setError((reason as Error).message);}
    finally {setBusy(false);}
  }

  return <Modal title={t("homeworkArchive.title")} onClose={onClose} busy={busy}>
    <div className="ha-dialog">
      <p className="ha-intro">{t("homeworkArchive.intro")}</p>
      {assignments.length > 1 && <p className="ha-hint">{t("homeworkArchive.multiHint", {count: assignments.length})}</p>}
      {!rows ? <p className="ha-loading" role="status">{error || <><LoaderCircle className="ws-spin" size={18}/>{t("homeworkArchive.loading")}</>}</p> : <>
        <ul className="ha-list">{rows.map(row => <li key={row.id} className="ha-row">
          <div className="ha-row-main"><strong>{row.title}</strong><small>{row.fileCount ? t("homeworkArchive.files", {count: row.fileCount, size: formatStorage(row.bytes)}) : t("homeworkArchive.noFiles")}
            {row.downloadedAt && <span className="ha-chip">{t("homeworkArchive.downloaded", {date: day(row.downloadedAt)})}</span>}
            {row.newSinceDownload > 0 && <span className="ha-chip is-warn">{t("homeworkArchive.newSince", {count: row.newSinceDownload})}</span>}
            {saved.includes(row.id) && <span className="ha-chip is-ok"><CheckCircle2 size={13}/>{t("homeworkArchive.saved")}</span>}</small>
            {row.cleanup && <p className={`ha-cleanup is-${row.cleanup.state}`}><Archive size={14}/>{row.cleanup.state === "trashed" ? t("homeworkArchive.cleared", {date: day(row.cleanup.purgeAt)}) : t("homeworkArchive.purged", {date: day(row.cleanup.purgeAt)})}</p>}
          </div>
          <div className="ha-row-actions">
            {row.fileCount > 0 && <button type="button" className="ws-button ws-button-light" disabled={busy} onClick={() => download([row])}><Download size={15}/>{t("homeworkArchive.download")}</button>}
            {row.cleanup?.state === "trashed" && <button type="button" className="ws-button ws-button-light" disabled={busy} onClick={() => change("restore", [row])}><RotateCcw size={15}/>{t("homeworkArchive.restore")}</button>}
          </div>
        </li>)}</ul>
        {downloadable.length > 1 && <button type="button" className="ws-button ws-button-primary ha-wide" disabled={busy} onClick={() => download(downloadable)}><Download size={16}/>{t("homeworkArchive.downloadAll", {count: downloadable.length})}</button>}
        {progress && <p className="ha-progress" role="status"><LoaderCircle className="ws-spin" size={16}/>{progress}</p>}
        <section className="ha-clear">
          <h3><Trash2 size={16}/>{t("homeworkArchive.clearTitle")}</h3>
          <p className="ha-notice">{t("homeworkArchive.clearNotice", {days: HOMEWORK_TRASH_KEEP_DAYS})}</p>
          {!clearable.length ? <p className="ha-hint">{t("homeworkArchive.clearOnlyDownloaded")}</p> : confirming
            ? <div className="ha-confirm" role="alert"><p>{t("homeworkArchive.clearConfirm", {count: clearable.length, files: clearFiles, size: formatStorage(clearBytes), date: purgeDay})}</p><div className="ws-row"><button type="button" className="ws-button ws-button-light" disabled={busy} onClick={() => setConfirming(false)}>{t("common.cancel")}</button><button type="button" className="ws-button ha-danger" disabled={busy} onClick={() => change("trash", clearable)}><Trash2 size={15}/>{t("homeworkArchive.clearYes")}</button></div></div>
            : <button type="button" className="ws-button ha-danger" disabled={busy} onClick={() => setConfirming(true)}><Trash2 size={15}/>{t("homeworkArchive.clear")} · {t("homeworkArchive.files", {count: clearFiles, size: formatStorage(clearBytes)})}</button>}
        </section>
      </>}
      {error && rows && <p className="ws-form-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}

/** Shown on an assignment: how its files stand, with restore while they are still kept. */
export function HomeworkFileNotice({assignmentId, refreshKey, onRestored}: {assignmentId: string; refreshKey: number; onRestored: () => void}) {
  const t = useTranslations("product"), day = useDay();
  const [row, setRow] = useState<ArchiveStatus | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let live = true; setRow(null);
    archiveRequest<{assignments: ArchiveStatus[]}>({action: "status", assignmentIds: [assignmentId]}).then(result => {if (live) setRow(result.assignments[0]);}).catch(() => {});
    return () => {live = false;};
  }, [assignmentId, refreshKey]);
  if (!row?.cleanup) return null;
  async function restore() {
    setBusy(true); setError("");
    try {const result = await archiveRequest<{assignments: ArchiveStatus[]}>({action: "restore", assignmentIds: [assignmentId]}); setRow(result.assignments[0]); onRestored();}
    catch (reason) {setError((reason as Error).message);}
    finally {setBusy(false);}
  }
  return <div className={`ha-banner is-${row.cleanup.state}`} role="status">
    <Archive size={18}/><span>{row.cleanup.state === "trashed" ? t("homeworkArchive.bannerTrashed", {count: row.cleanup.fileCount, days: HOMEWORK_TRASH_KEEP_DAYS, date: day(row.cleanup.purgeAt)}) : t("homeworkArchive.bannerPurged", {date: day(row.cleanup.purgeAt)})}</span>
    {row.cleanup.state === "trashed" && <button type="button" className="ws-button ws-button-light" disabled={busy} onClick={restore}>{busy ? <LoaderCircle className="ws-spin" size={15}/> : <RotateCcw size={15}/>}{t("homeworkArchive.restore")}</button>}
    {error && <small role="alert">{error}</small>}
  </div>;
}
