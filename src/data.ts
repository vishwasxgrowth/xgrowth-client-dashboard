// @ts-nocheck
// Xgrowth Ops data layer — ported verbatim from the .dc.html (no runtime eval).
// Xgrowth Ops — data layer. Apps + AdMob-shaped metric generator + ClickUp snapshot.
export const TODAY = "2026-08-11";
export const MEMBERS = [
  { name: "Vishwas HD", initials: "VH", color: "#5B4BE8" },
  { name: "Nadiya Hassan", initials: "NH", color: "#0E9F6E" },
  { name: "Igor Aliev", initials: "IA", color: "#D9730D" },
  { name: "Dror Levi", initials: "DL", color: "#C2255C" },
];

export const APPS = [
  { id: "alt", name: "All Language Translator", cat: "Tools", tier: "Tier 1", store: "Google Play", dau: 412000, ecpm: 8.4, ipd: 11.2, mr: 0.947, ctr: 0.031, trend: -0.0042, note: "revenue drop" },
  { id: "gal", name: "Gallery, Photos & Videos", cat: "Photography", tier: "Tier 1", store: "Google Play", dau: 356000, ecpm: 9.1, ipd: 9.6, mr: 0.961, ctr: 0.028, trend: 0.0021 },
  { id: "npd", name: "Notepad, Notes, Voice & Diary", cat: "Productivity", tier: "Tier 1", store: "Google Play", dau: 208000, ecpm: 7.6, ipd: 8.1, mr: 0.938, ctr: 0.026, trend: 0.0009 },
  { id: "rst", name: "Restore My Old Deleted Photos", cat: "Tools", tier: "Tier 2", store: "Google Play", dau: 141000, ecpm: 11.2, ipd: 7.4, mr: 0.972, ctr: 0.034, trend: 0.0035 },
  { id: "zen", name: "Zenith", cat: "Lifestyle", tier: "Tier 2", store: "Google Play", dau: 96000, ecpm: 6.2, ipd: 6.8, mr: 0.881, ctr: 0.022, trend: 0.0064, note: "ecpm spike" },
  { id: "crv", name: "Curve Text on Photo", cat: "Photography", tier: "Tier 2", store: "Google Play", dau: 88000, ecpm: 5.9, ipd: 7.9, mr: 0.914, ctr: 0.024, trend: -0.0011 },
  { id: "ard", name: "AR Draw BTS Blackpink", cat: "Entertainment", tier: "Tier 2", store: "Google Play", dau: 74000, ecpm: 4.8, ipd: 10.4, mr: 0.803, ctr: 0.019, trend: -0.0088, note: "no meta" },
  { id: "wth", name: "Weather Forecast", cat: "Weather", tier: "Tier 2", store: "Google Play", dau: 63000, ecpm: 7.1, ipd: 5.2, mr: 0.926, ctr: 0.021, trend: 0.0014 },
  { id: "grw", name: "Grow Me", cat: "Health & Fitness", tier: "Tier 3", store: "Google Play", dau: 41000, ecpm: 5.4, ipd: 6.1, mr: 0.869, ctr: 0.018, trend: 0.0027 },
  { id: "agc", name: "Age Calculator", cat: "Tools", tier: "Tier 3", store: "Google Play", dau: 33000, ecpm: 4.1, ipd: 5.6, mr: 0.842, ctr: 0.017, trend: 0.0041 },
  { id: "drn", name: "Drone Remote Controller", cat: "Tools", tier: "Tier 3", store: "Google Play", dau: 27000, ecpm: 3.6, ipd: 6.9, mr: 0.788, ctr: 0.016, trend: -0.0035 },
  { id: "nrn", name: "Neurona", cat: "Education", tier: "Tier 3", store: "Google Play", dau: 19000, ecpm: 6.8, ipd: 4.4, mr: 0.905, ctr: 0.023, trend: 0.0102 },
];

export function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rand(seed) { let t = seed >>> 0; t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }

export const DOW = [0.93, 0.98, 1.0, 1.01, 1.04, 1.1, 1.05];
export const MS = 86400000;

export function dayKey(d) { return d.toISOString().slice(0, 10); }
export function parseDay(s) { return new Date(s + "T00:00:00Z"); }

/** Deterministic AdMob-shaped daily row for one app. */
export function dayRow(app, dateStr) {
  const d = parseDay(dateStr);
  const ageDays = Math.round((parseDay(TODAY) - d) / MS);
  const s = fnv(app.id + dateStr);
  const n1 = 0.94 + rand(s) * 0.12;
  const n2 = 0.95 + rand(s ^ 0x9e37) * 0.1;
  const n3 = 0.97 + rand(s ^ 0x51ed) * 0.06;
  const growth = Math.pow(1 + app.trend, Math.max(0, 90 - ageDays));
  let dau = app.dau * DOW[d.getUTCDay()] * growth * n1;
  let ecpm = app.ecpm * n2;
  if (app.note === "revenue drop" && ageDays <= 6) { dau *= 0.97; ecpm *= 0.72 + ageDays * 0.02; }
  if (app.note === "ecpm spike" && ageDays <= 4) ecpm *= 1.34;
  if (app.note === "no meta") ecpm *= 0.88;
  const impressions = Math.round(dau * app.ipd * n3);
  const matchRate = Math.min(0.995, app.mr * (0.985 + rand(s ^ 0x1234) * 0.03));
  const requests = Math.round(impressions / matchRate);
  const clicks = Math.round(impressions * app.ctr * (0.9 + rand(s ^ 0xabc) * 0.2));
  const revenue = (impressions / 1000) * ecpm;
  // Ad viewers (DAV): the subset of DAU that actually saw an ad that day, a
  // narrower and separate figure from DAU itself so ARPDAV != ARPDAU.
  const dav = Math.round(dau * (0.55 + rand(s ^ 0x2c9e) * 0.35));
  return { date: dateStr, dau: Math.round(dau), dav, impressions, requests, matched: Math.round(requests * matchRate), clicks, revenue, ecpm, matchRate, ctr: clicks / impressions, showRate: Math.min(0.99, 0.72 + rand(s ^ 0x777) * 0.22) };
}

/** Inclusive date list ending `endOffset` days before TODAY, `days` long. */
export function rangeDates(days, endOffset = 1) {
  const end = parseDay(TODAY).getTime() - endOffset * MS;
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(dayKey(new Date(end - i * MS)));
  return out;
}

export function aggregate(app, dates) {
  let revenue = 0, impressions = 0, requests = 0, matched = 0, clicks = 0, dau = 0, dav = 0, show = 0;
  const series = dates.map((ds) => {
    const r = dayRow(app, ds);
    revenue += r.revenue; impressions += r.impressions; requests += r.requests;
    matched += r.matched; clicks += r.clicks; dau += r.dau; dav += r.dav; show += r.showRate;
    return r;
  });
  const n = dates.length || 1;
  return {
    series, revenue, impressions, requests, matched, clicks,
    dau: dau / n,
    dav: dav / n,
    ecpm: impressions ? (revenue / impressions) * 1000 : 0,
    arpdau: dau ? revenue / dau : 0,
    arpdav: dav ? revenue / dav : 0,
    matchRate: requests ? matched / requests : 0,
    ctr: impressions ? clicks / impressions : 0,
    showRate: show / n,
  };
}

// ── ClickUp · JedyApps snapshot (folder 901210858217) ───────────────────────
export const T = (id, name, status, who, priority, due, tags, list, app) => ({ id, name, status, assignee: who, priority, due, tags, list, app });

export const TASKS = [
  T("869efu1ty", "Age Calculater", "to do", "Igor Aliev", null, null, [], "SDK Integration", "agc"),
  T("869efu1qh", "Drone Remote Controller", "to do", "Igor Aliev", null, null, [], "SDK Integration", "drn"),
  T("869efu1dh", "Weather Forecast", "to do", "Igor Aliev", null, null, [], "SDK Integration", "wth"),
  T("869eftrf3", "Investigate the issue", "development", "Igor Aliev", "urgent", "2026-08-07", [], "SDK Integration", "alt"),
  T("869eftqfg", "Free trial conversion rate issue", "development", "Igor Aliev", "urgent", "2026-08-07", [], "SDK Integration", "npd"),
  T("869eejheb", "Optimize Floors", "in progress", "Nadiya Hassan", "normal", "2026-08-04", ["adops"], "Mediation Setup", "gal"),
  T("869eejg8r", "Optimize Floors", "in progress", "Nadiya Hassan", "normal", "2026-08-04", ["adops"], "Mediation Setup", "rst"),
  T("869ee55cv", "Optimize Floors", "waiting", "Nadiya Hassan", null, "2026-08-08", [], "Mediation Setup", "crv"),
  T("869ee05np", "Optimize Floors", "waiting", "Nadiya Hassan", "normal", "2026-08-08", ["adops"], "Mediation Setup", "zen"),
  T("869edk1mm", "Optimize floors", "waiting", "Nadiya Hassan", "normal", "2026-08-08", ["adops"], "Mediation Setup", "wth"),
  T("869eddatv", "Optimize floors", "waiting", "Nadiya Hassan", "normal", "2026-08-08", [], "Mediation Setup", "grw"),
  T("869edffdz", "Verify Meta mapping for Native & Native_Banner for all apps", "to do", "Nadiya Hassan", null, null, [], "Mediation Setup", null),
  T("869ee1bmj", "Add Moloco", "complete", "Nadiya Hassan", null, null, [], "Mediation Setup", null),
  T("869edmkdm", "Ar draw bts blackpink", "mediation setup", "Nadiya Hassan", "high", "2026-08-04", ["no meta"], "App Portfolio", "ard"),
  T("869eacd3b", "Restore My Old Deleted Photos", "test", "Nadiya Hassan", null, null, [], "App Portfolio", "rst"),
  T("869e9tycp", "Notepad, Notes, Voice & Diary", "mediation setup", "Nadiya Hassan", "high", "2026-07-27", [], "App Portfolio", "npd"),
  T("869e9ty4k", "Age Calculator", "mediation setup", "Nadiya Hassan", "high", "2026-07-27", ["new"], "App Portfolio", "agc"),
  T("869e9txju", "Drone Remote Controller", "mediation setup", "Nadiya Hassan", "high", "2026-07-27", ["new", "no meta"], "App Portfolio", "drn"),
  T("869e9twta", "Zenith", "mediation setup", "Nadiya Hassan", "high", "2026-07-27", ["new", "no meta"], "App Portfolio", "zen"),
  T("869e9tw5x", "Neurona", "mediation setup", "Nadiya Hassan", "high", "2026-07-27", ["new", "no meta"], "App Portfolio", "nrn"),
  T("869e9tv5p", "Grow Me", "mediation setup", "Nadiya Hassan", "high", "2026-07-27", ["new", "no meta"], "App Portfolio", "grw"),
  T("869e9tt5e", "Curve Text on Photo", "mediation setup", "Nadiya Hassan", "high", "2026-07-27", ["new", "no meta"], "App Portfolio", "crv"),
  T("869e9trut", "Happy Mood", "mediation setup", "Nadiya Hassan", "normal", "2026-07-27", ["no meta"], "App Portfolio", null),
  T("869edkgcw", "Investigate the drop", "done", "Vishwas HD", "high", "2026-08-03", [], "Ongoing", "alt"),
  T("869edjnrn", "Investigate drop", "done", "Vishwas HD", "urgent", "2026-08-08", [], "Ongoing", "ard"),
  T("869ecxx74", "Policy Issue - Native ads too small for video", "waiting", "Vishwas HD", "high", "2026-08-08", [], "Ongoing", "gal"),
  T("869ecx1b2", "Investigate the performance", "waiting", "Vishwas HD", null, "2026-08-08", [], "Ongoing", "crv"),
  T("869eax715", "Investigate the drop after some specific date in this app", "done", "Vishwas HD", null, "2026-07-26", [], "Ongoing", "npd"),
  T("869eaw9qa", "Policy issue of consent coverage", "done", "Vishwas HD", null, null, [], "Ongoing", null),
  T("869eafkkq", "Investigate the overall performance about the drop", "done", "Vishwas HD", "urgent", "2026-07-25", ["performance"], "Ongoing", "alt"),
  T("869ead1t2", "Pangle Issue:", "blocked", "Nadiya Hassan", "urgent", null, [], "Ongoing", null),
  T("869ead182", "Meta Issue:", "blocked", "Nadiya Hassan", "urgent", null, [], "Ongoing", "ard"),
  T("869eabptx", "Create New Ad Units for PRD and Map them for All Language Translator", "in progress", "Nadiya Hassan", "urgent", "2026-07-23", ["adops"], "AdOps & Monetization", "alt"),
  T("869ea3xzp", "Analyse Tier 2 App and Set A/B tests for the Apps", "done", "Nadiya Hassan", "high", "2026-07-23", ["adops"], "AdOps & Monetization", null),
  T("869e9vhz2", "Create New Mediation groups for MREC - Gallery, Photos and Videos App", "done", "Nadiya Hassan", "high", "2026-07-25", ["mediation"], "AdOps & Monetization", "gal"),
  T("869e9vc5g", "Create Placements In Liftoff for the apps that were pending", "in progress", "Nadiya Hassan", "normal", "2026-07-27", ["adops"], "AdOps & Monetization", null),
  T("869e9rhkz", "Create New Mediation Groups for Native format - Gallery - Photo Gallery, Album", "done", "Nadiya Hassan", "high", "2026-07-25", ["mediation"], "AdOps & Monetization", "gal"),
  T("869eae2cj", "SDK integration (Init → 1.6.7). Rollout at 50% (Aug 2)", "rollout", "Igor Aliev", null, "2026-08-11", [], "SDK Integration", "gal"),
  T("869eadtgr", "SDK integration (Init → 1.6.8). Rollout at 50% (Aug 9)", "rollout", "Igor Aliev", null, "2026-08-14", [], "SDK Integration", "npd"),
  T("869e9mag4", "SDK upgrade (0.1.26 → 1.6.7). Rollout at 25% (Aug 9)", "rollout", "Igor Aliev", null, "2026-08-14", [], "SDK Integration", "rst"),
  T("869e9f9r8", "SDK re-integration (Init → 1.6.8). Rollout at 25% (Aug 9)", "rollout", "Igor Aliev", null, "2026-08-14", [], "SDK Integration", "crv"),
  T("869e9evww", "SDK integration (Init → 1.6.7). Rollout at 20% (July 21)", "rollout", "Igor Aliev", null, "2026-08-14", [], "SDK Integration", "zen"),
  T("869e9evr1", "SDK re-integration (Init → 1.6.7). Rollout at 15% (July 26)", "rollout", "Igor Aliev", null, "2026-08-14", [], "SDK Integration", "wth"),
  T("869e9evcc", "SDK upgrade (0.3.6 → 1.6.7). Rollout at 10% (July 15)", "rollout", "Igor Aliev", null, "2026-08-14", [], "SDK Integration", "grw"),
  T("869eae3k8", "Check performance after SDK upgrade", "rollout", "Igor Aliev", null, "2026-08-07", [], "SDK Integration", "alt"),
  T("869eaf29d", "SDK integration (Init → 1.x.x)", "prd preparation", "Igor Aliev", null, "2026-08-19", [], "SDK Integration", "nrn"),
  T("869eaf012", "SDK integration (Init → 1.x.x)", "prd preparation", "Igor Aliev", null, "2026-08-19", [], "SDK Integration", "agc"),
  T("869eaeyb5", "SDK integration (Init → 1.x.x)", "prd preparation", "Igor Aliev", null, "2026-08-19", [], "SDK Integration", "drn"),
  T("869eaf0aa", "Prepare a draft PRD and send to Dror for internal review", "prd preparation", "Igor Aliev", null, "2026-08-07", [], "SDK Integration", null),
  T("869eaeyu0", "Prepare a draft PRD and send to Dror for internal review", "prd preparation", "Igor Aliev", null, "2026-08-07", [], "SDK Integration", null),
  T("869eaep5g", "SDK integration (Init → 1.x.x)", "development", "Igor Aliev", null, null, [], "SDK Integration", "ard"),
  T("869e9k3e0", "SDK ads configuration adjustments", "development", "Igor Aliev", null, "2026-08-14", [], "SDK Integration", "gal"),
  T("869e9k3b5", "SDK integration (Init → 1.x.x)", "development", "Igor Aliev", null, "2026-08-19", [], "SDK Integration", "zen"),
  T("869e9k348", "SDK re-integration (Init → 1.8.x)", "development", "Igor Aliev", null, "2026-08-14", [], "SDK Integration", "npd"),
  T("869ea999w", "SDK integration by the dev team", "development", "Igor Aliev", null, "2026-08-10", [], "SDK Integration", "rst"),
  T("869e9qacd", "SDK re-integration by the dev team", "development", "Igor Aliev", null, "2026-08-09", [], "SDK Integration", "crv"),
  T("869ecr5r5", "PRD preparation", "to do", null, null, null, [], "SDK Integration", null),
  T("869ecr5m7", "align Rewarded with init version", "to do", "Igor Aliev", null, null, [], "SDK Integration", null),
  T("869eaf30r", "Check performance after SDK upgrade", "to do", "Igor Aliev", null, null, [], "SDK Integration", "grw"),
  T("869ea99cr", "Check performance after SDK integration", "to do", "Igor Aliev", null, "2026-08-14", [], "SDK Integration", "rst"),
  T("869ea2ywa", "Check performance after SDK re-integration", "to do", "Igor Aliev", null, "2026-08-11", [], "SDK Integration", "crv"),
  T("869ea2vrg", "Check performance after SDK upgrade", "to do", "Igor Aliev", null, "2026-08-07", [], "SDK Integration", "zen"),
  T("869e9qbpq", "Pre-rollout app review", "to do", "Igor Aliev", null, "2026-08-10", [], "SDK Integration", "npd"),
  T("869e9qb79", "Check performance after SDK re-integration", "to do", "Igor Aliev", null, "2026-08-11", [], "SDK Integration", "crv"),
  T("869ea33dg", "Check performance after SDK ads configuration adjustments", "to do", "Igor Aliev", null, "2026-08-10", [], "SDK Integration", "gal"),
  T("869ea33ap", "Pre-rollout app review", "to do", "Igor Aliev", null, "2026-08-07", [], "SDK Integration", "alt"),
];

export const X = (id, name, app, status, owner, start, end, hyp, progress, tags) => ({ id, name, app, status, owner, start, end, hypothesis: hyp, progress, tags, list: "Tests & Experiments" });

export const EXPERIMENTS = [
  X("869ed9t91", "Ad Size test", "gal", "live", "Vishwas HD", "2026-07-28", "2026-08-18", "Serving 300x250 MREC instead of 320x50 on the Home screen lifts banner eCPM without hurting session length.", 62, ["experiment"]),
  X("869ed9qcb", "Testing the fallback", "npd", "live", "Vishwas HD", "2026-08-01", "2026-08-15", "Adding a house-ad fallback when no fill is returned recovers a share of lost impressions.", 71, ["experiment"]),
  X("869eb8m5n", "Interstitial & App_open as fallback test", "alt", "live", "Vishwas HD", "2026-07-24", "2026-08-14", "Using App Open as an interstitial fallback raises impressions/DAU with a neutral effect on D1 retention.", 84, ["experiment"]),
  X("869eb8jcz", "Interstitial & App_open as fallback test", "rst", "live", "Vishwas HD", "2026-07-30", "2026-08-20", "Same fallback chain applied to a Tier 2 app reproduces the Tier 1 lift.", 55, ["experiment"]),
  X("869eb8e6v", "Interstitial & App_open as fallback test", "zen", "live", "Vishwas HD", "2026-08-03", "2026-08-24", "Fallback chain on a low-fill app closes the match-rate gap.", 38, ["experiment"]),
  X("869eb82xz", "Ad size test", "crv", "live", "Vishwas HD", "2026-08-05", "2026-08-26", "Adaptive banners outperform fixed 320x50 on tall-screen devices.", 27, ["experiment"]),
  X("869eb7xwh", "Interstitial & app_open as fallback test", "wth", "live", "Vishwas HD", "2026-08-06", "2026-08-27", "Fallback ordering matters more than capping for App Open revenue.", 22, ["experiment"]),
  X("869eb7cf7", "Interstitial & App_open as fallback test", "grw", "live", "Vishwas HD", "2026-08-08", "2026-08-29", "Low-DAU apps see a proportionally larger lift from fallback chains.", 14, ["experiment"]),
  X("869eacdyp", "Adding Extra 5 OPMC Line Items For Interstitial And Native", "gal", "completed", "Nadiya Hassan", "2026-07-12", "2026-08-02", "Five extra OPMC line items increase auction pressure and lift interstitial eCPM.", 100, ["experiment"]),
  X("869eaccyw", "Adding Extra 5 OPMC Line Items For Interstitial And App Open", "alt", "completed", "Nadiya Hassan", "2026-07-12", "2026-08-02", "Extra OPMC line items on App Open lift eCPM without reducing fill.", 100, ["experiment"]),
  X("869eden8e", "Ad Format Test", "ard", "blocked", "Vishwas HD", "2026-08-04", "2026-08-25", "Replacing banner with native on the result screen improves CTR. Blocked on Meta mapping.", 8, []),
  X("869eapfxk", "key value testing", "npd", "blocked", "Vishwas HD", "2026-07-29", "2026-08-19", "Key-value targeting lets us route premium demand to high-LTV cohorts.", 12, ["test"]),
  X("869eapfp5", "Key Values testing", "gal", "blocked", "Vishwas HD", "2026-07-29", "2026-08-19", "Key-value targeting works alongside bidding without cannibalising the waterfall.", 12, ["test"]),
  X("869edae6d", "Interstitial & App_open as fallback test", "nrn", "to do", "Vishwas HD", "2026-08-12", "2026-09-02", "Fallback chain generalises to Education-category inventory.", 0, ["experiment"]),
  X("869edace5", "Ad Size Test", "agc", "to do", "Vishwas HD", "2026-08-12", "2026-09-02", "Larger banner sizes lift eCPM on Tier 3 utility apps.", 0, ["experiment"]),
  X("869eda6d7", "Interstitial & App_open as fallback test", "drn", "to do", "Vishwas HD", "2026-08-13", "2026-09-03", "Fallback chain recovers fill on low match-rate inventory.", 0, ["experiment"]),
  X("869eda1hy", "Ad Format Test", "wth", "to do", "Vishwas HD", "2026-08-13", "2026-09-03", "Native placement on the forecast screen beats a bottom banner on RPM.", 0, ["experiment"]),
  X("869ecxmy4", 'Layout type 11 for the "Download" popup', "crv", "to do", "Igor Aliev", "2026-08-14", "2026-09-04", "Layout 11 increases download-popup conversion without extra ad load.", 0, []),
  X("869ecwwhq", '"navigation_block_policy" for First_Standard_Fullscreen', "alt", "to do", "Igor Aliev", "2026-08-14", "2026-09-04", "Blocking navigation during the first fullscreen reduces accidental dismissals.", 0, []),
  X("869ecwmxd", 'Native as a fallback for bottom banner on the "Home" screen', "gal", "to do", "Igor Aliev", "2026-08-17", "2026-09-07", "Native fallback fills banner gaps at a higher RPM.", 0, []),
  X("869ecu2vn", 'Refresh interval for ad placement on the "Aftercall" screen', "npd", "to do", "Igor Aliev", "2026-08-17", "2026-09-07", "A 30s refresh beats 45s on aftercall RPM with acceptable CTR decay.", 0, []),
  X("869ecu2hu", 'Capping time for App Open on the "Aftercall" screen', "npd", "to do", "Igor Aliev", "2026-08-18", "2026-09-08", "Reducing App Open capping increases impressions/DAU with neutral retention.", 0, []),
  X("869ecu1zu", '"navigation_block_timeout" duration test', "rst", "to do", "Igor Aliev", "2026-08-18", "2026-09-08", "A shorter block timeout preserves revenue while improving UX scores.", 0, []),
];

/** Synthetic variant read-out for a completed/live experiment. */
export function experimentResults(x) {
  const s = fnv(x.id);
  const lift = (rand(s) * 18 - 4);
  const base = { ecpm: 5 + rand(s ^ 1) * 6, imp: 6 + rand(s ^ 2) * 6, rpm: 20 + rand(s ^ 3) * 30 };
  const conf = 68 + rand(s ^ 9) * 31;
  return {
    lift, conf,
    rows: [
      { metric: "eCPM", ctrl: base.ecpm, vari: base.ecpm * (1 + lift / 100), unit: "$" },
      { metric: "Impressions / DAU", ctrl: base.imp, vari: base.imp * (1 + lift / 180), unit: "" },
      { metric: "ARPDAU", ctrl: base.rpm / 1000, vari: (base.rpm / 1000) * (1 + lift / 90), unit: "$" },
      { metric: "Match rate", ctrl: 0.82 + rand(s ^ 4) * 0.14, vari: 0.82 + rand(s ^ 5) * 0.16, unit: "%" },
      { metric: "D1 retention", ctrl: 0.28 + rand(s ^ 6) * 0.1, vari: 0.28 + rand(s ^ 7) * 0.1, unit: "%" },
    ],
  };
}
