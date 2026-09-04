// @ts-nocheck
// Shared design tokens, formatters, and tiny building-block components for
// the Ops console (Applications / Tasks / Tests / Settings). Kept in one
// place so every tab reads the same palette and number formatting; the actual
// "premium" lever is consistency, not any one component.
import { useState } from "react";
import D from "../activeData";

// Same reliable system-font stack the Dashboard/Trends tab uses (see
// src/reports/reportsStyle.css), no custom webfont name that silently falls
// back because nothing ever loaded it. Numbers align via tabular-nums
// (applied app-wide from the root container in XgrowthOps.tsx) instead of a
// separate monospace face, again matching the Dashboard tab's approach.
const SYSTEM_SANS = "Montserrat, Inter, ui-sans-serif, system-ui, sans-serif";
const DISPLAY = SYSTEM_SANS;

export const C = {
  bg: "var(--xg-bg)", bg2: "var(--xg-bg-2)", panel: "var(--xg-panel)", surface: "var(--xg-surface)",
  surface2: "var(--xg-surface-2)", field: "var(--xg-field)", elevated: "var(--xg-elevated)",
  line: "var(--xg-line)", lineStrong: "var(--xg-line-strong)",
  ink: "var(--xg-ink)", sub: "var(--xg-sub)", faint: "var(--xg-faint)", faint2: "var(--xg-faint-2)",
  accent: "var(--xg-accent)", accentDk: "var(--xg-accent-strong)", accentBg: "var(--xg-accent-soft)",
  brand: "var(--xg-brand-accent)", brandBg: "var(--xg-brand-accent-soft)",
  darkCanvas: "var(--xg-dark-canvas)", darkPanel: "var(--xg-dark-panel)", darkText: "var(--xg-dark-text)", darkSub: "var(--xg-dark-sub)", darkMuted: "var(--xg-dark-muted)", darkLine: "var(--xg-dark-line)",
  forest: "var(--xg-forest)", forestBg: "var(--xg-forest-soft)",
  plum: "var(--xg-plum)", plumBg: "var(--xg-plum-soft)",
  danger: "var(--xg-danger)", dangerBg: "var(--xg-danger-soft)",
  warn: "var(--xg-warn)", warnBg: "var(--xg-warn-soft)",
  info: "var(--xg-info)", infoBg: "var(--xg-info-soft)",
  overlay: "var(--xg-overlay)", inverse: "var(--xg-inverse)",
  shadow: "var(--xg-shadow)", shadowSoft: "var(--xg-shadow-soft)",
  mono: SYSTEM_SANS,
  sans: SYSTEM_SANS,
  display: DISPLAY,
};
export const GROUPS = {
  todo: { label: "To Do", fg: C.sub, bg: C.panel, dot: C.faint2 },
  progress: { label: "In Progress", fg: C.accentDk, bg: C.accentBg, dot: C.accent },
  waiting: { label: "Waiting", fg: C.warn, bg: C.warnBg, dot: C.warn },
  blocked: { label: "Blocked", fg: C.danger, bg: C.dangerBg, dot: C.danger },
  done: { label: "Done", fg: C.forest, bg: C.forestBg, dot: C.forest },
};
export const S2G = { "to do": "todo", "in progress": "progress", development: "progress", rollout: "progress", "prd preparation": "progress", "mediation setup": "progress", test: "progress", live: "progress", "this week": "progress", waiting: "waiting", blocked: "blocked", done: "done", complete: "done", completed: "done" };
export const PRIO = { urgent: C.danger, high: C.warn, normal: C.info, low: C.sub };
export const PRIO_BG = { urgent: C.dangerBg, high: C.warnBg, normal: C.infoBg, low: C.panel };
export const LISTS = ["App Portfolio", "App Porfolio", "Mediation Setup", "SDK Integration", "Tests & Experiments", "Ongoing"];
export const STATUSES = ["to do", "in progress", "development", "rollout", "waiting", "blocked", "done"];
export const PRIORITIES = ["none", "low", "normal", "high", "urgent"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const TIERS = {
  T1: { name: "Core", label: "Tier 1", color: C.accentDk, bg: C.accentBg, drop: 10, respond: "same-day" },
  T2: { name: "Growth", label: "Tier 2", color: C.forest, bg: C.forestBg, drop: 20, respond: "within 24h" },
  T3: { name: "Stable", label: "Tier 3", color: C.warn, bg: C.warnBg, drop: 30, respond: "within 48h" },
  T4: { name: "Long-Tail", label: "Tier 4", color: C.sub, bg: C.panel, drop: 40, respond: "within 48h" },
};

export const money = (n) => { n = Number(n) || 0; return n >= 100000 ? "$" + (n / 1000).toFixed(0) + "K" : n >= 1000 ? "$" + Math.round(n).toLocaleString("en-US") : "$" + n.toFixed(2); };
export const money2 = (n) => "$" + (Number(n) || 0).toFixed(2);
export const money4 = (n) => "$" + (Number(n) || 0).toFixed(4);
export const compact = (n) => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : String(Math.round(n)); };
export const pct = (x) => ((Number(x) || 0) * 100).toFixed(1) + "%";
// timeseriesSource's matchRate/showRate are already 0-100 (not 0-1), unlike
// the demo/AdMob data layer's — this formats those without re-multiplying.
export const pct100 = (x) => (Number(x) || 0).toFixed(1) + "%";
export function delta(cur, prev, invert) {
  const v = prev ? ((cur - prev) / prev) * 100 : 0;
  const good = invert ? v < 0 : v > 0;
  const flat = Math.abs(v) < 0.15;
  return { v, txt: (v >= 0 ? "+" : "") + v.toFixed(1) + "%", arrow: flat ? "→" : v > 0 ? "▲" : "▼", fg: flat ? C.faint : good ? C.forest : C.danger, bg: flat ? C.panel : good ? C.forestBg : C.dangerBg };
}
export const initials = (s) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const appInitials = (name) => { const w = name.replace(/[^\w\s&]/g, "").split(/\s+/).filter(Boolean); return ((w[0] || "")[0] + ((w[1] || "")[0] || "")).toUpperCase(); };
export function appColor(id) { const p = ["#0343EF", "#15803D", "#6D3E75", "#B45309", "#475569", "#0E0F0C", "#2563EB", "#0F766E", "#7C3AED", "#B91C1C", "#64748B", "#181A15"]; let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return p[h % p.length]; }
export const member = (name) => {
  const m = D.MEMBERS.find((x) => x.name === name);
  if (m) return { ...m, initials: m.initials || initials(m.name), color: m.color || appColor(m.name) };
  return { name: name || "Unassigned", initials: name ? initials(name) : "—", color: name ? appColor(name) : C.faint2 };
};
export const appName = (id) => { const a = D.APPS.find((x) => x.id === id); return a ? a.name : "—"; };
export const group = (status) => GROUPS[S2G[status] || "todo"];
export const groupId = (status) => S2G[status] || "todo";
export const shortDate = (s) => { if (!s) return "—"; const d = new Date(s + "T00:00:00Z"); return MON[d.getUTCMonth()] + " " + d.getUTCDate(); };
export function since(iso) { const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); if (s < 45) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago"; }
export const MS = 86400000;
export function computeDates(range, cs, ce) {
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

export const Pill = ({ fg, bg, children }) => <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: fg, background: bg, whiteSpace: "nowrap" }}>{children}</span>;
export const card = { background: C.surface, border: "1px solid " + C.line, borderRadius: 16, boxShadow: C.shadowSoft };
export const Empty = ({ children }) => <div style={{ ...card, padding: 40, textAlign: "center", color: C.faint }}>{children}</div>;

// An integration this client does not have. Deliberately NOT styled as an
// error, and deliberately never backed by sample data: a console that shows
// another portfolio's tasks under this client's name is worse than one that
// shows nothing.
export function NotConnected({ what = "This view", service = "ClickUp", detail }) {
  return (
    <div style={{ ...card, padding: "44px 32px", textAlign: "center" }}>
      <div style={{ width: 40, height: 40, margin: "0 auto 14px", borderRadius: 12, border: "1px solid " + C.line, background: C.field, color: C.faint2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>—</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{service} is not connected</div>
      <div style={{ fontSize: 12.5, color: C.sub, maxWidth: 420, margin: "0 auto", lineHeight: 1.55 }}>
        {detail || what + " needs a " + service + " workspace linked to this client. Ask xGrowth to connect one and this view will fill in."}
      </div>
    </div>
  );
}

// Real store icon when the live source resolved one (see liveSource.ts /
// admob.ts fetchAppIcons); falls back to the colored-initials avatar on a
// broken/missing URL (demo data, or an app with no linked store listing).
export function AppAvatar({ app, size, radius }) {
  const [broken, setBroken] = useState(false);
  if (app.icon && !broken) {
    return <img src={app.icon} onError={() => setBroken(true)} alt="" style={{ width: size, height: size, flex: "none", borderRadius: radius, objectFit: "cover", background: C.field, border: "1px solid " + C.line }} />;
  }
  return <div style={{ width: size, height: size, flex: "none", borderRadius: radius, background: appColor(app.id), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.36), fontWeight: 700 }}>{appInitials(app.name)}</div>;
}
