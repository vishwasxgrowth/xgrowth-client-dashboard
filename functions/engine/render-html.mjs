#!/usr/bin/env node
/**
 * Monetization Decline Digest · HTML renderer
 *
 * Turns the engine's digest.json into the full colour-coded L0-L4 Artifact page
 * (the layout Itay locked 12 Jul, extended 13 Jul with the all-apps table, top
 * performers, and notable-drops cards). Deterministic: no model needed to build
 * the page, so the daily run just executes this.
 *
 * Usage:
 *   node render-html.mjs --json <digest.json> --out <page.html>
 *
 * Emits body-level HTML (no <html>/<head>); the Artifact wrapper adds those.
 * Node >= 18, standard library only.
 */

import fs from 'node:fs';

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--json') a.json = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else throw new Error('Unknown arg: ' + argv[i]);
  }
  if (!a.json) throw new Error('--json is required');
  return a;
}

// ---------- formatting helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nil = (n) => n == null || Number.isNaN(n);
const usd0 = (n) => (nil(n) ? 'n/a' : '$' + Math.round(n).toLocaleString('en-US'));
const usd2 = (n) => (nil(n) ? 'n/a' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dir = (n) => (n >= 0 ? 'up' : 'down');
const arrow = (n) => (n >= 0 ? '▲' : '▼');
// pct span with arrow, sign, colour class. Null (no prior-period history) renders neutral.
function pct(n, digits = 1) {
  if (nil(n)) return `<span class="flat num">n/a</span>`;
  const sign = n >= 0 ? '+' : '';
  return `<span class="${dir(n)} num">${arrow(n)} ${sign}${n.toFixed(digits)}%</span>`;
}
function metricChip(label, n) {
  return `<span class="mchip"><span class="mk">${label}</span> ${pct(n)}</span>`;
}
const usd3 = (n) => (nil(n) ? 'n/a' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const spct = (p) => (nil(p) ? 'n/a' : `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`);
const updown = (p) => (nil(p) ? 'flat' : (p < 0 ? 'down' : 'up') + ' ' + Math.abs(p).toFixed(1) + '%');
// Inline SVG sparkline of a daily-revenue series (oldest -> newest). Colour by
// overall direction (last vs first) so the line reinforces the report's up/down
// language. Uses currentColor via a class so CSS variables resolve reliably.
function sparkline(series, w = 132, h = 30) {
  if (!Array.isArray(series) || series.length < 2) return '';
  const pad = 3;
  const min = Math.min(...series), max = Math.max(...series);
  const range = (max - min) || 1;
  const n = series.length;
  const x = (i) => pad + (i * (w - 2 * pad)) / (n - 1);
  const y = (v) => h - pad - ((v - min) / range) * (h - 2 * pad);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = 'M' + pts.join(' L');
  const area = `M${x(0).toFixed(1)},${(h - pad).toFixed(1)} L` + pts.join(' L') + ` L${x(n - 1).toFixed(1)},${(h - pad).toFixed(1)} Z`;
  const up = series[n - 1] >= series[0];
  const lx = x(n - 1).toFixed(1), ly = y(series[n - 1]).toFixed(1);
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${area}"/><path class="line" d="${line}"/><circle cx="${lx}" cy="${ly}" r="2"/></svg>`;
}

// ---------- section builders ----------
// The JedyApps two-tone wordmark is bespoke brand markup, not a generic pattern.
// Any other client falls back to its plain display name (client.displayName /
// meta.generatedFor) in xGrowth Cobalt Blue until it gets its own wordmark.
function clientWordmark(m) {
  if (m.client === 'jedyapps') {
    return `<span class="lg jedy"><span class="j1">JEDY</span><span class="j2">APPS</span></span>`;
  }
  if (m.client === 'machapp') {
    return `<span class="lg machapp">MACHAPP</span>`;
  }
  if (m.client === 'syncme') {
    return SYNCME_LOGO;
  }
  return `<span class="lg client-generic">${esc(m.generatedFor)}</span>`;
}
// Sync.me official wordmark, re-fitted for the report: "Sync" takes the header ink
// (so it flips in dark mode), "me" keeps the brand blue #046aff, magenta accent kept.
const SYNCME_LOGO = `<span class="lg sm-logo" role="img" aria-label="Sync.me"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84.82 25" height="22"><g transform="translate(-5.752 -7.414)"><g transform="translate(56.524 7.832)"><path fill="#046aff" d="M375.59,11.084q0-.5.279-.585a.911.911,0,0,1,.585.028,2.161,2.161,0,0,1,.612.362c.2.167.343.289.418.362a25.3,25.3,0,0,1-.111,3.956q-.223,2.507-.223,6.24a21.777,21.777,0,0,1,.669-2.117q.445-1.225,1.031-2.479a19.755,19.755,0,0,1,1.282-2.34,9.524,9.524,0,0,1,1.365-1.727,1.919,1.919,0,0,1,1.282-.641q.611,0,1.114.948a5.02,5.02,0,0,1,.2,1.141q.084.865.112,2.089t.083,2.73q.055,1.5.168,3.065.5-1.225,1.142-2.7a22.374,22.374,0,0,1,1.365-2.673,6.957,6.957,0,0,1,1.56-1.867,1.666,1.666,0,0,1,1.782-.279q.445.167.613,1.03t.278,2.034q.111,1.172.251,2.479a9.773,9.773,0,0,0,.53,2.368,4.1,4.1,0,0,0,1.114,1.7,2.33,2.33,0,0,0,1.95.474q.668,0,.975.028a1.776,1.776,0,0,1,.445.083c.093.038.13.093.111.168a1.483,1.483,0,0,0-.028.334,4.835,4.835,0,0,1-3.371.7,3.456,3.456,0,0,1-2.061-1.56,8.087,8.087,0,0,1-1.059-2.9,30.162,30.162,0,0,1-.417-3.371c-.075-.482-.232-.687-.473-.613a2.174,2.174,0,0,0-.892.835,18.738,18.738,0,0,0-1.142,1.812q-.614,1.086-1.17,2.311t-.975,2.368q-.419,1.143-.641,1.867a.649.649,0,0,1-.891.278,1.177,1.177,0,0,1-.781-.836,10.075,10.075,0,0,1-.25-2.2q-.03-1.308,0-2.646t.083-2.592a20.725,20.725,0,0,0,0-2.144,3.565,3.565,0,0,0-.223-1.225q-.167-.335-.613.167a22.525,22.525,0,0,0-1.755,3.287,35.75,35.75,0,0,0-1.421,3.816q-.613,1.977-1.031,3.955a26.141,26.141,0,0,0-.529,3.594q-.949.222-1.337-.251a6.419,6.419,0,0,1-.669-.975q.111-.723.195-2.813t.167-4.763q.083-2.674.167-5.46T375.59,11.084Z" transform="translate(-374.922 -10.463)"/><path fill="#046aff" d="M532.6,41.088c-.019-.092-.084-.1-.2-.027a18.484,18.484,0,0,1-1.476,1.7q-.7.7-1.867,1.7-.724.667-1.894,1.559a11.411,11.411,0,0,1-2.395,1.421,4.242,4.242,0,0,1-2.34.362,2.206,2.206,0,0,1-1.671-1.615,27.788,27.788,0,0,0,4.15-3.622,14.119,14.119,0,0,0,2.813-4.736q.723-2.561-.139-3.454a4.056,4.056,0,0,0-2.473-.916,3.939,3.939,0,0,0-1.287.126,4.1,4.1,0,0,0-.947.344,6.34,6.34,0,0,0-1.95,1.7,14.026,14.026,0,0,0-1.559,2.646,17.088,17.088,0,0,0-1.115,4.9,11.5,11.5,0,0,0,.223,3.009,3.466,3.466,0,0,0,.223.669,4.076,4.076,0,0,0,.529.863,4.22,4.22,0,0,0,1.031.919,7.993,7.993,0,0,0,1.783.835,6.3,6.3,0,0,0,2.367,0,5.646,5.646,0,0,0,1.895-.78,13.1,13.1,0,0,0,1.643-1.309c.547-.494,1-.91,1.558-1.431l2.091-2.3a6,6,0,0,0,.516-.666,3.877,3.877,0,0,0,.344-.642,2.5,2.5,0,0,0,.171-.718A1.921,1.921,0,0,0,532.6,41.088Zm-11.644-.39a15,15,0,0,1,1.309-2.981,7.89,7.89,0,0,1,1.662-2.07,1.638,1.638,0,0,1,1.849-.469.776.776,0,0,1,.435.46,2.19,2.19,0,0,1,.1,1.079,5.655,5.655,0,0,1-.839,2.339,10.886,10.886,0,0,1-1.5,2.033,12.5,12.5,0,0,1-1.839,1.616,16.412,16.412,0,0,1-1.7,1.086A10.072,10.072,0,0,1,520.957,40.7Z" transform="translate(-498.589 -30.3)"/></g><g transform="translate(5.752 7.414)"><g><path fill="currentColor" d="M6.386,23.364a8.128,8.128,0,0,0,4.27,1.212c2.451,0,3.884-1.267,3.884-3.168,0-1.708-.991-2.727-3.5-3.664-3.03-1.1-4.9-2.7-4.9-5.289,0-2.892,2.4-5.041,6.005-5.041a8.312,8.312,0,0,1,4.077.909l-.662,1.956a6.87,6.87,0,0,0-3.5-.881c-2.534,0-3.5,1.514-3.5,2.782,0,1.735,1.129,2.589,3.691,3.581,3.14,1.24,4.71,2.727,4.71,5.455,0,2.865-2.094,5.372-6.474,5.372a9.584,9.584,0,0,1-4.738-1.212Z" transform="translate(-5.752 -7.414)"/><path fill="currentColor" d="M81.36,47.789l2.893,7.879c.331.881.661,1.928.882,2.727h.055c.248-.8.523-1.818.854-2.782l2.645-7.824H91.25l-3.637,9.5c-1.735,4.573-2.92,6.914-4.573,8.374a6.87,6.87,0,0,1-2.976,1.543l-.606-2.038a5.555,5.555,0,0,0,2.121-1.185,7.651,7.651,0,0,0,2.039-2.7,1.563,1.563,0,0,0,.193-.579,1.46,1.46,0,0,0-.193-.606l-4.9-12.314Z" transform="translate(-68.709 -42.21)"/><path fill="currentColor" d="M175.852,49.491c0-1.4-.028-2.507-.11-3.609h2.149l.138,2.176h.055a4.939,4.939,0,0,1,4.408-2.479c1.845,0,4.71,1.1,4.71,5.675v7.962h-2.424V51.529c0-2.149-.8-3.967-3.085-3.967a3.5,3.5,0,0,0-3.251,2.479,3.612,3.612,0,0,0-.165,1.129v8.044h-2.424Z" transform="translate(-152.429 -40.326)"/><path fill="currentColor" d="M276.208,58.786a9.351,9.351,0,0,1-3.829.774c-4.022,0-6.639-2.735-6.639-6.853a6.806,6.806,0,0,1,7.162-7.128,7.617,7.617,0,0,1,3.361.718l-.551,1.852a5.921,5.921,0,0,0-2.81-.636c-3.058,0-4.71,2.293-4.71,5.084,0,3.094,1.983,5,4.628,5a6.918,6.918,0,0,0,2.975-.636Z" transform="translate(-230.084 -40.345)"/></g><path fill="#d90080" d="M346.176,117.406l.348,1.543,1.795-2.965-2.81-1.55.372,1.654" transform="translate(-298.913 -99.726)"/></g></g></svg></span>`;
// xGrowth official horizontal logo (Full Logo, blue+black), re-fitted: the X mark
// keeps brand cobalt #0047FF, the "Growth" wordmark takes currentColor so it flips
// in dark mode. Source: xGrowth brand drive, "logo X Growth blue+black.svg".
const XGROWTH_LOGO = `<span class="lg xg-logo" role="img" aria-label="xGrowth"><svg viewBox="0 0 1280 317" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M479.559 225.129C457.591 225.129 442.414 219.41 434.029 207.97C425.71 196.531 421.55 179.924 421.55 158.15C421.55 135.987 425.84 119.348 434.419 108.233C443.064 97.1188 459.086 91.5617 482.484 91.5617C504.388 91.5617 519.5 96.5664 527.819 106.576C536.204 116.585 540.656 128.122 541.176 141.186H507.93C507.345 130.657 505.071 123.507 501.106 119.738C497.206 115.903 490.999 113.985 482.484 113.985C473.71 113.985 466.918 116.488 462.108 121.493C457.363 126.497 454.991 139.074 454.991 159.223C454.991 176.642 457.363 188.244 462.108 194.029C466.918 199.748 473.807 202.608 482.777 202.608C491.096 202.608 497.108 200.983 500.813 197.733C504.518 194.484 506.63 188.666 507.15 180.282L507.248 175.7H484.727V156.103H541.176V224.349H522.457L518.752 207.97C512.968 219.28 499.903 224.999 479.559 225.129Z" fill="currentColor"/><path d="M747.877 225.422C724.673 225.422 708.392 219.8 699.032 208.555C689.738 197.246 685.09 180.574 685.09 158.54C685.09 136.442 689.738 119.77 699.032 108.526C708.327 97.2163 724.608 91.5617 747.877 91.5617C771.211 91.5617 787.525 97.2163 796.819 108.526C806.114 119.835 810.761 136.507 810.761 158.54C810.761 180.574 806.114 197.246 796.819 208.555C787.525 219.8 771.211 225.422 747.877 225.422ZM747.877 202.901C756.846 202.901 764.061 200.366 769.521 195.296C774.98 190.161 777.71 177.909 777.71 158.54C777.71 138.847 774.98 126.53 769.521 121.59C764.061 116.585 756.846 114.083 747.877 114.083C738.972 114.083 731.79 116.585 726.331 121.59C720.936 126.53 718.239 138.847 718.239 158.54C718.239 177.909 720.936 190.161 726.331 195.296C731.79 200.366 738.972 202.901 747.877 202.901Z" fill="currentColor"/><path d="M838.908 224.349L815.119 92.7316H850.802L866.011 200.171H866.401L887.168 92.7316H930.65L951.514 200.171H951.807L967.698 92.7316H1003.48L978.91 224.349H928.31L909.104 115.253H908.812L889.508 224.349H838.908Z" fill="currentColor"/><path d="M1055.07 224.349V115.253H1015.88V92.7316H1127.41V115.253H1088.31V224.349H1055.07Z" fill="currentColor"/><path d="M1142.05 224.349V92.7316H1175.3V147.231H1223.85V92.7316H1257V224.349H1223.85V169.752H1175.3V224.349H1142.05Z" fill="currentColor"/><path d="M197.276 158.315L108.517 289.63H23L111.759 158.315L111.76 158.315L67.3807 92.6575L152.898 92.6575L197.277 158.315L286.037 27L371.553 27L282.794 158.315L282.793 158.315L327.173 223.972H241.656L197.277 158.315L197.276 158.315Z" fill="#0047FF"/><path fill-rule="evenodd" clip-rule="evenodd" d="M560.323 224.349V92.7316H636.076C650.701 92.7316 660.45 96.6639 665.325 104.528C670.265 112.393 672.734 121.882 672.734 132.997C672.734 143.916 670.135 153.113 664.935 160.588C661.558 165.461 656.044 168.732 648.393 170.4L675.074 224.349H639.099L615.077 171.702H593.569V224.349H560.323ZM625.06 151.423H593.569V115.253H625.06C630.519 115.253 634.289 116.845 636.369 120.03C638.449 123.15 639.489 127.602 639.489 133.387C639.489 139.107 638.449 143.559 636.369 146.744C634.354 149.863 630.584 151.423 625.06 151.423Z" fill="currentColor"/></svg></span>`;
function head(j) {
  const m = j.meta;
  return `
  <header class="top">
    <div class="cobrand">
      ${clientWordmark(m)}
      <span class="sep">×</span>
      ${XGROWTH_LOGO}
    </div>
    <div class="cobrand-rule" aria-hidden="true"></div>
    <div class="headline">
      <h1>Monetization Digest</h1>
      <span class="date num">${esc(m.targetDate)}</span>
    </div>
    <div class="meta">${m.appsTracked} apps tracked · ${esc(m.currency)} · vs Same Day Last Week (${esc(m.comparisons.sdlw)}) · prepared by xGrowth for ${esc(m.generatedFor)} · draft for review</div>
  </header>`;
}

// A configured, dated pipeline event (see DEFAULTS.knownDataEvents in
// digest.mjs) that distorts one calendar day's numbers for a reason that has
// nothing to do with monetization or traffic -- e.g. an AdMob reporting-
// timezone change truncating that day to a partial window. Rendered ahead of
// the normal 5-second-read banner so the annotation is the first thing read,
// not a footnote after the alarming numbers.
function knownEventBanner(j) {
  const e = j.meta.knownEvent;
  if (!e) return '';
  return `
  <div class="banner known-event">
    <div class="eyebrow">Known event, not a decline</div>
    <p><strong>${esc(e.label || e.type)}</strong> lands on this date. ${esc(e.note || '')} Today's move is expected to look sharp for this reason alone; the per-app table below is not a set of real declines.</p>
  </div>`;
}

// Prior-window caveat: this target day is clean, but a comparison it draws on
// (SDLW / trailing-7d / YoY) uses a baseline day that a known event distorted.
// Rendered separately from knownEventBanner because it can fire on days after
// the event itself, for as long as that day still sits inside a lookback window.
function comparisonEventNote(j) {
  const c = j.meta.comparisonEvents;
  if (!c) return '';
  const hit = (key, label) => c[key] ? `<li><strong>${label}</strong>: baseline falls on ${esc(c[key].label || c[key].type)} (${esc(c[key].date)}). Treat this comparison as unreliable, not a real move.</li>` : '';
  const items = [hit('dod', 'Day-over-day'), hit('sdlw', 'SDLW'), hit('wow', 'Trailing 7d vs prior 7d'), hit('yoy', 'Year-over-year')].filter(Boolean).join('');
  if (!items) return '';
  return `
  <div class="banner known-event">
    <div class="eyebrow">Comparison window affected by a known event</div>
    <ul style="margin:4px 0 0 18px;padding:0">${items}</ul>
  </div>`;
}

function banner(j) {
  const L = j.L1;
  const knownEvent = j.meta.knownEvent;
  const drops = j.L2.filter((e) => e.kind === 'drop');
  const rises = j.L2.filter((e) => e.kind === 'rise');
  const sharp = drops.length ? [...drops].sort((a, b) => a.change.sdlwPct - b.change.sdlwPct)[0] : null;
  const move = j.L0.sdlw.pct;
  const led = esc(L.verdict || 'monetization-led');
  let lever;
  if (L.usersAware && L.users) {
    if (/users \(DAU\)/.test(L.verdict)) lever = `active users (DAU) ${updown(L.users.dau.pct)}`;
    else if (/engagement/.test(L.verdict)) lever = `ad requests per user ${updown(L.users.reqPerDAU.pct)}`;
    else lever = `eCPM ${updown(L.monetization.eCPM.pct)} while users held steadier`;
  } else if (L.trafficProxy && /traffic/.test(L.verdict)) {
    lever = `traffic (ad requests) ${updown(L.trafficProxy.pct)}`;
  } else {
    lever = `eCPM ${updown(L.monetization.eCPM.pct)} while traffic held roughly flat`;
  }
  const sharpTxt = sharp ? ` Sharpest single drop is <strong>${esc(sharp.app)}, down ${Math.abs(sharp.change.sdlwPct).toFixed(0)}%</strong>.` : '';
  const breachTxt = knownEvent
    ? `${drops.length} apps show past their tier threshold today, which the known event above already explains, ${rises.length} rose.`
    : `${drops.length} apps breached their tier threshold, ${rises.length} rose.`;
  return `
  <div class="banner">
    <div class="eyebrow">The 5-second read</div>
    <p>Portfolio landed at <strong class="num">${usd0(j.L0.revenue)}</strong> yesterday, <strong class="${dir(move)}">${move >= 0 ? 'up' : 'down'} ${Math.abs(move).toFixed(1)}% vs the same day last week</strong>. The move is <strong>${led}</strong>: ${lever}.${knownEvent ? '' : sharpTxt} ${breachTxt}</p>
  </div>`;
}

function l0(j) {
  const L = j.L0;
  return `
  <section>
    <div class="level"><span class="tag">L0</span> Portfolio revenue</div>
    <div class="port">
      <div class="big num">${usd2(L.revenue)}</div>
      <div class="sub">yesterday · trend <span class="${dir(L.trend === 'down' ? -1 : 1)}">${L.trend} ${L.trend === 'down' ? '▼' : '▲'}</span></div>
    </div>
    <div class="chips">
      <span class="chip ${dir(L.dod.pct)}"><span class="k">DoD</span> ${arrow(L.dod.pct)} ${L.dod.pct >= 0 ? '+' : ''}${L.dod.pct.toFixed(1)}%</span>
      <span class="chip ${dir(L.sdlw.pct)}"><span class="k">SDLW</span> ${arrow(L.sdlw.pct)} ${L.sdlw.pct >= 0 ? '+' : ''}${L.sdlw.pct.toFixed(1)}%</span>
      <span class="chip ${dir(L.wow.pct)}"><span class="k">WoW</span> ${arrow(L.wow.pct)} ${L.wow.pct >= 0 ? '+' : ''}${L.wow.pct.toFixed(1)}%</span>
      ${L.yoy ? `<span class="chip ${dir(L.yoy.pct)}"><span class="k">YoY</span> ${arrow(L.yoy.pct)} ${L.yoy.pct >= 0 ? '+' : ''}${L.yoy.pct.toFixed(1)}%</span>` : ''}
    </div>
    <div class="refline">vs yesterday ${usd2(L.dod.prev)} · vs same day last week ${usd2(L.sdlw.prev)} · trailing 7d ${usd0(L.wow.t7)} vs prev 7d ${usd0(L.wow.p7)}${L.yoy ? ` · vs last year ${usd2(L.yoy.prev)}` : ' · YoY pending a full year of feed history'}</div>
  </section>`;
}

function l1(j) {
  const L = j.L1;
  const pill = esc(L.verdict || 'monetization-led');
  const box = (label, valHtml, detail) => `<div class="box"><h3>${label}</h3>${valHtml}<div class="d num">${detail}</div></div>`;
  const bigV = (p) => `<div class="v ${dir(p)} num">${spct(p)}</div>`;
  const bigMoney = (n, p) => `<div class="v ${dir(p)} num">${usd3(n)}</div>`;
  const eCPMdetail = `${usd2(L.monetization.eCPM.base)} → ${usd2(L.monetization.eCPM.cur)} · match ${spct(L.monetization.matchRate.pct)} · show ${spct(L.monetization.showRate.pct)}`;
  if (L.usersAware && L.users) {
    const u = L.users;
    return `
  <section>
    <div class="level"><span class="tag">L1</span> Traffic vs monetization</div>
    <p class="verdict">The revenue move is <span class="pill">${pill}</span> &nbsp;real users now in, split into traffic, engagement and price.</p>
    <div class="split4">
      ${box('Users (DAU)', bigV(u.dau.pct), `${Math.round(u.dau.base).toLocaleString()} → ${Math.round(u.dau.cur).toLocaleString()}`)}
      ${box('Ad viewers (DAV)', bigV(u.dav.pct), `${Math.round(u.dav.base).toLocaleString()} → ${Math.round(u.dav.cur).toLocaleString()}`)}
      ${box('ARPDAU', bigMoney(u.arpdau.cur, u.arpdau.pct), `${spct(u.arpdau.pct)} vs ${usd3(u.arpdau.base)}`)}
      ${box('ARPDAV', bigMoney(u.arpdav.cur, u.arpdav.pct), `${spct(u.arpdav.pct)} vs ${usd3(u.arpdav.base)}`)}
    </div>
    <div class="split" style="margin-top:14px">
      ${box('Engagement (ad requests / user)', bigV(u.reqPerDAU.pct), `${u.reqPerDAU.base.toFixed(1)} → ${u.reqPerDAU.cur.toFixed(1)} requests per user`)}
      ${box('Monetization (eCPM)', bigV(L.monetization.eCPM.pct), eCPMdetail)}
    </div>
  </section>`;
  }
  return `
  <section>
    <div class="level"><span class="tag">L1</span> Traffic vs monetization</div>
    <p class="verdict">The revenue move is <span class="pill">${pill}</span> &nbsp;${pill === 'monetization-led' ? 'price moved, users held steadier' : 'users moved more than price'}.</p>
    <div class="split">
      ${box('Traffic (ad requests, DAU proxy)', bigV(L.trafficProxy.pct), `${Math.round(L.trafficProxy.base).toLocaleString()} → ${Math.round(L.trafficProxy.cur).toLocaleString()}`)}
      ${box('Monetization (eCPM)', bigV(L.monetization.eCPM.pct), eCPMdetail)}
    </div>
    <div class="refline" style="margin-top:12px">DAU / ARPDAU / ARPDAV pending GA4. Ad requests stands in for traffic until the Users pull lands.</div>
  </section>`;
}

function dxDot(issue) {
  const key = /Monet/i.test(issue) ? 'monet' : /Traffic|Geo/i.test(issue) ? 'traffic' : 'tech';
  return `<span class="dot ${key}"></span>`;
}

function l2table(j, hasFocus) {
  const knownEvent = j.meta.knownEvent;
  const rows = j.L2.map((e) => {
    const t1 = e.change.threshold;
    const sdlwBreach = !knownEvent && e.kind === 'drop' && !nil(e.change.sdlwPct) && Math.abs(e.change.sdlwPct) >= t1 && e.change.sdlwPct < 0;
    const wowBreach = !knownEvent && e.kind === 'drop' && !nil(e.change.wowPct) && Math.abs(e.change.wowPct) >= t1 && e.change.wowPct < 0;
    return `
      <tr>
        <td class="l app">${esc(e.app)}</td>
        ${hasFocus ? '' : `<td class="tier">${esc(e.tier)}</td>`}
        <td class="num">${usd0(e.earnings.cur)}</td>
        <td class="num ${sdlwBreach ? 'breach' : ''} ${nil(e.change.sdlwPct) ? '' : dir(e.change.sdlwPct)}">${nil(e.change.sdlwPct) ? 'n/a' : `${arrow(e.change.sdlwPct)} ${spct(e.change.sdlwPct)}`}</td>
        <td class="num ${wowBreach ? 'breach' : ''} ${nil(e.change.wowPct) ? '' : dir(e.change.wowPct)}">${nil(e.change.wowPct) ? 'n/a' : `${arrow(e.change.wowPct)} ${spct(e.change.wowPct)}`}</td>
        <td class="l"><span class="dx">${dxDot(e.diagnosis.issue)} ${esc(e.diagnosis.issue)}</span></td>
      </tr>`;
  }).join('');
  const drops = j.L2.filter((e) => e.kind === 'drop').length;
  return `
  <section>
    <div class="level"><span class="tag">L2</span> Per-app exceptions</div>
    <h2 class="sec">${drops} declines past their ${hasFocus ? 'alert' : 'tier'} threshold <span style="color:var(--ink-faint);font-weight:600">· ordered by app size${knownEvent ? ' · explained by the known event above, not individually diagnosed' : ''}</span></h2>
    <div class="legend">
      <span><span class="dot monet"></span> Monetization (price / eCPM)</span>
      <span><span class="dot traffic"></span> Traffic / Geo (UA)</span>
      <span style="color:var(--ink-faint)">${knownEvent ? 'Shading is off today: every app is expected to show a similar drop from the known event, not a real breach' : 'Shaded cell = the window that breached the threshold'}</span>
    </div>
    <div class="tbl-scroll">
      <table>
        <thead><tr><th class="l">App</th>${hasFocus ? '' : '<th>Tier</th>'}<th>Yesterday</th><th>vs SDLW</th><th>vs T7/P7</th><th class="l">Diagnosis</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

// A rich per-app card: 4 time panels + metric row + optional diagnosis/lever.
function appCard(row, sdlwDate, opts = {}) {
  const badge = opts.badge || '';
  const ribbon = opts.ribbon ? `<div class="ribbon">${esc(opts.ribbon)}</div>` : '';
  const diag = opts.diagnosis
    ? `<div class="ddx">${dxDot(opts.diagnosis.issue)} <strong>${esc(opts.diagnosis.issue)}</strong> · ${esc(opts.diagnosis.evidence)}</div>`
    : '';
  return `
    <div class="pcard ${opts.wide ? 'wide' : ''}">
      ${ribbon}
      <div class="ph">
        <span class="pname">${esc(row.app)} <span class="tierpill">${esc(row.tier)}</span></span>
        ${badge}
      </div>
      <div class="panels">
        <div class="panel">
          <div class="pl">Yesterday</div>
          <div class="pv num">${usd0(row.rev)}</div>
          <div class="pd">${pct(row.sdlwPct)}</div>
        </div>
        <div class="panel">
          <div class="pl">Same day last week</div>
          <div class="pv num">${usd0(row.revSDLW)}</div>
          <div class="pd faint">baseline</div>
        </div>
        <div class="panel soft">
          <div class="pl">Trailing 7d</div>
          <div class="pv">${pct(row.t7Pct)}</div>
          <div class="pd faint">vs prev 7d</div>
        </div>
        <div class="panel soft">
          <div class="pl">Trailing 30d</div>
          <div class="pv">${pct(row.t30Pct)}</div>
          <div class="pd faint">vs prev 30d</div>
        </div>
      </div>
      <div class="metricrow">
        ${metricChip('eCPM', row.eCPMPct)}
        ${metricChip('Impr', row.imprPct)}
        ${metricChip('Match', row.matchPct)}
        ${metricChip('Show', row.showPct)}
      </div>
      ${(row.dauPct != null || row.davPct != null || row.arpdauPct != null || row.arpdavPct != null) ? `<div class="metricrow users">
        ${metricChip('DAU', row.dauPct)}
        ${metricChip('DAV', row.davPct)}
        ${metricChip('ARPDAU', row.arpdauPct)}
        ${metricChip('ARPDAV', row.arpdavPct)}
      </div>` : ''}
      ${opts.spark && opts.spark.length > 1 ? `<div class="trendrow"><span class="tlabel">${opts.spark.length}-day revenue</span><span class="sparkwrap">${sparkline(opts.spark, opts.wide ? 260 : 150, 30)}</span></div>` : ''}
      ${diag}
      ${opts.note ? `<div class="pnote">${esc(opts.note)}</div>` : ''}
    </div>`;
}

// Escalation triggers from the app-alerting-framework chain (data-detectable ones):
// a Tier 1 app down >30% on either window, or any app at $0 revenue.
function escalationSection(j) {
  const knownEvent = j.meta.knownEvent;
  const items = [];
  for (const e of (j.L2 || [])) {
    if (e.zeroed) { items.push({ app: e.app, tier: e.tier, why: 'Revenue at $0', to: 'Dror', sev: 2 }); continue; }
    // A portfolio-wide known event (e.g. a reporting-timezone change) is
    // expected to push every Tier 1 app past -30% simultaneously; paging on
    // that would page for the event itself, not a real per-app problem. A
    // hard zero above is kept regardless, since that is not what a truncated
    // reporting day alone produces.
    if (!knownEvent && e.kind === 'drop' && e.tier === 'T1') {
      const s = e.change.sdlwPct, w = e.change.wowPct;
      const worst = Math.min(s, w);
      if (worst <= -30) {
        const win = s <= w ? `${Math.abs(s).toFixed(1)}% vs SDLW` : `${Math.abs(w).toFixed(1)}% trailing 7d vs prev 7d`;
        items.push({ app: e.app, tier: e.tier, why: `Tier 1 drop ${win}`, to: 'Itay Avramov, then Dror', sev: 1 });
      }
    }
  }
  items.sort((a, b) => b.sev - a.sev);
  const has = items.length > 0;
  const rows = items.map((it) => `
      <div class="esc-item">
        <span class="esc-app">${esc(it.app)} <span class="tierpill">${esc(it.tier)}</span></span>
        <span class="esc-why num">${esc(it.why)}</span>
        <span class="esc-to">→ escalate to ${esc(it.to)}</span>
      </div>`).join('');
  return `
  <section class="escsec ${has ? 'has-esc' : ''}">
    <div class="level"><span class="tag ${has ? 'warn' : ''}">Escalate</span> Escalation triggers</div>
    ${has
      ? `<div class="esc-list">${rows}</div>`
      : `<p class="esc-none">No app meets an escalation trigger today (Tier 1 drop over 30%, or revenue at $0).${knownEvent ? ' Tier 1 drop escalation is suppressed today because the known event above explains a portfolio-wide drop; a hard $0 would still escalate.' : ''}</p>`}
    <p class="esc-foot">Per the alerting framework escalation chain. The "no team response within 2 hours" trigger is tracked manually, not from this data.</p>
  </section>`;
}

function topPerformers(j, byApp, sdlwDate) {
  if (!j.topGrowth || !j.topGrowth.length) return '';
  const cards = j.topGrowth.map((g) => {
    const row = byApp[g.app] || g;
    return appCard(row, sdlwDate, {
      badge: '<span class="badge growth">Growth</span>',
      spark: (j.sparks || {})[g.app],
      note: j.meta.detailAvailable ? '' : 'Ad-source breakdown appears once the Detail tab has same-day-last-week history.',
    });
  }).join('');
  return `
  <section>
    <div class="level"><span class="tag">Top</span> Top performing apps</div>
    <div class="cards">${cards}</div>
  </section>`;
}

function notableDrops(j, byApp, sdlwDate) {
  const drops = j.L2.filter((e) => e.kind === 'drop');
  if (!drops.length) return '';
  const sharp = [...drops].sort((a, b) => a.change.sdlwPct - b.change.sdlwPct)[0];
  const sev = (row) => {
    const cand = [row.sdlwPct, row.t7Pct].filter((v) => !nil(v));
    const worst = cand.length ? Math.min(...cand) : 0;
    return worst <= -40 ? '<span class="badge sharp">Sharp drop</span>' : '<span class="badge moderate">Moderate drop</span>';
  };
  const cardFor = (e, wide) => {
    const row = byApp[e.app];
    if (!row) return '';
    return appCard(row, sdlwDate, {
      wide,
      ribbon: wide ? 'Sharpest drop of the day' : '',
      badge: sev(row),
      diagnosis: e.diagnosis,
      spark: (j.sparks || {})[e.app],
      note: j.meta.detailAvailable ? '' : 'Country / ad-source breakdown appears once the Detail tab has same-day-last-week history.',
    });
  };
  const hero = cardFor(sharp, true);
  const rest = drops.filter((e) => e.app !== sharp.app).map((e) => cardFor(e, false)).join('');
  return `
  <section>
    <div class="level"><span class="tag">Drops</span> Apps with notable drops (${drops.length})</div>
    ${hero}
    <div class="cards" style="margin-top:14px">${rest}</div>
  </section>`;
}

// Always-on country + format deep-dive for cfg.focusApps (e.g. a client's one
// hero app on an otherwise small portfolio), independent of L2 breach status.
function focusBreakdownTable(rows, nameCol) {
  if (!rows || !rows.length) return '<p class="pending">No rows for this window.</p>';
  const top = rows.filter((r) => r.earnings > 0 || r.base > 0).slice(0, 8);
  if (!top.length) return '<p class="pending">No rows for this window.</p>';
  const trs = top.map((r) => `
      <tr>
        <td class="l">${esc(r.name)}</td>
        <td class="num">${usd0(r.earnings)}</td>
        <td class="num">${arrowPctOrDashHtml(r.sdlwPct != null ? r.sdlwPct : r.pct)}</td>
        <td class="num">${arrowPctOrDashHtml(r.t7Pct)}</td>
        <td class="num">${arrowPctOrDashHtml(r.t30Pct)}</td>
      </tr>`).join('');
  // No YoY column here on purpose: the drill tabs (Country/Source/Format) only
  // retain ~60 days, so a year-ago baseline never exists at this granularity (it
  // would need the off-Sheet store). Portfolio-level YoY still shows in L0 from the
  // 400-day AppDaily tab. Add a drill YoY column back only when the store lands.
  return `
    <table>
      <thead><tr><th class="l">${esc(nameCol)}</th><th>Yesterday</th><th>vs SDLW</th><th>vs 7d</th><th>vs 30d</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>`;
}
function arrowPctOrDashHtml(p) {
  return p == null ? '<span class="mut">—</span>' : arrowPctHtml0(p);
}
function arrowPctHtml0(p) {
  const cls = p >= 0 ? 'up' : 'down';
  const ar = p >= 0 ? '&#9650;' : '&#9660;';
  return `<span class="${cls}">${ar} ${p >= 0 ? '+' : ''}${p.toFixed(1)}%</span>`;
}
// Horizontal composition bars (share of the day's revenue). Pure CSS, no libs.
function contribBars(rows, opts = {}) {
  const list = (rows || []).filter((r) => r.earnings > 0).slice(0, opts.limit || 8);
  if (!list.length) return '';
  const top = Math.max(...list.map((r) => r.earnings), 1);
  return `<div class="bars">` + list.map((r) => {
    const w = Math.max(2, (r.earnings / top) * 100);
    const dpct = (r.pct == null) ? '' : `<span class="bd ${r.pct >= 0 ? 'up' : 'down'}">${r.pct >= 0 ? '&#9650;' : '&#9660;'} ${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(0)}%</span>`;
    return `<div class="bar"><span class="bl" title="${esc(r.name)}">${esc(r.name)}</span><span class="btrack"><span class="bfill" style="width:${w.toFixed(1)}%"></span></span><span class="bv num">${usd0(r.earnings)}</span>${dpct}</div>`;
  }).join('') + `</div>`;
}
function focusBlock(title, rows, nameCol, note) {
  return `
    <div class="fblock">
      <div class="fsub">${esc(title)}</div>
      ${note ? `<p class="refline" style="margin:0 0 8px">${note}</p>` : ''}
      ${contribBars(rows, { limit: nameCol === 'Country' ? 8 : 6 })}
      <div class="tbl-scroll focus-tbl">${focusBreakdownTable(rows, nameCol)}</div>
    </div>`;
}
function focusDrillSection(j, byApp, sdlwDate) {
  const drill = j.focusDrill;
  if (!drill || !drill.length) return '';
  const blocks = drill.map((d) => {
    const row = byApp[d.app];
    const card = row ? appCard(row, sdlwDate, { wide: true, spark: (j.sparks || {})[d.app] }) : '';
    if (!d.available) {
      return `<div class="fhead"><h3>${esc(d.app)}</h3></div>${card}
    <p class="pending">Country / format drill pending: no Detail / Format rows for this app on the target day.</p>`;
    }
    let blended = '';
    if (d.countryAnalysis) {
      const be = d.countryAnalysis.blendedECPM;
      blended = `<p class="refline" style="margin:10px 0 2px">Blended eCPM ${usd2(be.base)} → ${usd2(be.cur)} · price/rate ${be.rateEffect >= 0 ? '+' : ''}$${be.rateEffect.toFixed(2)}, traffic mix ${be.mixEffect >= 0 ? '+' : ''}$${be.mixEffect.toFixed(2)} → mostly <strong>${esc(be.verdict)}</strong> · high-value geo (US/UK/AU/CA) share ${(d.highValueGeoShare * 100).toFixed(0)}%</p>`;
    }
    const adUnitBlock = (d.adUnits && d.adUnits.length)
      ? focusBlock('By ad unit', d.adUnits, 'Ad unit')
      : `<div class="fblock"><div class="fsub">By ad unit</div><p class="pending">Ad-unit drill-down needs the <code>AD_UNIT</code> dimension added to the feed. Not pulled yet; once the feed carries it this fills in with per-placement revenue and its move vs last week.</p></div>`;
    return `
    <div class="fhead"><h3>${esc(d.app)}</h3></div>
    <div class="fsub">Highlights</div>
    ${card}
    ${focusBlock('By format', d.formats, 'Format')}
    ${blended}
    ${focusBlock('By country', d.countries, 'Country', 'Bars show share of yesterday\'s revenue. Columns compare each country against the same day last week (SDLW), the trailing 7 days vs the prior 7 (vs 7d), and the trailing 30 days vs the prior 30 (vs 30d). A dash means not enough history yet.')}
    ${focusBlock('By ad source (network)', d.sources, 'Ad source')}
    ${adUnitBlock}`;
  }).join('');
  return `
  <section class="focus-sec">
    <div class="level"><span class="tag">Focus</span> Main app deep-dive</div>
    <p class="refline" style="margin-bottom:14px">The hero app in full: a high-level read first, then a drill into format, country, ad source (network), and ad unit. Charts show composition; the columns compare each row against the same day last week (SDLW), the trailing 7 days vs the prior 7 (vs 7d), and the trailing 30 days vs the prior 30 (vs 30d).</p>
    ${blocks}
  </section>`;
}

function allAppsTable(j, hasFocus) {
  if (!j.allApps || !j.allApps.length) return '';
  const rows = j.allApps.map((r) => `
      <tr>
        <td class="l app">${esc(r.app)}</td>
        ${hasFocus ? '' : `<td class="tier">${esc(r.tier)}</td>`}
        <td class="num">${usd0(r.rev)}</td>
        <td class="num">${pct(r.sdlwPct)}</td>
        <td class="num">${pct(r.t7Pct)}</td>
        <td class="num">${pct(r.t30Pct)}</td>
        <td class="num">${pct(r.eCPMPct)}</td>
        <td class="num">${pct(r.imprPct)}</td>
        <td class="num">${pct(r.matchPct)}</td>
        <td class="num">${pct(r.showPct)}</td>
        <td class="num">${pct(r.dauPct)}</td>
        <td class="num">${pct(r.davPct)}</td>
        <td class="num">${pct(r.arpdauPct)}</td>
        <td class="num">${pct(r.arpdavPct)}</td>
        <td class="trend">${sparkline((j.sparks || {})[r.app], 74, 22)}</td>
      </tr>`).join('');
  return `
  <section>
    <div class="level"><span class="tag">All</span> All apps: yesterday vs same day last week</div>
    <div class="tbl-scroll tall">
      <table class="wide-tbl">
        <thead><tr>
          <th class="l">App</th>${hasFocus ? '' : '<th>Tier</th>'}<th>Rev (yest)</th><th>vs SDLW</th><th>7d</th><th>30d</th><th>eCPM</th><th>Impr</th><th>Match</th><th>Show</th><th>DAU</th><th>DAV</th><th>ARPDAU</th><th>ARPDAV</th><th>Trend</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="refline" style="margin-top:10px">Showing all ${j.allApps.length} apps above the ${usd0(j.meta.revenueFloorDaily)}/day noise floor. Scroll for the full list.</div>
  </section>`;
}

function nextActions(j) {
  if (!j.nextActions || !j.nextActions.length) return '';
  const items = j.nextActions.map((a) => {
    const who = a.app ? `<span class="who">${esc(a.app)}</span> ` : '';
    const txt = a.text || a.ask || '';
    return `<li><span>${who}${esc(txt)}</span></li>`;
  }).join('');
  return `
  <section>
    <div class="level"><span class="tag">Next</span> Proposed actions</div>
    <ol class="actions">${items}</ol>
  </section>`;
}

function tierNote(j) {
  const t = j.meta.tiers;
  if (!t) return '';
  const order = ['T1', 'T2', 'T3', 'T4'].filter((k) => t[k]);
  const li = order.map((k, i) => {
    const lower = t[k].min;
    const upperEx = i > 0 ? t[order[i - 1]].min : null;
    let band;
    if (i === 0) band = `$${lower.toLocaleString()}+`;
    else if (lower === 0) band = `under $${upperEx.toLocaleString()}`;
    else band = `$${lower.toLocaleString()} to $${(upperEx - 1).toLocaleString()}`;
    return `<li><strong>${esc(t[k].label)}</strong> — ${band} per 30 days · flag a ${t[k].dropPct}% drop, respond ${esc(String(t[k].window)).toLowerCase()}.</li>`;
  }).join('');
  const floor = j.meta.revenueFloorDaily;
  return `
    <div class="tiernote">
      <div class="tnh">How apps are tiered</div>
      <p>Each app is assigned a tier by its <strong>trailing 30-day ad revenue</strong>. The tier sets how large a drop is worth flagging and how quickly to act:</p>
      <ul>${li}</ul>
      <p>Apps below about $${floor}/day are held out of the percentage alerts, so tiny-base swings do not create noise.</p>
    </div>`;
}

function footer(j, hasFocus) {
  return `
  <footer>
    <div class="legend">
      <span><span class="dot monet"></span> Monetization</span>
      <span><span class="dot traffic"></span> Traffic / Geo</span>
      <span><span class="dot tech"></span> Tech / Product</span>
    </div>
    <p class="disc">Draft for review · ${esc(j.meta.engine)} from the ${esc(j.meta.generatedFor)} Monetization Feed. All comparisons vs same day last week unless noted. Estimated earnings settle after the day closes, so figures can shift slightly on the next re-pull. ${j.L1 && j.L1.usersAware ? 'DAU / DAV / ARPDAU / ARPDAV are live from GA4 for the revenue-floor apps.' : 'DAU / ARPDAU / ARPDAV switch on once the GA4 Users pull is live.'} Country, format, and ad-source drill-downs fill in as the Detail tab builds history.</p>
    ${hasFocus ? '' : tierNote(j)}
  </footer>`;
}

// nextActions may store the ask under .text; the engine uses {app, text} or {app, ask}.
function normalizeActions(j) {
  j.nextActions = (j.nextActions || []).map((a) => {
    if (typeof a === 'string') return { text: a };
    return a;
  });
}

function render(j) {
  normalizeActions(j);
  const byApp = Object.fromEntries((j.allApps || []).map((r) => [r.app, r]));
  const sdlwDate = j.meta.comparisons.sdlw;
  const hasFocus = !!(j.focusDrill && j.focusDrill.length);
  return `<title>${esc(j.meta.generatedFor)} Monetization Digest</title>\n` + CSS + `
<div class="wrap client-${esc(j.meta.client || 'generic')}">
  ${head(j)}
  ${knownEventBanner(j)}
  ${comparisonEventNote(j)}
  ${banner(j)}
  ${l0(j)}
  ${l1(j)}
  ${focusDrillSection(j, byApp, sdlwDate)}
  ${l2table(j, hasFocus)}
  ${hasFocus ? '' : escalationSection(j)}
  ${hasFocus ? '' : topPerformers(j, byApp, sdlwDate)}
  ${hasFocus ? '' : notableDrops(j, byApp, sdlwDate)}
  ${allAppsTable(j, hasFocus)}
  ${nextActions(j)}
  ${footer(j, hasFocus)}
</div>`;
}

// ---------- styles ----------
const CSS = `<style>
  :root{--bg:#eef1f6;--card:#fff;--card-2:#f8fafc;--ink:#0f172a;--ink-soft:#475569;--ink-faint:#94a3b8;--line:#e2e8f0;--accent:#0047ff;--brand-cyan:#00a5bd;--brand-lime:#5fb52c;--up:#15803d;--up-bg:#dcfce7;--down:#b91c1c;--down-bg:#fee2e2;--breach-bg:#fff1f0;--breach-line:#fca5a5;--dx-monet:#d97706;--dx-traffic:#2563eb;--dx-tech:#7c3aed;--growth-bg:#dcfce7;--growth-ink:#15803d;--mod-bg:#fee2e2;--mod-ink:#b91c1c;--shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.05);--radius:14px;}
  @media (prefers-color-scheme:dark){:root{--bg:#0b1120;--card:#131c2e;--card-2:#0f1727;--ink:#e6ecf5;--ink-soft:#9fb0c7;--ink-faint:#64748b;--line:#24304a;--accent:#6b8afc;--brand-cyan:#22d3ee;--brand-lime:#a4ff5c;--up:#4ade80;--up-bg:#0f2e1c;--down:#f87171;--down-bg:#3a1414;--breach-bg:#331414;--breach-line:#7f1d1d;--dx-monet:#fbbf24;--dx-traffic:#60a5fa;--dx-tech:#a78bfa;--growth-bg:#0f2e1c;--growth-ink:#4ade80;--mod-bg:#3a1414;--mod-ink:#f87171;--shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px rgba(0,0,0,.35);}}
  :root[data-theme="light"]{--bg:#eef1f6;--card:#fff;--card-2:#f8fafc;--ink:#0f172a;--ink-soft:#475569;--ink-faint:#94a3b8;--line:#e2e8f0;--accent:#0047ff;--brand-cyan:#00a5bd;--brand-lime:#5fb52c;--up:#15803d;--up-bg:#dcfce7;--down:#b91c1c;--down-bg:#fee2e2;--breach-bg:#fff1f0;--breach-line:#fca5a5;--dx-monet:#d97706;--dx-traffic:#2563eb;--dx-tech:#7c3aed;--growth-bg:#dcfce7;--growth-ink:#15803d;--mod-bg:#fee2e2;--mod-ink:#b91c1c;--shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.05);}
  :root[data-theme="dark"]{--bg:#0b1120;--card:#131c2e;--card-2:#0f1727;--ink:#e6ecf5;--ink-soft:#9fb0c7;--ink-faint:#64748b;--line:#24304a;--accent:#6b8afc;--brand-cyan:#22d3ee;--brand-lime:#a4ff5c;--up:#4ade80;--up-bg:#0f2e1c;--down:#f87171;--down-bg:#3a1414;--breach-bg:#331414;--breach-line:#7f1d1d;--dx-monet:#fbbf24;--dx-traffic:#60a5fa;--dx-tech:#a78bfa;--growth-bg:#0f2e1c;--growth-ink:#4ade80;--mod-bg:#3a1414;--mod-ink:#f87171;--shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px rgba(0,0,0,.35);}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1120px;margin:0 auto;padding:32px 20px 64px;}
  .num{font-variant-numeric:tabular-nums;}
  .up{color:var(--up);} .down{color:var(--down);} .flat{color:var(--ink-faint);}
  header.top{margin-bottom:24px;}
  .cobrand{display:flex;align-items:center;gap:13px;font-weight:800;font-size:1.12rem;letter-spacing:.04em;flex-wrap:wrap;}
  .lg{white-space:nowrap;display:inline-flex;align-items:center;line-height:1;}
  .sm-logo{color:var(--ink);}
  .sm-logo svg{display:block;height:22px;width:auto;}
  .jedy{font-style:italic;letter-spacing:.01em;} .jedy .j1{color:var(--ink);} .jedy .j2{color:var(--brand-cyan);}
  .client-generic{color:var(--accent);}
  .machapp{color:var(--ink);letter-spacing:.14em;font-weight:900;}
  /* per-client accent drives the short lead on the header hairline */
  .client-machapp{--machapp-gold:#EAA400;--cobrand-accent:#EAA400;}
  .client-syncme{--cobrand-accent:#046aff;}
  .client-jedyapps{--cobrand-accent:var(--brand-cyan);}
  .client-syncme .bar .bfill{background:#046aff;}
  .sep{color:var(--ink-faint);font-weight:400;font-size:1.05rem;opacity:.55;}
  .xg-logo{color:var(--ink);display:inline-flex;align-items:center;}
  .xg-logo svg{display:block;height:26px;width:auto;}
  .cobrand-rule{position:relative;height:1px;background:var(--line);margin:14px 0;border-radius:0;}
  .cobrand-rule::before{content:"";position:absolute;left:0;top:0;height:1px;width:56px;background:var(--cobrand-accent,var(--accent));}
  .headline{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;}
  .headline h1{margin:0;font-size:1.5rem;font-weight:800;letter-spacing:.02em;text-transform:uppercase;}
  .date{color:var(--ink-soft);font-weight:600;font-size:.95rem;}
  .meta{color:var(--ink-faint);font-size:.8rem;margin-top:6px;}
  .banner{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--down);border-radius:var(--radius);padding:18px 20px;box-shadow:var(--shadow);margin-bottom:24px;}
  .banner .eyebrow{text-transform:uppercase;letter-spacing:.09em;font-size:.68rem;font-weight:700;color:var(--ink-faint);margin-bottom:6px;}
  .banner p{margin:0;font-size:1.06rem;}
  .banner.known-event{border-left-color:var(--accent);}
  .banner.known-event .eyebrow{color:var(--accent);}
  .banner.known-event li{margin-bottom:4px;}
  section{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px 22px;margin-bottom:18px;}
  .level{display:inline-flex;align-items:center;gap:8px;font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:14px;}
  .level .tag{background:color-mix(in srgb,var(--accent) 14%,transparent);padding:2px 7px;border-radius:6px;}
  h2.sec{font-size:1rem;margin:0 0 14px;font-weight:700;}
  .port{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px 20px;}
  .port .big{font-size:2.6rem;font-weight:800;letter-spacing:-.02em;line-height:1;}
  .port .sub{color:var(--ink-soft);font-size:.9rem;padding-bottom:4px;}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 6px;}
  .chip{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:9px;font-size:.82rem;font-weight:600;font-variant-numeric:tabular-nums;border:1px solid var(--line);background:var(--card-2);}
  .chip .k{color:var(--ink-faint);font-weight:700;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;}
  .chip.up{background:var(--up-bg);border-color:transparent;} .chip.down{background:var(--down-bg);border-color:transparent;}
  .refline{color:var(--ink-faint);font-size:.82rem;font-variant-numeric:tabular-nums;margin-top:4px;}
  .fhead h3{margin:2px 0 2px;font-size:1.2rem;font-weight:800;letter-spacing:-.01em;}
  .fsub{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);margin:20px 0 8px;}
  .fblock{margin-top:4px;}
  .focus-tbl table{min-width:0;}
  .focus-tbl table td.l,.focus-tbl table th.l{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .bars{display:flex;flex-direction:column;gap:7px;margin:4px 0 12px;}
  .bar{display:grid;grid-template-columns:minmax(88px,150px) 1fr auto auto;align-items:center;gap:10px;font-size:.82rem;}
  .bar .bl{color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .bar .btrack{background:var(--card-2);border:1px solid var(--line);border-radius:6px;height:14px;overflow:hidden;min-width:40px;}
  .bar .bfill{display:block;height:100%;background:var(--accent);border-radius:6px;}
  .bar .bv{font-variant-numeric:tabular-nums;color:var(--ink);font-weight:700;}
  .bar .bd{font-variant-numeric:tabular-nums;font-size:.76rem;font-weight:700;min-width:52px;text-align:right;}
  .client-machapp .bar .bfill{background:var(--machapp-gold);}
  .split{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .split4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
  .split .box{border:1px solid var(--line);border-radius:11px;padding:14px;background:var(--card-2);}
  .split .box h3{margin:0 0 8px;font-size:.74rem;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-faint);}
  .split .box .v{font-size:1.5rem;font-weight:800;font-variant-numeric:tabular-nums;}
  .split .box .d{font-size:.84rem;color:var(--ink-soft);margin-top:4px;}
  .verdict{margin:0 0 14px;font-size:.95rem;}
  .pill{display:inline-block;padding:2px 9px;border-radius:999px;font-weight:700;font-size:.82rem;background:var(--down-bg);color:var(--down);}
  .tbl-scroll{overflow-x:auto;margin:0 -6px;}
  .tbl-scroll.tall{max-height:520px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;margin:0;}
  table{width:100%;border-collapse:collapse;font-size:.88rem;min-width:560px;}
  table.wide-tbl{min-width:1180px;font-size:.83rem;}
  thead th{text-align:right;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-faint);font-weight:700;padding:6px 10px;border-bottom:1px solid var(--line);background:var(--card);position:sticky;top:0;}
  thead th.l,tbody td.l{text-align:left;}
  tbody td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums;}
  tbody tr:last-child td{border-bottom:none;}
  td.num{white-space:nowrap;}
  thead th{white-space:nowrap;}
  td.app{font-weight:600;} td.tier{color:var(--ink-faint);font-weight:700;font-size:.78rem;}
  td.breach{background:var(--breach-bg);box-shadow:inset 0 0 0 1px var(--breach-line);border-radius:4px;font-weight:700;}
  .dx{display:inline-flex;align-items:center;gap:7px;font-weight:600;font-size:.82rem;white-space:nowrap;}
  .dot{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block;}
  .dot.monet{background:var(--dx-monet);} .dot.traffic{background:var(--dx-traffic);} .dot.tech{background:var(--dx-tech);}
  .legend{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:10px;font-size:.78rem;color:var(--ink-soft);}
  .legend span{display:inline-flex;align-items:center;gap:6px;}
  .escsec.has-esc{border-left:5px solid var(--down);}
  .tag.warn{background:color-mix(in srgb,var(--down) 16%,transparent);color:var(--down);}
  .esc-list{display:grid;gap:8px;}
  .esc-item{display:grid;grid-template-columns:1fr auto auto;gap:4px 14px;align-items:baseline;padding:9px 12px;border:1px solid var(--breach-line);border-radius:9px;background:var(--down-bg);}
  .esc-app{font-weight:700;font-size:.9rem;}
  .esc-why{color:var(--down);font-weight:700;font-size:.84rem;}
  .esc-to{color:var(--ink-soft);font-size:.82rem;font-weight:600;white-space:nowrap;}
  .esc-none{margin:0;color:var(--ink-soft);font-size:.88rem;}
  .esc-foot{margin:10px 0 0;color:var(--ink-faint);font-size:.74rem;}
  .spark{display:block;}
  .spark.up{color:var(--up);} .spark.down{color:var(--down);}
  .spark .line{fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;}
  .spark .area{fill:currentColor;fill-opacity:.13;stroke:none;}
  .spark circle{fill:currentColor;}
  .trendrow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:11px;padding-top:11px;border-top:1px solid var(--line);}
  .trendrow .tlabel{font-size:.72rem;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em;font-weight:700;white-space:nowrap;}
  .trendrow .sparkwrap{flex:0 0 auto;line-height:0;}
  td.trend{width:84px;padding:4px 10px;}
  td.trend .spark{margin-left:auto;}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .pcard{position:relative;border:1px solid var(--line);border-radius:12px;padding:15px;background:var(--card-2);min-width:0;}
  .pcard.wide{grid-column:1 / -1;border-color:var(--breach-line);}
  .ribbon{display:inline-block;font-size:.66rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--down);margin-bottom:8px;}
  .ph{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;}
  .pname{font-weight:700;font-size:.95rem;}
  .tierpill{display:inline-block;border:1px solid var(--line);color:var(--ink-faint);font-size:.68rem;font-weight:700;padding:1px 6px;border-radius:999px;vertical-align:middle;margin-left:4px;}
  .badge{font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap;}
  .badge.growth{background:var(--growth-bg);color:var(--growth-ink);}
  .badge.moderate,.badge.sharp{background:var(--mod-bg);color:var(--mod-ink);}
  .panels{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;align-items:stretch;}
  .panel{border-radius:9px;padding:10px 8px;background:var(--card);border:1px solid var(--line);display:flex;flex-direction:column;min-width:0;overflow:hidden;}
  .panel.soft{background:transparent;border-style:dashed;}
  .pl{font-size:.68rem;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.04em;line-height:1.2;height:1.7rem;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
  .pv{font-size:1.05rem;font-weight:800;line-height:1.2;height:1.5rem;display:flex;align-items:center;white-space:nowrap;letter-spacing:-.01em;}
  .pcard.wide .pv{font-size:1.4rem;}
  .pd{font-size:.8rem;color:var(--ink-soft);margin-top:5px;height:1.1rem;line-height:1.1rem;white-space:nowrap;overflow:hidden;}
  .pd.faint{color:var(--ink-faint);}
  .metricrow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 14px;margin-top:12px;padding-top:11px;border-top:1px solid var(--line);}
  .mchip{font-size:.8rem;font-weight:600;font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:5px;white-space:nowrap;min-width:0;}
  .mchip .mk{color:var(--ink-faint);font-weight:700;}
  .metricrow.users{margin-top:8px;padding-top:8px;border-top-style:dashed;}
  .ddx{margin-top:11px;font-size:.82rem;display:flex;align-items:flex-start;gap:7px;line-height:1.45;}
  .ddx .dot{margin-top:5px;}
  .pnote{margin-top:9px;font-size:.74rem;color:var(--ink-faint);font-style:italic;}
  ol.actions{margin:4px 0 0;padding-left:0;list-style:none;counter-reset:a;display:grid;gap:10px;}
  ol.actions li{counter-increment:a;display:grid;grid-template-columns:26px 1fr;gap:12px;align-items:start;font-size:.9rem;}
  ol.actions li::before{content:counter(a);background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);font-weight:700;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-size:.8rem;}
  ol.actions .who{font-weight:700;}
  footer{color:var(--ink-faint);font-size:.76rem;line-height:1.6;margin-top:8px;}
  footer .disc{margin:0;}
  .tiernote{margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:.78rem;line-height:1.55;color:var(--ink-faint);}
  .tiernote .tnh{text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--ink-soft);font-size:.72rem;margin-bottom:6px;}
  .tiernote p{margin:0 0 6px;}
  .tiernote ul{margin:0;padding-left:1.1rem;display:grid;gap:3px;}
  .tiernote strong{color:var(--ink-soft);font-weight:700;}
  @media (max-width:640px){.split,.split4,.cards{grid-template-columns:1fr;}.panels{grid-template-columns:1fr 1fr;}.split4{grid-template-columns:1fr 1fr;}.metricrow{grid-template-columns:1fr 1fr;}.esc-item{grid-template-columns:1fr;}.port .big{font-size:2.1rem;}}
</style>
`;

// ---------- main ----------
const args = parseArgs(process.argv);
const j = JSON.parse(fs.readFileSync(args.json, 'utf8'));
const html = render(j);
if (args.out) {
  fs.writeFileSync(args.out, html, 'utf8');
  console.log('[render-html] wrote ' + args.out + ' (' + html.length + ' bytes)');
} else {
  process.stdout.write(html);
}
