#!/usr/bin/env python3
"""Two one-line edits. src/session.ts and src/main.tsx arrive whole in the
tarball; these two files are otherwise untouched so they are patched in place."""
import io, sys
def ed(path, pairs):
    s = io.open(path, encoding="utf-8").read()
    if pairs[0][1] in s: print("  skip (already applied) " + path); return
    for a, b in pairs:
        if a not in s: sys.exit("FAILED in %s -> %s" % (path, a[:70]))
        s = s.replace(a, b, 1)
    io.open(path, "w", encoding="utf-8").write(s); print("  patched " + path)

ed("src/XgrowthOps.tsx", [
 ('import { clientName } from "./session";', 'import { clientName, clearClient } from "./session";'),
 ('{!collapsed && <div style={{ lineHeight: 1.15, whiteSpace: "nowrap" }}><div className="xg-display" style={{ fontSize: 16, fontWeight: 760, whiteSpace: "nowrap" }}>xGrowth × {clientName()}</div>',
  '{!collapsed && <div onClick={clearClient} title="Switch client" style={{ lineHeight: 1.15, whiteSpace: "nowrap", cursor: "pointer" }}><div className="xg-display" style={{ fontSize: 16, fontWeight: 760, whiteSpace: "nowrap" }}>xGrowth × {clientName()}</div>'),
])

ed("functions/index.js", [
 ('const { verifyIdToken, clientEntry, mayAccess, publicEntry } = require("./auth");',
  'const { verifyIdToken, registry, clientEntry, mayAccess, publicEntry } = require("./auth");'),
 ('      // Who am I, and what is this client called?',
  '''      // Every client this caller may open. The dashboard shows these as a
      // picker when the hostname does not already name a client.
      if (path === "/clients") {
        if (!isRead) { fail(res, 405, "GET only"); return; }
        const reg = registry(CLIENTS.value());
        const ids = Object.keys(reg).sort();
        let email = null;
        if (AUTH_MODE() === "enforce") {
          const raw = String(req.get("Authorization") || "");
          const jwt = raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
          const who = jwt ? await verifyIdToken(jwt, GOOGLE_CLIENT_ID.value()) : null;
          if (!who) { fail(res, 401, "sign-in required"); return; }
          email = who.email;
        }
        const visible = ids
          .filter((id) => AUTH_MODE() !== "enforce" || mayAccess(reg[id], email, STAFF_DOMAINS))
          .map((id) => ({ id, displayName: (reg[id] && reg[id].displayName) || id }));
        noStore(res);
        res.json({ ok: true, email, authMode: AUTH_MODE(), clients: visible });
        return;
      }

      // Who am I, and what is this client called?'''),
])
print("done")
