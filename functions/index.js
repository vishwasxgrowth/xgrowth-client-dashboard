/* Xgrowth client dashboard backend (Option B).
   - /admob/*  : proxies AdMob using a per-client access token minted from a stored refresh token
   - /clickup/*: proxies ClickUp with the xGrowth ClickUp token (server-side)
   The browser never sees a Google token. Secrets live in Secret Manager.       */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");
const CLICKUP_TOKEN = defineSecret("CLICKUP_TOKEN");
const REFRESH_TOKENS = defineSecret("REFRESH_TOKENS"); // JSON: {"jedyapps":"1//0...", ...}

// Origins allowed to call the API (add the deployed dashboard domain later).
const ALLOWED = new Set(["http://localhost:3000", "http://localhost:5173"]);

const tokenCache = {}; // clientId -> { token, exp }

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
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Client-Id");
}
function restQuery(originalUrl) {
  const qs = (originalUrl.split("?")[1] || "");
  const params = new URLSearchParams(qs);
  params.delete("clientId");
  const s = params.toString();
  return s ? "?" + s : "";
}

exports.api = onRequest(
  { secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CLICKUP_TOKEN, REFRESH_TOKENS], region: "us-central1" },
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

      res.status(404).json({ error: "not found" });
    } catch (e) {
      res.status(500).json({ error: String((e && e.message) || e) });
    }
  }
);
