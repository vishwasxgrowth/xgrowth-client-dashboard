// @ts-nocheck
import D from "../activeData";
import { C, TIERS, card, Pill, groupId, since } from "./theme";

export default function SettingsTab({ tasks, threshold, setThreshold, persist, savedAt, resetSaved }) {
  const clickupFailed = D.IS_LIVE && D.TASKS_SOURCE !== "clickup";
  const connections = [
    clickupFailed
      ? { mark: "C", color: "#7B68EE", name: "ClickUp", detail: "Could not load tasks from ClickUp — showing " + tasks.length + " demo tasks instead. Check the CLICKUP_TOKEN secret and folder id, then see the browser console for the fetch error.", status: "Action needed", sfg: "#B45309", sbg: "#FEF3C7" }
      : { mark: "C", color: "#7B68EE", name: "ClickUp", detail: "Space JedyApps · folder 901210858217 · " + tasks.length + " tasks synced", status: "Connected", sfg: "#0B7A55", sbg: "#E6F6F0" },
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
        {members.map((m) => <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #F1F2F6" }}><div style={{ width: 32, height: 32, borderRadius: "50%", background: m.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{m.initials}</div><div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div><div style={{ fontSize: 11.5, color: C.faint2 }}>{m.role}</div></div><span style={{ fontSize: 12, color: C.sub, fontVariantNumeric: "tabular-nums" }}>{m.open} open</span></div>)}
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
