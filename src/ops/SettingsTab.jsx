// @ts-nocheck
import D from "../activeData";
import { C, TIERS, card, Pill, groupId, since } from "./theme";

const FOLDER_ID = import.meta.env.VITE_CLIENT_CLICKUP_FOLDER || "";

const badgeFor = (status) => {
  if (status === "connected") return { status: "Connected", sfg: "#0B7A55", sbg: "#E6F6F0" };
  if (status === "loading" || status === "idle") return { status: "On demand", sfg: "#5B6172", sbg: "#F1F2F6" };
  if (status === "warning") return { status: "Limited", sfg: "#B45309", sbg: "#FEF3C7" };
  if (status === "unavailable" || status === "error") return { status: "Action needed", sfg: "#B45309", sbg: "#FEF3C7" };
  return { status: "Unknown", sfg: "#5B6172", sbg: "#F1F2F6" };
};

export default function SettingsTab({ tasks, threshold, setThreshold, persist, savedAt, resetSaved, connections, taskLoadState, taskError, loadClickUp }) {
  const monetization = connections && connections.monetization ? connections.monetization : { status: D.SOURCE_ERROR ? "error" : "connected", detail: D.SOURCE_ERROR || "Monetization source loaded" };
  const clickup = connections && connections.clickup ? connections.clickup : { status: taskLoadState === "ready" ? "connected" : taskLoadState || "idle", detail: taskError || "ClickUp task snapshot loads on demand" };
  const mb = badgeFor(monetization.status);
  const cb = badgeFor(clickup.status);
  const folderLabel = FOLDER_ID ? "Folder " + FOLDER_ID : "Configured folder";
  const connectionRows = [
    { mark: "M", color: "#EA4335", name: "Monetization feed", detail: monetization.detail + " · " + D.APPS.length + " apps", ...mb },
    { mark: "C", color: "#7B68EE", name: "ClickUp", detail: clickup.status === "connected" ? folderLabel + " · " + tasks.length + " tasks synced" : clickup.detail, ...cb },
    { mark: "F", color: "#0E9F6E", name: "Firebase", detail: "Backend proxy and cached report feed", status: "Configured", sfg: "#0B7A55", sbg: "#E6F6F0" },
    { mark: "M", color: "#1877F2", name: "Meta Audience Network", detail: "Placement mapping incomplete for 6 apps", status: "Action needed", sfg: "#B45309", sbg: "#FEF3C7" },
  ];
  const members = D.MEMBERS.map((m) => ({ ...m, open: tasks.filter((t) => t.assignee === m.name && groupId(t.status) !== "done").length, role: m.name === "Vishwas HD" ? "Ad Ops Lead" : m.name === "Nadiya Hassan" ? "Ad Ops" : m.name === "Igor Aliev" ? "SDK / Dev" : "Product" }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <div style={card}><div style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, borderBottom: "1px solid " + C.line }}>Connections</div>
        {connectionRows.map((c) => <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #F1F2F6" }}><div style={{ width: 34, height: 34, borderRadius: 9, background: c.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{c.mark}</div><div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: 11.5, color: C.faint2 }}>{c.detail}</div></div><Pill fg={c.sfg} bg={c.sbg}>{c.status}</Pill></div>)}
        {clickup.status !== "connected" && D.loadClickUpTasks && <div style={{ padding: "12px 16px" }}><button onClick={loadClickUp} disabled={taskLoadState === "loading"} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid " + C.line, background: "#fff", color: C.sub, cursor: taskLoadState === "loading" ? "default" : "pointer", fontSize: 12.5, fontWeight: 700 }}>{taskLoadState === "loading" ? "Loading..." : "Load ClickUp now"}</button></div>}
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
