# The two free keys, with the exact clicks

Both are free, both are self-serve, and neither needs a business registration. Ten minutes total.

## 1. YouTube — you are already on the right screen

You are on `console.google.com/apis/credentials` for project **`altraware-automations`**, with the **Create API key** panel open and **YouTube Analytics API + YouTube Data API v3** selected as restrictions. That is exactly right.

What to do on that panel:

1. **Name**: `timbre-youtube`
2. **Select API restrictions**: leave the two you picked — `YouTube Analytics API`, `YouTube Data API v3`
3. **Application restrictions**: leave **None** (the key is used by a server, never by a browser; the API restriction above is what protects it). If you later want it tighter, restrict to the EC2 box's elastic IP under *IP addresses* — not to Vercel, whose egress IPs change.
4. Click **Create**
5. A dialog shows the key: `AIzaSy…` — copy it **from that dialog**, it is the only time it is shown in full. (Later you can always come back here and use *Show key*, but the dialog is easiest.)
6. Optional but tidy: **Edit** the key afterwards and switch *API restrictions* to **Restrict key → 2 APIs** so it can never be used for anything else in that project.

That string is `YOUTUBE_API_KEY`.

**Quota:** 10,000 units/day. One `search.list` costs 100 units, one `channels.list` costs 1. With our 10-minute cache, normal use is a few hundred units a day — nowhere near the limit. If you see `403 quotaExceeded`, wait until midnight Pacific.

> Note: the key is not a secret in the way a client secret is, but treat it as one anyway — a leaked key is your quota, and billing if the project ever gains a paid API.

## 2. Spotify — the token you pasted is the wrong thing

What you pasted (`BQCC…`) is a **user access token** from the docs "Try it" console. It:

- expires in **1 hour**
- only works for endpoints about *your own* account (`/v1/me/…`) — `/v1/me/top/tracks` is exactly that
- was just posted in a chat window, so treat it as spent. It cannot be revoked manually; it dies on its own within the hour. Nothing else is exposed by it.

We do not use user tokens for the benchmark. We use the **client-credentials** flow, which is app-level and never expires on its own. For that you need two values from your app, not a token:

1. <https://developer.spotify.com/dashboard> → open your app
2. **Settings** → **Client ID** (copy) and **View client secret** → **Client secret** (copy)
3. That is it. No redirect URI is needed for client credentials, and no user has to log in.

- `SPOTIFY_CLIENT_ID` — app id, safe-ish but keep it out of public repos
- `SPOTIFY_CLIENT_SECRET` — real secret; server-side only

**What the API gives:** followers, popularity (0–100), genres, top tracks, album art.
**What it does not give:** monthly listeners or per-day streams. Those are what Chartmetric and kworb estimate from other signals. Our payload says so explicitly rather than inventing a number.

Free tier: no cost, rate limits are per app and generous for a handful of lookups a minute.

## 3. Where they go

**Vercel** (Project `timbre` → Settings → Environment Variables → Production):

```
SPOTIFY_CLIENT_ID=…
SPOTIFY_CLIENT_SECRET=…
YOUTUBE_API_KEY=AIza…
```

Then **Redeploy** (env changes only apply to new deployments).

**EC2** (`/opt/timbre/.env`) if the box will also make lookups:

```dotenv
SPOTIFY_CLIENT_ID=…
SPOTIFY_CLIENT_SECRET=…
YOUTUBE_API_KEY=AIza…
```

Never paste the client secret or API key into chat or commit them. Add them in the dashboards above.

## 4. Verify

```bash
curl -s 'https://timbre-puce.vercel.app/api/benchmark?artist=Limoblaze' | head -c 600
```

- Good: `"configured": true`, `sources[].found: true`, with `artist.followers` and `channel.subscribers` filled in.
- Wrong key: `sources[].error` carries the HTTP status and a `hint` telling you which of the two mistakes it is (wrong secret / API not enabled / quota spent).
- Nothing set yet: `"configured": false` plus a `help` line — the endpoint never 500s.

Change one artist name per request (`?artist=Ada%20Ehi`), or add `?fresh=1` to skip the 10-minute cache.
