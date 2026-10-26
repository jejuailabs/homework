"use client";

import {useState, type ReactNode} from "react";
import {useTranslations} from "next-intl";
import {Archive, BookOpen, ChevronDown, ChevronRight, Eye, EyeOff, FileText, ListChecks, Plus} from "lucide-react";
import "@/styles/assignment-visibility.css";

export type AssignmentVisibility = "visible" | "hidden";
export type VisibilityAssignment = {
  id: string; title: string; dueAt?: string | null; visibility?: AssignmentVisibility;
  visibilityVersion?: number; hiddenAt?: string | null; hiddenBy?: string | null;
};

export function AssignmentVisibilityList<T extends VisibilityAssignment>({assignments, selectedId, view, busy, onViewChange, onSelect, onCreate, onRequest, renderContents}: {
  assignments: T[]; selectedId: string; view: AssignmentVisibility; busy: boolean;
  onViewChange: (view: AssignmentVisibility) => void; onSelect: (id: string) => void;
  onCreate: () => void; onRequest: (action: "hide" | "restore", tasks: T[]) => void;
  renderContents: (assignment: T) => ReactNode;
}) {
  const t = useTranslations("product");
  const [selecting, setSelecting] = useState(false), [selected, setSelected] = useState<string[]>([]), [limit, setLimit] = useState(50);
  const filtered = assignments.filter(task => (task.visibility === "hidden" ? "hidden" : "visible") === view);
  const shown = filtered.slice(0, limit), selectedTasks = filtered.filter(task => selected.includes(task.id));
  const action = view === "hidden" ? "restore" : "hide";
  const allShownSelected = shown.length > 0 && shown.slice(0, 100).every(task => selected.includes(task.id));
  function changeView(next: AssignmentVisibility) {setSelected([]); setSelecting(false); setLimit(50); onViewChange(next);}
  function toggle(id: string) {setSelected(old => old.includes(id) ? old.filter(value => value !== id) : old.length < 100 ? [...old, id] : old);}
  return <aside className="ws-assignment-panel av-panel" aria-label={t("teacher.assignmentList")}>
    <div className="ws-panel-title"><h2><BookOpen size={18}/>{t("teacher.assignments")}</h2><span className="ws-count-pill">{assignments.length}</span></div>
    <div className="av-tabs" role="group" aria-label={t("teacher.visibilityTabs")}>
      {(["visible", "hidden"] as const).map(value => <button type="button" key={value} aria-pressed={view === value} disabled={busy} onClick={() => changeView(value)}>{value === "hidden" ? <Archive size={16}/> : <BookOpen size={16}/>}<span>{t(value === "hidden" ? "teacher.hiddenAssignments" : "teacher.visibleAssignments")}</span><b>{assignments.filter(task => (task.visibility === "hidden" ? "hidden" : "visible") === value).length}</b></button>)}
    </div>
    {view === "hidden" && <p className="av-list-hint">{t("teacher.hiddenListHint")}</p>}
    {filtered.length > 0 && <div className="av-toolbar"><button type="button" className="ws-button ws-button-light" disabled={busy} aria-pressed={selecting} onClick={() => {setSelecting(value => !value); setSelected([]);}}><ListChecks size={15}/>{t(selecting ? "teacher.selectionExit" : "teacher.selectionStart")}</button>{selecting && <>
      <button type="button" className="av-text-button" disabled={busy} onClick={() => setSelected(allShownSelected ? [] : shown.slice(0, 100).map(task => task.id))}>{t(allShownSelected ? "teacher.selectionClear" : "teacher.selectionPage")}</button>
      {view === "visible" && <button type="button" className="av-text-button" disabled={busy} onClick={() => setSelected(filtered.filter(task => task.dueAt && Number.isFinite(Date.parse(task.dueAt)) && Date.parse(task.dueAt) < Date.now()).slice(0, 100).map(task => task.id))}>{t("teacher.selectionOverdue")}</button>}
      <span className="av-selection-count">{t("teacher.assignmentSelected", {count: selectedTasks.length})}</span><button type="button" className="ws-button ws-button-primary" disabled={busy || !selectedTasks.length} onClick={() => onRequest(action, selectedTasks)}>{view === "hidden" ? <Eye size={15}/> : <EyeOff size={15}/>} {t(view === "hidden" ? "teacher.restoreSelected" : "teacher.hideSelected")}</button><small className="av-selection-limit">{t("teacher.selectionLimit")}</small>
    </>}</div>}
    <div className="ws-assignment-list av-list">{!filtered.length && <div className="td-list-empty"><FileText size={28}/><p>{t(view === "hidden" ? "teacher.emptyHiddenAssignments" : "teacher.emptyVisibleAssignments")}</p></div>}{shown.map(assignment => <div className={`av-assignment-row${selectedId === assignment.id ? " is-current" : ""}`} key={assignment.id}>
      {selecting && <label className="av-select"><input type="checkbox" checked={selected.includes(assignment.id)} disabled={busy || (!selected.includes(assignment.id) && selectedTasks.length >= 100)} onChange={() => toggle(assignment.id)}/><span className="ws-visually-hidden">{t("teacher.selectNamedAssignment", {title: assignment.title})}</span></label>}
      <button type="button" className="ws-assignment-item" aria-pressed={selectedId === assignment.id} disabled={busy} onClick={() => onSelect(assignment.id)}>{renderContents(assignment)}<ChevronRight size={16}/></button>
      {!selecting && <button type="button" className="av-row-action" disabled={busy} aria-label={t(view === "hidden" ? "teacher.restoreNamedAssignment" : "teacher.hideNamedAssignment", {title: assignment.title})} onClick={() => onRequest(action, [assignment])}>{view === "hidden" ? <Eye size={16}/> : <EyeOff size={16}/>}<span>{t(view === "hidden" ? "teacher.restoreAssignment" : "teacher.hideAssignment")}</span></button>}
    </div>)}</div>
    {filtered.length > shown.length && <button type="button" className="av-load-more" disabled={busy} onClick={() => setLimit(value => value + 50)}><ChevronDown size={17}/>{t("teacher.moreAssignments", {shown: shown.length, total: filtered.length})}</button>}
    <button className="ws-add-assignment" disabled={busy} onClick={onCreate}><Plus size={16}/>{t("teacher.newAssignment")}</button>
  </aside>;
}
