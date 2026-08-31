// @ts-nocheck
import { useMemo, useState } from "react";
import D from "../activeData";
import { C, GROUPS, LISTS, card, Pill, Empty, groupId } from "./theme";

const DEFAULT_TASK_LIST = "Mediation Setup";

function listHealth(items) {
  const open = items.filter((t) => groupId(t.status) !== "done");
  const overdue = open.filter((t) => t.due && t.due < D.TODAY).length;
  const ratio = open.length ? overdue / open.length : 0;
  if (ratio === 0) return { label: "On track", color: C.forest, bg: C.forestBg, icon: "✓" };
  if (ratio < 0.25) return { label: "Watch", color: C.warn, bg: C.warnBg, icon: "•" };
  return { label: "Behind", color: C.danger, bg: C.dangerBg, icon: "!" };
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
  for (const t of items) if (!known.has(t.status)) known.set(t.status, { name: t.status, color: t.statusColor || C.faint2 });
  const groups = [...known.values()].map((st) => ({ ...st, list: items.filter((t) => t.status === st.name) })).filter((g) => g.list.length);
  const [closed, setClosed] = useState(() => new Set(groups.filter((g) => groupId(g.name) === "done").map((g) => g.name)));
  const toggle = (name) => setClosed((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  if (!groups.length) return <Empty>No tasks match.</Empty>;
  return (
    <div style={{ ...card, overflow: "hidden" }}>
      {groups.map((g) => (
        <div key={g.name}>
          <button onClick={() => toggle(g.name)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: C.panel, border: 0, borderBottom: "1px solid " + C.line, color: C.ink, cursor: "pointer", textAlign: "left" }}>
            <span style={{ color: C.faint, fontSize: 12, width: 14 }}>{closed.has(g.name) ? "▸" : "▾"}</span>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: g.color }} />
            <b style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>{g.name}</b>
            <span style={{ fontSize: 11, color: "#fff", background: g.color, borderRadius: 20, padding: "0 7px" }}>{g.list.length}</span>
          </button>
          {!closed.has(g.name) && g.list.map((t) => { const tv = taskView(t); const overdue = t.due && t.due < D.TODAY && groupId(t.status) !== "done"; return (
            <div key={t.id} onClick={tv.open} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 190px 150px", gap: 12, alignItems: "center", padding: "11px 14px", borderBottom: "1px solid " + C.line, borderLeft: "3px solid " + (t.statusColor || g.color), cursor: "pointer" }}>
              <div onClick={tv.toggle} style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid " + tv.checkBd, background: tv.checkBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{tv.check}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 550, color: tv.nfg, textDecoration: tv.strike, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div><div style={{ fontSize: 11, color: C.faint2 }}>{t.list}</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><div style={{ width: 24, height: 24, flex: "none", borderRadius: "50%", background: tv.acolor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{tv.ainit}</div><span style={{ fontSize: 12.5, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.assignee || "Unassigned"}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>{overdue && <span style={{ fontSize: 10, fontWeight: 700, color: C.danger, background: C.dangerBg, padding: "1px 7px", borderRadius: 6 }}>OVERDUE</span>}<span style={{ fontSize: 12.5, color: overdue ? C.danger : C.sub, fontVariantNumeric: "tabular-nums" }}>{tv.due}</span></div>
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
export default function TasksTab({ tasks: allTasks, taskView, onMove, scopeApp, taskAppMap, taskLoadState }) {
  const [tview, setTview] = useState("list");
  const [tlist, setTlist] = useState(DEFAULT_TASK_LIST);
  const [tassignee, setTassignee] = useState("All assignees");
  const [tq, setTq] = useState("");
  const tasks = useMemo(() => (scopeApp ? allTasks.filter((t) => (taskAppMap && taskAppMap.get(t.id)) === scopeApp) : allTasks), [allTasks, scopeApp, taskAppMap]);
  const meta = D.LISTS_META;
  const listNames = useMemo(() => {
    const available = meta ? Object.keys(meta) : LISTS;
    const ordered = LISTS.filter((name) => available.includes(name));
    return ordered.length ? ordered : available;
  }, [meta]);
  const activeList = listNames.includes(tlist) ? tlist : (listNames[0] || DEFAULT_TASK_LIST);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const tqq = tq.trim().toLowerCase();

  const listScope = tasks.filter((t) => t.list === activeList && (!tqq || t.name.toLowerCase().includes(tqq)));
  const assigneeOptions = useMemo(() => {
    return [...new Set(listScope.map((t) => t.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [listScope]);
  const activeAssignee = assigneeOptions.includes(tassignee) ? tassignee : "All assignees";
  const scope = listScope.filter((t) => activeAssignee === "All assignees" || t.assignee === activeAssignee);
  const base = scope;
  const filtered = base;

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
  const activeStatuses = useReal ? (meta[activeList] || allRealStatuses) : null;
  const statusList = useReal ? activeStatuses.map((s) => ({ name: s.name, color: s.color || C.faint2 })) : [...new Map(base.map((t) => [t.status, { name: t.status, color: t.statusColor || C.faint2 }])).values()];

  const columns = useReal ? activeStatuses.map((s) => ({ label: s.name, color: s.color || C.faint2, key: s.name })) : ["todo", "progress", "waiting", "blocked", "done"].map((gid) => ({ label: GROUPS[gid].label, color: GROUPS[gid].dot, key: gid }));
  const colTasks = (col) => filtered.filter((t) => (useReal ? t.status === col.key : groupId(t.status) === col.key));
  const order = { blocked: 0, progress: 1, waiting: 2, todo: 3, done: 4 };
  const sel = { height: 32, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px", fontSize: 12.5, background: C.field, color: C.ink };
  const drop = (k) => { if (dragId && useReal) onMove(dragId, k); setDragId(null); setOverCol(null); };

  if (!scopeApp && taskLoadState === "loading" && !tasks.length) return <Empty>Loading ClickUp tasks...</Empty>;
  if (!scopeApp && taskLoadState === "error" && !tasks.length) return <Empty>ClickUp tasks are unavailable.</Empty>;
  if (scopeApp && !tasks.length) return <Empty>No tasks matched to this app.</Empty>;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: C.panel, border: "1px solid " + C.line, borderRadius: 8, padding: 3 }}>{[["list", "List"], ["board", "Board"]].map(([id, label]) => <button key={id} onClick={() => setTview(id)} style={{ border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: tview === id ? 650 : 550, padding: "5px 14px", borderRadius: 6, background: tview === id ? C.surface : "transparent", color: tview === id ? C.ink : C.sub }}>{label}</button>)}</div>
        <select value={activeList} onChange={(e) => { setTlist(e.target.value); setTassignee("All assignees"); }} style={sel}>{listNames.map((l) => <option key={l}>{l}</option>)}</select>
        {useReal && (() => { const h = listHealth(scope); return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 20, color: h.color, background: h.bg }}>{h.icon} {h.label}</span>; })()}
        <select value={activeAssignee} onChange={(e) => setTassignee(e.target.value)} style={sel}>{["All assignees", ...assigneeOptions].map((l) => <option key={l}>{l}</option>)}</select>
        <input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="Filter tasks…" style={{ ...sel, width: 180 }} />
      </div>

      {tview === "list" ? (<GroupedTaskList items={filtered} taskView={taskView} statuses={statusList} />) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + columns.length + ",minmax(210px,1fr))", gap: 12, alignItems: "start", overflowX: "auto" }}>
          {columns.map((col) => {
            const list = colTasks(col); const on = overCol === col.key;
            return (
              <div key={col.key} onDragOver={(e) => { if (useReal) { e.preventDefault(); setOverCol(col.key); } }} onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))} onDrop={() => drop(col.key)}
                style={{ ...card, padding: 10, background: on ? C.accentBg : C.panel, borderColor: on ? C.accent : C.line, borderTop: "3px solid " + col.color }}>
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
