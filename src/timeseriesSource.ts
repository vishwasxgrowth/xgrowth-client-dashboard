// @ts-nocheck
// Shared timeseries.json reader for the Applications tab (list + per-app
// dashboard). Same URL and schema as reports/reportsApp.js's Trends view
// (see apps-script/timeseries-webapp.gs for the authoritative shape), so the
// Applications tab and the Dashboard tab always agree on the numbers instead
// of the Applications tab deriving its own from the AdMob mediation report.
const BASE = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").replace(/\/$/, "");
const CLIENT = import.meta.env.VITE_CLIENT_ID || "jedyapps";

function tsUrl() {
  return BASE ? BASE + "/timeseries?clientId=" + encodeURIComponent(CLIENT) : "/dev-timeseries.json";
}

let inflight = null; // shared across every caller in this tab session
export function loadTimeseries() {
  if (!inflight) {
    inflight = fetch(tsUrl(), { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("timeseries.json " + r.status); return r.json(); })
      .catch((e) => { inflight = null; throw e; });
  }
  return inflight;
}

function seriesFor(ts, appName) {
  return appName ? ts.apps[appName] : ts.portfolio;
}

export function tsAppNames(ts) {
  return ts && ts.apps ? Object.keys(ts.apps) : [];
}

// [a, b] inclusive index range into ts.dates for the trailing `days` window.
export function tsRangeIdx(ts, days) {
  const n = ts.dates.length;
  const d = Math.min(days, n);
  return { a: n - d, b: n - 1, days: d };
}

// One day's row, by index into ts.dates. Nulls where the feed has no entry
// (e.g. an app with no Users pull has no .dau/.dav at all).
export function tsDayRowAt(ts, appName, i) {
  const s = seriesFor(ts, appName);
  const date = ts.dates[i];
  const revenue = s && s.revenue ? s.revenue[i] : null;
  const impressions = s && s.impressions ? s.impressions[i] : null;
  const matched = s && s.matched ? s.matched[i] : null;
  const dav = s && s.dav ? s.dav[i] : null;
  return {
    date, revenue, impressions, matched, dav,
    ecpm: impressions ? (revenue / impressions) * 1000 : null,
    arpdav: dav ? revenue / dav : null,
  };
}

// Window aggregate: sums the additive metrics, then derives rates from those
// sums (never averages a rate across days) -- the same rule the reports
// engine and Trends view use.
export function tsAggregate(ts, appName, a, b) {
  const s = seriesFor(ts, appName);
  let revenue = 0, impressions = 0, requests = 0, matched = 0, dau = 0, dav = 0, dauN = 0, davN = 0;
  if (s) {
    for (let i = a; i <= b; i++) {
      if (s.revenue && s.revenue[i] != null) revenue += s.revenue[i];
      if (s.impressions && s.impressions[i] != null) impressions += s.impressions[i];
      if (s.requests && s.requests[i] != null) requests += s.requests[i];
      if (s.matched && s.matched[i] != null) matched += s.matched[i];
      if (s.dau && s.dau[i] != null) { dau += s.dau[i]; dauN++; }
      if (s.dav && s.dav[i] != null) { dav += s.dav[i]; davN++; }
    }
  }
  return {
    revenue, impressions, requests, matched,
    dau: dauN ? dau / dauN : 0,
    ecpm: impressions ? (revenue / impressions) * 1000 : 0,
    matchRate: requests ? (matched / requests) * 100 : 0,
    showRate: matched ? (impressions / matched) * 100 : 0,
    arpdau: dau ? revenue / dau : 0,
    arpdav: dav ? revenue / dav : 0,
  };
}

/* ---------------- ClickUp task <-> app matching ----------------
   The JedyApps ClickUp folder has no custom field linking a task to an app
   (checked: only "Weeks" / "App Store" / a notes field exist at folder and
   list level). The real convention is that portfolio-tracking lists (App
   Portfolio, Mediation Setup, SDK Integration, ...) simply name the task
   after the app, occasionally shortened or with a typo. This infers the link
   from the task name against the real app-name list, best-effort. */
// A stopword list rather than a length cutoff: "GrowMe" needs its "me" token
// to survive (length 2) while generic filler words still don't count as a
// meaningful overlap on their own.
const STOPWORDS = new Set(["app", "the", "for", "and", "pro", "free", "new", "hd"]);
function normalizeName(s) {
  return String(s || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2") // split camelCase: "GrowMe" -> "Grow Me"
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function tokenSet(s) {
  return new Set(normalizeName(s).split(" ").filter((w) => w.length >= 2 && !STOPWORDS.has(w)));
}
// Edit distance, capped: only cares whether two words are "close enough" (a
// likely typo of one another), not the exact distance.
function closeEnough(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length] <= 1;
}
export function matchAppForTask(taskName, appNames) {
  const tn = normalizeName(taskName);
  if (!tn) return null;
  for (const name of appNames) {
    const an = normalizeName(name);
    if (an && (tn === an || tn.includes(an) || an.includes(tn))) return name;
  }
  const tset = tokenSet(taskName);
  if (!tset.size) return null;
  let best = null, bestScore = 0, secondScore = 0;
  for (const name of appNames) {
    const aset = [...tokenSet(name)];
    if (!aset.length) continue;
    let hits = 0;
    for (const w of tset) if (aset.some((x) => closeEnough(w, x))) hits++;
    const score = hits / Math.max(tset.size, aset.length);
    if (score > bestScore) { secondScore = bestScore; best = name; bestScore = score; }
    else if (score > secondScore) secondScore = score;
  }
  // Require a clear, non-ambiguous winner so two similarly-named apps don't
  // both plausibly claim the same task.
  return (best && bestScore >= 0.5 && bestScore - secondScore >= 0.15) ? best : null;
}

export function buildTaskAppIndex(tasks, appNames) {
  const map = new Map();
  for (const t of tasks || []) map.set(t.id, matchAppForTask(t.name, appNames));
  return map;
}
