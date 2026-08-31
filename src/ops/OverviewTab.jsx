// @ts-nocheck
import { useMemo } from "react";
import D from "../activeData";
import { tsAggregate, tsAppNames, tsRangeIdx, tsDayRowAt } from "../timeseriesSource";
import { C, card, Empty, AppAvatar, appColor, compact, money, money2, money4, pct100, delta, groupId, shortDate } from "./theme";

function metricDelta(cur, prev, invert) {
  return prev ? delta(cur || 0, prev || 0, invert) : { txt: "n/a", arrow: "", fg: C.faint, bg: C.panel };
}

function Tile({ label, value, change, sub }) {
  return (
    <div style={{ ...card, padding: "16px 16px 14px", minHeight: 118 }}>
      <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 680, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, color: change.fg, fontSize: 12, fontWeight: 650 }}>
        <span>{change.arrow} {change.txt}</span>
        <span style={{ color: C.faint, fontWeight: 500 }}>{sub}</span>
      </div>
    </div>
  );
}

function Spark({ values, color }) {
  const w = 420, h = 118, pad = 8;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i) => pad + (values.length <= 1 ? (w - pad * 2) / 2 : (i / (values.length - 1)) * (w - pad * 2));
  const y = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const d = values.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
  const area = d + " L " + x(values.length - 1).toFixed(1) + " " + (h - pad).toFixed(1) + " L " + x(0).toFixed(1) + " " + (h - pad).toFixed(1) + " Z";
  return (
    <svg viewBox={"0 0 " + w + " " + h} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
      <path d={area} fill={color} opacity="0.14" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InsightRow({ row, onOpenApp }) {
  return (
    <button onClick={() => onOpenApp(row.name)} style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) repeat(3,minmax(64px,86px))", gap: 8, alignItems: "center", padding: "11px 14px", border: 0, borderTop: "1px solid " + C.line, background: "transparent", color: C.ink, textAlign: "left", cursor: "pointer" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <AppAvatar app={{ id: row.name, name: row.name }} size={30} radius={8} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 650, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
          <span style={{ color: C.faint, fontSize: 11 }}>{row.reason}</span>
        </span>
      </span>
      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(row.revenue)}</span>
      <span style={{ textAlign: "right", color: row.revDelta.fg, fontVariantNumeric: "tabular-nums" }}>{row.revDelta.arrow} {row.revDelta.txt}</span>
      <span style={{ textAlign: "right", color: row.ecpmDelta.fg, fontVariantNumeric: "tabular-nums" }}>{row.ecpmDelta.arrow} {row.ecpmDelta.txt}</span>
    </button>
  );
}

function TaskStrip({ tasks, taskAppMap }) {
  const open = tasks.filter((t) => groupId(t.status) !== "done");
  const overdue = open.filter((t) => t.due && t.due < D.TODAY).length;
  const blocked = open.filter((t) => /block/i.test(t.status)).length;
  const experiments = open.filter((t) => /test|experiment/i.test(t.list)).length;
  const matched = taskAppMap ? open.filter((t) => taskAppMap.get(t.id)).length : 0;
  const items = [
    ["Open tasks", open.length],
    ["Overdue", overdue],
    ["Blocked", blocked],
    ["Experiments", experiments],
    ["Linked apps", matched],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10 }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ border: "1px solid " + C.line, background: C.panel, borderRadius: 8, padding: "12px 13px" }}>
          <div style={{ color: C.faint, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

export default function OverviewTab({ ts, tsError, tasks, taskAppMap, setPage, setAppId, setAppTab }) {
  const model = useMemo(() => {
    if (!ts || !ts.dates || !ts.dates.length) return null;
    const r7 = tsRangeIdx(ts, 7);
    const p7 = { a: Math.max(0, r7.a - r7.days), b: r7.a - 1 };
    const r30 = tsRangeIdx(ts, 30);
    const cur = tsAggregate(ts, null, r7.a, r7.b);
    const prev = p7.b >= p7.a ? tsAggregate(ts, null, p7.a, p7.b) : null;
    const dates30 = [];
    const rev30 = [];
    for (let i = r30.a; i <= r30.b; i++) {
      dates30.push(ts.dates[i]);
      rev30.push(tsDayRowAt(ts, null, i).revenue || 0);
    }
    const rows = tsAppNames(ts).map((name) => {
      const a = tsAggregate(ts, name, r7.a, r7.b);
      const b = prev ? tsAggregate(ts, name, p7.a, p7.b) : null;
      const revDelta = b ? delta(a.revenue || 0, b.revenue || 0) : metricDelta(null, null);
      const ecpmDelta = b ? delta(a.ecpm || 0, b.ecpm || 0) : metricDelta(null, null);
      const score = Math.min(0, revDelta.v || 0) + Math.min(0, ecpmDelta.v || 0) * 0.55 - Math.log10((a.revenue || 0) + 10);
      const reason = (revDelta.v || 0) < -10 ? "Revenue decline" : (ecpmDelta.v || 0) < -10 ? "eCPM pressure" : "Portfolio watch";
      return { name, revenue: a.revenue, ecpm: a.ecpm, impressions: a.impressions, dau: a.dau, dav: a.dav, revDelta, ecpmDelta, score, reason };
    }).sort((a, b) => a.score - b.score);
    const leaders = rows.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 7);
    const watch = rows.filter((r) => (r.revDelta.v || 0) < -5 || (r.ecpmDelta.v || 0) < -8).slice(0, 6);
    const health = rows.slice(0, 8);
    return { r7, r30, cur, prev, dates30, rev30, leaders, watch, health };
  }, [ts]);

  if (tsError) return <Empty>Dashboard data unavailable: {tsError}</Empty>;
  if (!ts || !model) return <Empty>Loading executive dashboard...</Empty>;

  const arpuLabel = model.cur.dau > 0 ? "ARPDAU" : "ARPDAV";
  const arpuValue = model.cur.dau > 0 ? model.cur.arpdau : model.cur.arpdav;
  const arpuPrev = model.prev ? (model.cur.dau > 0 ? model.prev.arpdau : model.prev.arpdav) : null;
  const revChange = model.prev ? delta(model.cur.revenue, model.prev.revenue) : metricDelta(null, null);
  const latest = ts.dates[ts.dates.length - 1];
  const first30 = ts.dates[model.r30.a];
  const openApp = (name) => { setAppId(name); setAppTab("dashboard"); setPage("apps"); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{ ...card, padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 22, alignItems: "center", overflow: "hidden" }}>
        <div>
          <div style={{ color: C.accentDk, fontSize: 12, fontWeight: 760, textTransform: "uppercase" }}>Executive Overview</div>
          <h1 className="xg-display" style={{ margin: "8px 0 10px", fontSize: 40, lineHeight: 1.04, fontWeight: 620 }}>Monetization pulse for {ts.displayName || ts.client || "client"}.</h1>
          <div style={{ color: C.sub, fontSize: 14, lineHeight: 1.55, maxWidth: 760 }}>Last 7 days versus the prior 7, using the same live cached feed as Trends. Latest data date is {latest}.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
            <div style={{ fontSize: 42, fontWeight: 720, fontVariantNumeric: "tabular-nums" }}>{money(model.cur.revenue)}</div>
            <span style={{ color: revChange.fg, background: revChange.bg, borderRadius: 8, padding: "5px 9px", fontSize: 13, fontWeight: 700 }}>{revChange.arrow} {revChange.txt}</span>
            <span style={{ color: C.faint, fontSize: 12 }}>portfolio revenue</span>
          </div>
        </div>
        <div style={{ background: C.panel, border: "1px solid " + C.line, borderRadius: 8, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: C.faint, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
            <span>30-day revenue trend</span><span>{first30} to {latest}</span>
          </div>
          <Spark values={model.rev30} color="var(--xg-accent)" />
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Tile label="Revenue" value={money(model.cur.revenue)} change={model.prev ? delta(model.cur.revenue, model.prev.revenue) : metricDelta()} sub="vs prior 7d" />
        <Tile label={arpuLabel} value={money4(arpuValue)} change={metricDelta(arpuValue, arpuPrev)} sub={model.cur.dau > 0 ? "revenue / DAU" : "revenue / DAV"} />
        <Tile label="eCPM" value={money2(model.cur.ecpm)} change={model.prev ? delta(model.cur.ecpm, model.prev.ecpm) : metricDelta()} sub="blended" />
        <Tile label="Impressions" value={compact(model.cur.impressions)} change={model.prev ? delta(model.cur.impressions, model.prev.impressions) : metricDelta()} sub="served ads" />
        <Tile label="DAU" value={model.cur.dau > 0 ? compact(model.cur.dau) : "n/a"} change={model.cur.dau > 0 ? metricDelta(model.cur.dau, model.prev && model.prev.dau) : metricDelta()} sub="avg daily users" />
        <Tile label="DAV" value={model.cur.dav > 0 ? compact(model.cur.dav) : "n/a"} change={model.cur.dav > 0 ? metricDelta(model.cur.dav, model.prev && model.prev.dav) : metricDelta()} sub="avg ad viewers" />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
        <div style={card}>
          <div style={{ padding: "15px 16px", borderBottom: "1px solid " + C.line, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div><div className="xg-display" style={{ fontSize: 21 }}>Application Health</div><div style={{ color: C.faint, fontSize: 12 }}>Ranked by revenue and eCPM pressure in the latest week.</div></div>
            <button onClick={() => setPage("apps")} style={{ border: "1px solid " + C.line, background: C.field, color: C.sub, borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 650, cursor: "pointer" }}>Open apps</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", overflow: "hidden" }}>
            {model.health.map((row, i) => (
              <InsightRow key={row.name} row={{ ...row, reason: (i + 1) + ". " + row.reason }} onOpenApp={openApp} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={card}>
            <div style={{ padding: "15px 16px", borderBottom: "1px solid " + C.line }}>
              <div className="xg-display" style={{ fontSize: 21 }}>Declines & Anomalies</div>
              <div style={{ color: C.faint, fontSize: 12 }}>Apps with meaningful week-over-week pressure.</div>
            </div>
            {model.watch.length ? model.watch.map((row) => <InsightRow key={row.name} row={row} onOpenApp={openApp} />) : <div style={{ padding: 18, color: C.faint }}>No major declines detected in the latest week.</div>}
          </div>
          <div style={{ ...card, padding: 16 }}>
            <div className="xg-display" style={{ fontSize: 21, marginBottom: 10 }}>Daily Report</div>
            <div style={{ color: C.sub, lineHeight: 1.5, marginBottom: 14 }}>The latest digest is available in Daily Reports, including the reconciled report catch-up state when raw CSVs lag behind Trends.</div>
            <button onClick={() => setPage("daily")} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: 0, background: C.accent, color: C.inverse, fontWeight: 700, cursor: "pointer" }}>Open Daily Reports</button>
          </div>
        </div>
      </section>

      <section style={card}>
        <div style={{ padding: "15px 16px", borderBottom: "1px solid " + C.line }}>
          <div className="xg-display" style={{ fontSize: 21 }}>Top Revenue Apps</div>
          <div style={{ color: C.faint, fontSize: 12 }}>Latest 7-day contribution, pulled from the live timeseries.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 0 }}>
          {model.leaders.map((row) => (
            <button key={row.name} onClick={() => openApp(row.name)} style={{ border: 0, borderRight: "1px solid " + C.line, borderTop: "1px solid " + C.line, background: "transparent", color: C.ink, padding: 14, textAlign: "left", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                <AppAvatar app={{ id: row.name, name: row.name }} size={30} radius={8} />
                <div style={{ minWidth: 0, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: C.faint, fontSize: 12 }}>
                <span>{money(row.revenue)}</span><span>{money2(row.ecpm)} eCPM</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <TaskStrip tasks={tasks} taskAppMap={taskAppMap} />
    </div>
  );
}
