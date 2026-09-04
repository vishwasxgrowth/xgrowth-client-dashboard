// @ts-nocheck
import * as demo from "./data";
import { generateMediationReport, adUnitReport, fetchAppIcons } from "./admob";
import { getFolderData, getTaskDetail, getTaskComments, getWorkspaceMembers, updateTask, updateTaskStatus, updateTaskCustomField } from "./clickup";
import { loadTimeseries } from "./timeseriesSource";

function gm(v) { if (!v) return 0; if (typeof v.doubleValue === "number") return v.doubleValue; if (v.microsValue) return Number(v.microsValue) / 1e6; if (v.integerValue) return Number(v.integerValue); return 0; }
const fmtDate = (v) => (v && v.length === 8 ? v.slice(0, 4) + "-" + v.slice(4, 6) + "-" + v.slice(6, 8) : v);
const rd = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
const MS = 86400000;

const tierForRevenue = (rev30) => rev30 >= 15000 ? "Tier 1" : rev30 >= 3000 ? "Tier 2" : rev30 >= 500 ? "Tier 3" : "Tier 4";
const WORKFLOW_LISTS = new Set(["App Portfolio", "App Porfolio", "Mediation Setup", "SDK Integration", "Tests & Experiments", "Ongoing"]);

function activeMembersFromTasks(tasks) {
  const map = new Map();
  for (const task of tasks || []) {
    if (!WORKFLOW_LISTS.has(task.list)) continue;
    const assignees = task.assignees && task.assignees.length
      ? task.assignees
      : (task.assignee ? [{ name: task.assignee, color: null, initials: null }] : []);
    for (const assignee of assignees) {
      const name = assignee && assignee.name;
      if (!name || map.has(name)) continue;
      map.set(name, {
        id: assignee.id || null,
        name,
        initials: assignee.initials || null,
        color: assignee.color || null,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function latestNextDay(ts) {
  const latest = ts && ts.dates && ts.dates[ts.dates.length - 1];
  if (!latest) return demo.TODAY;
  return new Date(new Date(latest + "T00:00:00Z").getTime() + MS).toISOString().slice(0, 10);
}

function readSeries(ts, appName) {
  return appName ? ts.apps && ts.apps[appName] : ts.portfolio;
}

function rowFromTimeseries(ts, appName, dateStr) {
  const i = ts.dates.indexOf(dateStr);
  const s = readSeries(ts, appName);
  const revenue = i >= 0 && s && s.revenue ? s.revenue[i] : null;
  const impressions = i >= 0 && s && s.impressions ? s.impressions[i] : null;
  const requests = i >= 0 && s && s.requests ? s.requests[i] : null;
  const matched = i >= 0 && s && s.matched ? s.matched[i] : null;
  const dau = i >= 0 && s && s.dau ? s.dau[i] : null;
  const dav = i >= 0 && s && s.dav ? s.dav[i] : null;
  return {
    date: dateStr,
    revenue: revenue || 0,
    impressions: impressions || 0,
    requests: requests || 0,
    matched: matched || 0,
    clicks: 0,
    dau: dau || 0,
    dav: dav || 0,
    ecpm: impressions ? ((revenue || 0) / impressions) * 1000 : 0,
    matchRate: requests ? (matched || 0) / requests : 0,
    ctr: 0,
    showRate: matched ? (impressions || 0) / matched : 0,
  };
}

function aggregateTimeseries(ts, appName, dates) {
  let revenue = 0, impressions = 0, requests = 0, matched = 0, dau = 0, dav = 0, dauN = 0, davN = 0;
  const series = dates.map((ds) => {
    const r = rowFromTimeseries(ts, appName, ds);
    revenue += r.revenue; impressions += r.impressions; requests += r.requests; matched += r.matched;
    if (r.dau) { dau += r.dau; dauN++; }
    if (r.dav) { dav += r.dav; davN++; }
    return r;
  });
  return {
    series, revenue, impressions, requests, matched, clicks: 0,
    dau: dauN ? dau / dauN : 0,
    dav: davN ? dav / davN : 0,
    ecpm: impressions ? (revenue / impressions) * 1000 : 0,
    arpdau: dau ? revenue / dau : 0,
    arpdav: dav ? revenue / dav : 0,
    matchRate: requests ? matched / requests : 0,
    ctr: 0,
    showRate: matched ? impressions / matched : 0,
  };
}

function appsFromTimeseries(ts) {
  const names = Object.keys((ts && ts.apps) || {}).sort();
  const n = ts.dates ? ts.dates.length : 0;
  const a = Math.max(0, n - 30), b = Math.max(a, n - 1);
  return names.map((name) => {
    const agg = n ? aggregateTimeseries(ts, name, ts.dates.slice(a, b + 1)) : { revenue: 0, dau: 0, ecpm: 0, matchRate: 0 };
    return {
      id: name,
      name,
      cat: "App",
      tier: tierForRevenue(agg.revenue),
      store: "Google Play",
      dau: Math.round(agg.dau || 0),
      ecpm: agg.ecpm || 0,
      mr: agg.matchRate || 0,
    };
  });
}

async function loadClickUpWorkspace(folderId) {
  const { listsMeta, tasks } = await getFolderData(folderId, WORKFLOW_LISTS);
  let members = [];
  let membersError = null;
  try {
    members = await getWorkspaceMembers();
  } catch (e) {
    members = activeMembersFromTasks(tasks);
    membersError = "Using active assignees because ClickUp members could not be loaded";
  }
  if (!members.length) {
    membersError = membersError || "ClickUp returned no workspace members";
  }
  return { tasks, listsMeta, members, membersError };
}

export async function buildCachedSource(accountName, folderId) {
  const ts = await loadTimeseries();
  const TODAY = latestNextDay(ts);
  const rangeDates = (days, endOffset = 1) => {
    const end = demo.parseDay(TODAY).getTime() - endOffset * MS;
    const out = [];
    for (let i = days - 1; i >= 0; i--) out.push(demo.dayKey(new Date(end - i * MS)));
    return out;
  };
  const HAS_CLICKUP = !!folderId;
  const HAS_ADMOB = !!accountName;
  return {
    IS_LIVE: true,
    SOURCE_MODE: "cached-timeseries",
    SOURCE_ERROR: null,
    HAS_CLICKUP,
    HAS_ADMOB,
    CONNECTIONS: {
      monetization: { status: "connected", detail: "Cached timeseries feed loaded" },
      admob: HAS_ADMOB
        ? { status: "idle", detail: "AdMob account " + accountName }
        : { status: "not-configured", detail: "No AdMob account is linked to this client" },
      clickup: HAS_CLICKUP
        ? { status: "idle", detail: "ClickUp loads when a workspace view needs it" }
        : { status: "not-configured", detail: "No ClickUp folder is linked to this client" },
    },
    TODAY,
    MEMBERS: [],
    APPS: appsFromTimeseries(ts),
    dayKey: demo.dayKey,
    parseDay: demo.parseDay,
    rangeDates,
    dayRow: (app, ds) => rowFromTimeseries(ts, app && (app.id || app.name), ds),
    aggregate: (app, dates) => aggregateTimeseries(ts, app && (app.id || app.name), dates),
    TASKS: [],
    TASKS_SOURCE: HAS_CLICKUP ? "not-loaded" : "not-configured",
    TASKS_ERROR: null,
    EXPERIMENTS: [],
    experimentResults: () => null,
    LISTS_META: null,
    loadClickUpTasks: HAS_CLICKUP ? () => loadClickUpWorkspace(folderId) : null,
    getTaskDetail,
    getTaskComments,
    updateTaskStatus,
    ACCOUNT: accountName,
    adUnitReport: HAS_ADMOB ? (sd, ed) => adUnitReport(accountName, sd, ed) : null,
  };
}

export async function buildLiveSource(accountName, folderId, token, windowDays = 95) {
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - (windowDays - 1));
  const report = await generateMediationReport(accountName, {
    dateRange: { startDate: rd(start), endDate: rd(end) },
    dimensions: ["DATE", "APP"],
    metrics: ["ESTIMATED_EARNINGS", "OBSERVED_ECPM", "IMPRESSIONS", "AD_REQUESTS", "MATCHED_REQUESTS", "CLICKS"],
    localizationSettings: { currencyCode: "USD", languageCode: "en-US" },
  }, token);

  const appsById = new Map(); const rowLookup = new Map(); let latest = "";
  for (const entry of report || []) {
    const r = entry.row; if (!r) continue;
    const appDv = r.dimensionValues?.["APP"]; const dateV = fmtDate(r.dimensionValues?.["DATE"]?.value ?? "");
    const id = appDv?.value ?? "unknown";
    if (!appsById.has(id)) appsById.set(id, { id, name: appDv?.displayLabel ?? id, cat: "App", tier: "\u2014", store: "Google Play", dau: 0 });
    const revenue = gm(r.metricValues?.["ESTIMATED_EARNINGS"]), impressions = gm(r.metricValues?.["IMPRESSIONS"]);
    const requests = gm(r.metricValues?.["AD_REQUESTS"]), matched = gm(r.metricValues?.["MATCHED_REQUESTS"]), clicks = gm(r.metricValues?.["CLICKS"]);
    const ecpm = impressions ? (revenue / impressions) * 1000 : gm(r.metricValues?.["OBSERVED_ECPM"]);
    rowLookup.set(id + "|" + dateV, { date: dateV, revenue, impressions, requests, matched, clicks, dau: 0, dav: 0, ecpm, matchRate: requests ? matched / requests : 0, ctr: impressions ? clicks / impressions : 0, showRate: 0 });
    if (dateV > latest) latest = dateV;
  }
  const APPS = [...appsById.values()];
  // Icons are cosmetic and best-effort: a scrape failure or missing store
  // listing must not block the dashboard from loading real metrics.
  try {
    const icons = await fetchAppIcons(accountName);
    for (const app of APPS) if (icons[app.id]) app.icon = icons[app.id];
  } catch (e) {}
  const TODAY = latest ? new Date(new Date(latest + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10) : demo.TODAY;
  // dau/dav stay 0 here: the AdMob mediation report has no users dimension.
  // They light up once a GA4 users pull is wired into this live source.
  const zero = { revenue: 0, impressions: 0, requests: 0, matched: 0, clicks: 0, dau: 0, dav: 0, ecpm: 0, matchRate: 0, ctr: 0, showRate: 0 };
  const dayRow = (app, ds) => rowLookup.get(app.id + "|" + ds) || { date: ds, ...zero };
  const aggregate = (app, dates) => {
    let revenue = 0, impressions = 0, requests = 0, matched = 0, clicks = 0;
    for (const ds of dates) { const r = dayRow(app, ds); revenue += r.revenue; impressions += r.impressions; requests += r.requests; matched += r.matched; clicks += r.clicks; }
    return { revenue, impressions, requests, matched, clicks, dau: 0, dav: 0, ecpm: impressions ? (revenue / impressions) * 1000 : 0, arpdau: 0, arpdav: 0, matchRate: requests ? matched / requests : 0, ctr: impressions ? clicks / impressions : 0, showRate: 0 };
  };
  let TASKS = []; let LISTS_META = null;
  let TASKS_SOURCE = folderId ? "error" : "not-configured";
  let TASKS_ERROR = folderId ? null : "No ClickUp folder is linked to this client";
  if (folderId) {
    try {
      const { listsMeta, tasks } = await getFolderData(folderId, WORKFLOW_LISTS);
      // An empty list is a legitimate ClickUp answer (e.g. an empty folder),
      // not a failure — it stays an empty list rather than becoming an error.
      TASKS = tasks; LISTS_META = listsMeta; TASKS_SOURCE = "clickup";
    } catch (e) {
      TASKS_ERROR = String((e && e.message) || e);
      console.warn("[clickup] could not load tasks:", e);
    }
  }
  let MEMBERS = [];
  let MEMBERS_ERROR = null;
  try {
    MEMBERS = await getWorkspaceMembers();
  } catch (e) {
    MEMBERS = activeMembersFromTasks(TASKS);
    MEMBERS_ERROR = "Using active assignees because ClickUp members could not be loaded";
  }
  if (!MEMBERS.length) {
    MEMBERS_ERROR = MEMBERS_ERROR || "ClickUp returned no workspace members";
  }
  return {
    IS_LIVE: true,
    SOURCE_MODE: "live-admob",
    SOURCE_ERROR: null,
    HAS_CLICKUP: !!folderId,
    HAS_ADMOB: !!accountName,
    CONNECTIONS: {
      monetization: { status: "connected", detail: "Live AdMob mediation report loaded" },
      admob: { status: "connected", detail: "AdMob account " + accountName },
      clickup: TASKS_SOURCE === "clickup"
        ? { status: "connected", detail: "ClickUp task snapshot loaded" }
        : TASKS_SOURCE === "not-configured"
          ? { status: "not-configured", detail: "No ClickUp folder is linked to this client" }
          : { status: "error", detail: TASKS_ERROR || "ClickUp could not be loaded" },
    },
    TODAY, MEMBERS, MEMBERS_ERROR, APPS, dayKey: demo.dayKey, parseDay: demo.parseDay, rangeDates: demo.rangeDates, dayRow, aggregate, TASKS, TASKS_SOURCE, TASKS_ERROR, EXPERIMENTS: [], experimentResults: () => null, LISTS_META, getTaskDetail, getTaskComments, updateTask, updateTaskStatus, updateTaskCustomField, ACCOUNT: accountName, adUnitReport: (sd, ed) => adUnitReport(accountName, sd, ed)
  };
}
