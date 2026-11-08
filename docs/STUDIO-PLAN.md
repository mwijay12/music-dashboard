# Studio plan: stop mirroring other artists, start running a channel

**Kwa ufupi (Swahili):** Tunabadilisha mwelekeo. Dashboard haitakuwa kioo cha stats za wasanii wengine — inakuwa *desk* ya channel yako mwenyewe: inatafuta watu wanachosearch, inapanga ratiba ya kupost, inatoa prompts za muziki na titles/descriptions, na inafuatilia kile kilichofanya kazi. Kitu kikubwa: **hakuna key inayohitajika kuanza** — research inatumia autocomplete na RSS za YouTube ambazo ni za umma. Key moja tu (YouTube Data API) inaongeza trending + uploads, na hiyo ni form ile ile uliyokuwa unafanya, bure, bila Premium.

Last updated: 2026-11-08 · branch: `arena/35305f30-music-dashboard`

---

## 1. Why this pivot is the right one

The last three days were spent trying to *read other artists' numbers*. That path is now walled:

| Wall | Status |
| --- | --- |
| Spotify followers / popularity | removed from the API (Feb 2026) |
| Spotify Dev Mode | requires a Premium owner (Feb 2026) |
| Audiomack Data API | issued by hand, not self-serve |
| Chartmetric / kworb | paid, and useless below ~10k listeners |
| Apple Music | no analytics API at all |

Meanwhile the *producing* side needs almost nothing: a Google account, one free API key for the numbers, and a $10/month music generator. You stop depending on platforms to hand you data and start generating the data yourself — your own channel is the dataset.

**The one-line version:** a stats dashboard is a mirror; a channel desk is a machine. The second one pays.

## 2. What the system does now

Four jobs, in the order the week actually happens:

| Job | What it answers | Key needed |
| --- | --- | --- |
| **Research** | „Watu wanatafuta nini kuhusu niche yangu?” | none — `npm run studio:research` |
| **Plan** | „Niposti nini, lini, kwa format ipi?” | none — `studio/prompt-pack.json` |
| **Produce** | „Prompt gani, title gani, description gani?” | none — same pack, Swahili titles |
| **Track** | „Ile tuliyopost ilifanyaje?” | YouTube Data API key (free) |

What is already built on this branch:

- `pipeline/src/studio/research.ts` — keyless research engine:
  - **YouTube autocomplete** for demand: expands your seeds into the phrases real viewers type, scores them by how many seeds they appear under and how high they rank.
  - **Channel RSS** for competition: last ~15 uploads per competitor with view counts, from which it computes uploads/week, median views, weekday spread, and the **best publishing hour in EAT**.
  - Degrades to “no data” instead of throwing when an endpoint is blocked — a failed fetch never breaks the report.
- `pipeline/src/studio/research-cli.ts` — `npm run studio:research` writes `data/studio/research-<date>.json` and `reports/studio-research.md`.
- `studio/prompt-pack.json` — two niches, each with real Suno prompts, negative prompts, song structure, title formulas, description templates (Swahili-first), thumbnail briefs, and a **human-proof checklist** (see §4 for why that last item is the one that decides whether you ever get paid).
- `studio/research.example.json` — copy to `studio/research.json`, put your seeds and competitor channel IDs in.
- 6 new tests (`pipeline/src/studio/research.test.ts`), 13 benchmark tests still green.

## 3. The two niches, and why these two

| | **Kwaya Minus-One** | **Amapiano Gospel mixes** |
| --- | --- | --- |
| Query intent | functional: “I need to sing over this on Sunday” | ambient: “play something while I work / pray” |
| Competition | near zero with clean key/BPM labels | crowded, but most are unlabelled and ugly |
| Watch time | 4–6 min | 58–62 min (this is the lever) |
| Production cost | one generation + a count-in | 10 generations + a tracklist |
| Why AI fits | steady tempo, no vocals, repeatable structure | log drums and pads are exactly what models do well |
| Your edge | Swahili titles + real keys/BPM + lyrics in the description | an existing account and genre vocabulary |

**First ten videos (kwaya niche):** five minus-ones in F/G/A with count-ins, two 10-minute medleys, two “rehearsal loop” versions (same track, repeatable), one “how to use this in rehearsal” 3-minute talk with your own voice over the instrumental. That last one is the video that proves a human runs the channel.

**First ten (amapiano niche):** four 1-hour mixes (one per week, month in the title), four Shorts cut from each mix, one year-end countdown, one “tracklist + why I chose these” video.

## 4. The three realities nobody tells you before you start

These are not disclaimers, they are design constraints. Ignoring them is how AI music channels die with 40k views and $0.

**a) Suno's free tier has no commercial rights — and it is not retroactive.**
Free = personal use only; the songs stay Suno's. Upgrading to Pro later does **not** license tracks you already made on the free tier. So decide before you publish anything: sketches on free, everything that goes public made on **Pro (~$10/month)**. Check the current terms yourself when you subscribe; this is the kind of line that changes.

**b) YouTube will not monetise mass-produced content.**
On 15 July 2025 the “repetitious content” policy was renamed **“inauthentic content”** and covers AI material with “little to no human involvement”. A channel of near-identical AI loops gets rejected at review — after it has already earned the numbers. The prompt pack's **human-proof checklist** exists for this reason: your own lyrics in the description, a real count-in recorded in your voice, keys measured on a real keyboard, a handwritten tracklist, pinned comments, replies to comments. None of it is hard; all of it is the difference between “a channel” and “an upload farm”.

**c) The thresholds, and the ones coming.**
Earlier access needs **500 subs + 3,000 watch hours** (12 months) + 3 uploads in 90 days; full ad revenue needs **1,000 subs + 4,000 hours**. From **1 February 2027** new applicants need 1,000 subs plus **8,000 hours** or 20M Shorts views. You are starting in November 2026 — you have a 14-month window at the old bar. That is an argument for starting this month, not for waiting.

Two mechanical details that bite on day one:

- **The AI disclosure toggle** (“Altered or synthetic content”) must be on for AI-audio uploads. YouTube says it does not reduce reach or monetisation; skipping it risks penalties later.
- **Unverified channels cannot upload videos longer than 15 minutes.** Verify by phone before you plan a 1-hour mix.

## 5. Keys: exactly one, and it is the free one

| What | Endpoint | Cost |
| --- | --- | --- |
| Keyword demand | `suggestqueries.google.com` (autocomplete) | keyless, no quota |
| Competitor tracking | `youtube.com/feeds/videos.xml` (RSS) | keyless, no quota |
| Trending in your category | `videos.list?chart=mostPopular&videoCategoryId=10&regionCode=TZ` | **1 unit** |
| Upload + schedule | `videos.insert` with `status.publishAt` | **~1,600 units** |
| Daily quota | 10,000 units | ≈ 6 uploads/day theoretical, 3–4 realistic |

So: **one YouTube Data API key** (free, the form you were already on) unlocks trending research and upload automation. Google OAuth for the upload itself is already scaffolded in this repo (`/api/auth`, `api/me`) — no new signup, same Google account.

Scheduling works like this: upload as `private` with `publishAt` set to the slot the research recommends (e.g. Friday 18:00 EAT), and YouTube publishes it itself. You never have to be awake at the right hour.

## 6. The 30 days (8 Nov – 8 Dec 2026)

| Week | Do | Ship |
| --- | --- | --- |
| 1 | Fill `studio/research.json` with 5 seeds + 5 competitor channels; run `npm run studio:research`. Pick niche #1 only. Subscribe Suno Pro. Verify the channel by phone. | 2 minus-ones, keys labelled, lyrics in description |
| 2 | Same cadence. Add the count-in recorded in your voice. Reply to every comment. | 2 minus-ones + 1 medley |
| 3 | Read your own analytics: which title formula got clicked? Keep it, drop the other two. | 3 uploads, 1 “how to rehearse with this” talk |
| 4 | Start niche #2 as a second content line on the same channel (or a second channel — decide from the data). | 1-hour mix + 4 Shorts + 2 minus-ones |

Non-negotiable: **one decision per week**, written down. “The key-label titles beat the Swahili-poetic ones, so all titles change.” If a week ends with no decision, the week was decoration.

## 7. Where money actually comes from (in order)

1. **Commissioned minus-ones** — choirs pay for a track in *their* key. This is the fastest revenue and it needs no thresholds at all. The channel is the shop window; the price list goes in the description.
2. **Distribution** — the same tracks via a distributor to Spotify/Apple/Audiomack, where your existing Audiomack account already gives you real numbers.
3. **Channel memberships / Super Thanks** at 500 subs (earlier-access tier, no ad revenue needed).
4. **Ad revenue** last. Music CPMs in this region are low; treat it as a bonus for the catalogue, not the plan.

If the channel never monetises, items 1 and 2 still pay. That is the whole reason to build it this way.

## 8. What to build next in code (priority order)

> **Where the machines fit:** `docs/STUDIO-ARCHITECTURE.html` (open it in a browser — it is a page, not a document) assigns the roles: the PC assembles, n8n on the existing VPS schedules and uploads, Vercel displays. §0–§5 of that page is the build order; this section is the code side of it.

0. **PC worker — built on this branch.** `worker/agent.mjs`: polls n8n outbound-only (no open port), allowlisted handlers (`echo`, `probe`, `render`, `concat`), argv-safe spawn, reports failures too. 9 tests, no ffmpeg required.
1. **Upload + schedule** — prefer n8n's YouTube node (OAuth + `videos.insert` + `publishAt`) over hand-rolled code; add `api/studio/publish` only if the dashboard must trigger uploads directly.
2. **Daily sync** — one cron: `videos.list` for your own uploads (stats + status), write `data/studio/videos.json`, so the dashboard shows planned vs published vs performed.
3. **Prompt → video kit** — for each pack entry, generate the title, description, tags, and a thumbnail text file; one button, no typing.
4. **Research v2** — trending-by-category (`chart=mostPopular`, 1 unit) and “views/day” ranking of competitor uploads, so the report says “their Friday uploads get 3× their Tuesday ones” instead of just counting.
5. **Report integration** — the weekly PDF gets a channel page: this week's uploads, views, best slot, and next week's plan.

Nothing above needs a second key, a paid aggregator, or Audiomack's permission.
