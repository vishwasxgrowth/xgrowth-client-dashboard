// @ts-nocheck
import { useEffect, useRef } from "react";
import APP_JS from "./reportsApp.js?raw";
import CSS from "./reportsStyle.css?raw";
import MARKUP from "./markup.html?raw";

const BASE = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").replace(/\/$/, "");
const CLIENT = import.meta.env.VITE_CLIENT_ID || "jedyapps";
const NAME = import.meta.env.VITE_CLIENT_NAME || "Client";
// Our indigo theme over the reports' per-client accent
const THEME = ":root{--accent:#5B4BE8;--line-light:#4E3FD8;--line-dark:#8B7DF6;--wash-light:rgba(91,75,232,.10);--wash-dark:rgba(139,125,246,.16);}";

export default function ReportsDashboard() {
  const host = useRef(null);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    // data endpoints: proxy in prod, bundled file in dev
    window.__RPT_TS = BASE ? BASE + "/timeseries?clientId=" + encodeURIComponent(CLIENT) : "/dev-timeseries.json";
    window.__RPT_MANIFEST = BASE ? BASE + "/report-manifest?clientId=" + encodeURIComponent(CLIENT) : "/dev-manifest.json";
    window.__RPT_DAY = (date) => (BASE ? BASE + "/report-day?clientId=" + encodeURIComponent(CLIENT) + "&date=" + date : "/dev-days/" + date + ".html");
    window.CLIENT_CONFIG = { key: CLIENT, name: NAME };

    // scoped style + our theme
    const style = document.createElement("style");
    style.setAttribute("data-reports", "1");
    style.textContent = THEME + "\n" + CSS;
    document.head.appendChild(style);

    // markup into our container, then run the vendored app (fetches repointed at our proxy)
    root.innerHTML = MARKUP;
    const patched = APP_JS
      .replace("fetch('data/timeseries.json', { cache: 'no-store' })", "fetch(window.__RPT_TS, { cache: 'no-store' })")
      .replace("fetch('data/' + date + '.html', { cache: 'no-store' })", "fetch(window.__RPT_DAY(date), { cache: 'no-store' })")
      .replace("fetch('data/manifest.json', { cache: 'no-store' })", "fetch(window.__RPT_MANIFEST, { cache: 'no-store' })");
    let cleanup = () => {};
    try {
      // The vendored app is an IIFE that reads elements by id (now in the DOM) and boots itself.
      // eslint-disable-next-line no-new-func
      new Function(patched)();
    } catch (e) { root.innerHTML = '<div style="padding:24px;color:#8A90A0;font-family:system-ui">Reports failed to load: ' + (e && e.message) + "</div>"; }
    return () => { try { document.head.removeChild(style); } catch (e) {} cleanup(); };
  }, []);
  return <div ref={host} style={{ height: "100%", overflow: "auto" }} />;
}
