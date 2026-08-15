// @ts-nocheck
// Eval-free React port of the Xgrowth Ops dashboard (from the .dc.html).
// All five tabs, ported faithfully. No runtime eval / new Function.
import { useEffect, useMemo, useRef, useState } from "react";

import D from "./activeData";

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

export default function XgrowthOps() {
  const [page, setPage] = useState("dashboard");
  const [range, setRange] = useState("7");
  const [cs, setCs] = useState("2026-07-12");
  const [ce, setCe] = useState("2026-08-10");
  const [sortKey, setSortKey] = useState("revenue");
  const [sortDir, setSortDir] = useState(-1);
  const [q, setQ] = useState("");
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
      <div style={{ width: 236, flex: "none", background: C.surface, borderRight: "1px solid " + C.line, display: "flex", flexDirection: "column", padding: "16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 16px" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>xG</div>
          <div style={{ lineHeight: 1.15 }}><div style={{ fontSize: 14, fontWeight: 700 }}>Xgrowth Ops</div><div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: C.faint2 }}>Console</div></div>
        </div>
        {NAV.map((n) => { const on = page === n.id; return (
          <button key={n.id} onClick={() => { setPage(n.id); setAppId(null); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 11px", marginBottom: 2, borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: on ? 650 : 500, textAlign: "left", color: on ? C.accentDk : C.sub, background: on ? C.accentBg : "transparent" }}>
            <span>{n.label}</span>{n.id === "tasks" && overdueAll.length > 0 && <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: "#FDECEE", color: "#C31C2B" }}>{overdueAll.length}</span>}
          </button>); })}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 10.5, color: C.faint2, padding: "8px 10px" }}>ClickUp · JedyApps</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ height: 56, flex: "none", borderBottom: "1px solid " + C.line, background: C.surface, display: "flex", alignItems: "center", gap: 14, padding: "0 20px" }}>
          <div><div style={{ fontSize: 16, fontWeight: 700 }}>{pageTitle}</div>{page === "dashboard" && <div style={{ fontSize: 11.5, color: C.faint }}>{R.sub}</div>}{page === "tasks" && <div style={{ fontSize: 11.5, color: C.faint }}>ClickUp · JedyApps</div>}</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => openCreate(null)} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New task</button>
          <input value={q} onChange={(e) => { setQ(e.target.value); setTq(e.target.value); }} placeholder="Search…" style={{ height: 34, width: 200, borderRadius: 9, border: "1px solid " + C.line, padding: "0 12px", fontSize: 13, outline: "none", background: C.panel }} />
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          {page === "dashboard" && <DashboardTab {...{ R, range, setRange, cs, setCs, ce, setCe, q, sortKey, setSortKey, sortDir, setSortDir, threshold, openApp: (id) => { setPage("apps"); setAppId(id); setAppTab("dashboard"); setHov(-1); } }} />}
          {page === "apps" && <AppsTab {...{ R, q, appId, setAppId, appTab, setAppTab, chartDays, setChartDays, hov, setHov, tasks, taskView, openTest: setTestId }} />}
          {page === "tests" && <TestsTab {...{ q, tfilter, setTfilter, openTest: setTestId }} />}
          {page === "tasks" && <TasksTab {...{ tasks, taskView, tview, setTview, tlist, setTlist, tassignee, setTassignee, tq, setTq }} />}
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

function DashboardTab({ R, range, setRange, cs, setCs, ce, setCe, q, sortKey, setSortKey, sortDir, setSortDir, threshold, openApp }) {
  const kpis = useMemo(() => {
    const cur = totals(R.cur), prv = totals(R.prev);
    const sparkDaily = D.rangeDates(14, 1).map((ds) => totals([ds]));
    return [
      { label: "Revenue", value: money(cur.revenue), c: cur.revenue, p: prv.revenue, series: sparkDaily.map((d) => d.revenue) },
      { label: "eCPM", value: money2(cur.ecpm), c: cur.ecpm, p: prv.ecpm, series: sparkDaily.map((d) => d.ecpm) },
      { label: "Impressions", value: compact(cur.imp), c: cur.imp, p: prv.imp, series: sparkDaily.map((d) => d.imp) },
    ].map((k) => ({ ...k, d: delta(k.c, k.p), spark: sparkPath(k.series, 112, 30) }));
  }, [R]);

  const metricCols = [
    { k: "revenue", label: "Estimated earnings", fmt: money },
    { k: "ecpm", label: "Observed eCPM", fmt: money2 },
    { k: "requests", label: "Requests", fmt: compact },
    { k: "matchRate", label: "Match rate", fmt: pct },
    { k: "matched", label: "Matched requests", fmt: compact },
    { k: "showRate", label: "Show rate", fmt: pct },
    { k: "impressions", label: "Impressions", fmt: compact },
    { k: "ctr", label: "CTR", fmt: pct },
    { k: "clicks", label: "Clicks", fmt: compact },
    { k: "arpv", label: "Ads ARPV", fmt: money4 },
    { k: "arpdav", label: "Ads ARPDAV", fmt: money4 },
  ];

  const { rows, alerts } = useMemo(() => {
    const enrich = (o) => ({ ...o, arpv: o.impressions ? o.revenue / o.impressions : 0, arpdav: o.dau ? o.revenue / o.dau : 0 });
    const agg = D.APPS.map((app) => ({ app, a: enrich(D.aggregate(app, R.cur)), b: enrich(D.aggregate(app, R.prev)) }));
    const qq = q.trim().toLowerCase();
    let list = agg.filter((r) => !qq || r.app.name.toLowerCase().includes(qq));
    list.sort((x, y) => (sortKey === "name" ? x.app.name.localeCompare(y.app.name) * -sortDir : ((x.a[sortKey] || 0) - (y.a[sortKey] || 0)) * sortDir));
    let al = 0;
    const rws = list.map(({ app, a, b }) => {
      const dr = delta(a.revenue, b.revenue); if (dr.v < -threshold) al++;
      const cells = metricCols.map((c) => ({ v: c.fmt(a[c.k] || 0), d: delta(a[c.k] || 0, b[c.k] || 0) }));
      return { id: app.id, name: app.name, meta: app.cat + " · " + app.tier, initials: appInitials(app.name), color: appColor(app.id), cells };
    });
    return { rows: rws, alerts: al };
  }, [R, q, sortKey, sortDir, threshold]);

  const sortCol = (k) => { setSortKey(k); setSortDir((d) => (sortKey === k ? -d : -1)); };
  const APPW = 240, COLW = 132, HEADBG = "#FAFAFC";
  const hbase = { fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: C.faint, padding: "10px 14px", background: HEADBG, borderBottom: "1px solid " + C.line, whiteSpace: "nowrap", cursor: "pointer" };
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

      <RevenueChart dates={R.cur} />

      {alerts > 0 && <div style={{ background: "#FDECEE", border: "1px solid #F8D3D7", color: "#C31C2B", borderRadius: 10, padding: "9px 14px", marginBottom: 14, fontSize: 12.5, fontWeight: 600 }}>{alerts === 1 ? "1 app below threshold" : alerts + " apps below threshold"} (revenue down more than {threshold}%)</div>}

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflow: "auto", maxHeight: "60vh" }}>
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
                      <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: APPW - 60 }}>{r.name}</div><div style={{ fontSize: 11, color: C.faint2 }}>{r.meta}</div></div>
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

function AppsTab({ R, q, appId, setAppId, appTab, setAppTab, chartDays, setChartDays, hov, setHov, tasks, taskView, openTest }) {
  if (!appId) {
    const qq = q.trim().toLowerCase();
    const cards = D.APPS.filter((app) => !qq || app.name.toLowerCase().includes(qq)).map((app) => { const a = D.aggregate(app, R.cur), b = D.aggregate(app, R.prev), d = delta(a.revenue, b.revenue); return { app, rev: money(a.revenue), d, ecpm: money2(a.ecpm), arpdau: money4(a.arpdau), open: tasks.filter((t) => t.app === app.id && groupId(t.status) !== "done").length }; });
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

function TestsTab({ q, tfilter, setTfilter, openTest }) {
  const counts = { All: D.EXPERIMENTS.length }; for (const x of D.EXPERIMENTS) counts[x.status] = (counts[x.status] || 0) + 1;
  const qq = q.trim().toLowerCase();
  const tests = D.EXPERIMENTS.filter((x) => (tfilter === "All" || x.status === tfilter) && (!qq || x.name.toLowerCase().includes(qq) || appName(x.app).toLowerCase().includes(qq)));
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["All", "live", "to do", "blocked", "completed"].map((f) => { const on = tfilter === f; return <button key={f} onClick={() => setTfilter(f)} style={{ border: "1px solid " + (on ? C.accent : C.line), background: on ? C.accent : "#fff", color: on ? "#fff" : C.sub, cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 20 }}>{f === "All" ? "All experiments" : f} · {counts[f] || 0}</button>; })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
        {tests.map((x) => { const g = group(x.status); const pcolor = x.status === "blocked" ? "#E02D3C" : x.progress === 100 ? "#0E9F6E" : "#5B4BE8"; return (
          <div key={x.id} onClick={() => openTest(x.id)} style={{ ...card, padding: 16, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><b style={{ fontSize: 13.5, lineHeight: 1.3 }}>{x.name}</b><div style={{ flex: 1 }} /><Pill fg={g.fg} bg={g.bg}>{x.status}</Pill></div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.45 }}>{x.hypothesis}</div>
            <div style={{ height: 6, borderRadius: 4, background: "#F1F2F6", overflow: "hidden", marginBottom: 10 }}><div style={{ width: x.progress + "%", height: "100%", background: pcolor }} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.faint2 }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, background: appColor(x.app), color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{appInitials(appName(x.app))}</span>
              <span>{appName(x.app)}</span><div style={{ flex: 1 }} /><span style={{ fontFamily: C.mono }}>{shortDate(x.start)} → {shortDate(x.end)}</span>
            </div>
          </div>
        ); })}
      </div>
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
function TasksTab({ tasks, taskView, tview, setTview, tlist, setTlist, tassignee, setTassignee, tq, setTq }) {
  const tqq = tq.trim().toLowerCase();
  const filtered = tasks.filter((t) => (tlist === "All lists" || t.list === tlist) && (tassignee === "All assignees" || t.assignee === tassignee) && (!tqq || t.name.toLowerCase().includes(tqq)));
  const od = tasks.filter((t) => t.due && t.due < D.TODAY && groupId(t.status) !== "done");
  const dtoday = tasks.filter((t) => t.due === D.TODAY && groupId(t.status) !== "done");
  const order = { blocked: 0, progress: 1, waiting: 2, todo: 3, done: 4 };
  const rows = filtered.slice().sort((a, b) => order[groupId(a.status)] - order[groupId(b.status)] || (a.due || "9").localeCompare(b.due || "9")).map(taskView);
  const board = ["todo", "progress", "waiting", "blocked", "done"].map((gid) => ({ label: GROUPS[gid].label, color: GROUPS[gid].dot, tasks: filtered.filter((t) => groupId(t.status) === gid).map(taskView) }));
  const sel = { height: 32, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px", fontSize: 12.5, background: "#fff" };
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 11, textTransform: "uppercase", color: C.faint, fontWeight: 600, marginBottom: 4 }}>Overdue</div><div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600, color: od.length ? "#C31C2B" : C.ink }}>{od.length}</div></div>
        <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 11, textTransform: "uppercase", color: C.faint, fontWeight: 600, marginBottom: 4 }}>Due today</div><div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600 }}>{dtoday.length}</div></div>
        <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 11, textTransform: "uppercase", color: C.faint, fontWeight: 600, marginBottom: 4 }}>Open tasks</div><div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600 }}>{tasks.filter((t) => groupId(t.status) !== "done").length}</div></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: "#EDEEF2", borderRadius: 9, padding: 3 }}>{[["list", "List"], ["board", "Board"]].map(([id, label]) => <button key={id} onClick={() => setTview(id)} style={{ border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: tview === id ? 650 : 550, padding: "5px 14px", borderRadius: 7, background: tview === id ? "#fff" : "transparent", color: tview === id ? C.ink : "#6B7180" }}>{label}</button>)}</div>
        <select value={tlist} onChange={(e) => setTlist(e.target.value)} style={sel}>{["All lists", ...LISTS].map((l) => <option key={l}>{l}</option>)}</select>
        <select value={tassignee} onChange={(e) => setTassignee(e.target.value)} style={sel}>{["All assignees", ...D.MEMBERS.map((m) => m.name)].map((l) => <option key={l}>{l}</option>)}</select>
        <input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="Filter tasks…" style={{ ...sel, width: 180 }} />
      </div>
      {tview === "list" ? (rows.length ? <TaskList rows={rows} /> : <Empty>No tasks match.</Empty>) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, alignItems: "start" }}>
          {board.map((col) => (
            <div key={col.label} style={{ ...card, padding: 10, background: C.panel }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "2px 4px" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} /><b style={{ fontSize: 12.5 }}>{col.label}</b><span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint2 }}>{col.tasks.length}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {col.tasks.map((t) => (
                  <div key={t.id} onClick={t.open} style={{ ...card, padding: 10, cursor: "pointer" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 550, color: t.nfg, textDecoration: t.strike, marginBottom: 6 }}>{t.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{t.hasPriority && <Pill fg={t.pfg} bg={t.pbg}>{t.priority}</Pill>}<div style={{ flex: 1 }} /><span style={{ fontFamily: C.mono, fontSize: 10.5, color: t.dfg }}>{t.due}</span><div style={{ width: 22, height: 22, borderRadius: "50%", background: t.acolor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{t.ainit}</div></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Alert threshold</div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>Flag apps whose revenue drops more than this vs the previous period.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}><input type="range" min="1" max="30" step="1" value={threshold} onChange={(e) => { const v = Number(e.target.value); setThreshold(v); persist(undefined, v); }} style={{ flex: 1 }} /><span style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, width: 44, textAlign: "right" }}>{threshold}%</span></div>
      </div>
      <div style={{ ...card, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>Workspace changes</div><div style={{ fontSize: 11.5, color: C.faint2 }}>{savedAt ? "Saved " + since(savedAt) : "No local changes yet"}</div></div>
        <button onClick={resetSaved} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "1px solid " + C.line, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.sub }}>Reset to snapshot</button>
      </div>
    </div>
  );
}

function Drawer({ tasks, openTask, setOpenTask, patchTask, setTasks, persist, flash }) {
  const ot = tasks.find((t) => t.id === openTask); if (!ot) return null;
  const g = group(ot.status), done = groupId(ot.status) === "done";
  const app = ot.app ? D.APPS.find((a) => a.id === ot.app) : null;
  const sel = { width: "100%", height: 34, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px", fontSize: 13, background: "#fff", marginTop: 4 };
  const lbl = { fontSize: 11, textTransform: "uppercase", color: C.faint, fontWeight: 600 };
  return (
    <>
      <div onClick={() => setOpenTask(null)} style={{ position: "absolute", inset: 0, background: "rgba(20,22,28,.28)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 420, background: "#fff", boxShadow: "-8px 0 30px rgba(0,0,0,.12)", padding: 22, overflow: "auto", fontFamily: C.sans }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}><Pill fg={g.fg} bg={g.bg}>{ot.status}</Pill><div style={{ flex: 1 }} /><button onClick={() => setOpenTask(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: C.faint }}>×</button></div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>{ot.name}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div><div style={lbl}>Status</div><select value={ot.status} onChange={(e) => patchTask(ot.id, { status: e.target.value })} style={sel}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><div style={lbl}>Assignee</div><select value={ot.assignee || "Unassigned"} onChange={(e) => patchTask(ot.id, { assignee: e.target.value === "Unassigned" ? null : e.target.value })} style={sel}>{["Unassigned", ...D.MEMBERS.map((x) => x.name)].map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><div style={lbl}>Priority</div><select value={ot.priority || "none"} onChange={(e) => patchTask(ot.id, { priority: e.target.value === "none" ? null : e.target.value })} style={sel}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><div style={lbl}>Due</div><input type="date" value={ot.due || ""} onChange={(e) => patchTask(ot.id, { due: e.target.value || null })} style={sel} /></div>
          <div><div style={lbl}>List</div><div style={{ fontSize: 13, marginTop: 6 }}>{ot.list}</div></div>
          <div><div style={lbl}>App</div><div style={{ fontSize: 13, marginTop: 6 }}>{app ? app.name : "—"}</div></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { patchTask(ot.id, { status: done ? "to do" : "done" }); flash(done ? "Reopened in ClickUp" : "Marked complete in ClickUp"); }} style={{ flex: 1, height: 36, borderRadius: 9, border: "none", background: done ? "#F1F2F6" : "#0E9F6E", color: done ? C.sub : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{done ? "Reopen task" : "Mark complete"}</button>
          <button onClick={() => { setTasks((s) => { const next = s.filter((t) => t.id !== ot.id); persist(next); return next; }); setOpenTask(null); flash("Deleted from ClickUp"); }} style={{ height: 36, padding: "0 14px", borderRadius: 9, border: "1px solid " + C.line, background: "#fff", color: "#C31C2B", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Delete</button>
        </div>
      </div>
    </>
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
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 80px", padding: "9px 14px", background: C.panel, borderBottom: "1px solid " + C.line, fontSize: 11, textTransform: "uppercase", color: C.faint, fontWeight: 600 }}><span>Metric</span><span style={{ textAlign: "right" }}>Control</span><span style={{ textAlign: "right" }}>Variant</span><span style={{ textAlign: "right" }}>\u0394</span></div>
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

function RevenueChart({ dates }) {
  const [mode, setMode] = useState("overall");
  const [hov, setHov] = useState(-1);
  const [iso, setIso] = useState(null);
  const [visible, setVisible] = useState(10);

  const apps = useMemo(() => D.APPS
    .map((app) => { const vals = dates.map((ds) => D.dayRow(app, ds).revenue); return { app, vals, total: vals.reduce((s, v) => s + v, 0) }; })
    .sort((a, b) => b.total - a.total), [dates]);
  const overall = useMemo(() => dates.map((_, i) => apps.reduce((s, a) => s + a.vals[i], 0)), [apps, dates]);
  const shown = mode === "apps" ? apps.slice(0, visible) : apps;

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
  const rows = hovering ? shown.map((a) => ({ id: a.app.id, name: a.app.name, v: a.vals[hov], color: appColor(a.app.id) })).filter((r) => (iso ? r.id === iso : true)).sort((a, b) => b.v - a.v) : [];
  const seg = (on) => ({ border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: on ? 650 : 550, padding: "5px 12px", borderRadius: 7, background: on ? "#fff" : "transparent", color: on ? C.ink : "#6B7180", boxShadow: on ? "0 1px 2px rgba(16,24,40,.1)" : "none" });

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue trend</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", background: "#EDEEF2", borderRadius: 9, padding: 3 }}>
          {[["overall", "Overall"], ["apps", "All apps"]].map(([id, label]) => <button key={id} onClick={() => { setMode(id); setIso(null); }} style={seg(mode === id)}>{label}</button>)}
        </div>
      </div>

      <div style={{ minHeight: 30, display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        {hovering ? (
          mode === "overall" ? (
            <><span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.faint }}>{dates[hov]}</span><b style={{ fontFamily: C.mono, fontSize: 15 }}>{money(overall[hov])}</b></>
          ) : (
            <><span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.faint, flex: "none" }}>{dates[hov]}</span>
              <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
                {rows.map((r) => <span key={r.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, whiteSpace: "nowrap" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />{r.name.length > 18 ? r.name.slice(0, 18) + "…" : r.name} <b style={{ fontFamily: C.mono }}>{money(r.v)}</b></span>)}
              </div></>
          )
        ) : <span style={{ fontSize: 12, color: C.faint2 }}>Hover the chart for exact values</span>}
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
            shown.map((a) => { const dim = iso && iso !== a.app.id; return <path key={a.app.id} d={smoothPath(a.vals.map((v, i) => [X(i), Y(v)]))} fill="none" stroke={appColor(a.app.id)} strokeWidth={iso === a.app.id ? 2.6 : 1.5} strokeOpacity={dim ? 0.12 : 0.9} />; })
          )}
          {mode === "apps" && hovering && rows.map((r) => { const a = shown.find((x) => x.app.id === r.id); return <circle key={r.id} cx={X(hov)} cy={Y(a.vals[hov])} r="3.2" fill={r.color} />; })}
          {hovering && <line x1={X(hov)} x2={X(hov)} y1={padT} y2={padT + ih} stroke={C.accent} strokeOpacity="0.35" strokeDasharray="3 3" />}
        </svg>
      </div>

      {mode === "apps" && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {shown.map((a) => { const on = iso === a.app.id; return (
            <button key={a.app.id} onClick={() => setIso(on ? null : a.app.id)} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid " + (on ? appColor(a.app.id) : C.line), background: on ? appColor(a.app.id) + "14" : "#fff", cursor: "pointer", borderRadius: 20, padding: "3px 9px", fontSize: 11.5, color: iso && !on ? "#9AA0AE" : C.ink }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: appColor(a.app.id) }} />{a.app.name.length > 22 ? a.app.name.slice(0, 22) + "…" : a.app.name}
            </button>); })}
          {visible < apps.length && <button onClick={() => setVisible((v) => v + 10)} style={{ border: "1px dashed " + C.accent, background: C.accentBg, color: C.accentDk, cursor: "pointer", borderRadius: 20, padding: "3px 12px", fontSize: 11.5, fontWeight: 600 }}>Show more apps (+{Math.min(10, apps.length - visible)})</button>}
        </div>
      )}
    </div>
  );
}
