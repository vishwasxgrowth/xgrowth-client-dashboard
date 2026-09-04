// @ts-nocheck
import { useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./design.css";

import { AuthContext, AuthProvider } from "./auth";
import { setDataSource } from "./activeData";
import { buildCachedSource, buildLiveSource } from "./liveSource";
import XgrowthOps from "./XgrowthOps";
import BrandedLoader, { dismissBootSplash } from "./BrandedLoader";
import { BASE, CLIENT, FALLBACK_CLIENT, adoptClient, setClient, clearClient, apiFetch, setMeta, clientName } from "./session";

const DEV_TOKEN = import.meta.env.VITE_DEV_ACCESS_TOKEN || "";
const PROXY = BASE;

function Login({ mountButton, error }) {
  return (
    <div className="xg-app-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--xg-font-sans)", padding: 20 }}>
      <div style={{ width: 380, background: "var(--xg-surface)", color: "var(--xg-ink)", border: "1px solid var(--xg-line)", borderRadius: 16, padding: "36px 34px", boxShadow: "var(--xg-shadow)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--xg-brand-accent)", color: "#2B2F26", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>xG</div>
          <b>{clientName()}</b>
        </div>
        <h2 className="xg-display" style={{ margin: "0 0 6px", fontSize: 28, lineHeight: "34px", fontWeight: 760 }}>Sign in</h2>
        <p style={{ margin: "0 0 20px", color: "var(--xg-sub)", fontSize: 13.5 }}>
          {error === "not-authorised"
            ? "That account isn't on the access list for this dashboard. Ask xGrowth to add it, or sign in with a different account."
            : "Sign in with the Google account xGrowth added for you."}
        </p>
        <div ref={mountButton} style={{ display: "flex", justifyContent: "center" }} />
      </div>
    </div>
  );
}
function ClientPicker({ clients, onPick, email }) {
  return (
    <div className="xgl xgl--full" role="group" aria-label="Choose a client">
      <div className="xgl-brand">
        <div className="xgl-tile">xG</div>
        <div className="xgl-word"><b>xGrowth</b><span>Monetization console</span></div>
      </div>
      <div className="xgl-status"><span className="xgl-dot" />{email ? "Signed in as " + email : "Choose a client"}</div>
      <div className="xgl-rows" style={{ maxWidth: 430 }}>
        {clients.map((c) => (
          <button
            key={c.id}
            className="xgl-row"
            onClick={() => onPick(c.id)}
            style={{ cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit", width: "100%" }}
          >
            <div className="xgl-col">
              <span style={{ fontWeight: 780, fontSize: 14.5 }}>{c.displayName}</span>
              <span style={{ fontSize: 12, color: "var(--xgl-faint2)" }}>{c.id}</span>
            </div>
            <span aria-hidden="true" style={{ fontSize: 18, color: "var(--xgl-faint2)" }}>&rsaquo;</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DataError({ message, onBack }) {
  return (
    <div className="xg-app-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--xg-font-sans)", padding: 20 }}>
      <div style={{ width: 460, background: "var(--xg-surface)", color: "var(--xg-ink)", border: "1px solid var(--xg-line)", borderRadius: 16, padding: "34px 32px", boxShadow: "var(--xg-shadow)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--xg-brand-accent)", color: "#2B2F26", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>xG</div>
          <b>{clientName()}</b>
        </div>
        <h2 className="xg-display" style={{ margin: "0 0 8px", fontSize: 24, lineHeight: "30px", fontWeight: 760 }}>No data for this client yet</h2>
        <p style={{ margin: "0 0 8px", color: "var(--xg-sub)", fontSize: 13.5, lineHeight: 1.6 }}>
          This client has no monetization feed connected, so there is nothing to show. Once their
          Sheet starts pushing, this dashboard fills in on the next reload.
        </p>
        <p style={{ margin: "0 0 22px", color: "var(--xg-faint-2)", fontSize: 11.5, fontFamily: "var(--xg-font-mono, monospace)", wordBreak: "break-word" }}>{message}</p>
        <button onClick={onBack} style={{ height: 38, padding: "0 16px", borderRadius: 8, border: "1px solid var(--xg-line)", background: "var(--xg-field)", color: "var(--xg-ink)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Choose a different client
        </button>
      </div>
    </div>
  );
}

function Shell() {
  const auth = useContext(AuthContext);
  const token = DEV_TOKEN;
  const isSignedIn = auth.isSignedIn;           // always true when the gate is off
  const isLoading = auth.isLoading;
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [dataError, setDataError] = useState(null);
  const [client, setClientId] = useState(CLIENT);
  const [clients, setClients] = useState(null);   // null = not asked yet

  // React has painted, so the index.html boot splash has done its job. The
  // <BrandedLoader /> below picks up with identical markup, so nothing flickers.
  useEffect(() => { dismissBootSplash(); }, []);

  // No client from the URL or a previous choice: ask the server what this
  // person may open. One client, or an unreachable list, skips the picker.
  useEffect(() => {
    if (!isSignedIn || client) return;
    let live = true;
    if (!PROXY) { adoptClient(FALLBACK_CLIENT || "jedyapps"); setClientId(FALLBACK_CLIENT || "jedyapps"); return; }
    apiFetch(PROXY + "/clients")
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        const list = (j && j.clients) || [];
        if (list.length === 1) { adoptClient(list[0].id); setClientId(list[0].id); return; }
        setClients(list);
      })
      .catch(() => {
        if (!live) return;
        // Registry not populated yet, or the route is not deployed. Behave
        // exactly as the single-client build did rather than dead-ending.
        const fb = FALLBACK_CLIENT || "jedyapps";
        adoptClient(fb); setClientId(fb);
      });
    return () => { live = false; };
  }, [isSignedIn, client]);

  useEffect(() => {
    if (!isSignedIn || !client) return;
    let live = true;
    // Ask the server who this client is before fetching anything for them.
    // Nothing about the client is baked into this build.
    const session = PROXY
      ? apiFetch(PROXY + "/session?clientId=" + encodeURIComponent(CLIENT))
          .then((r) => r.json())
          .then((j) => { setMeta(j && j.client); return j && j.client ? j.client : {}; })
      : Promise.resolve({});
    const source = session.then((c) =>
      PROXY && !DEV_TOKEN
        ? buildCachedSource(c.admobAccount || "", c.clickupFolder || "")
        : buildLiveSource(c.admobAccount || "", c.clickupFolder || "", token));
    source.then((src) => { if (live) { setDataSource(src); setReady(true); } })
      .catch((e) => {
        if (!live) return;
        if (e && (e.status === 401 || e.status === 403)) {
          // Not signed in, or signed in as someone this client has not listed.
          setAuthError(e.status === 403 ? "not-authorised" : "signed-out");
          auth.signOut();
          return;
        }
        // Never substitute bundled sample data here. A dashboard full of
        // another portfolio's numbers under this client's name is far worse
        // than an honest empty state, and it is indistinguishable from real
        // data once someone screenshots it.
        setDataError(String((e && e.message) || e || "Unknown data-source error"));
      });
    return () => { live = false; };
  }, [isSignedIn, client, token]);  // proxy mode fetches with empty token
  if (isLoading) return <BrandedLoader full label="Checking access" />;
  if (!isSignedIn || authError) return <Login mountButton={auth.mountButton} error={authError} />;
  if (dataError) return <DataError message={dataError} onBack={clearClient} />;
  if (!client) {
    if (clients && clients.length) return <ClientPicker clients={clients} onPick={setClient} email={auth.email} />;
    return <BrandedLoader full label="Loading clients" />;
  }
  if (!ready) return <BrandedLoader full label="Preparing dashboard" />;
  return <div style={{ height: "100vh" }}><XgrowthOps /></div>;
}
createRoot(document.getElementById("root")).render(<AuthProvider><Shell /></AuthProvider>);
