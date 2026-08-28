// @ts-nocheck
// Shared design tokens, formatters, and tiny building-block components for
// the Ops console (Applications / Tasks / Tests / Settings). Kept in one
// place so every tab reads the same palette and number formatting instead of
// each re-declaring its own — the actual "premium" lever is consistency, not
// any one component.
import { useState } from "react";
import D from "../activeData";

// Same reliable system-font stack the Dashboard/Trends tab uses (see
// src/reports/reportsStyle.css) — no custom webfont name that silently falls
// back because nothing ever loaded it. Numbers align via tabular-nums
// (applied app-wide from the root container in XgrowthOps.tsx) instead of a
// separate monospace face, again matching the Dashboard tab's approach.
const SYSTEM_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const C = {
  bg: "#F6F7F9", panel: "#FAFAFC", surface: "#FFFFFF", line: "#E9EAF0",
  ink: "#14161C", sub: "#5B6172", faint: "#8A90A0", faint2: "#9AA0AE",
  accent: "#5B4BE8", accentDk: "#4E3FD8", accentBg: "#EFEDFF",
  mono: SYSTEM_SANS,
  sans: SYSTEM_SANS,
};
export const GROUPS = {
  todo: { label: "To Do", fg: "#5B6172", bg: "#F1F2F6", dot: "#9AA0AE" },
  progress: { label: "In Progress", fg: "#4E3FD8", bg: "#EFEDFF", dot: "#5B4BE8" },
  waiting: { label: "Waiting", fg: "#B45309", bg: "#FEF3C7", dot: "#D9730D" },
  blocked: { label: "Blocked", fg: "#C31C2B", bg: "#FDECEE", dot: "#E02D3C" },
  done: { label: "Done", fg: "#0B7A55", bg: "#E6F6F0", dot: "#0E9F6E" },
};
export const S2G = { "to do": "todo", "in progress": "progress", development: "progress", rollout: "progress", "prd preparation": "progress", "mediation setup": "progress", test: "progress", live: "progress", "this week": "progress", waiting: "waiting", blocked: "blocked", done: "done", complete: "done", completed: "done" };
export const PRIO = { urgent: "#E02D3C", high: "#D9730D", normal: "#2563EB", low: "#6B7180" };
export const PRIO_BG = { urgent: "#FDECEE", high: "#FFF4E6", normal: "#EAF1FE", low: "#F1F2F6" };
export const LISTS = ["Ongoing", "AdOps & Monetization", "Mediation Setup", "App Portfolio", "SDK Integration", "Tests & Experiments"];
export const STATUSES = ["to do", "in progress", "development", "rollout", "waiting", "blocked", "done"];
export const PRIORITIES = ["none", "low", "normal", "high", "urgent"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const TIERS = {
  T1: { name: "Core", label: "Tier 1", color: "#4E3FD8", bg: "#EFEDFF", drop: 10, respond: "same-day" },
  T2: { name: "Growth", label: "Tier 2", color: "#0B7A55", bg: "#E6F6F0", drop: 20, respond: "within 24h" },
  T3: { name: "Stable", label: "Tier 3", color: "#B45309", bg: "#FEF3C7", drop: 30, respond: "within 48h" },
  T4: { name: "Long-Tail", label: "Tier 4", color: "#5B6172", bg: "#F1F2F6", drop: 40, respond: "within 48h" },
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
  return { v, txt: (v >= 0 ? "+" : "") + v.toFixed(1) + "%", arrow: flat ? "→" : v > 0 ? "▲" : "▼", fg: flat ? "#8A90A0" : good ? "#0B7A55" : "#C31C2B", bg: flat ? "#F1F2F6" : good ? "#E6F6F0" : "#FDECEE" };
}
export const initials = (s) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const appInitials = (name) => { const w = name.replace(/[^\w\s&]/g, "").split(/\s+/).filter(Boolean); return ((w[0] || "")[0] + ((w[1] || "")[0] || "")).toUpperCase(); };
export function appColor(id) { const p = ["#5B4BE8", "#0E9F6E", "#D9730D", "#C2255C", "#0891B2", "#7C3AED", "#B45309", "#2563EB", "#DB2777", "#059669", "#E02D3C", "#6D28D9"]; let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return p[h % p.length]; }
export const member = (name) => {
  const m = D.MEMBERS.find((x) => x.name === name);
  if (m) return { ...m, initials: m.initials || initials(m.name), color: m.color || appColor(m.name) };
  return { name: name || "Unassigned", initials: name ? initials(name) : "—", color: name ? appColor(name) : "#B4B9C4" };
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
export const card = { background: C.surface, border: "1px solid " + C.line, borderRadius: 12 };
export const Empty = ({ children }) => <div style={{ ...card, padding: 40, textAlign: "center", color: C.faint }}>{children}</div>;

// Real store icon when the live source resolved one (see liveSource.ts /
// admob.ts fetchAppIcons); falls back to the colored-initials avatar on a
// broken/missing URL (demo data, or an app with no linked store listing).
export function AppAvatar({ app, size, radius }) {
  const [broken, setBroken] = useState(false);
  if (app.icon && !broken) {
    return <img src={app.icon} onError={() => setBroken(true)} alt="" style={{ width: size, height: size, flex: "none", borderRadius: radius, objectFit: "cover", background: "#fff", border: "1px solid #E9EAF0" }} />;
  }
  return <div style={{ width: size, height: size, flex: "none", borderRadius: radius, background: appColor(app.id), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.36), fontWeight: 700 }}>{appInitials(app.name)}</div>;
}
