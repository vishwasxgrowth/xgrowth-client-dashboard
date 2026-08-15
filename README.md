# Xgrowth Client Dashboard

Standalone, client-facing dashboard. No dolphin code — its own auth (Google
Identity Services), its own AdMob + ClickUp data layer, and the Xgrowth Ops UI.
One client per deployment (config via env).

## Run locally
```
npm install
cp .env.example .env   # fill the 5 values
npm run dev
```

## Env (per client)
- `VITE_GOOGLE_CLIENT_ID` — External OAuth web client id (clients sign in with their own Google)
- `VITE_FUNCTIONS_BASE_URL` — deployed ClickUp proxy base URL
- `VITE_CLIENT_NAME` — shown on the login + brand
- `VITE_CLIENT_ADMOB_ACCOUNT` — e.g. accounts/pub-XXXXXXXXXXXXXXXX
- `VITE_CLIENT_CLICKUP_FOLDER` — the client's ClickUp folder id

## Build & deploy
```
npm run build      # -> dist/
```
Deploy `dist/` to any static host (Firebase Hosting, Netlify, Vercel, Cloud Run+nginx)
on the client's own domain.

## Notes
- AdMob is called browser-direct with the signed-in user's token (they own the account).
- ClickUp goes through the proxy (token stays server-side).
- ARPDAU/DAU need a GA4/Firebase source (AdMob has no DAU) — currently 0.
- Experiments use the bundled snapshot until a live source is wired.
