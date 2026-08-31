// @ts-nocheck
import { useMemo } from "react";
import D from "../activeData";
import { tsAggregate, tsAppNames } from "../timeseriesSource";
import { C, TIERS, card, Empty, AppAvatar, compact, money, money2, money4, pct100, delta, groupId, shortDate } from "./theme";

const MIN_DAILY_REVENUE = 50;

function metricDelta(cur, prev, invert) {
  return cur != null && prev ? delta(cur || 0, prev || 0, invert) : { v: null, txt: "n/a", arrow: "", fg: C.faint, bg: C.panel };
}

function dayShift(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDue(days = 2) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function at(ts, appName, idx) {
  return idx >= 0 && idx < ts.dates.length ? tsAggregate(ts, appName, idx, idx) : null;
}

function rangeAt(ts, appName, endIdx, days) {
  if (endIdx < 0) return null;
  const a = Math.max(0, endIdx - days + 1);
  return tsAggregate(ts, appName, a, endIdx);
}

function compareBundle(ts, appName) {
  const latestIdx = ts.dates.length - 1;
  const latestDate = ts.dates[latestIdx];
  const yoyDate = dayShift(latestDate, -365);
  const yoyExact = ts.dates.indexOf(yoyDate);
  const yoyIdx = yoyExact >= 0 ? yoyExact : latestIdx - 365;
  const latest = at(ts, appName, latestIdx);
  const prevDay = at(ts, appName, latestIdx - 1);
  const sameDayLastWeek = at(ts, appName, latestIdx - 7);
  const sameDayLastYear = at(ts, appName, yoyIdx);
  const week = rangeAt(ts, appName, latestIdx, 7);
  const priorWeek = rangeAt(ts, appName, latestIdx - 7, 7);
  const month = rangeAt(ts, appName, latestIdx, 30);
  const arpdau = (row) => row && row.dau ? row.arpdau : null;
  return {
    latestIdx,
    latestDate,
    latest,
    prevDay,
    sameDayLastWeek,
    sameDayLastYear,
    week,
    priorWeek,
    month,
    revenueDelta: {
      dod: metricDelta(latest && latest.revenue, prevDay && prevDay.revenue),
      sdlw: metricDelta(latest && latest.revenue, sameDayLastWeek && sameDayLastWeek.revenue),
      wow: metricDelta(week && week.revenue, priorWeek && priorWeek.revenue),
      yoy: metricDelta(latest && latest.revenue, sameDayLastYear && sameDayLastYear.revenue),
    },
    arpdauDelta: {
      dod: metricDelta(arpdau(latest), arpdau(prevDay)),
      sdlw: metricDelta(arpdau(latest), arpdau(sameDayLastWeek)),
      wow: metricDelta(week && week.arpdau, priorWeek && priorWeek.arpdau),
      yoy: metricDelta(arpdau(latest), arpdau(sameDayLastYear)),
    },
  };
}

function tierFor(revenue30) {
  if (revenue30 >= 15000) return { id: "T1", ...TIERS.T1 };
  if (revenue30 >= 3000) return { id: "T2", ...TIERS.T2 };
  if (revenue30 >= 500) return { id: "T3", ...TIERS.T3 };
  return { id: "T4", ...TIERS.T4 };
}

function sameDemoAppName(task, appName) {
  if (!task.app) return false;
  const a = D.APPS.find((x) => x.id === task.app);
  return a && a.name === appName;
}

function relatedTasks(tasks, taskAppMap, appName) {
  return (tasks || [])
    .filter((t) => (taskAppMap && taskAppMap.get(t.id) === appName) || sameDemoAppName(t, appName))
    .sort((a, b) => {
      const doneA = groupId(a.status) === "done" ? 1 : 0;
      const doneB = groupId(b.status) === "done" ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      const pr = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (pr[a.priority] ?? 4) - (pr[b.priority] ?? 4);
    });
}

function firstName(name) {
  return String(name || "Someone").split(/\s+/)[0] || "Someone";
}

function defaultAppAssignee() {
  const member = D.MEMBERS.find((m) => /nadiya|nadia/i.test(m.name));
  return member ? member.name : "Nadiya Hassan";
}

function DeltaPill({ label, change }) {
  return (
    <div title={label} style={{ border: "1px solid " + C.line, background: change.bg, color: change.fg, borderRadius: 8, padding: "8px 10px", minWidth: 92 }}>
      <div style={{ color: C.faint, fontSize: 10, fontWeight: 800, letterSpacing: ".04em" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 760, fontVariantNumeric: "tabular-nums" }}>{change.arrow} {change.txt}</div>
    </div>
  );
}

function MetricLine({ label, value, change, code }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(96px,1fr) minmax(76px,100px) minmax(76px,96px)", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid " + C.line }}>
      <span style={{ color: C.sub, fontSize: 12.5 }}>{label}</span>
      <strong style={{ textAlign: "right", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{value}</strong>
      <span title={code} style={{ textAlign: "right", color: change.fg, fontSize: 12.5, fontWeight: 750, fontVariantNumeric: "tabular-nums" }}>{code} {change.arrow} {change.txt}</span>
    </div>
  );
}

function SectionCard({ title, children, right }) {
  return (
    <section style={{ ...card, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "15px 18px", borderBottom: "1px solid " + C.line }}>
        <div className="xg-display" style={{ fontSize: 22 }}>{title}</div>
        {right}
      </div>
      <div style={{ padding: "4px 18px 14px" }}>{children}</div>
    </section>
  );
}

function TaskCell({ row, onOpenTask, onCreateTask }) {
  if (row.primaryTask) {
    const assignee = row.primaryTask.assignee || "Someone";
    return (
      <button onClick={() => onOpenTask(row.primaryTask.id)} style={{ border: 0, background: "transparent", color: C.accentDk, cursor: "pointer", padding: 0, textAlign: "left", fontSize: 12.5, fontWeight: 760 }}>
        {firstName(assignee)} is looking into it
        <span style={{ display: "block", marginTop: 2, color: C.faint, fontSize: 11, fontWeight: 520 }}>{row.primaryTask.status}{row.extraTasks > 0 ? " +" + row.extraTasks : ""}</span>
      </button>
    );
  }
  return (
    <button onClick={() => onCreateTask(row)} style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid " + C.line, background: C.field, color: C.accentDk, cursor: "pointer", fontSize: 12, fontWeight: 760 }}>
      Create task
    </button>
  );
}

function AppTable({ title, rows, empty, onOpenApp, onOpenTask, onCreateTask }) {
  return (
    <section style={{ ...card, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "15px 18px", borderBottom: "1px solid " + C.line }}>
        <div className="xg-display" style={{ fontSize: 22 }}>{title}</div>
        <span style={{ color: C.faint, fontSize: 12 }}>{rows.length} apps</span>
      </div>
      {rows.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1220, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: C.faint, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em" }}>
                {["Application", "Tier", "Revenue", "ARPDAU", "DOD", "SDLW", "WOW", "YOY", "eCPM", "Impr.", "DAU", "Task"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Application" || h === "Task" ? "left" : "right", padding: "10px 14px", borderBottom: "1px solid " + C.line, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} style={{ borderTop: "1px solid " + C.line }}>
                  <td style={{ padding: "11px 14px", width: 340 }}>
                    <button onClick={() => onOpenApp(row.name)} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, border: 0, background: "transparent", color: C.ink, padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <AppAvatar app={{ id: row.name, name: row.name }} size={30} radius={8} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 720, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
                        <span style={{ color: row.mainChange.fg, fontSize: 11.5 }}>ARPDAU {row.mainChange.arrow} {row.mainChange.txt} SDLW</span>
                      </span>
                    </button>
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right" }}><span style={{ color: row.tier.color, background: row.tier.bg, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>{row.tier.label}</span></td>
                  <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(row.latest.revenue)}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{row.latest.dau ? money4(row.latest.arpdau) : "n/a"}</td>
                  {["dod", "sdlw", "wow", "yoy"].map((k) => (
                    <td key={k} style={{ padding: "11px 14px", textAlign: "right", color: row.arpdauDelta[k].fg, fontWeight: 720, fontVariantNumeric: "tabular-nums" }}>{row.arpdauDelta[k].arrow} {row.arpdauDelta[k].txt}</td>
                  ))}
                  <td style={{ padding: "11px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money2(row.latest.ecpm)}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{compact(row.latest.impressions)}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.latest.dau ? compact(row.latest.dau) : "n/a"}</td>
                  <td style={{ padding: "11px 14px", minWidth: 160 }}><TaskCell row={row} onOpenTask={onOpenTask} onCreateTask={onCreateTask} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div style={{ padding: 18, color: C.faint }}>{empty}</div>}
    </section>
  );
}

export default function OverviewTab({ ts, tsError, tasks, taskAppMap, setPage, setAppId, setAppTab, setOpenTask, openCreate }) {
  const model = useMemo(() => {
    if (!ts || !ts.dates || !ts.dates.length) return null;
    const portfolio = compareBundle(ts, null);
    const appRows = tsAppNames(ts).map((name) => {
      const bundle = compareBundle(ts, name);
      const revenue30 = bundle.month ? bundle.month.revenue : 0;
      const tier = tierFor(revenue30);
      const allTasks = relatedTasks(tasks, taskAppMap, name);
      const openTasks = allTasks.filter((t) => groupId(t.status) !== "done");
      const primaryTask = openTasks[0] || null;
      const mainChange = bundle.arpdauDelta.sdlw;
      return {
        name,
        tier,
        latest: bundle.latest || {},
        week: bundle.week || {},
        revenue30,
        arpdauDelta: bundle.arpdauDelta,
        mainChange,
        primaryTask,
        extraTasks: Math.max(0, openTasks.length - 1),
      };
    }).filter((row) => (row.latest.revenue || 0) >= MIN_DAILY_REVENUE);
    const down = appRows
      .filter((row) => (row.mainChange.v || 0) < -0.15)
      .sort((a, b) => (a.mainChange.v || 0) - (b.mainChange.v || 0) || (b.latest.revenue || 0) - (a.latest.revenue || 0));
    const up = appRows
      .filter((row) => (row.mainChange.v || 0) >= -0.15)
      .sort((a, b) => (b.mainChange.v || 0) - (a.mainChange.v || 0) || (b.latest.revenue || 0) - (a.latest.revenue || 0));
    return { portfolio, down, up, appCount: appRows.length };
  }, [ts, tasks, taskAppMap]);

  if (tsError) return <Empty>Dashboard data unavailable: {tsError}</Empty>;
  if (!ts || !model) return <Empty>Loading overview...</Empty>;

  const p = model.portfolio;
  const latest = p.latest || {};
  const latestDate = p.latestDate;
  const openApp = (name) => { setAppId(name); setAppTab("dashboard"); setPage("apps"); };
  const openTask = (id) => { setPage("tasks"); setOpenTask(id); };
  const createTask = (row) => {
    const change = row.mainChange && row.mainChange.txt !== "n/a" ? row.mainChange.txt : "changed";
    const isDrop = (row.mainChange && row.mainChange.v) < 0;
    openCreate({
      name: (isDrop ? "Investigate ARPDAU drop for " : "Review ARPDAU uplift for ") + row.name,
      list: "App Portfolio",
      app: row.name,
      assignee: defaultAppAssignee(),
      priority: isDrop && Math.abs(row.mainChange.v || 0) >= 10 ? "urgent" : "high",
      due: formatDue(2),
      ctxTitle: isDrop ? "ARPDAU drop" : "ARPDAU uplift",
      ctxValue: change + " SDLW - latest revenue " + money(row.latest.revenue || 0),
      ctxBad: isDrop,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{ ...card, padding: 24, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 22, alignItems: "end" }}>
          <div>
            <h1 className="xg-display" style={{ margin: 0, fontSize: 42, lineHeight: 1.03, fontWeight: 620 }}>Overview</h1>
            <div style={{ color: C.sub, fontSize: 14, lineHeight: 1.55, marginTop: 10 }}>Latest data date is {latestDate}. Comparisons use real portfolio revenue from the cached Trends feed.</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
              <div style={{ fontSize: 46, fontWeight: 760, fontVariantNumeric: "tabular-nums" }}>{money(latest.revenue)}</div>
              <span style={{ color: C.faint, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>latest day revenue</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(82px,1fr))", gap: 8 }}>
            <DeltaPill label="DOD" change={p.revenueDelta.dod} />
            <DeltaPill label="SDLW" change={p.revenueDelta.sdlw} />
            <DeltaPill label="WOW" change={p.revenueDelta.wow} />
            <DeltaPill label="YOY" change={p.revenueDelta.yoy} />
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <SectionCard title="Portfolio Revenue" right={<span style={{ color: C.faint, fontSize: 12 }}>{shortDate(latestDate)}</span>}>
          <MetricLine label="Latest day" value={money(latest.revenue)} change={p.revenueDelta.dod} code="DOD" />
          <MetricLine label="Same day last week" value={money(p.sameDayLastWeek && p.sameDayLastWeek.revenue)} change={p.revenueDelta.sdlw} code="SDLW" />
          <MetricLine label="Last 7D revenue" value={money(p.week && p.week.revenue)} change={p.revenueDelta.wow} code="WOW" />
          <MetricLine label="Same day last year" value={money(p.sameDayLastYear && p.sameDayLastYear.revenue)} change={p.revenueDelta.yoy} code="YOY" />
        </SectionCard>

        <SectionCard title="Traffic vs Monetization" right={<button onClick={() => setPage("daily")} style={{ border: "1px solid " + C.line, background: C.field, color: C.sub, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 720, cursor: "pointer" }}>Daily Reports</button>}>
          <MetricLine label="ARPDAU" value={latest.dau ? money4(latest.arpdau) : "n/a"} change={p.arpdauDelta.sdlw} code="SDLW" />
          <MetricLine label="eCPM" value={money2(latest.ecpm)} change={metricDelta(latest.ecpm, p.sameDayLastWeek && p.sameDayLastWeek.ecpm)} code="SDLW" />
          <MetricLine label="Impressions" value={compact(latest.impressions)} change={metricDelta(latest.impressions, p.sameDayLastWeek && p.sameDayLastWeek.impressions)} code="SDLW" />
          <MetricLine label="DAU" value={latest.dau ? compact(latest.dau) : "n/a"} change={metricDelta(latest.dau, p.sameDayLastWeek && p.sameDayLastWeek.dau)} code="SDLW" />
          <MetricLine label="DAV" value={latest.dav ? compact(latest.dav) : "n/a"} change={metricDelta(latest.dav, p.sameDayLastWeek && p.sameDayLastWeek.dav)} code="SDLW" />
          <MetricLine label="Match rate" value={pct100(latest.matchRate)} change={metricDelta(latest.matchRate, p.sameDayLastWeek && p.sameDayLastWeek.matchRate)} code="SDLW" />
          <MetricLine label="Show rate" value={pct100(latest.showRate)} change={metricDelta(latest.showRate, p.sameDayLastWeek && p.sameDayLastWeek.showRate)} code="SDLW" />
        </SectionCard>
      </section>

      <section style={{ ...card, padding: "15px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div className="xg-display" style={{ fontSize: 24 }}>Application Health</div>
            <div style={{ color: C.faint, fontSize: 12.5, marginTop: 3 }}>Apps with latest-day revenue of {money(MIN_DAILY_REVENUE)}+; ranked by ARPDAU movement. Tiers use the Settings revenue bands.</div>
          </div>
          <button onClick={() => setPage("apps")} style={{ border: "1px solid " + C.line, background: C.field, color: C.sub, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 760, cursor: "pointer" }}>Open Applications</button>
        </div>
      </section>

      <AppTable title="Downlift" rows={model.down} empty="No ARPDAU downlift found for apps above the daily revenue threshold." onOpenApp={openApp} onOpenTask={openTask} onCreateTask={createTask} />
      <AppTable title="Uplift" rows={model.up} empty="No ARPDAU uplift found for apps above the daily revenue threshold." onOpenApp={openApp} onOpenTask={openTask} onCreateTask={createTask} />
    </div>
  );
}
