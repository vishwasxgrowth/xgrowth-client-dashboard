// @ts-nocheck
// Who this browser session is for, and the single place every API call picks
// up the caller's identity.
//
// clientId is resolved at RUNTIME from the hostname rather than baked in at
// build time, so ONE build serves every client:
//   jedyapps.thexgrowth.com  -> "jedyapps"
//   ?client=trulinco         -> "trulinco"   (local dev / preview only)
//   VITE_CLIENT_ID           -> fallback, keeps the legacy single-client build
export const BASE = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").replace(/\/$/, "");

// Hosts that are never a client name.
const NOT_A_CLIENT = new Set(["www", "app", "dashboard", "localhost"]);

// Only a host under the client domain carries a clientId in its first label.
// dolphin-fdffc.web.app is the Firebase SITE name, not a client, so a blanket
// "first label of any 3-part host" rule reads the project name as a client and
// asks the API for a client that does not exist.
const CLIENT_DOMAIN = String(import.meta.env.VITE_CLIENT_DOMAIN || "thexgrowth.com").toLowerCase();

const PICK_KEY = "xgrowth-client.v1";

// Remembers the client chosen in the picker, and forgets it on demand.
export function setClient(id) {
  try { sessionStorage.setItem(PICK_KEY, String(id).toLowerCase()); } catch (e) {}
  // A reload is deliberate: every module caches per client (the timeseries
  // fetch especially), and restarting is far safer than invalidating by hand.
  location.replace(location.pathname);
}
export function clearClient() {
  try { sessionStorage.removeItem(PICK_KEY); } catch (e) {}
  location.replace(location.pathname);
}

// Returns "" when nothing has been chosen and the host does not imply one —
// that is the signal to show the picker rather than guess.
export function resolveClientId() {
  try {
    const q = new URLSearchParams(location.search).get("client");
    if (q) return q.toLowerCase();
  } catch (e) {}
  try {
    const saved = sessionStorage.getItem(PICK_KEY);
    if (saved) return saved.toLowerCase();
  } catch (e) {}
  const host = String(location.hostname || "").toLowerCase();

  // acmeapps.thexgrowth.com -> "acmeapps"
  if (CLIENT_DOMAIN && host.endsWith("." + CLIENT_DOMAIN)) {
    const label = host.slice(0, -(CLIENT_DOMAIN.length + 1));
    if (label && !label.includes(".") && !NOT_A_CLIENT.has(label)) return label;
  }

  // Per-client Firebase site, before a custom domain is attached:
  // acmeapps-xg.web.app -> "acmeapps". The -xg suffix is what keeps this from
  // matching the project's own site.
  const m = host.match(/^([a-z0-9][a-z0-9-]*)-xg\.(web\.app|firebaseapp\.com)$/);
  if (m) return m[1];

  return "";   // ask the user
}

export let CLIENT = resolveClientId();
// Set once, before anything fetches, when the picker is skipped because the
// deployment only serves one client.
export function adoptClient(id) { CLIENT = String(id || "").toLowerCase(); }
export const FALLBACK_CLIENT = String(import.meta.env.VITE_CLIENT_ID || "").toLowerCase();

// Display name, AdMob account and ClickUp folder come from the server's
// client registry at runtime (GET /session), not from the build. This is what
// lets one deployed bundle serve every client.
export const meta = { displayName: "", admobAccount: "", clickupFolder: "" };
export function setMeta(m) { Object.assign(meta, m || {}); }
export function clientName() {
  return meta.displayName || CLIENT.replace(/(^|[-_])(\w)/g, (_, s, c) => (s ? " " : "") + c.toUpperCase());
}

let idToken = null;
export function setIdToken(t) { idToken = t; }
export function getIdToken() { return idToken; }

// Raised when the server rejects the caller, so the UI can show a sign-in
// screen instead of a generic "failed to fetch".
export class AuthError extends Error {
  constructor(status) {
    super(status === 403 ? "not-authorised" : "signed-out");
    this.status = status;
  }
}

// Every call to the Cloud Function goes through here, so the identity header
// cannot be forgotten at an individual call site. An Authorization header the
// caller already set (direct-to-AdMob dev mode) is left alone.
export async function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (idToken && !headers.Authorization) headers.Authorization = "Bearer " + idToken;
  if (CLIENT) headers["X-Client-Id"] = CLIENT;
  const r = await fetch(url, { ...opts, headers });
  if (r.status === 401 || r.status === 403) throw new AuthError(r.status);
  return r;
}

// What this client actually has wired up, straight from the server registry.
// The UI must never substitute bundled sample data for a missing integration:
// an unconfigured integration is a state to render, not an error to paper over.
export const hasClickUp = () => !!meta.clickupFolder;
export const hasAdMob = () => !!meta.admobAccount;

// localStorage is shared across every client this browser opens, so any
// per-client cache key must carry the clientId. Without this, the first
// client you view leaks its ClickUp tasks into every other client's console.
export function scopedKey(base) {
  return CLIENT ? base + ":" + CLIENT : base;
}
