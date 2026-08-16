# Option B backend — setup (new project: xgrowth-client-dashboard)

Server holds a **refresh token per client email** and mints AdMob access tokens
on demand. Browser never sees a Google token. Started in **Testing** mode
(refresh tokens may need re-minting ~weekly until the app is Published).

## 1. OAuth client (Web application, WITH a secret)
Console → new project `xgrowth-client-dashboard` → enable **AdMob API**.
OAuth consent screen → **External**, scopes `admob.readonly` + `userinfo.email`,
test users = your xGrowth per-client emails (jedyapps@, syncme@, …), stay in **Testing**.
Credentials → Create OAuth client → **Web application**:
- Authorized JavaScript origins: `http://localhost:3000`
- Authorized **redirect URIs**: `http://localhost:4321/callback`  (for the connect helper)
Copy the **Client ID** and **Client secret**.

## 2. Capture a refresh token per client (run once each)
```
cd xgrowth-client-dashboard
GOOGLE_CLIENT_ID=<id> GOOGLE_CLIENT_SECRET=<secret> node scripts/connect-client.mjs
```
A browser opens → sign in with THAT client's xGrowth email (e.g. jedyapps@) → Allow.
Copy the printed refresh token. Repeat for each client, building a map:
```
{ "jedyapps": "1//0...", "syncme": "1//0..." }
```

## 3. Set secrets (Firebase)
```
cd functions
firebase use xgrowth-client-dashboard
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set CLICKUP_TOKEN         # pk_... ClickUp API token
firebase functions:secrets:set REFRESH_TOKENS        # paste the JSON map from step 2
```

## 4. Deploy
```
firebase deploy --only functions      # gives the function URL (…/api)
```
Set the dashboard's `VITE_FUNCTIONS_BASE_URL` to that URL (ending in `/api`),
and clear `VITE_DEV_ACCESS_TOKEN`. Then AdMob + ClickUp both flow server-side,
scoped per client via `?clientId=`.

## 5. Hosting (later)
```
npm run build && firebase deploy --only hosting
```
Add the hosted domain to `ALLOWED` in functions/index.js and to the OAuth origins.
