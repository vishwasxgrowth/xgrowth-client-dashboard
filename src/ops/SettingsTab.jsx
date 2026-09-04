// @ts-nocheck
import D from "../activeData";
import { C, TIERS, card } from "./theme";

const STATUS_TONE = {
  connected: { label: "Connected", fg: C.forest, bg: C.forestBg },
  idle: { label: "Ready", fg: C.sub, bg: C.field },
  loading: { label: "Loading", fg: C.sub, bg: C.field },
  warning: { label: "Partial", fg: C.warn, bg: C.warnBg },
  error: { label: "Error", fg: C.danger, bg: C.dangerBg },
  "not-configured": { label: "Not connected", fg: C.faint2, bg: C.field },
  unavailable: { label: "Unavailable", fg: C.faint2, bg: C.field },
};
const CONNECTION_LABEL = { monetization: "Monetization feed", admob: "AdMob", clickup: "ClickUp" };

export default function SettingsTab({ tasks, threshold, setThreshold, persist, savedAt, resetSaved, connections, taskLoadState, taskError, loadClickUp, theme, setTheme }) {
  const members = D.MEMBERS;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <div style={{ ...card, padding: 16 }}>
        <div className="xg-display" style={{ fontSize: 22, marginBottom: 6 }}>Appearance</div>
        <div style={{ color: C.sub, fontSize: 12.5, marginBottom: 14 }}>Theme follows your system setting on first visit and is saved after you choose.</div>
        <div style={{ display: "inline-grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, border: "1px solid " + C.line, borderRadius: 8, background: C.field }}>
          {["dark", "light"].map((mode) => (
            <button key={mode} onClick={() => setTheme(mode)} aria-pressed={theme === mode} style={{ border: 0, borderRadius: 6, padding: "8px 14px", background: theme === mode ? C.accentBg : "transparent", color: theme === mode ? C.accentDk : C.sub, cursor: "pointer", fontWeight: 700, textTransform: "capitalize" }}>{mode}</button>
          ))}
        </div>
      </div>
      <div style={card}><div style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, borderBottom: "1px solid " + C.line }}>Connections</div>
        {["monetization", "admob", "clickup"].map((key) => {
          const c = (connections || {})[key];
          if (!c) return null;
          const tone = STATUS_TONE[c.status] || STATUS_TONE.unavailable;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid " + C.line }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{CONNECTION_LABEL[key] || key}</div>
                <div style={{ fontSize: 11.5, color: C.faint2 }}>{c.detail}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: tone.fg, background: tone.bg, whiteSpace: "nowrap" }}>{tone.label}</span>
            </div>
          );
        })}
      </div>
      <div style={card}><div style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, borderBottom: "1px solid " + C.line }}>Team</div>
        {taskLoadState === "not-configured"
          ? <div style={{ padding: "18px 16px", fontSize: 12.5, color: C.faint, lineHeight: 1.55 }}>Team members come from the ClickUp workspace linked to this client. None is linked yet.</div>
          : !members.length
            ? <div style={{ padding: "18px 16px", fontSize: 12.5, color: C.faint }}>No team members loaded.</div>
            : members.map((m) => <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid " + C.line }}><div style={{ width: 32, height: 32, borderRadius: "50%", background: m.color || C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{m.initials || String(m.name || "?").slice(0, 2).toUpperCase()}</div><div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div></div></div>)}
      </div>
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>How apps are tiered</div>
        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 8 }}>Each app is assigned a tier by its trailing 30-day ad revenue. The tier sets how large a drop is worth flagging and how quickly to act.</div>
        {["T1", "T2", "T3", "T4"].map((t) => { const T = TIERS[t]; const rng = t === "T1" ? "$15,000+" : t === "T2" ? "$3,000-$14,999" : t === "T3" ? "$500-$2,999" : "under $500"; return (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid " + C.line }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, color: T.color, background: T.bg, whiteSpace: "nowrap" }}>{T.label}</span>
            <span style={{ fontSize: 12.5, color: C.sub }}>{rng} / 30 days · flag a {T.drop}% drop · respond {T.respond}</span>
          </div>); })}
        <div style={{ fontSize: 11.5, color: C.faint2, marginTop: 10 }}>Apps below about $50/day are held out of percentage alerts, so tiny-base swings don't create noise.</div>
      </div>
    </div>
  );
}
