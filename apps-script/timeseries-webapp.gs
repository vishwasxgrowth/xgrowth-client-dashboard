/**
 * Timeseries web app — serves the monetization dashboard's timeseries.json
 * straight from THIS client's private feed sheet. Runs as the sheet owner, so
 * the sheet stays private: no service account, no key, no org policy.
 *
 * Ported 1:1 from scripts/build-timeseries.mjs so the shape matches the UI.
 *
 * DEPLOY (once per client, signed in as that client's Google account):
 *   1. Open the client's feed sheet → Extensions → Apps Script.
 *   2. Paste this file. Edit CONFIG below (client key, displayName, tab names,
 *      engagementStart if you want the impact block).
 *   3. Deploy → New deployment → type "Web app".
 *        Execute as: Me.   Who has access: Anyone.
 *   4. Copy the /exec URL. Optionally set SECRET and call it with ?key=SECRET.
 */

var CONFIG = {
  client: 'jedyapps',
  displayName: 'JedyApps',
  currency: 'USD',
  // Set to null to omit the engagement/impact block. (JedyApps takeover date.)
  engagementStart: '2026-05-11',
  engagementNote: null,
  pilotStart: null,
  pilotApps: [],
  appAliases: {},
  // Tab names in the sheet. AppDaily may be the first tab; we fall back to it.
  tabs: { appDaily: 'AppDaily', users: 'Users', country: 'Country', source: 'Source', format: 'Format', privacy: 'Privacy' },
  dimCols: { country: 'COUNTRY', source: 'AD_SOURCE', format: 'FORMAT' }
};
var SECRET = ''; // set a string to require ?key=... ; leave '' for open access

var SCHEMA_VERSION = 1;

function doGet(e) {
  try {
    if (SECRET && (!e || !e.parameter || e.parameter.key !== SECRET)) {
      return json_({ error: 'unauthorized' });
    }
    return json_(build_());
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- helpers ---------------- */
function num_(v) { var n = Number(String(v).replace(/[$,]/g, '')); return isFinite(n) ? n : 0; }
function fmtYmd_(s) { s = String(s); return s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6,8); }
function ymd_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyyMMdd');
  var s = String(v).trim().replace(/-/g, '');
  return s;
}
function ss_() { return CONFIG.sheetId ? SpreadsheetApp.openById(CONFIG.sheetId) : SpreadsheetApp.getActiveSpreadsheet(); }
function readTab_(name, fallbackFirst) {
  var ss = ss_(); var sh = name ? ss.getSheetByName(name) : null;
  if (!sh && fallbackFirst) sh = ss.getSheets()[0];
  if (!sh) return null;
  var vals = sh.getDataRange().getValues();
  if (!vals.length) return { header: [], rows: [] };
  var header = vals[0].map(function (h) { return String(h).trim().toUpperCase(); });
  return { header: header, rows: vals.slice(1) };
}

/* ---------------- build (ported from build-timeseries.mjs) ---------------- */
function build_() {
  var aliases = CONFIG.appAliases || {};
  var alias = function (n) { return aliases[n] || n; };

  var ad = readTab_(CONFIG.tabs.appDaily, true);
  if (!ad) throw new Error('AppDaily tab not found');
  ['DATE','APP','ESTIMATED_EARNINGS'].forEach(function (c) {
    if (ad.header.indexOf(c) < 0) throw new Error('AppDaily missing column ' + c + '. Header: ' + ad.header.join(','));
  });
  var ix = {}; ad.header.forEach(function (h, i) { ix[h] = i; });

  var grid = {}, appSet = {};
  ad.rows.forEach(function (r) {
    var d = ymd_(r[ix.DATE]); if (!/^\d{8}$/.test(d)) return;
    var app = alias(String(r[ix.APP] || '').trim()); if (!app) return;
    appSet[app] = 1;
    (grid[d] = grid[d] || {});
    var cur = grid[d][app] || { rev: 0, imp: 0, req: 0, mat: 0 };
    cur.rev += num_(r[ix.ESTIMATED_EARNINGS]);
    cur.imp += num_(r[ix.IMPRESSIONS]);
    cur.req += num_(r[ix.AD_REQUESTS]);
    cur.mat += num_(r[ix.MATCHED_REQUESTS]);
    grid[d][app] = cur;
  });

  var userGrid = null;
  var u = readTab_(CONFIG.tabs.users, false);
  if (u && u.header.indexOf('DAU') >= 0) {
    var ui = {}; u.header.forEach(function (h, i) { ui[h] = i; });
    userGrid = {};
    u.rows.forEach(function (r) {
      var d = ymd_(r[ui.DATE]); if (!/^\d{8}$/.test(d)) return;
      var app = alias(String(r[ui.APP] || '').trim()); if (!app) return;
      (userGrid[d] = userGrid[d] || {});
      var cur = userGrid[d][app] || { dau: 0, dav: 0 };
      cur.dau += num_(r[ui.DAU]); cur.dav += num_(r[ui.DAV]);
      userGrid[d][app] = cur;
    });
  }

  var dates = Object.keys(grid).sort();
  var apps = Object.keys(appSet).sort();
  var col = function () { var a = new Array(dates.length); for (var i=0;i<dates.length;i++) a[i]=null; return a; };
  var portfolio = { revenue: col(), impressions: col(), requests: col(), matched: col() };
  var appSeries = {};
  apps.forEach(function (a) {
    appSeries[a] = { revenue: col(), impressions: col(), requests: col(), matched: col() };
    if (userGrid) { appSeries[a].dau = col(); appSeries[a].dav = col(); }
  });
  var pUsers = userGrid ? { dau: col(), dav: col() } : null;

  dates.forEach(function (d, i) {
    var day = grid[d], pr=0,pi=0,pq=0,pm=0;
    Object.keys(day).forEach(function (app) {
      var v = day[app], s = appSeries[app];
      s.revenue[i] = Math.round(v.rev*1e6)/1e6; s.impressions[i]=v.imp; s.requests[i]=v.req; s.matched[i]=v.mat;
      pr+=v.rev; pi+=v.imp; pq+=v.req; pm+=v.mat;
    });
    portfolio.revenue[i]=Math.round(pr*1e6)/1e6; portfolio.impressions[i]=pi; portfolio.requests[i]=pq; portfolio.matched[i]=pm;
    if (userGrid) {
      var uday = userGrid[d], pdau=0, pdav=0;
      if (uday) Object.keys(uday).forEach(function (app) {
        var v = uday[app]; if (appSeries[app]) { appSeries[app].dau[i]=v.dau; appSeries[app].dav[i]=v.dav; } pdau+=v.dau; pdav+=v.dav;
      });
      pUsers.dau[i]= uday?pdau:null; pUsers.dav[i]= uday?pdav:null;
    }
  });
  if (pUsers) { portfolio.dau = pUsers.dau; portfolio.dav = pUsers.dav; }

  var mappedApps = userGrid ? apps.filter(function (a){ return appSeries[a].dau && appSeries[a].dau.some(function (v){return v!=null;}); }) : [];

  /* engagement impact (ported) */
  var pct = function (cur, prev){ return (cur==null||prev==null||prev===0)?null:((cur-prev)/Math.abs(prev))*100; };
  var sumCovered = function (key,a,b,names){
    if (!names){ var t=0; for (var i=a;i<=b;i++) if (portfolio[key][i]!=null) t+=portfolio[key][i]; return t; }
    var tt=0; for (var i2=a;i2<=b;i2++){ var ok=names.every(function(x){return appSeries[x]&&appSeries[x].revenue[i2]!=null;}); if(!ok) continue; names.forEach(function(x){var s=appSeries[x]; if(s&&s[key]&&s[key][i2]!=null) tt+=s[key][i2];}); } return tt;
  };
  var dayCounts = function (a,b,names){ var n=0; for (var i=a;i<=b;i++){ if(!names){ if(portfolio.revenue[i]!=null)n++; } else if(names.every(function(x){return appSeries[x]&&appSeries[x].revenue[i]!=null;})) n++; } return n; };

  function windowStats(a,b,names,scope){
    var hasUsers=!!userGrid;
    var ratio=function(nk,dk,s){ var sn=sumCovered(nk,a,b,s), sd=sumCovered(dk,a,b,s); return sd>0?(sn/sd):null; };
    var rev=sumCovered('revenue',a,b,names), days=dayCounts(a,b,names);
    return { from:fmtYmd_(dates[a]), to:fmtYmd_(dates[b]), days:days, spanDays:b-a+1,
      revenue:Math.round(rev*100)/100, revenuePerDay:days>0?Math.round((rev/days)*100)/100:null,
      ecpm:(function(){var v=ratio('revenue','impressions',names);return v==null?null:v*1000;})(),
      arpdau:hasUsers?ratio('revenue','dau',scope):null, arpdav:hasUsers?ratio('revenue','dav',scope):null };
  }
  function impactFor(startDate,names,label,endBefore){
    var startYmd=String(startDate).replace(/-/g,'');
    var si=dates.findIndex(function(d){return d>=startYmd;}); if(si<0) return null;
    var lastIdx=dates.length-1;
    if(endBefore){ var cap=String(endBefore).replace(/-/g,''); var ci=dates.findIndex(function(d){return d>=cap;}); if(ci>si) lastIdx=ci-1; }
    var n=Math.min(lastIdx-si+1, si); if(n<7) return null;
    var scope=(names===null && mappedApps.length && mappedApps.length<apps.length)?mappedApps:names;
    var post=windowStats(si,si+n-1,names,scope), pre=windowStats(si-n,si-1,names,scope);
    return { start:String(startDate), phase:label, windowDays:n, apps:names?names.slice():null,
      partialCoverage:(pre.days<pre.spanDays||post.days<post.spanDays), pre:pre, post:post,
      change:{ revenuePerDay:pct(post.revenuePerDay,pre.revenuePerDay), ecpm:pct(post.ecpm,pre.ecpm), arpdau:pct(post.arpdau,pre.arpdau), arpdav:pct(post.arpdav,pre.arpdav) },
      headline: userGrid?'arpdau':null,
      headlineUnavailable: userGrid?null:'No GA4 data, so no traffic-normalised impact figure is possible.' };
  }
  function nowVsBefore(startDate,names){
    var startYmd=String(startDate).replace(/-/g,'');
    var si=dates.findIndex(function(d){return d>=startYmd;}); if(si<0) return null;
    var n=Math.min(si, dates.length-si); if(n<7) return null;
    var scope=(names===null && mappedApps.length && mappedApps.length<apps.length)?mappedApps:names;
    var before=windowStats(si-n,si-1,names,scope), now=windowStats(dates.length-n,dates.length-1,names,scope);
    return { windowDays:n, before:before, now:now,
      change:{ revenuePerDay:pct(now.revenuePerDay,before.revenuePerDay), ecpm:pct(now.ecpm,before.ecpm), arpdau:pct(now.arpdau,before.arpdau), arpdav:pct(now.arpdav,before.arpdav) },
      headline: userGrid?'arpdau':null };
  }
  var engagement=null;
  if (CONFIG.engagementStart) {
    var main = impactFor(CONFIG.engagementStart, null, 'portfolio');
    if (main) { engagement=main; engagement.current=nowVsBefore(CONFIG.engagementStart,null); engagement.note=CONFIG.engagementNote||null;
      if (CONFIG.pilotStart && CONFIG.pilotApps && CONFIG.pilotApps.length) {
        var known=CONFIG.pilotApps.filter(function(a){return appSeries[a];});
        if (known.length) engagement.pilot=impactFor(CONFIG.pilotStart, known, 'pilot', CONFIG.engagementStart);
      }
    }
  }

  /* dimension breakdowns */
  function buildDim(tabName, dimCol, label) {
    var t = readTab_(tabName, false); if (!t || t.header.indexOf(dimCol)<0 || t.header.indexOf('ESTIMATED_EARNINGS')<0) return null;
    var di={}; t.header.forEach(function(h,i){di[h]=i;});
    var dimDatesSet={}, grid={};
    t.rows.forEach(function(r){
      var d=ymd_(r[di.DATE]); if(!/^\d{8}$/.test(d)) return;
      var app=alias(String(r[di.APP]||'').trim()); var key=String(r[di[dimCol]]||'').trim(); if(!key) return;
      dimDatesSet[d]=1; (grid[key]=grid[key]||{}); (grid[key][app]=grid[key][app]||{});
      var cur=grid[key][app][d]||{rev:0,imp:0,req:0,mat:0};
      cur.rev+=num_(r[di.ESTIMATED_EARNINGS]); cur.imp+=num_(r[di.IMPRESSIONS]); cur.req+=num_(r[di.AD_REQUESTS]); cur.mat+=num_(r[di.MATCHED_REQUESTS]);
      grid[key][app][d]=cur;
    });
    var dDates=Object.keys(dimDatesSet).sort(); if(!dDates.length) return null;
    var dIdx={}; dDates.forEach(function(d,i){dIdx[d]=i;});
    var values={};
    Object.keys(grid).forEach(function(key){
      var byApp=grid[key], total=new Array(dDates.length); for(var z=0;z<dDates.length;z++) total[z]=null;
      var apps2={}, tRev=0,tImp=0,tReq=0,tMat=0;
      Object.keys(byApp).forEach(function(app){
        var aRev=0,aImp=0; var byDate=byApp[app];
        Object.keys(byDate).forEach(function(d){ var v=byDate[d], i=dIdx[d]; total[i]=(total[i]||0)+v.rev; aRev+=v.rev; aImp+=v.imp; tRev+=v.rev; tImp+=v.imp; tReq+=v.req; tMat+=v.mat; });
        apps2[app]={revenue:Math.round(aRev*100)/100, impressions:aImp};
      });
      values[key]={ revenue:Math.round(tRev*100)/100, impressions:tImp, requests:tReq, matched:tMat,
        ecpm:tImp>0?(tRev/tImp)*1000:null, daily:total.map(function(v){return v==null?null:Math.round(v*100)/100;}), apps:apps2 };
    });
    return { label:label, dimension:dimCol, dates:dDates.map(fmtYmd_), from:fmtYmd_(dDates[0]), to:fmtYmd_(dDates[dDates.length-1]), days:dDates.length, count:Object.keys(values).length, values:values };
  }
  var breakdowns={};
  var country=buildDim(CONFIG.tabs.country, CONFIG.dimCols.country, 'Country');
  var source=buildDim(CONFIG.tabs.source, CONFIG.dimCols.source, 'Ad network');
  var format=buildDim(CONFIG.tabs.format, CONFIG.dimCols.format, 'Ad format');
  if (country) breakdowns.country=country; if (source) breakdowns.source=source; if (format) breakdowns.format=format;

  return {
    schemaVersion: SCHEMA_VERSION, client: CONFIG.client, displayName: CONFIG.displayName||CONFIG.client, currency: CONFIG.currency||'USD',
    engagement: engagement,
    metrics: { stored: ['revenue','impressions','requests','matched'].concat(userGrid?['dau','dav']:[]),
      derived: { ecpm:'revenue / impressions * 1000', matchRate:'matched / requests', showRate:'impressions / matched', arpdau:'revenue / dau' },
      note: 'Rates are derived from summed components at read time, never averaged across apps or days.' },
    sources: { admob: { from: fmtYmd_(dates[0]), to: fmtYmd_(dates[dates.length-1]), days: dates.length, apps: apps.length, users: !!userGrid } },
    dates: dates.map(fmtYmd_), portfolio: portfolio, apps: appSeries,
    breakdowns: Object.keys(breakdowns).length?breakdowns:null
  };
}

/* =================================================================
 * PUSH MODE (recommended when the org blocks public web apps)
 * Builds the timeseries and POSTs it to the Cloud Function, which
 * stores it in GCS and serves it to the dashboard. No public web
 * app needed — this runs as you, inside the domain.
 *
 * SETUP:
 *   1. Set PUSH_URL below. Put the push key in Script Properties as
 *      XG_PUSH_KEY (must match the XG_PUSH_SECRET secret on the Cloud
 *      Function). Never commit the real key to the repo.
 *   2. Run pushTimeseries() once (authorize when prompted).
 *   3. Run installDailyTrigger() once to refresh automatically (~09:00,
 *      after the AdMob feed and GA4 pull have written the day).
 * ================================================================= */
var PUSH_URL = 'https://us-central1-dolphin-fdffc.cloudfunctions.net/xgClientApi/timeseries-push';
// The push key must equal the XG_PUSH_SECRET set on the Cloud Function. Do NOT
// hardcode the real value in the repo. Store it per-sheet in Script Properties
// (Project Settings > Script Properties) under key XG_PUSH_KEY; the constant
// below is only a fallback/placeholder for quick local testing.
var PUSH_KEY = 'SET_ME_TO_MATCH_XG_PUSH_SECRET';
function pushKey_() {
  return PropertiesService.getScriptProperties().getProperty('XG_PUSH_KEY') || PUSH_KEY;
}

function pushTimeseries() {
  var snapshot = build_();
  var payload = JSON.stringify(snapshot);
  var csvErrors = [];

  // Push the report feed before the JSON feed so raw Daily Reports normally
  // arrive first. If this fails, keep pushing the JSON feed so Trends remain
  // current; the backend can reconcile missing AppDaily rows from that feed and
  // the trigger failure makes the CSV problem visible in Apps Script logs.
  try {
    pushTabCsv_('AppDaily', CONFIG.tabs.appDaily, true);
  } catch (err) {
    csvErrors.push('AppDaily: ' + err);
    Logger.log('push AppDaily.csv failed: ' + err);
  }
  [
    ['Users', CONFIG.tabs.users],
    ['Country', CONFIG.tabs.country],
    ['Source', CONFIG.tabs.source],
    ['Format', CONFIG.tabs.format],
    ['Privacy', CONFIG.tabs.privacy]
  ].forEach(function (item) {
    try { pushTabCsv_(item[0], item[1], false); }
    catch (err) {
      csvErrors.push(item[0] + ': ' + err);
      Logger.log('push ' + item[0] + '.csv failed: ' + err);
    }
  });

  var url = PUSH_URL + '?clientId=' + encodeURIComponent(CONFIG.client) + '&key=' + encodeURIComponent(pushKey_());
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: payload,
    headers: { 'X-Push-Key': pushKey_() }, muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  Logger.log('push status ' + code + ': ' + res.getContentText().slice(0, 200));
  if (code >= 300) throw new Error('push failed ' + code + ': ' + res.getContentText().slice(0, 200));
  if (csvErrors.length) throw new Error('push completed with CSV errors: ' + csvErrors.join('; '));
  return code;
}

// Upload one tab as <clientId>/<label>.csv to the same push endpoint.
function pushTabCsv_(label, tabName, required) {
  var tab = readTab_(tabName, false);
  if (!tab || !tab.rows.length) {
    if (required) throw new Error(label + '.csv has no rows');
    Logger.log('skip ' + label + '.csv (no rows)');
    return null;
  }
  var url = PUSH_URL.replace('/timeseries-push', '/csv-push') +
    '?clientId=' + encodeURIComponent(CONFIG.client) +
    '&name=' + encodeURIComponent(label) +
    '&key=' + encodeURIComponent(pushKey_());
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'text/csv', payload: tabToCsv_(tab),
    headers: { 'X-Push-Key': pushKey_() }, muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  Logger.log('push ' + label + '.csv status ' + code);
  if (code >= 300) throw new Error(label + '.csv push failed ' + code + ': ' + res.getContentText().slice(0, 200));
  return code;
}

function tabToCsv_(tab) {
  var lines = [tab.header.map(function (h) { return csvCell_(h, ''); }).join(',')];
  tab.rows.forEach(function (r) {
    lines.push(r.map(function (v, i) {
      return csvCell_(v, tab.header[i]);
    }).join(','));
  });
  return lines.join('\n');
}

function csvCell_(v, header) {
  var s;
  if (String(header || '').toUpperCase() === 'DATE') {
    var d = ymd_(v);
    s = /^\d{8}$/.test(d) ? d : ((v === null || v === undefined) ? '' : String(v));
  } else {
    s = (v === null || v === undefined) ? '' : String(v);
  }
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pushTimeseries') ScriptApp.deleteTrigger(t);
  });
  // 09:00 local — after the AdMob feed (07:00) and the GA4 users pull (08:00),
  // so the push always builds from a fully-written day.
  ScriptApp.newTrigger('pushTimeseries').timeBased().everyDays(1).atHour(9)
    .inTimezone(Session.getScriptTimeZone()).create();
  Logger.log('Daily trigger installed (pushTimeseries ~09:00 ' + Session.getScriptTimeZone() + ').');
}

// Undo installDailyTrigger — use on a sheet that should stop pushing (e.g. an
// old snapshot sheet after repointing the dashboard to the real feed sheet).
function removePushTrigger() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pushTimeseries') { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log('Removed ' + n + ' pushTimeseries trigger(s).');
}
