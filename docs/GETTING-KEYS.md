# The keys, with the exact clicks — and the one door that is now shut

Read the first table, then stop wherever you like. Nothing below is required for
the dashboard to work: **Deezer needs no key at all**, so
`/api/benchmark?artist=Limoblaze` already returns real numbers today.

| Source | What you get | What it costs | Wall |
|---|---|---|---|
| **Deezer** | fans (`nb_fan`), albums, top tracks | $0, no signup | none — keyless |
| **Last.fm** | listeners, play counts, similar artists | $0, instant key | none |
| **YouTube Data v3** | subscribers, views, video count | $0, Google Cloud key | none |
| **Spotify Web API** | link, artwork, genres, album list | $0 but **Premium on the owner's account** | ⛔ see §4 |

---

## 1. Deezer — nothing to do

`api.deezer.com` is open for reading. No app, no key, no account. The endpoint
calls it first and reports `"source":"deezer"` with `artist.fans`.

Rate limit is per IP, roughly 50 requests / 5 s, which the 10-minute cache keeps
us far away from. If it ever trips you get `error 4` and a hint saying so.

---

## 2. Last.fm — free key in about 60 seconds

1. <https://www.last.fm/api/account/create>
2. Fill in: **Application name** `timbre-benchmark`, **Application description**
   "internal artist reach comparison", leave the callback URL empty.
3. Submit — the next page shows **API key** (32 characters). Copy it. Do not
   copy the **shared secret**; we do not use it.
4. That string is `LASTFM_API_KEY`.

Useful because `listeners` tracks the same shape as "how many people actually
listen", and it exists for small artists too (unlike Chartmetric/kworb).

---

## 3. YouTube — the Google Cloud key

On `console.google.com/apis/credentials` for the project, with the **Create API
key** panel open and **YouTube Analytics API + YouTube Data API v3** selected:

1. **Name**: `timbre-youtube`
2. **API restrictions**: leave the two you picked
3. **Application restrictions**: leave **None** — the key is used by a server,
   never a browser; the API restriction above is what protects it. If you later
   want it tighter, restrict to the EC2 box's elastic IP under *IP addresses* —
   not to Vercel, whose egress IPs change.
4. **Create**, then copy `AIzaSy…` from the dialog.
5. Optional tidy-up: **Edit** the key and set *API restrictions → Restrict key →
   2 APIs* so it can never be used for anything else in that project.

That string is `YOUTUBE_API_KEY`. Quota: 10,000 units/day; `search.list` = 100
units, `channels.list` = 1. With the 10-minute cache normal use is a few hundred
units a day.

---

## 4. Spotify — the form you were looking at cannot be filled

**What your screen is telling you:** the banner *"Upgrade to Spotify Premium to
access the Web API"* means your developer account is on the **Free** tier, and
the **Web API** checkbox is greyed out. That is not a mistake in the form.

Since **11 February 2026**, every new Development Mode Client ID requires the
account that owns it to hold an **active Spotify Premium subscription**
(existing apps: 9 March 2026). Spotify states it plainly: *"Development Mode use
will require a Spotify Premium account."* Free accounts get **HTTP 403** on
every call — `{"error":{"status":403,"message":"Valid user authentication required"}}`
or a flat "blocked" body.

So there is no correct way to fill that form without paying. Leave it.

**And even with Premium it buys us almost nothing.** The same February 2026
release removed:

- `GET /artists/{id}/top-tracks` — **removed**
- the Artist object's `followers` field — **removed**
- the Artist object's `popularity` field — **removed**
- `GET /tracks` popularity — **removed**
- `GET /search` `limit` capped at **10** (was 50)

The two numbers the old benchmark tab displayed (`followers`, `popularity`) no
longer exist in the API at all. Deezer's `nb_fan` and Last.fm's `listeners`
replace them, for free.

> **If you ever do get Premium** (or a client already has it), the form is:
> **App name** `timbre-benchmark` · **App description** "internal artist reach
> comparison" · **Website** `https://timbre-puce.vercel.app` · **Redirect URI**
> `https://timbre-puce.vercel.app/api/auth/callback/spotify` (required by the
> form even though the client-credentials flow never redirects) · **Which
> APIs/SDKs** tick **Web API** only · tick the terms box. Then
> **Settings → Client ID** and **View client secret**.
>
> Env names stay `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`. The source will
> return `partial: true` with `followers: null`, `popularity: null`,
> `topTracks: []` and the album list — that is the API's ceiling, not a bug.

**What the paid API still does not give:** monthly listeners, per-day streams,
saves, cities. Those live in **Spotify for Artists**, and for your own act the
weekly CSV export is still the richest thing available.

---

## 5. Where the keys go

**Vercel** — Project `timbre` → Settings → Environment Variables → Production:

```
LASTFM_API_KEY=…
YOUTUBE_API_KEY=AIza…
# optional, only if the account ever has Premium:
SPOTIFY_CLIENT_ID=…
SPOTIFY_CLIENT_SECRET=…
```

Then **Redeploy** — env changes only apply to new deployments. `DEEZER` needs
no variable.

**EC2** (`/opt/timbre/.env`) if the box also makes lookups — same lines.

Never paste a secret or key into chat or commit it.

---

## 6. Verify

```bash
curl -s 'https://timbre-puce.vercel.app/api/benchmark?artist=Limoblaze&fresh=1'
```

What a healthy answer looks like:

- `"configured": true` (true whenever Deezer answers, since it needs no key)
- `sources[]` in this order: `deezer`, `lastfm`, `youtube`, `spotify`
- `deezer.artist.fans` filled in; `lastfm.artist.listeners` and
  `youtube.channel.subscribers` filled once those two keys are set
- `spotify.configured: false` with a `reason` naming the missing env vars, or —
  with keys — `partial: true` and the Feb 2026 note
- `optionalKeys` lists what each missing key would add
- `you` carries your own Audiomack numbers (`plays7d`, `lifetime`)

Failures never 500. Each source carries `error` plus a `hint` that names the
actual mistake: bad key, YouTube API not enabled, Spotify app blocked for a Free
account, Deezer's per-IP quota, or a network failure from the host.

Add `?fresh=1` to skip the 10-minute cache; change `?artist=` per act.
