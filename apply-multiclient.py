#!/usr/bin/env python3
"""Applies the multi-client + access-gate edits to the files that only need a
few lines changed. New files arrive whole in the tarball; this handles the
seven that are mostly untouched. Safe to re-run: it exits without writing if
an anchor is missing or already applied."""
import io, sys

def ed(path, pairs):
    s = io.open(path, encoding="utf-8").read()
    if pairs and pairs[0][1] in s:
        print("  skip (already applied) " + path); return
    for a, b in pairs:
        if a not in s: sys.exit("FAILED in %s -> %s" % (path, a[:70]))
        s = s.replace(a, b, 1)
    io.open(path, "w", encoding="utf-8").write(s)
    print("  patched " + path)

ed("src/admob.ts", [
 ('const BASE = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").replace(/\\/$/, "");\nconst CLIENT = import.meta.env.VITE_CLIENT_ID || "jedyapps";',
  'import { BASE, CLIENT, apiFetch } from "./session";'),
 ('const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify({ reportSpec }) });',
  'const resp = await apiFetch(url, { method: "POST", headers, body: JSON.stringify({ reportSpec }) });'),
 ('const resp = await fetch(url);', 'const resp = await apiFetch(url);'),
 ('const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify({ reportSpec: spec }) });',
  'const resp = await apiFetch(url, { method: "POST", headers, body: JSON.stringify({ reportSpec: spec }) });'),
])

ed("src/clickup.ts", [
 ('const base = () => (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").replace(/\\/$/, "");',
  'import { BASE, apiFetch } from "./session";\nconst base = () => BASE;'),
 ('const r = await fetch(b + "/clickup/api/v2" + path, opts);',
  'const r = await apiFetch(b + "/clickup/api/v2" + path, opts);'),
])

ed("src/timeseriesSource.ts", [
 ('const BASE = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").replace(/\\/$/, "");\nconst CLIENT = import.meta.env.VITE_CLIENT_ID || "jedyapps";',
  'import { BASE, CLIENT, apiFetch, setMeta } from "./session";'),
 ('    inflight = fetch(tsUrl())\n      .then((r) => { if (!r.ok) throw new Error("timeseries.json " + r.status); return r.json(); })',
  '    inflight = apiFetch(tsUrl())\n      .then((r) => { if (!r.ok) throw new Error("timeseries.json " + r.status); return r.json(); })\n'
  '      // The feed carries the client\'s own display name, so the header can be\n'
  '      // right even if /session was skipped.\n'
  '      .then((j) => { if (j && j.displayName) setMeta({ displayName: j.displayName }); return j; })'),
])

ed("src/XgrowthOps.tsx", [
 ('const CLIENT_NAME = (import.meta.env.VITE_CLIENT_NAME || "Client");', 'import { clientName } from "./session";'),
 ('xGrowth × {CLIENT_NAME}', 'xGrowth × {clientName()}'),
])

ed("src/reports/ReportsDashboard.tsx", [
 ('const BASE = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").replace(/\\/$/, "");\nconst CLIENT = import.meta.env.VITE_CLIENT_ID || "jedyapps";\nconst NAME = import.meta.env.VITE_CLIENT_NAME || "Client";',
  'import { BASE, CLIENT, apiFetch, clientName } from "../session";'),
 ('window.CLIENT_CONFIG = { key: CLIENT, name: NAME };',
  'window.CLIENT_CONFIG = { key: CLIENT, name: clientName() };\n'
  '    // reportsApp.js is injected as raw source and calls fetch() directly, so\n'
  '    // it needs the same identity header as the rest of the app.\n'
  '    window.__RPT_FETCH = (u, o) => apiFetch(u, o);'),
 ('"fetch(window.__RPT_TS)"', '"window.__RPT_FETCH(window.__RPT_TS)"'),
 ('"fetch(window.__RPT_DAY(date))"', '"window.__RPT_FETCH(window.__RPT_DAY(date))"'),
 ('"fetch(window.__RPT_MANIFEST)"', '"window.__RPT_FETCH(window.__RPT_MANIFEST)"'),
])

ed("src/main.tsx", [
 ('import BrandedLoader, { dismissBootSplash } from "./BrandedLoader";\n\nconst NAME = import.meta.env.VITE_CLIENT_NAME || "Your Dashboard";\nconst ACCOUNT = import.meta.env.VITE_CLIENT_ADMOB_ACCOUNT || "";\nconst FOLDER = import.meta.env.VITE_CLIENT_CLICKUP_FOLDER || "";\nconst DEV_TOKEN = import.meta.env.VITE_DEV_ACCESS_TOKEN || "";\nconst PROXY = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").trim();',
  'import BrandedLoader, { dismissBootSplash } from "./BrandedLoader";\nimport { BASE, CLIENT, apiFetch, setMeta, clientName } from "./session";\n\nconst DEV_TOKEN = import.meta.env.VITE_DEV_ACCESS_TOKEN || "";\nconst PROXY = BASE;'),
 ('function Login({ onSignIn }) {', 'function Login({ mountButton, error }) {'),
 ('<b>{NAME}</b>', '<b>{clientName()}</b>'),
 ('        <p style={{ margin: "0 0 20px", color: "var(--xg-sub)", fontSize: 13.5 }}>Sign in with the Google account that owns your AdMob.</p>\n        <button onClick={onSignIn} style={{ width: "100%", padding: 11, borderRadius: 8, border: "none", background: "var(--xg-accent)", color: "var(--xg-inverse)", fontWeight: 740, cursor: "pointer" }}>Continue with Google</button>',
  '        <p style={{ margin: "0 0 20px", color: "var(--xg-sub)", fontSize: 13.5 }}>\n          {error === "not-authorised"\n            ? "That account isn\'t on the access list for this dashboard. Ask xGrowth to add it, or sign in with a different account."\n            : "Sign in with the Google account xGrowth added for you."}\n        </p>\n        <div ref={mountButton} style={{ display: "flex", justifyContent: "center" }} />'),
 ('  const usingDevToken = !!DEV_TOKEN || !!PROXY;\n  const token = usingDevToken ? DEV_TOKEN : auth.token;\n  const isSignedIn = usingDevToken || auth.isSignedIn;\n  const isLoading = usingDevToken ? false : auth.isLoading;\n  const [ready, setReady] = useState(false);',
  '  const token = DEV_TOKEN;\n  const isSignedIn = auth.isSignedIn;           // always true when the gate is off\n  const isLoading = auth.isLoading;\n  const [ready, setReady] = useState(false);\n  const [authError, setAuthError] = useState(null);'),
 ('    if (!isSignedIn) return;\n    if (!PROXY && !token) return; // token only required when calling AdMob directly\n    let live = true;\n    const source = PROXY && !DEV_TOKEN ? buildCachedSource(ACCOUNT, FOLDER) : buildLiveSource(ACCOUNT, FOLDER, token);\n    source.then((src) => { if (live) { setDataSource(src); setReady(true); } })',
  '    if (!isSignedIn) return;\n    let live = true;\n    // Ask the server who this client is before fetching anything for them.\n    // Nothing about the client is baked into this build.\n    const session = PROXY\n      ? apiFetch(PROXY + "/session?clientId=" + encodeURIComponent(CLIENT))\n          .then((r) => r.json())\n          .then((j) => { setMeta(j && j.client); return j && j.client ? j.client : {}; })\n      : Promise.resolve({});\n    const source = session.then((c) =>\n      PROXY && !DEV_TOKEN\n        ? buildCachedSource(c.admobAccount || "", c.clickupFolder || "")\n        : buildLiveSource(c.admobAccount || "", c.clickupFolder || "", token));\n    source.then((src) => { if (live) { setDataSource(src); setReady(true); } })'),
 ('      .catch((e) => {\n        if (!live) return;',
  '      .catch((e) => {\n        if (!live) return;\n        if (e && (e.status === 401 || e.status === 403)) {\n          // Not signed in, or signed in as someone this client has not listed.\n          setAuthError(e.status === 403 ? "not-authorised" : "signed-out");\n          auth.signOut();\n          return;\n        }'),
 ('  if (!isSignedIn) return <Login onSignIn={auth.signIn} />;',
  '  if (!isSignedIn || authError) return <Login mountButton={auth.mountButton} error={authError} />;'),
])

ed("functions/index.js", [
 ('const crypto = require("node:crypto");',
  'const crypto = require("node:crypto");\nconst { verifyIdToken, clientEntry, mayAccess, publicEntry } = require("./auth");'),
 ('const PUSH_SECRET = defineSecret("XG_PUSH_SECRET"); // shared secret Apps Script uses to push',
  'const PUSH_SECRET = defineSecret("XG_PUSH_SECRET"); // shared secret Apps Script uses to push\n'
  '// Client registry. JSON keyed by clientId:\n'
  '//   {"jedyapps":{"displayName":"JedyApps","admobAccount":"accounts/pub-...",\n'
  '//                "clickupFolder":"901210858217","emails":["ceo@jedyapps.com"]}}\n'
  'const CLIENTS = defineSecret("XG_CLIENTS");\n'
  '// "off" (default) leaves every read route open, exactly as before; "enforce"\n'
  '// requires a verified Google identity on the client\'s allowlist. Deploy with\n'
  '// off, add the registry, confirm sign-in works, then flip it.\n'
  'const AUTH_MODE = () => (process.env.XG_AUTH_MODE || "off").toLowerCase();\n'
  'const STAFF_DOMAINS = (process.env.XG_STAFF_DOMAINS || "thexgrowth.com").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);'),
 ('function pushKey(req) {',
  '// Resolves the caller and authorises them for this client. Returns the\n'
  '// registry entry on success; on failure it has already written the response.\n'
  'async function gate(req, res, clientId) {\n'
  '  const entry = clientEntry(CLIENTS.value(), clientId);\n'
  '  if (AUTH_MODE() !== "enforce") return entry || {};      // open mode\n'
  '  if (!entry) { fail(res, 404, "unknown client"); return null; }\n'
  '  const raw = String(req.get("Authorization") || "");\n'
  '  const jwt = raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";\n'
  '  if (!jwt) { fail(res, 401, "sign-in required"); return null; }\n'
  '  const who = await verifyIdToken(jwt, GOOGLE_CLIENT_ID.value());\n'
  '  if (!who) { fail(res, 401, "sign-in required"); return null; }\n'
  '  if (!mayAccess(entry, who.email, STAFF_DOMAINS)) { fail(res, 403, "not authorised for this client"); return null; }\n'
  '  req.xgEmail = who.email;\n'
  '  return entry;\n'
  '}\n\n'
  'function pushKey(req) {'),
 ('{ secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CLICKUP_TOKEN, REFRESH_TOKENS, PUSH_SECRET], region: "us-central1"',
  '{ secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CLICKUP_TOKEN, REFRESH_TOKENS, PUSH_SECRET, CLIENTS], region: "us-central1"'),
 ('        noStore(res);\n        res.json({ ok: true });\n        return;\n      }\n',
  '        noStore(res);\n        res.json({ ok: true, authMode: AUTH_MODE() });\n        return;\n      }\n\n'
  '      // Who am I, and what is this client called? The browser resolves its\n'
  '      // clientId from the hostname and asks here for the rest, which is why\n'
  '      // no client detail has to be baked into the build any more.\n'
  '      if (path === "/session") {\n'
  '        if (!isRead) { fail(res, 405, "GET only"); return; }\n'
  '        const clientId = readClientId(req, res); if (!clientId) return;\n'
  '        const entry = await gate(req, res, clientId); if (!entry) return;\n'
  '        noStore(res);\n'
  '        res.json({ ok: true, email: req.xgEmail || null, authMode: AUTH_MODE(), client: publicEntry(clientId, entry) });\n'
  '        return;\n'
  '      }\n'),
 ('        if (!isAllowedAdmobProxy(path, req.method)) { fail(res, 405, "AdMob proxy route not allowed"); return; }\n        const clientId = readClientId(req, res); if (!clientId) return;',
  '        if (!isAllowedAdmobProxy(path, req.method)) { fail(res, 405, "AdMob proxy route not allowed"); return; }\n        const clientId = readClientId(req, res); if (!clientId) return;\n        if (!(await gate(req, res, clientId))) return;'),
 ('        const writeError = validateClickUpWrite(req);\n        if (writeError) { fail(res, 400, writeError); return; }',
  '        const writeError = validateClickUpWrite(req);\n        if (writeError) { fail(res, 400, writeError); return; }\n        {\n          const clientId = readClientId(req, res); if (!clientId) return;\n          if (!(await gate(req, res, clientId))) return;\n        }'),
 ('      if (path === "/timeseries") {\n        if (!isRead) { fail(res, 405, "GET only"); return; }\n        const clientId = readClientId(req, res); if (!clientId) return;',
  '      if (path === "/timeseries") {\n        if (!isRead) { fail(res, 405, "GET only"); return; }\n        const clientId = readClientId(req, res); if (!clientId) return;\n        if (!(await gate(req, res, clientId))) return;'),
])
print("done")
