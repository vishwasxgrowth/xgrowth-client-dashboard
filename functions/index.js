/* Xgrowth client dashboard backend (Option B).
   - /admob/*  : proxies AdMob using a per-client access token minted from a stored refresh token
   - /clickup/*: proxies ClickUp with the xGrowth ClickUp token (server-side)
   The browser never sees a Google token. Secrets live in Secret Manager.       */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { Storage } = require("@google-cloud/storage");
const crypto = require("node:crypto");

const GOOGLE_CLIENT_ID = defineSecret("XG_GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("XG_GOOGLE_CLIENT_SECRET");
const CLICKUP_TOKEN = defineSecret("XG_CLICKUP_TOKEN");
const REFRESH_TOKENS = defineSecret("XG_REFRESH_TOKENS"); // JSON: {"jedyapps":"1//0...", ...}
const PUSH_SECRET = defineSecret("XG_PUSH_SECRET"); // shared secret Apps Script uses to push
const BUCKET = "dolphin-fdffc-xg-timeseries";
const storage = new Storage();


// Origins allowed to call the API (add the deployed dashboard domain later).
const ALLOWED = new Set(["http://localhost:3000", "http://localhost:5173"]);
(process.env.XG_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((origin) => ALLOWED.add(origin));
const CLIENT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const CSV_NAMES = new Set(["AppDaily", "Users", "Country", "Source", "Format", "Privacy"]);
const CSV_REQUIRED = {
  AppDaily: ["DATE", "APP", "ESTIMATED_EARNINGS"],
  Users: ["DATE", "APP", "DAU", "DAV"],
  Country: ["DATE", "APP", "COUNTRY", "ESTIMATED_EARNINGS"],
  Source: ["DATE", "APP", "AD_SOURCE", "ESTIMATED_EARNINGS"],
  Format: ["DATE", "APP", "FORMAT", "ESTIMATED_EARNINGS"],
  Privacy: ["DATE", "APP", "SERVING_RESTRICTION", "ESTIMATED_EARNINGS"],
};
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_CSV_BYTES = 20 * 1024 * 1024;
const CACHE = {
  none: "no-store",
  short: "public, max-age=300, stale-while-revalidate=1800",
  report: "public, max-age=900, stale-while-revalidate=3600",
  icon: "public, max-age=86400, stale-while-revalidate=604800",
};

const tokenCache = {}; // clientId -> { token, exp }
const tsCache = {};   // reports timeseries cache

async function accessTokenFor(clientId) {
  const now = Date.now();
  const hit = tokenCache[clientId];
  if (hit && hit.exp > now + 60000) return hit.token;
  const map = JSON.parse(REFRESH_TOKENS.value() || "{}");
  const refresh = map[clientId];
  if (!refresh) throw new Error("No refresh token configured for client '" + clientId + "'");
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID.value(),
    client_secret: GOOGLE_CLIENT_SECRET.value(),
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  if (!r.ok) throw new Error("Google token refresh failed (" + r.status + "): " + (await r.text()));
  const j = await r.json();
  tokenCache[clientId] = { token: j.access_token, exp: now + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED.has(origin)) res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Client-Id, X-Push-Key");
}
function restQuery(originalUrl, allowedKeys = []) {
  const qs = (originalUrl.split("?")[1] || "");
  const params = new URLSearchParams(qs);
  const allowed = new Set(allowedKeys);
  for (const key of [...params.keys()]) {
    if (key === "clientId" || key === "key") params.delete(key);
    else if (!allowed.has(key)) params.delete(key);
  }
  const s = params.toString();
  return s ? "?" + s : "";
}
function noStore(res) { res.set("Cache-Control", CACHE.none); }
function cache(res, policy) { res.set("Cache-Control", policy); }
function fail(res, status, error) {
  noStore(res);
  res.status(status).json({ error });
  return false;
}
function readClientId(req, res) {
  const clientId = String(req.query.clientId || req.get("X-Client-Id") || "").trim();
  if (!clientId) { fail(res, 400, "clientId required"); return null; }
  if (!CLIENT_RE.test(clientId)) { fail(res, 400, "invalid clientId"); return null; }
  return clientId;
}
function readBodyText(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString("utf8");
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  return JSON.stringify(req.body || {});
}
function payloadBytes(text) { return Buffer.byteLength(String(text || ""), "utf8"); }
function pushKey(req) { return String(req.get("X-Push-Key") || req.query.key || ""); }
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function hasValidPushKey(req) {
  const secret = PUSH_SECRET.value();
  return !!secret && safeEqual(pushKey(req), secret);
}
function validateTimeseriesPayload(text, clientId) {
  let json;
  try { json = JSON.parse(text); } catch (e) { return "invalid JSON"; }
  if (json.schemaVersion !== 1) return "unsupported schemaVersion";
  if (json.client !== clientId) return "payload client does not match clientId";
  if (!Array.isArray(json.dates) || !json.dates.length) return "dates array required";
  if (json.dates.length > 2500) return "too many dates";
  if (json.dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(String(d)))) return "dates must be YYYY-MM-DD";
  if (!json.portfolio || typeof json.portfolio !== "object") return "portfolio object required";
  if (!json.apps || typeof json.apps !== "object") return "apps object required";
  if (Object.keys(json.apps).length > 1000) return "too many apps";
  return null;
}
function csvHeader(text) {
  const first = String(text || "").split(/\r?\n/, 1)[0] || "";
  return csvCells(first).map((h) => h.trim().replace(/^"|"$/g, "").toUpperCase());
}
function csvCells(line) {
  const cells = [];
  let cur = "";
  let quoted = false;
  const s = String(line || "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && quoted && s[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}
function validateCsvPayload(name, text) {
  if (!CSV_NAMES.has(name)) return "unsupported csv name";
  const header = csvHeader(text);
  const required = CSV_REQUIRED[name] || [];
  const missing = required.filter((h) => !header.includes(h));
  return missing.length ? "missing columns: " + missing.join(", ") : null;
}
function isAllowedAdmobProxy(path, method) {
  return method === "POST" && /^\/admob\/v1alpha\/accounts\/pub-\d+\/mediationReport:generate$/.test(path);
}
function clickUpQueryKeys(path) {
  const targetPath = path.replace(/^\/clickup/, "");
  if (/^\/api\/v2\/list\/[A-Za-z0-9_-]+\/task$/.test(targetPath)) return ["include_closed", "subtasks", "page"];
  if (/^\/api\/v2\/task\/[A-Za-z0-9_-]+$/.test(targetPath)) return ["include_subtasks"];
  return [];
}
function isAllowedClickUpProxy(path, method) {
  const targetPath = path.replace(/^\/clickup/, "");
  if (method === "GET") {
    return /^\/api\/v2\/folder\/[A-Za-z0-9_-]+$/.test(targetPath) ||
      /^\/api\/v2\/list\/[A-Za-z0-9_-]+\/task$/.test(targetPath) ||
      /^\/api\/v2\/task\/[A-Za-z0-9_-]+$/.test(targetPath) ||
      /^\/api\/v2\/task\/[A-Za-z0-9_-]+\/comment$/.test(targetPath) ||
      targetPath === "/api/v2/team";
  }
  return method === "PUT" && /^\/api\/v2\/task\/[A-Za-z0-9_-]+$/.test(targetPath);
}
function validateClickUpWrite(req) {
  if (req.method !== "PUT") return null;
  const body = req.body || {};
  if (!body || typeof body.status !== "string" || Object.keys(body).some((k) => k !== "status")) return "only task status updates are allowed";
  if (!body.status.trim() || body.status.length > 80) return "invalid status";
  return null;
}
function validAccountName(account) {
  return /^accounts\/pub-\d+$/.test(String(account || ""));
}
function normalizeCsvDate(v) {
  const s = String(v || "").trim().replace(/-/g, "");
  return /^\d{8}$/.test(s) ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : null;
}
function datesFromCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = csvHeader(lines[0]);
  const dateIdx = header.indexOf("DATE");
  if (dateIdx < 0) return [];
  const dates = new Set();
  for (const line of lines.slice(1)) {
    const date = normalizeCsvDate(csvCells(line)[dateIdx]);
    if (date) dates.add(date);
  }
  return [...dates].sort().reverse();
}
async function loadCsv(clientId, name) {
  const [buf] = await storage.bucket(BUCKET).file(clientId + "/" + name + ".csv").download();
  return buf.toString("utf8");
}

exports.xgClientApi = onRequest(
  { secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CLICKUP_TOKEN, REFRESH_TOKENS, PUSH_SECRET], region: "us-central1", memory: "512MiB", timeoutSeconds: 120 },
  async (req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") { noStore(res); res.status(204).end(); return; }
    try {
      const path = req.path;
      const isRead = req.method === "GET" || req.method === "HEAD";
      if (path === "/health" || path === "/") {
        if (!isRead) { fail(res, 405, "GET only"); return; }
        noStore(res);
        res.json({ ok: true });
        return;
      }

      if (path.startsWith("/admob/")) {
        if (!isAllowedAdmobProxy(path, req.method)) { fail(res, 405, "AdMob proxy route not allowed"); return; }
        const clientId = readClientId(req, res); if (!clientId) return;
        const bodyText = readBodyText(req);
        if (payloadBytes(bodyText) > MAX_JSON_BYTES) { fail(res, 413, "payload too large"); return; }
        const token = await accessTokenFor(clientId);
        const target = "https://admob.googleapis.com" + path.replace(/^\/admob/, "") + restQuery(req.originalUrl);
        const r = await fetch(target, {
          method: req.method,
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: bodyText,
        });
        const text = await r.text();
        noStore(res);
        res.status(r.status).set("Content-Type", r.headers.get("content-type") || "application/json").send(text);
        return;
      }

      if (path.startsWith("/clickup/")) {
        if (!isAllowedClickUpProxy(path, req.method)) { fail(res, 405, "ClickUp proxy route not allowed"); return; }
        const writeError = validateClickUpWrite(req);
        if (writeError) { fail(res, 400, writeError); return; }
        const bodyText = req.method === "GET" || req.method === "HEAD" ? "" : readBodyText(req);
        if (payloadBytes(bodyText) > 4096) { fail(res, 413, "payload too large"); return; }
        const target = "https://api.clickup.com" + path.replace(/^\/clickup/, "") + restQuery(req.originalUrl, clickUpQueryKeys(path));
        const r = await fetch(target, {
          method: req.method,
          headers: { Authorization: CLICKUP_TOKEN.value(), "Content-Type": "application/json" },
          body: bodyText || undefined,
        });
        const text = await r.text();
        noStore(res);
        res.status(r.status).set("Content-Type", r.headers.get("content-type") || "application/json").send(text);
        return;
      }


      // ---- Timeseries PUSH from Apps Script (domain-safe: script pushes to us) ----
      if (path === "/timeseries-push") {
        if (req.method !== "POST") { fail(res, 405, "POST only"); return; }
        const clientId = readClientId(req, res); if (!clientId) return;
        if (!hasValidPushKey(req)) { fail(res, 401, "bad key"); return; }
        const bodyText = readBodyText(req);
        const bytes = payloadBytes(bodyText);
        if (!bodyText || bytes < 20) { fail(res, 400, "empty body"); return; }
        if (bytes > MAX_JSON_BYTES) { fail(res, 413, "payload too large"); return; }
        const validation = validateTimeseriesPayload(bodyText, clientId);
        if (validation) { fail(res, 400, validation); return; }
        await storage.bucket(BUCKET).file(clientId + ".json").save(bodyText, { contentType: "application/json", resumable: false });
        delete tsCache[clientId];
        noStore(res);
        res.json({ ok: true, bytes });
        return;
      }
      // ---- Raw CSV push for the daily-report engine ----
      if (path === "/csv-push") {
        if (req.method !== "POST") { fail(res, 405, "POST only"); return; }
        const clientId = readClientId(req, res); if (!clientId) return;
        if (!hasValidPushKey(req)) { fail(res, 401, "bad key"); return; }
        const name = String(req.query.name || "").trim();
        if (!name) { fail(res, 400, "name required"); return; }
        if (!CSV_NAMES.has(name)) { fail(res, 400, "unsupported csv name"); return; }
        const bodyText = readBodyText(req);
        const bytes = payloadBytes(bodyText);
        if (!bodyText || bytes < 10) { fail(res, 400, "empty body"); return; }
        if (bytes > MAX_CSV_BYTES) { fail(res, 413, "payload too large"); return; }
        const validation = validateCsvPayload(name, bodyText);
        if (validation) { fail(res, 400, validation); return; }
        await storage.bucket(BUCKET).file(clientId + "/" + name + ".csv").save(bodyText, { contentType: "text/csv", resumable: false });
        // A fresh feed invalidates any cached rendered pages for this client.
        try {
          const [files] = await storage.bucket(BUCKET).getFiles({ prefix: clientId + "/reports/" });
          await Promise.all(files.map((f) => f.delete().catch(() => {})));
        } catch (e) {}
        noStore(res);
        res.json({ ok: true, name, bytes });
        return;
      }
      // ---- Serve the last pushed timeseries ----
      if (path === "/timeseries") {
        if (!isRead) { fail(res, 405, "GET only"); return; }
        const clientId = readClientId(req, res); if (!clientId) return;
        const now = Date.now();
        if (tsCache[clientId] && tsCache[clientId].exp > now) {
          cache(res, CACHE.short);
          res.set("Content-Type", "application/json").send(tsCache[clientId].body);
          return;
        }
        try {
          const [buf] = await storage.bucket(BUCKET).file(clientId + ".json").download();
          const body = buf.toString("utf8");
          tsCache[clientId] = { body, exp: now + 30 * 60 * 1000 };
          cache(res, CACHE.short);
          res.set("Content-Type", "application/json").send(body);
        } catch (e) {
          fail(res, 404, "no timeseries pushed yet for " + clientId);
        }
        return;
      }

      // ---- Daily report: list of available dates (manifest) ----
      // Prefer AppDaily.csv dates because /report-day renders from that raw feed.
      // If the JSON timeseries gets ahead by a day, exposing only renderable dates
      // keeps the Daily tab from defaulting to a known 500.
      if (path === "/report-manifest") {
        if (!isRead) { fail(res, 405, "GET only"); return; }
        const clientId = readClientId(req, res); if (!clientId) return;
        try {
          let dates = [];
          try { dates = datesFromCsv(await loadCsv(clientId, "AppDaily")); } catch (e) {}
          if (!dates.length) {
            const [buf] = await storage.bucket(BUCKET).file(clientId + ".json").download();
            const ts = JSON.parse(buf.toString("utf8"));
            dates = Array.isArray(ts.dates) ? ts.dates.slice().sort().reverse() : [];
          }
          cache(res, CACHE.short);
          res.set("Content-Type", "application/json").json({ client: clientId, dates });
        } catch (e) {
          fail(res, 404, "no data pushed yet for " + clientId);
        }
        return;
      }

      // ---- Daily report: render one day's digest HTML on demand ----
      // Runs the canonical engines (vendored under functions/engine) on the
      // AppDaily.csv the Apps Script pushes alongside the timeseries. Rendered
      // pages are cached in the bucket under reports/<date>.html so a repeat
      // view is a bucket read, not a re-render.
      if (path === "/report-day") {
        if (!isRead) { fail(res, 405, "GET only"); return; }
        const clientId = readClientId(req, res); if (!clientId) return;
        const date = String(req.query.date || "").replace(/-/g, ""); // accept YYYY-MM-DD or YYYYMMDD
        if (!/^\d{8}$/.test(date)) { fail(res, 400, "date=YYYY-MM-DD required"); return; }

        const cacheKey = clientId + "/reports/" + date + ".html";
        // 1) Serve a previously rendered page if present.
        try {
          const [cached] = await storage.bucket(BUCKET).file(cacheKey).download();
          cache(res, CACHE.report);
          res.set("Content-Type", "text/html; charset=utf-8").send(cached.toString("utf8"));
          return;
        } catch (e) { /* not cached yet — render below */ }

        // 2) Need the raw AppDaily rows the Apps Script pushed.
        const inputs = {};
        try {
          inputs.AppDaily = await loadCsv(clientId, "AppDaily");
        } catch (e) {
          fail(res, 404, "no AppDaily.csv pushed for " + clientId + " - run pushTimeseries once after updating the Apps Script");
          return;
        }
        for (const name of ["Users", "Country", "Source", "Format", "Privacy"]) {
          try { inputs[name] = await loadCsv(clientId, name); } catch (e) {}
        }

        try {
          const html = await renderDailyReport(clientId, date, inputs);
          // Cache for next time (best-effort; a failure here must not fail the response).
          try { await storage.bucket(BUCKET).file(cacheKey).save(html, { contentType: "text/html", resumable: false }); } catch (e) {}
          cache(res, CACHE.report);
          res.set("Content-Type", "text/html; charset=utf-8").send(html);
        } catch (e) {
          fail(res, 500, "render failed: " + String((e && e.message) || e));
        }
        return;
      }

      // ---- App icons: AdMob has no icon field, so resolve one indirectly ----
      // via each app's linked store listing (iOS: Apple's public Lookup API;
      // Android: the og:image meta tag off the public Play Store page). Result
      // keyed by AdMob appId (the same id the mediation report's APP dimension
      // uses), cached in the bucket for a week since store icons rarely change.
      if (path === "/app-icons") {
        if (!isRead) { fail(res, 405, "GET only"); return; }
        const clientId = readClientId(req, res); if (!clientId) return;
        const account = String(req.query.account || "");
        if (!validAccountName(account)) { fail(res, 400, "valid account required"); return; }
        const cacheKey = clientId + "/icons.json";
        const now = Date.now();
        try {
          const [buf] = await storage.bucket(BUCKET).file(cacheKey).download();
          const cached = JSON.parse(buf.toString("utf8"));
          if (cached.fetchedAt && now - cached.fetchedAt < 7 * 24 * 3600 * 1000) {
            cache(res, CACHE.icon);
            res.set("Content-Type", "application/json").json(cached.icons);
            return;
          }
        } catch (e) { /* no cache yet (or unreadable) -- fetch fresh below */ }

        try {
          const token = await accessTokenFor(clientId);
          const apps = await listAdmobApps_(account, token);
          const icons = await resolveAppIcons_(apps);
          try { await storage.bucket(BUCKET).file(cacheKey).save(JSON.stringify({ fetchedAt: now, icons }), { contentType: "application/json", resumable: false }); } catch (e) {}
          cache(res, CACHE.icon);
          res.set("Content-Type", "application/json").json(icons);
        } catch (e) {
          fail(res, 500, "icon fetch failed: " + String((e && e.message) || e));
        }
        return;
      }

      fail(res, 404, "not found");
    } catch (e) {
      fail(res, 500, String((e && e.message) || e));
    }
  }
);

// ---- AdMob apps.list + store-listing icon lookup (see /app-icons above) ----
async function listAdmobApps_(account, token) {
  const apps = [];
  let pageToken = "";
  for (let i = 0; i < 20; i++) { // hard cap: a paging bug must not loop forever
    const url = "https://admob.googleapis.com/v1/" + account + "/apps?pageSize=200" +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("AdMob apps.list " + r.status + ": " + (await r.text()));
    const j = await r.json();
    apps.push(...(j.apps || []));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return apps;
}

async function resolveAppIcons_(apps) {
  const icons = {};
  const targets = apps.filter((a) => a.appId && a.linkedAppInfo && a.linkedAppInfo.appStoreId);
  const CONC = 8; // bounded pool: don't fire one outbound fetch per app at once
  let idx = 0;
  async function worker() {
    while (idx < targets.length) {
      const a = targets[idx++];
      const storeId = a.linkedAppInfo.appStoreId;
      try {
        if (a.platform === "IOS") {
          const r = await fetch("https://itunes.apple.com/lookup?id=" + encodeURIComponent(storeId));
          if (r.ok) {
            const j = await r.json();
            const url = j.results && j.results[0] && j.results[0].artworkUrl512;
            if (url) icons[a.appId] = url;
          }
        } else {
          const r = await fetch("https://play.google.com/store/apps/details?id=" + encodeURIComponent(storeId) + "&hl=en", {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; xGrowthDashboard/1.0)" },
          });
          if (r.ok) {
            const html = await r.text();
            const m = html.match(/<meta property="og:image" content="([^"]+)"/);
            if (m) icons[a.appId] = m[1];
          }
        }
      } catch (e) { /* one app's icon failing must not fail the whole batch */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, worker));
  return icons;
}

// ---- Run the vendored canonical engines to produce one day's digest HTML ----
// digest.mjs and render-html.mjs are CLI scripts (byte copies from xgrowth-reports),
// so we drive them exactly as their CLI expects: write inputs to /tmp (the only
// writable dir in Cloud Functions), spawn each with node, read back the page.
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");

function run_(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 90000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { err.message += "\n" + String(stderr || ""); reject(err); return; }
      resolve({ stdout, stderr });
    });
  });
}

async function renderDailyReport(clientId, date, inputs) {
  const ENGINE = path.join(__dirname, "engine");
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "rpt-"));
  try {
    const appDailyPath = path.join(work, "AppDaily.csv");
    await fs.writeFile(appDailyPath, inputs.AppDaily, "utf8");
    const args = ["--appdaily", appDailyPath, "--client", clientId, "--date", date, "--out", work];
    const optional = [
      ["Users", "--users"],
      ["Country", "--country"],
      ["Source", "--source"],
      ["Format", "--format"],
      ["Privacy", "--privacy"],
    ];
    for (const [name, flag] of optional) {
      if (!inputs[name]) continue;
      const p = path.join(work, name + ".csv");
      await fs.writeFile(p, inputs[name], "utf8");
      args.push(flag, p);
    }

    // 1) digest.mjs -> writes digest.json into work
    await run_(process.execPath, [path.join(ENGINE, "digest.mjs"), ...args]);
    // 2) render-html.mjs -> the full L0–L4 page the dashboard iframes
    const pagePath = path.join(work, "page.html");
    await run_(process.execPath, [path.join(ENGINE, "render-html.mjs"),
      "--json", path.join(work, "digest.json"), "--out", pagePath]);
    return await fs.readFile(pagePath, "utf8");
  } finally {
    fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

if (process.env.NODE_ENV === "test") {
  exports._test = {
    CLIENT_RE,
    CSV_NAMES,
    csvCells,
    datesFromCsv,
    clickUpQueryKeys,
    csvHeader,
    isAllowedAdmobProxy,
    isAllowedClickUpProxy,
    restQuery,
    safeEqual,
    validateClickUpWrite,
    validateCsvPayload,
    validateTimeseriesPayload,
    validAccountName,
  };
}
