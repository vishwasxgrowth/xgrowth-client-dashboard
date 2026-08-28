// @ts-nocheck
import D from "../activeData";
import { C, card, Empty, member, groupId, shortDate } from "./theme";

export default function TestsTab({ tasks, q, tfilter, setTfilter, openTask }) {
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
          <div key={t.id} onClick={() => openTask(t.id)} style={{ ...card, padding: 0, cursor: "pointer", overflow: "hidden" }}>
            <div style={{ height: 4, background: t.statusColor || "#9AA0AE" }} />
            <div style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><b style={{ fontSize: 13.5, lineHeight: 1.3 }}>{t.name}</b><div style={{ flex: 1 }} />{(() => { const n = ((t.desc || "").match(/\{/g) || []).length; return n > 1 ? <span style={{ fontSize: 10, fontWeight: 700, color: C.accentDk, background: C.accentBg, padding: "2px 7px", borderRadius: 20 }}>{n} arms</span> : null; })()}<span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: "#fff", background: t.statusColor || "#9AA0AE" }}>{t.status}</span></div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.45, minHeight: 34, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{clean(t.desc) || "—"}</div>
            <div style={{ height: 6, borderRadius: 4, background: "#F1F2F6", overflow: "hidden", marginBottom: 10 }}><div style={{ width: (p * 100) + "%", height: "100%", background: pc }} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.faint2 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: m.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{m.initials}</span>
              <span>{t.assignee || "Unassigned"}</span><div style={{ flex: 1 }} /><span style={{ fontVariantNumeric: "tabular-nums" }}>{t.start ? shortDate(t.start) : "—"} → {t.due ? shortDate(t.due) : "—"}</span>
            </div>
            </div>
          </div>
        ); })}
      </div>
      {shown.length === 0 && <Empty>No experiments match.</Empty>}
    </>
  );
}
