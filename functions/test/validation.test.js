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

test("AdMob proxy exposes only mediation report generation", () => {
  assert.equal(_test.isAllowedAdmobProxy("/admob/v1alpha/accounts/pub-123/mediationReport:generate", "POST"), true);
  assert.equal(_test.isAllowedAdmobProxy("/admob/v1alpha/accounts/pub-123/mediationReport:generate", "GET"), false);
  assert.equal(_test.isAllowedAdmobProxy("/admob/v1/accounts/pub-123/apps", "GET"), false);
});

test("ClickUp proxy exposes only dashboard read paths and status writes", () => {
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/folder/901210858217", "GET"), true);
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/list/123/task", "GET"), true);
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/task/abcDEF123", "PUT"), true);
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/task/abcDEF123/comment", "POST"), false);
  assert.equal(_test.isAllowedClickUpProxy("/clickup/api/v2/user/123", "GET"), false);
});

test("proxy queries are stripped to route-specific allowlists", () => {
  const query = _test.restQuery("/clickup/api/v2/list/123/task?clientId=jedyapps&key=secret&page=2&include_closed=true&debug=1", ["page", "include_closed"]);
  assert.equal(query, "?page=2&include_closed=true");
  assert.deepEqual(_test.clickUpQueryKeys("/clickup/api/v2/list/123/task"), ["include_closed", "subtasks", "page"]);
  assert.deepEqual(_test.clickUpQueryKeys("/clickup/api/v2/task/abcDEF123"), ["include_subtasks"]);
});

test("ClickUp writes are status-only", () => {
  assert.equal(_test.validateClickUpWrite({ method: "PUT", body: { status: "done" } }), null);
  assert.equal(_test.validateClickUpWrite({ method: "PUT", body: { status: "done", assignee: "someone" } }), "only task status updates are allowed");
  assert.equal(_test.validateClickUpWrite({ method: "PUT", body: { status: "" } }), "invalid status");
});

test("account names and timing-safe comparisons reject unsafe input", () => {
  assert.equal(_test.validAccountName("accounts/pub-123456"), true);
  assert.equal(_test.validAccountName("accounts/pub-abc"), false);
  assert.equal(_test.safeEqual("secret", "secret"), true);
  assert.equal(_test.safeEqual("secret", "secret2"), false);
});
