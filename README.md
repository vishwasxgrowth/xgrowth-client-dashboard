# Xgrowth Client Dashboard

Standalone, client-facing dashboard for one client deployment. The app is a
Vite/React frontend backed by a Firebase Function. In production, the dashboard
loads the cached monetization timeseries that Apps Script pushes from the
client feed sheet; ClickUp loads on demand when workspace views need it.

## Run locally
```
npm install
cp .env.example .env
npm run dev
```

## Validate
```
npm run typecheck
npm run build
npm --prefix functions test
npm test
```

## Env (per client)
- `VITE_FUNCTIONS_BASE_URL` - deployed `xgClientApi` function URL.
- `VITE_CLIENT_ID` - short storage/client key, for example `jedyapps`.
- `VITE_CLIENT_NAME` - shown in the dashboard shell.
- `VITE_CLIENT_ADMOB_ACCOUNT` - for example `accounts/pub-XXXXXXXXXXXXXXXX`.
- `VITE_CLIENT_CLICKUP_FOLDER` - the client's ClickUp folder id.
- `VITE_GOOGLE_CLIENT_ID` - only needed for browser-direct AdMob dev mode.
- `VITE_DEV_ACCESS_TOKEN` - optional local-only AdMob token. Leave unset in production.

## Build
```
npm run build
```

Deploy `dist/` to the selected static host only after the backend URL and
allowed origins are configured.

## Notes
- Apps Script pushes `timeseries.json` plus raw CSV tabs (`AppDaily`, `Users`,
  `Country`, `Source`, `Format`, `Privacy`) into Google Cloud Storage through
  `/timeseries-push` and `/csv-push`.
- If the JSON timeseries reaches a newer date before `AppDaily.csv`, the
  backend reconciles the missing AppDaily rows from the timeseries feed,
  persists that recovered report input, and exposes report readiness in
  `/report-manifest`.
- The dashboard's default production data path reads `/timeseries`, avoiding
  startup AdMob and ClickUp API calls.
- ClickUp task lists, task details, comments, and status updates still go
  through the backend proxy, but task-list loading is deferred until Tasks,
  Tests, or Settings is opened.
- If the cached monetization feed cannot load, the UI shows an explicit error
  state before using bundled demo data. Local task edits are labeled as local
  when ClickUp creation/status sync is not connected.
- Daily report routes (`/report-manifest`, `/report-day`) render from raw CSVs
  when available, fall back to timeseries-reconciled AppDaily rows for missing
  dates, and cache generated HTML in the bucket.
