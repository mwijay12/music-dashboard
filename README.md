# Timbre

An artist-intelligence dashboard: streaming momentum, catalog performance, audience geography and competitive context in one workspace.

**Live deployment:** <https://timbre-puce.vercel.app> (Vercel project `timbre`, built from this repo).

**Important, up front:** Timbre is a **demo-first** dashboard. The interface, motion system, charts, routing, command palette and auth are real and fully wired. The private numbers it displays (streams, monthly listeners, saves, revenue, per-city listeners, the live ticker) are **generated deterministically in the browser**, not fetched from Spotify or Apple Music. Public metadata (followers, popularity, channel views) becomes real as soon as you run the ingest pipeline. See [What is real today](#what-is-real-today) and [Making it functional](#making-it-functional).

The UI labels its own data state: the badge in the top bar reads **Demo data** until a snapshot with artists is loaded, then switches to **Live data**.

---

## Stack

| Layer | What it actually is |
|---|---|
| Dashboard shell | Static HTML (`index.html`) + hand-written CSS (`styles.css`) + vanilla JS (`app.js`, bundled) |
| Router | Hash router (`#/overview`, `#/streams`, …) with per-route render + reveal orchestration |
| Motion | GSAP 3.12.5 (vendored) with Web Animations API and requestAnimationFrame fallbacks; CSS keyframes; `prefers-reduced-motion` + a persisted user toggle |
| Charts | Hand-written SVG: monotone cubic interpolation, sparklines, radial rings, heatmap. No chart library |
| 3D — orbs | three.js r160 shader orb (`scenes.js`), loaded inside `bundle.js` |
| 3D — globe | cobe + React 19 island, built separately with Vite (`globe-dist/`), lazy around visibility |
| Server (local / Node host) | Express 5: static allowlist, Google sign-in, signed session cookie, `data/users.json` |
| Server (Vercel) | Serverless functions in `api/` + edge middleware auth gate; stateless signed session |
| Data pipeline | TypeScript (`pipeline/`): Spotify + YouTube connectors → `data/live.json` (optionally Firestore) |

Build outputs `bundle.js` and `globe-dist/` are committed because the Express server serves them directly. Run `npm run build` after touching `app.js`, `scenes.js` or the globe island.

---

## What is real today

| Feature | Status |
|---|---|
| Layout, animation, routing, command palette, dialogs, CSV export, share/copy | **Real** — fully implemented client-side |
| Google sign-in | **Real** when `GOOGLE_CLIENT_ID` + `SESSION_SECRET` are configured (ID token verified server-side) |
| Session handling | **Real** — signed `HttpOnly` cookie. Stateless on Vercel; `data/users.json` on the Express server |
| Public metadata card (followers, popularity, channel views) and source accounts | **Real** when `data/live.json` contains artists |
| Streams, listeners, saves, revenue, per-track share, per-city listeners, heatmap, growth chart | **Demo** — seeded PRNG (`mulberry32`) so every reload is identical |
| “Live” ticker and activity feed | **Simulated** — browser timers that add fake listeners/activity every 4.5s / 9s |
| Private analytics (Spotify for Artists, YouTube Analytics) | **Not implemented** — see the roadmap |

Why some metrics cannot be fetched from public APIs:

- **Spotify Web API** exposes followers, popularity, top tracks and albums. Streams and saves are only available in **Spotify for Artists**, which has no public API (CSV export only).
- **YouTube Data API** exposes channel views and video counts. Watch time, audience geography and traffic sources require the **YouTube Analytics API** with OAuth.
- Apple Music for Artists and SoundCloud have no public metrics API.

That is why the dashboard ships with a clearly-labelled demo dataset instead of pretending the numbers are live.

---

## Architecture map

```
index.html          dashboard shell, inline SVG sprite, 6 views
styles.css          all dashboard styling (tokens, layout, motion)
app.js → bundle.js  dashboard logic (rendered by esbuild, IIFE)
scenes.js           three.js orb + unused globe builder (bundled into bundle.js)
boot.js             sets the `js` class before first paint (CSP-friendly, no inline script)
globe/              React island source (cobe globe) → globe-dist/
components/ui/      cobe-globe.tsx
server/index.mjs    Express server for local/Node hosting
api/                Vercel serverless functions (health, config, me, logout, auth/google, snapshot)
middleware.js       Edge auth gate, active only when AUTH_REQUIRED=true
serverless/         shared session signing for the serverless functions
pipeline/           Spotify/YouTube ingest → data/live.json
scripts/            build-static.mjs (assembles public/ for Vercel)
```

---

## Run locally

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

Open <http://localhost:8130>. The app runs in demo mode when no credentials are configured. `AUTH_REQUIRED=false` keeps the dashboard open; set it to `true` to gate the app behind Google sign-in.

Useful URL flags:

- `?motion=off` / `?motion=on` — override the motion preference for one load
- `#/streams`, `#/tracks`, `#/audience`, `#/activity`, `#/sources` — deep links

Build the committed artifacts after changing source:

```powershell
npm run build
```

---

## Deploy to Vercel

The repository is Vercel-ready:

- `vercel.json` builds `public/` via `npm run build:vercel` (only runtime assets; source files are not deployed)
- `api/*.js` become serverless functions
- `middleware.js` gates `/` and `/index.html` at the edge when `AUTH_REQUIRED=true`
- Security headers + CSP are set in `vercel.json`

Environment variables:

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | For sign-in | HMAC key for the session cookie (32+ random chars) |
| `GOOGLE_CLIENT_ID` | For sign-in | Google OAuth client ID; add the deployment origin to authorised JS origins |
| `GOOGLE_CLIENT_SECRET` | Later | Needed for YouTube OAuth scopes |
| `AUTH_REQUIRED` | No | `true` gates the app behind Google sign-in |
| `LIVE_SNAPSHOT_URL` | No | HTTPS URL returning a `PublicSnapshot` JSON; `/api/snapshot` proxies and caches it for 60s |
| `BASE_URL` | No | Public origin, used by `/api/config` when not on Vercel |

Filesystem note: serverless functions have no writable disk, so the Vercel deployment does **not** use `data/users.json`. Sessions are stateless and signed; a real multi-user deployment should store users in a database instead (see the roadmap).

Build the deployment payload locally at any time:

```powershell
npm run build:vercel   # writes public/
```

---

## Data pipeline

1. Copy `pipeline/artists.example.json` to `pipeline/artists.json` and fill in artist IDs.
2. Add `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `YOUTUBE_API_KEY` to `.env`.
3. Run `npm run ingest`.

The pipeline writes `data/live.json`, which the dashboard reads at runtime. `pipeline/artists.json`, generated user data and session secrets are git-ignored.

`PublicSnapshot` shape (see `pipeline/src/types.ts`):

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-08T09:00:00.000Z",
  "market": "US",
  "artists": [
    {
      "id": "mira-vale",
      "name": "Mira Vale",
      "role": "self",
      "spotify": { "followers": 128400, "popularity": 62, "topTracks": [] },
      "youtube": { "views": 4210000, "subscribers": 88200 },
      "errors": []
    }
  ]
}
```

An empty snapshot (`artists: []`) is treated as “no data yet” and the dashboard stays in demo mode. To update a deployed dashboard without redeploying, publish the snapshot anywhere reachable and set `LIVE_SNAPSHOT_URL`; `/api/snapshot` proxies it with a 60-second cache and the client falls back to the bundled file when the proxy is unavailable.

---

## Making it functional

The UI is already structured for real data: every view renders from module-level data (`METRICS`, `TRACKS`, `CITIES`, …) and public snapshot values are merged into the source cards. The remaining work is data acquisition and storage, not interface rewiring.

**Phase 1 — public metadata (available today)**
1. Run the ingest pipeline on a schedule (GitHub Actions cron, Vercel Cron or a small worker).
2. Publish `live.json` (Firebase Storage, Firestore REST, GitHub raw, S3…).
3. Set `LIVE_SNAPSHOT_URL` in Vercel. The top-bar badge flips to “Live data” and the public-signal card fills in.

**Phase 2 — private streaming metrics**

| Source | What you can get | How |
|---|---|---|
| YouTube Analytics API | Views, watch time, subscribers gained, geography, traffic sources | OAuth with `yt-analytics.readonly` (needs `GOOGLE_CLIENT_SECRET`); add a connector under `pipeline/src/connectors/` |
| Spotify for Artists | Streams, saves, listener geography, playlists | No public API — CSV export upload, or a manual import screen |
| Apple Music for Artists / SoundCloud | Streams, Shazam, listeners | CSV import only |

**Phase 3 — replace the seeded generators**

1. Extend `PublicSnapshot` with a `metrics` block (`streams`, `listeners`, `saves`, `revenue`, `cities`, `daily`) produced by the pipeline.
2. In `app.js`, keep `setDataMode("demo" | "live")` as the switch and map snapshot values onto `METRICS`, `TRACKS`, `CITIES`, `GROWTH` before the first render. The reveal/counter animations already read from those arrays, so nothing else changes.
3. Remove the simulated ticker (`tickListeners`, `addLiveActivity`) or drive it from the snapshot deltas.

**Phase 4 — production hardening**

- Persist users and snapshots in a database (Firestore is scaffolded in `pipeline/src/store/firestore.ts`); the Vercel functions are intentionally stateless.
- Add CSRF protection for `POST /api/logout`, rate limiting on `/api/auth/google`, and audit logging.
- Replace the demo-only copy (`“Mira Vale”`, the greeting) with data from the signed-in user.

---

## Security

- Google ID tokens are verified server-side (`aud`, `iss`, `email_verified`).
- Session cookies are `HttpOnly`, `SameSite=Lax`, signed with HMAC-SHA256, `Secure` on HTTPS.
- The Express server serves an explicit allowlist of files and rejects path traversal.
- Vercel deployments set CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`.
- Never commit `.env`, `data/users.json`, `data/.session-secret` or service-account JSON.

---

## Known gaps

- `scenes.js` still contains an unused three.js globe builder (`createGlobe`); only the orbs are mounted. The visible globe is the cobe island.
- three.js accounts for ~125 KB gzip of `bundle.js`, which is the single largest frontend cost.
- `app.js` and `scenes.js` are plain JS and outside the TypeScript project; there is no lint or test suite yet.
- Charts are pointer/touch driven but not keyboard operable; a screen-reader data table is not included.
- The Express server does not compress responses (Vercel's edge does automatically).

See `FRONTEND-REVIEW.md` for the full audit, measurements and ranked fixes.

---

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Express server on port 8130 |
| `npm run dev` | Alias of `npm start` |
| `npm run build` | Rebuilds `globe-dist/` (Vite) and `bundle.js` (esbuild) |
| `npm run build:globe` | Globe island only |
| `npm run build:app` | Dashboard bundle only |
| `npm run build:vercel` | Assembles `public/` for the Vercel deployment |
| `npm run typecheck` | TypeScript check for the globe island and pipeline |
| `npm run ingest` | Runs the Spotify/YouTube ingest pipeline |
