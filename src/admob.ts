// @ts-nocheck
// AdMob calls. In production they go through the xGrowth proxy (server-side token,
// scoped by clientId). If a dev access token is provided, calls go browser-direct.
const BASE = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").replace(/\/$/, "");
const CLIENT = import.meta.env.VITE_CLIENT_ID || "jedyapps";
const DEV_TOKEN = import.meta.env.VITE_DEV_ACCESS_TOKEN || "";

export async function generateMediationReport(accountName, reportSpec, token) {
  let url, headers;
  if (BASE && !DEV_TOKEN) {
    // via proxy: /admob/v1alpha/{account}/mediationReport:generate?clientId=...
    url = BASE + "/admob/v1alpha/" + accountName + "/mediationReport:generate?clientId=" + encodeURIComponent(CLIENT);
    headers = { "Content-Type": "application/json" };
  } else {
    url = "https://admob.googleapis.com/v1alpha/" + accountName + "/mediationReport:generate";
    headers = { Authorization: "Bearer " + (DEV_TOKEN || token), "Content-Type": "application/json" };
  }
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify({ reportSpec }) });
  if (!resp.ok) throw new Error("AdMob " + resp.status + ": " + (await resp.text()));
  const text = await resp.text();
  try { return JSON.parse(text); }
  catch { return text.split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
}

// App icons: AdMob's own API has no icon field, so this goes through the
// server proxy, which resolves each app's icon from its linked store listing
// (see functions/index.js's /app-icons route) and caches the result. Returns
// { [admobAppId]: iconUrl }; apps with no linked store listing are just absent.
export async function fetchAppIcons(accountName) {
  if (!BASE) return {}; // only available via the proxy (needs a server-side fetch)
  const url = BASE + "/app-icons?clientId=" + encodeURIComponent(CLIENT) + "&account=" + encodeURIComponent(accountName);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("app-icons " + resp.status);
  return resp.json();
}

// Per-ad-unit mediation report (AD_UNIT dimension) for test analysis.
export async function adUnitReport(accountName, startDate, endDate) {
  const spec = {
    dateRange: { startDate, endDate },
    dimensions: ["AD_UNIT"],
    metrics: ["ESTIMATED_EARNINGS", "OBSERVED_ECPM", "IMPRESSIONS", "AD_REQUESTS", "MATCHED_REQUESTS", "CLICKS"],
    localizationSettings: { currencyCode: "USD", languageCode: "en-US" },
  };
  let url, headers;
  if (BASE && !DEV_TOKEN) {
    url = BASE + "/admob/v1alpha/" + accountName + "/mediationReport:generate?clientId=" + encodeURIComponent(CLIENT);
    headers = { "Content-Type": "application/json" };
  } else {
    url = "https://admob.googleapis.com/v1alpha/" + accountName + "/mediationReport:generate";
    headers = { Authorization: "Bearer " + DEV_TOKEN, "Content-Type": "application/json" };
  }
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify({ reportSpec: spec }) });
  if (!resp.ok) throw new Error("AdMob adunit " + resp.status);
  const text = await resp.text();
  let rows; try { rows = JSON.parse(text); } catch { rows = text.split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
  const gm = (v) => (!v ? 0 : typeof v.doubleValue === "number" ? v.doubleValue : v.microsValue ? Number(v.microsValue) / 1e6 : v.integerValue ? Number(v.integerValue) : 0);
  const map = {}; // adUnitId (numeric tail) -> metrics
  for (const entry of rows || []) {
    const r = entry.row; if (!r) continue;
    const dv = r.dimensionValues?.["AD_UNIT"]; const id = dv?.value || ""; const label = dv?.displayLabel || id;
    const revenue = gm(r.metricValues?.["ESTIMATED_EARNINGS"]), impressions = gm(r.metricValues?.["IMPRESSIONS"]);
    const requests = gm(r.metricValues?.["AD_REQUESTS"]), matched = gm(r.metricValues?.["MATCHED_REQUESTS"]), clicks = gm(r.metricValues?.["CLICKS"]);
    const rec = { id, label, revenue, impressions, requests, matched, clicks, ecpm: impressions ? (revenue / impressions) * 1000 : gm(r.metricValues?.["OBSERVED_ECPM"]) };
    map[id] = rec;
    // Also key by the numeric tail so "ca-app-pub-XXX/NNNN" configs can match
    const tail = String(id).split("/").pop(); if (tail) map[tail] = rec;
  }
  return map;
}
