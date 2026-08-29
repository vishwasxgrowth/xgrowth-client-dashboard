# Backend Setup

The Firebase Function serves the cached dashboard feed, proxies the limited
AdMob/ClickUp calls the UI still needs, and accepts Apps Script pushes into
Google Cloud Storage. The browser never receives Google or ClickUp server-side
tokens.

## 1. OAuth Client

Console -> project `xgrowth-client-dashboard` -> enable **AdMob API**.
OAuth consent screen -> **External**, scopes `admob.readonly` + `userinfo.email`,
test users = your xGrowth per-client emails (jedyapps@, syncme@, ...).
Credentials -> Create OAuth client -> **Web application**:

- Authorized JavaScript origins: `http://localhost:3000`
- Authorized redirect URIs: `http://localhost:4321/callback`

Copy the client ID and secret. While the OAuth app is in Testing, refresh tokens
may need re-minting periodically.

## 2. Capture Refresh Tokens

```
cd xgrowth-client-dashboard/work/xgrowth-client-dashboard
GOOGLE_CLIENT_ID=<id> GOOGLE_CLIENT_SECRET=<secret> node scripts/connect-client.mjs
```

A browser opens; sign in with that client's xGrowth email and allow access.
Repeat for each client, building a JSON map:

```
{ "jedyapps": "1//0...", "syncme": "1//0..." }
```

## 3. Set Function Secrets

```
cd functions
firebase use xgrowth-client-dashboard
firebase functions:secrets:set XG_GOOGLE_CLIENT_ID
firebase functions:secrets:set XG_GOOGLE_CLIENT_SECRET
firebase functions:secrets:set XG_CLICKUP_TOKEN
firebase functions:secrets:set XG_REFRESH_TOKENS
firebase functions:secrets:set XG_PUSH_SECRET
```

`XG_REFRESH_TOKENS` is the JSON map from step 2. `XG_CLICKUP_TOKEN` is the
server-side ClickUp API token. `XG_PUSH_SECRET` is the shared Apps Script push
key.

Set `XG_ALLOWED_ORIGINS` as a function environment variable before deploy,
comma-separated, for every dashboard origin that should be allowed by CORS.
Keep localhost values for local development.

## 4. Apps Script Push

Paste `apps-script/timeseries-webapp.gs` into the client's feed spreadsheet Apps
Script project. Set script property `XG_PUSH_KEY` to the same value as
`XG_PUSH_SECRET`, then run:

```
pushTimeseries()
installDailyTrigger()
```

The script pushes the timeseries JSON plus `AppDaily`, `Users`, `Country`,
`Source`, `Format`, and `Privacy` CSVs when those tabs exist. The backend still
accepts the existing query-string key transport and also accepts `X-Push-Key`.

## 5. Deploy

```
firebase deploy --only functions
```

Set the dashboard's `VITE_FUNCTIONS_BASE_URL` to the deployed `xgClientApi`
function URL and clear `VITE_DEV_ACCESS_TOKEN` for production.

## 6. Hosting

```
npm run build && firebase deploy --only hosting
```

Add the hosted domain to `XG_ALLOWED_ORIGINS` and to OAuth origins before serving
the production dashboard from that domain.
