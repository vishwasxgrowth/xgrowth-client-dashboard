// Run once per client xGrowth email to mint a long-lived refresh token.
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/connect-client.mjs
// A browser opens -> sign in with THAT client's xGrowth email -> allow.
// The refresh token is printed; paste it into the REFRESH_TOKENS secret map.
import http from "http";
import { URL } from "url";
import { exec } from "child_process";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.argv[2];
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.argv[3];
const PORT = 4321;
const REDIRECT = "http://localhost:" + PORT + "/callback";
const SCOPE = "https://www.googleapis.com/auth/admob.readonly https://www.googleapis.com/auth/userinfo.email";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing creds. Usage:\n  GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/connect-client.mjs");
  process.exit(1);
}
const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: "code",
  scope: SCOPE, access_type: "offline", prompt: "consent",
});
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost:" + PORT);
  if (u.pathname !== "/callback") { res.end("waiting..."); return; }
  const code = u.searchParams.get("code");
  if (!code) { res.end("No code."); return; }
  const body = new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: "authorization_code" });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json();
  res.end("Done — you can close this tab. Refresh token printed in your terminal.");
  if (j.refresh_token) {
    console.log("\n==============================================");
    console.log("REFRESH TOKEN (store in REFRESH_TOKENS secret):\n\n" + j.refresh_token);
    console.log("==============================================\n");
  } else {
    console.log("\nNo refresh_token returned. Response:\n", j, "\n(If you've authorized before, revoke the app's access in the Google account and retry — refresh tokens are only issued on first consent.)\n");
  }
  server.close();
});
server.listen(PORT, () => {
  console.log("\n1) Add this redirect URI to your OAuth client:  " + REDIRECT);
  console.log("2) Open this URL and sign in with the client's xGrowth email:\n\n" + authUrl + "\n");
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(opener + ' "' + authUrl + '"');
});
