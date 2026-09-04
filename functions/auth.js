/* Identity gate for the client dashboards.

   Verifies a Google ID token and checks the caller's email against the client
   registry. Deliberately dependency-free: verifying through Google's tokeninfo
   endpoint avoids adding google-auth-library to a function that gets deployed
   by hand from Cloud Shell. Results are cached per token until it expires, so
   a page load costs one verification, not one per API call.                  */
const crypto = require("node:crypto");

const seen = new Map(); // sha256(token) -> { email, exp }

async function verifyIdToken(jwt, audience) {
  if (!jwt || jwt.length > 4096) return null;
  const key = crypto.createHash("sha256").update(jwt).digest("hex");
  const now = Date.now() / 1000;
  const hit = seen.get(key);
  if (hit && hit.exp > now + 30) return hit;
  let p;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(jwt));
    if (!r.ok) return null;
    p = await r.json();
  } catch (e) { return null; }
  if (!p || !p.email) return null;
  if (String(p.email_verified) !== "true") return null;
  if (audience && p.aud !== audience) return null;   // token minted for another app
  const exp = Number(p.exp || 0);
  if (!exp || exp < now) return null;
  const out = { email: String(p.email).toLowerCase(), exp };
  if (seen.size > 500) seen.clear();
  seen.set(key, out);
  return out;
}

function registry(raw) {
  try { return JSON.parse(raw || "{}"); } catch (e) { return {}; }
}

function clientEntry(raw, clientId) {
  const r = registry(raw);
  return Object.prototype.hasOwnProperty.call(r, clientId) ? r[clientId] : null;
}

// Staff domains see every client; a client's own people see only theirs.
function mayAccess(entry, email, staffDomains) {
  if (!entry) return false;
  const e = String(email || "").toLowerCase();
  if (!e.includes("@")) return false;
  if ((staffDomains || []).includes(e.split("@")[1])) return true;
  return (entry.emails || []).map((x) => String(x).toLowerCase().trim()).includes(e);
}

// What the browser is allowed to know about its own client.
function publicEntry(id, entry) {
  return {
    id,
    displayName: (entry && entry.displayName) || id,
    admobAccount: (entry && entry.admobAccount) || "",
    clickupFolder: (entry && entry.clickupFolder) || "",
  };
}

module.exports = { verifyIdToken, registry, clientEntry, mayAccess, publicEntry };
