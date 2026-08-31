/* Client monetization dashboard: trend view over the full-history timeseries,
   plus the per-day rendered digest. No dependencies, no build step.

   Rate metrics (eCPM, match rate, ARPDAU) are ALWAYS derived from summed
   components, never averaged across days or apps. That is the same rule the
   digest engine follows and the only correct way to combine them. */
(function () {
  'use strict';

  var CFG = window.CLIENT_CONFIG || {};
  var RPT_MODE = window.__RPT_MODE || 'both';
  var PORTFOLIO = '__portfolio__';

  var TS = null;
  // 90d by default: with roughly 14 months of history a 12m range leaves no
  // room for a prior-period comparison, so the stats would all read empty.
  var state = { range: 90, metric: 'revenue', app: PORTFOLIO, compare: 'none' };

  // Overlay comparisons. The offset is what makes each one mean something
  // different: 'prior' shifts by the length of the selected range, so 30d
  // compares against the 30 days before it and 90d against the 90 before it,
  // while 'yoy' is a fixed 365. Both are drawn day by day on the same x axis
  // rather than reduced to a single summary number.
  var COMPARE = {
    none:  { label: null },
    prior: { label: 'Previous period', short: 'prev period',
             offset: function (r) { return r.b - r.a + 1; } },
    yoy:   { label: 'Same period last year', short: 'last year',
             offset: function () { return 365; } }
  };

  var el = {
    title: document.getElementById('shell-title'),
    tabTrends: document.getElementById('tab-trends'),
    tabDaily: document.getElementById('tab-daily'),
    viewTrends: document.getElementById('view-trends'),
    viewDaily: document.getElementById('view-daily'),
    dailyControls: document.getElementById('daily-controls'),
    dateInput: document.getElementById('report-date'),
    reportFrame: document.getElementById('report-frame'),
    reportStatus: document.getElementById('report-status'),
    metricSelect: document.getElementById('metric-select'),
    appSelect: document.getElementById('app-select'),
    compareSelect: document.getElementById('compare-select'),
    hero: document.getElementById('hero'),
    periods: document.getElementById('periods'),
    periodsNote: document.getElementById('periods-note'),
    chart: document.getElementById('chart'),
    chartHolder: document.getElementById('chart-holder'),
    chartTitle: document.getElementById('chart-title'),
    chartLegend: document.getElementById('chart-legend'),
    tooltip: document.getElementById('tooltip'),
    tbody: document.getElementById('app-tbody'),
    tableNote: document.getElementById('table-note'),
    bdCard: document.getElementById('breakdown-card'),
    bdTabs: document.getElementById('bd-tabs'),
    bdNote: document.getElementById('bd-note'),
    bdBody: document.getElementById('bd-body')
  };

  // Browser-native region names, so 204 country codes cost no bundle size.
  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { /* older browser */ }
  function countryLabel(code) {
    if (code === 'Other') return 'Other countries';
    if (!regionNames || !/^[A-Z]{2}$/.test(code)) return code;
    try { return regionNames.of(code) || code; } catch (e) { return code; }
  }

  /* ---------------- metric definitions ---------------- */
  // agg: how a whole range collapses to one number. 'sum' adds the daily
  // values; 'ratio' divides summed numerator by summed denominator.
  // Order matters: ARPDAU and ARPDAV lead because they normalise out traffic,
  // so they isolate monetisation work from UA work. The rest are supporting
  // evidence for why those two moved.
  var METRICS = {
    revenue:     { label: 'Revenue',        agg: 'sum',   fmt: money,   daily: function (s, i) { return s.revenue[i]; } },
    arpdau:      { label: 'ARPDAU',         agg: 'ratio', fmt: money4,  num: 'revenue', den: 'dau', scale: 1, needs: 'dau' },
    arpdav:      { label: 'ARPDAV',         agg: 'ratio', fmt: money4,  num: 'revenue', den: 'dav', scale: 1, needs: 'dav' },
    ecpm:        { label: 'eCPM',           agg: 'ratio', fmt: money2,  num: 'revenue', den: 'impressions', scale: 1000 },
    dau:         { label: 'DAU',            agg: 'sum',   fmt: count,   daily: function (s, i) { return s.dau ? s.dau[i] : null; }, needs: 'dau' },
    dav:         { label: 'DAV',            agg: 'sum',   fmt: count,   daily: function (s, i) { return s.dav ? s.dav[i] : null; }, needs: 'dav' },
    requests:    { label: 'Ad requests',    agg: 'sum',   fmt: count,   daily: function (s, i) { return s.requests[i]; } },
    impressions: { label: 'Impressions',    agg: 'sum',   fmt: count,   daily: function (s, i) { return s.impressions[i]; } },
    matchRate:   { label: 'Match rate',     agg: 'ratio', fmt: pctVal,  num: 'matched',  den: 'requests', scale: 100 }
  };

  /* ---------------- formatting ---------------- */
  function money(v) {
    if (v == null) return '--';
    var a = Math.abs(v);
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (a >= 1e4) return '$' + Math.round(v).toLocaleString('en-US');
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function money2(v) { return v == null ? '--' : '$' + v.toFixed(2); }
  function money4(v) { return v == null ? '--' : '$' + v.toFixed(4); }
  function count(v) {
    if (v == null) return '--';
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return Math.round(v).toLocaleString('en-US');
    return String(Math.round(v));
  }
  function pctVal(v) { return v == null ? '--' : v.toFixed(1) + '%'; }
  function niceDate(iso) {
    var p = iso.split('-');
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1] - 1];
    return p[2].replace(/^0/, '') + ' ' + m + ' ' + p[0];
  }
  function shortDate(iso) {
    var p = iso.split('-');
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1] - 1];
    return p[2].replace(/^0/, '') + ' ' + m;
  }
  // A window crossing a year boundary needs the year, or "7 Aug to 6 Aug" is
  // indistinguishable from a one-day span.
  function spanLabel(from, to, days) {
    if (days <= 1) return niceDate(to);
    var crossesYear = from.slice(0, 4) !== to.slice(0, 4);
    return crossesYear ? niceDate(from) + ' to ' + niceDate(to)
                       : shortDate(from) + ' to ' + shortDate(to);
  }

  /* ---------------- data helpers ---------------- */
  function sourceFor(appKey) {
    return appKey === PORTFOLIO ? TS.portfolio : TS.apps[appKey];
  }

  // Daily values of a metric, aligned to TS.dates, null where absent.
  function dailySeries(appKey, metricKey) {
    var s = sourceFor(appKey), m = METRICS[metricKey];
    var n = TS.dates.length, out = new Array(n), i;
    if (!s) { for (i = 0; i < n; i++) out[i] = null; return out; }
    for (i = 0; i < n; i++) {
      if (m.agg === 'sum') {
        out[i] = m.daily(s, i);
      } else {
        var num = s[m.num] ? s[m.num][i] : null;
        var den = s[m.den] ? s[m.den][i] : null;
        out[i] = (num != null && den) ? (num / den) * m.scale : null;
      }
    }
    return out;
  }

  // Collapse a window to one number, summing components for ratios.
  function aggregate(appKey, metricKey, a, b) {
    var s = sourceFor(appKey), m = METRICS[metricKey], i;
    if (!s) return null;
    if (m.agg === 'sum') {
      var total = null;
      for (i = a; i <= b; i++) {
        var v = m.daily(s, i);
        if (v != null) total = (total || 0) + v;
      }
      return total;
    }
    var sn = 0, sd = 0, seen = false;
    for (i = a; i <= b; i++) {
      var nv = s[m.num] ? s[m.num][i] : null;
      var dv = s[m.den] ? s[m.den][i] : null;
      if (nv != null && dv != null) { sn += nv; sd += dv; seen = true; }
    }
    return (seen && sd > 0) ? (sn / sd) * m.scale : null;
  }

  function rangeIdx() {
    var n = TS.dates.length;
    var days = state.range === 0 ? n : Math.min(state.range, n);
    return { a: n - days, b: n - 1, days: days };
  }

  function pctChange(cur, prev) {
    if (cur == null || prev == null || prev === 0) return null;
    return ((cur - prev) / Math.abs(prev)) * 100;
  }

  function deltaHtml(pct) {
    if (pct == null) return '<span class="delta flat" title="Not enough history for this comparison">&ndash;</span>';
    var cls = pct > 0.05 ? 'up' : (pct < -0.05 ? 'down' : 'flat');
    var arrow = pct > 0.05 ? '▲' : (pct < -0.05 ? '▼' : '▬');
    var sign = pct > 0 ? '+' : '';
    return '<span class="delta ' + cls + '">' + arrow + ' ' + sign + pct.toFixed(1) + '%</span>';
  }

  /* ---------------- periods ---------------- */
  // Fixed windows, all ending on the freshest day in the feed. Independent of
  // the chart's range selector so the summary always reads the same.
  var PERIODS = [
    { label: 'Yesterday',      days: 1,   priorLabel: 'vs day before' },
    { label: 'Last 7 days',    days: 7,   priorLabel: 'vs previous 7 days' },
    { label: 'Last 30 days',   days: 30,  priorLabel: 'vs previous 30 days' },
    { label: 'Last 90 days',   days: 90,  priorLabel: 'vs previous 90 days' },
    { label: 'Last 12 months', days: 365, priorLabel: 'vs previous 12 months' }
  ];

  // One window's value plus its two comparisons. A comparison is null when the
  // feed does not reach far enough back, never a partial window.
  function periodRow(p) {
    var n = TS.dates.length;
    var days = Math.min(p.days, n);
    var a = n - days, b = n - 1;
    var value = aggregate(state.app, state.metric, a, b);

    var pa = a - days, prior = null;
    if (pa >= 0) prior = aggregate(state.app, state.metric, pa, a - 1);

    var ya = a - 365, yoy = null;
    if (ya >= 0) yoy = aggregate(state.app, state.metric, ya, b - 365);

    return { days: days, value: value, prior: prior, yoy: yoy,
             from: TS.dates[a], to: TS.dates[b], truncated: days < p.days };
  }

  function renderHero() {
    var m = METRICS[state.metric];
    var r = periodRow(PERIODS[0]);
    var who = state.app === PORTFOLIO ? 'Portfolio' : state.app;

    el.hero.innerHTML =
      '<div class="hero-label">' + escapeHtml(who) + ' &middot; ' + escapeHtml(m.label) + ' &middot; ' + niceDate(r.to) + '</div>' +
      '<div class="hero-value">' + m.fmt(r.value) + '</div>' +
      '<div class="hero-deltas">' +
        '<span>' + deltaHtml(pctChange(r.value, r.prior)) + ' <span class="hero-vs">vs day before</span></span>' +
        '<span>' + deltaHtml(pctChange(r.value, r.yoy)) + ' <span class="hero-vs">vs same day last year</span></span>' +
      '</div>';
  }

  // Compact cards rather than a wide table: five periods scan faster side by
  // side than as rows of five columns each.
  function renderPeriods() {
    var m = METRICS[state.metric];
    var isSum = m.agg === 'sum';

    el.periods.innerHTML = PERIODS.map(function (p) {
      var r = periodRow(p);
      var clickable = p.days > 1;               // a single day is a point, not a range
      var active = clickable && state.range === p.days;
      var tag = clickable ? 'button' : 'div';

      var foot = [];
      if (isSum && r.value != null && r.days > 1) foot.push(m.fmt(r.value / r.days) + '/day');
      if (r.yoy != null) foot.push(deltaHtml(pctChange(r.value, r.yoy)) + ' yr');

      return '<' + tag + ' class="pcard' + (active ? ' is-active' : '') + (clickable ? '' : ' is-static') + '"' +
             (clickable ? ' data-days="' + p.days + '" type="button"' : '') +
             ' title="' + escapeAttr(spanLabel(r.from, r.to, r.days)) + '">' +
             '<span class="pcard-label">' + escapeHtml(p.label) +
               (r.truncated ? ' <span class="period-part">(' + r.days + 'd)</span>' : '') + '</span>' +
             '<span class="pcard-value">' + m.fmt(r.value) + '</span>' +
             '<span class="pcard-delta">' + deltaHtml(pctChange(r.value, r.prior)) +
               ' <span class="pcard-vs">vs prior</span></span>' +
             '<span class="pcard-foot">' + (foot.join(' &middot; ') || '&nbsp;') + '</span>' +
             '</' + tag + '>';
    }).join('');

    el.periodsNote.innerHTML = 'Windows end ' + niceDate(TS.dates[TS.dates.length - 1]) +
      ' &middot; history from ' + niceDate(TS.dates[0]) +
      ' &middot; <span style="color:var(--muted-fg)">click a period to chart it</span>';
  }

  /* ---------------- chart ---------------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function niceTicks(min, max, target) {
    var span = max - min;
    if (span <= 0) return [min];
    var raw = span / target;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
    var out = [], v = Math.ceil(min / step) * step;
    for (; v <= max + step * 0.001; v += step) out.push(v);
    return out;
  }

  var chartCtx = null;

  function drawChart() {
    var svg = el.chart;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var W = el.chartHolder.clientWidth || 800;
    var H = svg.clientHeight || 300;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var r = rangeIdx(), m = METRICS[state.metric];
    var series = dailySeries(state.app, state.metric).slice(r.a, r.b + 1);
    var dates = TS.dates.slice(r.a, r.b + 1);

    // The comparison window is the same length, shifted back. Its own dates go
    // into chartCtx so the tooltip can name the day being compared against:
    // "vs 12 Jun" is checkable, an unlabelled second line is not.
    var compare = null, compareDates = null;
    var cmp = COMPARE[state.compare];
    if (cmp && cmp.offset) {
      var off = cmp.offset(r);
      var ca = r.a - off, cb = r.b - off;
      if (ca >= 0) {
        compare = dailySeries(state.app, state.metric).slice(ca, cb + 1);
        compareDates = TS.dates.slice(ca, cb + 1);
      }
    }

    var pad = { t: 12, r: 14, b: 26, l: 62 };
    var pw = Math.max(10, W - pad.l - pad.r);
    var ph = Math.max(10, H - pad.t - pad.b);

    var vals = series.filter(function (v) { return v != null; });
    if (compare) vals = vals.concat(compare.filter(function (v) { return v != null; }));
    if (!vals.length) {
      svg.appendChild(svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle',
        fill: cssVar('--status-fg'), 'font-size': 13 })).textContent = 'No data for this selection.';
      chartCtx = null;
      return;
    }

    var dmax = Math.max.apply(null, vals);
    var dmin = Math.min.apply(null, vals);
    // Revenue-like measures anchor at zero so bar-height intuition holds; rate
    // measures do not, because their interesting variation is off-zero.
    var zeroAnchor = (state.metric === 'revenue' || state.metric === 'requests' ||
                      state.metric === 'impressions' || state.metric === 'dau');
    var lo = zeroAnchor ? 0 : dmin - (dmax - dmin) * 0.12;
    var hi = dmax + (dmax - lo) * 0.08;
    if (hi === lo) hi = lo + 1;

    var x = function (i) { return pad.l + (series.length === 1 ? pw / 2 : (i / (series.length - 1)) * pw); };
    var y = function (v) { return pad.t + ph - ((v - lo) / (hi - lo)) * ph; };

    var lineCol = cssVar('--line');
    var gridCol = cssVar('--grid');
    var mutedCol = cssVar('--muted-fg');
    var compareCol = cssVar('--compare');

    // grid + y axis
    var ticks = niceTicks(lo, hi, 5);
    ticks.forEach(function (t) {
      var yy = y(t);
      svg.appendChild(svgEl('line', { x1: pad.l, y1: yy, x2: pad.l + pw, y2: yy, stroke: gridCol, 'stroke-width': 1 }));
      var lab = svgEl('text', { x: pad.l - 9, y: yy + 4, 'text-anchor': 'end', fill: mutedCol, 'font-size': 11 });
      lab.setAttribute('style', 'font-variant-numeric: tabular-nums');
      lab.textContent = m.fmt(t);
      svg.appendChild(lab);
    });

    // x labels: first, middle, last
    [0, Math.floor((dates.length - 1) / 2), dates.length - 1].forEach(function (i, k, arr) {
      if (k > 0 && i === arr[k - 1]) return;
      var t = svgEl('text', {
        x: x(i), y: H - 8, fill: mutedCol, 'font-size': 11,
        'text-anchor': k === 0 ? 'start' : (k === arr.length - 1 ? 'end' : 'middle')
      });
      t.textContent = shortDate(dates[i]);
      svg.appendChild(t);
    });

    function pathFor(arr) {
      var d = '', pen = false;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] == null) { pen = false; continue; }
        d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(arr[i]).toFixed(1) + ' ';
        pen = true;
      }
      return d.trim();
    }

    // comparison first, so the current series sits on top
    if (compare) {
      svg.appendChild(svgEl('path', {
        d: pathFor(compare), fill: 'none', stroke: compareCol, 'stroke-width': 1.75,
        'stroke-dasharray': '5 4', 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    }

    // area wash under the current series
    var firstI = series.findIndex(function (v) { return v != null; });
    var lastI = series.length - 1 - series.slice().reverse().findIndex(function (v) { return v != null; });
    if (firstI >= 0) {
      var area = pathFor(series) + ' L' + x(lastI).toFixed(1) + ' ' + y(lo).toFixed(1) +
                 ' L' + x(firstI).toFixed(1) + ' ' + y(lo).toFixed(1) + ' Z';
      svg.appendChild(svgEl('path', { d: area, fill: cssVar('--line-wash'), stroke: 'none' }));
    }

    svg.appendChild(svgEl('path', {
      d: pathFor(series), fill: 'none', stroke: lineCol, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    // emphasized endpoint
    if (lastI >= 0 && series[lastI] != null) {
      svg.appendChild(svgEl('circle', {
        cx: x(lastI), cy: y(series[lastI]), r: 4, fill: lineCol,
        stroke: cssVar('--surface'), 'stroke-width': 2
      }));
    }

    // hover layer
    var cross = svgEl('line', { y1: pad.t, y2: pad.t + ph, stroke: mutedCol, 'stroke-width': 1, opacity: 0 });
    svg.appendChild(cross);
    var dot = svgEl('circle', { r: 4.5, fill: lineCol, stroke: cssVar('--surface'), 'stroke-width': 2, opacity: 0 });
    svg.appendChild(dot);
    var cdot = svgEl('circle', { r: 3.5, fill: compareCol, stroke: cssVar('--surface'), 'stroke-width': 2, opacity: 0 });
    svg.appendChild(cdot);

    chartCtx = { series: series, compare: compare, dates: dates, compareDates: compareDates,
                 compareShort: cmp && cmp.short, x: x, y: y, pad: pad, pw: pw,
                 cross: cross, dot: dot, cdot: cdot, W: W, metric: m };

    renderLegend(compare ? cmp.label : null, lineCol, compareCol, compareDates);
  }

  function renderLegend(compareLabel, lineCol, compareCol, compareDates) {
    if (!compareLabel) { el.chartLegend.innerHTML = ''; return; }
    // The legend carries the comparison window's actual dates. Without them
    // "previous period" is ambiguous the moment the range selector changes.
    var span = compareDates && compareDates.length
      ? ' <span class="legend-span">' + escapeHtml(niceDate(compareDates[0])) + ' to ' +
        escapeHtml(niceDate(compareDates[compareDates.length - 1])) + '</span>'
      : '';
    el.chartLegend.innerHTML =
      '<span class="legend-item"><span class="legend-swatch" style="background:' + lineCol + '"></span>This period</span>' +
      '<span class="legend-item"><span class="legend-swatch" style="background:' + compareCol +
      ';height:0;border-top:2px dashed ' + compareCol + '"></span>' + escapeHtml(compareLabel) + span + '</span>';
  }

  function onPointer(ev) {
    if (!chartCtx) return;
    var c = chartCtx;
    var rect = el.chart.getBoundingClientRect();
    var px = (ev.clientX - rect.left) * (c.W / rect.width);
    var frac = (px - c.pad.l) / c.pw;
    var i = Math.round(frac * (c.series.length - 1));
    if (i < 0) i = 0;
    if (i > c.series.length - 1) i = c.series.length - 1;

    var v = c.series[i];
    if (v == null) { hideHover(); return; }

    var xx = c.x(i), yy = c.y(v);
    c.cross.setAttribute('x1', xx); c.cross.setAttribute('x2', xx); c.cross.setAttribute('opacity', 0.35);
    c.dot.setAttribute('cx', xx); c.dot.setAttribute('cy', yy); c.dot.setAttribute('opacity', 1);

    var html = '<div class="tooltip-date">' + niceDate(c.dates[i]) + '</div>' +
               '<div class="tooltip-row"><span class="tooltip-val">' + c.metric.fmt(v) + '</span></div>';

    if (c.compare && c.compare[i] != null) {
      c.cdot.setAttribute('cx', xx); c.cdot.setAttribute('cy', c.y(c.compare[i])); c.cdot.setAttribute('opacity', 1);
      var pct = pctChange(v, c.compare[i]);
      var when = c.compareDates && c.compareDates[i] ? niceDate(c.compareDates[i]) : c.compareShort;
      html += '<div class="tooltip-row" style="color:var(--status-fg)">' + escapeHtml(when) + ' ' +
              c.metric.fmt(c.compare[i]) + (pct == null ? '' : ' &middot; ' + deltaHtml(pct)) + '</div>';
    } else {
      c.cdot.setAttribute('opacity', 0);
    }

    el.tooltip.innerHTML = html;
    el.tooltip.hidden = false;
    var tw = el.tooltip.offsetWidth;
    var left = (xx / c.W) * rect.width + 14;
    if (left + tw > rect.width) left = (xx / c.W) * rect.width - tw - 14;
    el.tooltip.style.left = Math.max(0, left) + 'px';
    el.tooltip.style.top = Math.max(0, (yy / 300) * rect.height - 10) + 'px';
  }

  function hideHover() {
    if (chartCtx) {
      chartCtx.cross.setAttribute('opacity', 0);
      chartCtx.dot.setAttribute('opacity', 0);
      chartCtx.cdot.setAttribute('opacity', 0);
    }
    el.tooltip.hidden = true;
  }

  /* ---------------- sparkline ---------------- */
  function sparkline(vals, col) {
    var w = 74, h = 20, p = 2;
    var clean = vals.filter(function (v) { return v != null; });
    if (clean.length < 2) return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '"></svg>';
    var mn = Math.min.apply(null, clean), mx = Math.max.apply(null, clean);
    if (mx === mn) mx = mn + 1;
    var d = '', pen = false;
    for (var i = 0; i < vals.length; i++) {
      if (vals[i] == null) { pen = false; continue; }
      var x = p + (i / (vals.length - 1)) * (w - p * 2);
      var y = p + (1 - (vals[i] - mn) / (mx - mn)) * (h - p * 2);
      d += (pen ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      pen = true;
    }
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
           '<path d="' + d.trim() + '" fill="none" stroke="' + col +
           '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  /* ---------------- table ---------------- */
  function renderTable() {
    var r = rangeIdx();
    var names = Object.keys(TS.apps);
    var col = cssVar('--line');

    var rows = names.map(function (name) {
      var cur = aggregate(name, 'revenue', r.a, r.b) || 0;
      var pa = r.a - r.days, prev = null;
      if (pa >= 0) prev = aggregate(name, 'revenue', pa, r.a - 1);
      return { name: name, cur: cur, pct: pctChange(cur, prev) };
    }).filter(function (row) { return row.cur > 0; })
      .sort(function (a, b) { return b.cur - a.cur; });

    var revSeries = {};
    rows.forEach(function (row) {
      revSeries[row.name] = dailySeries(row.name, 'revenue').slice(r.a, r.b + 1);
    });

    el.tbody.innerHTML = rows.map(function (row) {
      var sel = row.name === state.app ? ' class="is-selected"' : '';
      return '<tr' + sel + ' data-app="' + escapeAttr(row.name) + '" tabindex="0">' +
             '<td class="col-app">' + escapeHtml(row.name) + '</td>' +
             '<td class="num">' + money(row.cur) + '</td>' +
             '<td class="num">' + deltaHtml(row.pct) + '</td>' +
             '<td class="col-spark">' + sparkline(revSeries[row.name], col) + '</td>' +
             '</tr>';
    }).join('');

    var total = rows.reduce(function (a, b) { return a + b.cur; }, 0);
    el.tableNote.innerHTML = rows.length + ' apps with revenue &middot; ' + money(total) + ' in range' +
      ' &middot; <span style="color:var(--muted-fg)">click a row to chart it</span>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ---------------- breakdowns ---------------- */
  // Country / ad network / ad format. These live on their own shorter date axis
  // than the trend view, because the drill exports are trimmed to keep the
  // source CSVs under Drive's download cap. The header says so rather than
  // letting the two windows be silently confused.
  var bdState = { dim: null };

  function bdDims() {
    if (!TS.breakdowns) return [];
    return ['country', 'source', 'format'].filter(function (k) { return TS.breakdowns[k]; });
  }

  function renderBreakdowns() {
    var dims = bdDims();
    if (!dims.length) { el.bdCard.hidden = true; return; }
    el.bdCard.hidden = false;
    if (!bdState.dim || dims.indexOf(bdState.dim) < 0) bdState.dim = dims[0];

    el.bdTabs.innerHTML = dims.map(function (k) {
      return '<button class="bd-tab' + (k === bdState.dim ? ' is-active' : '') +
             '" data-dim="' + k + '" type="button">' + escapeHtml(TS.breakdowns[k].label) + '</button>';
    }).join('');

    var d = TS.breakdowns[bdState.dim];
    var perApp = state.app !== PORTFOLIO;

    var rows = Object.keys(d.values).map(function (key) {
      var v = d.values[key];
      if (perApp) {
        var a = v.apps[state.app];
        if (!a || a.revenue <= 0) return null;
        return { key: key, revenue: a.revenue, impressions: a.impressions,
                 ecpm: a.impressions > 0 ? (a.revenue / a.impressions) * 1000 : null, daily: null };
      }
      if (v.revenue <= 0) return null;
      return { key: key, revenue: v.revenue, impressions: v.impressions, ecpm: v.ecpm, daily: v.daily };
    }).filter(Boolean).sort(function (a, b) { return b.revenue - a.revenue; });

    var total = rows.reduce(function (a, b) { return a + b.revenue; }, 0);
    var col = cssVar('--line');
    var label = bdState.dim === 'country' ? countryLabel : function (x) { return x; };

    el.bdBody.innerHTML =
      '<table><thead><tr>' +
        '<th class="col-bd">' + escapeHtml(d.label) + '</th>' +
        '<th class="num">Revenue</th>' +
        '<th class="col-share">Share</th>' +
        '<th class="num">eCPM</th>' +
        '<th class="col-spark">Trend</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        var share = total > 0 ? (r.revenue / total) * 100 : 0;
        return '<tr>' +
          '<td class="col-bd">' + escapeHtml(label(r.key)) +
            (r.key === 'Other' ? '<span class="bd-hint">grouped long tail</span>' : '') + '</td>' +
          '<td class="num">' + money(r.revenue) + '</td>' +
          '<td class="col-share"><span class="share-bar"><span style="width:' + share.toFixed(1) +
            '%;background:' + col + '"></span></span><span class="share-pct">' + share.toFixed(1) + '%</span></td>' +
          '<td class="num">' + (r.ecpm == null ? '&ndash;' : money2(r.ecpm)) + '</td>' +
          '<td class="col-spark">' + (r.daily ? sparkline(r.daily, col) : '') + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';

    el.bdNote.innerHTML =
      rows.length + ' of ' + d.count + ' with revenue &middot; ' + money(total) +
      ' &middot; <strong>' + d.days + ' days</strong> (' + niceDate(d.from) + ' to ' + niceDate(d.to) + ')' +
      ', a shorter window than the trend above' +
      (perApp ? ' &middot; filtered to ' + escapeHtml(state.app) + ', so no daily trend' : '');
  }

  el.bdTabs.addEventListener('click', function (ev) {
    var b = ev.target.closest('.bd-tab');
    if (!b) return;
    bdState.dim = b.dataset.dim;
    renderBreakdowns();
  });

  /* ---------------- wiring ---------------- */
  // The year-ago overlay needs a full matching window one year back. With
  // roughly 14 months of history that only exists for short ranges, so the
  // control says so rather than silently doing nothing.
  // A comparison is only offered when a FULL matching window exists that far
  // back. A partial one would draw a line that stops mid-chart and reads as a
  // collapse rather than as missing history. With roughly 14 months of feed the
  // year-ago option therefore disappears on the longer ranges, and previous
  // period disappears on All.
  function syncCompareAvailability() {
    var r = rangeIdx();
    var start = niceDate(TS.dates[0]);
    var opts = el.compareSelect.options;
    for (var i = 0; i < opts.length; i++) {
      var key = opts[i].value, cmp = COMPARE[key];
      if (!cmp || !cmp.offset) { opts[i].disabled = false; opts[i].title = ''; continue; }
      var possible = (r.a - cmp.offset(r)) >= 0;
      opts[i].disabled = !possible;
      opts[i].title = possible ? '' :
        'Needs a full matching window further back. History starts ' + start + '.';
    }
    var active = COMPARE[state.compare];
    if (active && active.offset && (r.a - active.offset(r)) < 0) {
      state.compare = 'none';
      el.compareSelect.value = 'none';
    }
  }

  function redraw() {
    el.chartTitle.textContent =
      (state.app === PORTFOLIO ? 'Portfolio' : state.app) + ' · ' + METRICS[state.metric].label;
    syncCompareAvailability();
    renderHero();
    renderPeriods();
    drawChart();
    renderTable();
    renderBreakdowns();
  }

  function buildSelects() {
    // A metric is offered only when its denominator actually exists in the
    // feed, so a missing GA4 grant hides ARPDAU rather than showing zeroes.
    var have = { dau: false, dav: false };
    if (TS.portfolio.dau && TS.portfolio.dau.some(function (v) { return v != null && v > 0; })) have.dau = true;
    if (TS.portfolio.dav && TS.portfolio.dav.some(function (v) { return v != null && v > 0; })) have.dav = true;

    el.metricSelect.innerHTML = Object.keys(METRICS).filter(function (k) {
      var n = METRICS[k].needs;
      return !n || have[n];
    }).map(function (k) {
      return '<option value="' + k + '"' + (k === state.metric ? ' selected' : '') + '>' + METRICS[k].label + '</option>';
    }).join('');

    var names = Object.keys(TS.apps).sort();
    el.appSelect.innerHTML = '<option value="' + PORTFOLIO + '">All apps (portfolio)</option>' +
      names.map(function (n) { return '<option value="' + escapeAttr(n) + '">' + escapeHtml(n) + '</option>'; }).join('');
  }

  function initTrends() {
    return fetch('data/timeseries.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('timeseries.json not found');
        return res.json();
      })
      .then(function (json) {
        TS = json;
        if (CFG.name) el.title.innerHTML = escapeHtml(CFG.name) + ' &middot; Monetization';
        buildSelects();

        // "All" is the only option when history is shorter than a year.
        if (TS.dates.length < 365) { state.range = 0; syncRangeButtons(); }
        redraw();
      })
      .catch(function (err) {
        el.hero.innerHTML = '<div class="hero-label">Trends unavailable</div>' +
          '<div class="hero-deltas">' + escapeHtml(err.message) + '</div>';
      });
  }

  function syncRangeButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.seg'), function (b) {
      b.classList.toggle('is-active', Number(b.dataset.range) === state.range);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.seg'), function (btn) {
    btn.addEventListener('click', function () {
      state.range = Number(btn.dataset.range);
      syncRangeButtons();
      redraw();
    });
  });
  el.metricSelect.addEventListener('change', function () { state.metric = el.metricSelect.value; redraw(); });
  el.appSelect.addEventListener('change', function () { state.app = el.appSelect.value; redraw(); });
  el.compareSelect.addEventListener('change', function () {
    state.compare = el.compareSelect.value;
    drawChart();
  });

  // Buttons, so keyboard activation comes for free.
  el.periods.addEventListener('click', function (ev) {
    var card = ev.target.closest('.pcard[data-days]');
    if (!card) return;
    state.range = Number(card.dataset.days);
    syncRangeButtons();
    redraw();
  });

  el.tbody.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-app]');
    if (!tr) return;
    var name = tr.dataset.app;
    state.app = (state.app === name) ? PORTFOLIO : name;
    el.appSelect.value = state.app;
    redraw();
  });
  el.tbody.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var tr = ev.target.closest('tr[data-app]');
    if (!tr) return;
    ev.preventDefault();
    tr.click();
  });

  el.chart.addEventListener('pointermove', onPointer);
  el.chart.addEventListener('pointerleave', hideHover);

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (TS) drawChart();
      fitFrame();
    }, 120);
  });

  /* ---------------- daily report view ---------------- */
  function setStatus(msg) {
    el.reportStatus.textContent = msg || '';
    el.reportStatus.style.display = msg ? 'block' : 'none';
  }
  function dateLabel(iso) {
    return iso ? niceDate(iso) : 'the latest day';
  }
  function reportNotice(report) {
    if (!report || !report.state) return '';
    if (report.state === 'processing') {
      return 'Daily reports are catching up to ' + dateLabel(report.latestTrendDate) +
        '. Latest available report is ' + dateLabel(report.latestReportDate || report.latestRawReportDate) + '.';
    }
    if (report.state === 'reconciled' && report.reconciledDates && report.reconciledDates.length) {
      return 'Latest Daily Report is current from the trends feed while raw CSV details catch up.';
    }
    if (report.state === 'unavailable') {
      return 'Daily report source data has not been pushed yet.';
    }
    return '';
  }
  function fitFrame() {
    var f = el.reportFrame;
    try {
      var doc = f.contentDocument;
      if (doc && doc.body) f.style.height = (doc.documentElement.scrollHeight + 24) + 'px';
    } catch (e) { /* cross-origin cannot happen with srcdoc, but stay safe */ }
  }

  function loadReport(date) {
    setStatus('Loading ' + date + '...');
    el.reportFrame.style.visibility = 'hidden';
    return fetch('data/' + date + '.html', { cache: 'no-store' }).then(function (res) {
      if (!res.ok) { setStatus('No report published for ' + date + '.'); return; }
      return res.text().then(function (html) {
        el.reportFrame.onload = function () {
          fitFrame();
          el.reportFrame.style.visibility = '';
          // Late web-font or image layout can change height after load.
          setTimeout(fitFrame, 150);
        };
        // The digest's own CSS honours :root[data-theme], but srcdoc is a
        // separate document that otherwise falls back to prefers-color-scheme.
        // Passing the shell's actual theme through keeps the embedded report
        // in step with the dashboard chrome instead of the OS/browser setting.
        var theme = document.documentElement.getAttribute('data-theme') || 'light';
        el.reportFrame.srcdoc =
          '<!doctype html><html data-theme="' + theme + '"><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width, initial-scale=1">' +
          '<style>html,body{margin:0;padding:0}</style></head><body>' + html + '</body></html>';
        setStatus('');
      });
    }).catch(function (err) { setStatus('Failed to load ' + date + ': ' + err.message); });
  }
  var dailyReady = false;
  function initDaily() {
    if (dailyReady) return Promise.resolve();
    dailyReady = true;
    return fetch('data/manifest.json', { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('no manifest'); return res.json(); })
      .then(function (mf) {
        var dates = Array.isArray(mf.dates) ? mf.dates.slice().sort() : [];
        var notice = reportNotice(mf.report);
        if (!dates.length) { setStatus(notice || 'No reports published yet.'); return; }
        var max = dates[dates.length - 1];
        el.dateInput.min = dates[0];
        el.dateInput.max = max;
        el.dateInput.value = max;
        el.dateInput.addEventListener('change', function () {
          if (el.dateInput.value) loadReport(el.dateInput.value);
        });
        return loadReport(max).then(function () { if (notice) setStatus(notice); });
      })
      .catch(function () { setStatus('No reports published yet.'); });
  }

  function showView(which) {
    var trends = which === 'trends';
    el.viewTrends.hidden = !trends;
    el.viewDaily.hidden = trends;
    el.dailyControls.hidden = trends;
    el.tabTrends.classList.toggle('is-active', trends);
    el.tabDaily.classList.toggle('is-active', !trends);
    el.tabTrends.setAttribute('aria-selected', String(trends));
    el.tabDaily.setAttribute('aria-selected', String(!trends));
    if (!trends) initDaily();
    else if (TS) drawChart();
  }
  if (RPT_MODE === 'trends' || RPT_MODE === 'daily') {
    el.tabTrends.hidden = true;
    el.tabDaily.hidden = true;
    el.title.textContent = RPT_MODE === 'daily' ? 'Daily Reports' : 'Trends';
  }
  el.tabTrends.addEventListener('click', function () { showView('trends'); });
  el.tabDaily.addEventListener('click', function () { showView('daily'); });

  initTrends().then(function () {
    showView(RPT_MODE === 'daily' ? 'daily' : 'trends');
  });
})();
