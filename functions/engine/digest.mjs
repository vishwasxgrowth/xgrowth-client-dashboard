#!/usr/bin/env node
/**
 * Monetization Decline Digest · analysis engine (v1, AdMob-only)
 *
 * Reads the AdMob Monetization Feed (AppDaily, and optionally Detail) and produces
 * the L0-L4 drill-down digest defined in the project README, applying the
 * app-alerting-framework tiers, thresholds, revenue floor, and the revenue-
 * decomposition attribution that names the layer responsible for each move.
 *
 * Deterministic: all numbers (comparisons, tiers, decomposition) are computed
 * here so they are correct and repeatable. Claude turns the emitted JSON/markdown
 * into the brand-voice Slack draft. This script never posts anything.
 *
 * Node >= 18, standard library only. No network, no dependencies.
 *
 * Usage:
 *   node digest.mjs --appdaily <AppDaily.csv | download-json.txt> \
 *                   [--detail <Detail.csv>] \
 *                   [--config <clients.json>] [--client <key>] \
 *                   [--date YYYYMMDD] [--out <dir>]
 *
 * --appdaily accepts either a raw CSV, or the JSON blob saved by the Google Drive
 * connector's download_file_content (schema {content: <base64 csv>, ...}); the
 * engine auto-detects and decodes it, so the skill can hand the tool-result file
 * straight through.
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================ defaults ============================
// Overridable per client via clients.json (see references/clients.json).
const DEFAULTS = {
  currency: 'USD',
  // app-alerting-framework tiers, classified on trailing-30-day revenue.
  tiers: {
    T1: { label: 'Tier 1: Core',      min: 15000, dropPct: 10, window: 'Same-day' },
    T2: { label: 'Tier 2: Growth',    min: 3000,  dropPct: 20, window: 'Within 24h' },
    T3: { label: 'Tier 3: Stable',    min: 500,   dropPct: 30, window: 'Within 48h' },
    T4: { label: 'Tier 4: Long-Tail', min: 0,     dropPct: 40, window: 'Within 48h' },
  },
  // Noise floor: ignore % swings on apps below this daily revenue (README).
  revenueFloorDaily: 50,
  // A rise this large (any tier) is surfaced as positive context, not an alert.
  riseFlagPct: 25,
  // Trailing-window length for T7-vs-P7.
  trailingDays: 7,
  // Zero-revenue bidding partner scan (Detail): flag a source burning at least
  // this many requests for effectively no earnings.
  deadPartnerMinRequests: 50000,
  deadPartnerMaxEarnings: 1.0,
  // High-value geos whose fall-off signals a traffic/geo (UA) cause.
  highValueGeos: ['United States', 'United Kingdom', 'Australia', 'Canada'],
  // Flag when the share of impressions served restricted (non-personalized /
  // limited, i.e. consent/privacy) rises by at least this many points vs SDLW.
  privacyRestrictedRiseFlagPts: 5,
  // Whether to @mention the owning team in the digest. Off for v1 (Itay wants to
  // prove the digest before adding routing); the diagnosis still shows.
  mentionTeams: false,
  // AdMob app-title renames break a name-keyed join: the old title's history
  // stops and a "new" app with no baseline appears, which reads as a fake
  // -100%/dead-app drop on the old name. Map old title -> current title here
  // (set once per run() from cfg.appAliases) so both collapse into one series.
  appAliases: {},
  // Apps that always get the full country + format drill-down regardless of
  // whether they breached a tier threshold that day (e.g. a client's single
  // hero app on an otherwise small portfolio). Additive only: does not affect
  // L2 exception detection or the breach-only drill-down other apps still use.
  focusApps: [],
  // Dated, known pipeline events that distort one calendar day's numbers for a
  // reason unrelated to monetization or traffic (e.g. an AdMob reporting-
  // timezone change truncating that day to ~14 hours). The engine still
  // computes every number normally and never hides a real exception; it only
  // flags the target day (meta.knownEvent) and any comparison window whose
  // baseline lands on an event date (meta.comparisonEvents), so the digest is
  // annotated as a known artifact instead of diagnosed and alerted on as a
  // real decline. Each entry: { date: "YYYY-MM-DD", type, label, note }. A
  // null/missing date is inert, so a not-yet-scheduled event can be recorded
  // ahead of time and enabled later by filling in one field.
  knownDataEvents: [],
};

// Populated from cfg.appAliases at the top of run(); toRecords() consults it
// to rewrite the APP column before any grouping happens.
let APP_ALIASES = {};

// ============================ cli ============================
function parseArgs(argv) {
  const a = { out: null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--appdaily') a.appdaily = argv[++i];
    else if (k === '--detail') a.detail = argv[++i];
    else if (k === '--country') a.country = argv[++i];
    else if (k === '--source') a.source = argv[++i];
    else if (k === '--format') a.format = argv[++i];
    else if (k === '--privacy') a.privacy = argv[++i];
    else if (k === '--users') a.users = argv[++i];
    else if (k === '--config') a.config = argv[++i];
    else if (k === '--client') a.client = argv[++i];
    else if (k === '--date') a.date = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else throw new Error('Unknown arg: ' + k);
  }
  if (!a.appdaily) throw new Error('--appdaily is required');
  return a;
}

// ============================ io ============================
// Accept either a raw CSV file or the Drive download_file_content JSON blob
// ({content: <base64>}). Auto-detect and return CSV text.
function loadCsvText(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{')) {
    let j;
    try { j = JSON.parse(raw); } catch { return raw; } // not JSON after all
    if (j && typeof j.content === 'string') {
      // Drive CSV export delivers base64. Fall back to treating it as plain text.
      const looksB64 = /^[A-Za-z0-9+/=\r\n]+$/.test(j.content.slice(0, 200));
      return looksB64 ? Buffer.from(j.content, 'base64').toString('utf8') : j.content;
    }
  }
  return raw;
}

// Minimal RFC-4180 CSV parser (handles quoted fields, embedded commas/quotes).
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); field = ''; row = []; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toRecords(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rec = [];
  const appIdx = idx['APP'];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row.length || (row.length === 1 && row[0] === '')) continue;
    if (appIdx !== undefined && row[appIdx] != null) {
      const alias = APP_ALIASES[row[appIdx].trim()];
      if (alias) row[appIdx] = alias;
    }
    rec.push({ row, get: (k) => row[idx[k]] });
  }
  return { records: rec, idx, header };
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ============================ geo matching ============================
// The feed's COUNTRY dimension arrives as an ISO alpha-2 code ("US"), but
// cfg.highValueGeos is written in display names ("United States"), so a plain
// includes() never matched and the high-value share reported a confident 0%
// even on days the US was listed as a top mover. Match on either form.
const GEO_ALIASES = {
  'united states': 'US', 'usa': 'US', 'us': 'US',
  'united kingdom': 'GB', 'uk': 'GB', 'gb': 'GB', 'great britain': 'GB',
  'australia': 'AU', 'au': 'AU',
  'canada': 'CA', 'ca': 'CA',
  'germany': 'DE', 'de': 'DE',
  'japan': 'JP', 'jp': 'JP',
  'france': 'FR', 'fr': 'FR',
};
function geoKey(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const hit = GEO_ALIASES[s.toLowerCase()];
  if (hit) return hit;
  // Unknown two-letter values are already codes; anything longer is a name we
  // have no alias for, so compare case-insensitively on the name itself.
  return s.length === 2 ? s.toUpperCase() : s.toLowerCase();
}
function isHighValueGeo(name, cfg) {
  const target = geoKey(name);
  return (cfg.highValueGeos || []).some((g) => geoKey(g) === target);
}

// ============================ date helpers ============================
// Dates in the feed are yyyyMMdd strings. Work in that space to avoid TZ drift.
function ymdToDate(ymd) {
  const s = String(ymd);
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
}
function dateToYmd(d) {
  return d.getUTCFullYear().toString().padStart(4, '0')
    + (d.getUTCMonth() + 1).toString().padStart(2, '0')
    + d.getUTCDate().toString().padStart(2, '0');
}
function addDays(ymd, n) {
  const d = ymdToDate(ymd); d.setUTCDate(d.getUTCDate() + n); return dateToYmd(d);
}
function fmtYmd(ymd) {
  const s = String(ymd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ============================ aggregation ============================
// Aggregate raw metric components. eCPM and the rates are ALWAYS recomputed from
// summed components (never averaged), which is the only correct way to combine
// rows across duplicate app listings, ad sources, and countries.
function emptyAgg() {
  return { earnings: 0, impressions: 0, adRequests: 0, matchedRequests: 0, clicks: 0 };
}
function addRow(agg, r) {
  agg.earnings += num(r.get('ESTIMATED_EARNINGS'));
  agg.impressions += num(r.get('IMPRESSIONS'));
  agg.adRequests += num(r.get('AD_REQUESTS'));
  agg.matchedRequests += num(r.get('MATCHED_REQUESTS'));
  agg.clicks += num(r.get('IMPRESSION_CTR')) * num(r.get('IMPRESSIONS'));
  return agg;
}
function derive(agg) {
  const matchRate = agg.adRequests > 0 ? agg.matchedRequests / agg.adRequests : 0;
  const showRate = agg.matchedRequests > 0 ? agg.impressions / agg.matchedRequests : 0;
  const eCPM = agg.impressions > 0 ? (agg.earnings / agg.impressions) * 1000 : 0;
  const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;
  return { ...agg, matchRate, showRate, eCPM, ctr };
}

// Build per-app, per-day aggregates keyed by app name (collapses duplicate
// store listings that share a display label, e.g. iOS + Android).
function buildDaily(records) {
  const byApp = new Map(); // app -> Map(ymd -> agg)
  const dates = new Set();
  for (const r of records) {
    const ymd = String(r.get('DATE')).trim();
    const app = String(r.get('APP')).trim();
    if (!ymd || !app) continue;
    dates.add(ymd);
    if (!byApp.has(app)) byApp.set(app, new Map());
    const days = byApp.get(app);
    if (!days.has(ymd)) days.set(ymd, emptyAgg());
    addRow(days.get(ymd), r);
  }
  return { byApp, dates: [...dates].sort() };
}

function appAgg(byApp, app, ymd) {
  const days = byApp.get(app);
  const a = days && days.get(ymd);
  return a ? derive(a) : derive(emptyAgg());
}
function appWindow(byApp, app, ymdList) {
  const acc = emptyAgg();
  const days = byApp.get(app);
  if (days) for (const ymd of ymdList) { const a = days.get(ymd); if (a) { acc.earnings += a.earnings; acc.impressions += a.impressions; acc.adRequests += a.adRequests; acc.matchedRequests += a.matchedRequests; acc.clicks += a.clicks; } }
  return derive(acc);
}

// ============================ comparison + decomposition ============================
function pct(cur, prev) {
  if (prev === 0) return cur === 0 ? 0 : null; // null = undefined base (new/zeroed)
  return ((cur - prev) / prev) * 100;
}

// Multiplicative revenue decomposition:
//   earnings = adRequests * matchRate * showRate * (eCPM/1000)
// or, when DAU is available (GA4/Firebase), the fuller chain that separates
// traffic from engagement:
//   earnings = DAU * (adRequests/DAU) * matchRate * showRate * (eCPM/1000)
// Attribute the % move to each lever via log differences; the lever with the
// largest-magnitude contribution names the responsible layer.
const LABELS = {
  dau: 'Users (DAU)',
  reqPerDAU: 'Ad requests per user',
  adRequests: 'Ad requests (traffic)',
  matchRate: 'Match rate (fill)',
  showRate: 'Show rate (render)',
  eCPM: 'eCPM (price)',
};
function decompose(cur, prev) {
  const useUsers = cur.dau != null && prev.dau != null && cur.dau > 0 && prev.dau > 0;
  const levers = useUsers
    ? ['dau', 'reqPerDAU', 'matchRate', 'showRate', 'eCPM']
    : ['adRequests', 'matchRate', 'showRate', 'eCPM'];
  const labelFor = LABELS;
  // Guard against zeros: a lever that went to/from zero is a structural break.
  const anyZero = levers.some(k => cur[k] === 0 || prev[k] === 0);
  const parts = levers.map(k => {
    const c = cur[k], p = prev[k];
    let contribLn = null;
    if (c > 0 && p > 0) contribLn = Math.log(c / p);
    return { lever: k, label: labelFor[k], cur: c, prev: p, pct: pct(c, p), contribLn };
  });
  // Contribution share of the total move (approximate; sums to ~1 when no zeros).
  const totalLn = parts.reduce((s, x) => s + (x.contribLn ?? 0), 0);
  for (const p of parts) {
    p.share = (totalLn !== 0 && p.contribLn != null) ? p.contribLn / totalLn : null;
  }
  const ranked = [...parts].filter(p => p.contribLn != null)
    .sort((a, b) => Math.abs(b.contribLn) - Math.abs(a.contribLn));
  let primary = ranked[0] || null;
  // Two-level pick when users are present: first decide users (DAU) vs
  // revenue-per-user (ARPDAU = reqPerDAU x match x show x eCPM). Only if ARPDAU
  // is the bigger mover do we drill into which monetization lever. This keeps a
  // pure user drop from being mislabelled as a price move when the two offset.
  if (useUsers) {
    const dauPart = parts.find(p => p.lever === 'dau');
    const arpdauLn = ['reqPerDAU', 'matchRate', 'showRate', 'eCPM']
      .reduce((s, k) => s + (parts.find(p => p.lever === k)?.contribLn ?? 0), 0);
    if (dauPart && dauPart.contribLn != null && Math.abs(dauPart.contribLn) >= Math.abs(arpdauLn)) {
      primary = dauPart;
    } else {
      primary = [...parts].filter(p => ['reqPerDAU', 'matchRate', 'showRate', 'eCPM'].includes(p.lever) && p.contribLn != null)
        .sort((a, b) => Math.abs(b.contribLn) - Math.abs(a.contribLn))[0] || primary;
    }
  }
  return { parts, primary, anyZero, totalLn };
}

// Map the dominant lever to the app-alerting-framework diagnosis + team tag.
function diagnose(dec, cur, prev) {
  // Structural break: impressions or requests collapsed to (near) zero.
  if (cur.impressions === 0 || cur.adRequests === 0) {
    return { issue: 'Tech / Product', team: '@dev-team',
      evidence: cur.adRequests === 0 ? 'Ad requests = 0 (app not requesting ads)' : 'Impressions = 0 (ads requested but nothing rendered)' };
  }
  if (!dec.primary) {
    return { issue: 'Unclear', team: '(diagnose manually)', evidence: 'Insufficient data to attribute the move.' };
  }
  const k = dec.primary.lever;
  const dir = dec.primary.pct != null && dec.primary.pct < 0 ? 'down' : 'up';
  const pctLevers = new Set(['matchRate', 'showRate']);
  const fmtLever = (obj) => k === 'eCPM' ? `$${obj.eCPM.toFixed(2)}` : pctLevers.has(k) ? `${(obj[k] * 100).toFixed(1)}%` : Math.round(obj[k]).toLocaleString();
  const ev = `${dec.primary.label} ${dir} ${fmtLever(prev)} → ${fmtLever(cur)}`;
  switch (k) {
    case 'eCPM': return { issue: 'Monetization', team: '@xgrowth-monetization', evidence: ev + ' (price per impression). Check waterfall floors / bidding.' };
    case 'matchRate': return { issue: 'Monetization', team: '@xgrowth-monetization', evidence: ev + ' (fill). Check waterfall / ad-source demand.' };
    case 'showRate': return { issue: 'Tech / Product', team: '@dev-team', evidence: ev + ' (matched requests not rendering). Check SDK / placement.' };
    case 'adRequests': return { issue: 'Traffic / Geo', team: '@ua-team', evidence: ev + ' (traffic). Confirm geo mix in the country drill-down.' };
    case 'dau': return { issue: 'Traffic / Geo', team: '@ua-team', evidence: ev + ' (active users). A UA or retention move; confirm geo mix.' };
    case 'reqPerDAU': return { issue: 'Engagement / Product', team: '@product-team', evidence: ev + ' (ad requests per user). Same users, fewer ad opportunities; a product/engagement move.' };
    default: return { issue: 'Unclear', team: '(diagnose manually)', evidence: ev };
  }
}

// ============================ main ============================
function run() {
  const args = parseArgs(process.argv);
  let cfg = structuredClone(DEFAULTS);
  if (args.config && fs.existsSync(args.config)) {
    const raw = JSON.parse(fs.readFileSync(args.config, 'utf8'));
    const clientCfg = args.client ? (raw.clients?.[args.client] || {}) : (raw.defaults || raw);
    cfg = mergeCfg(cfg, raw.defaults || {}, clientCfg);
  }
  APP_ALIASES = cfg.appAliases || {};

  const appDailyText = loadCsvText(args.appdaily);
  const { records: appRecs } = toRecords(parseCsv(appDailyText));
  const { byApp, dates } = buildDaily(appRecs);
  if (!dates.length) throw new Error('No dated rows found in AppDaily input.');

  const target = args.date || dates[dates.length - 1];
  if (!dates.includes(target)) throw new Error(`Target date ${target} not present in feed (latest is ${dates[dates.length - 1]}).`);

  const prevDay = addDays(target, -1);
  const sdlw = addDays(target, -7);
  const yoy = addDays(target, -364); // weekday-aligned year-ago
  const t7 = Array.from({ length: cfg.trailingDays }, (_, i) => addDays(target, -i));
  const p7 = Array.from({ length: cfg.trailingDays }, (_, i) => addDays(target, -(i + cfg.trailingDays)));
  const last30 = Array.from({ length: 30 }, (_, i) => addDays(target, -i));

  const apps = [...byApp.keys()];

  // ---- known data-quality events (see references/clients.json "knownDataEvents") ----
  // A configured, dated event that distorts exactly one calendar day for a
  // reason having nothing to do with monetization or traffic. Every number
  // below is still computed normally; this only tags the target day and any
  // comparison window whose baseline falls on an event date, so SKILL.md can
  // tell Claude to annotate rather than diagnose or alert on it.
  const knownEvents = (cfg.knownDataEvents || []).filter((e) => e && e.date);
  const eventOn = (ymd) => knownEvents.find((e) => e.date.replace(/-/g, '') === ymd) || null;
  const knownEvent = eventOn(target);
  const comparisonEventsRaw = {
    dod: eventOn(prevDay),
    sdlw: eventOn(sdlw),
    yoy: dates.includes(yoy) ? eventOn(yoy) : null,
    wow: t7.map(eventOn).find(Boolean) || p7.map(eventOn).find(Boolean) || null,
  };
  const comparisonEvents = Object.values(comparisonEventsRaw).some(Boolean) ? comparisonEventsRaw : null;

  // ---- users (DAU/DAV) from GA4/Firebase, optional ----
  let users = null;
  if (args.users && fs.existsSync(args.users)) users = buildUsers(loadCsvText(args.users));

  // ---- tiering (trailing-30d revenue) ----
  const tierOf = {};
  const rev30 = {};
  for (const app of apps) {
    const w = appWindow(byApp, app, last30);
    rev30[app] = w.earnings;
    tierOf[app] = tierFor(cfg, w.earnings);
  }

  // ---- L0 portfolio ----
  const portTarget = portfolio(byApp, apps, [target]);
  const portPrev = portfolio(byApp, apps, [prevDay]);
  const portSdlw = portfolio(byApp, apps, [sdlw]);
  const portYoy = dates.includes(yoy) ? portfolio(byApp, apps, [yoy]) : null;
  const portT7 = portfolio(byApp, apps, t7);
  const portP7 = portfolio(byApp, apps, p7);

  const L0 = {
    date: fmtYmd(target),
    currency: cfg.currency,
    revenue: portTarget.earnings,
    dod: { pct: pct(portTarget.earnings, portPrev.earnings), prev: portPrev.earnings, prevDate: fmtYmd(prevDay) },
    sdlw: { pct: pct(portTarget.earnings, portSdlw.earnings), prev: portSdlw.earnings, prevDate: fmtYmd(sdlw) },
    yoy: portYoy ? { pct: pct(portTarget.earnings, portYoy.earnings), prev: portYoy.earnings, prevDate: fmtYmd(yoy) } : null,
    wow: { pct: pct(portT7.earnings, portP7.earnings), t7: portT7.earnings, p7: portP7.earnings },
    trend: trendWord(pct(portTarget.earnings, portSdlw.earnings)),
  };

  // ---- L1 traffic vs monetization (real DAU/DAV when the Users tab is present) ----
  const L1 = trafficVsMonetization(
    attachUsers(portTarget, users && portfolioUsers(users, apps, target)),
    attachUsers(portSdlw, users && portfolioUsers(users, apps, sdlw)),
  );

  // ---- L2 per-app exceptions ----
  const exceptions = [];
  for (const app of apps) {
    const cur = appAgg(byApp, app, target);
    const base = appAgg(byApp, app, sdlw);
    const t7a = appWindow(byApp, app, t7);
    const p7a = appWindow(byApp, app, p7);
    // Noise suppression: a % change only means something off a real prior base.
    // Gating on the "before" value (SDLW day and previous-7d) kills the tiny-base
    // explosions the README calls out (Bible +10,472%) while still surfacing a
    // genuine collapse from a real base down to ~$0.
    const meaningful = base.earnings >= cfg.revenueFloorDaily || p7a.earnings >= cfg.revenueFloorDaily * cfg.trailingDays;
    if (!meaningful) continue;

    const sdlwPct = pct(cur.earnings, base.earnings);
    const wowPct = pct(t7a.earnings, p7a.earnings);
    const tier = tierOf[app];
    const thr = cfg.tiers[tier].dropPct;

    const zeroed = cur.earnings === 0 && base.earnings >= cfg.revenueFloorDaily;
    const sdlwBreach = zeroed || (sdlwPct != null && sdlwPct <= -thr);
    const wowBreach = (wowPct != null && wowPct <= -thr);
    const dropBreached = sdlwBreach || wowBreach;
    // A rise must clear the flag on a real base, not a tiny one.
    const rise = !dropBreached && sdlwPct != null && sdlwPct >= cfg.riseFlagPct
      && base.earnings >= cfg.revenueFloorDaily;

    if (!dropBreached && !rise) continue;

    // Explain the comparison that actually fired. If both windows breached, take
    // the more severe; decompose that window's aggregates so the attribution
    // matches the alert instead of explaining an unrelated day.
    let win, curW, baseW, winPct;
    if (rise) {
      win = 'SDLW'; curW = cur; baseW = base; winPct = sdlwPct;
    } else if (sdlwBreach && (!wowBreach || (sdlwPct ?? 0) <= (wowPct ?? 0))) {
      win = 'SDLW'; curW = cur; baseW = base; winPct = zeroed ? sdlwPct : sdlwPct;
    } else {
      win = 'T7vsP7'; curW = t7a; baseW = p7a; winPct = wowPct;
    }
    // The DAU split is only well-defined day-over-day, so attach users on the
    // SDLW window; weekly-triggered drops stay on the ad-requests model.
    if (win === 'SDLW' && users) {
      curW = attachUsers(curW, usersFor(users, app, target));
      baseW = attachUsers(baseW, usersFor(users, app, sdlw));
    }

    const dec = decompose(curW, baseW);
    const diag = diagnose(dec, curW, baseW);
    exceptions.push({
      app, tier, tierLabel: cfg.tiers[tier].label, rev30: rev30[app],
      kind: dropBreached ? 'drop' : 'rise',
      zeroed,
      earnings: { cur: cur.earnings, sdlw: base.earnings, t7: t7a.earnings, p7: p7a.earnings },
      change: { sdlwPct, wowPct, threshold: thr, window: cfg.tiers[tier].window },
      trigger: { window: win, pct: winPct },
      metrics: metricSnap(curW, baseW),
      decomposition: dec,
      diagnosis: diag,
    });
  }
  // Rank: declines before rises, then by app size (biggest apps on top). Size is
  // max(yesterday, SDLW) so an app that collapsed to ~$0 still ranks by its real
  // scale instead of sinking to the bottom.
  const appSize = (e) => Math.max(e.earnings.cur || 0, e.earnings.sdlw || 0);
  exceptions.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'drop' ? -1 : 1;
    return appSize(b) - appSize(a);
  });

  // ---- All-apps matrix + multi-horizon trends (reference-dashboard format) ----
  // Primary comparison is Yesterday vs Same Day Last Week (weekend-robust), plus
  // trailing 7d vs previous 7d and trailing 30d vs previous 30d. Per app we also
  // carry the metric matrix (eCPM, impressions, match, show) vs SDLW.
  const prev30 = Array.from({ length: 30 }, (_, i) => addDays(target, -(i + 30)));
  const allApps = apps.map(app => {
    const cur = appAgg(byApp, app, target);
    const base = appAgg(byApp, app, sdlw);
    const t7e = appWindow(byApp, app, t7).earnings, p7e = appWindow(byApp, app, p7).earnings;
    const t30e = appWindow(byApp, app, last30).earnings, p30e = appWindow(byApp, app, prev30).earnings;
    // Per-app users (GA4), when the Users tab is present and this app mapped.
    const cu = users ? usersFor(users, app, target) : null;
    const bu = users ? usersFor(users, app, sdlw) : null;
    const arp = (earn, u, k) => (u && u[k] > 0) ? earn / u[k] : null;
    const arpdauCur = arp(cur.earnings, cu, 'dau'), arpdauBase = arp(base.earnings, bu, 'dau');
    const arpdavCur = arp(cur.earnings, cu, 'dav'), arpdavBase = arp(base.earnings, bu, 'dav');
    return {
      app, tier: tierOf[app],
      rev: cur.earnings, revSDLW: base.earnings, sdlwPct: pct(cur.earnings, base.earnings), sdlwDelta: cur.earnings - base.earnings,
      t7Pct: pct(t7e, p7e), t30Pct: pct(t30e, p30e), revT7: t7e,
      eCPMcur: cur.eCPM, eCPMPct: pct(cur.eCPM, base.eCPM),
      imprPct: pct(cur.impressions, base.impressions),
      matchPct: pct(cur.matchRate, base.matchRate),
      showPct: pct(cur.showRate, base.showRate),
      dauCur: cu ? cu.dau : null, dauPct: (cu && bu && bu.dau > 0) ? pct(cu.dau, bu.dau) : null,
      davCur: cu ? cu.dav : null, davPct: (cu && bu && bu.dav > 0) ? pct(cu.dav, bu.dav) : null,
      arpdauCur: arpdauCur, arpdauPct: (arpdauCur != null && arpdauBase != null) ? pct(arpdauCur, arpdauBase) : null,
      arpdavCur: arpdavCur, arpdavPct: (arpdavCur != null && arpdavBase != null) ? pct(arpdavCur, arpdavBase) : null,
    };
  }).filter(a =>
    // Only apps meaningfully above the daily noise floor make the all-apps table
    // (matches the footer's "$50/day noise floor" claim): at/above the floor
    // yesterday, or the same day last week, or on a trailing-7d average. This drops
    // dead/near-zero apps (e.g. dormant games padding the account) that otherwise
    // leaked in on a fractional SDLW value and showed absurd % swings off ~$0.
    a.rev >= cfg.revenueFloorDaily ||
    a.revSDLW >= cfg.revenueFloorDaily ||
    (a.revT7 / cfg.trailingDays) >= cfg.revenueFloorDaily
  ).sort((a, b) => b.rev - a.rev);
  const appsActive = allApps.filter(a => a.rev > 0).length;
  const appsGrowing = allApps.filter(a => a.sdlwPct != null && a.sdlwPct > 0).length;
  const topGrowth = allApps
    .filter(a => a.rev >= cfg.revenueFloorDaily && ((a.sdlwPct != null && a.sdlwPct >= cfg.riseFlagPct) || (a.t7Pct != null && a.t7Pct >= cfg.riseFlagPct)))
    .slice(0, 6);
  const portT30 = portfolio(byApp, apps, last30), portP30 = portfolio(byApp, apps, prev30);
  const report = {
    yestDate: fmtYmd(target), sdlwDate: fmtYmd(sdlw),
    revYest: portTarget.earnings, revSDLW: portSdlw.earnings, sdlwPct: pct(portTarget.earnings, portSdlw.earnings),
    t7: portT7.earnings, p7: portP7.earnings, t7Pct: pct(portT7.earnings, portP7.earnings),
    t30: portT30.earnings, p30: portP30.earnings, t30Pct: pct(portT30.earnings, portP30.earnings),
    appsGrowing, appsActive,
  };

  // ---- L3 / L4 drill-down (Detail, optional) ----
  let detail = null;
  const hasCountry = args.country && fs.existsSync(args.country);
  const hasSource = args.source && fs.existsSync(args.source);
  if (hasCountry || hasSource) {
    // Lean split feed (preferred): per-dimension Country/Source tabs, small enough
    // to carry backfilled history under the Drive download cap.
    detail = buildDetailFromLean(
      hasCountry ? loadCsvText(args.country) : null,
      hasSource ? loadCsvText(args.source) : null,
    );
  } else if (args.detail && fs.existsSync(args.detail)) {
    // Legacy cross-product Detail tab (JedyApps until it adopts the lean split).
    detail = buildDetail(loadCsvText(args.detail));
  }
  // Format is pulled as its own small tab (app x format), so it comes in
  // separately from Detail (which is app x ad-source x country).
  let formatData = null;
  if (args.format && fs.existsSync(args.format)) {
    formatData = buildFormatData(loadCsvText(args.format));
  }
  const drill = (detail || formatData) ? drillExceptions(detail, formatData, exceptions, target, sdlw, cfg) : null;
  const deadPartners = detail ? scanDeadPartners(detail, target, cfg) : null;

  // ---- focus-app drill (always-on, independent of breach) ----
  // Same per-app breakdown drillExceptions computes for a breached app, but run
  // unconditionally for cfg.focusApps so a client's hero app gets the country +
  // format picture every day, whether or not it tripped a tier threshold.
  // Single-hero clients get the full comparison set (SDLW / 7d / 30d / YoY) per
  // dimension, computed by summing the Detail (and Format) day maps over each
  // window; columns render a dash until each baseline window has history (Detail
  // only started accumulating recently, so most windows are empty at first).
  const drillWindows = { target: [target], sdlw: [sdlw], t7, p7, t30: last30, p30: prev30, yoy: [yoy] };
  const focusApps = (cfg.focusApps || []).filter(a => apps.includes(a));
  const focusDrill = focusApps.length ? focusApps.map(app => {
    const days = detail ? detail.map.get(app) : null;
    const cur = days ? days.get(target) : null;
    const base = days ? days.get(sdlw) : null;
    const fDays = formatData ? formatData.get(app) : null;
    const formats = shapeFormats_(fDays ? breakdownWindows(fDays, (d) => d, drillWindows) : null, cfg);
    if (!cur && !(formats && formats.length)) return { app, available: false };
    return {
      app,
      available: true,
      baseAvailable: !!base,
      countries: days ? breakdownWindows(days, (d) => d.byCountry, drillWindows) : null,
      sources: days ? breakdownWindows(days, (d) => d.bySource, drillWindows) : null,
      formats,
      countryAnalysis: (cur && base) ? countryContribution(cur.byCountry, base.byCountry, cfg) : null,
      highValueGeoShare: cur ? highValueShare(cur.byCountry, cfg) : 0,
    };
  }) : null;

  // ---- privacy / ad-serving lens (Network report SERVING_RESTRICTION) ----
  let privacy = null;
  if (args.privacy && fs.existsSync(args.privacy)) {
    privacy = privacyAnalysis(buildPrivacy(loadCsvText(args.privacy)), target, sdlw, exceptions, cfg);
  }

  // ---- next actions ----
  const nextActions = buildNextActions(exceptions, drill, deadPartners, cfg);

  // ---- per-app daily-revenue sparklines (trend, oldest -> newest) ----
  const SPARK_DAYS = 14;
  const sparkDates = Array.from({ length: SPARK_DAYS }, (_, i) => addDays(target, -(SPARK_DAYS - 1 - i)));
  const sparks = {};
  for (const app of apps) {
    sparks[app] = sparkDates.map((d) => Math.round(appWindow(byApp, app, [d]).earnings * 100) / 100);
  }

  const result = {
    meta: {
      generatedFor: cfg.displayName || args.client || 'Client', client: args.client || 'jedyapps',
      targetDate: fmtYmd(target), currency: cfg.currency,
      appsTracked: apps.length,
      comparisons: { dod: fmtYmd(prevDay), sdlw: fmtYmd(sdlw), yoy: dates.includes(yoy) ? fmtYmd(yoy) : null },
      detailAvailable: !!detail,
      formatAvailable: !!formatData,
      usersAvailable: !!users,
      tierCounts: tierCounts(tierOf),
      tiers: cfg.tiers,
      revenueFloorDaily: cfg.revenueFloorDaily,
      focusApps,
      knownEvent,
      comparisonEvents,
      engine: 'digest.mjs v1 (AdMob-only)',
    },
    L0, L1,
    privacy,
    L2: exceptions,
    L3: drill,
    focusDrill,
    deadPartners,
    nextActions,
    report, allApps, topGrowth, sparks,
  };
  result.meta.privacyAvailable = !!privacy;
  result.meta.sparkDays = SPARK_DAYS;

  // Per-app ad-source breakdown (Yesterday vs Same Day Last Week), for notable
  // drops and top-growth apps, when the Detail tab is present with SDLW history.
  if (detail) {
    const srcSDLW = (app) => {
      const days = detail.map.get(app);
      if (!days) return null;
      const cur = days.get(target), base = days.get(sdlw);
      if (!cur) return null;
      return breakdownForSrc(cur.bySource, base && base.bySource);
    };
    for (const e of exceptions) e.sourcesSDLW = srcSDLW(e.app);
    for (const g of topGrowth) g.sourcesSDLW = srcSDLW(g.app);
  }

  const outDir = args.out || process.cwd();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'digest.json'), JSON.stringify(result, null, 2));
  const md = renderMarkdown(result, cfg);
  fs.writeFileSync(path.join(outDir, 'digest.md'), md);
  fs.writeFileSync(path.join(outDir, 'report.html'), renderReportHtml(result, cfg));
  process.stdout.write(md + '\n');
  process.stderr.write(`\n[digest] wrote digest.json + digest.md to ${outDir}\n`);
}

// ============================ helpers ============================
function mergeCfg(base, ...overrides) {
  const out = structuredClone(base);
  for (const o of overrides) {
    for (const [k, v] of Object.entries(o || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...(out[k] || {}), ...v };
      else out[k] = v;
    }
  }
  return out;
}
function tierFor(cfg, rev30) {
  if (rev30 >= cfg.tiers.T1.min) return 'T1';
  if (rev30 >= cfg.tiers.T2.min) return 'T2';
  if (rev30 >= cfg.tiers.T3.min) return 'T3';
  return 'T4';
}
function tierCounts(tierOf) {
  const c = { T1: 0, T2: 0, T3: 0, T4: 0 };
  for (const t of Object.values(tierOf)) c[t]++;
  return c;
}
function portfolio(byApp, apps, ymdList) {
  const acc = emptyAgg();
  for (const app of apps) {
    const w = appWindow(byApp, app, ymdList);
    acc.earnings += w.earnings; acc.impressions += w.impressions;
    acc.adRequests += w.adRequests; acc.matchedRequests += w.matchedRequests; acc.clicks += w.clicks;
  }
  return derive(acc);
}
function trendWord(p) {
  if (p == null) return 'n/a';
  if (p <= -10) return 'down sharply';
  if (p < -2) return 'down';
  if (p < 2) return 'flat';
  if (p < 10) return 'up';
  return 'up sharply';
}
function trafficVsMonetization(cur, base) {
  const dec = decompose(cur, base);
  const ln = (lever) => dec.parts.find(p => p.lever === lever)?.contribLn ?? 0;
  const monetLn = ln('matchRate') + ln('showRate') + ln('eCPM');
  const usersAware = cur.dau != null && base.dau != null && cur.dau > 0 && base.dau > 0;
  const out = {
    revenuePct: pct(cur.earnings, base.earnings),
    usersAware,
    monetization: {
      eCPM: { cur: cur.eCPM, base: base.eCPM, pct: pct(cur.eCPM, base.eCPM) },
      matchRate: { cur: cur.matchRate, base: base.matchRate, pct: pct(cur.matchRate, base.matchRate) },
      showRate: { cur: cur.showRate, base: base.showRate, pct: pct(cur.showRate, base.showRate) },
      contribLn: monetLn,
    },
  };
  if (usersAware) {
    // Real traffic layer: users (DAU) vs engagement (requests/user) vs monetization.
    const usersLn = ln('dau'), engLn = ln('reqPerDAU');
    out.users = {
      dau: { cur: cur.dau, base: base.dau, pct: pct(cur.dau, base.dau), contribLn: usersLn },
      dav: { cur: cur.dav, base: base.dav, pct: pct(cur.dav, base.dav) },
      arpdau: { cur: cur.arpdau, base: base.arpdau, pct: pct(cur.arpdau, base.arpdau) },
      arpdav: { cur: cur.arpdav, base: base.arpdav, pct: pct(cur.arpdav, base.arpdav) },
      reqPerDAU: { cur: cur.reqPerDAU, base: base.reqPerDAU, pct: pct(cur.reqPerDAU, base.reqPerDAU), contribLn: engLn },
    };
    const buckets = [['users (DAU)', usersLn], ['engagement (ads/user)', engLn], ['monetization', monetLn]];
    buckets.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    out.verdict = buckets[0][0] + '-led';
  } else {
    const trafficLn = ln('adRequests');
    out.trafficProxy = { metric: 'ad requests', cur: cur.adRequests, base: base.adRequests, pct: pct(cur.adRequests, base.adRequests), contribLn: trafficLn };
    out.verdict = Math.abs(trafficLn) >= Math.abs(monetLn) ? 'traffic-led' : 'monetization-led';
    out.pendingGA4 = ['DAU', 'ARPDAU', 'ARPDAV'];
  }
  return out;
}
function metricSnap(cur, base) {
  const snap = {
    eCPM: { cur: cur.eCPM, base: base.eCPM, pct: pct(cur.eCPM, base.eCPM) },
    impressions: { cur: cur.impressions, base: base.impressions, pct: pct(cur.impressions, base.impressions) },
    adRequests: { cur: cur.adRequests, base: base.adRequests, pct: pct(cur.adRequests, base.adRequests) },
    matchRate: { cur: cur.matchRate, base: base.matchRate, pct: pct(cur.matchRate, base.matchRate) },
    showRate: { cur: cur.showRate, base: base.showRate, pct: pct(cur.showRate, base.showRate) },
  };
  if (cur.dau != null) {
    snap.dau = { cur: cur.dau, base: base.dau, pct: pct(cur.dau, base.dau) };
    snap.dav = { cur: cur.dav, base: base.dav, pct: pct(cur.dav, base.dav) };
    snap.reqPerDAU = { cur: cur.reqPerDAU, base: base.reqPerDAU, pct: pct(cur.reqPerDAU, base.reqPerDAU) };
    snap.arpdau = { cur: cur.arpdau, base: base.arpdau, pct: pct(cur.arpdau, base.arpdau) };
    snap.arpdav = { cur: cur.arpdav, base: base.arpdav, pct: pct(cur.arpdav, base.arpdav) };
  }
  return snap;
}
// Users tab (GA4/Firebase): DATE, APP, DAU, DAV. Attaches to an agg so the
// decomposition can separate users from engagement from monetization.
function buildUsers(text) {
  const { records } = toRecords(parseCsv(text));
  const map = new Map(); // app -> ymd -> { dau, dav }
  for (const r of records) {
    const ymd = String(r.get('DATE')).trim();
    const app = String(r.get('APP')).trim();
    if (!ymd || !app) continue;
    if (!map.has(app)) map.set(app, new Map());
    map.get(app).set(ymd, { dau: num(r.get('DAU')), dav: num(r.get('DAV')) });
  }
  return map;
}
function usersFor(users, app, ymd) {
  const days = users && users.get(app);
  return (days && days.get(ymd)) || null;
}
function attachUsers(agg, u) {
  if (!u || !(u.dau > 0)) return agg;
  return {
    ...agg, dau: u.dau, dav: u.dav,
    reqPerDAU: agg.adRequests / u.dau,
    arpdau: agg.earnings / u.dau,
    arpdav: u.dav > 0 ? agg.earnings / u.dav : 0,
  };
}
function portfolioUsers(users, apps, ymd) {
  let dau = 0, dav = 0, any = false;
  for (const app of apps) {
    const u = usersFor(users, app, ymd);
    if (u) { dau += u.dau; dav += u.dav; any = true; }
  }
  return any ? { dau, dav } : null;
}
// ---- Detail (L3/L4) ----
function buildDetail(text) {
  const { records, header } = toRecords(parseCsv(text));
  const hasFormat = header.includes('FORMAT');
  // app -> ymd -> {byCountry, bySource, byFormat}
  const map = new Map();
  const dates = new Set();
  for (const r of records) {
    const ymd = String(r.get('DATE')).trim();
    const app = String(r.get('APP')).trim();
    const src = String(r.get('AD_SOURCE') || '').trim() || '(unknown)';
    const country = String(r.get('COUNTRY') || '').trim() || '(unknown)';
    const format = hasFormat ? (String(r.get('FORMAT') || '').trim() || '(unknown)') : null;
    if (!ymd || !app) continue;
    dates.add(ymd);
    if (!map.has(app)) map.set(app, new Map());
    const days = map.get(app);
    if (!days.has(ymd)) days.set(ymd, { byCountry: new Map(), bySource: new Map(), byFormat: new Map() });
    const day = days.get(ymd);
    if (!day.byCountry.has(country)) day.byCountry.set(country, emptyAgg());
    if (!day.bySource.has(src)) day.bySource.set(src, emptyAgg());
    addRow(day.byCountry.get(country), r);
    addRow(day.bySource.get(src), r);
    if (hasFormat) {
      if (!day.byFormat.has(format)) day.byFormat.set(format, emptyAgg());
      addRow(day.byFormat.get(format), r);
    }
  }
  return { map, dates: [...dates].sort(), hasFormat };
}

// Build the same {map, dates} shape as buildDetail, but from two lean single-
// dimension tabs (Country: DATE,APP,COUNTRY / Source: DATE,APP,AD_SOURCE) instead
// of the app x ad-source x country cross-product. The engine only ever uses the
// per-country and per-source marginals (byCountry / bySource), never the joint
// distribution, so the cross-product is ~12x wasted volume; the lean tabs carry
// exactly what is used and are small enough to backfill history under the Drive
// download cap. Either or both texts may be null. byFormat stays empty (format has
// its own tab). Consumed identically by focusDrill, countryContribution,
// drillExceptions, and scanDeadPartners.
function buildDetailFromLean(countryText, sourceText) {
  const map = new Map();
  const dates = new Set();
  const ensureDay = (app, ymd) => {
    if (!map.has(app)) map.set(app, new Map());
    const days = map.get(app);
    if (!days.has(ymd)) days.set(ymd, { byCountry: new Map(), bySource: new Map(), byFormat: new Map() });
    return days.get(ymd);
  };
  const ingest = (text, dimCol, bucket, fallback) => {
    if (!text) return;
    const { records } = toRecords(parseCsv(text));
    for (const r of records) {
      const ymd = String(r.get('DATE')).trim();
      const app = String(r.get('APP')).trim();
      if (!ymd || !app) continue;
      const key = String(r.get(dimCol) || '').trim() || fallback;
      dates.add(ymd);
      const m = ensureDay(app, ymd)[bucket];
      if (!m.has(key)) m.set(key, emptyAgg());
      addRow(m.get(key), r);
    }
  };
  ingest(countryText, 'COUNTRY', 'byCountry', '(unknown)');
  ingest(sourceText, 'AD_SOURCE', 'bySource', '(unknown)');
  return { map, dates: [...dates].sort(), hasFormat: false };
}

// Country contribution: split an app's revenue and blended-eCPM move into a
// per-country volume-vs-price story, and the blended eCPM into mix (traffic
// shifting between countries) vs rate (price moving within countries). This is
// what tells UA where a high-eCPM geo like the US dragged the whole app down,
// and therefore where to move budget. Uses the COUNTRY dimension already in the
// feed, so no ingestion change is needed.
function countryContribution(curMap, baseMap, cfg) {
  const names = new Set([...(curMap ? curMap.keys() : []), ...(baseMap ? baseMap.keys() : [])]);
  const movers = [];
  let imprCurTot = 0, imprBaseTot = 0;
  const rows = [];
  for (const n of names) {
    const c = derive(curMap?.get(n) || emptyAgg());
    const b = derive(baseMap?.get(n) || emptyAgg());
    imprCurTot += c.impressions; imprBaseTot += b.impressions;
    rows.push({ n, c, b });
  }
  for (const { n, c, b } of rows) {
    const deltaRev = c.earnings - b.earnings;
    // Volume vs price split of this country's revenue move.
    const priceEffect = (c.impressions * (c.eCPM - b.eCPM)) / 1000;
    const volumeEffect = ((c.impressions - b.impressions) * b.eCPM) / 1000;
    movers.push({
      name: n, isHighValue: isHighValueGeo(n, cfg),
      revCur: c.earnings, revBase: b.earnings, delta: deltaRev,
      eCPMcur: c.eCPM, eCPMbase: b.eCPM, eCPMpct: pct(c.eCPM, b.eCPM),
      imprCur: c.impressions, imprBase: b.impressions, imprPct: pct(c.impressions, b.impressions),
      priceEffect, volumeEffect,
      led: Math.abs(priceEffect) >= Math.abs(volumeEffect) ? 'price' : 'volume',
    });
  }
  // Blended eCPM: rate effect (prices at current mix) + mix effect (mix shift at base prices).
  let rateEffect = 0, mixEffect = 0, eCPMcurBlend = 0, eCPMbaseBlend = 0;
  for (const { c, b } of rows) {
    const wCur = imprCurTot > 0 ? c.impressions / imprCurTot : 0;
    const wBase = imprBaseTot > 0 ? b.impressions / imprBaseTot : 0;
    eCPMcurBlend += wCur * c.eCPM;
    eCPMbaseBlend += wBase * b.eCPM;
    rateEffect += wCur * (c.eCPM - b.eCPM);
    mixEffect += (wCur - wBase) * b.eCPM;
  }
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    blendedECPM: {
      cur: eCPMcurBlend, base: eCPMbaseBlend, delta: eCPMcurBlend - eCPMbaseBlend,
      rateEffect, mixEffect,
      verdict: Math.abs(rateEffect) >= Math.abs(mixEffect) ? 'price (rate)' : 'traffic mix',
    },
    movers: movers.slice(0, 6),
  };
}
// Format is a separate small tab (app x format), parsed like Detail but with a
// single breakdown dimension.
function buildFormatData(text) {
  const { records } = toRecords(parseCsv(text));
  const map = new Map(); // app -> ymd -> Map(format -> agg)
  for (const r of records) {
    const ymd = String(r.get('DATE')).trim();
    const app = String(r.get('APP')).trim();
    const fmt = String(r.get('FORMAT') || '').trim() || '(unknown)';
    if (!ymd || !app) continue;
    if (!map.has(app)) map.set(app, new Map());
    const days = map.get(app);
    if (!days.has(ymd)) days.set(ymd, new Map());
    const day = days.get(ymd);
    if (!day.has(fmt)) day.set(fmt, emptyAgg());
    addRow(day.get(fmt), r);
  }
  return map;
}
// Shape the ad-format breakdown per client config:
//  - cfg.focusFormats: ordered allowlist of {match,label}. Keeps ONLY those formats
//    (exact, case-insensitive name match), in that order, relabelled. Everything else
//    (rewarded, "banner,interstitial", etc.) is dropped. Machapp uses this.
//  - else cfg.excludeFormats: drop matching formats (case-insensitive substring).
function shapeFormats_(rows, cfg) {
  if (!rows || !cfg) return rows;
  if (Array.isArray(cfg.focusFormats) && cfg.focusFormats.length) {
    const out = [];
    for (const spec of cfg.focusFormats) {
      const m = String(spec.match).toLowerCase();
      const hit = rows.find((f) => String(f.name).toLowerCase() === m);
      if (hit) out.push({ ...hit, name: spec.label || hit.name });
    }
    return out;
  }
  if (Array.isArray(cfg.excludeFormats) && cfg.excludeFormats.length) {
    const bad = cfg.excludeFormats.map((x) => String(x).toLowerCase());
    return rows.filter((f) => !bad.some((x) => String(f.name).toLowerCase().includes(x)));
  }
  return rows;
}

function drillExceptions(detail, formatData, exceptions, target, sdlw, cfg) {
  const out = [];
  for (const e of exceptions) {
    const days = detail ? detail.map.get(e.app) : null;
    const cur = days ? days.get(target) : null;
    const base = days ? days.get(sdlw) : null;
    // Format comes from its own tab.
    const fDays = formatData ? formatData.get(e.app) : null;
    const fCur = fDays ? fDays.get(target) : null;
    const fBase = fDays ? fDays.get(sdlw) : null;
    const formats = shapeFormats_(fCur ? breakdownFor(fCur, fBase) : null, cfg);

    if (!cur && !formats) { out.push({ app: e.app, available: false }); continue; }
    out.push({
      app: e.app,
      available: true,
      baseAvailable: !!base,
      countries: cur ? breakdownFor(cur.byCountry, base?.byCountry) : null,
      sources: cur ? breakdownFor(cur.bySource, base?.bySource) : null,
      formats,
      countryAnalysis: (cur && base) ? countryContribution(cur.byCountry, base.byCountry, cfg) : null,
      highValueGeoShare: cur ? highValueShare(cur.byCountry, cfg) : 0,
    });
  }
  return out;
}
function breakdownFor(curMap, baseMap, limit = 6) {
  const rows = [];
  const names = new Set([...(curMap ? curMap.keys() : []), ...(baseMap ? baseMap.keys() : [])]);
  for (const n of names) {
    const c = derive(curMap?.get(n) || emptyAgg());
    const b = derive(baseMap?.get(n) || emptyAgg());
    rows.push({ name: n, earnings: c.earnings, base: b.earnings, pct: pct(c.earnings, b.earnings), delta: c.earnings - b.earnings, eCPM: c.eCPM, adRequests: c.adRequests, matchRate: c.matchRate, showRate: c.showRate });
  }
  rows.sort((a, b) => b.earnings - a.earnings);
  return rows.slice(0, limit);
}
// Multi-window per-dimension breakdown for the single-hero focus drill. Sums the
// app's Detail (or Format) day-maps over each comparison window so every country /
// ad-source / format row carries its move vs SDLW, trailing 7d, trailing 30d, and
// YoY, not just yesterday-vs-SDLW. `pick(day)` selects the dimension Map from a day
// entry (d => d.byCountry, d => d.bySource, or d => d for the Format map, whose day
// entry IS the format Map). A window with no history yields pct=null, which the
// renderer shows as an em-free dash until the feed accumulates enough days.
function sumDimBy(daysMap, ymdList, pick) {
  const out = new Map();
  if (!daysMap || !ymdList) return out;
  for (const ymd of ymdList) {
    const day = daysMap.get(ymd);
    if (!day) continue;
    const dim = pick(day);
    if (!dim || typeof dim.entries !== 'function') continue;
    for (const [name, agg] of dim) {
      if (!out.has(name)) out.set(name, emptyAgg());
      const o = out.get(name);
      o.earnings += agg.earnings; o.impressions += agg.impressions;
      o.adRequests += agg.adRequests; o.matchedRequests += agg.matchedRequests; o.clicks += agg.clicks;
    }
  }
  return out;
}
function breakdownWindows(daysMap, pick, W, limit = 8) {
  const cur = sumDimBy(daysMap, W.target, pick);
  const sdlw = sumDimBy(daysMap, W.sdlw, pick);
  const t7 = sumDimBy(daysMap, W.t7, pick), p7 = sumDimBy(daysMap, W.p7, pick);
  const t30 = sumDimBy(daysMap, W.t30, pick), p30 = sumDimBy(daysMap, W.p30, pick);
  const yoy = sumDimBy(daysMap, W.yoy, pick);
  const e = (m, n) => (m.get(n)?.earnings) || 0;
  const names = new Set([...cur.keys(), ...sdlw.keys()]);
  const rows = [];
  for (const n of names) {
    const c = derive(cur.get(n) || emptyAgg());
    rows.push({
      name: n,
      earnings: c.earnings,
      base: e(sdlw, n),
      pct: pct(c.earnings, e(sdlw, n)),
      sdlwPct: pct(c.earnings, e(sdlw, n)),
      t7Pct: pct(e(t7, n), e(p7, n)),
      t30Pct: pct(e(t30, n), e(p30, n)),
      yoyPct: pct(c.earnings, e(yoy, n)),
      delta: c.earnings - e(sdlw, n),
      eCPM: c.eCPM, adRequests: c.adRequests, matchRate: c.matchRate, showRate: c.showRate,
    });
  }
  rows.sort((a, b) => b.earnings - a.earnings);
  return rows.slice(0, limit);
}
// Ad-source breakdown (Yesterday vs Same Day Last Week) with a plain "primary
// metric impacted" note, for the per-app tables in the report.
function breakdownForSrc(curMap, baseMap, limit = 6) {
  const rows = [];
  const names = new Set([...(curMap ? curMap.keys() : []), ...(baseMap ? baseMap.keys() : [])]);
  for (const n of names) {
    const c = derive(curMap?.get(n) || emptyAgg());
    const b = derive(baseMap?.get(n) || emptyAgg());
    rows.push({ name: n, cur: c.earnings, prev: b.earnings, delta: c.earnings - b.earnings, pct: pct(c.earnings, b.earnings), note: primaryMetricNote_(c, b) });
  }
  rows.sort((a, b) => b.cur - a.cur);
  return rows.slice(0, limit);
}
function primaryMetricNote_(c, p) {
  const cand = [
    { k: 'Impressions', pct: pct(c.impressions, p.impressions) },
    { k: 'eCPM', pct: pct(c.eCPM, p.eCPM) },
    { k: 'Match rate', pct: pct(c.matchRate, p.matchRate) },
  ].filter(x => x.pct != null);
  if (!cand.length) return '';
  cand.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const t = cand[0];
  return `${t.k} ${t.pct >= 0 ? '+' : ''}${t.pct.toFixed(1)}%`;
}
function highValueShare(curMap, cfg) {
  let total = 0, hv = 0;
  if (curMap) for (const [k, v] of curMap) { total += v.earnings; if (cfg.highValueGeos.includes(k)) hv += v.earnings; }
  return total > 0 ? hv / total : 0;
}
// ---- Privacy / ad-serving lens ----
// Consumes a Network-report pull with a SERVING_RESTRICTION dimension. Anything
// that is not the unrestricted mode counts as restricted (non-personalized /
// limited), which is the consent/privacy footprint that mechanically lowers eCPM.
function isRestricted(label) {
  const s = String(label || '').trim().toLowerCase();
  return !(s === '' || s === 'not restricted' || s === 'none' || s === 'no restriction' || s === 'unrestricted');
}
function buildPrivacy(text) {
  const { records } = toRecords(parseCsv(text));
  const byApp = new Map();     // app -> ymd -> { restricted: agg, unrestricted: agg }
  const portfolio = new Map(); // ymd -> { restricted: agg, unrestricted: agg }
  for (const r of records) {
    const ymd = String(r.get('DATE')).trim();
    const app = String(r.get('APP')).trim();
    if (!ymd || !app) continue;
    const bucket = isRestricted(r.get('SERVING_RESTRICTION')) ? 'restricted' : 'unrestricted';
    if (!byApp.has(app)) byApp.set(app, new Map());
    const days = byApp.get(app);
    if (!days.has(ymd)) days.set(ymd, { restricted: emptyAgg(), unrestricted: emptyAgg() });
    addRow(days.get(ymd)[bucket], r);
    if (!portfolio.has(ymd)) portfolio.set(ymd, { restricted: emptyAgg(), unrestricted: emptyAgg() });
    addRow(portfolio.get(ymd)[bucket], r);
  }
  return { byApp, portfolio };
}
function restrictedSnapshot(day) {
  if (!day) return null;
  const rest = derive(day.restricted), unr = derive(day.unrestricted);
  const totalImpr = rest.impressions + unr.impressions;
  return {
    restrictedShare: totalImpr > 0 ? rest.impressions / totalImpr : 0,
    restrictedECPM: rest.eCPM, unrestrictedECPM: unr.eCPM,
    restrictedImpr: rest.impressions, totalImpr,
  };
}
function privacyAnalysis(privacy, target, sdlw, exceptions, cfg) {
  const portCur = restrictedSnapshot(privacy.portfolio.get(target));
  const portBase = restrictedSnapshot(privacy.portfolio.get(sdlw));
  const perApp = [];
  const exceptionNames = new Set(exceptions.map(e => e.app));
  for (const [app, days] of privacy.byApp) {
    if (!exceptionNames.has(app)) continue;
    const cur = restrictedSnapshot(days.get(target));
    const base = restrictedSnapshot(days.get(sdlw));
    if (!cur) continue;
    const risePts = base ? (cur.restrictedShare - base.restrictedShare) * 100 : null;
    perApp.push({
      app,
      restrictedShare: cur.restrictedShare,
      baseRestrictedShare: base ? base.restrictedShare : null,
      risePts,
      restrictedECPM: cur.restrictedECPM, unrestrictedECPM: cur.unrestrictedECPM,
      flagged: risePts != null && risePts >= cfg.privacyRestrictedRiseFlagPts,
    });
  }
  perApp.sort((a, b) => (b.risePts ?? -999) - (a.risePts ?? -999));
  return {
    portfolio: {
      cur: portCur, base: portBase,
      risePts: (portCur && portBase) ? (portCur.restrictedShare - portBase.restrictedShare) * 100 : null,
    },
    perApp,
  };
}
function scanDeadPartners(detail, target, cfg) {
  const bySource = new Map();
  for (const [, days] of detail.map) {
    const day = days.get(target);
    if (!day) continue;
    for (const [src, agg] of day.bySource) {
      if (!bySource.has(src)) bySource.set(src, emptyAgg());
      const a = bySource.get(src);
      a.earnings += agg.earnings; a.adRequests += agg.adRequests; a.impressions += agg.impressions; a.matchedRequests += agg.matchedRequests;
    }
  }
  const dead = [];
  for (const [src, agg] of bySource) {
    if (agg.adRequests >= cfg.deadPartnerMinRequests && agg.earnings <= cfg.deadPartnerMaxEarnings) {
      dead.push({ source: src, adRequests: agg.adRequests, earnings: agg.earnings });
    }
  }
  dead.sort((a, b) => b.adRequests - a.adRequests);
  return dead;
}
function buildNextActions(exceptions, drill, deadPartners, cfg) {
  const actions = [];
  const drops = exceptions.filter(e => e.kind === 'drop');
  for (const e of drops.slice(0, 4)) {
    const winTxt = e.trigger.window === 'SDLW' ? 'vs SDLW' : 'over the week';
    actions.push({
      priority: e.tier === 'T1' ? 'high' : e.tier === 'T2' ? 'medium' : 'normal',
      team: e.diagnosis.team,
      app: e.app,
      ask: `${e.app} (${e.tierLabel}) ${e.zeroed ? 'went to $0' : `down ${fmtPct(e.trigger.pct)} ${winTxt}`}. ${e.diagnosis.issue} issue: ${e.diagnosis.evidence}`,
    });
  }
  if (deadPartners && deadPartners.length) {
    for (const d of deadPartners.slice(0, 2)) {
      actions.push({
        priority: 'normal', team: '@xgrowth-monetization', app: 'portfolio',
        ask: `${d.source} burned ${Math.round(d.adRequests).toLocaleString()} ad requests for $${d.earnings.toFixed(2)} yesterday. Remove or reconfigure this bidding partner.`,
      });
    }
  }
  return actions.slice(0, 5);
}

// ============================ markdown ============================
function fmtPct(p) { return p == null ? 'n/a' : `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`; }
function fmtUsd(n) { return `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function fmtUsd2(n) { return `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function renderMarkdown(r, cfg) {
  const L = [];
  L.push(`# ${r.meta.generatedFor} Monetization Digest · ${r.meta.targetDate}`);
  L.push('');
  L.push(`_${r.meta.appsTracked} apps tracked · ${r.meta.currency} · vs Same Day Last Week (${r.meta.comparisons.sdlw})` +
    (r.meta.detailAvailable ? ' · country/network drill-down included' : ' · country/network drill-down pending (Detail tab)') + '_');
  L.push('');

  // L0
  L.push('## L0 · Portfolio revenue');
  const y = r.L0.yoy ? `, YoY ${fmtPct(r.L0.yoy.pct)}` : '';
  L.push(`**${fmtUsd2(r.L0.revenue)}** yesterday · DoD ${fmtPct(r.L0.dod.pct)}, SDLW ${fmtPct(r.L0.sdlw.pct)}, WoW ${fmtPct(r.L0.wow.pct)}${y}. Trend: ${r.L0.trend}.`);
  L.push(`- vs yesterday (${r.L0.dod.prevDate}): ${fmtUsd2(r.L0.dod.prev)}`);
  L.push(`- vs same day last week (${r.L0.sdlw.prevDate}): ${fmtUsd2(r.L0.sdlw.prev)}`);
  L.push(`- trailing 7d ${fmtUsd(r.L0.wow.t7)} vs previous 7d ${fmtUsd(r.L0.wow.p7)}`);
  if (r.L0.yoy) L.push(`- vs last year (${r.L0.yoy.prevDate}): ${fmtUsd2(r.L0.yoy.prev)}`);
  L.push('');

  // L1
  L.push('## L1 · Traffic vs monetization');
  const l1 = r.L1;
  L.push(`Revenue move ${fmtPct(l1.revenuePct)} is **${l1.verdict}**.`);
  if (l1.usersAware) {
    const u = l1.users;
    L.push(`- Users (DAU): ${fmtPct(u.dau.pct)} (${Math.round(u.dau.base).toLocaleString()} → ${Math.round(u.dau.cur).toLocaleString()}); ad viewers (DAV): ${fmtPct(u.dav.pct)}`);
    L.push(`- Engagement (ad requests per user): ${fmtPct(u.reqPerDAU.pct)}`);
    L.push(`- Monetization: eCPM ${fmtPct(l1.monetization.eCPM.pct)} (${fmtUsd2(l1.monetization.eCPM.base)} → ${fmtUsd2(l1.monetization.eCPM.cur)}), match rate ${fmtPct(l1.monetization.matchRate.pct)}, show rate ${fmtPct(l1.monetization.showRate.pct)}`);
    L.push(`- ARPDAU ${fmtUsd2(u.arpdau.cur)} (${fmtPct(u.arpdau.pct)}), ARPDAV ${fmtUsd2(u.arpdav.cur)} (${fmtPct(u.arpdav.pct)})`);
  } else {
    L.push(`- Traffic (ad requests, DAU proxy): ${fmtPct(l1.trafficProxy.pct)} (${Math.round(l1.trafficProxy.base).toLocaleString()} → ${Math.round(l1.trafficProxy.cur).toLocaleString()})`);
    L.push(`- Monetization: eCPM ${fmtPct(l1.monetization.eCPM.pct)} (${fmtUsd2(l1.monetization.eCPM.base)} → ${fmtUsd2(l1.monetization.eCPM.cur)}), match rate ${fmtPct(l1.monetization.matchRate.pct)}, show rate ${fmtPct(l1.monetization.showRate.pct)}`);
    L.push(`- _DAU / ARPDAU / ARPDAV pending GA4. Ad requests stands in for traffic until then._`);
  }
  L.push('');

  // Privacy / ad-serving lens
  if (r.privacy && r.privacy.portfolio.cur) {
    const p = r.privacy.portfolio;
    L.push('## Privacy / ad serving');
    const riseTxt = p.risePts != null ? `, ${p.risePts >= 0 ? '+' : ''}${p.risePts.toFixed(1)} pts vs SDLW` : '';
    L.push(`${(p.cur.restrictedShare * 100).toFixed(1)}% of impressions served restricted (non-personalized / limited)${riseTxt}. Restricted eCPM ${fmtUsd2(p.cur.restrictedECPM)} vs unrestricted ${fmtUsd2(p.cur.unrestrictedECPM)}.`);
    const flagged = r.privacy.perApp.filter(a => a.flagged);
    if (flagged.length) {
      L.push(`Apps where restricted serving rose (consent/privacy likely pressuring eCPM): ` + flagged.map(a => `${a.app} +${a.risePts.toFixed(1)} pts (now ${(a.restrictedShare * 100).toFixed(0)}%)`).join('; ') + '.');
    }
    L.push('');
  }

  // L2
  const drops = r.L2.filter(e => e.kind === 'drop');
  const rises = r.L2.filter(e => e.kind === 'rise');
  L.push('## L2 · Per-app exceptions');
  if (!r.L2.length) {
    L.push('No app crossed its tier threshold above the ' + fmtUsd(cfg.revenueFloorDaily) + '/day floor. Portfolio quiet.');
  } else {
    if (drops.length) {
      L.push(`**Declines (${drops.length})** · breached tier threshold vs SDLW or T7-vs-P7:`);
      L.push('');
      const teamCol = cfg.mentionTeams ? ' Team |' : '';
      const teamSep = cfg.mentionTeams ? '---|' : '';
      L.push(`| App | Tier | Yesterday | vs SDLW | vs T7/P7 | Diagnosis |${teamCol}`);
      L.push(`|---|---|--:|--:|--:|---|${teamSep}`);
      for (const e of drops) {
        const teamCell = cfg.mentionTeams ? ` ${e.diagnosis.team} |` : '';
        L.push(`| ${e.app} | ${e.tier} | ${fmtUsd2(e.earnings.cur)} | ${e.zeroed ? '**$0**' : fmtPct(e.change.sdlwPct)} | ${fmtPct(e.change.wowPct)} | ${e.diagnosis.issue} |${teamCell}`);
      }
      L.push('');
    }
    if (rises.length) {
      L.push(`**Notable rises (${rises.length})**: ` + rises.map(e => `${e.app} ${fmtPct(e.change.sdlwPct)}`).join(', ') + '.');
      L.push('');
    }
  }

  // Main App Deep-Dive: always-on country + format drill for cfg.focusApps,
  // independent of whether that app is in the L2 exceptions above.
  if (r.focusDrill && r.focusDrill.length) {
    L.push('## Main App Deep-Dive');
    for (const d of r.focusDrill) {
      L.push('');
      L.push(`### ${d.app}`);
      if (!d.available) {
        L.push((r.meta.detailAvailable || r.meta.formatAvailable) ? '_No Detail/Format rows for this app on the target day._' : '_Country / format drill-down pending: Detail and Format tabs not supplied for this run._');
        continue;
      }
      if (d.countryAnalysis) {
        const ca = d.countryAnalysis;
        const be = ca.blendedECPM;
        L.push(`**Blended eCPM ${fmtUsd2(be.base)} → ${fmtUsd2(be.cur)}** split: price/rate ${be.rateEffect >= 0 ? '+' : ''}$${be.rateEffect.toFixed(2)}, traffic mix ${be.mixEffect >= 0 ? '+' : ''}$${be.mixEffect.toFixed(2)} → mostly **${be.verdict}**.`);
        const movers = ca.movers.filter(m => Math.abs(m.delta) >= 0.5).slice(0, 6);
        if (movers.length) {
          L.push(`**Country movers (revenue Δ, and why):**`);
          for (const m of movers) {
            const hv = m.isHighValue ? ' _(high-value geo)_' : '';
            const why = m.led === 'price'
              ? `eCPM ${fmtUsd2(m.eCPMbase)} → ${fmtUsd2(m.eCPMcur)} (${fmtPct(m.eCPMpct)})`
              : `impressions ${fmtPct(m.imprPct)}`;
            L.push(`- ${m.name}${hv}: ${m.delta >= 0 ? '+' : ''}${fmtUsd2(m.delta)} · ${m.led}-led, ${why}`);
          }
        }
        L.push(`_High-value geo (US/UK/AU/CA) share of revenue: ${(d.highValueGeoShare * 100).toFixed(0)}%._`);
      } else if (d.countries) {
        const topC = d.countries.filter(c => c.earnings > 0 || c.base > 0).slice(0, 6);
        if (topC.length) L.push(`**By country:** ` + topC.map(c => `${c.name} ${fmtUsd2(c.earnings)}`).join(' · ') + ` _(composition only; needs an SDLW day in Detail for the mix/rate split)_`);
      }
      if (d.formats) {
        const topF = d.formats.filter(f => f.earnings > 0 || f.base > 0).slice(0, 6);
        if (topF.length) L.push(`**By format:** ` + topF.map(f => `${f.name} ${fmtUsd2(f.earnings)}${f.base ? ` (${fmtPct(f.pct)})` : ''}`).join(' · '));
      }
    }
    L.push('');
  }

  // L3 / L4 per drop
  if (drops.length) {
    L.push('## L3 / L4 · Drill-down on declines');
    for (const e of drops) {
      L.push('');
      L.push(`### ${e.app} · ${e.tierLabel}`);
      const winLabel = e.trigger.window === 'SDLW' ? 'vs SDLW' : 'over trailing 7d vs previous 7d';
      const fromTo = e.trigger.window === 'SDLW'
        ? `${fmtUsd2(e.earnings.sdlw)} → ${fmtUsd2(e.earnings.cur)}`
        : `${fmtUsd(e.earnings.p7)} → ${fmtUsd(e.earnings.t7)}`;
      L.push(`${e.zeroed ? 'Revenue went to **$0**' : `Down **${fmtPct(e.trigger.pct)}** ${winLabel}`} (${fromTo}). Response window: ${e.change.window}.`);
      // L4 decomposition
      L.push(`**What moved (revenue decomposition):**`);
      for (const p of e.decomposition.parts) {
        const val = p.lever === 'eCPM' ? `${fmtUsd2(p.prev)} → ${fmtUsd2(p.cur)}`
          : (p.lever === 'matchRate' || p.lever === 'showRate') ? `${(p.prev * 100).toFixed(1)}% → ${(p.cur * 100).toFixed(1)}%`
          : p.lever === 'reqPerDAU' ? `${p.prev.toFixed(1)} → ${p.cur.toFixed(1)}`
          : `${Math.round(p.prev).toLocaleString()} → ${Math.round(p.cur).toLocaleString()}`;
        const share = p.share != null ? ` (${(p.share * 100).toFixed(0)}% of the move)` : '';
        const star = e.decomposition.primary && e.decomposition.primary.lever === p.lever ? ' (primary)' : '';
        L.push(`- ${p.label}: ${val} · ${fmtPct(p.pct)}${share}${star}`);
      }
      if (e.metrics.dau) {
        const m = e.metrics;
        L.push(`**Users:** DAU ${Math.round(m.dau.base).toLocaleString()} → ${Math.round(m.dau.cur).toLocaleString()} (${fmtPct(m.dau.pct)}), DAV ${fmtPct(m.dav.pct)}, ARPDAU ${fmtUsd2(m.arpdau.cur)} (${fmtPct(m.arpdau.pct)}), ARPDAV ${fmtUsd2(m.arpdav.cur)} (${fmtPct(m.arpdav.pct)}).`);
      }
      L.push(`**Diagnosis:** ${e.diagnosis.issue} · ${e.diagnosis.evidence}${cfg.mentionTeams ? ` Tag ${e.diagnosis.team}.` : ''}`);
      // Privacy cross-reference: rising restricted serving explains eCPM softness.
      const pa = r.privacy && r.privacy.perApp.find(x => x.app === e.app);
      if (pa && pa.flagged) {
        L.push(`**Privacy signal:** restricted (non-personalized/limited) serving rose +${pa.risePts.toFixed(1)} pts to ${(pa.restrictedShare * 100).toFixed(0)}% of impressions. Restricted eCPM ${fmtUsd2(pa.restrictedECPM)} vs unrestricted ${fmtUsd2(pa.unrestrictedECPM)} · a consent/privacy shift is part of the eCPM drop, not only the waterfall.`);
      }
      // L3 drill
      const d = r.L3 && r.L3.find(x => x.app === e.app);
      if (d && d.available) {
        // Country contribution: mix vs rate, and where the money actually moved.
        if (d.countryAnalysis) {
          const ca = d.countryAnalysis;
          const be = ca.blendedECPM;
          L.push(`**Blended eCPM ${fmtUsd2(be.base)} → ${fmtUsd2(be.cur)}** split: price/rate ${be.rateEffect >= 0 ? '+' : ''}$${be.rateEffect.toFixed(2)}, traffic mix ${be.mixEffect >= 0 ? '+' : ''}$${be.mixEffect.toFixed(2)} → mostly **${be.verdict}**.`);
          const movers = ca.movers.filter(m => Math.abs(m.delta) >= 0.5).slice(0, 5);
          if (movers.length) {
            L.push(`**Country movers (revenue Δ, and why):**`);
            for (const m of movers) {
              const hv = m.isHighValue ? ' _(high-value geo)_' : '';
              const why = m.led === 'price'
                ? `eCPM ${fmtUsd2(m.eCPMbase)} → ${fmtUsd2(m.eCPMcur)} (${fmtPct(m.eCPMpct)})`
                : `impressions ${fmtPct(m.imprPct)}`;
              L.push(`- ${m.name}${hv}: ${m.delta >= 0 ? '+' : ''}${fmtUsd2(m.delta)} · ${m.led}-led, ${why}`);
            }
          }
          L.push(`_High-value geo (US/UK/AU/CA) share of revenue: ${(d.highValueGeoShare * 100).toFixed(0)}%. UA: raise budget where price holds and impressions have room; pull back where eCPM is structurally down._`);
        } else if (d.countries) {
          const topC = d.countries.filter(c => c.earnings > 0 || c.base > 0).slice(0, 5);
          if (topC.length) L.push(`**By country:** ` + topC.map(c => `${c.name} ${fmtUsd2(c.earnings)}`).join(' · ') + ` _(composition only; needs an SDLW day in Detail for the mix/rate split)_`);
        }
        if (d.sources) {
          const topS = d.sources.filter(s => s.earnings > 0 || s.base > 0).slice(0, 6);
          if (topS.length) {
            L.push(`**By ad source:** ` + topS.map(s => `${s.name} ${fmtUsd2(s.earnings)}${s.base ? ` (${fmtPct(s.pct)})` : ''}`).join(' · '));
          }
        }
        if (d.formats) {
          const topF = d.formats.filter(f => f.earnings > 0 || f.base > 0).slice(0, 6);
          if (topF.length) L.push(`**By format:** ` + topF.map(f => `${f.name} ${fmtUsd2(f.earnings)}${f.base ? ` (${fmtPct(f.pct)})` : ''}`).join(' · '));
        }
      } else if (r.meta.detailAvailable) {
        L.push('_No Detail rows for this app on the target day._');
      } else {
        L.push('_Country / ad-source drill-down pending: Detail tab not supplied for this run._');
      }
    }
    L.push('');
  }

  // Dead partners
  if (r.deadPartners && r.deadPartners.length) {
    L.push('## Zero-revenue bidding partners (burning requests)');
    for (const d of r.deadPartners) L.push(`- ${d.source}: ${Math.round(d.adRequests).toLocaleString()} requests for ${fmtUsd2(d.earnings)}`);
    L.push('');
  }

  // Next actions
  L.push('## Proposed next actions');
  if (!r.nextActions.length) {
    L.push('- None. Nothing breached threshold today.');
  } else {
    r.nextActions.forEach((a, i) => L.push(`${i + 1}. ${cfg.mentionTeams ? `**${a.team}** · ` : ''}${a.ask}`));
  }
  L.push('');
  L.push(`---`);
  L.push(`_Draft for review. AdMob-only v1. Generated by ${r.meta.engine} from the ${r.meta.generatedFor} Monetization Feed. Estimated earnings can settle after the day closes._`);
  return L.join('\n');
}

// ============================ HTML report (reference format, for the Artifact) ============================
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function arrowPctHtml(p) {
  if (p == null) return '<span class="mut">n/a</span>';
  const cls = p >= 0 ? 'up' : 'down';
  const ar = p >= 0 ? '&#9650;' : '&#9660;';
  return `<span class="${cls}">${ar} ${p >= 0 ? '+' : ''}${p.toFixed(1)}%</span>`;
}
function usd0(n) { return `$${Math.round(n || 0).toLocaleString()}`; }
function severityFor0(a) {
  if (a.rev === 0) return 'Critical';
  const p = Math.min(a.sdlwPct ?? 0, a.t7Pct ?? 0);
  if (p <= -40) return 'Sharp drop';
  return 'Moderate drop';
}
function metricMatrixHtml(a) {
  // eCPM / impressions / match / show, all vs Same Day Last Week.
  const cell = (label, p) => `<div class="mm"><span class="mml">${label}</span> ${arrowPctHtml(p)}</div>`;
  return `<div class="mmrow">${cell('eCPM', a.eCPMPct)}${cell('Impr', a.imprPct)}${cell('Match', a.matchPct)}${cell('Show', a.showPct)}</div>`;
}
function appCardHtml(a, sources, kind, sdlwDate) {
  let src = '';
  if (sources && sources.length) {
    const rows = sources.filter(s => s.cur > 0 || s.prev > 0).map((s, i) => `
      <tr>
        <td class="l">${i === 0 ? '<b>' + esc(s.name) + '</b> &#9733;' : esc(s.name)}</td>
        <td>${fmtUsd2(s.cur)}</td><td>${fmtUsd2(s.prev)}</td>
        <td>${arrowPctHtml(s.pct)}</td>
        <td class="l mut">${esc(s.note)}</td>
      </tr>`).join('');
    src = `<table class="src"><thead><tr><th class="l">Ad source</th><th>Yest</th><th>SDLW</th><th>&#916;%</th><th class="l">Primary metric impacted</th></tr></thead><tbody>${rows}</tbody></table>`;
  } else {
    src = `<p class="pending">Ad-source breakdown appears once the Detail tab has same-day-last-week history.</p>`;
  }
  const chipCls = kind === 'drop' ? 'chip-down' : 'chip-up';
  const label = kind === 'drop' ? severityFor0(a) : 'Growth';
  return `<div class="appcard">
    <div class="apphead"><span class="appname">${esc(a.app)} <span class="tier">${a.tier}</span></span><span class="chip ${chipCls}">${label}</span></div>
    <div class="revrow">
      <div class="revcell"><div class="rl">Yesterday</div><div class="rv">${usd0(a.rev)}</div><div class="rd">${arrowPctHtml(a.sdlwPct)} vs SDLW</div></div>
      <div class="revcell"><div class="rl">Same day last week (${sdlwDate})</div><div class="rv">${usd0(a.revSDLW)}</div><div class="rd mut">baseline</div></div>
      <div class="revcell"><div class="rl">Trailing 7d vs prev 7d</div><div class="rv2">${arrowPctHtml(a.t7Pct)}</div></div>
      <div class="revcell"><div class="rl">Trailing 30d vs prev 30d</div><div class="rv2">${arrowPctHtml(a.t30Pct)}</div></div>
    </div>
    ${metricMatrixHtml(a)}
    ${src}
  </div>`;
}
function renderReportHtml(r, cfg) {
  const rep = r.report;
  const byAppAll = Object.fromEntries(r.allApps.map(a => [a.app, a]));
  const drops = r.L2.filter(e => e.kind === 'drop');
  const fallback = (e) => ({ app: e.app, tier: e.tier, rev: e.earnings.cur, revSDLW: e.earnings.sdlw, sdlwPct: e.change.sdlwPct, t7Pct: e.change.wowPct, t30Pct: null, eCPMPct: null, imprPct: null, matchPct: null, showPct: null });
  const dropCards = drops.map(e => appCardHtml(byAppAll[e.app] || fallback(e), e.sourcesSDLW, 'drop', rep.sdlwDate)).join('');
  const growthCards = (r.topGrowth || []).map(g => appCardHtml(g, g.sourcesSDLW, 'growth', rep.sdlwDate)).join('');
  const allRows = r.allApps.map(a => `<tr>
    <td class="l">${esc(a.app)}</td><td><span class="tier">${a.tier}</span></td>
    <td>${usd0(a.rev)}</td><td>${arrowPctHtml(a.sdlwPct)}</td>
    <td>${arrowPctHtml(a.t7Pct)}</td><td>${arrowPctHtml(a.t30Pct)}</td>
    <td>${arrowPctHtml(a.eCPMPct)}</td><td>${arrowPctHtml(a.imprPct)}</td>
    <td>${arrowPctHtml(a.matchPct)}</td><td>${arrowPctHtml(a.showPct)}</td></tr>`).join('');
  const actions = r.nextActions.map((a) => `<li>${esc(a.ask)}</li>`).join('');
  // Headline read: the pattern in one line, for a 5-second scan.
  const di = drops.map(e => e.diagnosis.issue);
  const nMon = di.filter(i => i.startsWith('Monetization')).length;
  const nTraf = di.filter(i => i.includes('Traffic')).length;
  const nTech = di.filter(i => i.includes('Tech')).length;
  const horizons = `Portfolio ${arrowPctHtml(rep.sdlwPct)} vs SDLW, ${arrowPctHtml(rep.t7Pct)} trailing 7d, ${arrowPctHtml(rep.t30Pct)} trailing 30d.`;
  let headline;
  if (!drops.length) headline = `${horizons} No app crossed its threshold. Quiet day.`;
  else if (nMon >= Math.max(nTraf, nTech) && nMon > 0) headline = `Price, not traffic. ${nMon} of ${drops.length} declines are eCPM (monetization)${nTraf ? `, ${nTraf} traffic` : ''}${nTech ? `, ${nTech} tech` : ''}. ${horizons}`;
  else headline = `${nTraf} traffic, ${nMon} price, ${nTech} tech among ${drops.length} declines. ${horizons}`;
  const dead = (r.deadPartners || []).length
    ? `<li>Zero-revenue bidding partners burning requests: ${r.deadPartners.map(d => `${esc(d.source)} (${Math.round(d.adRequests).toLocaleString()} requests, ${fmtUsd2(d.earnings)})`).join('; ')}. Consider deactivating or setting eCPM floors.</li>`
    : '';

  return `<style>
  :root{--bg:transparent;--card:#ffffff;--soft:#f5f5f2;--text:#1a1a18;--mut:#6b6b66;--bd:#e2e2dc;--up:#15803d;--upbg:#e9f5ec;--down:#b91c1c;--downbg:#fbeaea;--accent:#0c447c;--accentbg:#e6f1fb;}
  @media (prefers-color-scheme:dark){:root{--card:#1c1c1a;--soft:#232320;--text:#e8e8e3;--mut:#a0a099;--bd:#33332e;--up:#4ade80;--upbg:#12271a;--down:#f87171;--downbg:#2a1414;--accent:#7ab7f0;--accentbg:#0e2033;}}
  :root[data-theme="light"]{--card:#ffffff;--soft:#f5f5f2;--text:#1a1a18;--mut:#6b6b66;--bd:#e2e2dc;--up:#15803d;--upbg:#e9f5ec;--down:#b91c1c;--downbg:#fbeaea;--accent:#0c447c;--accentbg:#e6f1fb;}
  :root[data-theme="dark"]{--card:#1c1c1a;--soft:#232320;--text:#e8e8e3;--mut:#a0a099;--bd:#33332e;--up:#4ade80;--upbg:#12271a;--down:#f87171;--downbg:#2a1414;--accent:#7ab7f0;--accentbg:#0e2033;}
  *{box-sizing:border-box;}
  .wrap{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--text);max-width:1040px;margin:0 auto;padding:8px 4px 40px;line-height:1.5;}
  .up{color:var(--up);font-weight:600;} .down{color:var(--down);font-weight:600;} .mut{color:var(--mut);}
  h1{font-size:22px;margin:0 0 2px;font-weight:600;} .sub{color:var(--mut);font-size:13px;margin:0 0 20px;}
  h2{font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--mut);margin:28px 0 12px;border-bottom:1px solid var(--bd);padding-bottom:6px;}
  .ov{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;}
  .ovc{background:var(--soft);border-radius:12px;padding:14px 16px;} .ovl{font-size:12px;color:var(--mut);} .ovv{font-size:24px;font-weight:600;margin:2px 0;font-variant-numeric:tabular-nums;} .ovd{font-size:13px;}
  .takeaway{background:var(--accentbg);border-radius:12px;padding:14px 18px;margin:0 0 8px;font-size:16px;font-weight:500;line-height:1.5;}
  td{font-variant-numeric:tabular-nums;} .rv,.rv2{font-variant-numeric:tabular-nums;}
  .appcard{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:14px 16px;margin-bottom:12px;}
  .apphead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
  .appname{font-size:16px;font-weight:600;} .chip{font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;}
  .chip-down{color:var(--down);background:var(--downbg);} .chip-up{color:var(--up);background:var(--upbg);}
  .revrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:10px;}
  .revcell{background:var(--soft);border-radius:8px;padding:8px 10px;} .rl{font-size:11px;color:var(--mut);} .rv{font-size:18px;font-weight:600;} .rv2{font-size:16px;font-weight:600;margin-top:2px;}
  .mmrow{display:flex;flex-wrap:wrap;gap:8px 16px;margin-bottom:10px;font-size:13px;} .mm{white-space:nowrap;} .mml{color:var(--mut);}
  table{width:100%;border-collapse:collapse;font-size:13px;} th,td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--bd);white-space:nowrap;} th{color:var(--mut);font-weight:600;} td.l,th.l{text-align:left;white-space:normal;}
  .src{margin-top:4px;} .src th,.src td{font-size:12px;}
  .tier{font-size:11px;color:var(--mut);border:1px solid var(--bd);border-radius:999px;padding:0 7px;font-weight:400;}
  .allwrap{overflow-x:auto;} .pending{font-size:12px;color:var(--mut);font-style:italic;margin:4px 0 0;}
  ol{padding-left:20px;} li{margin:6px 0;} .foot{color:var(--mut);font-size:12px;margin-top:24px;border-top:1px solid var(--bd);padding-top:10px;}
  </style>
  <div class="wrap">
    <h1>${esc(r.meta.generatedFor)} monetization report</h1>
    <p class="sub">Yesterday (${rep.yestDate}) vs Same Day Last Week (${rep.sdlwDate}), plus trailing 7d and 30d trends. ${r.meta.detailAvailable ? 'Ad-source breakdown included.' : 'Ad-source breakdown pending the Detail tab.'}</p>

    <div class="takeaway">${headline}</div>

    <h2>Portfolio overview</h2>
    <div class="ov">
      <div class="ovc"><div class="ovl">Revenue yesterday (${rep.yestDate})</div><div class="ovv">${usd0(rep.revYest)}</div><div class="ovd">${arrowPctHtml(rep.sdlwPct)} vs SDLW</div></div>
      <div class="ovc"><div class="ovl">Same day last week (${rep.sdlwDate})</div><div class="ovv">${usd0(rep.revSDLW)}</div><div class="ovd mut">baseline</div></div>
      <div class="ovc"><div class="ovl">Trailing 7d vs prev 7d</div><div class="ovv">${arrowPctHtml(rep.t7Pct)}</div><div class="ovd mut">${usd0(rep.t7)} vs ${usd0(rep.p7)}</div></div>
      <div class="ovc"><div class="ovl">Trailing 30d vs prev 30d</div><div class="ovv">${arrowPctHtml(rep.t30Pct)}</div><div class="ovd mut">${usd0(rep.t30)} vs ${usd0(rep.p30)}</div></div>
      <div class="ovc"><div class="ovl">Apps growing vs SDLW</div><div class="ovv">${rep.appsGrowing} / ${rep.appsActive}</div><div class="ovd mut">active apps</div></div>
    </div>

    <h2>Apps with notable drops (${drops.length})</h2>
    ${dropCards || '<p class="pending">No app crossed its tier threshold.</p>'}

    <h2>Top performing apps</h2>
    ${growthCards || '<p class="pending">No standout growth.</p>'}

    <h2>All apps: yesterday vs same day last week</h2>
    <div class="allwrap"><table><thead><tr><th class="l">App</th><th>Tier</th><th>Rev (yest)</th><th>vs SDLW</th><th>7d</th><th>30d</th><th>eCPM</th><th>Impr</th><th>Match</th><th>Show</th></tr></thead><tbody>${allRows}</tbody></table></div>

    <h2>Proposed next actions</h2>
    <ol>${actions}${dead}</ol>

    <p class="foot">AdMob-only v1. All comparisons vs same day last week (weekend-robust) unless noted. Estimated earnings settle after the day closes. Rises green, drops red. DAV / ARPDAV need GA4 (parked). Country, format, and privacy drill-downs switch on as the new tabs build history.</p>
  </div>`;
}

run();
