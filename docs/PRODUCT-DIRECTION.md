# Where this product actually wins

A fair challenge, written down honestly: *"Google's AI Mode already answers 'music stats Limoblaze as of today' with monthly listeners, YouTube subs, Shazams and a top-tracks table, citing Chartmetric, kworb, stats.fm, viberate. Why build a dashboard?"*

Because that answer works **only for artists aggregators care about**, and because a chat answer is not a report.

## The split that matters

| | Public aggregators (Chartmetric, kworb, stats.fm) | This dashboard |
| --- | --- | --- |
| Coverage floor | roughly >10k monthly listeners; below that, empty or wrong pages | works at 103 plays/week |
| Your Audiomack numbers | not tracked at all for small accounts | parsed from your own digest |
| Spotify for Artists (saves, sources, cities) | never — it is private to the owner | importable |
| History and deltas | "monthly listeners today" | week-over-week for *your* account |
| Output | a web page with ads | a PDF you can send to a label, church media team or sponsor |
| Freshness | cached snapshots of unknown age | every 15 minutes from your inbox |

Limoblaze is a **990k monthly listener** act. Piano Sifa Afro Gospel Amapiano Hub is at **103 plays in the last week**. No aggregator will ever index that account, and no AI overview will ever answer "how did my week go". That gap is the product.

## Two tiers, and only one of them is a moat

**Tier 1 — Owner data (the moat).** Numbers only you can have: Audiomack digest, Spotify for Artists CSV, YouTube Analytics via OAuth. Nobody can copy this, and it stays valuable as long as you keep collecting it. Already built: the digest pipeline and the PDF.

**Tier 2 — Benchmark data (the "agent" experience, now real).** Ask about any artist and compare:

```
GET /api/benchmark?artist=Limoblaze
```

returns Spotify followers / popularity / top tracks, YouTube subscribers / views / videos, and **your own numbers alongside**, so the gap is explicit rather than implied. Sources are the two that are legitimately self-serve (Spotify client credentials, YouTube Data API key). Response shape and the "no keys yet" path are covered by tests.

That is the answer to "can't we have an agent that searches like this?" — yes, and it belongs *inside* the dashboard as a comparison, not as a replacement for it. A search engine cannot tell you what to do next about a 140-play gap between your first and second track.

## Why a dashboard still beats a chat answer

1. **Repeatable, timestamped, auditable.** A label or sponsor needs a document dated 7 Nov 2026 with a method, not a screenshot of an AI answer.
2. **It runs without a human.** The timer pulls weekly, no prompt needed.
3. **It knows your private numbers.** Google never will.
4. **It gives one recommendation.** The PDF already says "the gap to Mwamba is 140 plays — a playlist pitch on one track moves the whole account." That sentence is the product; the charts are packaging.

## The risk, named

A beautiful dashboard that nobody opens is a portfolio piece. The Instagram-analytics screenshots with huge view counts prove reach, not retention. Two things prevent that:

- **A weekly output channel.** The PDF has to land somewhere every Monday: WhatsApp to your manager, email to the church media team, a slide in the Sunday service planning meeting. If the only way to see it is to remember a URL, it dies.
- **One decision per week.** Every report should end with a single action ("pitch *Lango la Mbinguni* to 3 playlists", "release the next single in the same key"). Numbers without a decision are decoration.

## Three shapes this can take, cheapest first

1. **Artist tool (today).** You, your catalogue, one PDF a week. Cost ≈ one small box.
2. **Manager / label reporting.** Same engine, N artists, one PDF each, benchmark against genre peers. Charge per artist per month. The benchmark endpoint is what makes the pitch credible ("here is how your act compares to the acts you want to be").
3. **White-label for labels, churches and media houses in TZ/KE/NG.** They have artists with no analytics and no staff to build this. Your edge is the ingestion (weekly email parsing, CSV, YouTube) and the report voice — not the charts.

## What not to build

- A generic "search any artist" page as the headline feature — Google already wins that, and it would put you head-to-head with Chartmetric.
- Real-time stream tickers. Audiomack publishes weekly; a second-by-second UI would be fiction.
- Social feeds (TikTok/IG scraping). Fragile, ToS-hostile, and the numbers you need are already summarised in your own dashboards.
- Accounts, teams, billing — until someone asks to pay for shape 2.
