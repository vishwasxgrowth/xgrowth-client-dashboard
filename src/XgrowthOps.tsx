// @ts-nocheck
// Eval-free React port of the Xgrowth Ops dashboard (from the .dc.html).
// All five tabs, ported faithfully. No runtime eval / new Function.
import { useEffect, useMemo, useRef, useState } from "react";

import D from "./activeData";
const CLIENT_NAME = (import.meta.env.VITE_CLIENT_NAME || "Client");

const C = {
  bg: "#F6F7F9", panel: "#FAFAFC", surface: "#FFFFFF", line: "#E9EAF0",
  ink: "#14161C", sub: "#5B6172", faint: "#8A90A0", faint2: "#9AA0AE",
  accent: "#5B4BE8", accentDk: "#4E3FD8", accentBg: "#EFEDFF",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  sans: "'Instrument Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
};
const GROUPS = {
  todo: { label: "To Do", fg: "#5B6172", bg: "#F1F2F6", dot: "#9AA0AE" },
  progress: { label: "In Progress", fg: "#4E3FD8", bg: "#EFEDFF", dot: "#5B4BE8" },
  waiting: { label: "Waiting", fg: "#B45309", bg: "#FEF3C7", dot: "#D9730D" },
  blocked: { label: "Blocked", fg: "#C31C2B", bg: "#FDECEE", dot: "#E02D3C" },
  done: { label: "Done", fg: "#0B7A55", bg: "#E6F6F0", dot: "#0E9F6E" },
};
const S2G = { "to do": "todo", "in progress": "progress", development: "progress", rollout: "progress", "prd preparation": "progress", "mediation setup": "progress", test: "progress", live: "progress", "this week": "progress", waiting: "waiting", blocked: "blocked", done: "done", complete: "done", completed: "done" };
const PRIO = { urgent: "#E02D3C", high: "#D9730D", normal: "#2563EB", low: "#6B7180" };
const PRIO_BG = { urgent: "#FDECEE", high: "#FFF4E6", normal: "#EAF1FE", low: "#F1F2F6" };
const LISTS = ["Ongoing", "AdOps & Monetization", "Mediation Setup", "App Portfolio", "SDK Integration", "Tests & Experiments"];
const STATUSES = ["to do", "in progress", "development", "rollout", "waiting", "blocked", "done"];
const PRIORITIES = ["none", "low", "normal", "high", "urgent"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SAVE_KEY = "xgrowth-ops.workspace.v1";
const SAVE_VERSION = 1;

const money = (n) => (n >= 100000 ? "$" + (n / 1000).toFixed(0) + "K" : n >= 1000 ? "$" + Math.round(n).toLocaleString("en-US") : "$" + n.toFixed(2));
const money2 = (n) => "$" + n.toFixed(2);
const money4 = (n) => "$" + n.toFixed(4);
const compact = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : String(Math.round(n)));
const pct = (x) => (x * 100).toFixed(1) + "%";
function delta(cur, prev, invert) {
  const v = prev ? ((cur - prev) / prev) * 100 : 0;
  const good = invert ? v < 0 : v > 0;
  const flat = Math.abs(v) < 0.15;
  return { v, txt: (v >= 0 ? "+" : "") + v.toFixed(1) + "%", arrow: flat ? "→" : v > 0 ? "▲" : "▼", fg: flat ? "#8A90A0" : good ? "#0B7A55" : "#C31C2B", bg: flat ? "#F1F2F6" : good ? "#E6F6F0" : "#FDECEE" };
}
const initials = (s) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const appInitials = (name) => { const w = name.replace(/[^\w\s&]/g, "").split(/\s+/).filter(Boolean); return ((w[0] || "")[0] + ((w[1] || "")[0] || "")).toUpperCase(); };
function appColor(id) { const p = ["#5B4BE8", "#0E9F6E", "#D9730D", "#C2255C", "#0891B2", "#7C3AED", "#B45309", "#2563EB", "#DB2777", "#059669", "#E02D3C", "#6D28D9"]; let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return p[h % p.length]; }
const member = (name) => D.MEMBERS.find((x) => x.name === name) || { name: name || "Unassigned", initials: name ? initials(name) : "—", color: "#B4B9C4" };
const appName = (id) => { const a = D.APPS.find((x) => x.id === id); return a ? a.name : "—"; };
const group = (status) => GROUPS[S2G[status] || "todo"];
const groupId = (status) => S2G[status] || "todo";
const shortDate = (s) => { if (!s) return "—"; const d = new Date(s + "T00:00:00Z"); return MON[d.getUTCMonth()] + " " + d.getUTCDate(); };
function since(iso) { const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); if (s < 45) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago"; }
const MS = 86400000;
function computeDates(range, cs, ce) {
  if (range === "custom") {
    const a = D.parseDay(cs), b = D.parseDay(ce);
    const days = Math.max(1, Math.round((b - a) / MS) + 1);
    const cur = [], prev = [];
    for (let i = 0; i < days; i++) cur.push(D.dayKey(new Date(a.getTime() + i * MS)));
    for (let i = 0; i < days; i++) prev.push(D.dayKey(new Date(a.getTime() - (days - i) * MS)));
    return { cur, prev, days, sub: cs + " → " + ce, prevLine: "vs the " + days + " days immediately before" };
  }
  const days = range === "y" ? 1 : range === "7" ? 7 : 30;
  const cur = D.rangeDates(days, 1), prev = D.rangeDates(days, 1 + days);
  return { cur, prev, days, sub: cur[0] + " → " + cur[cur.length - 1], prevLine: days === 1 ? "vs " + prev[0] : "vs previous " + days + " days" };
}
function totals(dates) { let revenue = 0, imp = 0, dau = 0; for (const app of D.APPS) for (const ds of dates) { const r = D.dayRow(app, ds); revenue += r.revenue; imp += r.impressions; dau += r.dau; } return { revenue, imp, dau, ecpm: imp ? (revenue / imp) * 1000 : 0, arpdau: dau ? revenue / dau : 0 }; }
function sparkPath(vals, w, h) { if (!vals.length) return { line: "", area: "" }; const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1; const pts = vals.map((v, i) => [3 + (i / (vals.length - 1)) * (w - 6), h - 4 - ((v - mn) / sp) * (h - 8)]); const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" "); return { line, area: line + " L" + (w - 3) + " " + h + " L3 " + h + " Z" }; }

const NAV = [
  { id: "dashboard", label: "Dashboard" }, { id: "apps", label: "Applications" },
  { id: "tests", label: "Tests & Experiments" }, { id: "tasks", label: "Tasks" }, { id: "settings", label: "Settings" },
];
const Pill = ({ fg, bg, children }) => <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: fg, background: bg, whiteSpace: "nowrap" }}>{children}</span>;
const card = { background: C.surface, border: "1px solid " + C.line, borderRadius: 12 };
const Empty = ({ children }) => <div style={{ ...card, padding: 40, textAlign: "center", color: C.faint }}>{children}</div>;

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

export default function XgrowthOps() {
  const [page, setPage] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [range, setRange] = useState("7");
  const [cs, setCs] = useState("2026-07-12");
  const [ce, setCe] = useState("2026-08-10");
  const [sortKey, setSortKey] = useState("revenue");
  const [sortDir, setSortDir] = useState(-1);
  const [q, setQ] = useState("");
  const [selApps, setSelApps] = useState([]);
  const [appId, setAppId] = useState(null);
  const [appTab, setAppTab] = useState("dashboard");
  const [chartDays, setChartDays] = useState(30);
  const [hov, setHov] = useState(-1);
  const [tfilter, setTfilter] = useState("All");
  const [tview, setTview] = useState("list");
  const [tlist, setTlist] = useState("All lists");
  const [tassignee, setTassignee] = useState("All assignees");
  const [tq, setTq] = useState("");
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
  const tt = useRef();
  const flash = (text) => { clearTimeout(tt.current); setToast(text); tt.current = setTimeout(() => setToast(null), 2600); };
  const persist = (nextTasks, thr) => { const at = new Date().toISOString(); try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, at, tasks: nextTasks == null ? tasks : nextTasks, threshold: thr == null ? threshold : thr })); setSavedAt(at); } catch (e) {} };
  const patchTask = (id, patch) => setTasks((ts) => { const next = ts.map((t) => (t.id === id ? { ...t, ...patch } : t)); persist(next); return next; });
  const onMove = (id, statusName) => { patchTask(id, { status: statusName }); if (D.updateTaskStatus) D.updateTaskStatus(id, statusName).then(() => flash("Moved to " + statusName + " in ClickUp")).catch(() => flash("Could not update ClickUp")); };
  const resetSaved = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} setTasks(D.TASKS.map((t) => ({ ...t }))); setSavedAt(null); setOpenTask(null); flash("Reset to the ClickUp snapshot"); };

  const R = useMemo(() => computeDates(range, cs, ce), [range, cs, ce]);

  const openCreate = (ctx) => setModal({
    name: ctx && ctx.name ? ctx.name : "", list: (ctx && ctx.list) || "Ongoing", app: ctx && ctx.app ? appName(ctx.app) : "— none —",
    assignee: (ctx && ctx.assignee) || "Vishwas HD", priority: (ctx && ctx.priority) || "high", due: (ctx && ctx.due) || D.TODAY,
    ctxTitle: ctx && ctx.ctxTitle, ctxValue: ctx && ctx.ctxValue, ctxBad: !!(ctx && ctx.ctxBad),
  });
  const commitCreate = () => { const m = modal; if (!m) return; const app = D.APPS.find((a) => a.name === m.app); const t = { id: "869" + Math.random().toString(36).slice(2, 8), name: m.name || "Untitled task", status: "to do", assignee: m.assignee === "Unassigned" ? null : m.assignee, priority: m.priority === "none" ? null : m.priority, due: m.due || null, tags: [], list: m.list, app: app ? app.id : null }; setTasks((ts) => { const next = [t, ...ts]; persist(next); return next; }); setModal(null); flash("Created in ClickUp · " + m.list); };

  const taskView = (t) => {
    const g = group(t.status), m = member(t.assignee);
    const overdue = t.due && t.due < D.TODAY && groupId(t.status) !== "done";
    const done = groupId(t.status) === "done";
    return { id: t.id, name: t.name, status: t.status, sfg: g.fg, sbg: g.bg, list: t.list, app: t.app ? appName(t.app) : "—", hasApp: !!t.app,
      priority: t.priority || "—", pfg: PRIO[t.priority] || "#C4C8D2", pbg: PRIO_BG[t.priority] || "#F1F2F6", hasPriority: !!t.priority,
      due: t.due ? shortDate(t.due) : "—", dfg: overdue ? "#C31C2B" : "#8A90A0", ainit: m.initials, acolor: m.color,
      nfg: done ? "#9AA0AE" : "#14161C", strike: done ? "line-through" : "none", check: done ? "✓" : "", checkBd: done ? "#0E9F6E" : "#D3D6DE", checkBg: done ? "#0E9F6E" : "#fff",
      open: () => setOpenTask(t.id), toggle: (e) => { e.stopPropagation(); patchTask(t.id, { status: done ? "to do" : "done" }); } };
  };

  const pageTitle = NAV.find((n) => n.id === page).label;
  const overdueAll = tasks.filter((t) => t.due && t.due < D.TODAY && groupId(t.status) !== "done");

  return (
    <div style={{ display: "flex", height: "calc(100vh - 40px)", margin: -8, background: C.bg, color: C.ink, fontFamily: C.sans, overflow: "hidden", position: "relative" }}>
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
            {!collapsed && badge && <><span style={{ flex: 1 }} /><span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: "#FDECEE", color: "#C31C2B" }}>{overdueAll.length}</span></>}
            {collapsed && badge && <span style={{ position: "absolute", top: 6, right: 9, width: 7, height: 7, borderRadius: "50%", background: "#E02D3C" }} />}
          </button>); })}
        <div style={{ flex: 1 }} />
        {!collapsed && <div style={{ fontSize: 10.5, color: C.faint2, padding: "8px 10px", whiteSpace: "nowrap" }}>ClickUp · JedyApps</div>}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ height: 56, flex: "none", borderBottom: "1px solid " + C.line, background: C.surface, display: "flex", alignItems: "center", gap: 14, padding: "0 20px" }}>
          <div><div style={{ fontSize: 16, fontWeight: 700 }}>{pageTitle}</div>{page === "dashboard" && <div style={{ fontSize: 11.5, color: C.faint }}>{R.sub}</div>}{page === "tasks" && <div style={{ fontSize: 11.5, color: C.faint }}>ClickUp · JedyApps</div>}</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => openCreate(null)} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New task</button>
          <AppMultiSelect apps={D.APPS} value={selApps} onChange={setSelApps} />
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          {page === "dashboard" && <DashboardTab {...{ R, range, setRange, cs, setCs, ce, setCe, selApps, sortKey, setSortKey, sortDir, setSortDir, threshold, openApp: (id) => { setPage("apps"); setAppId(id); setAppTab("dashboard"); setHov(-1); } }} />}
          {page === "apps" && <AppsTab {...{ R, q, selApps, appId, setAppId, appTab, setAppTab, chartDays, setChartDays, hov, setHov, tasks, taskView, openTest: setTestId }} />}
          {page === "tests" && <TestsTab {...{ tasks, q, tfilter, setTfilter, openTask: setOpenTask }} />}
          {page === "tasks" && <TasksTab {...{ tasks, taskView, tview, setTview, tlist, setTlist, tassignee, setTassignee, tq, setTq, onMove }} />}
          {page === "settings" && <SettingsTab {...{ tasks, threshold, setThreshold, persist, savedAt, resetSaved }} />}
        </div>
      </div>

      {openTask && <Drawer {...{ tasks, openTask, setOpenTask, patchTask, setTasks, persist, flash }} />}
      {modal && <CreateModal {...{ modal, setModal, commitCreate }} />}
      {testId && <TestResults {...{ testId, setTestId, openCreate }} />}
      {toast && <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#14161C", color: "#fff", padding: "9px 16px", borderRadius: 10, fontSize: 12.5, fontWeight: 550, boxShadow: "0 8px 24px rgba(0,0,0,.2)" }}>{toast}</div>}
    </div>
  );
}

const TIERS = {
  T1: { name: "Core", label: "Tier 1", color: "#4E3FD8", bg: "#EFEDFF", drop: 10, respond: "same-day" },
  T2: { name: "Growth", label: "Tier 2", color: "#0B7A55", bg: "#E6F6F0", drop: 20, respond: "within 24h" },
  T3: { name: "Stable", label: "Tier 3", color: "#B45309", bg: "#FEF3C7", drop: 30, respond: "within 48h" },
  T4: { name: "Long-Tail", label: "Tier 4", color: "#5B6172", bg: "#F1F2F6", drop: 40, respond: "within 48h" },
};
function tierOf(rev30) { return rev30 >= 15000 ? "T1" : rev30 >= 3000 ? "T2" : rev30 >= 500 ? "T3" : "T4"; }
function totalsFor(list, dates) { let revenue = 0, imp = 0, dau = 0; for (const app of list) for (const ds of dates) { const r = D.dayRow(app, ds); revenue += r.revenue; imp += r.impressions; dau += r.dau; } return { revenue, imp, dau, ecpm: imp ? (revenue / imp) * 1000 : 0, arpdau: dau ? revenue / dau : 0 }; }

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

function DashboardTab({ R, range, setRange, cs, setCs, ce, setCe, selApps, sortKey, setSortKey, sortDir, setSortDir, openApp }) {
  const [tierFilter, setTierFilter] = useState([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const tiers = useMemo(() => { const win = D.rangeDates(30, 1); const m = {}; for (const app of D.APPS) m[app.id] = tierOf(D.aggregate(app, win).revenue); return m; }, []);
  const pool = useMemo(() => (selApps.length ? D.APPS.filter((a) => selApps.includes(a.id)) : D.APPS), [selApps]);

  const kpis = useMemo(() => {
    const cur = totalsFor(pool, R.cur), prv = totalsFor(pool, R.prev);
    const sparkDaily = D.rangeDates(14, 1).map((ds) => totalsFor(pool, [ds]));
    return [
      { label: "Revenue", value: money(cur.revenue), c: cur.revenue, p: prv.revenue, series: sparkDaily.map((d) => d.revenue) },
      { label: "eCPM", value: money2(cur.ecpm), c: cur.ecpm, p: prv.ecpm, series: sparkDaily.map((d) => d.ecpm) },
      { label: "Impressions", value: compact(cur.imp), c: cur.imp, p: prv.imp, series: sparkDaily.map((d) => d.imp) },
    ].map((k) => ({ ...k, d: delta(k.c, k.p), spark: sparkPath(k.series, 112, 30) }));
  }, [R, pool]);

  const metricCols = [
    { k: "revenue", label: "Estimated earnings", fmt: money }, { k: "ecpm", label: "Observed eCPM", fmt: money2 },
    { k: "requests", label: "Requests", fmt: compact }, { k: "matchRate", label: "Match rate", fmt: pct },
    { k: "matched", label: "Matched requests", fmt: compact }, { k: "showRate", label: "Show rate", fmt: pct },
    { k: "impressions", label: "Impressions", fmt: compact }, { k: "ctr", label: "CTR", fmt: pct },
    { k: "clicks", label: "Clicks", fmt: compact }, { k: "arpv", label: "Ads ARPV", fmt: money4 }, { k: "arpdav", label: "Ads ARPDAV", fmt: money4 },
  ];

  // Flagged = yesterday vs day-before drop beyond the app's tier threshold (always freshest movement)
  const flaggedIds = useMemo(() => {
    const yest = D.rangeDates(1, 1), prevDay = D.rangeDates(1, 2);
    const ids = [];
    for (const app of pool) {
      const rev30 = D.aggregate(app, D.rangeDates(30, 1)).revenue;
      if (rev30 < 1500) continue; // held out (~<$50/day)
      const dr = delta(D.aggregate(app, yest).revenue, D.aggregate(app, prevDay).revenue);
      if (dr.v < -TIERS[tiers[app.id]].drop) ids.push(app.id);
    }
    return ids;
  }, [pool, tiers]);

  const { rows } = useMemo(() => {
    const enrich = (o) => ({ ...o, arpv: o.impressions ? o.revenue / o.impressions : 0, arpdav: o.dau ? o.revenue / o.dau : 0 });
    let base = pool;
    if (flaggedOnly) base = base.filter((a) => flaggedIds.includes(a.id));
    else if (tierFilter.length) base = base.filter((a) => tierFilter.includes(tiers[a.id]));
    const agg = base.map((app) => ({ app, a: enrich(D.aggregate(app, R.cur)), b: enrich(D.aggregate(app, R.prev)) }));
    agg.sort((x, y) => (sortKey === "name" ? x.app.name.localeCompare(y.app.name) * -sortDir : ((x.a[sortKey] || 0) - (y.a[sortKey] || 0)) * sortDir));
    const rws = agg.map(({ app, a, b }) => {
      const tk = tiers[app.id], T = TIERS[tk];
      const cells = metricCols.map((c) => ({ v: c.fmt(a[c.k] || 0), d: delta(a[c.k] || 0, b[c.k] || 0) }));
      return { id: app.id, name: app.name, tierKey: tk, tierColor: T.color, tierBg: T.bg, initials: appInitials(app.name), color: appColor(app.id), cells };
    });
    return { rows: rws };
  }, [R, pool, tierFilter, flaggedOnly, flaggedIds, sortKey, sortDir, tiers]);
  const alerts = flaggedIds.length;

  const sortCol = (k) => { setSortKey(k); setSortDir((d) => (sortKey === k ? -d : -1)); };
  const APPW = 250, COLW = 132, HEADBG = "#FAFAFC";
  const hbase = { fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", padding: "10px 14px", background: HEADBG, borderBottom: "1px solid " + C.line, whiteSpace: "nowrap", cursor: "pointer" };
  const cbase = { padding: "10px 14px", borderBottom: "1px solid #F1F2F6", whiteSpace: "nowrap" };
  const caret = (k) => (sortKey === k ? (sortDir === -1 ? " ▼" : " ▲") : "");

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", background: "#EDEEF2", borderRadius: 9, padding: 3 }}>
          {[["y", "Yesterday"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["custom", "Custom range"]].map(([id, label]) => (
            <button key={id} onClick={() => setRange(id)} style={{ border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: range === id ? 650 : 550, padding: "5px 12px", borderRadius: 7, background: range === id ? "#fff" : "transparent", color: range === id ? C.ink : "#6B7180", boxShadow: range === id ? "0 1px 2px rgba(16,24,40,.1)" : "none" }}>{label}</button>
          ))}
        </div>
        {range === "custom" && <><input type="date" value={cs} onChange={(e) => setCs(e.target.value)} style={{ height: 32, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px" }} /><span style={{ color: C.faint }}>→</span><input type="date" value={ce} onChange={(e) => setCe(e.target.value)} style={{ height: 32, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px" }} /></>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ ...card, padding: "16px 18px", display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: C.faint }}>{k.label}</div>
              <div style={{ fontFamily: C.mono, fontSize: 26, fontWeight: 600, margin: "6px 0" }}>{k.value}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Pill fg={k.d.fg} bg={k.d.bg}>{k.d.arrow} {k.d.txt.replace("+", "")}</Pill><span style={{ fontSize: 10.5, color: C.faint2 }}>{R.prevLine}</span></div>
            </div>
            <svg width="112" height="30" viewBox="0 0 112 30" style={{ alignSelf: "flex-end" }}><path d={k.spark.area} fill="rgba(91,75,232,.10)" /><path d={k.spark.line} fill="none" stroke={C.accent} strokeWidth="1.6" /></svg>
          </div>
        ))}
      </div>

      <RevenueChart dates={R.cur} pool={pool} selectionActive={selApps.length > 0} />

      {alerts > 0 && <div onClick={() => { setFlaggedOnly((v) => !v); setTierFilter([]); }} style={{ background: flaggedOnly ? "#C31C2B" : "#FDECEE", border: "1px solid " + (flaggedOnly ? "#C31C2B" : "#F8D3D7"), color: flaggedOnly ? "#fff" : "#C31C2B", borderRadius: 10, padding: "9px 14px", marginBottom: 14, fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
        <span>{alerts === 1 ? "1 app flagged" : alerts + " apps flagged"} — revenue down vs the day before, beyond its tier threshold</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700 }}>{flaggedOnly ? "Showing flagged · clear ×" : "View flagged →"}</span>
      </div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.faint }}>Tiers:</span>
        {["T1", "T2", "T3", "T4"].map((t) => { const on = tierFilter.includes(t); const T = TIERS[t]; return (
          <button key={t} onClick={() => { setFlaggedOnly(false); setTierFilter(on ? tierFilter.filter((x) => x !== t) : [...tierFilter, t]); }} style={{ border: "1px solid " + (on ? T.color : C.line), background: on ? T.bg : "#fff", color: on ? T.color : C.sub, cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 20 }}>{t}</button>
        ); })}
        {tierFilter.length > 0 && <button onClick={() => setTierFilter([])} style={{ border: "none", background: "none", color: C.accent, cursor: "pointer", fontSize: 12 }}>Clear</button>}
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflow: "auto", maxHeight: "58vh" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "max-content", minWidth: "100%" }}>
            <thead>
              <tr>
                <th onClick={() => sortCol("name")} style={{ ...hbase, position: "sticky", top: 0, left: 0, zIndex: 3, width: APPW, minWidth: APPW, textAlign: "left", borderRight: "1px solid " + C.line, color: sortKey === "name" ? C.ink : C.faint }}>App{caret("name")}</th>
                {metricCols.map((c) => <th key={c.k} onClick={() => sortCol(c.k)} style={{ ...hbase, position: "sticky", top: 0, zIndex: 2, width: COLW, minWidth: COLW, textAlign: "right", color: sortKey === c.k ? C.ink : C.faint }}>{c.label}{caret(c.k)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => openApp(r.id)} style={{ cursor: "pointer" }}>
                  <td style={{ ...cbase, position: "sticky", left: 0, zIndex: 1, background: "#fff", width: APPW, minWidth: APPW, borderRight: "1px solid " + C.line }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: r.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{r.initials}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: APPW - 60 }}>{r.name}</div>
                        <span style={{ display: "inline-block", marginTop: 3, fontSize: 10, fontWeight: 700, letterSpacing: ".02em", padding: "1px 8px", borderRadius: 20, color: r.tierColor, background: r.tierBg }}>{r.tierKey}</span>
                      </div>
                    </div>
                  </td>
                  {r.cells.map((c, i) => <td key={i} style={{ ...cbase, textAlign: "right" }}><div style={{ fontFamily: C.mono, fontSize: 12.5 }}>{c.v}</div><div style={{ fontFamily: C.mono, fontSize: 10.5, color: c.d.fg }}>{c.d.arrow} {c.d.txt.replace("+", "")}</div></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AppsTab({ R, q, selApps, appId, setAppId, appTab, setAppTab, chartDays, setChartDays, hov, setHov, tasks, taskView, openTest }) {
  if (!appId) {
    const qq = q.trim().toLowerCase();
    const cards = D.APPS.filter((app) => (!selApps || !selApps.length || selApps.includes(app.id)) && (!qq || app.name.toLowerCase().includes(qq))).map((app) => { const a = D.aggregate(app, R.cur), b = D.aggregate(app, R.prev), d = delta(a.revenue, b.revenue); return { app, rev: money(a.revenue), d, ecpm: money2(a.ecpm), arpdau: money4(a.arpdau), open: tasks.filter((t) => t.app === app.id && groupId(t.status) !== "done").length }; });
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
        {cards.map(({ app, rev, d, ecpm, arpdau, open }) => (
          <div key={app.id} onClick={() => { setAppId(app.id); setAppTab("dashboard"); setHov(-1); }} style={{ ...card, padding: 16, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: appColor(app.id), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{appInitials(app.name)}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.name}</div><div style={{ fontSize: 11, color: C.faint2 }}>{app.cat} · {app.tier} · {app.store}</div></div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600 }}>{rev}</div><Pill fg={d.fg} bg={d.bg}>{d.arrow} {d.txt.replace("+", "")}</Pill></div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: C.sub }}><span>eCPM <b style={{ fontFamily: C.mono }}>{ecpm}</b></span><span>ARPDAU <b style={{ fontFamily: C.mono }}>{arpdau}</b></span><span>{open} open</span></div>
          </div>
        ))}
      </div>
    );
  }
  const app = D.APPS.find((a) => a.id === appId);
  const a = D.aggregate(app, R.cur), b = D.aggregate(app, R.prev);
  const stats = [{ label: "Revenue", v: money(a.revenue), d: delta(a.revenue, b.revenue) }, { label: "eCPM", v: money2(a.ecpm), d: delta(a.ecpm, b.ecpm) }, { label: "Impressions", v: compact(a.impressions), d: delta(a.impressions, b.impressions) }, { label: "Match rate", v: pct(a.matchRate), d: delta(a.matchRate, b.matchRate) }];
  const appTasks = tasks.filter((t) => t.app === app.id).map(taskView);
  const appTests = D.EXPERIMENTS.filter((x) => x.app === app.id);
  const cd = D.rangeDates(chartDays, 1); const vals = cd.map((ds) => D.dayRow(app, ds).revenue);
  const mn = Math.min(...vals) * 0.9, mx = Math.max(...vals) * 1.06, sp = mx - mn || 1;
  const X = (i) => 60 + (i / (vals.length - 1)) * 850, Y = (v) => 24 + (1 - (v - mn) / sp) * 200;
  const line = vals.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
  const grid = [0, 1, 2, 3, 4].map((i) => { const v = mn + (sp * (4 - i)) / 4; return { y: Y(v).toFixed(1), label: money(v) }; });
  const step = Math.max(1, Math.round(vals.length / 6));
  const xlabels = cd.map((ds, i) => ({ i, x: X(i), label: shortDate(ds) })).filter((t) => t.i % step === 0);
  const hovering = hov >= 0 && hov < vals.length;
  return (
    <div>
      <button onClick={() => setAppId(null)} style={{ border: "none", background: "none", cursor: "pointer", color: C.sub, fontSize: 13, marginBottom: 12 }}>← Applications</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: appColor(app.id), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>{appInitials(app.name)}</div>
        <div><div style={{ fontSize: 18, fontWeight: 700 }}>{app.name}</div><div style={{ fontSize: 12, color: C.faint2 }}>{app.cat} · {app.tier} · {app.store}</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {stats.map((s) => <div key={s.label} style={{ ...card, padding: "12px 14px" }}><div style={{ fontSize: 10.5, textTransform: "uppercase", color: C.faint, fontWeight: 600 }}>{s.label}</div><div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 600, margin: "4px 0" }}>{s.v}</div><div style={{ fontFamily: C.mono, fontSize: 10.5, color: s.d.fg }}>{s.d.arrow} {s.d.txt.replace("+", "")}</div></div>)}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid " + C.line }}>
        {[["dashboard", "Dashboard"], ["tasks", "Tasks"], ["tests", "Tests"]].map(([id, label]) => <button key={id} onClick={() => setAppTab(id)} style={{ border: "none", background: "none", cursor: "pointer", padding: "8px 2px", marginRight: 14, fontSize: 13.5, fontWeight: appTab === id ? 700 : 500, color: appTab === id ? C.accent : C.ink, borderBottom: appTab === id ? "2px solid " + C.accent : "2px solid transparent" }}>{label}</button>)}
      </div>
      {appTab === "dashboard" && (
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}><b style={{ fontSize: 14 }}>Revenue</b><div style={{ flex: 1 }} /><div style={{ display: "flex", background: "#EDEEF2", borderRadius: 8, padding: 3 }}>{[[14, "14D"], [30, "30D"], [90, "90D"]].map(([n, label]) => <button key={n} onClick={() => { setChartDays(n); setHov(-1); }} style={{ border: "none", cursor: "pointer", fontSize: 12, fontWeight: chartDays === n ? 650 : 550, padding: "4px 10px", borderRadius: 6, background: chartDays === n ? "#fff" : "transparent", color: chartDays === n ? C.ink : "#6B7180" }}>{label}</button>)}</div></div>
          <svg viewBox="0 0 920 260" style={{ width: "100%" }} onMouseLeave={() => setHov(-1)}>
            {grid.map((g, i) => <g key={i}><line x1="60" x2="910" y1={g.y} y2={g.y} stroke="#F1F2F6" /><text x="52" y={Number(g.y) + 3} textAnchor="end" fontSize="10" fill="#9AA0AE" fontFamily="monospace">{g.label}</text></g>)}
            <path d={line + " L" + X(vals.length - 1).toFixed(1) + " 232 L60 232 Z"} fill="rgba(91,75,232,.08)" />
            <path d={line} fill="none" stroke={C.accent} strokeWidth="2" />
            {xlabels.map((t) => <text key={t.i} x={t.x} y="250" textAnchor="middle" fontSize="10" fill="#9AA0AE">{t.label}</text>)}
            {cd.map((ds, i) => <rect key={i} x={X(i) - 850 / vals.length / 2} y="24" width={850 / vals.length} height="208" fill="transparent" onMouseEnter={() => setHov(i)} />)}
            {hovering && <><line x1={X(hov)} x2={X(hov)} y1="24" y2="232" stroke={C.accent} strokeDasharray="3 3" /><circle cx={X(hov)} cy={Y(vals[hov])} r="4" fill={C.accent} /></>}
          </svg>
          {hovering && <div style={{ fontFamily: C.mono, fontSize: 12, color: C.sub, marginTop: 6 }}>{cd[hov]} · {money(vals[hov])}</div>}
        </div>
      )}
      {appTab === "tasks" && (appTasks.length ? <TaskList rows={appTasks} /> : <Empty>No tasks for this app.</Empty>)}
      {appTab === "tests" && (appTests.length ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{appTests.map((x) => { const g = group(x.status); return <div key={x.id} onClick={() => openTest(x.id)} style={{ ...card, padding: 14, cursor: "pointer" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ fontSize: 13.5 }}>{x.name}</b><div style={{ flex: 1 }} /><Pill fg={g.fg} bg={g.bg}>{x.status}</Pill></div><div style={{ fontSize: 12, color: C.sub, marginTop: 5 }}>{x.hypothesis}</div></div>; })}</div> : <Empty>No experiments for this app.</Empty>)}
    </div>
  );
}

function TestsTab({ tasks, q, tfilter, setTfilter, openTask }) {
  const tests = tasks.filter((t) => /test|experiment/i.test(t.list));
  const counts = { All: tests.length };
  tests.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
  const statuses = [...new Map(tests.map((t) => [t.status, t.statusColor || "#9AA0AE"])).entries()];
  const qq = q.trim().toLowerCase();
  const shown = tests.filter((t) => (tfilter === "All" || t.status === tfilter) && (!qq || t.name.toLowerCase().includes(qq) || (t.assignee || "").toLowerCase().includes(qq)));
  const prog = (t) => { if (groupId(t.status) === "done") return 1; if (!t.start || !t.due) return 0.4; const s0 = new Date(t.start).getTime(), e0 = new Date(t.due).getTime(), n0 = new Date(D.TODAY).getTime(); return Math.max(0.02, Math.min(1, (n0 - s0) / (e0 - s0 || 1))); };
  const chip = (on, color) => ({ border: "1px solid " + (on ? (color || C.accent) : C.line), background: on ? (color ? color + "22" : C.accent) : "#fff", color: on ? (color || "#fff") : C.sub, cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 20 });
  const clean = (dd) => (dd || "").replace(/\[table-embed[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ").replace(/\s+/g, " ").trim();
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setTfilter("All")} style={chip(tfilter === "All")}>All experiments · {counts.All}</button>
        {statuses.map(([name, color]) => <button key={name} onClick={() => setTfilter(name)} style={chip(tfilter === name, color)}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 6 }} />{name} · {counts[name]}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
        {shown.map((t) => { const p = prog(t); const m = member(t.assignee || ""); const pc = groupId(t.status) === "done" ? "#0E9F6E" : /block/i.test(t.status) ? "#E02D3C" : "#5B4BE8"; return (
          <div key={t.id} onClick={() => openTask(t.id)} style={{ ...card, padding: 16, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><b style={{ fontSize: 13.5, lineHeight: 1.3 }}>{t.name}</b><div style={{ flex: 1 }} /><span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: t.statusColor || "#9AA0AE" }}>{t.status}</span></div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.45, minHeight: 34, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{clean(t.desc) || "—"}</div>
            <div style={{ height: 6, borderRadius: 4, background: "#F1F2F6", overflow: "hidden", marginBottom: 10 }}><div style={{ width: (p * 100) + "%", height: "100%", background: pc }} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.faint2 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: m.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{m.initials}</span>
              <span>{t.assignee || "Unassigned"}</span><div style={{ flex: 1 }} /><span style={{ fontFamily: C.mono }}>{t.start ? shortDate(t.start) : "—"} → {t.due ? shortDate(t.due) : "—"}</span>
            </div>
          </div>
        ); })}
      </div>
      {shown.length === 0 && <Empty>No experiments match.</Empty>}
    </>
  );
}

function TaskList({ rows }) {
  return (
    <div style={{ ...card, overflow: "hidden" }}>
      {rows.map((t) => (
        <div key={t.id} onClick={t.open} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 150px 110px 90px 80px 30px", gap: 12, alignItems: "center", padding: "11px 14px", borderBottom: "1px solid #F1F2F6", cursor: "pointer" }}>
          <div onClick={t.toggle} style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid " + t.checkBd, background: t.checkBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{t.check}</div>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 550, color: t.nfg, textDecoration: t.strike, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div><div style={{ fontSize: 11, color: C.faint2 }}>{t.list}{t.hasApp ? " · " + t.app : ""}</div></div>
          <div style={{ fontSize: 12, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.hasApp ? t.app : "—"}</div>
          <Pill fg={t.sfg} bg={t.sbg}>{t.status}</Pill>
          {t.hasPriority ? <Pill fg={t.pfg} bg={t.pbg}>{t.priority}</Pill> : <span style={{ color: C.faint2, fontSize: 12 }}>—</span>}
          <span style={{ fontFamily: C.mono, fontSize: 12, color: t.dfg }}>{t.due}</span>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: t.acolor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{t.ainit}</div>
        </div>
      ))}
    </div>
  );
}
function GroupedTaskList({ items, taskView, statuses }) {
  const groups = statuses.map((st) => ({ ...st, list: items.filter((t) => t.status === st.name) })).filter((g) => g.list.length);
  if (!groups.length) return <Empty>No tasks match.</Empty>;
  return (
    <div style={{ ...card, overflow: "hidden" }}>
      {groups.map((g) => (
        <div key={g.name}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: C.panel, borderBottom: "1px solid " + C.line }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: g.color }} />
            <b style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>{g.name}</b>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: "#fff", background: g.color, borderRadius: 20, padding: "0 7px" }}>{g.list.length}</span>
          </div>
          {g.list.map((t) => { const tv = taskView(t); const overdue = t.due && t.due < D.TODAY && groupId(t.status) !== "done"; return (
            <div key={t.id} onClick={tv.open} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 190px 150px", gap: 12, alignItems: "center", padding: "11px 14px", borderBottom: "1px solid #F1F2F6", borderLeft: "3px solid " + (t.statusColor || g.color), cursor: "pointer" }}>
              <div onClick={tv.toggle} style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid " + tv.checkBd, background: tv.checkBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{tv.check}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 550, color: tv.nfg, textDecoration: tv.strike, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div><div style={{ fontSize: 11, color: C.faint2 }}>{t.list}</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><div style={{ width: 24, height: 24, flex: "none", borderRadius: "50%", background: tv.acolor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{tv.ainit}</div><span style={{ fontSize: 12.5, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.assignee || "Unassigned"}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>{overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#C31C2B", background: "#FDECEE", padding: "1px 7px", borderRadius: 6 }}>OVERDUE</span>}<span style={{ fontFamily: C.mono, fontSize: 12.5, color: overdue ? "#C31C2B" : C.sub }}>{tv.due}</span></div>
            </div>
          ); })}
        </div>
      ))}
    </div>
  );
}

function TasksTab({ tasks, taskView, tview, setTview, tlist, setTlist, tassignee, setTassignee, tq, setTq, onMove }) {
  const meta = D.LISTS_META;
  const listNames = meta ? Object.keys(meta) : LISTS;
  const [quick, setQuick] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const tqq = tq.trim().toLowerCase();

  const scope = tasks.filter((t) => (tlist === "All lists" || t.list === tlist) && (tassignee === "All assignees" || t.assignee === tassignee) && (!tqq || t.name.toLowerCase().includes(tqq)));
  const base = quick === "overdue" ? scope.filter((t) => t.due && t.due < D.TODAY && groupId(t.status) !== "done")
    : quick === "today" ? scope.filter((t) => t.due === D.TODAY && groupId(t.status) !== "done")
    : quick === "open" ? scope.filter((t) => groupId(t.status) !== "done") : scope;
  const filtered = statusFilter ? base.filter((t) => t.status === statusFilter) : base;

  const od = tasks.filter((t) => t.due && t.due < D.TODAY && groupId(t.status) !== "done").length;
  const dtoday = tasks.filter((t) => t.due === D.TODAY && groupId(t.status) !== "done").length;
  const openN = tasks.filter((t) => groupId(t.status) !== "done").length;

  const useReal = !!(meta && tlist !== "All lists" && meta[tlist]);
  const statusList = useReal ? meta[tlist].map((s) => ({ name: s.name, color: s.color || "#9AA0AE" })) : [...new Map(base.map((t) => [t.status, { name: t.status, color: t.statusColor || "#9AA0AE" }])).values()];
  const statusCount = (name) => base.filter((t) => t.status === name).length;

  const columns = useReal ? meta[tlist].map((s) => ({ label: s.name, color: s.color || "#9AA0AE", key: s.name })) : ["todo", "progress", "waiting", "blocked", "done"].map((gid) => ({ label: GROUPS[gid].label, color: GROUPS[gid].dot, key: gid }));
  const colTasks = (col) => filtered.filter((t) => (useReal ? t.status === col.key : groupId(t.status) === col.key));
  const order = { blocked: 0, progress: 1, waiting: 2, todo: 3, done: 4 };
  const rows = filtered.slice().sort((a, b) => order[groupId(a.status)] - order[groupId(b.status)] || (a.due || "9").localeCompare(b.due || "9")).map(taskView);
  const sel = { height: 32, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px", fontSize: 12.5, background: "#fff" };
  const drop = (k) => { if (dragId && useReal) onMove(dragId, k); setDragId(null); setOverCol(null); };
  const chip = (on, color, bg) => ({ border: "1px solid " + (on ? color : C.line), background: on ? bg : "#fff", color: on ? color : C.sub, cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 20, display: "inline-flex", alignItems: "center" });

  const kpi = (id, label, v, tone) => (
    <button key={id} onClick={() => { setQuick(quick === id ? null : id); setTview("list"); setStatusFilter(null); }}
      style={{ ...card, padding: 14, textAlign: "left", cursor: "pointer", background: quick === id ? (tone === "#C31C2B" ? "#FDECEE" : C.accentBg) : "#fff", borderColor: quick === id ? (tone === "#C31C2B" ? "#F8D3D7" : C.accent) : C.line }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", color: C.faint, fontWeight: 600, marginBottom: 4 }}>{label}{quick === id ? " · filtering" : ""}</div>
      <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600, color: tone }}>{v}</div>
    </button>
  );

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
        {kpi("overdue", "Overdue", od, od ? "#C31C2B" : C.ink)}
        {kpi("today", "Due today", dtoday, C.ink)}
        {kpi("open", "Open tasks", openN, C.ink)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: "#EDEEF2", borderRadius: 9, padding: 3 }}>{[["list", "List"], ["board", "Board"]].map(([id, label]) => <button key={id} onClick={() => setTview(id)} style={{ border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: tview === id ? 650 : 550, padding: "5px 14px", borderRadius: 7, background: tview === id ? "#fff" : "transparent", color: tview === id ? C.ink : "#6B7180" }}>{label}</button>)}</div>
        <select value={tlist} onChange={(e) => { setTlist(e.target.value); setStatusFilter(null); }} style={sel}>{["All lists", ...listNames].map((l) => <option key={l}>{l}</option>)}</select>
        <select value={tassignee} onChange={(e) => setTassignee(e.target.value)} style={sel}>{["All assignees", ...D.MEMBERS.map((m) => m.name)].map((l) => <option key={l}>{l}</option>)}</select>
        <input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="Filter tasks…" style={{ ...sel, width: 180 }} />
        {quick && <button onClick={() => setQuick(null)} style={{ border: "none", background: "none", color: C.accent, cursor: "pointer", fontSize: 12 }}>Clear filter</button>}
      </div>

      {tview === "list" && useReal && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={() => setStatusFilter(null)} style={chip(!statusFilter, C.accent, C.accentBg)}>All · {base.length}</button>
          {statusList.map((st) => <button key={st.name} onClick={() => setStatusFilter(statusFilter === st.name ? null : st.name)} style={chip(statusFilter === st.name, st.color, st.color + "22")}><span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, marginRight: 6 }} />{st.name} · {statusCount(st.name)}</button>)}
        </div>
      )}

      {tview === "list" ? (<GroupedTaskList items={filtered} taskView={taskView} statuses={useReal ? meta[tlist].map((x) => ({ name: x.name, color: x.color || "#9AA0AE" })) : [...new Map(filtered.map((t) => [t.status, { name: t.status, color: t.statusColor || "#9AA0AE" }])).values()]} />) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + columns.length + ",minmax(210px,1fr))", gap: 12, alignItems: "start", overflowX: "auto" }}>
          {columns.map((col) => {
            const list = colTasks(col); const on = overCol === col.key;
            return (
              <div key={col.key} onDragOver={(e) => { if (useReal) { e.preventDefault(); setOverCol(col.key); } }} onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))} onDrop={() => drop(col.key)}
                style={{ ...card, padding: 10, background: on ? "#F3F1FE" : C.panel, borderColor: on ? C.accent : C.line, borderTop: "3px solid " + col.color }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "2px 4px" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: col.color }} /><b style={{ fontSize: 12.5 }}>{col.label}</b>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: "#fff", background: col.color, borderRadius: 20, padding: "0 7px" }}>{list.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 20 }}>
                  {list.map((t) => { const tv = taskView(t); return (
                    <div key={t.id} draggable={useReal} onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOverCol(null); }} onClick={tv.open}
                      style={{ ...card, padding: 10, cursor: useReal ? "grab" : "pointer", opacity: dragId === t.id ? 0.4 : 1, borderLeft: "3px solid " + (t.statusColor || col.color) }}>
                      <div style={{ fontSize: 12.5, fontWeight: 550, color: tv.nfg, textDecoration: tv.strike, marginBottom: 6 }}>{t.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{tv.hasPriority && <Pill fg={tv.pfg} bg={tv.pbg}>{tv.priority}</Pill>}{t.commentCount > 0 && <span style={{ fontSize: 10.5, color: C.faint2 }}>💬 {t.commentCount}</span>}<div style={{ flex: 1 }} /><span style={{ fontFamily: C.mono, fontSize: 10.5, color: tv.dfg }}>{tv.due}</span><div style={{ width: 22, height: 22, borderRadius: "50%", background: tv.acolor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{tv.ainit}</div></div>
                    </div>
                  ); })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function SettingsTab({ tasks, threshold, setThreshold, persist, savedAt, resetSaved }) {
  const connections = [
    { mark: "C", color: "#7B68EE", name: "ClickUp", detail: "Space JedyApps · folder 901210858217 · " + tasks.length + " tasks synced", status: "Connected", sfg: "#0B7A55", sbg: "#E6F6F0" },
    { mark: "A", color: "#EA4335", name: "Google AdMob", detail: "pub-9924… · mediation report API · 12 apps", status: "Connected", sfg: "#0B7A55", sbg: "#E6F6F0" },
    { mark: "F", color: "#0E9F6E", name: "Firebase", detail: "Remote Config experiments · read-only", status: "Connected", sfg: "#0B7A55", sbg: "#E6F6F0" },
    { mark: "M", color: "#1877F2", name: "Meta Audience Network", detail: "Placement mapping incomplete for 6 apps", status: "Action needed", sfg: "#B45309", sbg: "#FEF3C7" },
  ];
  const members = D.MEMBERS.map((m) => ({ ...m, open: tasks.filter((t) => t.assignee === m.name && groupId(t.status) !== "done").length, role: m.name === "Vishwas HD" ? "Ad Ops Lead" : m.name === "Nadiya Hassan" ? "Ad Ops" : m.name === "Igor Aliev" ? "SDK / Dev" : "Product" }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <div style={card}><div style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, borderBottom: "1px solid " + C.line }}>Connections</div>
        {connections.map((c) => <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #F1F2F6" }}><div style={{ width: 34, height: 34, borderRadius: 9, background: c.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{c.mark}</div><div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: 11.5, color: C.faint2 }}>{c.detail}</div></div><Pill fg={c.sfg} bg={c.sbg}>{c.status}</Pill></div>)}
      </div>
      <div style={card}><div style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, borderBottom: "1px solid " + C.line }}>Team</div>
        {members.map((m) => <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #F1F2F6" }}><div style={{ width: 32, height: 32, borderRadius: "50%", background: m.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{m.initials}</div><div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div><div style={{ fontSize: 11.5, color: C.faint2 }}>{m.role}</div></div><span style={{ fontFamily: C.mono, fontSize: 12, color: C.sub }}>{m.open} open</span></div>)}
      </div>
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>How apps are tiered</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 8 }}>Each app is assigned a tier by its trailing 30-day ad revenue. The tier sets how large a drop is worth flagging and how quickly to act.</div>
        {["T1", "T2", "T3", "T4"].map((t) => { const T = TIERS[t]; const rng = t === "T1" ? "$15,000+" : t === "T2" ? "$3,000–$14,999" : t === "T3" ? "$500–$2,999" : "under $500"; return (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #F1F2F6" }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, color: T.color, background: T.bg, whiteSpace: "nowrap" }}>{T.label} · {T.name}</span>
            <span style={{ fontSize: 12.5, color: C.sub }}>{rng} / 30 days · flag a {T.drop}% drop · respond {T.respond}</span>
          </div>); })}
        <div style={{ fontSize: 11.5, color: C.faint2, marginTop: 10 }}>Apps below about $50/day are held out of percentage alerts, so tiny-base swings don't create noise.</div>
      </div>
      <div style={{ ...card, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>Workspace changes</div><div style={{ fontSize: 11.5, color: C.faint2 }}>{savedAt ? "Saved " + since(savedAt) : "No local changes yet"}</div></div>
        <button onClick={resetSaved} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "1px solid " + C.line, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.sub }}>Reset to snapshot</button>
      </div>
    </div>
  );
}

function cfValue(f) {
  const v = f.value; if (v == null || v === "") return null;
  const tc = f.type_config || {};
  try {
    if (f.type === "drop_down") { const o = (tc.options || []).find((x) => x.id === v || x.orderindex === v); return o ? o.name : null; }
    if (f.type === "labels") { const opts = tc.options || []; return (Array.isArray(v) ? v : [v]).map((id) => (opts.find((o) => o.id === id) || {}).label || id).join(", "); }
    if (f.type === "date") return new Date(Number(v)).toLocaleDateString();
    if (f.type === "tasks" || f.type === "list_relationship") return (Array.isArray(v) ? v : [v]).map((x) => x.name || x.id).join(", ");
    if (f.type === "users") return (Array.isArray(v) ? v : [v]).map((u) => u.username || u).join(", ");
    if (Array.isArray(v)) return v.map((x) => (x && (x.name || x.label || x.username)) || x).join(", ");
    if (typeof v === "object") return v.name || v.username || null;
    return String(v);
  } catch { return null; }
}

function Drawer({ tasks, openTask, setOpenTask, patchTask, setTasks, persist, flash }) {
  const ot = tasks.find((t) => t.id === openTask);
  const [detail, setDetail] = useState(null);
  const [comments, setComments] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!ot || !D.getTaskDetail) return;
    let live = true; setLoading(true); setDetail(null); setComments(null);
    Promise.allSettled([D.getTaskDetail(ot.id), D.getTaskComments ? D.getTaskComments(ot.id) : Promise.resolve([])])
      .then(([d, c]) => { if (!live) return; if (d.status === "fulfilled") setDetail(d.value); if (c.status === "fulfilled") setComments(c.value); })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [ot && ot.id]);
  if (!ot) return null;
  const done = groupId(ot.status) === "done";
  const setStatus = (v) => { patchTask(ot.id, { status: v }); if (D.updateTaskStatus) D.updateTaskStatus(ot.id, v).then(() => flash("Updated in ClickUp")).catch(() => flash("Could not update ClickUp")); };
  const d = detail || {};
  const descText = d.markdown_description || d.description || ot.desc || "";
  const codey = /[{}\[\]]|table-embed|waterfalls|"ad_|"name":/.test(descText);
  const cfs = (d.custom_fields || []).map((f) => ({ name: f.name, value: cfValue(f) })).filter((x) => x.value != null && x.value !== "");
  const subtasks = d.subtasks || [];
  const assignees = (d.assignees || []).map((a) => ({ name: a.username, color: a.color, initials: a.initials })).concat(ot.assignees && !d.assignees ? ot.assignees : []);
  const statusOpts = D.LISTS_META && D.LISTS_META[ot.list] ? D.LISTS_META[ot.list].map((x) => x.name) : STATUSES;
  const isUrl = (v) => typeof v === "string" && /^https?:\/\//.test(v);
  const lbl = { fontSize: 10.5, textTransform: "uppercase", color: C.faint, fontWeight: 600, letterSpacing: ".03em" };
  const metaRow = { display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "center", padding: "7px 0" };

  return (
    <div onClick={() => setOpenTask(null)} style={{ position: "absolute", inset: 0, background: "rgba(20,22,28,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "6vh 8vw", zIndex: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "84vw", height: "86vh", background: "#fff", borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: C.sans }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid " + C.line }}>
          <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, color: "#fff", background: ot.statusColor || "#5B4BE8" }}>{ot.status}</span>
          <span style={{ fontSize: 12, color: C.faint2 }}>{ot.list}</span>
          {ot.url && <a href={ot.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.accent }}>Open in ClickUp ↗</a>}
          <div style={{ flex: 1 }} />
          <button onClick={() => setOpenTask(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 24, color: C.faint, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 400px", overflow: "hidden" }}>
          {/* MAIN */}
          <div style={{ overflow: "auto", padding: "20px 24px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>{ot.name}</div>
            <div style={{ borderTop: "1px solid " + C.line, borderBottom: "1px solid " + C.line, marginBottom: 18 }}>
              <div style={metaRow}><span style={lbl}>Status</span><select value={ot.status} onChange={(e) => setStatus(e.target.value)} style={{ height: 32, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px", fontSize: 13, background: "#fff", maxWidth: 260 }}>{statusOpts.map((sn) => <option key={sn}>{sn}</option>)}</select></div>
              <div style={metaRow}><span style={lbl}>Assignees</span><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{assignees.length ? assignees.map((a, i) => <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><span style={{ width: 22, height: 22, borderRadius: "50%", background: a.color || "#B4B9C4", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{a.initials || (a.name || "?")[0]}</span>{a.name}</span>) : <span style={{ color: C.faint2, fontSize: 13 }}>Unassigned</span>}</div></div>
              <div style={metaRow}><span style={lbl}>Priority</span><span style={{ fontSize: 13, color: ot.priorityColor || C.ink, fontWeight: 600 }}>{ot.priority || "—"}</span></div>
              <div style={metaRow}><span style={lbl}>Dates</span><span style={{ fontSize: 13 }}>{ot.start ? shortDate(ot.start) : "—"} → {ot.due ? shortDate(ot.due) : "—"}</span></div>
              {ot.tags && ot.tags.length > 0 && <div style={metaRow}><span style={lbl}>Tags</span><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{ot.tags.map((t) => <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#EDEEF2", color: C.sub }}>{t}</span>)}</div></div>}
            </div>

            <div style={{ ...lbl, marginBottom: 8 }}>Description</div>
            {descText ? (codey
              ? <pre style={{ fontFamily: C.mono, fontSize: 12, lineHeight: 1.5, background: "#F6F7F9", border: "1px solid " + C.line, borderRadius: 10, padding: 14, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{descText}</pre>
              : <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{descText}</div>
            ) : <div style={{ fontSize: 13, color: C.faint2 }}>{loading ? "Loading…" : "No description"}</div>}

            {cfs.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...lbl, marginBottom: 8 }}>Fields</div>
                <div style={{ border: "1px solid " + C.line, borderRadius: 10, overflow: "hidden" }}>
                  {cfs.map((f, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, padding: "9px 14px", borderTop: i ? "1px solid #F1F2F6" : "none", fontSize: 13 }}>
                      <span style={{ color: C.sub }}>{f.name}</span>
                      {isUrl(f.value) ? <a href={f.value} target="_blank" rel="noreferrer" style={{ color: C.accent, wordBreak: "break-all" }}>{f.value}</a> : <span style={{ fontWeight: 500 }}>{f.value}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {subtasks.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...lbl, marginBottom: 8 }}>Subtasks ({subtasks.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{subtasks.map((st) => <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, border: "1px solid " + C.line, borderRadius: 8, padding: "8px 12px" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: st.status?.color || "#9AA0AE" }} />{st.name}<span style={{ flex: 1 }} /><span style={{ fontSize: 11, color: C.faint2 }}>{st.status?.status}</span></div>)}</div>
              </div>
            )}

            <button onClick={() => { const target = statusOpts.find((x) => /done|complete|closed/i.test(x)) || "done"; setStatus(done ? statusOpts[0] : target); }} style={{ marginTop: 22, height: 38, padding: "0 18px", borderRadius: 9, border: "none", background: done ? "#F1F2F6" : "#0E9F6E", color: done ? C.sub : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{done ? "Reopen" : "Mark complete"}</button>
          </div>

          {/* ACTIVITY / COMMENTS (right rail) */}
          <div style={{ borderLeft: "1px solid " + C.line, background: C.panel, overflow: "auto", padding: "18px 18px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Activity {comments ? "· " + comments.length : ""}</div>
            {loading && !comments && <div style={{ fontSize: 13, color: C.faint2 }}>Loading…</div>}
            {comments && comments.length === 0 && <div style={{ fontSize: 13, color: C.faint2 }}>No comments yet.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {(comments || []).map((c) => (
                <div key={c.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: c.user?.color || "#5B4BE8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{c.user?.initials || (c.user?.username || "?")[0]}</div>
                    <b style={{ fontSize: 12.5 }}>{c.user?.username || "User"}</b>
                    <span style={{ fontSize: 11, color: C.faint2 }}>{c.date ? new Date(Number(c.date)).toLocaleString() : ""}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", color: C.ink, background: "#fff", border: "1px solid " + C.line, borderRadius: 10, padding: "9px 12px" }}>{c.comment_text || (c.comment || []).map((x) => x.text).join("")}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateModal({ modal, setModal, commitCreate }) {
  const m = modal, upd = (k) => (e) => setModal((s) => ({ ...s, [k]: e.target.value }));
  const sel = { width: "100%", height: 34, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px", fontSize: 13, background: "#fff", marginTop: 4 };
  const lbl = { fontSize: 11, textTransform: "uppercase", color: C.faint, fontWeight: 600 };
  return (
    <div onClick={() => setModal(null)} style={{ position: "absolute", inset: 0, background: "rgba(20,22,28,.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, background: "#fff", borderRadius: 14, padding: 22, fontFamily: C.sans }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>New task</div>
        {m.ctxTitle && <div style={{ background: m.ctxBad ? "#FDECEE" : "#E6F6F0", border: "1px solid " + (m.ctxBad ? "#F8D3D7" : "#CBEBDD"), color: m.ctxBad ? "#C31C2B" : "#0B7A55", borderRadius: 9, padding: "8px 12px", marginBottom: 14, fontSize: 12.5 }}><b>{m.ctxTitle}</b> · {m.ctxValue}</div>}
        <div style={{ marginBottom: 12 }}><div style={lbl}>Task name</div><input value={m.name} onChange={upd("name")} style={sel} placeholder="What needs doing?" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div><div style={lbl}>List</div><select value={m.list} onChange={upd("list")} style={sel}>{LISTS.map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><div style={lbl}>App</div><select value={m.app} onChange={upd("app")} style={sel}>{["— none —", ...D.APPS.map((a) => a.name)].map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><div style={lbl}>Assignee</div><select value={m.assignee} onChange={upd("assignee")} style={sel}>{["Unassigned", ...D.MEMBERS.map((x) => x.name)].map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><div style={lbl}>Priority</div><select value={m.priority} onChange={upd("priority")} style={sel}>{PRIORITIES.map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><div style={lbl}>Due</div><input type="date" value={m.due} onChange={upd("due")} style={sel} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setModal(null)} style={{ height: 36, padding: "0 16px", borderRadius: 9, border: "1px solid " + C.line, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.sub }}>Cancel</button>
          <button onClick={commitCreate} style={{ height: 36, padding: "0 18px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Create task</button>
        </div>
      </div>
    </div>
  );
}

function TestResults({ testId, setTestId, openCreate }) {
  const x = D.EXPERIMENTS.find((e) => e.id === testId); if (!x) return null;
  const g = group(x.status), r = D.experimentResults(x);
  const fmt = (v, u) => (u === "$" ? (v < 1 ? "$" + v.toFixed(4) : "$" + v.toFixed(2)) : u === "%" ? (v * 100).toFixed(1) + "%" : v.toFixed(2));
  const win = r.lift > 1 && r.conf > 90;
  const rec = { title: x.status === "blocked" ? "Blocked." : win ? "Ship it." : r.lift < 0 ? "Roll back." : "Keep running.", bg: x.status === "blocked" ? "#FDECEE" : win ? "#E6F6F0" : "#FEF3C7", bd: x.status === "blocked" ? "#F8D3D7" : win ? "#CBEBDD" : "#FBE7A2", fg: x.status === "blocked" ? "#C31C2B" : win ? "#0B7A55" : "#B45309", body: x.status === "blocked" ? "Resolve the upstream mapping issue before reading results — traffic is not evenly split." : win ? "Variant beats control on the primary metric with enough confidence to roll out to 100%." : r.lift < 0 ? "Variant is underperforming control. Revert and re-test with a narrower change." : "Confidence is below the 95% bar. Continue until the planned end date before deciding." };
  return (
    <div onClick={() => setTestId(null)} style={{ position: "absolute", inset: 0, background: "rgba(20,22,28,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 640, maxHeight: "90%", overflow: "auto", background: "#fff", borderRadius: 14, padding: 24, fontFamily: C.sans }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><Pill fg={g.fg} bg={g.bg}>{x.status}</Pill><span style={{ fontSize: 12, color: C.faint2 }}>{appName(x.app)} · {shortDate(x.start)} → {shortDate(x.end)}</span><div style={{ flex: 1 }} /><button onClick={() => setTestId(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: C.faint }}>×</button></div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{x.name}</div>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 16, lineHeight: 1.5 }}>{x.hypothesis}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
          {[{ label: "Primary lift", v: (r.lift >= 0 ? "+" : "") + r.lift.toFixed(1) + "%", sub: "eCPM, variant vs control", fg: r.lift >= 0 ? "#0B7A55" : "#C31C2B" }, { label: "Confidence", v: r.conf.toFixed(0) + "%", sub: r.conf > 95 ? "significant" : r.conf > 90 ? "approaching significance" : "not yet significant", fg: "#14161C" }, { label: "Progress", v: x.progress + "%", sub: x.status === "blocked" ? "blocked" : x.progress === 100 ? "complete" : "of planned duration", fg: "#14161C" }].map((h) => <div key={h.label} style={{ ...card, padding: 14 }}><div style={{ fontSize: 10.5, textTransform: "uppercase", color: C.faint, fontWeight: 600 }}>{h.label}</div><div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600, margin: "4px 0", color: h.fg }}>{h.v}</div><div style={{ fontSize: 11, color: C.faint2 }}>{h.sub}</div></div>)}
        </div>
        <div style={{ ...card, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 80px", padding: "9px 14px", background: C.panel, borderBottom: "1px solid " + C.line, fontSize: 11, textTransform: "uppercase", color: C.faint, fontWeight: 600 }}><span>Metric</span><span style={{ textAlign: "right" }}>Control</span><span style={{ textAlign: "right" }}>Variant</span><span style={{ textAlign: "right" }}>Δ</span></div>
          {r.rows.map((row) => { const d = delta(row.vari, row.ctrl); return <div key={row.metric} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 80px", padding: "10px 14px", borderBottom: "1px solid #F1F2F6", fontSize: 12.5 }}><span>{row.metric}</span><span style={{ textAlign: "right", fontFamily: C.mono }}>{fmt(row.ctrl, row.unit)}</span><span style={{ textAlign: "right", fontFamily: C.mono }}>{fmt(row.vari, row.unit)}</span><span style={{ textAlign: "right", fontFamily: C.mono, color: d.fg }}>{d.txt}</span></div>; })}
        </div>
        <div style={{ background: rec.bg, border: "1px solid " + rec.bd, color: rec.fg, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}><b>{rec.title}</b> <span style={{ fontSize: 13 }}>{rec.body}</span></div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button onClick={() => { setTestId(null); openCreate({ name: "Follow-up: " + x.name, app: x.app, list: "Tests & Experiments", assignee: x.owner, priority: "high", ctxTitle: "Experiment " + x.id, ctxValue: (r.lift >= 0 ? "+" : "") + r.lift.toFixed(1) + "% lift", ctxBad: r.lift < 0 }); }} style={{ height: 36, padding: "0 16px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Create follow-up task</button></div>
      </div>
    </div>
  );
}

// ── Revenue chart (Overall / All apps) — bespoke interactive SVG ─────────────
function smoothPath(pts) {
  if (pts.length < 2) return pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
  let d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
  }
  return d;
}

function RevenueChart({ dates, pool, selectionActive }) {
  const [mode, setMode] = useState("overall");
  const [hov, setHov] = useState(-1);
  const [iso, setIso] = useState(null);
  const [visible, setVisible] = useState(10);
  useEffect(() => { setIso(null); setVisible(10); }, [selectionActive, pool]);

  const apps = useMemo(() => pool
    .map((app) => { const vals = dates.map((ds) => D.dayRow(app, ds).revenue); return { app, vals, total: vals.reduce((s, v) => s + v, 0) }; })
    .sort((a, b) => b.total - a.total), [dates, pool]);
  const overall = useMemo(() => dates.map((_, i) => apps.reduce((s, a) => s + a.vals[i], 0)), [apps, dates]);
  const shown = iso ? apps.filter((a) => a.app.id === iso) : (selectionActive ? apps : apps.slice(0, visible));

  const W = 960, H = 300, padL = 58, padR = 18, padT = 18, padB = 34;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxV = (mode === "overall" ? Math.max(1, ...overall) : Math.max(1, ...shown.flatMap((a) => a.vals))) * 1.08;
  const n = dates.length;
  const X = (i) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => padT + (1 - v / maxV) * ih;
  const grid = [0, .25, .5, .75, 1].map((f) => ({ y: padT + f * ih, label: money(maxV * (1 - f)) }));
  const step = Math.max(1, Math.round(n / 7));
  const xl = dates.map((ds, i) => ({ i, x: X(i), label: shortDate(ds) })).filter((t) => t.i % step === 0);
  const hovering = hov >= 0 && hov < n;
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); const f = (e.clientX - r.left) / r.width; setHov(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))))); };

  const leftPct = hovering ? (X(hov) / W) * 100 : 0;
  const clampTx = leftPct < 18 ? "0" : leftPct > 82 ? "-100%" : "-50%";
  const trows = hovering && mode === "apps" ? shown.map((a) => ({ id: a.app.id, name: a.app.name, v: a.vals[hov], color: appColor(a.app.id) })).sort((x, y) => y.v - x.v) : [];
  const trShown = trows.slice(0, 5);
  const seg = (on) => ({ border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: on ? 650 : 550, padding: "5px 12px", borderRadius: 7, background: on ? "#fff" : "transparent", color: on ? C.ink : "#6B7180", boxShadow: on ? "0 1px 2px rgba(16,24,40,.1)" : "none" });

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue trend</div>
        {iso && <button onClick={() => setIso(null)} style={{ border: "1px solid " + C.line, background: "#fff", cursor: "pointer", borderRadius: 20, padding: "2px 10px", fontSize: 11.5, color: C.sub }}>← all apps</button>}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", background: "#EDEEF2", borderRadius: 9, padding: 3 }}>
          {[["overall", "Overall"], ["apps", "All apps"]].map(([id, label]) => <button key={id} onClick={() => { setMode(id); setIso(null); }} style={seg(mode === id)}>{label}</button>)}
        </div>
      </div>

      {/* readout box ABOVE the plot (reserved zone; never covers lines) */}
      <div style={{ position: "relative", height: 92 }}>
        {hovering ? (
          <div style={{ position: "absolute", bottom: 8, left: leftPct + "%", transform: "translateX(" + clampTx + ")", background: "#14161C", color: "#fff", borderRadius: 10, padding: "8px 11px", boxShadow: "0 8px 24px rgba(0,0,0,.22)", minWidth: 150, maxWidth: 300, pointerEvents: "none" }}>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: "#B4B9C4", marginBottom: 4 }}>{dates[hov]}</div>
            {mode === "overall" ? (
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: C.mono }}>{money(overall[hov])}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {trShown.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flex: "none" }} />
                    <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <span style={{ flex: 1 }} /><b style={{ fontFamily: C.mono }}>{money(r.v)}</b>
                  </div>
                ))}
                {trows.length > 5 && <div style={{ fontSize: 10.5, color: "#8A90A0", marginTop: 2 }}>+{trows.length - 5} more</div>}
              </div>
            )}
          </div>
        ) : <div style={{ position: "absolute", bottom: 8, left: 2, fontSize: 12, color: C.faint2 }}>Hover the chart for exact values</div>}
      </div>

      <div style={{ position: "relative" }} onMouseMove={onMove} onMouseLeave={() => setHov(-1)}>
        <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", display: "block" }}>
          <defs><linearGradient id="ovg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity="0.28" /><stop offset="100%" stopColor={C.accent} stopOpacity="0" /></linearGradient></defs>
          {grid.map((g, i) => <g key={i}><line x1={padL} x2={W - padR} y1={g.y} y2={g.y} stroke="#F0F1F5" /><text x={padL - 8} y={g.y + 3} textAnchor="end" fontSize="10" fill="#9AA0AE" fontFamily="'IBM Plex Mono', monospace">{g.label}</text></g>)}
          {xl.map((t) => <text key={t.i} x={t.x} y={H - 12} textAnchor="middle" fontSize="10" fill="#9AA0AE">{t.label}</text>)}
          {mode === "overall" ? (
            <>
              {n > 1 && <path d={smoothPath(overall.map((v, i) => [X(i), Y(v)])) + " L" + X(n - 1).toFixed(1) + " " + (padT + ih) + " L" + padL + " " + (padT + ih) + " Z"} fill="url(#ovg)" />}
              {n > 1 && <path d={smoothPath(overall.map((v, i) => [X(i), Y(v)]))} fill="none" stroke={C.accent} strokeWidth="2.4" />}
              {n === 1 && <circle cx={X(0)} cy={Y(overall[0])} r="4" fill={C.accent} />}
              {hovering && <circle cx={X(hov)} cy={Y(overall[hov])} r="4.5" fill="#fff" stroke={C.accent} strokeWidth="2.5" />}
            </>
          ) : (
            shown.map((a) => <path key={a.app.id} d={smoothPath(a.vals.map((v, i) => [X(i), Y(v)]))} fill="none" stroke={appColor(a.app.id)} strokeWidth={shown.length === 1 ? 2.6 : 1.7} strokeOpacity="0.92" />)
          )}
          {mode === "apps" && hovering && shown.map((a) => <circle key={a.app.id} cx={X(hov)} cy={Y(a.vals[hov])} r="3.2" fill={appColor(a.app.id)} />)}
          {hovering && <line x1={X(hov)} x2={X(hov)} y1={padT} y2={padT + ih} stroke={C.accent} strokeOpacity="0.35" strokeDasharray="3 3" />}
        </svg>
      </div>

      {mode === "apps" && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {shown.map((a) => { const on = iso === a.app.id; return (
            <button key={a.app.id} onClick={() => setIso(on ? null : a.app.id)} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid " + (on ? appColor(a.app.id) : C.line), background: on ? appColor(a.app.id) + "14" : "#fff", cursor: "pointer", borderRadius: 20, padding: "3px 9px", fontSize: 11.5, color: C.ink }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: appColor(a.app.id) }} />{a.app.name.length > 22 ? a.app.name.slice(0, 22) + "…" : a.app.name}
            </button>); })}
          {!selectionActive && !iso && visible < apps.length && <button onClick={() => setVisible((v) => v + 10)} style={{ border: "1px dashed " + C.accent, background: C.accentBg, color: C.accentDk, cursor: "pointer", borderRadius: 20, padding: "3px 12px", fontSize: 11.5, fontWeight: 600 }}>Show more apps (+{Math.min(10, apps.length - visible)})</button>}
        </div>
      )}
    </div>
  );
}
