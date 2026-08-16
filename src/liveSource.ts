// @ts-nocheck
import * as demo from "./data";
import { generateMediationReport, adUnitReport } from "./admob";
import { getFolderData, getTaskDetail, getTaskComments, updateTaskStatus } from "./clickup";

function gm(v) { if (!v) return 0; if (typeof v.doubleValue === "number") return v.doubleValue; if (v.microsValue) return Number(v.microsValue) / 1e6; if (v.integerValue) return Number(v.integerValue); return 0; }
const fmtDate = (v) => (v && v.length === 8 ? v.slice(0, 4) + "-" + v.slice(4, 6) + "-" + v.slice(6, 8) : v);
const rd = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });

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
    rowLookup.set(id + "|" + dateV, { date: dateV, revenue, impressions, requests, matched, clicks, dau: 0, ecpm, matchRate: requests ? matched / requests : 0, ctr: impressions ? clicks / impressions : 0, showRate: 0 });
    if (dateV > latest) latest = dateV;
  }
  const APPS = [...appsById.values()];
  const TODAY = latest ? new Date(new Date(latest + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10) : demo.TODAY;
  const zero = { revenue: 0, impressions: 0, requests: 0, matched: 0, clicks: 0, dau: 0, ecpm: 0, matchRate: 0, ctr: 0, showRate: 0 };
  const dayRow = (app, ds) => rowLookup.get(app.id + "|" + ds) || { date: ds, ...zero };
  const aggregate = (app, dates) => {
    let revenue = 0, impressions = 0, requests = 0, matched = 0, clicks = 0;
    for (const ds of dates) { const r = dayRow(app, ds); revenue += r.revenue; impressions += r.impressions; requests += r.requests; matched += r.matched; clicks += r.clicks; }
    return { revenue, impressions, requests, matched, clicks, dau: 0, ecpm: impressions ? (revenue / impressions) * 1000 : 0, arpdau: 0, matchRate: requests ? matched / requests : 0, ctr: impressions ? clicks / impressions : 0, showRate: 0 };
  };
  let TASKS = demo.TASKS; let LISTS_META = null;
  try { const { listsMeta, tasks } = await getFolderData(folderId); if (tasks.length) { TASKS = tasks; LISTS_META = listsMeta; } } catch (e) {}
  return { TODAY, MEMBERS: demo.MEMBERS, APPS, dayKey: demo.dayKey, parseDay: demo.parseDay, rangeDates: demo.rangeDates, dayRow, aggregate, TASKS, EXPERIMENTS: demo.EXPERIMENTS, experimentResults: demo.experimentResults, LISTS_META, getTaskDetail, getTaskComments, updateTaskStatus, ACCOUNT: accountName, adUnitReport: (sd, ed) => adUnitReport(accountName, sd, ed) };
}
