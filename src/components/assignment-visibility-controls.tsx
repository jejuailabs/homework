"use client";

import {useState, type ReactNode} from "react";
import {useTranslations} from "next-intl";
import {Archive, ArrowDownUp, BookOpen, ChevronDown, ChevronRight, Eye, EyeOff, FileText, ImagePlus, LayoutList, ListChecks, Paperclip, Plus, Search, Video, X} from "lucide-react";
import {ASSIGNMENT_ORDERS, assignmentKind, findAssignments, monthKey, searchWords, type AssignmentKind, type AssignmentOrder} from "@/lib/assignment-finder";
import "@/styles/assignment-visibility.css";

export type AssignmentVisibility = "visible" | "hidden";
export type VisibilityAssignment = {
  id: string; title: string; dueAt?: string | null; visibility?: AssignmentVisibility;
  visibilityVersion?: number; hiddenAt?: string | null; hiddenBy?: string | null;
  createdAt?: string | null; submissionType?: string;
};

type Kind = "all" | AssignmentKind;
const KINDS: {value: Kind; icon: typeof FileText}[] = [{value: "all", icon: LayoutList}, {value: "image", icon: ImagePlus}, {value: "text", icon: FileText}, {value: "video", icon: Video}, {value: "legacy", icon: Paperclip}];

/** Homework list: kind chips, title search and date order narrow it; rows are grouped by month and only the newest month starts open. */
export function AssignmentVisibilityList<T extends VisibilityAssignment>({assignments, selectedId, view, busy, onViewChange, onSelect, onCreate, onRequest, renderContents, selectionActions}: {
  assignments: T[]; selectedId: string; view: AssignmentVisibility; busy: boolean;
  onViewChange: (view: AssignmentVisibility) => void; onSelect: (id: string) => void;
  onCreate: () => void; onRequest: (action: "hide" | "restore", tasks: T[]) => void;
  renderContents: (assignment: T) => ReactNode; selectionActions?: (tasks: T[]) => ReactNode;
}) {
  const t = useTranslations("product");
  const [selecting, setSelecting] = useState(false), [selected, setSelected] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>("all"), [query, setQuery] = useState(""), [order, setOrder] = useState<AssignmentOrder>("new"), [opened, setOpened] = useState<Record<string, boolean>>({});
  const inView = assignments.filter(task => (task.visibility === "hidden" ? "hidden" : "visible") === view);
  const counts = Object.fromEntries(KINDS.map(entry => [entry.value, entry.value === "all" ? inView.length : inView.filter(task => assignmentKind(task.submissionType) === entry.value).length])) as Record<Kind, number>;
  const filtered = findAssignments(inView, {kind: kind === "all" ? undefined : kind, query, order});
  // Month groups follow the order: created month for 최신·오래된, due month (then "마감 없음") for 마감 순.
  const groups: {key: string; tasks: T[]}[] = [];
  for (const task of filtered) {
    const key = monthKey(order === "due" ? task.dueAt : task.createdAt);
    if (groups.at(-1)?.key === key) groups.at(-1)!.tasks.push(task); else groups.push({key, tasks: [task]});
  }
  const narrowed = kind !== "all" || searchWords(query).length > 0;
  // Newest (or oldest) month starts open; in 마감 순 every dated month starts open and only "마감 없음" folds.
  const isOpen = (key: string, index: number) => opened[key] ?? (narrowed || (order === "due" ? key !== "" : index === 0) || groups[index].tasks.some(task => task.id === selectedId));
  const shown = groups.flatMap((group, index) => isOpen(group.key, index) ? group.tasks : []);
  const selectedTasks = inView.filter(task => selected.includes(task.id));
  const action = view === "hidden" ? "restore" : "hide";
  const allShownSelected = shown.length > 0 && shown.slice(0, 100).every(task => selected.includes(task.id));
  const groupLabel = (key: string) => key ? t(order === "due" ? "teacher.listDueMonth" : "teacher.listMonth", {year: Number(key.slice(0, 4)), month: Number(key.slice(5))}) : t(order === "due" ? "teacher.listNoDue" : "teacher.listNoDate");
  function changeView(next: AssignmentVisibility) {setSelected([]); setSelecting(false); setOpened({}); onViewChange(next);}
  function toggle(id: string) {setSelected(old => old.includes(id) ? old.filter(value => value !== id) : old.length < 100 ? [...old, id] : old);}
  return <aside className="ws-assignment-panel av-panel" aria-label={t("teacher.assignmentList")}>
    <div className="ws-panel-title"><h2><BookOpen size={18}/>{t("teacher.assignments")}</h2><span className="ws-count-pill">{assignments.length}</span></div>
    <div className="av-tabs" role="group" aria-label={t("teacher.visibilityTabs")}>
      {(["visible", "hidden"] as const).map(value => <button type="button" key={value} aria-pressed={view === value} disabled={busy} onClick={() => changeView(value)}>{value === "hidden" ? <Archive size={16}/> : <BookOpen size={16}/>}<span>{t(value === "hidden" ? "teacher.hiddenAssignments" : "teacher.visibleAssignments")}</span><b>{assignments.filter(task => (task.visibility === "hidden" ? "hidden" : "visible") === value).length}</b></button>)}
    </div>
    {view === "hidden" && <p className="av-list-hint">{t("teacher.hiddenListHint")}</p>}
    {inView.length > 0 && <div className="av-finder">
      <div className="av-kinds" role="group" aria-label={t("teacher.listKinds")}>
        {KINDS.filter(entry => entry.value !== "legacy" || counts.legacy > 0).map(entry => <button type="button" key={entry.value} className={`av-kind av-kind-${entry.value}`} aria-pressed={kind === entry.value} onClick={() => setKind(entry.value)}><entry.icon size={14}/><span>{t(`teacher.listKind.${entry.value}`)}</span><b>{counts[entry.value]}</b></button>)}
      </div>
      <div className="av-search-row">
        <label className="av-search"><Search size={15}/><span className="ws-visually-hidden">{t("teacher.listSearch")}</span><input type="search" value={query} placeholder={t("teacher.listSearch")} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label={t("teacher.listSearchClear")} onClick={() => setQuery("")}><X size={14}/></button>}</label>
        <button type="button" className="av-order" onClick={() => {setOrder(ASSIGNMENT_ORDERS[(ASSIGNMENT_ORDERS.indexOf(order) + 1) % ASSIGNMENT_ORDERS.length]); setOpened({});}} title={t("teacher.listSortHint")}><ArrowDownUp size={14}/>{t(`teacher.listSort.${order}`)}</button>
      </div>
    </div>}
    {inView.length > 0 && <div className="av-toolbar"><button type="button" className="ws-button ws-button-light" disabled={busy} aria-pressed={selecting} onClick={() => {setSelecting(value => !value); setSelected([]);}}><ListChecks size={15}/>{t(selecting ? "teacher.selectionExit" : "teacher.selectionStart")}</button>{selecting && <>
      <button type="button" className="av-text-button" disabled={busy} onClick={() => setSelected(allShownSelected ? [] : shown.slice(0, 100).map(task => task.id))}>{t(allShownSelected ? "teacher.selectionClear" : "teacher.selectionPage")}</button>
      {view === "visible" && <button type="button" className="av-text-button" disabled={busy} onClick={() => setSelected(inView.filter(task => task.dueAt && Number.isFinite(Date.parse(task.dueAt)) && Date.parse(task.dueAt) < Date.now()).slice(0, 100).map(task => task.id))}>{t("teacher.selectionOverdue")}</button>}
      <span className="av-selection-count">{t("teacher.assignmentSelected", {count: selectedTasks.length})}</span><button type="button" className="ws-button ws-button-primary" disabled={busy || !selectedTasks.length} onClick={() => onRequest(action, selectedTasks)}>{view === "hidden" ? <Eye size={15}/> : <EyeOff size={15}/>} {t(view === "hidden" ? "teacher.restoreSelected" : "teacher.hideSelected")}</button>
      {selectionActions?.(selectedTasks)}<small className="av-selection-limit">{t("teacher.selectionLimit")}</small>
    </>}</div>}
    <div className="ws-assignment-list av-list">
      {!inView.length && <div className="td-list-empty"><FileText size={28}/><p>{t(view === "hidden" ? "teacher.emptyHiddenAssignments" : "teacher.emptyVisibleAssignments")}</p></div>}
      {inView.length > 0 && !filtered.length && <div className="td-list-empty av-no-match"><Search size={26}/><p>{t("teacher.listNoMatch")}</p></div>}
      {groups.map((group, index) => {
        const open = isOpen(group.key, index);
        return <section className="av-group" key={group.key || "none"}>
          <button type="button" className="av-group-head" aria-expanded={open} onClick={() => setOpened(old => ({...old, [group.key]: !open}))}><ChevronDown size={15} className="av-group-chevron"/><span>{groupLabel(group.key)}</span><b>{group.tasks.length}</b></button>
          {open && <div className="av-group-rows">{group.tasks.map(assignment => <div className={`av-assignment-row${selectedId === assignment.id ? " is-current" : ""}`} key={assignment.id}>
            {selecting && <label className="av-select"><input type="checkbox" checked={selected.includes(assignment.id)} disabled={busy || (!selected.includes(assignment.id) && selectedTasks.length >= 100)} onChange={() => toggle(assignment.id)}/><span className="ws-visually-hidden">{t("teacher.selectNamedAssignment", {title: assignment.title})}</span></label>}
            <button type="button" className="ws-assignment-item" aria-pressed={selectedId === assignment.id} disabled={busy} onClick={() => onSelect(assignment.id)}>{renderContents(assignment)}<ChevronRight size={16}/></button>
            {!selecting && <button type="button" className="av-row-action" disabled={busy} title={t(view === "hidden" ? "teacher.restoreAssignment" : "teacher.hideAssignment")} aria-label={t(view === "hidden" ? "teacher.restoreNamedAssignment" : "teacher.hideNamedAssignment", {title: assignment.title})} onClick={() => onRequest(action, [assignment])}>{view === "hidden" ? <Eye size={15}/> : <EyeOff size={15}/>}</button>}
          </div>)}</div>}
        </section>;
      })}
    </div>
    <button className="ws-add-assignment" disabled={busy} onClick={onCreate}><Plus size={16}/>{t("teacher.newAssignment")}</button>
  </aside>;
}
