# Data pipeline & reporting plan

**Kwa ufupi (Swahili):** plan hii inagawanya kazi katika sehemu nne — (1) kuvuta data halisi kutoka kila platform, (2) kuhifadhi historia ya wiki, (3) kuzalisha PDF reports za kweli server-side, (4) kuendesha yote kwenye EC2 ya 4 GB RAM. PDF generator na parser ya email ya Audiomack **zimeshafanyika** (angalia §3 na §4); connectors za platform ziko kwenye hatua zinazofuata (§8).

Last updated: 2026-11-08 · owner: Mwijay Davie · branch: `arena/0e9e31e8-music-dashboard`

---

## 1. Where we are today

| Piece | State | Evidence |
| --- | --- | --- |
| Dashboard shell, routes, animations | shipped | `https://timbre-puce.vercel.app` |
| Public metadata (Spotify/YouTube public reads) | shipped, opt-in | `pipeline/src/connectors/*.ts`, `/api/snapshot` |
| Auth (email/password session) | shipped | `/api/auth/*`, HMAC cookie sessions |
| Google sign-in | code ready, no credentials | `api/config` returns `googleConfigured:false` |
| Artist-private metrics (streams, geography, revenue) | **demo only** | `data/live.json` + demo fixtures |
| PDF report (server-rendered, vector) | **shipped this branch** | `GET /api/report`, `serverless/report/pdf.mjs` |
| Audiomack weekly-email ingestion | **shipped this branch** | `pipeline/src/parsers/audiomack-digest.ts` |
| Hourly/daily polling worker | not built | this plan, phase 2 |

The honest summary: the site is a real product shell with a truthful demo dataset, plus two genuinely real data paths (public metadata, and now the Audiomack digest). Everything else below is a plan, not a claim.

---

## 2. Which platforms actually give you numbers

Researched 2026-11-08. "Real metrics" means plays/streams/listeners — not popularity scores.

| Source | Real metrics you can get | Access route | Cost / gate | Fits 4 GB EC2 |
| --- | --- | --- | --- | --- |
| **Audiomack** | per-track `play_counter`, `favorite`/`repost` counters, `followers_count`, uploads, artist `music_top10` | **Data API v1** (`api.audiomack.com/v1`), free app registration, OAuth 1.0a or bearer token | free; app must be approved | ✅ HTTP only |
| **Audiomack (email)** | weekly plays, new followers, likes, top-song plays | weekly email → IMAP → parser (**built**) | free, no approval | ✅ |
| **Spotify** | real streams, listeners, saves, cities, playlists | **no public API** — Spotify for Artists CSV export, or browser extension that reads the S4A chart DOM | free, manual/extension | ✅ (file upload) |
| **YouTube** | views, watch time, geography, demographics, traffic sources | YouTube Analytics API (OAuth, owner-only); Data API for counts | free quota (Data API 10k units/day; Analytics separate) | ✅ |
| **Apple Music** | almost nothing | MusicKit has no analytics API; Apple Music for Artists is web-only | — | ❌ plan on CSV |
| **TikTok** | follower/video counts, limited insights | official API, OAuth, app review | gated | ✅ |
| **Instagram** | follower + media insights for business accounts | Instagram Graph API, app review + business account | gated | ✅ |
| **SoundCloud** | plays/likes on your tracks | API registration **closed** since 2017 (manual waitlist); oEmbed only | effectively no | ⚠️ skip |
| **Aggregators** | cross-platform plays incl. Audiomack, Anghami, Last.fm listeners | Soundcharts API (paid), Apify actors (per-run) | $ — | ✅ |

**Rule that keeps this honest:** never present a public-count API as a stream count. Spotify's popularity (1–100) is not streams; only S4A exports and distributor reports have real numbers.

---

## 3. PDF reports — implemented

Real documents, generated on the server, **not screenshots**.

- `serverless/report/pdf.mjs` — pdfkit renderer, A4, two pages. Every chart, bar, sparkline and pill is drawn as PDF geometry with built-in Helvetica metrics; no images, no headless browser. Output is ~9–13 KB and text stays selectable.
- `serverless/report/data.mjs` — two datasets: the demo set (matches the dashboard) and the Audiomack digest (real account).
- Endpoints: `GET /api/report?source=demo|digest|auto` on both Express and Vercel. Returns `application/pdf` with `Content-Disposition` + `X-Report-Mode`.
- UI: header **PDF report** button (demo, matches the screen), **Digest PDF** card on `/sources` (real Audiomack data), and both in the command palette.
- `npm run report` renders to `reports/` for eyeballing without a server.

Why this path and not HTML→PDF: headless Chrome costs ~300–500 MB RAM per instance, needs a sandbox flag dance, and produces multi-MB files that are effectively images with text sometimes inside. pdfkit costs ~0.5 s and 40 MB, and stays vector. On a 4 GB box that difference is the whole margin.

Next for reports (phase 3): scheduled weekly email with the PDF attached, per-platform variants, and a signed download link instead of an open endpoint.

---

## 4. Audiomack: how the weekly email becomes data

Your digest example is a perfect stress test, and it surfaces the single most important modelling rule here:

```
Weekly digest (Sat 7 Nov)      headline: 103 plays in 7 days
Top songs                      lifetime: 300 + 160 + 110 + 90 + 90 = 750 plays
```

750 > 103 because they are **different clocks**: 103 is the 7-day window, the song counts are lifetime. A naive pipeline would subtract them and report negative growth. The parser stores both and flags the mismatch (`diagnostics.scopeMismatch`), and the PDF prints the warning in plain language.

**Pipeline (built):**

```
Audiomack email
   → Gmail/Workspace filter → forward to ingest address (or IMAP fetch)
   → plain-text body
   → pipeline/src/parsers/audiomack-digest.ts   (tolerant: numbering, commas, —, |, ·, EN/SW headings)
   → data/audiomack-digest.json                 (latest + one entry per week = your history)
   → GET /api/report?source=digest              (vector PDF)
```

```bash
npm run digest -- --file pipeline/fixtures/audiomack-digest-2026-11-07.txt
# or: cat email.txt | npm run digest
npm test            # 6 parser tests incl. the real digest
```

**Getting the email in automatically — three options, cheapest first:**

1. **Mailbox rule (recommended, owner-only).** Gmail/Workspace rule forwards Audiomack mail to a dedicated address; a 60-line IMAP poller (app password) pulls the body every 15 min. No OAuth review, no CASA, works on the 4 GB box.
2. **Gmail API.** `gmail.readonly` is a *restricted* scope: public use needs Google verification **plus a paid CASA assessment (~$500–4,500/yr)**, and in Testing mode refresh tokens die every 7 days. Acceptable only if it stays a single-user internal tool in the same Workspace (Internal app type, no review).
3. **Manual paste.** Paste the email into a small form → same endpoint. Zero infrastructure; good fallback on day one.

**"Agentic" — what actually works.** An LLM agent cannot log into Audiomack for you (no public API for private stats, and ToS forbids scraping the artist dashboard). What is genuinely agentic and safe: the pipeline agent reads the JSON, writes the weekly narrative ("Lango la Mbinguni is 40% of lifetime plays; the 7-day window added 103"), picks what changed, and drafts the email/PDF. That is summarisation over data you legally own — not autonomous scraping.

Phase 2 upgrade: register the **Audiomack Data API app** (free) → daily poll of `play_counter` per track → real daily curve, then the PDF's line chart fills in instead of the bar panel.

---

## 5. EC2 sizing: 4 GB is a floor, not a target

Measured expectations (steady state, no build tooling on the box):

| Component | RAM | Note |
| --- | --- | --- |
| Ubuntu 24.04 + systemd + sshd | ~380 MB | arm64 (t4g) is cheaper |
| Node API (Express, same code as repo) | ~110 MB | PM2/systemd, 1 process |
| Postgres 16 (shared_buffers 256 MB) | ~350 MB | history, digests, report jobs |
| Poller/parser worker (Python or Node, cron) | ~90 MB | runs minutes per day |
| pdfkit render | ~45 MB peak | on demand only |
| **Subtotal (the product)** | **~975 MB** | leaves ~3 GB headroom |
| n8n self-hosted | +1.1–1.5 GB | Docker-only since 3.0; Postgres required; OOM-prone with big JSON payloads |
| Headless Chrome (HTML→PDF) | +400 MB/instance | avoid — we render vector PDFs instead |
| 2 GB swap file | — | cheap insurance on 4 GB |

**Recommendation:** `t4g.medium` (2 vCPU / 4 GiB, arm64) + 30 GB gp3 + 2 GB swap. Run the product as three systemd units (api, worker, postgres) or one `docker compose` file. Add **n8n only if** you actually need its UI for notifications; otherwise `node-cron`/`cron` + a `curl` webhook does the same job at 1/15th the RAM. Do **not** put n8n + Chrome + Postgres + queue workers on 4 GB.

Approx cost: EC2 ~$25–30/mo, gp3 30 GB ~$2.5/mo, backups ~$1. Vercel stays free-tier for the dashboard.

Suggested compose shape (phase 2):

```yaml
services:
  api:      { build: ., command: node server/index.mjs, ports: ["3000:3000"], env_file: .env }
  worker:   { build: ., command: node pipeline/worker.mjs, env_file: .env, depends_on: [db] }
  db:       { image: postgres:16-alpine, environment: [POSTGRES_DB=timbre], volumes: ["pg:/var/lib/postgresql/data"] }
  # n8n:    { image: n8nio/n8n, profiles: ["optional"], mem_limit: 1g }
volumes: { pg: {} }
```

---

## 6. Storage & data model

Today: `data/audiomack-digest.json` (file) — fine for one artist, one account. Phase 2 moves to Postgres:

```sql
-- one row per platform metric per day
create table metric_daily (
  artist_id   text not null,
  platform    text not null,        -- audiomack | spotify | youtube | apple
  metric      text not null,        -- plays | listeners | followers | likes | saves | revenue
  day         date not null,
  value       numeric not null,
  scope       text not null default 'window',  -- 'window' | 'lifetime'
  source      text not null,        -- digest | api | csv | manual
  ingested_at timestamptz not null default now(),
  primary key (artist_id, platform, metric, day, scope, source)
);

create table track_metric (
  artist_id text, platform text, track_id text, title text,
  plays_lifetime numeric, plays_window numeric,
  captured_at timestamptz,
  primary key (artist_id, platform, track_id, captured_at)
);
```

`scope` is the column that prevents the 103-vs-750 class of bug: lifetime and window values can never be silently compared. Every report query must state its scope.

---

## 7. Google sign-in

Code is done (`api/auth/google.js`, `login.html`, `api/config`). To switch it on:

1. Google Cloud → OAuth client (Web) with authorised origins `https://timbre-puce.vercel.app` + `http://localhost:8130` and redirect URIs `<origin>/api/auth/google/callback`.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel (Production + Preview), redeploy.
3. Verify: `/api/config` must return `googleConfigured:true`, then complete one real sign-in.

---

## 8. Phased sequence

| Phase | Scope | Effort | Depends on |
| --- | --- | --- | --- |
| **0 — done** | Vector PDF reports, Audiomack digest parser + tests, digest PDF variant, `/sources` entry point | shipped | — |
| **1 — wire the accounts** | Google OAuth live; Audiomack digest auto-forward (IMAP poller + cron); weekly cron renders digest PDF | 1–2 days | client secret, mailbox app password |
| **2 — history + API** | Postgres schema (§6), worker polls Audiomack Data API daily, `/api/report` reads DB, trend charts replace bar panels | 3–5 days | Audiomack app approval |
| **3 — second platform** | Spotify for Artists CSV upload (parse + map) or YouTube Analytics OAuth; PDF gains a platform comparison page | 3–4 days | S4A export / Google scopes |
| **4 — delivery** | Scheduled email with PDF attached, signed links, per-platform variants, alert when a track passes a milestone | 2 days | phase 2 |

Deliberately **out of scope**: SoundCloud (API closed), Apple Music analytics (no API), scraping artist dashboards (ToS), headless-Chrome HTML→PDF (RAM + file size).

---

## 9. What is blocked on you

1. **`GOOGLE_CLIENT_SECRET`** — needed to finish Google sign-in (the client ID alone is not enough).
2. **Audiomack Data API app** — register at `audiomack.com/data-api`; gives daily polling without the email.
3. **Mailbox access** — Gmail app password (or Workspace internal OAuth) for the IMAP poller.
4. **EC2** — region + instance ID if you want me to produce the deploy script for it.

## 10. Cost summary

| Item | Monthly |
| --- | --- |
| Vercel (dashboard) | $0 (Hobby) |
| EC2 t4g.medium + 30 GB gp3 | ~$28 |
| Optional n8n | $0 (self-hosted, same box) |
| Optional Soundcharts / Apify | $50–500 (only if you want cross-platform plays without uploading CSVs) |
| Google CASA (only if Gmail becomes a public feature) | ~$40–375/mo amortised |
