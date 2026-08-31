// @ts-nocheck
import { useMemo, useState } from "react";
import D from "../activeData";
import { tsAggregate, tsAppNames } from "../timeseriesSource";
import { C, TIERS, card, Empty, compact, money, money2, money4, pct100, delta, groupId } from "./theme";

const MIN_DAILY_REVENUE = 50;
const RECENT_TREND_DAYS = 10;
const TIER_RANK = { T1: 1, T2: 2, T3: 3, T4: 4 };

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

function valueOf(row, key) {
  if (!row) return null;
  if (key === "arpdav") return row.dav ? row.arpdav : null;
  if (key === "matchRate" || key === "showRate") return row[key] || 0;
  return row[key] != null ? row[key] : null;
}

function average(xs) {
  const clean = xs.filter((x) => x != null && Number.isFinite(x));
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
}

function recentMetricTrend(ts, appName, key) {
  const n = ts.dates.length;
  const start = Math.max(0, n - RECENT_TREND_DAYS);
  const values = [];
  for (let i = start; i < n; i++) values.push(valueOf(at(ts, appName, i), key));
  const clean = values.filter((x) => x != null && Number.isFinite(x));
  if (clean.length < 6) {
    const latest = rangeAt(ts, appName, n - 1, 7);
    const previous = rangeAt(ts, appName, n - 8, 7);
    return { days: 7, change: metricDelta(valueOf(latest, key), valueOf(previous, key)) };
  }
  const split = Math.floor(clean.length / 2);
  return { days: clean.length, change: metricDelta(average(clean.slice(split)), average(clean.slice(0, split))) };
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
  const priorMonth = rangeAt(ts, appName, latestIdx - 30, 30);
  return {
    latestDate,
    latest,
    sameDayLastWeek,
    month,
    revenueDelta: {
      dod: metricDelta(latest && latest.revenue, prevDay && prevDay.revenue),
      sdlw: metricDelta(latest && latest.revenue, sameDayLastWeek && sameDayLastWeek.revenue),
      wow: metricDelta(week && week.revenue, priorWeek && priorWeek.revenue),
      yoy: metricDelta(latest && latest.revenue, sameDayLastYear && sameDayLastYear.revenue),
    },
    arpdavDelta: {
      sdlw: metricDelta(valueOf(latest, "arpdav"), valueOf(sameDayLastWeek, "arpdav")),
      d7: metricDelta(valueOf(week, "arpdav"), valueOf(priorWeek, "arpdav")),
      d30: metricDelta(valueOf(month, "arpdav"), valueOf(priorMonth, "arpdav")),
    },
    deltas: {
      ecpm: metricDelta(valueOf(latest, "ecpm"), valueOf(sameDayLastWeek, "ecpm")),
      impressions: metricDelta(valueOf(latest, "impressions"), valueOf(sameDayLastWeek, "impressions")),
      matchRate: metricDelta(valueOf(latest, "matchRate"), valueOf(sameDayLastWeek, "matchRate")),
      showRate: metricDelta(valueOf(latest, "showRate"), valueOf(sameDayLastWeek, "showRate")),
      dau: metricDelta(valueOf(latest, "dau"), valueOf(sameDayLastWeek, "dau")),
      dav: metricDelta(valueOf(latest, "dav"), valueOf(sameDayLastWeek, "dav")),
    },
    trend: recentMetricTrend(ts, appName, "arpdav"),
    ecpmTrend: recentMetricTrend(ts, appName, "ecpm"),
    davTrend: recentMetricTrend(ts, appName, "dav"),
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

function sourceFor(row) {
  const trend = row.trend.change.v || 0;
  const ecpm = row.ecpmTrend.change.v || 0;
  const dav = row.davTrend.change.v || 0;
  const sameDirectionEcpm = trend === 0 ? false : Math.sign(trend) === Math.sign(ecpm);
  if (sameDirectionEcpm && Math.abs(ecpm) >= Math.max(2, Math.abs(dav) * 0.5)) {
    return { label: "Monetization", color: C.warn };
  }
  return { label: "Traffic / Geo", color: C.info };
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

function SortHeader({ label, col, active, onSort, align = "right" }) {
  const on = active.key === col;
  return (
    <th style={{ textAlign: align, padding: 0, borderBottom: "1px solid " + C.line, whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2, background: C.surface }}>
      <button onClick={() => onSort(col)} title={"Sort by " + label} style={{ width: "100%", border: 0, background: "transparent", color: on ? C.accentDk : C.faint, padding: "11px 14px", textAlign: align, cursor: "pointer", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 820 }}>
        {label} {on ? active.dir === "asc" ? "▲" : "▼" : ""}
      </button>
    </th>
  );
}

function CompareCell({ change, strong }) {
  const active = strong || (change.v != null && Math.abs(change.v) >= 10);
  return (
    <td style={{ padding: "9px 14px", textAlign: "right" }}>
      <span style={{ display: "inline-flex", minWidth: 86, justifyContent: "flex-end", padding: active ? "6px 8px" : 0, borderRadius: active ? 7 : 0, border: active ? "1px solid " + (change.v < 0 ? C.danger : C.forest) : "none", background: active ? (change.v < 0 ? C.dangerBg : C.forestBg) : "transparent", color: change.fg, fontSize: 13.5, fontWeight: active ? 800 : 650, fontVariantNumeric: "tabular-nums" }}>
        {change.arrow} {change.txt}
      </span>
    </td>
  );
}

function TaskCell({ row, taskLoadState, onOpenTask, onCreateTask }) {
  if (taskLoadState === "loading") return <span style={{ color: C.faint, fontSize: 12 }}>Checking ClickUp...</span>;
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

function sortValue(row, key) {
  if (key === "app") return row.name.toLowerCase();
  if (key === "tier") return TIER_RANK[row.tier.id] || 9;
  if (key === "revenue") return row.latest.revenue || 0;
  if (key === "sdlw") return row.arpdavDelta.sdlw.v ?? -999;
  if (key === "d7") return row.arpdavDelta.d7.v ?? -999;
  if (key === "d30") return row.arpdavDelta.d30.v ?? -999;
  if (key === "ecpm") return row.deltas.ecpm.v ?? -999;
  if (key === "impressions") return row.deltas.impressions.v ?? -999;
  if (key === "matchRate") return row.deltas.matchRate.v ?? -999;
  if (key === "showRate") return row.deltas.showRate.v ?? -999;
  if (key === "dau") return row.deltas.dau.v ?? -999;
  if (key === "dav") return row.deltas.dav.v ?? -999;
  if (key === "arpdav") return row.latest.arpdav || 0;
  if (key === "source") return row.source.label;
  if (key === "task") return row.primaryTask ? 0 : 1;
  return 0;
}

function sortRows(rows, sort, direction) {
  return rows.slice().sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    let cmp = typeof av === "string" || typeof bv === "string" ? String(av).localeCompare(String(bv)) : av - bv;
    if (sort.dir === "desc") cmp *= -1;
    if (cmp) return cmp;
    const tierCmp = (TIER_RANK[a.tier.id] || 9) - (TIER_RANK[b.tier.id] || 9);
    if (tierCmp) return tierCmp;
    return direction === "down" ? (a.trend.change.v || 0) - (b.trend.change.v || 0) : (b.trend.change.v || 0) - (a.trend.change.v || 0);
  });
}

function AppTable({ title, code, rows, empty, direction, taskLoadState, onOpenApp, onOpenTask, onCreateTask }) {
  const [sort, setSort] = useState({ key: "tier", dir: "asc" });
  const sorted = sortRows(rows, sort, direction);
  const onSort = (key) => setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "app" || key === "tier" || key === "source" || key === "task" ? "asc" : "desc" });
  return (
    <section style={{ ...card, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "16px 18px", borderBottom: "1px solid " + C.line, flexWrap: "wrap" }}>
        <span style={{ color: C.accentDk, background: C.accentBg, borderRadius: 7, padding: "3px 8px", fontSize: 11, fontWeight: 850, letterSpacing: ".06em" }}>{code}</span>
        <div style={{ color: C.accentDk, fontSize: 13, fontWeight: 850, letterSpacing: ".08em", textTransform: "uppercase" }}>{title}</div>
        <span style={{ color: C.sub, fontSize: 18, fontWeight: 760 }}>{rows.length} apps</span>
        <span style={{ color: C.faint, fontSize: 12 }}>T1 first by default - ARPDAV recent trend - 12 visible rows</span>
      </div>
      <div style={{ padding: "12px 18px 8px", display: "flex", gap: 18, color: C.sub, fontSize: 12.5, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: C.warn, marginRight: 7 }} />Monetization</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: C.info, marginRight: 7 }} />Traffic / Geo</span>
        <span style={{ color: C.faint }}>Shaded cells show larger moves.</span>
      </div>
      {rows.length ? (
        <div style={{ overflow: "auto", maxHeight: 736, borderTop: "1px solid " + C.line }}>
          <table style={{ width: "100%", minWidth: 1420, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <SortHeader label="App" col="app" active={sort} onSort={onSort} align="left" />
                <SortHeader label="Tier" col="tier" active={sort} onSort={onSort} />
                <SortHeader label="Rev (Yest)" col="revenue" active={sort} onSort={onSort} />
                <SortHeader label="Vs SDLW" col="sdlw" active={sort} onSort={onSort} />
                <SortHeader label="7D" col="d7" active={sort} onSort={onSort} />
                <SortHeader label="30D" col="d30" active={sort} onSort={onSort} />
                <SortHeader label="eCPM" col="ecpm" active={sort} onSort={onSort} />
                <SortHeader label="Impr" col="impressions" active={sort} onSort={onSort} />
                <SortHeader label="Match" col="matchRate" active={sort} onSort={onSort} />
                <SortHeader label="Show" col="showRate" active={sort} onSort={onSort} />
                <SortHeader label="DAU" col="dau" active={sort} onSort={onSort} />
                <SortHeader label="DAV" col="dav" active={sort} onSort={onSort} />
                <SortHeader label="ARPDAV" col="arpdav" active={sort} onSort={onSort} />
                <SortHeader label="Task" col="task" active={sort} onSort={onSort} align="left" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.name} style={{ borderTop: "1px solid " + C.line }}>
                  <td style={{ padding: "13px 14px", minWidth: 280, maxWidth: 340 }}>
                    <button onClick={() => onOpenApp(row.name)} style={{ border: 0, background: "transparent", color: C.ink, padding: 0, cursor: "pointer", textAlign: "left", width: "100%" }}>
                      <span style={{ display: "block", fontWeight: 780, fontSize: 14.5, lineHeight: 1.35 }}>{row.name}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 7, color: C.sub, marginTop: 5, fontSize: 12.5 }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: row.source.color, flex: "none" }} />
                        Source: {row.source.label}
                      </span>
                    </button>
                  </td>
                  <td style={{ padding: "13px 14px", textAlign: "right", color: C.faint, fontSize: 14, fontWeight: 820 }}>{row.tier.id}</td>
                  <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 720, fontVariantNumeric: "tabular-nums" }}>{money(row.latest.revenue)}</td>
                  <CompareCell change={row.arpdavDelta.sdlw} />
                  <CompareCell change={row.arpdavDelta.d7} strong={direction === "down" ? (row.arpdavDelta.d7.v || 0) < -10 : (row.arpdavDelta.d7.v || 0) > 10} />
                  <CompareCell change={row.arpdavDelta.d30} />
                  <CompareCell change={row.deltas.ecpm} />
                  <CompareCell change={row.deltas.impressions} />
                  <CompareCell change={row.deltas.matchRate} />
                  <CompareCell change={row.deltas.showRate} />
                  <CompareCell change={row.deltas.dau} />
                  <CompareCell change={row.deltas.dav} />
                  <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 720, fontVariantNumeric: "tabular-nums" }}>{row.latest.dav ? money4(row.latest.arpdav) : "n/a"}</td>
                  <td style={{ padding: "13px 14px", minWidth: 170 }}><TaskCell row={row} taskLoadState={taskLoadState} onOpenTask={onOpenTask} onCreateTask={onCreateTask} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div style={{ padding: 18, color: C.faint }}>{empty}</div>}
    </section>
  );
}

export default function OverviewTab({ ts, tsError, tasks, taskAppMap, taskLoadState, taskError, setPage, setAppId, setAppTab, setOpenTask, openCreate }) {
  const model = useMemo(() => {
    if (!ts || !ts.dates || !ts.dates.length) return null;
    const portfolio = compareBundle(ts, null);
    const appRows = tsAppNames(ts).map((name) => {
      const bundle = compareBundle(ts, name);
      const revenue30 = bundle.month ? bundle.month.revenue : 0;
      const tier = tierFor(revenue30);
      const allTasks = relatedTasks(tasks, taskAppMap, name);
      const openTasks = allTasks.filter((t) => groupId(t.status) !== "done");
      const row = {
        name,
        tier,
        latest: bundle.latest || {},
        revenue30,
        arpdavDelta: bundle.arpdavDelta,
        deltas: bundle.deltas,
        trend: bundle.trend,
        ecpmTrend: bundle.ecpmTrend,
        davTrend: bundle.davTrend,
        primaryTask: openTasks[0] || null,
        extraTasks: Math.max(0, openTasks.length - 1),
      };
      return { ...row, source: sourceFor(row) };
    }).filter((row) => (row.latest.revenue || 0) >= MIN_DAILY_REVENUE && row.latest.dav);
    const down = appRows
      .filter((row) => (row.trend.change.v || 0) < -0.15)
      .sort((a, b) => (TIER_RANK[a.tier.id] || 9) - (TIER_RANK[b.tier.id] || 9) || (a.trend.change.v || 0) - (b.trend.change.v || 0));
    const up = appRows
      .filter((row) => (row.trend.change.v || 0) >= 0.15)
      .sort((a, b) => (TIER_RANK[a.tier.id] || 9) - (TIER_RANK[b.tier.id] || 9) || (b.trend.change.v || 0) - (a.trend.change.v || 0));
    return { portfolio, down, up, appCount: appRows.length };
  }, [ts, tasks, taskAppMap]);

  if (tsError) return <Empty>Dashboard data unavailable: {tsError}</Empty>;
  if (!ts || !model) return <Empty>Loading overview...</Empty>;

  const p = model.portfolio;
  const latest = p.latest || {};
  const openApp = (name) => { setAppId(name); setAppTab("dashboard"); setPage("apps"); };
  const openTask = (id) => { setPage("tasks"); setOpenTask(id); };
  const createTask = (row) => {
    const change = row.trend.change && row.trend.change.txt !== "n/a" ? row.trend.change.txt : "changed";
    const isDrop = (row.trend.change && row.trend.change.v) < 0;
    openCreate({
      name: (isDrop ? "Investigate ARPDAV downtrend for " : "Review ARPDAV uplift for ") + row.name,
      list: "App Portfolio",
      app: row.name,
      assignee: defaultAppAssignee(),
      priority: isDrop && Math.abs(row.trend.change.v || 0) >= 10 ? "urgent" : "high",
      due: formatDue(2),
      ctxTitle: isDrop ? "ARPDAV downtrend" : "ARPDAV uplift",
      ctxValue: change + " over recent " + row.trend.days + "D - " + row.source.label + " source - revenue " + money(row.latest.revenue || 0),
      ctxBad: isDrop,
    });
  };
  const taskNote = taskLoadState === "ready"
    ? "ClickUp task snapshot checked; task matches are inferred from app names."
    : taskLoadState === "loading"
      ? "Checking ClickUp tasks for app ownership..."
      : taskLoadState === "error"
        ? "ClickUp task check failed: " + taskError
        : "ClickUp tasks will load here before deployment review.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{ ...card, padding: 24, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 22, alignItems: "end" }}>
          <div>
            <h1 className="xg-display" style={{ margin: 0, fontSize: 42, lineHeight: 1.03, fontWeight: 620 }}>Overview</h1>
            <div style={{ color: C.sub, fontSize: 14, lineHeight: 1.55, marginTop: 10 }}>Latest data date is {p.latestDate}. Revenue comparison is shown at the top; app sections are classified by ARPDAV movement over the recent {RECENT_TREND_DAYS}-day trend.</div>
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

      <div style={{ color: C.faint, fontSize: 12.5, padding: "0 2px" }}>{taskNote}</div>

      <AppTable title="Needs Attention" code="DOWN" direction="down" rows={model.down} empty="No ARPDAV downtrend found for apps above the $50/day noise floor." taskLoadState={taskLoadState} onOpenApp={openApp} onOpenTask={openTask} onCreateTask={createTask} />
      <AppTable title="Improved Performance" code="UP" direction="up" rows={model.up} empty="No ARPDAV uplift found for apps above the $50/day noise floor." taskLoadState={taskLoadState} onOpenApp={openApp} onOpenTask={openTask} onCreateTask={createTask} />

      <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.45, padding: "0 2px" }}>
        Showing {model.appCount} apps above the {money(MIN_DAILY_REVENUE)}/day floor. Sort any header; each table keeps 12 rows visible and scrolls for the full list.
      </div>
    </div>
  );
}
