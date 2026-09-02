process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("../index.js");

test("client ids are bounded to storage-safe names", () => {
  assert.equal(_test.CLIENT_RE.test("jedyapps"), true);
  assert.equal(_test.CLIENT_RE.test("client_01"), true);
  assert.equal(_test.CLIENT_RE.test("../jedyapps"), false);
  assert.equal(_test.CLIENT_RE.test(""), false);
});

test("timeseries payloads must match the configured client and schema", () => {
  const valid = JSON.stringify({
    schemaVersion: 1,
    client: "jedyapps",
    dates: ["2026-08-28"],
    portfolio: { revenue: [1], impressions: [1000] },
    apps: { "Hero App": { revenue: [1], impressions: [1000] } },
  });
  assert.equal(_test.validateTimeseriesPayload(valid, "jedyapps"), null);
  assert.equal(_test.validateTimeseriesPayload(valid, "other"), "payload client does not match clientId");
  assert.equal(_test.validateTimeseriesPayload("{", "jedyapps"), "invalid JSON");
  assert.equal(_test.validateTimeseriesPayload(JSON.stringify({ schemaVersion: 1, client: "jedyapps", dates: ["20260828"], portfolio: {}, apps: {} }), "jedyapps"), "dates must be YYYY-MM-DD");
});

test("csv pushes are limited to known report tabs with required headers", () => {
  assert.equal(_test.validateCsvPayload("AppDaily", "DATE,APP,ESTIMATED_EARNINGS\n20260828,App,1"), null);
  assert.equal(_test.validateCsvPayload("Country", "DATE,APP,ESTIMATED_EARNINGS\n20260828,App,1"), "missing columns: COUNTRY");
  assert.equal(_test.validateCsvPayload("Unknown", "DATE,APP\n"), "unsupported csv name");
});

test("report manifests can derive renderable dates from AppDaily CSV", () => {
  const csv = [
    '"APP",DATE,ESTIMATED_EARNINGS',
    '"A, quoted app",20260827,1.00',
    'Other,2026-08-26,2.00',
    'Bad,not-a-date,3.00',
  ].join("\n");
  assert.deepEqual(_test.csvCells('"A, quoted app",20260827,1.00'), ["A, quoted app", "20260827", "1.00"]);
  assert.deepEqual(_test.datesFromCsv(csv), ["2026-08-27", "2026-08-26"]);
});

test("report AppDaily CSV can be reconciled from a newer timeseries feed", () => {
  const csv = [
    "DATE,APP,ESTIMATED_EARNINGS,IMPRESSIONS,AD_REQUESTS,MATCHED_REQUESTS",
    '20260827,"A, quoted app",1.25,100,120,110',
  ].join("\n");
  const ts = {
    dates: ["2026-08-27", "2026-08-28"],
    apps: {
      "A, quoted app": { revenue: [1.25, 2.5], impressions: [100, 200], requests: [120, 240], matched: [110, 220] },
      "Zero App": { revenue: [0, 0], impressions: [0, 0], requests: [0, 0], matched: [0, 0] },
    },
  };
  const merged = _test.mergeAppDailyWithTimeseries(csv, ts);
  assert.deepEqual(merged.rawDates, ["2026-08-27"]);
  assert.deepEqual(merged.reconciledDates, ["2026-08-28"]);
  assert.deepEqual(merged.pendingDates, []);
  assert.deepEqual(merged.dates, ["2026-08-28", "2026-08-27"]);
  assert.match(merged.text, /20260828,"A, quoted app",2.5,200,240,220/);
  assert.match(merged.text, /20260828,Zero App,0,0,0,0/);

  const state = _test.reportStateFromMerge(merged, true, null);
  assert.equal(state.state, "reconciled");
  assert.equal(state.latestTrendDate, "2026-08-28");
  assert.equal(state.latestReportDate, "2026-08-28");
  assert.equal(state.latestRawReportDate, "2026-08-27");

  const second = _test.mergeAppDailyWithTimeseries(merged.text, ts);
  assert.deepEqual(second.reconciledDates, []);
  assert.deepEqual(second.dates, ["2026-08-28", "2026-08-27"]);
});

test("report reconciliation exposes processing state when timeseries has no usable app rows", () => {
  const merged = _test.mergeAppDailyWithTimeseries("DATE,APP,ESTIMATED_EARNINGS\n20260827,App,1", {
    dates: ["2026-08-27", "2026-08-28", "bad-date"],
    apps: { App: { revenue: [1, null], impressions: [10, null], requests: [20, null], matched: [15, null] } },
  });
  assert.deepEqual(_test.datesFromTimeseries({ dates: ["bad", "2026-08-28"] }), ["2026-08-28"]);
  assert.deepEqual(merged.reconciledDates, []);
  assert.deepEqual(merged.pendingDates, ["2026-08-28"]);
  assert.equal(_test.reportStateFromMerge(merged, true, null).state, "processing");
});

test("AdMob proxy exposes only mediation report generation", () => {
  assert.equal(_test.isAllowedAdmobProxy("/admob/v1alpha/accounts/pub-123/mediationReport:generate", "POST"), true);
  assert.equal(_test.isAllowedAdmobProxy("/admob/v1alpha/accounts/pub-123/mediationReport:generate", "GET"), false);
  assert.equal(_test.isAllowedAdmobProxy("/admob/v1/accounts/pub-123/apps", "GET"), false);
});

test("ClickUp proxy exposes dashboard read paths and safe task writes", () => {
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/folder/901210858217", "GET"), true);
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/list/123/task", "GET"), true);
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/task/abcDEF123", "PUT"), true);
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/task/abcDEF123/field/field_1", "POST"), true);
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/task/abcDEF123/comment", "POST"), false);
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/user/123", "GET"), false);
});

test("proxy queries are stripped to route-specific allowlists", () => {
  const query = _test.restQuery("/clickup/api/v2/list/123/task?clientId=jedyapps&key=secret&page=2&include_closed=true&debug=1", ["page", "include_closed"]);
  assert.equal(query, "?page=2&include_closed=true");
  assert.deepEqual(_test.clickUpQueryKeys("/clickup/api/v2/list/123/task"), ["include_closed", "subtasks", "page"]);
  assert.deepEqual(_test.clickUpQueryKeys("/clickup/api/v2/task/abcDEF123"), ["include_subtasks"]);
});

test("ClickUp writes are restricted to safe task and custom-field updates", () => {
  assert.equal(_test.validateClickUpWrite({ method: "PUT", body: { status: "done" } }), null);
  assert.equal(_test.validateClickUpWrite({ method: "PUT", body: { name: "A better task", description: "Details", priority: 2 } }), null);
  assert.equal(_test.validateClickUpWrite({ method: "PUT", body: { status: "done", unsafe: "someone" } }), "unsupported task update field");
  assert.equal(_test.validateClickUpWrite({ method: "PUT", body: { status: "" } }), "invalid status");
  assert.equal(_test.validateClickUpWrite({ method: "POST", body: { value: "Ad size" } }), null);
  assert.equal(_test.validateClickUpWrite({ method: "POST", body: { value: "Ad size", extra: true } }), "only custom field value updates are allowed");
});

test("account names and timing-safe comparisons reject unsafe input", () => {
  assert.equal(_test.validAccountName("accounts/pub-123456"), true);
  assert.equal(_test.validAccountName("accounts/pub-abc"), false);
  assert.equal(_test.safeEqual("secret", "secret"), true);
  assert.equal(_test.safeEqual("secret", "secret2"), false);
});
