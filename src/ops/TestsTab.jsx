// @ts-nocheck
import BrandedLoader from "../BrandedLoader";
import { useMemo, useState } from "react";
import { C, card, Empty, member, shortDate } from "./theme";

const TEST_LIST = "Tests & Experiments";
const STATUS_ORDER = ["blocked", "live", "ready for review", "review results", "to do", "complete", "done"];

function field(t, names) {
  const f = fieldObj(t, names);
  return f ? (f.display ?? f.value ?? "") : "";
}

function fieldObj(t, names) {
  const wanted = names.map((n) => n.toLowerCase());
  return (t.allCustomFields || t.customFields || []).find((x) => wanted.includes(String(x.name || "").toLowerCase()));
}

function appName(t) {
  return field(t, ["App", "Application"]) || t.appName || "";
}

function testType(t) {
  return field(t, ["Test Type", "Type"]) || "—";
}

function platformLink(t) {
  return field(t, ["Platform Link", "Firebase Link", "Console Link"]);
}

function reportLink(t) {
  return field(t, ["Report Link", "AdMob Link"]);
}

function summaryText(t) {
  const s = field(t, ["Summary", "Result Summary"]);
  if (s) return s;
  const cleaned = (t.desc || "")
    .replace(/\[table-embed[^\]]*\]/g, " ")
    .replace(/\{[\s\S]*?\}/g, " ")
    .replace(/\|\s*\d+:\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const goal = cleaned.match(/Experiment Goal[\s:.-]*(.*)/i);
  return (goal ? goal[1] : cleaned).slice(0, 220).trim();
}

function significant(t) {
  return field(t, ["Results are significant?", "Results significant?", "Significant"]);
}

function cfOptions(f) {
  const opts = f?.typeConfig?.options || f?.type_config?.options || [];
  return opts.map((o) => ({ label: o.name || o.label || o.id, value: o.id ?? o.orderindex ?? o.label ?? o.name }));
}

function editableCustomValue(f, displayValue) {
  if (f?.type === "drop_down") {
    const match = cfOptions(f).find((o) => o.label === displayValue || String(o.value) === String(displayValue));
    return match ? match.value : displayValue;
  }
  if (f?.type === "checkbox") return !!displayValue;
  return displayValue == null ? "" : displayValue;
}

function localFieldPatch(task, f, displayValue) {
  const raw = editableCustomValue(f, displayValue);
  const update = (fields = []) => fields.map((x) => x.id === f.id ? { ...x, value: displayValue, display: displayValue, rawValue: raw } : x);
  return { customFields: update(task.customFields), allCustomFields: update(task.allCustomFields) };
}

function sortStatuses(statuses) {
  return [...statuses].sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.name.toLowerCase());
    const bi = STATUS_ORDER.indexOf(b.name.toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.name.localeCompare(b.name);
  });
}

function progress(t) {
  if (/done|complete/i.test(t.status)) return 1;
  if (!t.start || !t.due) return 0.45;
  const start = new Date(t.start).getTime();
  const end = new Date(t.due).getTime();
  const now = Date.now();
  return Math.max(0.05, Math.min(1, (now - start) / (end - start || 1)));
}

function LinkCell({ value }) {
  if (!value || value === "—") return <span style={{ color: C.faint2 }}>—</span>;
  if (/^https?:\/\//.test(String(value))) return <a href={value} target="_blank" rel="noreferrer" style={{ color: C.accent, fontWeight: 650 }}>Open</a>;
  return <span>{value}</span>;
}

function StatusPill({ task }) {
  return <span style={{ display: "inline-flex", width: "max-content", maxWidth: 150, color: "#fff", background: task.statusColor || C.faint2, borderRadius: 999, padding: "3px 9px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.status}</span>;
}

function Assignee({ task }) {
  const m = member(task.assignee || "");
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span style={{ width: 22, height: 22, borderRadius: "50%", background: m.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, flex: "none" }}>{m.initials}</span>
      <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.assignee || "Unassigned"}</span>
    </span>
  );
}

function EditableText({ value, onSave, multiline = false }) {
  const [draft, setDraft] = useState(value || "");
  const stop = (e) => e.stopPropagation();
  const save = () => { if (draft !== (value || "")) onSave(draft); };
  const common = { onClick: stop, value: draft, onChange: (e) => setDraft(e.target.value), onBlur: save, style: { width: "100%", minHeight: multiline ? 46 : 30, border: "1px solid transparent", borderRadius: 7, background: "transparent", color: C.ink, padding: "5px 7px", font: "inherit", fontWeight: 650 } };
  return multiline ? <textarea {...common} style={{ ...common.style, resize: "vertical", fontWeight: 500, color: C.sub }} /> : <input {...common} />;
}

function EditableField({ task, names, fallback = "—", syncCustomField }) {
  const f = fieldObj(task, names);
  const value = f ? (f.display ?? f.value ?? "") : "";
  const [draft, setDraft] = useState(value || "");
  const options = cfOptions(f);
  const canEdit = f?.id && ["text", "short_text", "url", "email", "phone", "number", "currency", "drop_down", "labels", "checkbox"].includes(f.type);
  const save = (next = draft) => {
    if (!canEdit || !syncCustomField) return;
    syncCustomField(task.id, f.id, editableCustomValue(f, next), localFieldPatch(task, f, next), "Updated " + f.name);
  };
  if (!canEdit) return <span style={{ color: C.sub }}>{value || fallback}</span>;
  if (f.type === "drop_down" && options.length) {
    return <select onClick={(e) => e.stopPropagation()} value={draft || ""} onChange={(e) => { setDraft(e.target.value); save(e.target.value); }} style={{ width: "100%", height: 30, border: "1px solid " + C.line, borderRadius: 7, background: C.field, color: C.ink, fontSize: 12.5 }}><option value="">—</option>{options.map((o) => <option key={String(o.value)} value={o.label}>{o.label}</option>)}</select>;
  }
  return <EditableText value={draft || ""} onSave={save} multiline={names.some((n) => /summary/i.test(n))} />;
}

function EditableStatus({ task, statuses, syncTaskPatch }) {
  return <select onClick={(e) => e.stopPropagation()} value={task.status} onChange={(e) => syncTaskPatch(task.id, { status: e.target.value }, "Updated status")} style={{ width: "100%", height: 30, border: "1px solid " + C.line, borderRadius: 7, background: C.field, color: C.ink, fontSize: 12.5 }}>{statuses.map((s) => <option key={s.name}>{s.name}</option>)}</select>;
}

function ExperimentRow({ task, openTask, columns }) {
  const cell = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", alignSelf: "center" };
  return (
    <div onClick={() => openTask(task.id)} style={{ display: "grid", gridTemplateColumns: columns.map((c) => c.width + "px").join(" "), alignItems: "center", minHeight: 58, borderTop: "1px solid " + C.line, cursor: "pointer", fontSize: 12.5 }}>
      <div style={{ ...cell, padding: "11px 14px" }}><b style={{ display: "block", fontSize: 13, lineHeight: 1.25, whiteSpace: "normal" }}>{task.name}</b></div>
      <div style={{ ...cell, padding: "11px 14px", color: C.sub }}>{appName(task) || "—"}</div>
      <div style={{ ...cell, padding: "11px 14px" }}><StatusPill task={task} /></div>
      <div style={{ ...cell, padding: "11px 14px", color: C.sub }}>{testType(task)}</div>
      <div style={{ ...cell, padding: "11px 14px" }}><LinkCell value={platformLink(task)} /></div>
      <div style={{ ...cell, padding: "11px 14px" }}><LinkCell value={reportLink(task)} /></div>
      <div style={{ ...cell, padding: "11px 14px", color: C.sub }}>{summaryText(task) || "—"}</div>
      <div style={{ ...cell, padding: "11px 14px" }}><Assignee task={task} /></div>
      <div style={{ ...cell, padding: "11px 14px", color: /yes/i.test(significant(task)) ? C.forest : /no/i.test(significant(task)) ? C.danger : C.faint2, fontWeight: 700 }}>{significant(task) || "—"}</div>
    </div>
  );
}

function GroupedList({ tests, statuses, openTask }) {
  const [closed, setClosed] = useState(() => new Set(statuses.filter((s) => /done|complete/i.test(s.name)).map((s) => s.name)));
  const toggle = (name) => setClosed((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  const groups = statuses.map((s) => ({ ...s, tasks: tests.filter((t) => t.status === s.name) })).filter((g) => g.tasks.length);
  if (!groups.length) return <Empty>No experiments match.</Empty>;
  return (
    <div style={{ ...card, overflow: "hidden" }}>
      {groups.map((g) => (
        <div key={g.name}>
          <button onClick={() => toggle(g.name)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", background: C.panel, border: 0, borderTop: "1px solid " + C.line, color: C.ink, cursor: "pointer", textAlign: "left" }}>
            <span style={{ color: C.faint, fontSize: 12, width: 14 }}>{closed.has(g.name) ? "▸" : "▾"}</span>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: g.color }} />
            <b style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>{g.name}</b>
            <span style={{ fontSize: 11, color: "#fff", background: g.color, borderRadius: 999, padding: "1px 7px" }}>{g.tasks.length}</span>
          </button>
          {!closed.has(g.name) && g.tasks.map((t) => (
            <div key={t.id} onClick={() => openTask(t.id)} style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 180px 150px 170px 140px", gap: 14, alignItems: "center", padding: "12px 14px", borderTop: "1px solid " + C.line, borderLeft: "3px solid " + (t.statusColor || g.color), cursor: "pointer", fontSize: 12.5 }}>
              <div style={{ minWidth: 0 }}><b style={{ display: "block", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</b><span style={{ color: C.faint2 }}>{appName(t) || TEST_LIST}</span></div>
              <span>{testType(t)}</span>
              <Assignee task={t} />
              <span style={{ color: C.sub, fontVariantNumeric: "tabular-nums" }}>{t.start ? shortDate(t.start) : "—"} → {t.due ? shortDate(t.due) : "—"}</span>
              <span style={{ color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summaryText(t) || "—"}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Board({ tests, statuses, openTask }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(" + Math.max(1, statuses.length) + ",minmax(260px,1fr))", gap: 12, overflowX: "auto", alignItems: "start" }}>
      {statuses.map((s) => {
        const list = tests.filter((t) => t.status === s.name);
        return (
          <div key={s.name} style={{ ...card, padding: 10, borderTop: "3px solid " + s.color, minHeight: 120 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color }} />
              <b style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>{s.name}</b>
              <span style={{ fontSize: 11, color: "#fff", background: s.color, borderRadius: 999, padding: "1px 7px" }}>{list.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {list.map((t) => {
                const p = progress(t);
                return (
                  <div key={t.id} onClick={() => openTask(t.id)} style={{ ...card, padding: 12, cursor: "pointer", borderLeft: "3px solid " + (t.statusColor || s.color) }}>
                    <b style={{ display: "block", fontSize: 13, lineHeight: 1.3, marginBottom: 7 }}>{t.name}</b>
                    <div style={{ color: C.sub, fontSize: 12, marginBottom: 9, minHeight: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{appName(t) || testType(t)}</div>
                    <div style={{ height: 6, borderRadius: 6, background: C.panel, overflow: "hidden", marginBottom: 9 }}><div style={{ height: "100%", width: (p * 100) + "%", background: /block/i.test(t.status) ? C.danger : C.forest }} /></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.faint2 }}>
                      <Assignee task={t} />
                      <div style={{ flex: 1 }} />
                      <span>{t.due ? shortDate(t.due) : "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const DEFAULT_COLUMNS = [
  { key: "name", label: "Task Name", width: 310 },
  { key: "app", label: "App", width: 230 },
  { key: "status", label: "Status", width: 150 },
  { key: "type", label: "Test Type", width: 140 },
  { key: "platform", label: "Platform Link", width: 150 },
  { key: "report", label: "Report Link", width: 150 },
  { key: "summary", label: "Summary", width: 320 },
  { key: "assignee", label: "Assignee", width: 190 },
  { key: "significant", label: "Results significant?", width: 170 },
];

function Table({ tests, openTask }) {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const template = columns.map((c) => c.width + "px").join(" ");
  const startResize = (index, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columns[index].width;
    const onMove = (ev) => {
      const width = Math.max(90, startWidth + ev.clientX - startX);
      setColumns((prev) => prev.map((c, i) => i === index ? { ...c, width } : c));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const head = { position: "relative", padding: "10px 14px", fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".08em", color: C.faint, borderBottom: "1px solid " + C.line, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div style={{ ...card, overflow: "auto" }}>
      <div style={{ minWidth: columns.reduce((sum, c) => sum + c.width, 0) }}>
        <div style={{ display: "grid", gridTemplateColumns: template, background: C.panel, position: "sticky", top: 0, zIndex: 2 }}>
          {columns.map((col, idx) => (
            <div key={col.key} style={head}>
              {col.label}
              <span onMouseDown={(e) => startResize(idx, e)} title="Drag to resize column" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 7, cursor: "col-resize", borderRight: "1px solid " + C.lineStrong }} />
            </div>
          ))}
        </div>
        {tests.map((t) => <ExperimentRow key={t.id} task={t} columns={columns} openTask={openTask} />)}
      </div>
    </div>
  );
}

export default function TestsTab({ tasks, q = "", openTask, taskLoadState, syncTaskPatch, syncCustomField }) {
  const [view, setView] = useState("table");
  const [status, setStatus] = useState("All statuses");
  const tests = useMemo(() => {
    const exact = tasks.filter((t) => String(t.list || "").toLowerCase() === TEST_LIST.toLowerCase());
    return exact.length ? exact : tasks.filter((t) => /test|experiment/i.test([t.list, t.name, t.desc].join(" ")));
  }, [tasks]);
  const qq = q.trim().toLowerCase();
  const statuses = useMemo(() => sortStatuses([...new Map(tests.map((t) => [t.status, { name: t.status, color: t.statusColor || C.faint2 }])).values()]), [tests]);
  const activeStatus = statuses.some((s) => s.name === status) ? status : "All statuses";
  const shown = tests.filter((t) => (activeStatus === "All statuses" || t.status === activeStatus) && (!qq || [t.name, t.assignee, appName(t), testType(t), summaryText(t)].some((v) => String(v || "").toLowerCase().includes(qq))));
  const sel = { height: 32, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px", fontSize: 12.5, background: C.field, color: C.ink };

  if (taskLoadState === "loading" && !tasks.length) return <BrandedLoader panel label="Loading experiments" />;
  if (taskLoadState === "error" && !tasks.length) return <Empty>ClickUp experiments are unavailable.</Empty>;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: C.panel, border: "1px solid " + C.line, borderRadius: 8, padding: 3 }}>
          {["list", "board", "table"].map((id) => <button key={id} onClick={() => setView(id)} style={{ border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: view === id ? 750 : 600, padding: "5px 14px", borderRadius: 6, background: view === id ? C.surface : "transparent", color: view === id ? C.ink : C.sub, textTransform: "capitalize" }}>{id}</button>)}
        </div>
        <select value={activeStatus} onChange={(e) => setStatus(e.target.value)} style={sel}>
          {["All statuses", ...statuses.map((s) => s.name)].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span style={{ color: C.faint2, fontSize: 12 }}>{shown.length} experiments from {TEST_LIST}</span>
      </div>
      {view === "list" && <GroupedList tests={shown} statuses={statuses} openTask={openTask} />}
      {view === "board" && <Board tests={shown} statuses={statuses} openTask={openTask} />}
      {view === "table" && <Table tests={shown} openTask={openTask} />}
      {shown.length === 0 && <Empty>No experiments match.</Empty>}
    </>
  );
}
