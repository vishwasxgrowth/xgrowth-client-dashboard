// @ts-nocheck
import { useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./design.css";

import { AuthContext, AuthProvider } from "./auth";
import { setDataSource } from "./activeData";
import * as demo from "./data";
import { buildCachedSource, buildLiveSource } from "./liveSource";
import XgrowthOps from "./XgrowthOps";
import BrandedLoader, { dismissBootSplash } from "./BrandedLoader";

const NAME = import.meta.env.VITE_CLIENT_NAME || "Your Dashboard";
const ACCOUNT = import.meta.env.VITE_CLIENT_ADMOB_ACCOUNT || "";
const FOLDER = import.meta.env.VITE_CLIENT_CLICKUP_FOLDER || "";
const DEV_TOKEN = import.meta.env.VITE_DEV_ACCESS_TOKEN || "";
const PROXY = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").trim();

function Login({ onSignIn }) {
  return (
    <div className="xg-app-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--xg-font-sans)", padding: 20 }}>
      <div style={{ width: 380, background: "var(--xg-surface)", color: "var(--xg-ink)", border: "1px solid var(--xg-line)", borderRadius: 16, padding: "36px 34px", boxShadow: "var(--xg-shadow)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--xg-brand-accent)", color: "#2B2F26", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>xG</div>
          <b>{NAME}</b>
        </div>
        <h2 className="xg-display" style={{ margin: "0 0 6px", fontSize: 28, lineHeight: "34px", fontWeight: 760 }}>Sign in</h2>
        <p style={{ margin: "0 0 20px", color: "var(--xg-sub)", fontSize: 13.5 }}>Sign in with the Google account that owns your AdMob.</p>
        <button onClick={onSignIn} style={{ width: "100%", padding: 11, borderRadius: 8, border: "none", background: "var(--xg-accent)", color: "var(--xg-inverse)", fontWeight: 740, cursor: "pointer" }}>Continue with Google</button>
      </div>
    </div>
  );
}
function Shell() {
  const auth = useContext(AuthContext);
  const usingDevToken = !!DEV_TOKEN || !!PROXY;
  const token = usingDevToken ? DEV_TOKEN : auth.token;
  const isSignedIn = usingDevToken || auth.isSignedIn;
  const isLoading = usingDevToken ? false : auth.isLoading;
  const [ready, setReady] = useState(false);

  // React has painted, so the index.html boot splash has done its job. The
  // <BrandedLoader /> below picks up with identical markup, so nothing flickers.
  useEffect(() => { dismissBootSplash(); }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    if (!PROXY && !token) return; // token only required when calling AdMob directly
    let live = true;
    const source = PROXY && !DEV_TOKEN ? buildCachedSource(ACCOUNT, FOLDER) : buildLiveSource(ACCOUNT, FOLDER, token);
    source.then((src) => { if (live) { setDataSource(src); setReady(true); } })
      .catch((e) => {
        if (!live) return;
        const message = String((e && e.message) || e || "Unknown data-source error");
        setDataSource({
          ...demo,
          IS_LIVE: false,
          SOURCE_MODE: "demo-fallback",
          SOURCE_ERROR: message,
          TASKS_SOURCE: "demo-fallback",
          TASKS_ERROR: message,
          CONNECTIONS: {
            monetization: { status: "error", detail: "Using bundled demo data: " + message },
            clickup: { status: "unavailable", detail: "ClickUp was not loaded because the primary data source failed" },
          },
        });
        setReady(true);
      });
    return () => { live = false; };
  }, [isSignedIn, token]);  // proxy mode fetches with empty token
  if (isLoading) return <BrandedLoader full label="Checking access" />;
  if (!isSignedIn) return <Login onSignIn={auth.signIn} />;
  if (!ready) return <BrandedLoader full label="Preparing dashboard" />;
  return <div style={{ height: "100vh" }}><XgrowthOps /></div>;
}
createRoot(document.getElementById("root")).render(<AuthProvider><Shell /></AuthProvider>);
