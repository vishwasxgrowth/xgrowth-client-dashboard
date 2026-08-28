// @ts-nocheck
// Ops console shell: sidebar nav, header, and the top-level state (tasks,
// timeseries fetch, modals) shared across tabs. Each tab lives in its own
// module under ./ops/ — see ./ops/theme.jsx for the shared palette/helpers.
import { useEffect, useMemo, useRef, useState } from "react";

import D from "./activeData";
import ReportsDashboard from "./reports/ReportsDashboard";
import { loadTimeseries, tsAppNames, buildTaskAppIndex } from "./timeseriesSource";
import { C, PRIO, PRIO_BG, appColor, appName, group, groupId, member, shortDate } from "./ops/theme";
import AppsTab from "./ops/AppsTab";
import TasksTab from "./ops/TasksTab";
import TestsTab from "./ops/TestsTab";
import SettingsTab from "./ops/SettingsTab";
import { Drawer, CreateModal, TestDetail } from "./ops/modals";

const CLIENT_NAME = (import.meta.env.VITE_CLIENT_NAME || "Client");
const SAVE_KEY = "xgrowth-ops.workspace.v1";
const SAVE_VERSION = 1;

const NAV = [
  { id: "dashboard", label: "Dashboard" }, { id: "apps", label: "Applications" },
  { id: "tests", label: "Tests & Experiments" }, { id: "tasks", label: "Tasks" }, { id: "settings", label: "Settings" },
];

function NavIcon({ id, color, size = 18 }) {
  const p = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const wrap = (ch) => <svg width={size} height={size} viewBox="0 0 24 24">{ch}</svg>;
  if (id === "dashboard") return wrap(<><rect x="3" y="12" width="4" height="8" {...p} /><rect x="10" y="6" width="4" height="14" {...p} /><rect x="17" y="9" width="4" height="11" {...p} /></>);
  if (id === "apps") return wrap(<><rect x="3" y="3" width="7" height="7" rx="1.6" {...p} /><rect x="14" y="3" width="7" height="7" rx="1.6" {...p} /><rect x="3" y="14" width="7" height="7" rx="1.6" {...p} /><rect x="14" y="14" width="7" height="7" rx="1.6" {...p} /></>);
  if (id === "tests") return wrap(<><path d="M9 3h6M10 3v5.5L5.2 17A2 2 0 0 0 7 20h10a2 2 0 0 0 1.8-3L14 8.5V3" {...p} /><path d="M8 14h8" {...p} /></>);
  if (id === "tasks") return wrap(<><path d="M4 6h9M4 12h9M4 18h6" {...p} /><path d="M16 5.5l1.8 1.8L21 4" {...p} /></>);
  if (id === "settings") return wrap(<><circle cx="12" cy="12" r="3" {...p} /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V15z" {...p} /></>);
  return null;
}

function AppMultiSelect({ apps, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [qq, setQq] = useState("");
  const chosen = apps.filter((a) => value.includes(a.id));
  const opts = apps.filter((a) => !value.includes(a.id) && (!qq || a.name.toLowerCase().includes(qq.toLowerCase())));
  return (
    <div style={{ position: "relative", minWidth: 260, maxWidth: 360 }}>
      <div onClick={() => setOpen(true)} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", minHeight: 34, border: "1px solid " + C.line, borderRadius: 9, padding: "3px 8px", background: C.panel, cursor: "text" }}>
        {chosen.map((a) => (
          <span key={a.id} style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "1px solid " + C.line, borderRadius: 6, padding: "1px 6px", fontSize: 11.5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: appColor(a.id) }} />
            {a.name.length > 14 ? a.name.slice(0, 14) + "…" : a.name}
            <span onClick={(e) => { e.stopPropagation(); onChange(value.filter((id) => id !== a.id)); }} style={{ cursor: "pointer", color: C.faint }}>×</span>
          </span>
        ))}
        <input value={qq} onChange={(e) => { setQq(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={chosen.length ? "" : "Filter apps…"} style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, flex: 1, minWidth: 80 }} />
      </div>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 21, background: "#fff", border: "1px solid " + C.line, borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,.14)", maxHeight: 300, overflow: "auto" }}>
            {value.length > 0 && <div onClick={() => onChange([])} style={{ padding: "8px 12px", fontSize: 12, color: C.accent, cursor: "pointer", borderBottom: "1px solid " + C.line, fontWeight: 600 }}>Clear selection ({value.length})</div>}
            {opts.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12.5, color: C.faint2 }}>No more apps</div>}
            {opts.map((a) => (
              <div key={a.id} onClick={() => { onChange([...value, a.id]); setQq(""); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F6F7F9")} onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: appColor(a.id) }} />{a.name}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function XgrowthOps() {
  const [page, setPage] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [range, setRange] = useState("7");
  const [q, setQ] = useState("");
  const [selApps, setSelApps] = useState([]);
  const [appId, setAppId] = useState(null);
  const [appTab, setAppTab] = useState("dashboard");
  const [ts, setTs] = useState(null);
  const [tsError, setTsError] = useState(null);
  const [tfilter, setTfilter] = useState("All");
  const [openTask, setOpenTask] = useState(null);
  const [modal, setModal] = useState(null);
  const [testId, setTestId] = useState(null);
  const [threshold, setThreshold] = useState(8);
  const [toast, setToast] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [tasks, setTasks] = useState(() => {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const s = JSON.parse(raw); if (s && s.v === SAVE_VERSION && Array.isArray(s.tasks)) return s.tasks; } } catch (e) {}
    return D.TASKS.map((t) => ({ ...t }));
  });
  useEffect(() => { try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const s = JSON.parse(raw); if (s && s.threshold != null) setThreshold(s.threshold); if (s && s.at) setSavedAt(s.at); } } catch (e) {} }, []);
  // The Applications tab (and ClickUp app-matching) reads from the same
  // timeseries.json the Dashboard/Trends tab uses, fetched once here.
  useEffect(() => {
    let live = true;
    loadTimeseries().then((j) => { if (live) setTs(j); }).catch((e) => { if (live) setTsError(String((e && e.message) || e)); });
    return () => { live = false; };
  }, []);
  const taskAppMap = useMemo(() => (ts ? buildTaskAppIndex(tasks, tsAppNames(ts)) : new Map()), [tasks, ts]);
  const tt = useRef();
  const flash = (text) => { clearTimeout(tt.current); setToast(text); tt.current = setTimeout(() => setToast(null), 2600); };
  const persist = (nextTasks, thr) => { const at = new Date().toISOString(); try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, at, tasks: nextTasks == null ? tasks : nextTasks, threshold: thr == null ? threshold : thr })); setSavedAt(at); } catch (e) {} };
  const patchTask = (id, patch) => setTasks((ts) => { const next = ts.map((t) => (t.id === id ? { ...t, ...patch } : t)); persist(next); return next; });
  const onMove = (id, statusName) => { patchTask(id, { status: statusName }); if (D.updateTaskStatus) D.updateTaskStatus(id, statusName).then(() => flash("Moved to " + statusName + " in ClickUp")).catch(() => flash("Could not update ClickUp")); };
  const resetSaved = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} setTasks(D.TASKS.map((t) => ({ ...t }))); setSavedAt(null); setOpenTask(null); flash("Reset to the ClickUp snapshot"); };

  const openCreate = (ctx) => setModal({
    name: ctx && ctx.name ? ctx.name : "", list: (ctx && ctx.list) || "Ongoing", app: ctx && ctx.app ? appName(ctx.app) : "— none —",
    assignee: (ctx && ctx.assignee) || "Vishwas HD", priority: (ctx && ctx.priority) || "high", due: (ctx && ctx.due) || D.TODAY,
    ctxTitle: ctx && ctx.ctxTitle, ctxValue: ctx && ctx.ctxValue, ctxBad: !!(ctx && ctx.ctxBad),
  });
  const commitCreate = () => { const m = modal; if (!m) return; const app = D.APPS.find((a) => a.name === m.app); const t = { id: "869" + Math.random().toString(36).slice(2, 8), name: m.name || "Untitled task", status: "to do", assignee: m.assignee === "Unassigned" ? null : m.assignee, priority: m.priority === "none" ? null : m.priority, due: m.due || null, tags: [], list: m.list, app: app ? app.id : null }; setTasks((ts) => { const next = [t, ...ts]; persist(next); return next; }); setModal(null); flash("Created in ClickUp · " + m.list); };

  const taskView = (t) => {
    const g = group(t.status);
    const m = member(t.assignee);
    const overdue = t.due && t.due < D.TODAY && groupId(t.status) !== "done";
    const done = groupId(t.status) === "done";
    // Real ClickUp tasks carry no app id (no custom field for it — see
    // timeseriesSource.js); taskAppMap infers it from the task name instead.
    // Demo tasks already have a real D.APPS id, so that path still works too.
    const matchedApp = taskAppMap.get(t.id);
    const appLabel = matchedApp || (t.app ? appName(t.app) : null);
    return { id: t.id, name: t.name, status: t.status, sfg: g.fg, sbg: g.bg, list: t.list, app: appLabel || "—", hasApp: !!appLabel,
      priority: t.priority || "—", pfg: PRIO[t.priority] || "#C4C8D2", pbg: PRIO_BG[t.priority] || "#F1F2F6", hasPriority: !!t.priority,
      due: t.due ? shortDate(t.due) : "—", dfg: overdue ? "#C31C2B" : "#8A90A0", ainit: m.initials, acolor: m.color,
      nfg: done ? "#9AA0AE" : "#14161C", strike: done ? "line-through" : "none", check: done ? "✓" : "", checkBd: done ? "#0E9F6E" : "#D3D6DE", checkBg: done ? "#0E9F6E" : "#fff",
      open: () => setOpenTask(t.id), toggle: (e) => { e.stopPropagation(); patchTask(t.id, { status: done ? "to do" : "done" }); } };
  }

  const pageTitle = NAV.find((n) => n.id === page).label;
  const overdueAll = tasks.filter((t) => t.due && t.due < D.TODAY && groupId(t.status) !== "done");

  return (
    <div style={{ display: "flex", height: "calc(100vh - 40px)", margin: -8, background: C.bg, color: C.ink, fontFamily: C.sans, fontVariantNumeric: "tabular-nums", overflow: "hidden", position: "relative" }}>
      <div style={{ width: collapsed ? 62 : "fit-content", minWidth: collapsed ? 62 : 168, flex: "none", background: C.surface, borderRight: "1px solid " + C.line, display: "flex", flexDirection: "column", padding: "14px 10px", transition: "width .15s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 6px 8px" }}>
          <div style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>xG</div>
          {!collapsed && <div style={{ lineHeight: 1.15, whiteSpace: "nowrap" }}><div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>xGrowth × {CLIENT_NAME}</div><div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: C.faint2 }}>Console</div></div>}
        </div>
        <button onClick={() => setCollapsed((v) => !v)} title={collapsed ? "Expand" : "Collapse"} style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-end", border: "none", background: "none", cursor: "pointer", color: C.faint2, padding: "0 8px 10px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{collapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}</svg>
        </button>
        {NAV.map((n) => { const on = page === n.id; const badge = n.id === "tasks" && overdueAll.length > 0; return (
          <button key={n.id} onClick={() => { setPage(n.id); setAppId(null); }} title={collapsed ? n.label : undefined}
            style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 11, padding: collapsed ? "10px 0" : "9px 12px", marginBottom: 2, borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: on ? 650 : 500, whiteSpace: "nowrap", color: on ? C.accentDk : C.sub, background: on ? C.accentBg : "transparent" }}>
            <span style={{ display: "flex", flex: "none" }}><NavIcon id={n.id} color={on ? C.accentDk : C.sub} /></span>
            {!collapsed && <span>{n.label}</span>}
            {!collapsed && badge && <><span style={{ flex: 1 }} /><span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: "#FDECEE", color: "#C31C2B" }}>{overdueAll.length}</span></>}
            {collapsed && badge && <span style={{ position: "absolute", top: 6, right: 9, width: 7, height: 7, borderRadius: "50%", background: "#E02D3C" }} />}
          </button>); })}
        <div style={{ flex: 1 }} />
        {!collapsed && <div style={{ fontSize: 10.5, color: C.faint2, padding: "8px 10px", whiteSpace: "nowrap" }}>ClickUp · JedyApps</div>}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ height: 56, flex: "none", borderBottom: "1px solid " + C.line, background: C.surface, display: "flex", alignItems: "center", gap: 14, padding: "0 20px" }}>
          <div><div style={{ fontSize: 16, fontWeight: 700 }}>{pageTitle}</div>{page === "tasks" && <div style={{ fontSize: 11.5, color: C.faint }}>ClickUp · JedyApps</div>}</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => openCreate(null)} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New task</button>
          <AppMultiSelect apps={D.APPS} value={selApps} onChange={setSelApps} />
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          {page === "dashboard" && <ReportsDashboard />}
          {page === "apps" && <AppsTab {...{ ts, tsError, range, setRange, q, selApps, appId, setAppId, appTab, setAppTab, tasks, taskView, taskAppMap }} />}
          {page === "tests" && <TestsTab {...{ tasks, q, tfilter, setTfilter, openTask: setTestId }} />}
          {page === "tasks" && <TasksTab {...{ tasks, taskView, onMove }} />}
          {page === "settings" && <SettingsTab {...{ tasks, threshold, setThreshold, persist, savedAt, resetSaved }} />}
        </div>
      </div>

      {openTask && <Drawer {...{ tasks, openTask, setOpenTask, patchTask, setTasks, persist, flash }} />}
      {modal && <CreateModal {...{ modal, setModal, commitCreate }} />}
      {testId && <TestDetail {...{ tasks, testId, setTestId, openCreate }} />}
      {toast && <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#14161C", color: "#fff", padding: "9px 16px", borderRadius: 10, fontSize: 12.5, fontWeight: 550, boxShadow: "0 8px 24px rgba(0,0,0,.2)" }}>{toast}</div>}
    </div>
  );
}
