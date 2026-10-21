'use client';
import {useEffect, useState, type ComponentType, type ReactNode} from "react";
import {useTranslations} from "next-intl";
import {CheckCircle2, FileText, LoaderCircle, X} from "lucide-react";
import {classMetadataFetch} from "@/lib/class-metadata-cache";

export type BulkReviewRow = {studentId: string; name: string; number: number; attemptId: string; text: string; uploads: {id: string; fileName: string; contentType: string; url?: string; thumbnailUrl?: string}[]; avatar: ReactNode};
export type BulkReviewResult = {studentId: string; ok: boolean; code?: string};
type ModalProps = {title: string; children: ReactNode; onClose: () => void; busy?: boolean; drawer?: boolean};

const draftKey = (assignmentId: string) => `homework-bulk-review:${assignmentId}`;
function readDraft(assignmentId: string): Record<string, string> {try {const value = JSON.parse(localStorage.getItem(draftKey(assignmentId)) || "{}"); return value && typeof value === "object" ? value : {};} catch {return {};}}
function saveDraft(assignmentId: string, value: Record<string, string>) {try {localStorage.setItem(draftKey(assignmentId), JSON.stringify(value));} catch {}}
function clearDraft(assignmentId: string) {try {localStorage.removeItem(draftKey(assignmentId));} catch {}}

/** Approve many submissions at once; every row may carry its own comment, or none. */
export default function HomeworkBulkReview({assignmentId, rows, Modal, onRemove, onClose, onDone}: {assignmentId: string; rows: BulkReviewRow[]; Modal: ComponentType<ModalProps>; onRemove: (studentId: string) => void; onClose: () => void; onDone: (results: BulkReviewResult[]) => void}) {
  const t = useTranslations("product");
  const [comments, setComments] = useState<Record<string, string>>({}), [shared, setShared] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {setComments(readDraft(assignmentId));}, [assignmentId]);
  const update = (next: Record<string, string>) => {setComments(next); saveDraft(assignmentId, next);};
  const fillEmpty = () => update(Object.fromEntries(rows.map(row => [row.studentId, comments[row.studentId]?.trim() ? comments[row.studentId] : shared.trim()])));
  const replaceAll = () => {
    if (rows.some(row => comments[row.studentId]?.trim() && comments[row.studentId].trim() !== shared.trim()) && !window.confirm(t("teacher.bulkReplaceConfirm"))) return;
    update(Object.fromEntries(rows.map(row => [row.studentId, shared.trim()])));
  };
  async function approve() {
    if (busy || !rows.length) return; setBusy(true); setError("");
    try {
      const response = await classMetadataFetch(`/api/assignments/${encodeURIComponent(assignmentId)}/review-batch`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({items: rows.map(row => ({studentId: row.studentId, attemptId: row.attemptId, feedback: (comments[row.studentId] || "").trim()}))})});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.code || "request_failed");
      const results = body.results as BulkReviewResult[];
      const left = Object.fromEntries(Object.entries(comments).filter(([studentId]) => results.some(result => result.studentId === studentId && !result.ok)));
      if (Object.keys(left).length) saveDraft(assignmentId, left); else clearDraft(assignmentId);
      onDone(results);
    } catch {setError(t("common.error"));} finally {setBusy(false);}
  }
  return <Modal title={t("teacher.bulkTitle", {count: rows.length})} onClose={onClose} busy={busy} drawer>
    <p className="ws-small">{t("teacher.bulkHint")}</p>
    <div className="ws-bulk-shared"><label className="ws-field"><span>{t("teacher.bulkSharedLabel")}</span><textarea rows={2} maxLength={5000} value={shared} placeholder={t("teacher.feedbackPlaceholder")} onChange={event => setShared(event.target.value)} disabled={busy}/></label><div className="ws-row"><button type="button" className="ws-button ws-button-light" disabled={busy || !shared.trim()} onClick={fillEmpty}>{t("teacher.bulkFillEmpty")}</button><button type="button" className="ws-button ws-button-light" disabled={busy || !shared.trim()} onClick={replaceAll}>{t("teacher.bulkReplaceAll")}</button></div></div>
    <ol className="ws-bulk-list">{rows.map(row => {const image = row.uploads.find(upload => upload.contentType.startsWith("image/")), file = row.uploads[0]; return <li key={row.studentId} className="ws-bulk-row">
      <div className="ws-bulk-who">{row.avatar}<span><small>{t("teacher.studentNumber", {number: row.number})}</small><strong>{row.name}</strong></span><button type="button" className="ws-icon-btn" disabled={busy} aria-label={t("teacher.bulkRemove", {name: row.name})} onClick={() => onRemove(row.studentId)}><X size={16}/></button></div>
      <div className="ws-bulk-preview">{image?.url ? <a href={image.url} target="_blank" rel="noopener noreferrer"><img src={image.thumbnailUrl || image.url} alt={image.fileName} loading="lazy"/></a> : file?.url ? <a className="ws-bulk-file" href={file.url} target="_blank" rel="noopener noreferrer"><FileText size={16}/>{file.fileName}</a> : null}{row.text ? <p>{row.text}</p> : !file && <p className="ws-small">{t("teacher.noText")}</p>}</div>
      <label className="ws-visually-hidden" htmlFor={`bulk-comment-${row.studentId}`}>{t("teacher.feedbackLabel")}</label><textarea id={`bulk-comment-${row.studentId}`} rows={2} maxLength={5000} value={comments[row.studentId] || ""} placeholder={t("teacher.bulkCommentPlaceholder")} disabled={busy} onChange={event => update({...comments, [row.studentId]: event.target.value})}/>
    </li>;})}</ol>
    {error && <p className="ws-form-error" role="alert">{error}</p>}
    <div className="ws-form-actions"><button type="button" className="ws-button ws-button-light" onClick={onClose} disabled={busy}>{t("common.cancel")}</button><button type="button" className="ws-button ws-button-primary" disabled={busy || !rows.length} onClick={() => void approve()}>{busy ? <LoaderCircle className="ws-spin" size={17}/> : <CheckCircle2 size={17}/>}{t("teacher.bulkApprove", {count: rows.length})}</button></div>
  </Modal>;
}
