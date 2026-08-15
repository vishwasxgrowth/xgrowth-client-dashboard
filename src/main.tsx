// @ts-nocheck
import { useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { AuthContext, AuthProvider } from "./auth";
import { setDataSource, resetDataSource } from "./activeData";
import { buildLiveSource } from "./liveSource";
import XgrowthOps from "./XgrowthOps";

const NAME = import.meta.env.VITE_CLIENT_NAME || "Your Dashboard";
const ACCOUNT = import.meta.env.VITE_CLIENT_ADMOB_ACCOUNT || "";
const FOLDER = import.meta.env.VITE_CLIENT_CLICKUP_FOLDER || "";

function Login({ onSignIn }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F7F9", fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>
      <div style={{ width: 360, background: "#fff", border: "1px solid #E9EAF0", borderRadius: 16, padding: "34px 32px", boxShadow: "0 12px 40px rgba(20,22,28,.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#5B4BE8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>xG</div>
          <b>{NAME}</b>
        </div>
        <h2 style={{ margin: "0 0 6px" }}>Sign in</h2>
        <p style={{ margin: "0 0 20px", color: "#6B7280", fontSize: 13.5 }}>Sign in with the Google account that owns your AdMob.</p>
        <button onClick={onSignIn} style={{ width: "100%", padding: 11, borderRadius: 10, border: "1px solid #E4E6EE", background: "#fff", fontWeight: 600, cursor: "pointer" }}>Continue with Google</button>
      </div>
    </div>
  );
}
function Center({ children }) { return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A90A0", fontFamily: "system-ui" }}>{children}</div>; }

function Shell() {
  const { isLoading, isSignedIn, token, signIn } = useContext(AuthContext);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isSignedIn || !token) return;
    let live = true;
    buildLiveSource(ACCOUNT, FOLDER, token).then((src) => { if (live) { setDataSource(src); setReady(true); } })
      .catch(() => { if (live) { resetDataSource(); setReady(true); } });
    return () => { live = false; };
  }, [isSignedIn, token]);
  if (isLoading) return <Center>…</Center>;
  if (!isSignedIn) return <Login onSignIn={signIn} />;
  if (!ready) return <Center>Loading your dashboard…</Center>;
  return <div style={{ height: "100vh" }}><XgrowthOps /></div>;
}
createRoot(document.getElementById("root")).render(<AuthProvider><Shell /></AuthProvider>);
