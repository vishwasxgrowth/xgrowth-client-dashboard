// @ts-nocheck
// Google identity for the dashboard.
//
// We ask Google for an ID TOKEN (who you are), not an access token (what you
// may do). The Cloud Function verifies it and checks the email against that
// client's allowlist, so a leaked dashboard URL is worthless on its own.
// The browser never receives an AdMob or ClickUp credential — the function
// holds those per client.
//
// With VITE_GOOGLE_CLIENT_ID unset the provider stays in open mode and the
// app behaves exactly as it did before, which is what keeps the rollout safe.
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { setIdToken } from "./session";

const CLIENT_ID = import.meta.env.VITE_AUTH_CLIENT_ID || "";
const KEY = "xgrowth-id-token.v1";

export const AuthContext = createContext(null);

function emailOf(jwt) {
  try {
    const p = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(p)))).email || null;
  } catch (e) { return null; }
}

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [email, setEmail] = useState(null);
  const gsi = useRef(null);

  const accept = useCallback((jwt) => {
    setIdToken(jwt);
    setToken(jwt);
    setEmail(emailOf(jwt));
    try { sessionStorage.setItem(KEY, jwt); } catch (e) {}
  }, []);

  const signOut = useCallback(() => {
    setIdToken(null); setToken(null); setEmail(null);
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    try { window.google && window.google.accounts.id.disableAutoSelect(); } catch (e) {}
  }, []);

  useEffect(() => {
    if (!CLIENT_ID) { setReady(true); return; } // open mode
    // ID tokens last an hour. Reuse one across a reload and let the server be
    // the judge — a stale token comes back 401 and we fall to the sign-in screen.
    try { const saved = sessionStorage.getItem(KEY); if (saved) accept(saved); } catch (e) {}
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => {
      try {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (r) => { if (r && r.credential) accept(r.credential); },
          auto_select: true,
          cancel_on_tap_outside: false,
        });
        gsi.current = window.google.accounts.id;
        gsi.current.prompt();
      } catch (e) {}
      setReady(true);
    };
    s.onerror = () => setReady(true); // offline: don't hang on the splash
    document.head.appendChild(s);
  }, [accept]);

  // Renders Google's own button; returns a cleanup-free callback ref.
  const mountButton = useCallback((el) => {
    if (!el || !gsi.current) return;
    try {
      gsi.current.renderButton(el, { theme: "outline", size: "large", text: "signin_with", shape: "pill", width: 260 });
    } catch (e) {}
  }, [ready]);

  return (
    <AuthContext.Provider value={{
      gated: !!CLIENT_ID,
      isLoading: !ready,
      isSignedIn: !CLIENT_ID || !!token,
      token, email, signOut, mountButton,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
