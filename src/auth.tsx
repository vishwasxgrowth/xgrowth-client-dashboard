// @ts-nocheck
import { createContext, useEffect, useState } from "react";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const SCOPES = "https://www.googleapis.com/auth/admob.readonly profile email";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [client, setClient] = useState(null);

  useEffect(() => {
    if (!CLIENT_ID) { setReady(true); return; } // proxy mode: no Google login needed
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
    s.onload = () => {
      const c = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (resp) => { if (resp && resp.access_token) setToken(resp.access_token); },
      });
      setClient(c); setReady(true);
    };
    document.head.appendChild(s);
  }, []);

  const signIn = () => client && client.requestAccessToken({ prompt: token ? "" : "consent" });

  return (
    <AuthContext.Provider value={{ isLoading: !ready, isSignedIn: !!token, token, signIn }}>
      {children}
    </AuthContext.Provider>
  );
}
