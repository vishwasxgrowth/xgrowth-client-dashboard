// @ts-nocheck
import { useEffect, useRef } from "react";
import APP_JS from "./reportsApp.js?raw";
import CSS from "./reportsStyle.css?raw";
import MARKUP from "./markup.html?raw";

import { BASE, CLIENT, apiFetch, clientName } from "../session";

export default function ReportsDashboard({ mode = "trends" }) {
  const host = useRef(null);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    window.__RPT_TS = BASE ? BASE + "/timeseries?clientId=" + encodeURIComponent(CLIENT) : "/dev-timeseries.json";
    window.__RPT_MANIFEST = BASE ? BASE + "/report-manifest?clientId=" + encodeURIComponent(CLIENT) : "/dev-manifest.json";
    window.__RPT_DAY = (date) => (BASE ? BASE + "/report-day?clientId=" + encodeURIComponent(CLIENT) + "&date=" + date : "/dev-days/" + date + ".html");
    window.__RPT_MODE = mode;
    window.CLIENT_CONFIG = { key: CLIENT, name: clientName() };
    // reportsApp.js is injected as raw source and calls fetch() directly, so
    // it needs the same identity header as the rest of the app.
    window.__RPT_FETCH = (u, o) => apiFetch(u, o);

    const style = document.createElement("style");
    style.setAttribute("data-reports", "1");
    style.textContent = CSS;
    document.head.appendChild(style);

    root.innerHTML = MARKUP;
    const patched = APP_JS
      .replace("fetch('data/timeseries.json', { cache: 'no-store' })", "window.__RPT_FETCH(window.__RPT_TS)")
      .replace("fetch('data/' + date + '.html', { cache: 'no-store' })", "window.__RPT_FETCH(window.__RPT_DAY(date))")
      .replace("fetch('data/manifest.json', { cache: 'no-store' })", "window.__RPT_FETCH(window.__RPT_MANIFEST)");
    try {
      // eslint-disable-next-line no-new-func
      new Function(patched)();
    } catch (e) {
      root.innerHTML = '<div style="padding:24px;color:#8A90A0;font-family:system-ui">Reports failed to load: ' + (e && e.message) + "</div>";
    }
    return () => { try { document.head.removeChild(style); } catch (e) {} };
  }, [mode]);
  return <div ref={host} style={{ height: "100%", overflow: "auto", background: "transparent" }} />;
}
