// @ts-nocheck
// Applications tab: the app list (timeseries.json-backed, see
// ../timeseriesSource.js) and the per-app detail page (stat cards,
// interactive charts, embedded Tasks).
import { useMemo, useState } from "react";
import D from "../activeData";
import { tsAppNames, tsRangeIdx, tsAggregate, tsDayRowAt } from "../timeseriesSource";
import { C, card, Empty, AppAvatar, appColor, money, money2, money4, compact, pct100, delta, shortDate } from "./theme";
import TasksTab from "./TasksTab";

const APPS_LIST_COLS = [
  { k: "dau", label: "DAU", fmt: compact },
  { k: "revenue", label: "Revenue", fmt: money },
  { k: "ecpm", label: "eCPM", fmt: money2 },
  { k: "matchRate", label: "Match rate", fmt: pct100 },
  { k: "showRate", label: "Show rate", fmt: pct100 },
  { k: "arpdav", label: "ARPDAV", fmt: money4 },
  { k: "arpdau", label: "ARPDAU", fmt: money4 },
];

// All data here comes from timeseries.json (see timeseriesSource.js) — the
// same feed the Dashboard/Trends tab reads, so the two never disagree.
export default function AppsTab({ ts, tsError, range, setRange, q, selApps, appId, setAppId, appTab, setAppTab, tasks, taskView, taskAppMap }) {
  if (tsError) return <Empty>Applications data unavailable: {tsError}</Empty>;
  if (!ts) return <Empty>Loading application data…</Empty>;

  const days = range === "y" ? 1 : range === "30" ? 30 : 7;
  const r = tsRangeIdx(ts, days);
  const pa = r.a - r.days, pb = r.a - 1;
  const hasPrev = pa >= 0;

  if (!appId) {
    const qq = q.trim().toLowerCase();
    // The header's app filter still stores D.APPS ids; bridge to names here
    // since the Applications list is keyed by the timeseries' own app names.
    const selNames = new Set((selApps || []).map((id) => { const a = D.APPS.find((x) => x.id === id); return a ? a.name : null; }).filter(Boolean));
    const rows = tsAppNames(ts)
      .filter((name) => (!selNames.size || selNames.has(name)) && (!qq || name.toLowerCase().includes(qq)))
      .map((name) => {
        const a = tsAggregate(ts, name, r.a, r.b);
        const b = hasPrev ? tsAggregate(ts, name, pa, pb) : null;
        const cells = APPS_LIST_COLS.map((c) => ({ v: c.fmt(a[c.k] || 0), d: b ? delta(a[c.k] || 0, b[c.k] || 0) : delta(null, null) }));
        return { name, a, cells };
      })
      .sort((x, y) => y.a.revenue - x.a.revenue);
    const hbase = { fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", padding: "10px 14px", background: "#FAFAFC", borderBottom: "1px solid " + C.line, whiteSpace: "nowrap", textAlign: "right" };
    const cbase = { padding: "10px 14px", borderBottom: "1px solid #F1F2F6", whiteSpace: "nowrap", textAlign: "right" };
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <RangePicker range={range} setRange={setRange} />
          <span style={{ fontSize: 12, color: C.faint }}>{ts.dates[r.a]} → {ts.dates[r.b]}</span>
        </div>
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...hbase, textAlign: "left" }}>App</th>
                  {APPS_LIST_COLS.map((c) => <th key={c.k} style={hbase}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ name, cells }) => (
                  <tr key={name} onClick={() => { setAppId(name); setAppTab("dashboard"); }} style={{ cursor: "pointer" }}>
                    <td style={{ ...cbase, textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <AppAvatar app={{ id: name, name }} size={30} radius={8} />
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{name}</div>
                      </div>
                    </td>
                    {cells.map((c, i) => <td key={i} style={cbase}><div style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{c.v}</div><div style={{ fontSize: 10.5, color: c.d.fg, fontVariantNumeric: "tabular-nums" }}>{c.d.arrow} {c.d.txt.replace("+", "")}</div></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {rows.length === 0 && <Empty>No apps match.</Empty>}
      </>
    );
  }

  const a = tsAggregate(ts, appId, r.a, r.b);
  const b = hasPrev ? tsAggregate(ts, appId, pa, pb) : null;
  const dd = (k) => (b ? delta(a[k] || 0, b[k] || 0) : delta(null, null));
  const stats = [
    { label: "Revenue", v: money(a.revenue), d: dd("revenue") },
    { label: "eCPM", v: money2(a.ecpm), d: dd("ecpm") },
    { label: "Impressions", v: compact(a.impressions), d: dd("impressions") },
    { label: "Match rate", v: pct100(a.matchRate), d: dd("matchRate") },
  ];
  return (
    <div>
      <button onClick={() => setAppId(null)} style={{ border: "none", background: "none", cursor: "pointer", color: C.sub, fontSize: 13, marginBottom: 12 }}>← Applications</button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AppAvatar app={{ id: appId, name: appId }} size={44} radius={11} />
          <div style={{ fontSize: 18, fontWeight: 700 }}>{appId}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <RangePicker range={range} setRange={setRange} />
          <span style={{ fontSize: 12, color: C.faint }}>{ts.dates[r.a]} → {ts.dates[r.b]}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {stats.map((s) => <div key={s.label} style={{ ...card, padding: "12px 14px" }}><div style={{ fontSize: 10.5, textTransform: "uppercase", color: C.faint, fontWeight: 600 }}>{s.label}</div><div style={{ fontSize: 18, fontWeight: 600, margin: "4px 0", fontVariantNumeric: "tabular-nums" }}>{s.v}</div><div style={{ fontSize: 10.5, color: s.d.fg, fontVariantNumeric: "tabular-nums" }}>{s.d.arrow} {s.d.txt.replace("+", "")}</div></div>)}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid " + C.line }}>
        {[["dashboard", "Dashboard"], ["tasks", "Tasks"]].map(([id, label]) => <button key={id} onClick={() => setAppTab(id)} style={{ border: "none", background: "none", cursor: "pointer", padding: "8px 2px", marginRight: 14, fontSize: 13.5, fontWeight: appTab === id ? 700 : 500, color: appTab === id ? C.accent : C.ink, borderBottom: appTab === id ? "2px solid " + C.accent : "2px solid transparent" }}>{label}</button>)}
      </div>
      {appTab === "dashboard" && <AppDashboardCharts ts={ts} appName={appId} a={r.a} b={r.b} agg={a} />}
      {appTab === "tasks" && <TasksTab tasks={tasks} taskView={taskView} scopeApp={appId} taskAppMap={taskAppMap} />}
    </div>
  );
}

function RangePicker({ range, setRange }) {
  return (
    <div style={{ display: "flex", background: "#EDEEF2", borderRadius: 9, padding: 3 }}>
      {[["y", "Yesterday"], ["7", "Last 7 days"], ["30", "Last 30 days"]].map(([id, label]) => (
        <button key={id} onClick={() => setRange(id)} style={{ border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: range === id ? 650 : 550, padding: "5px 12px", borderRadius: 7, background: range === id ? "#fff" : "transparent", color: range === id ? C.ink : "#6B7180", boxShadow: range === id ? "0 1px 2px rgba(16,24,40,.1)" : "none" }}>{label}</button>
      ))}
    </div>
  );
}

// Revenue / eCPM / Impressions / ARPDAV / DAU / DAV, 2 per row, for the
// selected range.
function AppDashboardCharts({ ts, appName, a, b, agg }) {
  const days = useMemo(() => { const out = []; for (let i = a; i <= b; i++) out.push(tsDayRowAt(ts, appName, i)); return out; }, [ts, appName, a, b]);
  const dates = days.map((r) => r.date);
  const blocks = [
    { label: "Revenue", values: days.map((r) => r.revenue || 0), total: agg.revenue, fmt: money, color: appColor(appName) },
    { label: "eCPM", values: days.map((r) => r.ecpm || 0), total: agg.ecpm, fmt: money2, color: "#0E9F6E" },
    { label: "Impressions", values: days.map((r) => r.impressions || 0), total: agg.impressions, fmt: compact, color: "#D9730D" },
    { label: "ARPDAV", values: days.map((r) => r.arpdav || 0), total: agg.arpdav, fmt: money4, color: "#7C3AED" },
    { label: "DAU (active users)", values: days.map((r) => r.dau || 0), total: agg.dau, fmt: compact, color: "#2563EB" },
    { label: "DAV (ad viewers)", values: days.map((r) => r.dav || 0), total: agg.dav, fmt: compact, color: "#DB2777" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
      {blocks.map((bl) => <MiniMetricChart key={bl.label} dates={dates} {...bl} />)}
    </div>
  );
}

// Interactive line-only sparkline: hover for a crosshair, a highlighted
// point, and a tooltip with the exact date + value. No area fill and no
// static headline number — the chart earns its keep on hover, not by
// repeating a number that's already on the stat card above it.
function MiniMetricChart({ label, dates, values, total, fmt, color }) {
  const [hov, setHov] = useState(-1);
  const w = 320, h = 130, padL = 46, padR = 12, padT = 12, padB = 20;
  const iw = w - padL - padR, ih = h - padT - padB;
  const n = values.length;
  // Only floor the ceiling at 1 when the series is genuinely all-zero — a
  // hardcoded floor otherwise flattens small-valued metrics like ARPDAV
  // (e.g. $0.05-0.08) into a barely-visible line against a 0-1 axis.
  const rawMax = Math.max(...values);
  const mx = rawMax > 0 ? rawMax : 1;
  const mn = Math.min(0, ...values);
  const sp = (mx - mn) || 1;
  const X = (i) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => padT + (1 - (v - mn) / sp) * ih;
  const line = values.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
  const grid = [0, 0.5, 1].map((f) => ({ y: padT + f * ih, v: mx - f * (mx - mn) }));
  const hovering = hov >= 0 && hov < n;
  // Invert X(i)'s padding so a point at data index i really does line up
  // under the cursor — mapping raw cursor-x/width to index ignored padL/padR
  // and made the crosshair land wherever isn't where you're pointing.
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xInViewBox = ((e.clientX - rect.left) / rect.width) * w;
    const frac = (xInViewBox - padL) / iw;
    setHov(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };
  const leftPct = hovering ? (X(hov) / w) * 100 : 0;
  const clampTx = leftPct < 20 ? "0" : leftPct > 80 ? "-100%" : "-50%";
  return (
    <div style={{ ...card, padding: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: C.faint, marginBottom: 8 }}>{label}</div>
      <div style={{ position: "relative" }} onMouseLeave={() => setHov(-1)}>
        {hovering && (
          <div style={{ position: "absolute", top: 2, left: leftPct + "%", transform: "translateX(" + clampTx + ")", background: "#14161C", color: "#fff", borderRadius: 8, padding: "5px 9px", fontSize: 11, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 2, boxShadow: "0 6px 16px rgba(0,0,0,.22)" }}>
            <div style={{ color: "#B4B9C4", fontSize: 9.5, marginBottom: 1 }}>{shortDate(dates[hov])}</div>
            <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(values[hov])}</div>
          </div>
        )}
        <svg viewBox={"0 0 " + w + " " + h} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove}>
          {grid.map((g, i) => <g key={i}><line x1={padL} x2={w - padR} y1={g.y} y2={g.y} stroke="#F1F2F6" /><text x={padL - 6} y={g.y + 3} textAnchor="end" fontSize="8.5" fill="#9AA0AE" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(g.v)}</text></g>)}
          {n > 1 ? <path d={line} fill="none" stroke={color} strokeWidth="1.8" /> : (n === 1 && <circle cx={X(0)} cy={Y(values[0] || 0)} r="3" fill={color} />)}
          {dates[0] && <text x={padL} y={h - 4} fontSize="8.5" fill="#9AA0AE">{shortDate(dates[0])}</text>}
          {dates[n - 1] && <text x={w - padR} y={h - 4} textAnchor="end" fontSize="8.5" fill="#9AA0AE">{shortDate(dates[n - 1])}</text>}
          {hovering && <line x1={X(hov)} x2={X(hov)} y1={padT} y2={padT + ih} stroke={color} strokeOpacity="0.4" strokeDasharray="3 3" />}
          {hovering && <circle cx={X(hov)} cy={Y(values[hov])} r="3.5" fill={color} stroke="#fff" strokeWidth="1.5" />}
          {n <= 1 && <rect x="0" y="0" width={w} height={h} fill="transparent" />}
        </svg>
      </div>
    </div>
  );
}
