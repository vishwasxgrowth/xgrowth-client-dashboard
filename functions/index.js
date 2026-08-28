/* Xgrowth client dashboard backend (Option B).
   - /admob/*  : proxies AdMob using a per-client access token minted from a stored refresh token
   - /clickup/*: proxies ClickUp with the xGrowth ClickUp token (server-side)
   The browser never sees a Google token. Secrets live in Secret Manager.       */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { Storage } = require("@google-cloud/storage");

const GOOGLE_CLIENT_ID = defineSecret("XG_GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("XG_GOOGLE_CLIENT_SECRET");
const CLICKUP_TOKEN = defineSecret("XG_CLICKUP_TOKEN");
const REFRESH_TOKENS = defineSecret("XG_REFRESH_TOKENS"); // JSON: {"jedyapps":"1//0...", ...}
const PUSH_SECRET = defineSecret("XG_PUSH_SECRET"); // shared secret Apps Script uses to push
const BUCKET = "dolphin-fdffc-xg-timeseries";
const storage = new Storage();


// Origins allowed to call the API (add the deployed dashboard domain later).
const ALLOWED = new Set(["http://localhost:3000", "http://localhost:5173"]);

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
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Client-Id");
}
function restQuery(originalUrl) {
  const qs = (originalUrl.split("?")[1] || "");
  const params = new URLSearchParams(qs);
  params.delete("clientId");
  const s = params.toString();
  return s ? "?" + s : "";
}

exports.xgClientApi = onRequest(
  { secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CLICKUP_TOKEN, REFRESH_TOKENS, PUSH_SECRET], region: "us-central1", memory: "512MiB", timeoutSeconds: 120 },
  async (req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    try {
      const path = req.path;
      if (path === "/health" || path === "/") { res.json({ ok: true }); return; }
      const clientId = String(req.query.clientId || req.get("X-Client-Id") || "");

      if (path.startsWith("/admob/")) {
        if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
        const token = await accessTokenFor(clientId);
        const target = "https://admob.googleapis.com" + path.replace(/^\/admob/, "") + restQuery(req.originalUrl);
        const r = await fetch(target, {
          method: req.method,
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: req.method === "GET" || req.method === "HEAD" ? undefined : JSON.stringify(req.body || {}),
        });
        const text = await r.text();
        res.status(r.status).set("Content-Type", r.headers.get("content-type") || "application/json").send(text);
        return;
      }

      if (path.startsWith("/clickup/")) {
        const target = "https://api.clickup.com" + path.replace(/^\/clickup/, "") + restQuery(req.originalUrl);
        const r = await fetch(target, {
          method: req.method,
          headers: { Authorization: CLICKUP_TOKEN.value(), "Content-Type": "application/json" },
          body: req.method === "GET" || req.method === "HEAD" ? undefined : JSON.stringify(req.body || {}),
        });
        const text = await r.text();
        res.status(r.status).set("Content-Type", r.headers.get("content-type") || "application/json").send(text);
        return;
      }


      // ---- Timeseries from the client's Apps Script web app (private sheet) ----
      // ---- Timeseries PUSH from Apps Script (domain-safe: script pushes to us) ----
      if (path === "/timeseries-push") {
        if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
        if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
        const key = String(req.query.key || req.get("X-Push-Key") || "");
        if (!PUSH_SECRET.value() || key !== PUSH_SECRET.value()) { res.status(401).json({ error: "bad key" }); return; }
        const bodyText = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
        if (!bodyText || bodyText.length < 20) { res.status(400).json({ error: "empty body" }); return; }
        await storage.bucket(BUCKET).file(clientId + ".json").save(bodyText, { contentType: "application/json", resumable: false });
        delete tsCache[clientId];
        res.json({ ok: true, bytes: bodyText.length });
        return;
      }
      // ---- Raw CSV push (AppDaily / Users) for the daily-report engine ----
      if (path === "/csv-push") {
        if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
        if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
        const key = String(req.query.key || req.get("X-Push-Key") || "");
        if (!PUSH_SECRET.value() || key !== PUSH_SECRET.value()) { res.status(401).json({ error: "bad key" }); return; }
        const name = String(req.query.name || "").replace(/[^A-Za-z0-9_-]/g, ""); // AppDaily | Users
        if (!name) { res.status(400).json({ error: "name required" }); return; }
        const bodyText = typeof req.body === "string" ? req.body : String(req.body || "");
        if (!bodyText || bodyText.length < 10) { res.status(400).json({ error: "empty body" }); return; }
        await storage.bucket(BUCKET).file(clientId + "/" + name + ".csv").save(bodyText, { contentType: "text/csv", resumable: false });
        // A fresh feed invalidates any cached rendered pages for this client.
        try {
          const [files] = await storage.bucket(BUCKET).getFiles({ prefix: clientId + "/reports/" });
          await Promise.all(files.map((f) => f.delete().catch(() => {})));
        } catch (e) {}
        res.json({ ok: true, name, bytes: bodyText.length });
        return;
      }
      // ---- Serve the last pushed timeseries ----
      if (path.startsWith("/timeseries")) {
        if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
        const now = Date.now();
        if (tsCache[clientId] && tsCache[clientId].exp > now) { res.set("Content-Type", "application/json").send(tsCache[clientId].body); return; }
        try {
          const [buf] = await storage.bucket(BUCKET).file(clientId + ".json").download();
          const body = buf.toString("utf8");
          tsCache[clientId] = { body, exp: now + 30 * 60 * 1000 };
          res.set("Content-Type", "application/json").send(body);
        } catch (e) {
          res.status(404).json({ error: "no timeseries pushed yet for " + clientId });
        }
        return;
      }

      // ---- Daily report: list of available dates (manifest) ----
      // The manifest is just the timeseries' own date axis — no separate file to
      // maintain. Newest first, so the UI's date picker defaults to the latest.
      if (path === "/report-manifest") {
        if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
        try {
          const [buf] = await storage.bucket(BUCKET).file(clientId + ".json").download();
          const ts = JSON.parse(buf.toString("utf8"));
          const dates = Array.isArray(ts.dates) ? ts.dates.slice().sort().reverse() : [];
          res.set("Content-Type", "application/json").json({ client: clientId, dates });
        } catch (e) {
          res.status(404).json({ error: "no data pushed yet for " + clientId });
        }
        return;
      }

      // ---- Daily report: render one day's digest HTML on demand ----
      // Runs the canonical engines (vendored under functions/engine) on the
      // AppDaily.csv the Apps Script pushes alongside the timeseries. Rendered
      // pages are cached in the bucket under reports/<date>.html so a repeat
      // view is a bucket read, not a re-render.
      if (path === "/report-day") {
        if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
        const date = String(req.query.date || "").replace(/-/g, ""); // accept YYYY-MM-DD or YYYYMMDD
        if (!/^\d{8}$/.test(date)) { res.status(400).json({ error: "date=YYYY-MM-DD required" }); return; }

        const cacheKey = clientId + "/reports/" + date + ".html";
        // 1) Serve a previously rendered page if present.
        try {
          const [cached] = await storage.bucket(BUCKET).file(cacheKey).download();
          res.set("Content-Type", "text/html; charset=utf-8").send(cached.toString("utf8"));
          return;
        } catch (e) { /* not cached yet — render below */ }

        // 2) Need the raw AppDaily rows the Apps Script pushed.
        let appDailyCsv;
        try {
          const [buf] = await storage.bucket(BUCKET).file(clientId + "/AppDaily.csv").download();
          appDailyCsv = buf.toString("utf8");
        } catch (e) {
          res.status(404).json({ error: "no AppDaily.csv pushed for " + clientId + " — run pushTimeseries once after updating the Apps Script" });
          return;
        }
        // Users.csv is optional (adds ARPDAU/ARPDAV); ignore if absent.
        let usersCsv = null;
        try { const [u] = await storage.bucket(BUCKET).file(clientId + "/Users.csv").download(); usersCsv = u.toString("utf8"); } catch (e) {}

        try {
          const html = await renderDailyReport(clientId, date, appDailyCsv, usersCsv);
          // Cache for next time (best-effort; a failure here must not fail the response).
          try { await storage.bucket(BUCKET).file(cacheKey).save(html, { contentType: "text/html", resumable: false }); } catch (e) {}
          res.set("Content-Type", "text/html; charset=utf-8").send(html);
        } catch (e) {
          res.status(500).json({ error: "render failed: " + String((e && e.message) || e) });
        }
        return;
      }

      res.status(404).json({ error: "not found" });
    } catch (e) {
      res.status(500).json({ error: String((e && e.message) || e) });
    }
  }
);

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

async function renderDailyReport(clientId, date, appDailyCsv, usersCsv) {
  const ENGINE = path.join(__dirname, "engine");
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "rpt-"));
  try {
    const appDailyPath = path.join(work, "AppDaily.csv");
    await fs.writeFile(appDailyPath, appDailyCsv, "utf8");
    const args = ["--appdaily", appDailyPath, "--client", clientId, "--date", date, "--out", work];
    if (usersCsv) { const up = path.join(work, "Users.csv"); await fs.writeFile(up, usersCsv, "utf8"); args.push("--users", up); }

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
