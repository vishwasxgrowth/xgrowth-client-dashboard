// @ts-nocheck
// Parse a ClickUp test task description into arms (Baseline + variants),
// validate each arm's JSON, extract ad units, and (given an ad-unit metrics map)
// compute per-ad-unit rows + arm subtotals and Baseline-vs-variant deltas.

// Pull balanced { ... } JSON objects out of free text.
function extractJsonBlocks(text) {
  const blocks = []; let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && start >= 0) { blocks.push(text.slice(start, i + 1)); start = -1; } }
  }
  return blocks;
}

// Label arms from the surrounding text: "Baseline", "Variant 1: 30secs", etc.
function labelFor(text, idx, block) {
  const before = text.slice(0, text.indexOf(block));
  const labels = before.match(/(baseline|variant\s*\d+[^\n{]*|control[^\n{]*)/gi) || [];
  const last = labels.length ? labels[labels.length - 1].trim() : null;
  if (last) return last.replace(/\s+/g, " ");
  return idx === 0 ? "Baseline" : "Variant " + idx;
}

export function parseArms(description) {
  const text = description || "";
  const blocks = extractJsonBlocks(text);
  const arms = blocks.map((b, i) => {
    let parsed = null, error = null;
    try { parsed = JSON.parse(b); }
    catch (e) { error = String(e.message || e).replace(/^JSON.parse: /, ""); }
    const label = labelFor(text, i, b);
    const isBaseline = /base|control/i.test(label) || i === 0;
    const adUnits = [];
    if (parsed && Array.isArray(parsed.waterfalls)) for (const w of parsed.waterfalls) if (w && w.ad_unit) adUnits.push(String(w.ad_unit));
    return { label, isBaseline, raw: b, json: parsed, error, adUnits, refreshRate: parsed?.refresh_rate ?? null, adSize: parsed?.ad_size ?? null, layout: parsed?.layout ?? null };
  });
  // exactly one baseline: first baseline stays, rest become variants
  let seen = false;
  for (const a of arms) { if (a.isBaseline && !seen) seen = true; else a.isBaseline = false; }
  if (!arms.some((a) => a.isBaseline) && arms.length) arms[0].isBaseline = true;
  return arms;
}

const zero = () => ({ revenue: 0, impressions: 0, requests: 0, matched: 0, clicks: 0 });
function subtotal(units) {
  const s = zero(); for (const u of units) { s.revenue += u.revenue; s.impressions += u.impressions; s.requests += u.requests; s.matched += u.matched; s.clicks += u.clicks; }
  return { ...s, ecpm: s.impressions ? (s.revenue / s.impressions) * 1000 : 0, matchRate: s.requests ? s.matched / s.requests : 0, ctr: s.impressions ? s.clicks / s.impressions : 0, showRate: s.matched ? s.impressions / s.matched : 0, erpm: s.requests ? (s.revenue / s.requests) * 1000 : 0, rpi: s.impressions ? s.revenue / s.impressions : 0, rpc: s.clicks ? s.revenue / s.clicks : 0 };
}
// Build per-ad-unit rows + subtotal for an arm, from an ad-unit metrics map.
export function armMetrics(arm, unitMap) {
  const units = arm.adUnits.map((au) => { const tail = String(au).split("/").pop(); const m = unitMap[au] || unitMap[tail]; return { adUnit: au, found: !!m, ...(m ? { revenue: m.revenue, impressions: m.impressions, requests: m.requests, matched: m.matched, clicks: m.clicks, ecpm: m.ecpm } : zero()) }; });
  return { units, total: subtotal(units) };
}
