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
