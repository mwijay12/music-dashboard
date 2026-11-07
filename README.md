# Timbre

Timbre is an artist-intelligence dashboard for reading streaming momentum, catalog performance, audience geography, and competitive context in one place. It ships with a demo dataset so the interface works immediately after cloning.

## Stack

- Static HTML, CSS, and JavaScript for the dashboard shell and views
- React + Vite for the globe island
- Express for static serving, sessions, and Google sign-in
- TypeScript ingest pipeline for Spotify and YouTube data

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Open http://localhost:8130.

The app starts in demo mode when no credentials or auth are configured. `AUTH_REQUIRED=false` keeps the dashboard open; set it to `true` to gate the app behind Google sign-in.

## Build

```powershell
npm run build
```

This rebuilds `globe-dist/` and `bundle.js`. Both are checked in because the Express server serves the built assets directly.

## Data ingest

1. Copy `pipeline/artists.example.json` to `pipeline/artists.json` and fill in the artist IDs.
2. Add `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `YOUTUBE_API_KEY` to `.env`.
3. Run `npm run ingest`.

The pipeline writes `data/live.json`, which the dashboard reads at runtime. `pipeline/artists.json`, generated user data, and session secrets are git-ignored.

## Auth

Google sign-in is configured through `.env`:

- `GOOGLE_CLIENT_ID` must include the dashboard origin in its authorized JavaScript origins.
- `GOOGLE_CLIENT_SECRET` stays server-side and is only needed for YouTube OAuth scopes.
- `SESSION_SECRET` is optional; the server generates `data/.session-secret` when it is omitted.

Never commit `.env` or service-account credentials.

## Deployment

The app needs a Node process for `/api/*` and auth. A static host such as GitHub Pages can serve the frontend but cannot run the Express auth/session routes. Deploy to a Node-capable host and set `BASE_URL` to the public HTTPS origin.
