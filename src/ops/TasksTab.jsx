// @ts-nocheck
import { useMemo, useState } from "react";
import D from "../activeData";
import { C, GROUPS, LISTS, card, Pill, Empty, groupId } from "./theme";

function listHealth(items) {
  const open = items.filter((t) => groupId(t.status) !== "done");
  const overdue = open.filter((t) => t.due && t.due < D.TODAY).length;
  const ratio = open.length ? overdue / open.length : 0;
  if (ratio === 0) return { label: "On track", color: "#0B7A55", bg: "#E6F6F0", icon: "✓" };
  if (ratio < 0.25) return { label: "Watch", color: "#B45309", bg: "#FEF3C7", icon: "•" };
  return { label: "Behind", color: "#C31C2B", bg: "#FDECEE", icon: "!" };
}

// Renders one group per status in `statuses`, PLUS a catch-all group for any
// task whose status isn't in that list. Without the catch-all, a task
// carrying a status ClickUp has since renamed or removed from a list's
// config (which happens — real workspaces drift) would just silently never
// render, in any view. Confirmed against the real JedyApps workspace: lists
// like "App Porfolio" have genuinely-configured but easy-to-miss statuses
// ("----", "mediaiton setup" — a typo baked into ClickUp's own config).
function GroupedTaskList({ items, taskView, statuses }) {
  const known = new Map(statuses.map((s) => [s.name, s]));
  for (const t of items) if (!known.has(t.status)) known.set(t.status, { name: t.status, color: t.statusColor || "#9AA0AE" });
  const groups = [...known.values()].map((st) => ({ ...st, list: items.filter((t) => t.status === st.name) })).filter((g) => g.list.length);
  if (!groups.length) return <Empty>No tasks match.</Empty>;
  return (
    <div style={{ ...card, overflow: "hidden" }}>
      {groups.map((g) => (
        <div key={g.name}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: C.panel, borderBottom: "1px solid " + C.line }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: g.color }} />
            <b style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>{g.name}</b>
            <span style={{ fontSize: 11, color: "#fff", background: g.color, borderRadius: 20, padding: "0 7px" }}>{g.list.length}</span>
          </div>
          {g.list.map((t) => { const tv = taskView(t); const overdue = t.due && t.due < D.TODAY && groupId(t.status) !== "done"; return (
            <div key={t.id} onClick={tv.open} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 190px 150px", gap: 12, alignItems: "center", padding: "11px 14px", borderBottom: "1px solid #F1F2F6", borderLeft: "3px solid " + (t.statusColor || g.color), cursor: "pointer" }}>
              <div onClick={tv.toggle} style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid " + tv.checkBd, background: tv.checkBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{tv.check}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 550, color: tv.nfg, textDecoration: tv.strike, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div><div style={{ fontSize: 11, color: C.faint2 }}>{t.list}</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><div style={{ width: 24, height: 24, flex: "none", borderRadius: "50%", background: tv.acolor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{tv.ainit}</div><span style={{ fontSize: 12.5, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.assignee || "Unassigned"}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>{overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#C31C2B", background: "#FDECEE", padding: "1px 7px", borderRadius: 6 }}>OVERDUE</span>}<span style={{ fontSize: 12.5, color: overdue ? "#C31C2B" : C.sub, fontVariantNumeric: "tabular-nums" }}>{tv.due}</span></div>
            </div>
          ); })}
        </div>
      ))}
    </div>
  );
}

// scopeApp + taskAppMap: used to embed this same tab (filters, statuses, list
// view / board view, everything) inside a single app's detail page, scoped
// to just the tasks matched to that app.
export default function TasksTab({ tasks: allTasks, taskView, onMove, scopeApp, taskAppMap }) {
  const [tview, setTview] = useState("list");
  const [tlist, setTlist] = useState("All lists");
  const [tassignee, setTassignee] = useState("All assignees");
  const [tq, setTq] = useState("");
  const tasks = useMemo(() => (scopeApp ? allTasks.filter((t) => (taskAppMap && taskAppMap.get(t.id)) === scopeApp) : allTasks), [allTasks, scopeApp, taskAppMap]);
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

  // Real ClickUp status metadata, when available, is authoritative — never
  // the demo-only 5-bucket todo/progress/waiting/blocked/done scheme, which
  // doesn't match real workspaces' actual (and sometimes typo'd) statuses.
  const useReal = !!meta;
  const allRealStatuses = useMemo(() => {
    if (!meta) return null;
    const map = new Map();
    for (const list of Object.values(meta)) for (const s of list) if (!map.has(s.name)) map.set(s.name, s);
    return [...map.values()];
  }, [meta]);
  const activeStatuses = useReal ? ((tlist !== "All lists" && meta[tlist]) ? meta[tlist] : allRealStatuses) : null;
  const statusList = useReal ? activeStatuses.map((s) => ({ name: s.name, color: s.color || "#9AA0AE" })) : [...new Map(base.map((t) => [t.status, { name: t.status, color: t.statusColor || "#9AA0AE" }])).values()];
  const statusCount = (name) => base.filter((t) => t.status === name).length;

  const columns = useReal ? activeStatuses.map((s) => ({ label: s.name, color: s.color || "#9AA0AE", key: s.name })) : ["todo", "progress", "waiting", "blocked", "done"].map((gid) => ({ label: GROUPS[gid].label, color: GROUPS[gid].dot, key: gid }));
  const colTasks = (col) => filtered.filter((t) => (useReal ? t.status === col.key : groupId(t.status) === col.key));
  const order = { blocked: 0, progress: 1, waiting: 2, todo: 3, done: 4 };
  const rows = filtered.slice().sort((a, b) => order[groupId(a.status)] - order[groupId(b.status)] || (a.due || "9").localeCompare(b.due || "9")).map(taskView);
  const sel = { height: 32, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px", fontSize: 12.5, background: "#fff" };
  const drop = (k) => { if (dragId && useReal) onMove(dragId, k); setDragId(null); setOverCol(null); };
  const chip = (on, color, bg) => ({ border: "1px solid " + (on ? color : C.line), background: on ? bg : "#fff", color: on ? color : C.sub, cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 20, display: "inline-flex", alignItems: "center" });

  if (scopeApp && !tasks.length) return <Empty>No tasks matched to this app.</Empty>;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: "#EDEEF2", borderRadius: 9, padding: 3 }}>{[["list", "List"], ["board", "Board"]].map(([id, label]) => <button key={id} onClick={() => setTview(id)} style={{ border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: tview === id ? 650 : 550, padding: "5px 14px", borderRadius: 7, background: tview === id ? "#fff" : "transparent", color: tview === id ? C.ink : "#6B7180" }}>{label}</button>)}</div>
        <select value={tlist} onChange={(e) => { setTlist(e.target.value); setStatusFilter(null); }} style={sel}>{["All lists", ...listNames].map((l) => <option key={l}>{l}</option>)}</select>
        {useReal && (() => { const h = listHealth(scope); return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 20, color: h.color, background: h.bg }}>{h.icon} {h.label}</span>; })()}
        <select value={tassignee} onChange={(e) => setTassignee(e.target.value)} style={sel}>{["All assignees", ...D.MEMBERS.map((m) => m.name)].map((l) => <option key={l}>{l}</option>)}</select>
        <input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="Filter tasks…" style={{ ...sel, width: 180 }} />
        {quick && <button onClick={() => setQuick(null)} style={{ border: "none", background: "none", color: C.accent, cursor: "pointer", fontSize: 12 }}>Clear filter</button>}
      </div>

      {tview === "list" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={() => setStatusFilter(null)} style={chip(!statusFilter, C.accent, C.accentBg)}>All · {base.length}</button>
          {statusList.map((st) => <button key={st.name} onClick={() => setStatusFilter(statusFilter === st.name ? null : st.name)} style={chip(statusFilter === st.name, st.color, st.color + "22")}><span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, marginRight: 6 }} />{st.name} · {statusCount(st.name)}</button>)}
        </div>
      )}

      {tview === "list" ? (<GroupedTaskList items={filtered} taskView={taskView} statuses={statusList} />) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + columns.length + ",minmax(210px,1fr))", gap: 12, alignItems: "start", overflowX: "auto" }}>
          {columns.map((col) => {
            const list = colTasks(col); const on = overCol === col.key;
            return (
              <div key={col.key} onDragOver={(e) => { if (useReal) { e.preventDefault(); setOverCol(col.key); } }} onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))} onDrop={() => drop(col.key)}
                style={{ ...card, padding: 10, background: on ? "#F3F1FE" : C.panel, borderColor: on ? C.accent : C.line, borderTop: "3px solid " + col.color }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "2px 4px" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: col.color }} /><b style={{ fontSize: 12.5 }}>{col.label}</b>
                  <span style={{ fontSize: 11, color: "#fff", background: col.color, borderRadius: 20, padding: "0 7px" }}>{list.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 20 }}>
                  {list.map((t) => { const tv = taskView(t); return (
                    <div key={t.id} draggable={useReal} onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOverCol(null); }} onClick={tv.open}
                      style={{ ...card, padding: 10, cursor: useReal ? "grab" : "pointer", opacity: dragId === t.id ? 0.4 : 1, borderLeft: "3px solid " + (t.statusColor || col.color) }}>
                      <div style={{ fontSize: 12.5, fontWeight: 550, color: tv.nfg, textDecoration: tv.strike, marginBottom: 6 }}>{t.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{tv.hasPriority && <Pill fg={tv.pfg} bg={tv.pbg}>{tv.priority}</Pill>}{t.commentCount > 0 && <span style={{ fontSize: 10.5, color: C.faint2 }}>💬 {t.commentCount}</span>}<div style={{ flex: 1 }} /><span style={{ fontSize: 10.5, color: tv.dfg, fontVariantNumeric: "tabular-nums" }}>{tv.due}</span><div style={{ width: 22, height: 22, borderRadius: "50%", background: tv.acolor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{tv.ainit}</div></div>
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
